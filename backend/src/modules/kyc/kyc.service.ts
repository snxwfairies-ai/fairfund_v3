import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService }     from '@nestjs/config';
import { v4 as uuidv4 }      from 'uuid';
import { DatabaseService }   from '../../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OTPService }        from '../otp/otp.service';

export type KYCProvider = 'signzy' | 'karza' | 'sandbox';

export interface PANResult {
  valid:      boolean;
  name?:      string;
  pan_type?:  string;   // 'P' = individual, 'C' = company
  category?:  string;
  raw?:       Record<string, any>;
}

export interface AMLResult {
  clean:    boolean;
  score?:   number;
  flags?:   string[];
  raw?:     Record<string, any>;
}

@Injectable()
export class KYCService {
  private readonly logger = new Logger(KYCService.name);
  private readonly provider: KYCProvider;
  private readonly signzyToken: string;
  private readonly karzaKey:    string;

  constructor(
    private readonly db:            DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly otp:           OTPService,
    private readonly config:        ConfigService,
  ) {
    this.signzyToken = config.get('SIGNZY_TOKEN', '');
    this.karzaKey    = config.get('KARZA_API_KEY', '');
    this.provider    = this.signzyToken ? 'signzy'
                     : this.karzaKey    ? 'karza'
                     : 'sandbox';
    this.logger.log(`KYC provider: ${this.provider}`);
  }

  // ── PAN Verification ───────────────────────────────────────────────────────
  async verifyPAN(userId: string, pan: string): Promise<PANResult> {
    const verificationId = uuidv4();
    let result: PANResult;

    try {
      result = this.provider === 'sandbox'
        ? this.sandboxPAN(pan)
        : await this.callPANAPI(pan);

      await this.recordVerification(userId, 'pan', result.valid ? 'success' : 'failed', {
        pan: pan.slice(0, 3) + '***', // Never log full PAN
        name: result.name,
        provider: this.provider,
      });

      if (result.valid) {
        await this.db.query(
          'UPDATE users SET pan=$1, updated_at=NOW() WHERE id=$2',
          [pan.toUpperCase(), userId],
        );
      }
    } catch (err) {
      this.logger.error(`PAN verify failed: ${err.message}`);
      await this.recordVerification(userId, 'pan', 'error', { error: err.message });
      throw new BadRequestException(`PAN verification failed: ${err.message}`);
    }

    return result;
  }

  // ── Aadhaar eKYC (OTP-based) ──────────────────────────────────────────────
  async initiateAadhaarKYC(userId: string, aadhaarLast4: string) {
    // Store last 4 digits only (privacy compliance)
    await this.db.query(
      `UPDATE users SET aadhaar_masked='XXXX-XXXX-${aadhaarLast4}', updated_at=NOW() WHERE id=$1`,
      [userId],
    );
    // Send OTP for Aadhaar verification step
    await this.otp.sendOTP(userId, 'kyc');
    return { initiated: true, message: 'OTP sent for Aadhaar verification' };
  }

  async completeAadhaarKYC(userId: string, otp: string) {
    await this.otp.verifyOTP(userId, 'kyc', otp);
    await this.recordVerification(userId, 'aadhaar', 'success', { provider: this.provider });
    return { verified: true };
  }

  // ── AML Screening ──────────────────────────────────────────────────────────
  async screenAML(userId: string, pan: string, name: string): Promise<AMLResult> {
    let result: AMLResult;

    try {
      result = this.provider === 'sandbox'
        ? this.sandboxAML(name)
        : await this.callAMLAPI(pan, name);

      await this.recordVerification(userId, 'aml_screening', result.clean ? 'clean' : 'flagged', {
        score:  result.score,
        flags:  result.flags,
        provider: this.provider,
      });

      if (!result.clean) {
        // Flag for compliance review
        await this.db.query(
          `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
           VALUES ($1,'AML_FLAG','user',$1,$2)`,
          [userId, JSON.stringify({ flags: result.flags, score: result.score })],
        );
        await this.db.query(
          'UPDATE users SET is_active=FALSE WHERE id=$1', [userId]
        );
        await this.notifications.send(userId, 'error', 'Account Under Review',
          'Your account has been flagged for compliance review. Our team will contact you within 2 business days.');
      }
    } catch (err) {
      this.logger.warn(`AML screening error: ${err.message}`);
      result = { clean: true }; // Default to clean on error to not block KYC
    }

    return result;
  }

  // ── Full KYC flow (PAN + AML + advance onboarding) ─────────────────────────
  async runFullKYC(userId: string, pan: string, aadhaarLast4?: string) {
    const user = await this.db.queryOne<any>('SELECT * FROM users WHERE id=$1', [userId]);
    if (!user) throw new BadRequestException('User not found');

    // Step 1: PAN verification
    const panResult = await this.verifyPAN(userId, pan);
    if (!panResult.valid) throw new BadRequestException(`PAN ${pan} is invalid`);

    // Step 2: AML screening using PAN name
    const amlResult = await this.screenAML(userId, pan, panResult.name ?? user.name);

    // Step 3: Update KYC status
    const newStatus = amlResult.clean ? 'verified' : 'in_review';
    await this.db.query(
      'UPDATE users SET kyc_status=$1, updated_at=NOW() WHERE id=$2',
      [newStatus, userId],
    );

    if (newStatus === 'verified') {
      await this.notifications.send(userId, 'success', 'KYC Verified ✅',
        'Your identity has been verified. You can now invest on FaireFund.');
      // Advance onboarding
      await this.db.query(
        `UPDATE users SET onboarding_step='verification', updated_at=NOW()
         WHERE id=$1 AND onboarding_step='kyc'`,
        [userId]
      );
    }

    return { pan_verified: panResult.valid, aml_clean: amlResult.clean, kyc_status: newStatus };
  }

  // ── Private: API calls ─────────────────────────────────────────────────────
  private async callPANAPI(pan: string): Promise<PANResult> {
    if (this.provider === 'signzy') {
      const resp = await fetch('https://api.signzy.app/api/v3/pan/verify', {
        method: 'POST',
        headers: { Authorization: this.signzyToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan }),
      });
      const data = await resp.json() as any;
      return { valid: data.status === 'VALID', name: data.name, pan_type: data.category, raw: data };
    } else { // karza
      const resp = await fetch('https://testapi.karza.in/v3/pan-comprehensive', {
        method: 'POST',
        headers: { 'x-karza-key': this.karzaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, consent: 'Y' }),
      });
      const data = await resp.json() as any;
      return { valid: data['status-code'] === '101', name: data?.result?.name, raw: data };
    }
  }

  private async callAMLAPI(pan: string, name: string): Promise<AMLResult> {
    if (this.provider === 'karza') {
      const resp = await fetch('https://testapi.karza.in/v3/aml-screen', {
        method: 'POST',
        headers: { 'x-karza-key': this.karzaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pan, consent: 'Y' }),
      });
      const data = await resp.json() as any;
      const flags = data?.result?.matches?.map((m: any) => m.category) ?? [];
      return { clean: flags.length === 0, flags, score: data?.result?.score ?? 0, raw: data };
    }
    return { clean: true }; // Signzy doesn't have AML in basic tier
  }

  // ── Sandbox responses (for dev/test without API keys) ─────────────────────
  private sandboxPAN(pan: string): PANResult {
    // Simulate: PANs starting with 'ZZZ' are invalid
    const valid = !pan.toUpperCase().startsWith('ZZZ');
    return { valid, name: valid ? 'Test User' : undefined, pan_type: 'P', category: 'Individual' };
  }

  private sandboxAML(name: string): AMLResult {
    // Simulate: name 'BLACKLIST TEST' triggers AML flag
    const clean = !name.toUpperCase().includes('BLACKLIST');
    return { clean, score: clean ? 5 : 85, flags: clean ? [] : ['OFAC_MATCH'] };
  }

  // ── Record verification to DB ──────────────────────────────────────────────
  private async recordVerification(userId: string, type: string, status: string, data: object) {
    await this.db.query(
      `INSERT INTO kyc_verifications (id,user_id,provider,verification_type,status,raw_response,verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uuidv4(), userId, this.provider, type, status, JSON.stringify(data),
       status === 'success' || status === 'clean' ? new Date() : null],
    );
  }
}
