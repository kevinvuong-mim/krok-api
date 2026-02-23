import { Module } from '@nestjs/common';

import { VideoService } from '@/video/video.service';
import { VideoController } from '@/video/video.controller';

@Module({
  providers: [VideoService],
  controllers: [VideoController],
})
export class VideoModule {}
