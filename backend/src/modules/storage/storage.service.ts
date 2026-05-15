import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 }  from 'uuid';
import { createHash }     from 'crypto';
import { DatabaseService } from '../../database/database.service';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly db:     DatabaseService,
  ) {
    this.bucket  = config.get('AWS_S3_BUCKET', '');
    this.region  = config.get('AWS_REGION', 'ap-south-1');
    this.enabled = !!(this.bucket && config.get('AWS_ACCESS_KEY_ID'));

    if (this.enabled) {
      this.s3 = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId:     config.get('AWS_ACCESS_KEY_ID')!,
          secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY')!,
        },
      });
      this.logger.log(`✅ S3 connected: ${this.bucket} (${this.region})`);
    } else {
      this.logger.warn('⚠️  S3 not configured — documents stored as metadata only');
    }
  }

  // ── Upload file ────────────────────────────────────────────────────────────
  async uploadDocument(
    userId:    string,
    smeId:     string | null,
    docType:   string,
    fileName:  string,
    fileBuffer: Buffer,
    mimeType:  string,
  ) {
    // Validate
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} not allowed`);
    }
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large (max 10MB)`);
    }

    const checksum = createHash('sha256').update(fileBuffer).digest('hex');
    const docId    = uuidv4();
    const s3Key    = `docs/${userId}/${docType}/${docId}/${fileName}`;

    let fileUrl = `/static/docs/${s3Key}`; // Dev fallback

    if (this.enabled && this.s3) {
      await this.s3.send(new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         s3Key,
        Body:        fileBuffer,
        ContentType: mimeType,
        Metadata: {
          uploaded_by: userId,
          doc_type:    docType,
          checksum,
        },
        // Server-side encryption
        ServerSideEncryption: 'AES256',
      }));
      fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${s3Key}`;
    }

    // Record in DB
    await this.db.query(
      `INSERT INTO documents
         (id,sme_id,uploaded_by,doc_type,name,s3_bucket,s3_key,file_size_bytes,
          mime_type,requires_kyc,checksum_sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [docId, smeId, userId, docType, fileName, this.bucket || null, s3Key,
       fileBuffer.length, mimeType,
       ['valuation_report','financials'].includes(docType),
       checksum],
    );

    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'DOCUMENT_UPLOADED','document',$2,$3)`,
      [userId, docId, JSON.stringify({ docType, fileName, sizeBytes: fileBuffer.length })],
    );

    this.logger.log(`Document uploaded: ${docId} [${docType}] by ${userId}`);
    return { document_id: docId, doc_type: docType, name: fileName, url: fileUrl };
  }

  // ── Generate pre-signed GET URL (time-limited) ────────────────────────────
  async getSignedDownloadUrl(docId: string, userId: string, kycStatus: string): Promise<string> {
    const doc = await this.db.queryOne<any>('SELECT * FROM documents WHERE id=$1', [docId]);
    if (!doc) throw new BadRequestException('Document not found');

    if (doc.requires_kyc && kycStatus !== 'verified') {
      throw new BadRequestException('KYC verification required to access this document');
    }

    if (!this.enabled || !this.s3) {
      return `/static/docs/${doc.s3_key}`; // Dev fallback
    }

    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: doc.s3_key }),
      { expiresIn: 3600 }, // 1 hour
    );

    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'DOCUMENT_ACCESSED','document',$2,$3)`,
      [userId, docId, JSON.stringify({ expires_in: 3600 })],
    );
    return url;
  }

  // ── Generate pre-signed PUT URL (direct upload from browser) ─────────────
  async getSignedUploadUrl(
    userId: string, smeId: string | null, docType: string, fileName: string, mimeType: string,
  ) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`File type ${mimeType} not allowed`);
    }

    const docId  = uuidv4();
    const s3Key  = `docs/${userId}/${docType}/${docId}/${fileName}`;

    if (!this.enabled || !this.s3) {
      // Dev: return a placeholder
      return { upload_url: '/api/v1/storage/upload-direct', document_id: docId, s3_key: s3Key };
    }

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket:             this.bucket,
        Key:                s3Key,
        ContentType:        mimeType,
        ServerSideEncryption: 'AES256',
      }),
      { expiresIn: 600 }, // 10 minutes to upload
    );

    // Reserve the document record (confirmed after upload)
    await this.db.query(
      `INSERT INTO documents (id,sme_id,uploaded_by,doc_type,name,s3_bucket,s3_key,mime_type,requires_kyc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [docId, smeId, userId, docType, fileName, this.bucket, s3Key, mimeType,
       ['valuation_report','financials'].includes(docType)],
    );

    return { upload_url: uploadUrl, document_id: docId, s3_key: s3Key, expires_in: 600 };
  }

  // ── Delete document ────────────────────────────────────────────────────────
  async deleteDocument(docId: string, userId: string) {
    const doc = await this.db.queryOne<any>(
      'SELECT * FROM documents WHERE id=$1 AND uploaded_by=$2', [docId, userId]
    );
    if (!doc) throw new BadRequestException('Document not found or not owned by you');

    if (this.enabled && this.s3 && doc.s3_key) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: doc.s3_key }));
    }
    await this.db.query('DELETE FROM documents WHERE id=$1', [docId]);
    await this.db.query(
      `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
       VALUES ($1,'DOCUMENT_DELETED','document',$2,$3)`,
      [userId, docId, JSON.stringify({ doc_type: doc.doc_type, name: doc.name })],
    );
    return { ok: true };
  }
}
