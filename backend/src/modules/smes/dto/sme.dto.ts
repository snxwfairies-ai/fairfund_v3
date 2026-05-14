import {
  IsString, IsNumber, IsOptional, IsInt, IsUrl,
  Min, Max, MaxLength, IsEnum, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSMEListingDto {
  @ApiProperty()  @IsString()  @MaxLength(200) legal_name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pan?: string;
  @ApiProperty()  @IsString()  sector: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sub_sector?: string;
  @ApiProperty()  @IsString()  location_city: string;
  @ApiProperty()  @IsString()  location_state: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registered_address?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() website?: string;
  @ApiProperty()  @IsInt()     @Min(1900) @Max(2025) @Type(() => Number) founded_year: number;
  @ApiProperty()  @IsInt()     @Min(1) @Type(() => Number) team_size: number;

  // Deal terms
  @ApiProperty()  @IsString()  stage: string;
  @ApiProperty()  @IsEnum(['equity','debt','convertible']) instrument: string;
  @ApiProperty()  @IsNumber()  @Min(10000) @Type(() => Number) target_raise: number;
  @ApiProperty()  @IsNumber()  @Min(1000)  @Type(() => Number) min_investment: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) max_investment?: number;
  @ApiProperty()  @IsNumber()  @Min(1) @Type(() => Number) valuation_pre: number;
  @ApiProperty()  @IsNumber()  @Min(0) @Max(100) @Type(() => Number) expected_return_min: number;
  @ApiProperty()  @IsNumber()  @Min(0) @Max(100) @Type(() => Number) expected_return_max: number;
  @ApiProperty()  @IsInt()     @Min(1) @Max(120) @Type(() => Number) tenure_months: number;

  // Financials
  @ApiProperty()  @IsNumber()  @Min(0) @Type(() => Number) revenue_last_fy: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) ebitda_last_fy?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) revenue_growth_pct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) debt_equity_ratio?: number;

  // Content
  @ApiProperty()  @IsString()  @MaxLength(300) short_description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() long_description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() closing_date?: string;
}

export class UpdateSMEListingDto {
  @IsOptional() @IsString() short_description?: string;
  @IsOptional() @IsString() long_description?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) target_raise?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) min_investment?: number;
  @IsOptional() @IsDateString() closing_date?: string;
}
