import { Logger, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Run every day at 2:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupUnverifiedAccounts() {
    this.logger.log('Starting cleanup of unverified accounts...');

    try {
      // Calculate date 14 days ago
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      // Delete unverified accounts older than 14 days
      const result = await this.prisma.user.deleteMany({
        where: {
          isEmailVerified: false,
          createdAt: { lt: fourteenDaysAgo },
        },
      });

      this.logger.log(
        `Cleanup completed. Deleted ${result.count} unverified accounts older than 14 days.`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup unverified accounts', error);
    }
  }

  // Run every day at 3:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredTokens() {
    this.logger.log('Starting cleanup of expired tokens...');

    try {
      // Clear expired verification tokens
      const verificationResult = await this.prisma.user.updateMany({
        data: {
          verificationToken: null,
          verificationTokenExpiry: null,
        },
        where: {
          isEmailVerified: false,
          verificationTokenExpiry: { lt: new Date() },
        },
      });

      // Clear expired password reset tokens
      const passwordResetResult = await this.prisma.user.updateMany({
        data: {
          passwordResetToken: null,
          passwordResetTokenExpiry: null,
        },
        where: {
          passwordResetTokenExpiry: { lt: new Date() },
        },
      });

      this.logger.log(
        `Cleanup completed. Cleared ${verificationResult.count} expired verification tokens and ${passwordResetResult.count} expired password reset tokens.`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error);
    }
  }

  // Run every hour
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions() {
    this.logger.log('Starting cleanup of expired sessions...');

    try {
      // Delete expired sessions
      const result = await this.prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      this.logger.log(`Cleanup completed. Deleted ${result.count} expired sessions.`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', error);
    }
  }
}
