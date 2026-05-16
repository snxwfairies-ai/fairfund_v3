import {
  Controller, Post, Get, Put, Body, Param, Query,
  UseGuards, Req, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsIn } from 'class-validator';
import { Throttle }              from '@nestjs/throttler';
import { WaitlistService }       from './waitlist.service';
import { JwtAuthGuard }          from '../auth/guards/jwt-auth.guard';
import { Roles }                 from '../../common/decorators/roles.decorator';

class JoinWaitlistDto {
  @IsString() name: string;
  @IsEmail()  email: string;
  @IsOptional() @IsString() phone?: string;
  @IsIn(['investor','sme','agent','ca_cs']) role: 'investor'|'sme'|'agent'|'ca_cs';
  @IsOptional() @IsString() company_name?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() investment_size?: string;
  @IsOptional() @IsString() raise_amount?: string;
  @IsOptional() @IsString() referral_source?: string;
}

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  /** PUBLIC — join the waitlist */
  @Post()
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 signups/hr per IP
  join(@Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(dto);
  }

  /** ADMIN — list all entries */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles('admin','super_admin')
  list(
    @Query('role')   role?: string,
    @Query('status') status?: string,
    @Query('limit',  new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset?: number,
  ) { return this.waitlist.list(role, status, limit, offset); }

  /** ADMIN — stats + recent */
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles('admin','super_admin','compliance_officer')
  stats() { return this.waitlist.stats(); }

  /** ADMIN — invite single */
  @Put(':id/invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles('admin','super_admin')
  invite(@Param('id') id: string, @Req() req: any) {
    return this.waitlist.invite(id, req.user.id);
  }

  /** ADMIN — bulk invite by role */
  @Post('bulk-invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles('admin','super_admin')
  bulkInvite(@Body() body: { role: string; limit: number }, @Req() req: any) {
    return this.waitlist.bulkInvite(body.role, body.limit ?? 10, req.user.id);
  }
}
