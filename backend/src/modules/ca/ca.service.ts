import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { DatabaseService }        from '../../database/database.service';
import { NotificationsService }   from '../notifications/notifications.service';
import { OnboardingService }      from '../onboarding/onboarding.service';

export type ReviewAction = 'approve' | 'reject' | 'request_info';

@Injectable()
export class CaService {
  private readonly logger = new Logger(CaService.name);

  constructor(
    private readonly db:            DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly onboarding:    OnboardingService,
  ) {}

  // ── CA/CS Dashboard ───────────────────────────────────────────────────────
  async getDashboard(caId: string) {
    const [profile, queue, overdue, stats] = await Promise.all([
      this.db.queryOne('SELECT * FROM v_ca_workload WHERE ca_id=$1', [caId]),
      this.db.queryMany(
        `SELECT vq.*, s.legal_name, s.sector, u.name AS msme_owner, u.email
         FROM verification_queue vq
         LEFT JOIN smes s ON s.id=vq.sme_id
         JOIN users u ON u.id=vq.msme_user_id
         WHERE vq.assigned_to=$1 AND vq.status NOT IN ('approved','rejected')
         ORDER BY vq.priority ASC, vq.due_date ASC NULLS LAST`,
        [caId],
      ),
      this.db.queryMany(
        `SELECT vq.*, s.legal_name, u.name AS msme_owner
         FROM verification_queue vq
         LEFT JOIN smes s ON s.id=vq.sme_id
         JOIN users u ON u.id=vq.msme_user_id
         WHERE vq.assigned_to=$1 AND vq.due_date < CURRENT_DATE
           AND vq.status NOT IN ('approved','rejected')`,
        [caId],
      ),
      this.db.queryOne(
        `SELECT
           COUNT(*) FILTER (WHERE status='approved') AS approved_count,
           COUNT(*) FILTER (WHERE status='rejected') AS rejected_count,
           COUNT(*) FILTER (WHERE status='in_review') AS in_review_count,
           AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600)::int AS avg_hours_to_complete
         FROM verification_queue WHERE assigned_to=$1`,
        [caId],
      ),
    ]);

    return { profile, queue, overdue, stats };
  }

  // ── Get single verification item with full documents ──────────────────────
  async getVerificationItem(itemId: string, caId: string) {
    const item = await this.db.queryOne<any>(
      `SELECT vq.*, s.*, u.name AS msme_owner, u.email, u.phone, u.pan,
              mp.director_name, mp.director_pan, mp.company_type
       FROM verification_queue vq
       LEFT JOIN smes s ON s.id=vq.sme_id
       JOIN users u ON u.id=vq.msme_user_id
       LEFT JOIN msme_profiles mp ON mp.user_id=vq.msme_user_id
       WHERE vq.id=$1 AND vq.assigned_to=$2`,
      [itemId, caId],
    );
    if (!item) throw new NotFoundException('Verification item not found or not assigned to you');

    // Get uploaded documents
    const docs = await this.db.queryMany(
      'SELECT * FROM documents WHERE sme_id=$1 ORDER BY created_at DESC',
      [item.sme_id],
    );

    // Get compliance tasks status
    const compliance = await this.db.queryMany(
      'SELECT * FROM compliance_tasks WHERE sme_id=$1', [item.sme_id]
    );

    return { ...item, documents: docs, compliance };
  }

  // ── Start review (move to in_review) ─────────────────────────────────────
  async startReview(itemId: string, caId: string) {
    const item = await this.db.queryOne<any>(
      `SELECT * FROM verification_queue WHERE id=$1 AND assigned_to=$2 AND status='queued'`,
      [itemId, caId],
    );
    if (!item) throw new NotFoundException('Item not found or not in queued state');

    await this.db.query(
      `UPDATE verification_queue SET status='in_review', assigned_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [itemId]
    );
    this.logger.log(`CA/CS ${caId} started review of ${itemId}`);
    return { item_id: itemId, status: 'in_review' };
  }

  // ── Submit review decision ────────────────────────────────────────────────
  async submitReview(
    itemId: string,
    caId: string,
    action: ReviewAction,
    notes: string,
    infoRequired?: string,
  ) {
    const item = await this.db.queryOne<any>(
      `SELECT * FROM verification_queue WHERE id=$1 AND assigned_to=$2
         AND status IN ('in_review','queued')`,
      [itemId, caId],
    );
    if (!item) throw new NotFoundException('Verification item not found or already completed');

    const statusMap: Record<ReviewAction, string> = {
      approve:      'approved',
      reject:       'rejected',
      request_info: 'info_required',
    };
    const newStatus = statusMap[action];

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE verification_queue SET
           status=$1, review_notes=$2, info_required=$3,
           completed_at=CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE NULL END,
           updated_at=NOW()
         WHERE id=$4`,
        [newStatus, notes, infoRequired ?? null, itemId],
      );

      // Update CA workload
      if (['approved','rejected'].includes(newStatus)) {
        await client.query(
          `UPDATE ca_cs_profiles SET
             current_load=GREATEST(0, current_load-1),
             verifications_done=verifications_done+1
           WHERE user_id=$1`,
          [caId],
        );
      }

      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
         VALUES ($1,$2,'verification',$3,$4)`,
        [caId, `VERIFICATION_${action.toUpperCase()}`, itemId,
         JSON.stringify({ action, notes, sme_id: item.sme_id })],
      );
    });

    // Trigger downstream effects
    if (action === 'approve') {
      await this.handleApproval(item, caId);
    } else if (action === 'reject') {
      await this.handleRejection(item, notes, caId);
    } else {
      await this.notifications.send(
        item.msme_user_id, 'warning', 'Additional Information Required',
        `CA/CS reviewer requires additional information: ${infoRequired}`,
      );
    }

    this.logger.log(`Verification ${itemId}: ${action} by CA/CS ${caId}`);
    return { item_id: itemId, action, new_status: newStatus };
  }

  // ── Update document checklist ─────────────────────────────────────────────
  async updateChecklist(itemId: string, caId: string, checklist: Record<string, boolean>) {
    await this.db.query(
      `UPDATE verification_queue SET documents_checklist=$1, updated_at=NOW()
       WHERE id=$2 AND assigned_to=$3`,
      [JSON.stringify(checklist), itemId, caId],
    );
    return { ok: true, checklist };
  }

  // ── Compliance task sign-off ──────────────────────────────────────────────
  async signOffComplianceTask(taskId: string, caId: string) {
    await this.db.query(
      `UPDATE compliance_tasks SET status='done', completed_at=NOW(), assigned_to=$1 WHERE id=$2`,
      [caId, taskId]
    );
    return { ok: true };
  }

  // ── Private handlers ──────────────────────────────────────────────────────
  private async handleApproval(item: any, caId: string) {
    // Mark MSME profile as CA-reviewed
    if (item.msme_user_id) {
      await this.db.query(
        `UPDATE msme_profiles SET ca_cs_assigned_to=$1, ca_cs_reviewed_at=NOW() WHERE user_id=$2`,
        [caId, item.msme_user_id],
      );
      // Advance onboarding from verification → approval
      try {
        await this.onboarding.advance(item.msme_user_id, caId, 'Approved by CA/CS');
      } catch (e) {
        this.logger.warn(`Onboarding advance failed for ${item.msme_user_id}: ${e.message}`);
      }
      await this.notifications.send(
        item.msme_user_id, 'success', 'MSME Verified ✅',
        'Your MSME has been verified by our CA/CS team. Awaiting final admin approval.',
      );
    }
  }

  private async handleRejection(item: any, reason: string, caId: string) {
    if (item.msme_user_id) {
      await this.onboarding.reject(item.msme_user_id, reason, caId);
    }
  }
}
