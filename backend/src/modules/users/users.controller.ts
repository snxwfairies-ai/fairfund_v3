import {
  Controller, Get, Put, Post, Body, Query, Param,
  UseGuards, Req, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth }  from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { UsersService }    from './users.service';
import { JwtAuthGuard }    from '../auth/guards/jwt-auth.guard';
import { Roles }           from '../../common/decorators/roles.decorator';

class UpdateProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() date_of_birth?: string;
  @IsOptional() @IsString() address_line1?: string;
  @IsOptional() @IsString() address_city?: string;
  @IsOptional() @IsString() address_state?: string;
  @IsOptional() @IsString() address_pin?: string;
  @IsOptional() @IsIn(['10L-25L','25L-50L','50L-1Cr','1Cr+']) annual_income_band?: string;
}

class SubmitKYCDto {
  @IsString() pan: string;
  @IsOptional() @IsString() aadhaar_last4?: string;
  @IsOptional() @IsString() bank_account_number?: string;
  @IsOptional() @IsString() bank_ifsc?: string;
}

class UploadDocDto {
  @IsString() doc_type: string;
  @IsString() file_name: string;
  @IsOptional() file_size_bytes?: number;
  @IsOptional() mime_type?: string;
  @IsOptional() @IsString() sme_id?: string;
}

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getProfile(@Req() req: any) { return this.users.getProfile(req.user.id); }

  @Put('me')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(req.user.id, dto);
  }

  @Post('me/kyc')
  submitKYC(@Req() req: any, @Body() dto: SubmitKYCDto) {
    return this.users.submitKYC(req.user.id, dto);
  }

  @Get('me/kyc')
  kycStatus(@Req() req: any) { return this.users.getKYCStatus(req.user.id); }

  @Post('me/documents')
  uploadDocument(@Req() req: any, @Body() dto: UploadDocDto) {
    return this.users.uploadDocument(
      req.user.id, dto.sme_id ?? null, dto.doc_type,
      dto.file_name, dto.file_size_bytes ?? 0, dto.mime_type ?? 'application/octet-stream',
    );
  }

  // Admin: list all users
  @Get()
  @Roles('admin', 'super_admin', 'compliance_officer')
  listUsers(
    @Query('role') role?: string,
    @Query('kyc_status') kyc?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.users.listUsers(role, kyc, page, limit);
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'compliance_officer')
  getUserById(@Param('id') id: string) { return this.users.getProfile(id); }
}
