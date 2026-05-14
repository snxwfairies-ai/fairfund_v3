import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth }         from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsIn, Min, IsEnum } from 'class-validator';
import { AdminService, FlagSeverity }     from './admin.service';
import { JwtAuthGuard }                   from '../auth/guards/jwt-auth.guard';
import { Roles }                          from '../../common/decorators/roles.decorator';

class ApproveSMEDto {
  @IsString()  risk_level: string;
  @IsNumber() @Min(0) score: number;
  @IsString() @IsOptional() notes?: string;
}
class RejectDto      { @IsString() reason: string; }
class FlagDto        { @IsString() entity_type: string; @IsString() entity_id: string; @IsEnum(FlagSeverity) severity: FlagSeverity; @IsString() reason: string; }
class ReverseDto     { @IsNumber() @Min(0) recovered_amount: number; @IsString() reason: string; }

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin', 'super_admin', 'compliance_officer')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Dashboard ───────────────────────────────────────────────────────
  @Get('dashboard') getDashboard() { return this.admin.getDashboard(); }

  // ── SME Management ──────────────────────────────────────────────────
  @Get('smes')                    listSMEs(@Query('status') s?: string)  { return this.admin.listSMEs(s); }
  @Put('smes/:id/approve')        approveSME(@Param('id') id: string, @Body() dto: ApproveSMEDto, @Req() r: any) {
    return this.admin.approveSME(id, r.user.id, dto.risk_level, dto.score, dto.notes ?? '');
  }
  @Put('smes/:id/reject')         rejectSME(@Param('id') id: string, @Body() dto: RejectDto, @Req() r: any) {
    return this.admin.rejectSME(id, r.user.id, dto.reason);
  }

  // ── Investment Management ────────────────────────────────────────────
  @Get('investments')             listInvestments(@Query('status') s?: string, @Query('sme_id') sid?: string) {
    return this.admin.listInvestments(s, sid);
  }
  @Put('investments/:id/settle')  settle(@Param('id') id: string, @Req() r: any) {
    return this.admin.settleAllotment(id, r.user.id);
  }
  @Put('investments/:id/refund')  refund(@Param('id') id: string, @Body() dto: RejectDto, @Req() r: any) {
    return this.admin.refundInvestment(id, dto.reason, r.user.id);
  }
  @Put('investments/:id/reverse') reverse(@Param('id') id: string, @Body() dto: ReverseDto, @Req() r: any) {
    return this.admin.reverseInvestment(id, dto.recovered_amount, dto.reason, r.user.id);
  }

  // ── KYC Management ──────────────────────────────────────────────────
  @Get('kyc/pending')             pendingKYC() { return this.admin.listPendingKYC(); }
  @Put('kyc/:id/approve')         approveKYC(@Param('id') id: string, @Req() r: any) { return this.admin.approveKYC(id, r.user.id); }
  @Put('kyc/:id/reject')          rejectKYC(@Param('id') id: string, @Body() dto: RejectDto, @Req() r: any) { return this.admin.rejectKYC(id, r.user.id, dto.reason); }

  // ── Fraud Flags ──────────────────────────────────────────────────────
  @Post('flag')                   flag(@Body() dto: FlagDto, @Req() r: any) {
    return this.admin.flagActivity(dto.entity_type, dto.entity_id, dto.severity, dto.reason, r.user.id);
  }

  // ── Audit Log ────────────────────────────────────────────────────────
  @Get('audit')                   audit(@Query('entity_type') et?: string, @Query('entity_id') ei?: string, @Query('limit') l?: number) {
    return this.admin.getAuditLog(et, ei, l);
  }
}
