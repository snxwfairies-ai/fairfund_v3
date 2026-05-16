import { WaitlistModule }      from './modules/waitlist/waitlist.module';
import { AIModule }            from './modules/ai/ai.module';
import { StorageModule }       from './modules/storage/storage.module';
import { OTPModule }           from './modules/otp/otp.module';
import { KYCModule }           from './modules/kyc/kyc.module';
import { EmailModule }         from './modules/email/email.module';
import { OnboardingModule }    from './modules/onboarding/onboarding.module';
import { AgentModule }          from './modules/agent/agent.module';
import { CaModule }             from './modules/ca/ca.module';
import { DashboardModule }      from './modules/dashboard/dashboard.module';
import { TransactionModule }    from './modules/transaction/transaction.module';
import { PaymentsModule }     from './modules/payments/payments.module';
import { RolesGuard }        from './common/guards/roles.guard';
import { Module }              from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule }         from '@nestjs/cache-manager';
import { APP_GUARD }           from '@nestjs/core';

import { DatabaseModule }      from './database/database.module';
import { RedisModule }         from './redis/redis.module';
import { AuthModule }          from './modules/auth/auth.module';
import { UsersModule }         from './modules/users/users.module';
import { SmesModule }          from './modules/smes/smes.module';
import { InvestmentsModule }   from './modules/investments/investments.module';
import { LedgerModule }        from './modules/ledger/ledger.module';
import { PortfolioModule }     from './modules/portfolio/portfolio.module';
import { AnalyticsModule }     from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule }         from './modules/admin/admin.module';
import { WebSocketModule }     from './websocket/websocket.module';
import { AppController }       from './app.controller';
import configuration           from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({ throttlers: [{ name: 'default', ttl: 60000, limit: 120 }] }),
    }),
    CacheModule.register({ isGlobal: true, ttl: 60000 }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    SmesModule,
    LedgerModule,        // Global — must be before InvestmentsModule
    NotificationsModule, // Global — must be before InvestmentsModule
    InvestmentsModule,
    PortfolioModule,
    AnalyticsModule,
    AdminModule,
    PaymentsModule,
    WebSocketModule,
    OnboardingModule,
    AgentModule,
    CaModule,
    DashboardModule,
    EmailModule,
    AIModule,
    StorageModule,
    OTPModule,
    KYCModule,
    WaitlistModule,
    TransactionModule,
  ],
  controllers: [AppController],
  providers:   [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
