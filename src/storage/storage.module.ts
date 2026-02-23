import { Module } from '@nestjs/common';

import { S3Service } from '@/storage/providers/s3.service';
import { StorageService } from '@/storage/storage.service';

@Module({
  exports: [StorageService],
  providers: [S3Service, StorageService],
})
export class StorageModule {}
