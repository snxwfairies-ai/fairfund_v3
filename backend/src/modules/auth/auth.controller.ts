// src/modules/auth/auth.controller.ts
import { Controller, Post, Get, Put, Body, Req, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle }   from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto }    from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { DatabaseService } from '../../database/database.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: DatabaseService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.auth.register(dto, req.ip);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto, req.ip);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: { refreshToken: string }, @Req() req: any) {
    return this.auth.refresh(body.refreshToken, req.ip);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logout(@Req() req: any) {
    const raw = req.headers.authorization?.split(' ')[1] || '';
    return this.auth.logout(req.user.id, req.user.jti, raw);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@Req() req: any) {
    const unread = await this.db.queryOne<any>(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read=FALSE', [req.user.id]
    );
    return { ...req.user, unread_notifications: unread?.c ?? 0 };
  }

  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  notifications(@Req() req: any) {
    return this.db.queryMany(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]
    );
  }

  @Put('notifications/:id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  markRead(@Param('id') id: string, @Req() req: any) {
    return this.db.query('UPDATE notifications SET read=TRUE, read_at=NOW() WHERE id=$1 AND user_id=$2', [id, req.user.id]);
  }
}
