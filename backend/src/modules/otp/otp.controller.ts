import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }  from '@nestjs/swagger';
import { IsString, IsIn }          from 'class-validator';
import { Throttle }                from '@nestjs/throttler';
import { OTPService }              from './otp.service';
import { JwtAuthGuard }            from '../auth/guards/jwt-auth.guard';

class SendOTPDto   { @IsIn(['kyc','login','withdrawal','2fa']) purpose: string; }
class VerifyOTPDto { @IsIn(['kyc','login','withdrawal','2fa']) purpose: string; @IsString() otp: string; }

@ApiTags('OTP')
@Controller('otp')
export class OTPController {
  constructor(private readonly otp: OTPService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 300000 } })  // 3 per 5 min
  send(@Body() dto: SendOTPDto, @Req() req: any) {
    return this.otp.sendOTP(req.user.id, dto.purpose as any);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  verify(@Body() dto: VerifyOTPDto, @Req() req: any) {
    return this.otp.verifyOTP(req.user.id, dto.purpose, dto.otp);
  }
}
