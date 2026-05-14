import { Controller, Post, Body, Headers, Req, UseGuards, Param, RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }  from '@nestjs/swagger';
import { IsString, IsUUID }        from 'class-validator';
import { PaymentsService }         from './payments.service';
import { JwtAuthGuard }            from '../auth/guards/jwt-auth.guard';

class CreateOrderDto    { @IsUUID() investment_id: string; }
class ConfirmPaymentDto { @IsString() order_id: string; @IsString() payment_id: string; @IsString() signature: string; }

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Create Razorpay order — investor authenticated */
  @Post('order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  createOrder(@Body() dto: CreateOrderDto, @Req() req: any) {
    return this.payments.createOrder(req.user.id, dto.investment_id);
  }

  /** Confirm payment after Razorpay checkout — investor authenticated */
  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  confirmPayment(@Body() dto: ConfirmPaymentDto, @Req() req: any) {
    return this.payments.confirmPayment(req.user.id, dto.order_id, dto.payment_id, dto.signature);
  }

  /**
   * Razorpay webhook — PUBLIC endpoint, verified by HMAC signature
   * Must be whitelisted in Razorpay dashboard
   */
  @Post('webhook/razorpay')
  handleWebhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') sig: string,
    @Req() req: any,
  ) {
    const rawBody = JSON.stringify(body); // In prod, use rawBody middleware
    return this.payments.handleWebhook(rawBody, sig, body);
  }
}
