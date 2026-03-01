import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as mime from 'mime-types';

import { StorageService } from '@/storage/storage.service';
import { Public } from '@/common/decorators';

@Controller('files')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get('*path')
  getFile(@Param('path') filePath: string, @Res() res: Response) {
    // Validate path to prevent directory traversal
    if (!filePath || filePath.includes('..')) {
      throw new BadRequestException('Invalid file path');
    }

    // Check if file exists
    if (!this.storageService.exists(filePath)) {
      throw new NotFoundException('File not found');
    }

    const fullPath = this.storageService.getFilePath(filePath);

    // Get MIME type
    const mimeType = mime.lookup(fullPath) || 'application/octet-stream';

    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    // Stream the file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
  }
}
