import {
  Controller, Post, Get, Delete, Param, Query, Body,
  UseGuards, Req, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor }    from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { StorageService }     from './storage.service';
import { JwtAuthGuard }       from '../auth/guards/jwt-auth.guard';
import { IsString, IsOptional } from 'class-validator';

class PresignUploadDto {
  @IsString() doc_type: string;
  @IsString() file_name: string;
  @IsString() mime_type: string;
  @IsOptional() @IsString() sme_id?: string;
}

@ApiTags('Storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Multipart upload (small files ≤10MB) */
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { doc_type: string; sme_id?: string },
    @Req() req: any,
  ) {
    return this.storage.uploadDocument(
      req.user.id, body.sme_id ?? null, body.doc_type,
      file.originalname, file.buffer, file.mimetype,
    );
  }

  /** Pre-signed URL for direct browser → S3 upload (large files) */
  @Post('presign')
  presign(@Body() dto: PresignUploadDto, @Req() req: any) {
    return this.storage.getSignedUploadUrl(
      req.user.id, dto.sme_id ?? null, dto.doc_type, dto.file_name, dto.mime_type
    );
  }

  /** Get time-limited download URL */
  @Get('download/:doc_id')
  download(@Param('doc_id') id: string, @Req() req: any) {
    return this.storage.getSignedDownloadUrl(id, req.user.id, req.user.kyc_status);
  }

  @Delete(':doc_id')
  remove(@Param('doc_id') id: string, @Req() req: any) {
    return this.storage.deleteDocument(id, req.user.id);
  }
}
