// payments.module.ts
import { Module }             from '@nestjs/common';
import { PaymentsService }    from './payments.service';
import { PaymentsController } from './payments.controller';
import { InvestmentsModule }  from '../investments/investments.module';

@Module({
  imports:     [InvestmentsModule],
  providers:   [PaymentsService],
  controllers: [PaymentsController],
  exports:     [PaymentsService],
})
export class PaymentsModule {}
