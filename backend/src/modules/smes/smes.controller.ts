import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth }  from '@nestjs/swagger';
import { SmesService }             from './smes.service';
import { JwtAuthGuard }            from '../auth/guards/jwt-auth.guard';

@ApiTags('SMEs')
@Controller('smes')
export class SmesController {
  constructor(private readonly smes: SmesService) {}

  @Get()           findAll(@Query('sector') s?: string, @Query('stage') st?: string, @Query('search') q?: string) { return this.smes.findAll(s,st,q); }
  @Get('meta/sectors') sectors()  { return this.smes.getSectors(); }
  @Get('my')    @UseGuards(JwtAuthGuard) @ApiBearerAuth() myListings(@Req() r: any) { return this.smes.getMyListings(r.user.id); }
  @Get(':id')   findOne(@Param('id') id: string)    { return this.smes.findOne(id); }

  @Get(':id/investors')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  investors(@Param('id') id: string) { return this.smes.getInvestors(id); }

  @Post()
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  create(@Body() dto: any, @Req() r: any) { return this.smes.create(r.user.id, r.user.role, dto); }

  @Put(':id')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  update(@Param('id') id: string, @Body() dto: any, @Req() r: any) { return this.smes.update(id, r.user.id, dto); }

  @Put(':id/submit')
  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  submit(@Param('id') id: string, @Req() r: any) { return this.smes.submitForReview(id, r.user.id); }
}
