import { Module } from '@nestjs/common';

import { KrokService } from '@/krok/krok.service';
import { KrokController } from '@/krok/krok.controller';

@Module({
  providers: [KrokService],
  controllers: [KrokController],
})
export class KrokModule {}
