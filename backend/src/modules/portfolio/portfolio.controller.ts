import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard }  from '../auth/guards/jwt-auth.guard';
import { DatabaseService } from '../../database/database.service';
import { RedisService }    from '../../redis/redis.service';

@ApiTags('Portfolio')
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PortfolioController {
  constructor(private db: DatabaseService, private redis: RedisService) {}

  @Get()
  async get(@Req() req: any) {
    const uid = req.user.id;
    return this.redis.cached(`portfolio:${uid}`, 30, async () => {
      const investments = await this.db.queryMany(
        `SELECT i.*, s.legal_name AS sme_name, s.sector, s.location_city, s.stage, s.fairefund_score AS score
         FROM investments i JOIN smes s ON i.sme_id=s.id
         WHERE i.investor_id=$1 ORDER BY i.created_at DESC`, [uid]
      );
      const totalInvested = investments.reduce((a:number, i:any) => a + parseFloat(i.amount), 0);
      const totalCurrent  = investments.reduce((a:number, i:any) => a + parseFloat(i.current_value || i.amount), 0);
      const gain = totalCurrent - totalInvested;
      return {
        investments,
        summary: {
          total_invested: totalInvested,
          total_current:  totalCurrent,
          total_gain:     gain,
          gain_pct:       totalInvested > 0 ? ((gain/totalInvested)*100).toFixed(2) : '0.00',
        }
      };
    });
  }
}
