import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 }      from 'uuid';
import { DatabaseService }    from '../../database/database.service';
import { RedisService }       from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface ProfileUpdate {
  name?: string;
  phone?: string;
  date_of_birth?: string;
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_pin?: string;
  annual_income_band?: string;
}

export interface KYCSubmission {
  pan: string;
  aadhaar_last4?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db:            DatabaseService,
    private readonly redis:         RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Get profile ───────────────────────────────────────────────────────────
  async getProfile(userId: string) {
    const cacheKey = `profile:${userId}`;
    return this.redis.cached(cacheKey, 300, async () => {
      const user = await this.db.queryOne(
        `SELECT id,name,email,phone,role,kyc_status,pan,aadhaar_masked,
                date_of_birth,address_line1,address_city,address_state,address_pin,
                annual_income_band,is_accredited,email_verified,two_fa_enabled,
                last_login_at,created_at
         FROM users WHERE id=$1 AND deleted_at IS NULL`,
        [userId],
      );
      if (!user) throw new NotFoundException('User not found');
      return user;
    });
  }

  // ── Update profile ────────────────────────────────────────────────────────
  async updateProfile(userId: string, dto: ProfileUpdate) {
    const fields: string[] = [];
    const params: any[]    = [];
    let idx = 1;

    const allowed: (keyof ProfileUpdate)[] = [
      'name','phone','date_of_birth','address_line1',
      'address_city','address_state','address_pin','annual_income_band',
    ];
    for (const key of allowed) {
      if (dto[key] !== undefined) {
        fields.push(`${key}=$${idx++}`);
        params.push(dto[key]);
      }
    }
    if (fields.length === 0) throw new BadRequestException('No fields to update');

    params.push(userId);
    await this.db.query(
      `UPDATE users SET ${fields.join(',')} , updated_at=NOW() WHERE id=$${idx}`,
      params,
    );

    await this.redis.del(`profile:${userId}`);
    this.logger.log(`Profile updated: ${userId}`);
    return this.getProfile(userId);
  }

  // ── KYC Submission ────────────────────────────────────────────────────────
  async submitKYC(userId: string, dto: KYCSubmission) {
    const user = await this.db.queryOne<any>('SELECT * FROM users WHERE id=$1', [userId]);
    if (!user) throw new NotFoundException('User not found');

    if (['verified','in_review'].includes(user.kyc_status))
      throw new ConflictException(`KYC is already ${user.kyc_status}`);

    // PAN uniqueness check
    if (dto.pan) {
      const panConflict = await this.db.queryOne(
        'SELECT id FROM users WHERE pan=$1 AND id!=$2 AND deleted_at IS NULL',
        [dto.pan.toUpperCase(), userId],
      );
      if (panConflict) throw new ConflictException('PAN already registered with another account');
    }

    // Store only last 4 of Aadhaar (privacy compliance)
    const aadhaarMasked = dto.aadhaar_last4
      ? `XXXX-XXXX-${dto.aadhaar_last4}` : null;

    await this.db.query(
      `UPDATE users SET
         pan=$1, aadhaar_masked=$2, kyc_status='in_review', updated_at=NOW()
       WHERE id=$3`,
      [dto.pan?.toUpperCase(), aadhaarMasked, userId],
    );

    // Record KYC verification attempt
    await this.db.query(
      `INSERT INTO kyc_verifications (id,user_id,provider,verification_type,status,raw_response)
       VALUES ($1,$2,'manual','pan+aadhaar','pending',$3)`,
      [uuidv4(), userId, JSON.stringify({ submitted_at: new Date().toISOString() })],
    );

    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'KYC_SUBMITTED','user',$1,$2)`,
      [userId, JSON.stringify({ pan: dto.pan?.slice(0,3) + '***' })],
    );

    await this.notifications.send(
      userId, 'info', 'KYC Under Review',
      'Your KYC documents are under review. Usually takes 1–2 business days.',
    );

    await this.redis.del(`profile:${userId}`);
    this.logger.log(`KYC submitted: ${userId}`);
    return { status: 'in_review', message: 'KYC submitted successfully. Under review.' };
  }

  // ── Document Upload (placeholder — S3 in prod) ────────────────────────────
  async uploadDocument(
    userId: string,
    smeId: string | null,
    docType: string,
    fileName: string,
    fileSizeBytes: number,
    mimeType: string,
  ) {
    // In production: upload file to S3, get signed URL
    // For now: record metadata, return a placeholder URL
    const docId  = uuidv4();
    const s3Key  = `uploads/${userId}/${docType}/${docId}/${fileName}`;
    const mockUrl = `/static/docs/${s3Key}`;

    await this.db.query(
      `INSERT INTO documents
         (id,sme_id,uploaded_by,doc_type,name,s3_key,file_size_bytes,mime_type,requires_kyc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [docId, smeId, userId, docType, fileName, s3Key, fileSizeBytes, mimeType,
       ['valuation_report','financials'].includes(docType)],
    );

    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'DOCUMENT_UPLOADED','document',$2,$3)`,
      [userId, docId, JSON.stringify({ docType, fileName })],
    );

    return {
      document_id: docId,
      doc_type:    docType,
      name:        fileName,
      upload_url:  mockUrl,         // In prod: S3 pre-signed PUT URL
      signed_url:  mockUrl,         // In prod: S3 pre-signed GET URL
    };
  }

  // ── KYC status ────────────────────────────────────────────────────────────
  async getKYCStatus(userId: string) {
    const user = await this.db.queryOne<any>(
      'SELECT id,kyc_status,pan,aadhaar_masked FROM users WHERE id=$1',
      [userId],
    );
    const history = await this.db.queryMany(
      'SELECT * FROM kyc_verifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5',
      [userId],
    );
    return {
      kyc_status:     user?.kyc_status,
      pan_submitted:  !!user?.pan,
      aadhaar_masked: user?.aadhaar_masked,
      history,
      can_invest:     user?.kyc_status === 'verified',
    };
  }

  // ── List users (admin) ────────────────────────────────────────────────────
  async listUsers(role?: string, kyc_status?: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let q = `SELECT id,name,email,role,kyc_status,created_at,last_login_at,is_active
             FROM users WHERE deleted_at IS NULL`;
    const params: any[] = [];
    let idx = 1;
    if (role)       { q += ` AND role=$${idx++}`;       params.push(role); }
    if (kyc_status) { q += ` AND kyc_status=$${idx++}`; params.push(kyc_status); }
    q += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(limit, offset);

    const [users, count] = await Promise.all([
      this.db.queryMany(q, params),
      this.db.queryOne<{c: string}>('SELECT COUNT(*)::int AS c FROM users WHERE deleted_at IS NULL', []),
    ]);
    return { users, total: parseInt(count?.c ?? '0'), page, limit };
  }
}
