// ── auth.module.ts ────────────────────────────────────────────────────────────
import { Module }          from '@nestjs/common';
import { JwtModule }       from '@nestjs/jwt';
import { PassportModule }  from '@nestjs/passport';
import { ConfigService }   from '@nestjs/config';
import { AuthService }     from './auth.service';
import { AuthController }  from './auth.controller';
import { JwtStrategy }     from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_ACCESS_EXPIRY', '15m') },
      }),
    }),
  ],
  providers:   [AuthService, JwtStrategy, JwtRefreshStrategy],
  controllers: [AuthController],
  exports:     [AuthService],
})
export class AuthModule {}
