import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  async health() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'connected', platform: 'FairFund', version: '2.0.0', uptime: process.uptime(), ts: new Date().toISOString() };
    } catch {
      return { status: 'degraded', db: 'disconnected' };
    }
  }
}
