import { Module }                from '@nestjs/common';
import { InvestmentsService }    from './investments.service';
import { InvestmentsController } from './investments.controller';
import { AgentModule }           from '../agent/agent.module';

@Module({
  imports:     [AgentModule],
  providers:   [InvestmentsService],
  controllers: [InvestmentsController],
  exports:     [InvestmentsService],
})
export class InvestmentsModule {}
