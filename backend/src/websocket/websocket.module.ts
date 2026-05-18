import { Module }             from '@nestjs/common';
import { JwtModule }          from '@nestjs/jwt';
import { ConfigService }      from '@nestjs/config';
import { FairFundGateway }   from './fairfund.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({ secret: cfg.get('JWT_SECRET') }),
    }),
  ],
  providers: [FairFundGateway],
  exports:   [FairFundGateway],
})
export class WebSocketModule {}
