import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional }   from 'class-validator';
import { Throttle }               from '@nestjs/throttler';
import { KYCService }             from './kyc.service';
import { JwtAuthGuard }           from '../auth/guards/jwt-auth.guard';

class FullKYCDto   { @IsString() pan: string; @IsOptional() @IsString() aadhaar_last4?: string; }
class AadhaarDto   { @IsString() otp: string; }

@ApiTags('KYC')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KYCController {
  constructor(private readonly kyc: KYCService) {}

  /** Full automated KYC: PAN verify + AML screen */
  @Post('verify')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })  // 3 per hour
  verify(@Body() dto: FullKYCDto, @Req() req: any) {
    return this.kyc.runFullKYC(req.user.id, dto.pan, dto.aadhaar_last4);
  }

  /** Initiate Aadhaar OTP (sends OTP to email/phone) */
  @Post('aadhaar/initiate')
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  initiateAadhaar(@Body() body: { aadhaar_last4: string }, @Req() req: any) {
    return this.kyc.initiateAadhaarKYC(req.user.id, body.aadhaar_last4);
  }

  /** Complete Aadhaar OTP verification */
  @Post('aadhaar/verify')
  completeAadhaar(@Body() dto: AadhaarDto, @Req() req: any) {
    return this.kyc.completeAadhaarKYC(req.user.id, dto.otp);
  }
}
