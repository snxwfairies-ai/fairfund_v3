import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }  from '@nestjs/swagger';
import { TransactionService }      from './transaction.service';
import { JwtAuthGuard }            from '../auth/guards/jwt-auth.guard';
import { Roles }                   from '../../common/decorators/roles.decorator';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionController {
  constructor(private readonly txn: TransactionService) {}

  @Get('retries')
  @Roles('admin','super_admin')
  getPendingRetries() { return this.txn.getPendingRetries(); }

  @Post('reconcile')
  @Roles('admin','super_admin')
  reconcile() { return this.txn.reconcile(); }
}
