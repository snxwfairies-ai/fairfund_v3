import { Controller, Get, Put, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }               from '@nestjs/swagger';
import { NotificationsService }  from './notifications.service';
import { JwtAuthGuard }          from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
  @Get()      getUnread(@Req() req: any)  { return this.svc.getUnread(req.user.id); }
  @Put('read') markRead(@Req() req: any)  { return this.svc.markAllRead(req.user.id); }
}
