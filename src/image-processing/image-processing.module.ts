import { Module } from '@nestjs/common';

import { ImageProcessingService } from '@/image-processing/image-processing.service';

@Module({
  exports: [ImageProcessingService],
  providers: [ImageProcessingService],
})
export class ImageProcessingModule {}
