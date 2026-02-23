import { Module } from '@nestjs/common';

import { MailModule } from '@/mail/mail.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { VerificationService } from '@/verification/verification.service';
import { VerificationController } from '@/verification/verification.controller';

@Module({
  exports: [VerificationService],
  providers: [VerificationService],
  imports: [PrismaModule, MailModule],
  controllers: [VerificationController],
})
export class VerificationModule {}
