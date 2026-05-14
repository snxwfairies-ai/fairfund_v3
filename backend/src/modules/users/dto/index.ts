// src/modules/users/dto/update-profile.dto.ts
import { IsString, IsOptional, IsDateString, Matches, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date_of_birth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address_line1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address_city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address_state?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[0-9]{6}$/) address_pin?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['10L-25L','25L-50L','50L-1Cr','1Cr+']) annual_income_band?: string;
}

// src/modules/users/dto/submit-kyc.dto.ts
export class SubmitKYCDto {
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/i) pan: string;
  @IsOptional() @IsString() aadhaar_last4?: string;  // Store only last 4 digits
  @IsOptional() @IsString() bank_account_number?: string;
  @IsOptional() @IsString() bank_ifsc?: string;
}
