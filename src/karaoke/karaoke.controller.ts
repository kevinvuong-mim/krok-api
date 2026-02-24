import { Get, Body, Post, Param, HttpCode, Controller, HttpStatus } from '@nestjs/common';

import { Public } from '@/common/decorators';
import { KaraokeService } from '@/karaoke/karaoke.service';
import { RequestKaraokeDto } from '@/karaoke/dto/request-karaoke.dto';

@Controller('karaoke')
export class KaraokeController {
  constructor(private readonly karaokeService: KaraokeService) {}

  @Public()
  @Post('request')
  @HttpCode(HttpStatus.OK)
  requestKaraoke(@Body() requestDto: RequestKaraokeDto) {
    return this.karaokeService.requestKaraoke(requestDto.videoId);
  }

  @Public()
  @Get('status/:jobId')
  @HttpCode(HttpStatus.OK)
  getJobStatus(@Param('jobId') jobId: string) {
    return this.karaokeService.getJobStatus(jobId);
  }
}
