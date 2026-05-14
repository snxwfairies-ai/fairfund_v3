import { Controller, Get, Post, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }   from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { OnboardingService, OnboardingStep } from './onboarding.service';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';
import { Roles }          from '../../common/decorators/roles.decorator';

class ForceApproveDto {
  @IsEnum(['register','profile','kyc','verification','approval','active']) step: OnboardingStep;
  @IsString() notes: string;
}
class RejectDto { @IsString() reason: string; }

@ApiTags('Onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('status')
  myStatus(@Req() req: any) { return this.onboarding.getStatus(req.user.id); }

  @Post('advance')
  advance(@Req() req: any) { return this.onboarding.advance(req.user.id); }

  @Get(':id/status')
  @Roles('admin','super_admin','compliance_officer','ca_cs')
  getStatus(@Param('id') id: string) { return this.onboarding.getStatus(id); }

  @Put(':id/approve')
  @Roles('admin','super_admin')
  approve(@Param('id') id: string, @Body() dto: ForceApproveDto, @Req() req: any) {
    return this.onboarding.forceApprove(id, dto.step, req.user.id, dto.notes);
  }

  @Put(':id/reject')
  @Roles('admin','super_admin','ca_cs')
  reject(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: any) {
    return this.onboarding.reject(id, dto.reason, req.user.id);
  }
}
