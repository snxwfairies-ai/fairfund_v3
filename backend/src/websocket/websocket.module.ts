import { Module }             from '@nestjs/common';
import { JwtModule }          from '@nestjs/jwt';
import { ConfigService }      from '@nestjs/config';
import { FaireFundGateway }   from './fairefund.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({ secret: cfg.get('JWT_SECRET') }),
    }),
  ],
  providers: [FaireFundGateway],
  exports:   [FaireFundGateway],
})
export class WebSocketModule {}
