import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsUUID, IsString } from 'class-validator';
import { AgentService }  from './agent.service';
import { JwtAuthGuard }  from '../auth/guards/jwt-auth.guard';
import { Roles }         from '../../common/decorators/roles.decorator';

class PayoutDto { @IsArray() @IsUUID(4, { each: true }) commission_ids: string[]; }

@ApiTags('Agent')
@Controller('agent')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Get('dashboard')
  @Roles('agent')
  dashboard(@Req() req: any) { return this.agent.getDashboard(req.user.id); }

  @Get('tiers')
  tiers() { return this.agent.getTiers(); }

  @Get('validate-code/:code')
  validate(@Param('code') code: string) { return this.agent.validateReferralCode(code); }

  @Put(':id/payout')
  @Roles('admin','super_admin')
  payout(@Param('id') id: string, @Body() dto: PayoutDto, @Req() req: any) {
    return this.agent.approvePayout(id, dto.commission_ids, req.user.id);
  }

  @Put(':id/recalculate-tier')
  @Roles('admin','super_admin')
  recalculate(@Param('id') id: string) { return this.agent.recalculateTier(id); }
}
