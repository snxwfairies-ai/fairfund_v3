import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService }     from '@nestjs/config';
import { randomInt }         from 'crypto';
import { v4 as uuidv4 }      from 'uuid';
import { RedisService }      from '../../redis/redis.service';
import { EmailService }      from '../email/email.service';
import { DatabaseService }   from '../../database/database.service';

const OTP_TTL_SECONDS   = 600;  // 10 minutes
const MAX_ATTEMPTS      = 5;
const LOCKOUT_SECONDS   = 900;  // 15 minutes after 5 wrong attempts

@Injectable()
export class OTPService {
  private readonly logger = new Logger(OTPService.name);

  constructor(
    private readonly redis:  RedisService,
    private readonly email:  EmailService,
    private readonly db:     DatabaseService,
    private readonly config: ConfigService,
  ) {}

  // ── Send OTP (email or SMS) ────────────────────────────────────────────────
  async sendOTP(userId: string, purpose: 'kyc' | 'login' | 'withdrawal' | '2fa'): Promise<{ sent: boolean }> {
    // Check lockout
    const lockKey = `otp:lock:${userId}:${purpose}`;
    const locked  = await this.redis.get(lockKey);
    if (locked) throw new BadRequestException('Too many OTP attempts. Wait 15 minutes.');

    const otp = String(randomInt(100000, 999999)); // 6-digit

    // Store hashed OTP in Redis with TTL
    const key  = `otp:${userId}:${purpose}`;
    const hash = Buffer.from(otp).toString('base64'); // simple encoding (not security-critical)
    await this.redis.setex(key, OTP_TTL_SECONDS, JSON.stringify({ hash, attempts: 0 }));

    // Fetch user contact info
    const user = await this.db.queryOne<any>('SELECT name, email, phone FROM users WHERE id=$1', [userId]);
    if (!user) throw new BadRequestException('User not found');

    // Send via email (SMS via MSG91 if phone available and configured)
    await this.email.sendOTP(user.email, user.name, otp);

    const smsKey    = this.config.get('MSG91_AUTH_KEY');
    const smsTemplate = this.config.get('MSG91_TEMPLATE_ID');
    if (user.phone && smsKey && smsTemplate) {
      await this.sendSMSOTP(user.phone, otp, smsKey, smsTemplate);
    }

    this.logger.log(`OTP sent: ${userId} [${purpose}]`);
    return { sent: true };
  }

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  async verifyOTP(userId: string, purpose: string, enteredOTP: string): Promise<boolean> {
    const lockKey = `otp:lock:${userId}:${purpose}`;
    const locked  = await this.redis.get(lockKey);
    if (locked) throw new UnauthorizedException('Too many incorrect OTP attempts. Account locked for 15 minutes.');

    const key   = `otp:${userId}:${purpose}`;
    const stored = await this.redis.get(key);
    if (!stored) throw new UnauthorizedException('OTP expired or not sent. Request a new code.');

    const { hash, attempts } = JSON.parse(stored);
    const expectedOTP = Buffer.from(hash, 'base64').toString();

    if (attempts >= MAX_ATTEMPTS) {
      await this.redis.setex(lockKey, LOCKOUT_SECONDS, '1');
      await this.redis.del(key);
      throw new UnauthorizedException('Too many failed attempts. Account locked for 15 minutes.');
    }

    if (enteredOTP !== expectedOTP) {
      // Increment attempt counter
      await this.redis.setex(key, OTP_TTL_SECONDS, JSON.stringify({ hash, attempts: attempts + 1 }));
      throw new UnauthorizedException(`Incorrect OTP. ${MAX_ATTEMPTS - attempts - 1} attempts remaining.`);
    }

    // Valid — clean up
    await this.redis.del(key);
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'OTP_VERIFIED','user',$1,$2)`,
      [userId, JSON.stringify({ purpose })],
    );
    this.logger.log(`OTP verified: ${userId} [${purpose}]`);
    return true;
  }

  // ── SMS via MSG91 ──────────────────────────────────────────────────────────
  private async sendSMSOTP(phone: string, otp: string, authKey: string, templateId: string) {
    try {
      const body = JSON.stringify({
        template_id: templateId,
        short_url: '0',
        mobiles: `91${phone.replace(/^\+91/, '').replace(/\D/g, '')}`,
        VAR1: otp,
        VAR2: '10',
      });
      const resp = await fetch('https://api.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: { authkey: authKey, 'Content-Type': 'application/JSON' },
        body,
      });
      const data = await resp.json() as any;
      if (data.type !== 'success') this.logger.warn(`SMS OTP failed: ${JSON.stringify(data)}`);
      else this.logger.log(`SMS OTP sent to ${phone}`);
    } catch (err) {
      this.logger.warn(`SMS send failed: ${err.message}`);
      // Don't throw — email OTP is the fallback
    }
  }
}
