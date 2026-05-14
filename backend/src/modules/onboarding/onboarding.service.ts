import {
  Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 }          from 'uuid';
import { DatabaseService }        from '../../database/database.service';
import { NotificationsService }   from '../notifications/notifications.service';

// ─── State machine definition ─────────────────────────────────────────────
export type OnboardingStep =
  'register' | 'profile' | 'kyc' | 'verification' | 'approval' | 'active';

const TRANSITIONS: Record<OnboardingStep, OnboardingStep | null> = {
  register:     'profile',
  profile:      'kyc',
  kyc:          'verification',
  verification: 'approval',
  approval:     'active',
  active:       null,          // terminal state
};

// What each role needs to move forward
const STEP_REQUIREMENTS: Record<OnboardingStep, Record<string, string[]>> = {
  register: {},
  profile:  {
    investor: ['name','phone','address_city'],
    agent:    ['name','phone'],
    sme_admin:['name','phone'],
    ca_cs:    ['name','phone'],
    admin:    [],
  },
  kyc: {
    investor: ['pan'],
    agent:    ['pan'],
    sme_admin:['pan'],
    ca_cs:    ['pan'],
    admin:    [],
  },
  verification: {
    investor: [],    // auto-approve after KYC for investors
    agent:    [],    // auto-approve after KYC for agents
    sme_admin:['ca_cs_assigned'],  // needs CA/CS assignment
    ca_cs:    ['membership_number'], // needs admin approval
    admin:    [],
  },
  approval: {},
  active:   {},
};

// Steps that auto-advance (no human approval needed)
const AUTO_ADVANCE: Partial<Record<OnboardingStep, string[]>> = {
  verification: ['investor', 'agent'],   // investors/agents skip manual verification
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly db:            DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Get current onboarding status ─────────────────────────────────────────
  async getStatus(userId: string) {
    const user = await this.db.queryOne<any>(
      `SELECT u.id, u.name, u.email, u.role, u.kyc_status, u.onboarding_step,
              u.onboarding_completed_at, u.referral_code,
              u.created_at
       FROM users u WHERE u.id=$1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (!user) throw new NotFoundException('User not found');

    // Get role-specific profile completeness
    const profile   = await this.getProfile(userId, user.role);
    const history   = await this.db.queryMany(
      `SELECT from_step, to_step, created_at, notes FROM onboarding_events
       WHERE user_id=$1 ORDER BY created_at ASC`,
      [userId],
    );
    const nextStep  = TRANSITIONS[user.onboarding_step as OnboardingStep];
    const blockers  = await this.getBlockers(userId, user.role, user.onboarding_step);

    return {
      current_step:     user.onboarding_step,
      next_step:        nextStep,
      kyc_status:       user.kyc_status,
      is_active:        user.onboarding_step === 'active',
      completed_at:     user.onboarding_completed_at,
      blockers,          // what's preventing advancement
      history,
      profile_completeness: profile,
    };
  }

  // ── Advance to next step (called after user completes requirements) ────────
  async advance(userId: string, triggeredBy?: string, notes?: string): Promise<any> {
    const user = await this.db.queryOne<any>(
      'SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]
    );
    if (!user) throw new NotFoundException('User not found');
    if (user.onboarding_step === 'active') {
      throw new BadRequestException('User is already fully onboarded');
    }

    const currentStep = user.onboarding_step as OnboardingStep;
    const nextStep    = TRANSITIONS[currentStep];
    if (!nextStep) throw new BadRequestException('No further steps available');

    // Validate requirements before advancing
    const blockers = await this.getBlockers(userId, user.role, currentStep);
    if (blockers.length > 0) {
      throw new BadRequestException(
        `Cannot advance: ${blockers.join(', ')}`
      );
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET onboarding_step=$1,
          onboarding_completed_at=CASE WHEN $1='active' THEN NOW() ELSE onboarding_completed_at END,
          updated_at=NOW()
         WHERE id=$2`,
        [nextStep, userId],
      );

      await client.query(
        `INSERT INTO onboarding_events (user_id,from_step,to_step,triggered_by,notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, currentStep, nextStep, triggeredBy ?? userId, notes ?? null],
      );

      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
         VALUES ($1,'ONBOARDING_ADVANCE','user',$1,$2)`,
        [userId, JSON.stringify({ from: currentStep, to: nextStep, triggered_by: triggeredBy })],
      );
    });

    // Auto-advance again if this role skips manual verification
    const autoRoles = AUTO_ADVANCE[nextStep] ?? [];
    if (autoRoles.includes(user.role) && TRANSITIONS[nextStep]) {
      this.logger.log(`Auto-advancing ${user.role} ${userId} from ${nextStep}`);
      return this.advance(userId, 'system', 'Auto-advance for ' + user.role);
    }

    // Notifications
    await this.sendStepNotification(userId, user.name, currentStep, nextStep);

    if (nextStep === 'verification') {
      // Assign CA/CS for MSME verification
      if (user.role === 'sme_admin') await this.assignCACS(userId);
    }

    this.logger.log(`Onboarding: ${userId} [${user.role}] ${currentStep} → ${nextStep}`);
    return { user_id: userId, from: currentStep, to: nextStep };
  }

  // ── Admin: Force-approve to specific step ─────────────────────────────────
  async forceApprove(userId: string, targetStep: OnboardingStep, adminId: string, notes: string) {
    const user = await this.db.queryOne<any>('SELECT * FROM users WHERE id=$1', [userId]);
    if (!user) throw new NotFoundException('User not found');

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET onboarding_step=$1,
          onboarding_completed_at=CASE WHEN $1='active' THEN NOW() ELSE NULL END,
          updated_at=NOW() WHERE id=$2`,
        [targetStep, userId],
      );
      await client.query(
        `INSERT INTO onboarding_events (user_id,from_step,to_step,triggered_by,notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, user.onboarding_step, targetStep, adminId, `Admin override: ${notes}`],
      );
      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
         VALUES ($1,'ONBOARDING_FORCE_APPROVE','user',$2,$3)`,
        [adminId, userId, JSON.stringify({ to: targetStep, notes })],
      );
    });

    if (targetStep === 'active') {
      await this.notifications.send(userId, 'success', 'Account Activated 🎉',
        'Your FaireFund account is now fully active. You can start investing!');
    }

    return { user_id: userId, new_step: targetStep };
  }

  // ── Admin: Reject with reason ─────────────────────────────────────────────
  async reject(userId: string, reason: string, adminId: string) {
    const user = await this.db.queryOne<any>('SELECT * FROM users WHERE id=$1', [userId]);
    if (!user) throw new NotFoundException('User not found');

    // Roll back to kyc step for resubmission
    await this.db.query(
      `UPDATE users SET onboarding_step='kyc', kyc_status='rejected', updated_at=NOW() WHERE id=$1`,
      [userId]
    );
    await this.db.query(
      `INSERT INTO onboarding_events (user_id,from_step,to_step,triggered_by,notes)
       VALUES ($1,$2,'kyc',$3,$4)`,
      [userId, user.onboarding_step, adminId, `Rejected: ${reason}`]
    );
    await this.notifications.send(userId, 'error', 'Verification Rejected',
      `Your verification was rejected. Reason: ${reason}. Please re-submit corrected documents.`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private async getBlockers(userId: string, role: string, step: OnboardingStep): Promise<string[]> {
    const blockers: string[] = [];

    if (step === 'register') {
      // Need to fill profile
      const user = await this.db.queryOne<any>(
        'SELECT name,phone FROM users WHERE id=$1', [userId]
      );
      if (!user?.name)  blockers.push('Name is required');
      if (!user?.phone) blockers.push('Phone number is required');
    }

    if (step === 'profile') {
      // Need KYC docs
      const user = await this.db.queryOne<any>('SELECT pan FROM users WHERE id=$1', [userId]);
      if (!user?.pan) blockers.push('PAN number is required for KYC');
      if (role === 'ca_cs') {
        const ca = await this.db.queryOne<any>('SELECT membership_number FROM ca_cs_profiles WHERE user_id=$1', [userId]);
        if (!ca?.membership_number) blockers.push('CA/CS membership number is required');
      }
    }

    if (step === 'kyc') {
      // Need to wait for verification assignment (MSME)
      if (role === 'sme_admin') {
        const vq = await this.db.queryOne(
          `SELECT id FROM verification_queue WHERE msme_user_id=$1 AND status NOT IN ('rejected')`,
          [userId]
        );
        if (!vq) blockers.push('Pending CA/CS assignment for MSME verification');
      }
    }

    if (step === 'verification') {
      // Need approval from CA/CS or admin
      if (role === 'sme_admin') {
        const vq = await this.db.queryOne<any>(
          `SELECT status FROM verification_queue WHERE msme_user_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        if (vq?.status !== 'approved') {
          blockers.push(`Verification ${vq?.status ?? 'not started'} — awaiting CA/CS approval`);
        }
      }
    }

    return blockers;
  }

  private async getProfile(userId: string, role: string) {
    const user = await this.db.queryOne<any>(
      'SELECT name,email,phone,pan,address_city FROM users WHERE id=$1', [userId]
    );
    const fields = ['name','email','phone','pan','address_city'];
    const filled  = fields.filter(f => user?.[f]);
    return {
      pct:    Math.round((filled.length / fields.length) * 100),
      filled,
      missing: fields.filter(f => !user?.[f]),
    };
  }

  private async assignCACS(msmeUserId: string) {
    // Find least-loaded CA/CS who is empanelled
    const ca = await this.db.queryOne<any>(
      `SELECT u.id FROM users u
       JOIN ca_cs_profiles cp ON cp.user_id = u.id
       WHERE u.role='ca_cs' AND u.is_active=TRUE AND cp.is_empanelled=TRUE
         AND cp.current_load < cp.max_load
       ORDER BY cp.current_load ASC LIMIT 1`
    );
    if (!ca) { this.logger.warn('No available CA/CS for assignment'); return; }

    const vqId = uuidv4();
    const sme  = await this.db.queryOne<any>('SELECT id FROM smes WHERE created_by=$1 LIMIT 1', [msmeUserId]);

    await this.db.query(
      `INSERT INTO verification_queue (id,sme_id,msme_user_id,assigned_to,status,priority,review_type,due_date)
       VALUES ($1,$2,$3,$4,'queued',2,'msme_onboarding',CURRENT_DATE+14)`,
      [vqId, sme?.id ?? null, msmeUserId, ca.id]
    );
    await this.db.query(
      'UPDATE ca_cs_profiles SET current_load=current_load+1 WHERE user_id=$1', [ca.id]
    );
    await this.notifications.send(ca.id, 'action_required', 'New MSME Verification',
      'A new MSME has been assigned to you for verification. Due in 14 days.');
    this.logger.log(`MSME ${msmeUserId} assigned to CA/CS ${ca.id}`);
  }

  private async sendStepNotification(userId: string, name: string, from: OnboardingStep, to: OnboardingStep) {
    const messages: Record<OnboardingStep, { title: string; msg: string }> = {
      register:     { title: '', msg: '' },
      profile:      { title: 'Profile Step', msg: 'Please complete your profile to continue.' },
      kyc:          { title: 'KYC Required', msg: 'Submit your PAN and identity documents to proceed.' },
      verification: { title: 'Under Verification', msg: 'Your profile is being reviewed. We\'ll notify you.' },
      approval:     { title: 'Approved ✅', msg: 'Your account has been approved. Final activation in progress.' },
      active:       { title: 'Account Active 🎉', msg: 'Welcome to FaireFund! You can now invest.' },
    };
    const m = messages[to];
    if (m?.title) await this.notifications.send(userId, 'info', m.title, m.msg);
  }
}
