import {
  Injectable, UnauthorizedException, ConflictException, Logger,
} from '@nestjs/common';
import { JwtService }       from '@nestjs/jwt';
import { ConfigService }    from '@nestjs/config';
import * as bcrypt          from 'bcryptjs';
import { v4 as uuidv4 }     from 'uuid';
import { DatabaseService }  from '../../database/database.service';
import { RedisService }     from '../../redis/redis.service';
import { RegisterDto }      from './dto/register.dto';
import { LoginDto }         from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db:     DatabaseService,
    private readonly redis:  RedisService,
    private readonly jwt:    JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────
  async register(dto: RegisterDto, ip: string) {
    const exists = await this.db.queryOne('SELECT id FROM users WHERE email=$1', [dto.email]);
    if (exists) throw new ConflictException('Email already registered');

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const hash   = await bcrypt.hash(dto.password, rounds);
    const id     = uuidv4();

    await this.db.query(
      `INSERT INTO users (id,name,email,phone,password_hash,role,pan,onboarding_step)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'register')`,
      [id, dto.name, dto.email, dto.phone ?? null, hash, dto.role ?? 'investor', dto.pan?.toUpperCase() ?? null],
    );

    // ── Integration 1: Hook onboarding — advance register → profile ──────────
    await this.db.query(
      `UPDATE users SET onboarding_step='profile', updated_at=NOW() WHERE id=$1`, [id]
    );
    await this.db.query(
      `INSERT INTO onboarding_events (user_id,from_step,to_step,triggered_by,notes)
       VALUES ($1,'register','profile',$1,'Auto-advance on registration')`,
      [id]
    );

    // ── Integration 2: Hook agent referral ────────────────────────────────────
    if (dto.referral_code) {
      await this.linkReferral(dto.referral_code, id).catch(err =>
        this.logger.warn(`Referral link failed: ${err.message}`)
      );
    }

    // ── Integration 3: Create role-specific profile row ───────────────────────
    await this.createRoleProfile(id, dto.role ?? 'investor');

    const user   = { id, name: dto.name, email: dto.email, role: dto.role ?? 'investor', kyc_status: 'not_started' };
    const tokens = await this.issueTokens(user, ip);

    this.logger.log(`Registered: ${id} [${dto.role}]`);
    return { ...tokens, user };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  async login(dto: LoginDto, ip: string) {
    const user = await this.db.queryOne<any>('SELECT * FROM users WHERE email=$1 AND deleted_at IS NULL', [dto.email]);
    const ROUNDS = this.config.get<number>('BCRYPT_ROUNDS', 12);

    const valid = user
      ? await bcrypt.compare(dto.password, user.password_hash)
      : (await bcrypt.hash('dummy', ROUNDS), false);

    if (!user || !valid) {
      this.logger.warn(`Failed login: ${dto.email} from ${ip}`);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.is_active) throw new UnauthorizedException('Account suspended');

    await this.db.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, kyc_status: user.kyc_status };
    const tokens   = await this.issueTokens(safeUser, ip);
    this.logger.log(`Login: ${user.id}`);
    return { ...tokens, user: safeUser };
  }

  // ─── Refresh token ─────────────────────────────────────────────────────────
  async refresh(refreshToken: string, ip: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.config.get('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const record = await this.db.queryOne<any>(
      'SELECT * FROM refresh_tokens WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at > NOW()',
      [payload.jti, payload.sub],
    );
    if (!record) throw new UnauthorizedException('Refresh token expired or revoked');

    const valid = await bcrypt.compare(refreshToken, record.token_hash);
    if (!valid) {
      await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1', [payload.sub]);
      throw new UnauthorizedException('Token mismatch — all sessions revoked');
    }

    await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [payload.jti]);
    const user = await this.db.queryOne<any>(
      'SELECT id,name,email,role,kyc_status FROM users WHERE id=$1', [payload.sub]
    );
    if (!user) throw new UnauthorizedException('User not found');
    return { ...(await this.issueTokens(user, ip)), user };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────
  async logout(userId: string, tokenId: string, rawToken: string) {
    await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [tokenId]);
    await this.redis.setex(`bl:${rawToken.slice(-20)}`, 900, '1');
    this.logger.log(`Logout: ${userId}`);
  }

  // ─── Private: issue token pair ────────────────────────────────────────────
  private async issueTokens(user: any, ip: string) {
    const jti = uuidv4();
    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role, jti },
      { secret: this.config.get('JWT_SECRET'), expiresIn: this.config.get('JWT_ACCESS_EXPIRY', '15m') },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti },
      { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: this.config.get('JWT_REFRESH_EXPIRY', '7d') },
    );
    const hash      = await bcrypt.hash(refreshToken, 6);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await this.db.query(
      'INSERT INTO refresh_tokens (id,user_id,token_hash,ip_address,expires_at) VALUES ($1,$2,$3,$4,$5)',
      [jti, user.id, hash, ip, expiresAt],
    );
    return { accessToken, refreshToken };
  }

  // ─── Private: link referral to agent ─────────────────────────────────────
  private async linkReferral(code: string, newUserId: string) {
    const agent = await this.db.queryOne<any>(
      `SELECT u.id FROM users u JOIN agent_profiles ap ON ap.user_id=u.id
       WHERE ap.referral_code=$1 AND u.is_active=TRUE AND u.deleted_at IS NULL`,
      [code],
    );
    if (!agent || agent.id === newUserId) return;

    const existing = await this.db.queryOne('SELECT id FROM referrals WHERE referred_user_id=$1', [newUserId]);
    if (existing) return;

    const refId = uuidv4();
    await this.db.query(
      `INSERT INTO referrals (id,agent_id,referred_user_id,referral_code,status) VALUES ($1,$2,$3,$4,'pending')`,
      [refId, agent.id, newUserId, code],
    );
    await this.db.query('UPDATE users SET agent_id=$1, referred_by=$2 WHERE id=$3', [agent.id, agent.id, newUserId]);
    await this.db.query('UPDATE agent_profiles SET total_referrals=total_referrals+1 WHERE user_id=$1', [agent.id]);
    this.logger.log(`Referral linked: agent=${agent.id} → user=${newUserId} code=${code}`);
  }

  // ─── Private: create role-specific profile ────────────────────────────────
  private async createRoleProfile(userId: string, role: string) {
    try {
      if (role === 'investor') {
        await this.db.query(
          'INSERT INTO investor_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]
        );
      } else if (role === 'agent') {
        const code = `FF-${userId.slice(0,4).toUpperCase()}-${userId.slice(4,8).toUpperCase()}`;
        await this.db.query(
          'INSERT INTO agent_profiles (user_id,referral_code) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, code]
        );
        await this.db.query('UPDATE users SET referral_code=$1 WHERE id=$2', [code, userId]);
      } else if (role === 'sme_admin') {
        await this.db.query(
          'INSERT INTO msme_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]
        );
      }
    } catch (err) {
      this.logger.warn(`Profile creation skipped for ${role}: ${err.message}`);
    }
  }
}
