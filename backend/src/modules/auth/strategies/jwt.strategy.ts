// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../redis/redis.service';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private redis: RedisService, private db: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
      passReqToCallback: true,
    });
  }
  async validate(req: any, payload: any) {
    // Check revocation blacklist
    const raw = req.headers.authorization?.split(' ')[1] || '';
    const revoked = await this.redis.get(`bl:${raw.slice(-20)}`);
    if (revoked) throw new UnauthorizedException('Token revoked');

    const user = await this.db.queryOne<any>('SELECT id,name,email,role,kyc_status FROM users WHERE id=$1 AND is_active=TRUE', [payload.sub]);
    if (!user) throw new UnauthorizedException('User not found');
    return { ...user, jti: payload.jti };
  }
}
