import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CleanupService } from '@/tasks/cleanup.service';

@Module({
  providers: [CleanupService],
  imports: [ScheduleModule.forRoot()],
})
export class TasksModule {}
