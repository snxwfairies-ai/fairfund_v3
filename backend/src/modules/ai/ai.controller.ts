import { Controller, Get, Post, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AIService }   from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles }        from '../../common/decorators/roles.decorator';

@ApiTags('AI Scoring')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIController {
  constructor(private readonly ai: AIService) {}

  @Post('score/:sme_id')
  @Roles('admin','super_admin','compliance_officer')
  score(@Param('sme_id') id: string, @Query('force') force?: string) {
    return this.ai.scoreSME(id, force === 'true');
  }

  @Post('score-all')
  @Roles('admin','super_admin')
  scoreAll() { return this.ai.scoreAllActive(); }

  @Get('score/:sme_id/history')
  history(@Param('sme_id') id: string) { return this.ai.getScoreHistory(id); }

  @Get('recommendations')
  recommendations(@Req() req: any) { return this.ai.getRecommendations(req.user.id); }
}
