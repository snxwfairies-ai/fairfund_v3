import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService }    from '../../database/database.service';
import { InvestmentsService } from '../investments/investments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService }       from '../../redis/redis.service';

export enum SMEStatus { DRAFT='draft', UNDER_REVIEW='under_review', APPROVED='approved', ACTIVE='active', REJECTED='rejected', PAUSED='paused' }
export enum FlagSeverity { LOW='low', MEDIUM='medium', HIGH='high', CRITICAL='critical' }

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly db:            DatabaseService,
    private readonly investments:   InvestmentsService,
    private readonly notifications: NotificationsService,
    private readonly redis:         RedisService,
  ) {}

  // ── Platform overview ─────────────────────────────────────────────────
  async getDashboard() {
    const [stats, recentInv, flagged, pendingSMEs] = await Promise.all([
      this.db.queryOne(`SELECT * FROM v_platform_stats`),
      this.db.queryMany(`
        SELECT i.*, u.name AS investor_name, s.legal_name AS sme_name
        FROM investments i JOIN users u ON i.investor_id=u.id JOIN smes s ON i.sme_id=s.id
        ORDER BY i.created_at DESC LIMIT 10`),
      this.db.queryMany(`
        SELECT * FROM audit_log WHERE action LIKE '%FLAG%' ORDER BY created_at DESC LIMIT 20`),
      this.db.queryMany(`
        SELECT * FROM smes WHERE status='under_review' ORDER BY created_at ASC`),
    ]);
    return { stats, recent_investments: recentInv, flagged_activity: flagged, pending_smes: pendingSMEs };
  }

  // ── SME Management ────────────────────────────────────────────────────
  async listSMEs(status?: string) {
    let q = 'SELECT s.*, u.name AS owner_name FROM smes s LEFT JOIN users u ON s.created_by=u.id';
    const params: any[] = [];
    if (status) { q += ` WHERE s.status=$1`; params.push(status); }
    q += ' ORDER BY s.created_at DESC';
    return this.db.queryMany(q, params);
  }

  async approveSME(smeId: string, adminId: string, riskLevel: string, score: number, notes: string) {
    const sme = await this.db.queryOne<any>('SELECT * FROM smes WHERE id=$1', [smeId]);
    if (!sme) throw new NotFoundException('SME not found');
    if (!['draft','under_review'].includes(sme.status))
      throw new BadRequestException(`SME is ${sme.status}, cannot approve`);

    await this.db.query(
      `UPDATE smes SET status='active', risk_level=$1, fairfund_score=$2,
       listing_date=CURRENT_DATE, updated_at=NOW() WHERE id=$3`,
      [riskLevel, score, smeId],
    );
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
      [adminId,'SME_APPROVED','sme',smeId, JSON.stringify({ riskLevel, score, notes })],
    );
    if (sme.created_by) {
      await this.notifications.send(sme.created_by,'success','Listing Approved 🎉',
        `${sme.legal_name} has been approved and is now live on FairFund.`);
    }
    await this.redis.invalidatePattern('smes:*');
    this.logger.log(`SME approved: ${smeId} by admin ${adminId}`);
    return { ok: true, sme_id: smeId, new_status: 'active' };
  }

  async rejectSME(smeId: string, adminId: string, reason: string) {
    const sme = await this.db.queryOne<any>('SELECT * FROM smes WHERE id=$1', [smeId]);
    if (!sme) throw new NotFoundException('SME not found');

    await this.db.query(`UPDATE smes SET status='rejected', updated_at=NOW() WHERE id=$1`, [smeId]);
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
      [adminId,'SME_REJECTED','sme',smeId, JSON.stringify({ reason })],
    );

    // Trigger refunds for any FUNDS_LOCKED investments
    const lockedInvestments = await this.db.queryMany(
      `SELECT id FROM investments WHERE sme_id=$1 AND status='FUNDS_LOCKED'`, [smeId]
    );
    const refunds = await Promise.allSettled(
      lockedInvestments.map(inv => this.investments.refund(inv.id, `SME rejected: ${reason}`, adminId))
    );
    const refundCount = refunds.filter(r => r.status === 'fulfilled').length;

    if (sme.created_by) {
      await this.notifications.send(sme.created_by,'error','Listing Rejected',
        `${sme.legal_name} was rejected. Reason: ${reason}`);
    }
    await this.redis.invalidatePattern('smes:*');
    this.logger.warn(`SME rejected: ${smeId} — ${refundCount} investments refunded`);
    return { ok: true, sme_id: smeId, refunds_triggered: refundCount };
  }

  // ── Investment Management ─────────────────────────────────────────────
  async listInvestments(status?: string, smeId?: string) {
    let q = `SELECT i.*, u.name AS investor_name, u.email, s.legal_name AS sme_name
             FROM investments i JOIN users u ON i.investor_id=u.id JOIN smes s ON i.sme_id=s.id WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (status) { q += ` AND i.status=$${idx++}`; params.push(status); }
    if (smeId)  { q += ` AND i.sme_id=$${idx++}`; params.push(smeId); }
    q += ' ORDER BY i.created_at DESC LIMIT 100';
    return this.db.queryMany(q, params);
  }

  async settleAllotment(investmentId: string, adminId: string) {
    return this.investments.settleAllotment(investmentId, adminId);
  }

  async refundInvestment(investmentId: string, reason: string, adminId: string) {
    return this.investments.refund(investmentId, reason, adminId);
  }

  async reverseInvestment(investmentId: string, recoveredAmount: number, reason: string, adminId: string) {
    return this.investments.reverse(investmentId, recoveredAmount, reason, adminId);
  }

  // ── KYC Management ────────────────────────────────────────────────────
  async listPendingKYC() {
    return this.db.queryMany(
      `SELECT id, name, email, kyc_status, pan, phone, created_at
       FROM users WHERE kyc_status IN ('pending','in_review') ORDER BY created_at ASC`
    );
  }

  async approveKYC(userId: string, adminId: string) {
    await this.db.query(`UPDATE users SET kyc_status='verified', updated_at=NOW() WHERE id=$1`, [userId]);
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
      [adminId,'KYC_APPROVED','user',userId,JSON.stringify({ by: adminId })]
    );
    await this.notifications.send(userId,'success','KYC Verified ✅','Your identity is verified. You can now invest on FairFund.');
    return { ok: true };
  }

  async rejectKYC(userId: string, adminId: string, reason: string) {
    await this.db.query(`UPDATE users SET kyc_status='rejected', updated_at=NOW() WHERE id=$1`, [userId]);
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
      [adminId,'KYC_REJECTED','user',userId,JSON.stringify({ reason })]
    );
    await this.notifications.send(userId,'error','KYC Rejected',`KYC verification failed. Reason: ${reason}. Please re-submit.`);
    return { ok: true };
  }

  // ── Fraud / Suspicious Activity Flagging ──────────────────────────────
  async flagActivity(entityType: string, entityId: string, severity: FlagSeverity, reason: string, adminId: string) {
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
      [adminId, `FLAG_${severity.toUpperCase()}`, entityType, entityId, JSON.stringify({ severity, reason, flagged_by: adminId })]
    );
    // For HIGH/CRITICAL — automatically freeze
    if (['high','critical'].includes(severity)) {
      if (entityType === 'user') {
        await this.db.query(`UPDATE users SET is_active=FALSE WHERE id=$1`, [entityId]);
        this.logger.warn(`CRITICAL FLAG: User ${entityId} frozen — ${reason}`);
      } else if (entityType === 'sme') {
        await this.db.query(`UPDATE smes SET status='paused' WHERE id=$1`, [entityId]);
        this.logger.warn(`CRITICAL FLAG: SME ${entityId} paused — ${reason}`);
      }
    }
    this.logger.warn(`Flag [${severity}] on ${entityType}:${entityId} — ${reason}`);
    return { ok: true, action: severity === 'critical' ? 'auto_frozen' : 'flagged_only' };
  }

  // ── Audit log query ───────────────────────────────────────────────────
  async getAuditLog(entityType?: string, entityId?: string, limit = 100) {
    let q = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (entityType) { q += ` AND entity_type=$${idx++}`; params.push(entityType); }
    if (entityId)   { q += ` AND entity_id=$${idx++}`;   params.push(entityId); }
    q += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);
    return this.db.queryMany(q, params);
  }
}
