import { Module } from '@nestjs/common';

import { UsersService } from '@/users/users.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { StorageModule } from '@/storage/storage.module';
import { UsersController } from '@/users/users.controller';
import { ImageProcessingModule } from '@/image-processing/image-processing.module';

@Module({
  exports: [UsersService],
  providers: [UsersService],
  controllers: [UsersController],
  imports: [PrismaModule, StorageModule, ImageProcessingModule],
})
export class UsersModule {}
