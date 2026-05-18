import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DatabaseService }  from '../../database/database.service';
import { RedisService }     from '../../redis/redis.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly db:    DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /** Single entry point — returns correct dashboard for user's role */
  async getDashboard(userId: string, role: string) {
    switch (role) {
      case 'investor':           return this.investorDashboard(userId);
      case 'sme_admin':          return this.msmeDashboard(userId);
      case 'agent':              return this.agentSummary(userId);
      case 'ca_cs':              return this.caSummary(userId);
      case 'admin':
      case 'super_admin':        return this.adminDashboard();
      case 'compliance_officer': return this.adminDashboard();
      default: throw new ForbiddenException('No dashboard for this role');
    }
  }

  // ── INVESTOR DASHBOARD ────────────────────────────────────────────────────
  private async investorDashboard(userId: string) {
    return this.redis.cached(`dash:investor:${userId}`, 30, async () => {
      const [portfolio, balances, opportunities, recentTxns] = await Promise.all([
        // Portfolio summary
        this.db.queryOne(
          `SELECT * FROM v_portfolio WHERE investor_id=$1`, [userId]
        ),
        // Wallet balances
        this.db.queryMany(
          `SELECT a.account_type,
             COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount ELSE -le.amount END),0) AS balance
           FROM accounts a LEFT JOIN ledger_entries le ON le.account_id=a.id
           WHERE a.user_id=$1 GROUP BY a.account_type`,
          [userId],
        ),
        // Top 3 opportunities matching their risk appetite
        this.db.queryMany(
          `SELECT id,legal_name,sector,expected_return_min,expected_return_max,
                  fairfund_score,progress_pct,days_remaining,min_investment,tag,tag_color
           FROM v_sme_progress WHERE status='active'
           ORDER BY fairfund_score DESC LIMIT 3`
        ),
        // Recent investment transactions
        this.db.queryMany(
          `SELECT i.id, i.amount, i.status, i.created_at, s.legal_name AS sme_name
           FROM investments i JOIN smes s ON i.sme_id=s.id
           WHERE i.investor_id=$1 ORDER BY i.created_at DESC LIMIT 5`,
          [userId],
        ),
      ]);

      // Actions required (CTA — not just data)
      const actions: { label: string; url: string; urgency: string }[] = [];
      const pendingEsign = await this.db.queryMany(
        `SELECT id, amount FROM investments WHERE investor_id=$1 AND esign_completed=FALSE AND status='INITIATED'`,
        [userId]
      );
      pendingEsign.forEach((inv: any) => {
        actions.push({ label: `Complete eSign for ₹${inv.amount}`, url: `/investments/${inv.id}/esign`, urgency: 'high' });
      });

      return { portfolio, balances, opportunities, recent_transactions: recentTxns, actions };
    });
  }

  // ── MSME DASHBOARD ────────────────────────────────────────────────────────
  private async msmeDashboard(userId: string) {
    return this.redis.cached(`dash:msme:${userId}`, 60, async () => {
      const sme = await this.db.queryOne<any>(
        `SELECT s.*, ROUND((s.raised_so_far/NULLIF(s.target_raise,0))*100)::int AS progress_pct
         FROM smes s WHERE s.created_by=$1 AND s.deleted_at IS NULL
         ORDER BY s.created_at DESC LIMIT 1`,
        [userId],
      );

      if (!sme) return { sme: null, message: 'Create your MSME listing to get started.' };

      const [investors, compliance, docs, vqStatus] = await Promise.all([
        this.db.queryMany(
          `SELECT i.amount, i.status, i.created_at, u.name AS investor_name
           FROM investments i JOIN users u ON i.investor_id=u.id
           WHERE i.sme_id=$1 ORDER BY i.created_at DESC LIMIT 10`,
          [sme.id],
        ),
        this.db.queryMany('SELECT * FROM compliance_tasks WHERE sme_id=$1', [sme.id]),
        this.db.queryMany('SELECT id,doc_type,name,is_verified FROM documents WHERE sme_id=$1', [sme.id]),
        this.db.queryOne(
          'SELECT status,review_notes,due_date FROM verification_queue WHERE sme_id=$1 ORDER BY created_at DESC LIMIT 1',
          [sme.id]
        ),
      ]);

      const pendingCompliance  = compliance.filter((c: any) => c.status !== 'done').length;
      const missingDocs        = ['financials','pas4','board_resolution']
        .filter(dt => !docs.some((d: any) => d.doc_type === dt));

      // Action items (not just static data)
      const actions: { label: string; url: string; urgency: string }[] = [];
      if (missingDocs.length)    actions.push({ label: `Upload ${missingDocs.join(', ')}`, url: '/documents', urgency: 'high' });
      if (pendingCompliance > 0) actions.push({ label: `${pendingCompliance} compliance tasks pending`, url: '/compliance', urgency: 'medium' });
      if (sme.status === 'draft') actions.push({ label: 'Submit listing for review', url: '/sme/submit', urgency: 'high' });

      return { sme, investors, compliance, documents: docs, verification_status: vqStatus, actions };
    });
  }

  // ── AGENT SUMMARY (lightweight) ───────────────────────────────────────────
  private async agentSummary(userId: string) {
    return this.redis.cached(`dash:agent:${userId}`, 60, async () => {
      const [profile, recentReferrals, pendingCommissions] = await Promise.all([
        this.db.queryOne('SELECT * FROM v_agent_performance WHERE agent_id=$1', [userId]),
        this.db.queryMany(
          `SELECT r.status, r.total_invested, u.name, u.kyc_status, r.created_at
           FROM referrals r JOIN users u ON u.id=r.referred_user_id
           WHERE r.agent_id=$1 ORDER BY r.created_at DESC LIMIT 5`,
          [userId],
        ),
        this.db.queryMany(
          `SELECT id, commission_amount, status, created_at FROM commissions
           WHERE agent_id=$1 AND status='earned' ORDER BY created_at DESC LIMIT 5`,
          [userId],
        ),
      ]);

      const actions: { label: string; url: string }[] = [];
      if ((profile as any)?.commission_outstanding > 0) {
        actions.push({ label: `Request payout: ₹${(profile as any).commission_outstanding?.toLocaleString('en-IN')}`, url: '/agent/payout' });
      }

      return { profile, recent_referrals: recentReferrals, pending_commissions: pendingCommissions, actions };
    });
  }

  // ── CA/CS SUMMARY (lightweight) ───────────────────────────────────────────
  private async caSummary(userId: string) {
    return this.redis.cached(`dash:ca:${userId}`, 30, async () => {
      const [profile, urgentItems, recentApprovals] = await Promise.all([
        this.db.queryOne('SELECT * FROM v_ca_workload WHERE ca_id=$1', [userId]),
        this.db.queryMany(
          `SELECT vq.id, vq.status, vq.priority, vq.due_date, s.legal_name
           FROM verification_queue vq LEFT JOIN smes s ON s.id=vq.sme_id
           WHERE vq.assigned_to=$1 AND vq.status NOT IN ('approved','rejected')
           ORDER BY vq.priority ASC, vq.due_date ASC NULLS LAST LIMIT 5`,
          [userId],
        ),
        this.db.queryMany(
          `SELECT vq.id, vq.status, vq.completed_at, s.legal_name
           FROM verification_queue vq LEFT JOIN smes s ON s.id=vq.sme_id
           WHERE vq.assigned_to=$1 AND vq.status IN ('approved','rejected')
           ORDER BY vq.completed_at DESC LIMIT 3`,
          [userId],
        ),
      ]);

      const actions: { label: string; url: string; urgency: string }[] = [];
      const overdue = (urgentItems as any[]).filter(i => i.due_date && new Date(i.due_date) < new Date());
      overdue.forEach(i => actions.push({ label: `Overdue: ${i.legal_name}`, url: `/ca/queue/${i.id}`, urgency: 'critical' }));

      return { profile, urgent_queue: urgentItems, recent_approvals: recentApprovals, actions };
    });
  }

  // ── ADMIN DASHBOARD ───────────────────────────────────────────────────────
  private async adminDashboard() {
    return this.redis.cached('dash:admin', 60, async () => {
      const [platformStats, pendingKYC, pendingVerification, recentFlags, txnHealth] = await Promise.all([
        this.db.queryOne('SELECT * FROM v_platform_stats'),
        this.db.queryMany(
          `SELECT id,name,email,role,created_at FROM users
           WHERE kyc_status='in_review' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 10`
        ),
        this.db.queryMany(
          `SELECT vq.id, vq.status, vq.priority, s.legal_name, u.name AS owner
           FROM verification_queue vq JOIN smes s ON s.id=vq.sme_id JOIN users u ON u.id=vq.msme_user_id
           WHERE vq.status IN ('queued','in_review') ORDER BY vq.priority ASC LIMIT 10`
        ),
        this.db.queryMany(
          `SELECT action, entity_type, created_at, new_value
           FROM audit_log WHERE action LIKE 'FLAG_%' ORDER BY created_at DESC LIMIT 5`
        ),
        // Transaction health: failed/stuck transactions
        this.db.queryMany(
          `SELECT id, txn_type, amount, status, created_at FROM transactions
           WHERE status NOT IN ('SUCCESS','REFUNDED','REVERSED')
             AND created_at < NOW() - INTERVAL '1 hour'
           ORDER BY created_at ASC LIMIT 10`
        ),
      ]);

      const actions: { label: string; url: string; urgency: string }[] = [];
      if ((pendingKYC as any[]).length > 0) actions.push({ label: `${(pendingKYC as any[]).length} KYC reviews pending`, url: '/admin/kyc', urgency: 'high' });
      if ((txnHealth as any[]).length > 0)  actions.push({ label: `${(txnHealth as any[]).length} stuck transactions`, url: '/admin/transactions', urgency: 'critical' });

      return {
        platform: platformStats,
        pending_kyc: pendingKYC,
        pending_verification: pendingVerification,
        recent_flags: recentFlags,
        stuck_transactions: txnHealth,
        actions,
      };
    });
  }
}
