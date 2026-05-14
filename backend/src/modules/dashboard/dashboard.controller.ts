import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }   from '@nestjs/swagger';
import { DashboardService }   from './dashboard.service';
import { JwtAuthGuard }       from '../auth/guards/jwt-auth.guard';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Single endpoint — returns correct dashboard for the caller's role */
  @Get()
  get(@Req() req: any) { return this.dashboard.getDashboard(req.user.id, req.user.role); }
}
