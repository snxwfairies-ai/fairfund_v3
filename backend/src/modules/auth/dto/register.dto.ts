// src/modules/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsIn, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name: string;
  @ApiProperty() @IsEmail() @Transform(({ value }) => value.toLowerCase().trim()) email: string;
  @ApiProperty() @IsString() @MinLength(8) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/) password: string;
  @ApiProperty({ enum: ['investor','sme_admin'] }) @IsIn(['investor','sme_admin']) role: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/i) pan?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referral_code?: string;
}
