import { Module } from '@nestjs/common';

import { LocalStorageService } from '@/storage/providers/local.service';
import { StorageService } from '@/storage/storage.service';
import { StorageController } from '@/storage/storage.controller';

@Module({
  controllers: [StorageController],
  exports: [StorageService],
  providers: [LocalStorageService, StorageService],
})
export class StorageModule {}
