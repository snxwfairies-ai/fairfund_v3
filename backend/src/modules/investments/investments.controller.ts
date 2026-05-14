import { Controller, Post, Put, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }    from '@nestjs/swagger';
import { IsUUID, IsNumber, Min }     from 'class-validator';
import { InvestmentsService }        from './investments.service';
import { JwtAuthGuard }              from '../auth/guards/jwt-auth.guard';
import { LedgerService }             from '../ledger/ledger.service';
import { AccountType }               from '../ledger/ledger.types';

class CreateInvestmentDto { @IsUUID() sme_id: string; @IsNumber() @Min(1) amount: number; }
class WithdrawDto          { @IsNumber() @Min(1) amount: number; }
class WebhookDto {
  payment_id: string;
  order_id:   string;
  signature:  string;
  status:     'success' | 'failed';
}

@ApiTags('Investments')
@Controller('investments')
export class InvestmentsController {
  constructor(
    private readonly inv:    InvestmentsService,
    private readonly ledger: LedgerService,
  ) {}

  /** STEP 1: Initiate investment intent */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  initiate(@Body() dto: CreateInvestmentDto, @Req() req: any) {
    return this.inv.initiate(req.user.id, req.user.kyc_status, dto.sme_id, dto.amount);
  }

  /** STEP 2: Get Razorpay order */
  @Post(':id/payment-order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  createOrder(@Param('id') id: string, @Req() req: any) {
    return this.inv.createPaymentOrder(req.user.id, id);
  }

  /** STEP 3: Razorpay payment webhook (public — verified by signature) */
  @Post('webhook/payment')
  handleWebhook(@Body() body: WebhookDto) {
    return this.inv.handlePaymentWebhook(body.payment_id, body.order_id, body.status);
  }

  /** Manual eSign / escrow steps (kept for backward compat) */
  @Put(':id/esign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  esign(@Param('id') id: string, @Req() req: any) {
    return this.inv.updateStatus(id, req.user.id, 'esign');
  }

  /** SCENARIO 2: Withdrawal */
  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  withdraw(@Body() dto: WithdrawDto, @Req() req: any) {
    return this.inv.initiateWithdrawal(req.user.id, dto.amount);
  }

  /** Ledger balances */
  @Get('balances')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  balances(@Req() req: any) {
    return this.ledger.getAllBalances(req.user.id);
  }
}
