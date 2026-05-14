import { Controller, Get, Post, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }   from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { CaService, ReviewAction }  from './ca.service';
import { JwtAuthGuard }             from '../auth/guards/jwt-auth.guard';
import { Roles }                    from '../../common/decorators/roles.decorator';

class ReviewDto {
  @IsEnum(['approve','reject','request_info']) action: ReviewAction;
  @IsString() notes: string;
  @IsOptional() @IsString() info_required?: string;
}
class ChecklistDto { @IsObject() checklist: Record<string, boolean>; }

@ApiTags('CA/CS')
@Controller('ca')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Roles('ca_cs','admin','super_admin')
export class CaController {
  constructor(private readonly ca: CaService) {}

  @Get('dashboard')
  dashboard(@Req() req: any) { return this.ca.getDashboard(req.user.id); }

  @Get('queue/:id')
  getItem(@Param('id') id: string, @Req() req: any) { return this.ca.getVerificationItem(id, req.user.id); }

  @Put('queue/:id/start')
  startReview(@Param('id') id: string, @Req() req: any) { return this.ca.startReview(id, req.user.id); }

  @Put('queue/:id/review')
  review(@Param('id') id: string, @Body() dto: ReviewDto, @Req() req: any) {
    return this.ca.submitReview(id, req.user.id, dto.action, dto.notes, dto.info_required);
  }

  @Put('queue/:id/checklist')
  updateChecklist(@Param('id') id: string, @Body() dto: ChecklistDto, @Req() req: any) {
    return this.ca.updateChecklist(id, req.user.id, dto.checklist);
  }

  @Put('tasks/:taskId/signoff')
  signOff(@Param('taskId') id: string, @Req() req: any) { return this.ca.signOffComplianceTask(id, req.user.id); }
}
