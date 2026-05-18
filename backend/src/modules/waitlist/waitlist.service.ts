import {
  Injectable, Logger, ConflictException, NotFoundException,
} from '@nestjs/common';
import { DatabaseService }   from '../../database/database.service';
import { EmailService }      from '../email/email.service';
import { RedisService }      from '../../redis/redis.service';

export interface WaitlistEntry {
  name:            string;
  email:           string;
  phone?:          string;
  role:            'investor' | 'sme' | 'agent' | 'ca_cs';
  company_name?:   string;
  city?:           string;
  investment_size?: string;
  raise_amount?:   string;
  referral_source?: string;
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly db:    DatabaseService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  // ── Public: join waitlist ─────────────────────────────────────────────────
  async join(data: WaitlistEntry): Promise<{ position: number; id: string }> {
    // Check for duplicate
    const existing = await this.db.queryOne<any>(
      'SELECT id, status FROM waitlist WHERE email=$1', [data.email.toLowerCase()]
    );
    if (existing) {
      if (existing.status === 'registered') {
        throw new ConflictException('This email is already a registered FairFund member.');
      }
      throw new ConflictException(`You're already on the waitlist! We'll be in touch soon.`);
    }

    const { rows } = await this.db.query(
      `INSERT INTO waitlist
         (name, email, phone, role, company_name, city, investment_size, raise_amount, referral_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [data.name, data.email.toLowerCase(), data.phone ?? null, data.role,
       data.company_name ?? null, data.city ?? null,
       data.investment_size ?? null, data.raise_amount ?? null,
       data.referral_source ?? null],
    );
    const id = rows[0].id;

    // Get queue position
    const { rows: posRows } = await this.db.query(
      `SELECT COUNT(*) AS pos FROM waitlist WHERE created_at <= NOW() AND role=$1`,
      [data.role]
    );
    const position = parseInt(posRows[0].pos);

    // Send confirmation email
    await this.sendConfirmationEmail(data, position).catch(e =>
      this.logger.warn(`Waitlist email failed: ${e.message}`)
    );

    // Invalidate admin cache
    await this.redis.del('waitlist:stats');

    this.logger.log(`Waitlist: ${data.role} — ${data.email} (position ~${position})`);
    return { id, position };
  }

  // ── Admin: list all waitlist entries ──────────────────────────────────────
  async list(role?: string, status?: string, limit = 100, offset = 0) {
    let q = 'SELECT * FROM waitlist WHERE 1=1';
    const params: any[] = [];
    let i = 1;
    if (role)   { q += ` AND role=$${i++}`;   params.push(role); }
    if (status) { q += ` AND status=$${i++}`; params.push(status); }
    q += ` ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`;
    params.push(limit, offset);

    const [rows, countRes] = await Promise.all([
      this.db.queryMany(q, params),
      this.db.queryOne<{c:string}>('SELECT COUNT(*)::int AS c FROM waitlist', []),
    ]);
    return { entries: rows, total: parseInt(countRes?.c ?? '0') };
  }

  // ── Admin: stats breakdown ─────────────────────────────────────────────────
  async stats() {
    return this.redis.cached('waitlist:stats', 300, async () => {
      const [byRole, recent, total] = await Promise.all([
        this.db.queryMany('SELECT * FROM v_waitlist_stats ORDER BY total DESC'),
        this.db.queryMany(
          `SELECT name, email, role, city, created_at FROM waitlist
           ORDER BY created_at DESC LIMIT 10`
        ),
        this.db.queryOne<{c:string}>('SELECT COUNT(*)::int AS c FROM waitlist', []),
      ]);
      return { by_role: byRole, recent, total: parseInt(total?.c ?? '0') };
    });
  }

  // ── Admin: invite (send invite email + mark as invited) ───────────────────
  async invite(id: string, adminId: string) {
    const entry = await this.db.queryOne<any>('SELECT * FROM waitlist WHERE id=$1', [id]);
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    if (entry.status === 'registered') throw new ConflictException('Already registered');

    await this.db.query(
      `UPDATE waitlist SET status='invited', invited_at=NOW() WHERE id=$1`, [id]
    );
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'WAITLIST_INVITED','waitlist',$2,$3)`,
      [adminId, id, JSON.stringify({ email: entry.email, role: entry.role })],
    );

    await this.sendInviteEmail(entry);
    await this.redis.del('waitlist:stats');
    return { ok: true, email: entry.email };
  }

  // ── Admin: bulk invite by role ────────────────────────────────────────────
  async bulkInvite(role: string, limit: number, adminId: string) {
    const entries = await this.db.queryMany<any>(
      `SELECT * FROM waitlist WHERE role=$1 AND status='pending'
       ORDER BY created_at ASC LIMIT $2`,
      [role, limit]
    );
    const results = await Promise.allSettled(
      entries.map(e => this.invite(e.id, adminId))
    );
    const sent = results.filter(r => r.status === 'fulfilled').length;
    return { invited: sent, failed: results.length - sent };
  }

  // ── Mark as registered (auto-called when user signs up) ──────────────────
  async markRegistered(email: string) {
    await this.db.query(
      `UPDATE waitlist SET status='registered' WHERE email=$1`, [email.toLowerCase()]
    );
  }

  // ── Private: email templates ──────────────────────────────────────────────
  private async sendConfirmationEmail(data: WaitlistEntry, position: number) {
    const roleLabel: Record<string, string> = {
      investor: 'Investor',
      sme:      'SME / Startup',
      agent:    'Referral Agent',
      ca_cs:    'CA/CS Professional',
    };

    const perks: Record<string, string[]> = {
      investor: ['Early access to curated MSME deals', 'Zero platform fee for first 3 investments', 'Priority KYC processing'],
      sme:      ['Free listing for first 6 months', 'Dedicated onboarding support', 'Priority CA/CS assignment'],
      agent:    ['2.5% commission rate (vs standard 1.5%)', 'Custom referral landing page', 'Priority payout processing'],
      ca_cs:    ['Preferred empanelment status', '₹2,000/verification vs standard ₹1,500', 'Direct platform team access'],
    };

    const rolePerks = perks[data.role] ?? perks.investor;

    await this.email.send({
      to:      data.email,
      subject: `You're on the FairFund waitlist — Position #${position}`,
      html: this.email['layout'](`
        <h2>Welcome to FairFund, ${data.name}! 🎉</h2>
        <p>You've secured your spot as an early <strong>${roleLabel[data.role]}</strong>.</p>

        <div style="background:#F5F0E8;border-radius:12px;padding:20px;margin:20px 0;">
          <p style="margin:0 0 8px;font-weight:700;color:#0B1D3A;">Your waitlist position</p>
          <div style="font-size:48px;font-weight:900;color:#C9A84C;line-height:1;">#${position}</div>
          <p style="margin:8px 0 0;font-size:12px;color:#718096;">among ${roleLabel[data.role]}s</p>
        </div>

        <p style="font-weight:700;color:#0B1D3A;margin-bottom:8px;">Your early-access perks:</p>
        <ul style="padding-left:20px;color:#4A5568;">
          ${rolePerks.map(p => `<li style="margin-bottom:6px;">${p}</li>`).join('')}
        </ul>

        <p style="color:#718096;font-size:13px;margin-top:20px;">
          We're reviewing applications in batches. We'll email you the moment your
          spot opens up — usually within 2–4 weeks.
        </p>

        <p style="color:#718096;font-size:13px;">
          In the meantime, refer a friend and jump the queue:
          <a href="https://fairfund.in/?ref=${data.email.split('@')[0]}" style="color:#C9A84C;">
            fairfund.in/?ref=${data.email.split('@')[0]}
          </a>
        </p>
      `),
    });
  }

  private async sendInviteEmail(entry: any) {
    await this.email.send({
      to:      entry.email,
      subject: `Your FairFund invitation is ready, ${entry.name}!`,
      html: this.email['layout'](`
        <h2>Your spot is ready, ${entry.name}! 🚀</h2>
        <p>We're excited to welcome you to FairFund as an early <strong>${entry.role}</strong>.</p>

        <div style="text-align:center;margin:32px 0;">
          <a href="https://app.fairfund.in/register?invite=${entry.id}"
             style="background:linear-gradient(135deg,#C9A84C,#E8C96A);color:#0B1D3A;
                    padding:16px 32px;border-radius:12px;text-decoration:none;
                    font-weight:900;font-size:16px;display:inline-block;">
            Activate Your Account →
          </a>
        </div>

        <p style="color:#718096;font-size:13px;">
          This invitation is valid for 7 days. After that, you'll need to re-join the waitlist.
        </p>
        <p style="color:#718096;font-size:13px;">
          Questions? Reply to this email or reach us at hello@fairfund.in
        </p>
      `),
    });
  }
}
