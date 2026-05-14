import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }                 from '@nestjs/swagger';
import { LedgerService }  from './ledger.service';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';
import { AccountType }    from './ledger.types';

@ApiTags('Ledger')
@Controller('ledger')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  /** GET /api/v1/ledger/balances — all account balances for current user */
  @Get('balances')
  getBalances(@Req() req: any) {
    return this.ledger.getAllBalances(req.user.id);
  }

  /** GET /api/v1/ledger/history?account_type=INVESTOR_AVAILABLE */
  @Get('history')
  getHistory(
    @Req() req: any,
    @Query('account_type') accountType?: AccountType,
    @Query('limit') limit?: number,
  ) {
    return this.ledger.getLedgerHistory(req.user.id, accountType, limit);
  }
}
