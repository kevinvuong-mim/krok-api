import { Get, Query, HttpCode, Controller, HttpStatus } from '@nestjs/common';

import { Public } from '@/common/decorators';
import { VideoService } from '@/video/video.service';
import { SearchVideoDto } from '@/video/dto/search-video.dto';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Public()
  @Get('search')
  @HttpCode(HttpStatus.OK)
  search(@Query() searchVideoDto: SearchVideoDto) {
    return this.videoService.search(searchVideoDto.query, searchVideoDto.continuation);
  }
}
