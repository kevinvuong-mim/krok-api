import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { KaraokeService } from '@/karaoke/karaoke.service';
import { KaraokeController } from '@/karaoke/karaoke.controller';

@Module({
  imports: [PrismaModule],
  providers: [KaraokeService],
  controllers: [KaraokeController],
})
export class KaraokeModule {}
