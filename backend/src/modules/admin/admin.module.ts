// admin.module.ts
import { Module }              from '@nestjs/common';
import { AdminController }     from './admin.controller';
import { AdminService }        from './admin.service';
import { InvestmentsModule }   from '../investments/investments.module';

@Module({
  imports:     [InvestmentsModule],
  controllers: [AdminController],
  providers:   [AdminService],
})
export class AdminModule {}
