import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }     from '@nestjs/swagger';
import { JwtAuthGuard }   from '../auth/guards/jwt-auth.guard';
import { DatabaseService }  from '../../database/database.service';
import { RedisService }     from '../../redis/redis.service';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private db: DatabaseService, private redis: RedisService) {}

  @Get('platform')
  async platform() {
    return this.redis.cached('analytics:platform', 120, async () => {
      const [stats, sectors, top] = await Promise.all([
        this.db.queryOne('SELECT * FROM v_platform_stats'),
        this.db.queryMany('SELECT sector, SUM(raised_so_far)::numeric AS raised FROM smes GROUP BY sector ORDER BY raised DESC'),
        this.db.queryMany('SELECT legal_name AS name, fairefund_score AS score, raised_so_far, target_raise FROM smes ORDER BY fairefund_score DESC NULLS LAST LIMIT 6'),
      ]);
      return {
        ...stats,
        sectors,
        top_smes: top,
        monthly: [
          {month:'Aug',amount:1200000},{month:'Sep',amount:1800000},{month:'Oct',amount:2800000},
          {month:'Nov',amount:3500000},{month:'Dec',amount:4400000},{month:'Jan',amount:4800000},
        ],
      };
    });
  }
}
