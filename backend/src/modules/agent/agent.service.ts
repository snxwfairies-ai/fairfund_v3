import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 }          from 'uuid';
import { DatabaseService }        from '../../database/database.service';
import { NotificationsService }   from '../notifications/notifications.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly db:            DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Validate referral code and register referred user ─────────────────────
  async validateReferralCode(code: string) {
    const agent = await this.db.queryOne<any>(
      `SELECT u.id, u.name, ap.commission_rate_pct, ap.commission_tier
       FROM users u JOIN agent_profiles ap ON ap.user_id=u.id
       WHERE ap.referral_code=$1 AND u.is_active=TRUE AND u.deleted_at IS NULL`,
      [code],
    );
    if (!agent) throw new NotFoundException(`Referral code ${code} is invalid or inactive`);
    return { valid: true, agent_name: agent.name, code };
  }

  async linkReferral(agentCode: string, newUserId: string) {
    const agent = await this.db.queryOne<any>(
      `SELECT u.id FROM users u JOIN agent_profiles ap ON ap.user_id=u.id WHERE ap.referral_code=$1`,
      [agentCode],
    );
    if (!agent) return; // silent fail — referral is optional

    // Prevent self-referral
    if (agent.id === newUserId) return;

    const existing = await this.db.queryOne(
      'SELECT id FROM referrals WHERE referred_user_id=$1', [newUserId]
    );
    if (existing) return; // already linked

    const refId = uuidv4();
    await this.db.query(
      `INSERT INTO referrals (id,agent_id,referred_user_id,referral_code,status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [refId, agent.id, newUserId, agentCode],
    );
    await this.db.query(
      'UPDATE users SET agent_id=$1, referred_by=$2 WHERE id=$3',
      [agent.id, agent.id, newUserId],
    );
    await this.db.query(
      'UPDATE agent_profiles SET total_referrals=total_referrals+1 WHERE user_id=$1', [agent.id]
    );
    this.logger.log(`Referral linked: agent=${agent.id} → user=${newUserId}`);
  }

  // ── Earn commission when a referred user invests ──────────────────────────
  async recordCommission(investorId: string, investmentId: string, grossAmount: number) {
    const referral = await this.db.queryOne<any>(
      `SELECT r.*, ap.commission_rate_pct
       FROM referrals r
       JOIN agent_profiles ap ON ap.user_id = r.agent_id
       WHERE r.referred_user_id=$1 AND r.status != 'inactive'`,
      [investorId],
    );
    if (!referral) return; // investor was not referred by an agent

    const commission = parseFloat(
      (grossAmount * parseFloat(referral.commission_rate_pct) / 100).toFixed(2)
    );

    const commId = uuidv4();
    await this.db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO commissions (id,agent_id,referral_id,investment_id,gross_amount,rate_pct,commission_amount,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'earned')`,
        [commId, referral.agent_id, referral.id, investmentId, grossAmount,
         referral.commission_rate_pct, commission],
      );

      // Update referral status
      await client.query(
        `UPDATE referrals SET
           status='invested', first_investment_id=COALESCE(first_investment_id,$1),
           first_investment_date=COALESCE(first_investment_date,NOW()),
           total_invested=total_invested+$2, updated_at=NOW()
         WHERE id=$3`,
        [investmentId, grossAmount, referral.id],
      );

      // Update agent totals
      await client.query(
        `UPDATE agent_profiles SET
           total_aum_referred=total_aum_referred+$1,
           total_commission_earned=total_commission_earned+$2,
           active_referrals=active_referrals+1
         WHERE user_id=$3`,
        [grossAmount, commission, referral.agent_id],
      );
    });

    await this.notifications.send(
      referral.agent_id, 'success', 'Commission Earned 💰',
      `₹${commission.toLocaleString('en-IN')} commission earned from your referral's investment of ₹${grossAmount.toLocaleString('en-IN')}.`,
    );

    this.logger.log(`Commission: agent=${referral.agent_id} ₹${commission} on ₹${grossAmount} investment`);
    return { commission_id: commId, agent_id: referral.agent_id, amount: commission };
  }

  // ── Agent dashboard ───────────────────────────────────────────────────────
  async getDashboard(agentId: string) {
    const [profile, referrals, commissions, recentActivity] = await Promise.all([
      this.db.queryOne(`SELECT * FROM v_agent_performance WHERE agent_id=$1`, [agentId]),
      this.db.queryMany(
        `SELECT r.*, u.name AS investor_name, u.email, u.onboarding_step, u.kyc_status
         FROM referrals r JOIN users u ON u.id=r.referred_user_id
         WHERE r.agent_id=$1 ORDER BY r.created_at DESC LIMIT 20`,
        [agentId],
      ),
      this.db.queryMany(
        `SELECT c.*, i.amount AS investment_amount, s.legal_name AS sme_name
         FROM commissions c
         JOIN investments i ON i.id=c.investment_id
         JOIN smes s ON s.id=i.sme_id
         WHERE c.agent_id=$1 ORDER BY c.created_at DESC LIMIT 10`,
        [agentId],
      ),
      this.db.queryMany(
        `SELECT action, created_at, new_value FROM audit_log
         WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`,
        [agentId],
      ),
    ]);

    // Conversion funnel
    const total        = referrals.length;
    const kycDone      = referrals.filter((r: any) => ['invested','converted'].includes(r.status) || r.kyc_status === 'verified').length;
    const invested     = referrals.filter((r: any) => ['invested','converted'].includes(r.status)).length;
    const conversionRate = total > 0 ? ((invested / total) * 100).toFixed(1) : '0';

    return {
      profile,
      funnel: { total, kyc_done: kycDone, invested, conversion_rate: conversionRate },
      referrals,
      recent_commissions: commissions,
      recent_activity:   recentActivity,
    };
  }

  // ── Commission payout (admin triggers) ────────────────────────────────────
  async approvePayout(agentId: string, commissionIds: string[], adminId: string) {
    const comms = await this.db.queryMany<any>(
      `SELECT * FROM commissions WHERE agent_id=$1 AND id=ANY($2) AND status='earned'`,
      [agentId, commissionIds],
    );
    if (!comms.length) throw new BadRequestException('No eligible commissions found');

    const total = comms.reduce((s: number, c: any) => s + parseFloat(c.commission_amount), 0);
    const payoutRef = `COMM-PAY-${uuidv4().slice(0,8).toUpperCase()}`;

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE commissions SET status='paid', paid_at=NOW(), payout_ref=$1
         WHERE id=ANY($2)`,
        [payoutRef, commissionIds],
      );
      await client.query(
        'UPDATE agent_profiles SET total_commission_paid=total_commission_paid+$1 WHERE user_id=$2',
        [total, agentId],
      );
      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
         VALUES ($1,'COMMISSION_PAYOUT_APPROVED','agent',$2,$3)`,
        [adminId, agentId, JSON.stringify({ total, payout_ref: payoutRef, count: comms.length })],
      );
    });

    await this.notifications.send(agentId, 'success', 'Commission Paid 🎉',
      `₹${total.toLocaleString('en-IN')} commission payout processed. Ref: ${payoutRef}`);

    return { payout_ref: payoutRef, total_paid: total, commissions_count: comms.length };
  }

  // ── Get commission tier thresholds ────────────────────────────────────────
  getTiers() {
    return [
      { tier: 'standard', min_aum:        0, rate: 1.0, color: '#718096' },
      { tier: 'silver',   min_aum:  5000000, rate: 1.5, color: '#718096' },
      { tier: 'gold',     min_aum: 20000000, rate: 2.0, color: '#C9A84C' },
      { tier: 'platinum', min_aum: 50000000, rate: 2.5, color: '#0B1D3A' },
    ];
  }

  // ── Auto-upgrade tier based on AUM ───────────────────────────────────────
  async recalculateTier(agentId: string) {
    const profile = await this.db.queryOne<any>(
      'SELECT total_aum_referred FROM agent_profiles WHERE user_id=$1', [agentId]
    );
    if (!profile) return;

    const aum   = parseFloat(profile.total_aum_referred);
    const tiers = this.getTiers();
    const tier  = [...tiers].reverse().find(t => aum >= t.min_aum);
    if (!tier) return;

    const { tier: tierName, rate } = tier;
    await this.db.query(
      'UPDATE agent_profiles SET commission_tier=$1, commission_rate_pct=$2 WHERE user_id=$3',
      [tierName, rate, agentId],
    );
    this.logger.log(`Agent ${agentId} tier updated → ${tierName} (${rate}%)`);
  }
}
