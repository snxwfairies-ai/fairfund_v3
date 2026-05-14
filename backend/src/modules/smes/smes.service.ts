import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 }        from 'uuid';
import { DatabaseService }      from '../../database/database.service';
import { RedisService }         from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SmesService {
  private readonly logger = new Logger(SmesService.name);
  constructor(private db: DatabaseService, private redis: RedisService, private notifications: NotificationsService) {}

  async findAll(sector?: string, stage?: string, search?: string) {
    if (!sector && !stage && !search)
      return this.redis.cached('smes:all', 60, () => this.queryAll());
    return this.queryAll(sector, stage, search);
  }

  private async queryAll(sector?: string, stage?: string, search?: string) {
    let q = `SELECT *,ROUND((raised_so_far/NULLIF(target_raise,0))*100)::int AS progress_pct
             FROM v_sme_progress WHERE status='active'`;
    const params: any[] = []; let i = 1;
    if (sector && sector!=='All') { q+=` AND sector=$${i++}`;  params.push(sector); }
    if (stage)                    { q+=` AND stage=$${i++}`;   params.push(stage); }
    if (search)                   { q+=` AND (legal_name ILIKE $${i} OR sector ILIKE $${i} OR short_description ILIKE $${i})`; params.push(`%${search}%`); }
    q+=' ORDER BY fairefund_score DESC NULLS LAST';
    return this.db.queryMany(q, params);
  }

  async getSectors(): Promise<string[]> {
    return this.redis.cached('smes:sectors', 300, async () => {
      const rows = await this.db.queryMany<{sector:string}>(`SELECT DISTINCT sector FROM smes WHERE status='active' ORDER BY sector`);
      return ['All', ...rows.map(r => r.sector)];
    });
  }

  async findOne(id: string) {
    return this.redis.cached(`sme:${id}`, 60, async () => {
      const sme = await this.db.queryOne(`SELECT *,ROUND((raised_so_far/NULLIF(target_raise,0))*100)::int AS progress_pct FROM v_sme_progress WHERE id=$1`, [id]);
      if (!sme) throw new NotFoundException('SME not found');
      const [docs, compliance] = await Promise.all([
        this.db.queryMany('SELECT * FROM documents WHERE sme_id=$1', [id]),
        this.db.queryMany('SELECT * FROM compliance_tasks WHERE sme_id=$1 ORDER BY id', [id]),
      ]);
      return { ...sme, documents: docs, compliance };
    });
  }

  async create(userId: string, userRole: string, dto: any) {
    if (userRole !== 'sme_admin') throw new ForbiddenException('Only SME admins can create listings');
    if (dto.expected_return_min >= dto.expected_return_max) throw new BadRequestException('Return min must be less than max');
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO smes (id,created_by,legal_name,cin,gstin,sector,sub_sector,location_city,location_state,
         registered_address,website,founded_year,team_size,stage,instrument,target_raise,min_investment,
         max_investment,valuation_pre,expected_return_min,expected_return_max,tenure_months,revenue_last_fy,
         ebitda_last_fy,revenue_growth_pct,debt_equity_ratio,short_description,long_description,closing_date,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,'draft')`,
      [id,userId,dto.legal_name,dto.cin??null,dto.gstin??null,dto.sector,dto.sub_sector??null,
       dto.location_city,dto.location_state,dto.registered_address??null,dto.website??null,
       dto.founded_year,dto.team_size,dto.stage,dto.instrument,dto.target_raise,dto.min_investment,
       dto.max_investment??null,dto.valuation_pre,dto.expected_return_min,dto.expected_return_max,
       dto.tenure_months,dto.revenue_last_fy,dto.ebitda_last_fy??null,dto.revenue_growth_pct??null,
       dto.debt_equity_ratio??null,dto.short_description,dto.long_description??null,dto.closing_date??null]
    );
    await this.seedComplianceTasks(id);
    await this.db.query(`INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,'SME_CREATED','sme',$2,$3)`,
      [userId, id, JSON.stringify({legal_name:dto.legal_name})]);
    await this.redis.invalidatePattern('smes:*');
    return { id, status: 'draft' };
  }

  async update(id: string, userId: string, dto: any) {
    const sme = await this.db.queryOne<any>('SELECT * FROM smes WHERE id=$1',[id]);
    if (!sme) throw new NotFoundException('SME not found');
    if (sme.created_by !== userId) throw new ForbiddenException('Not your listing');
    if (!['draft','under_review'].includes(sme.status)) throw new BadRequestException(`Cannot edit ${sme.status} listing`);
    const fields: string[]=[], params: any[]=[];let idx=1;
    for(const [k,v] of Object.entries(dto)){if(v!==undefined){fields.push(`${k}=$${idx++}`);params.push(v);}}
    if(!fields.length) throw new BadRequestException('No fields');
    params.push(id);
    await this.db.query(`UPDATE smes SET ${fields.join(',')},updated_at=NOW() WHERE id=$${idx}`,params);
    await this.redis.del(`sme:${id}`);await this.redis.invalidatePattern('smes:*');
    return this.findOne(id);
  }

  async submitForReview(id: string, userId: string) {
    const sme = await this.db.queryOne<any>('SELECT * FROM smes WHERE id=$1',[id]);
    if (!sme) throw new NotFoundException('SME not found');
    if (sme.created_by !== userId) throw new ForbiddenException('Not your listing');
    if (sme.status !== 'draft') throw new BadRequestException('Only drafts can be submitted');
    await this.db.query(`UPDATE smes SET status='under_review',updated_at=NOW() WHERE id=$1`,[id]);
    await this.notifications.send(userId,'info','Listing Under Review',`${sme.legal_name} submitted for review.`);
    await this.redis.del(`sme:${id}`);
    return { status:'under_review' };
  }

  async getMyListings(userId: string) {
    return this.db.queryMany(
      `SELECT s.*,ROUND((raised_so_far/NULLIF(target_raise,0))*100)::int AS progress_pct,
         (SELECT COUNT(*) FROM investments WHERE sme_id=s.id AND status NOT IN ('REFUNDED','DEFAULTED')) AS active_investors
       FROM smes s WHERE s.created_by=$1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
      [userId]
    );
  }

  async getInvestors(smeId: string) {
    return this.db.queryMany(
      `SELECT i.*,u.name AS investor_name,u.email,u.kyc_status
       FROM investments i JOIN users u ON i.investor_id=u.id WHERE i.sme_id=$1 ORDER BY i.created_at DESC`,
      [smeId]
    );
  }

  private async seedComplianceTasks(smeId: string) {
    const tasks = [
      'PAS-4 Information Memorandum Filed','Registered Valuer Report Submitted',
      'Board Resolution for Private Placement','Audited Financials Uploaded',
      'KYC Completion — All Investors','PAS-3 Filing (Post Allotment)',
      'ROC Form Filing','Share Certificate Issuance','Statutory Register Update',
    ];
    for(const t of tasks)
      await this.db.query(`INSERT INTO compliance_tasks (id,sme_id,task_name,is_mandatory,status) VALUES ($1,$2,$3,$4,'pending')`,
        [uuidv4(),smeId,t,!['Statutory Register Update'].includes(t)]);
  }
}
