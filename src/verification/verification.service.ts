import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Logger, Injectable, BadRequestException } from '@nestjs/common';

import { MailService } from '@/mail/mail.service';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async verifyEmail(token: string) {
    // Find user with matching token that hasn't expired
    const users = await this.prisma.user.findMany({
      where: {
        isEmailVerified: false,
        verificationTokenExpiry: { gte: new Date() },
      },
    });

    // Check token against all unverified users
    let matchedUserId: string | null = null;
    for (const user of users) {
      if (user.verificationToken) {
        const isValid = await bcrypt.compare(token, user.verificationToken);

        if (isValid) {
          matchedUserId = user.id;
          break;
        }
      }
    }

    if (!matchedUserId) throw new BadRequestException('Invalid or expired verification token');

    // Update user as verified
    await this.prisma.user.update({
      where: { id: matchedUserId },
      data: {
        isEmailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });
  }

  async resendVerificationEmail(email: string, frontendUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) throw new BadRequestException('User not found');

    if (user.isEmailVerified) throw new BadRequestException('Email is already verified');

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(verificationToken, 10);

    // Token expires in 48 hours
    const verificationTokenExpiry = new Date();
    verificationTokenExpiry.setHours(verificationTokenExpiry.getHours() + 48);

    // Update user with new token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationTokenExpiry,
        verificationToken: hashedToken,
      },
    });

    // Send verification email
    await this.mailService.sendVerificationEmail(email, verificationToken, frontendUrl);
  }

  async forgotPassword(email: string, frontendUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Don't reveal if user exists or not (security best practice)
    // Only allow password reset for accounts that have password capability
    if (!user) {
      throw new BadRequestException(
        'If an account with that email exists, we sent a password reset link.',
      );
    }

    if (!user.password) {
      throw new BadRequestException(
        'If an account with that email exists, we sent a password reset link.',
      );
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Token expires in 1 hour (shorter than email verification for security)
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

    // Update user with reset token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: resetTokenExpiry,
      },
    });

    // Send password reset email
    try {
      await this.mailService.sendPasswordResetEmail(email, resetToken, frontendUrl);
    } catch (error) {
      // Log email sending errors without failing the password reset flow
      this.logger.error(
        'Failed to send password reset email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async resetPassword(token: string, newPassword: string) {
    // Find users with non-expired reset tokens
    const users = await this.prisma.user.findMany({
      where: {
        passwordResetToken: { not: null },
        passwordResetTokenExpiry: { gte: new Date() },
      },
    });

    // Check token against all users with active reset tokens
    let matchedUserId: string | null = null;
    for (const user of users) {
      if (user.passwordResetToken) {
        const isValid = await bcrypt.compare(token, user.passwordResetToken);

        if (isValid) {
          matchedUserId = user.id;
          break;
        }
      }
    }

    if (!matchedUserId) throw new BadRequestException('Invalid or expired reset token');

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password and clear reset token
    await this.prisma.user.update({
      where: { id: matchedUserId },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpiry: null,
      },
    });

    // Invalidate all existing sessions for security
    await this.prisma.session.deleteMany({ where: { userId: matchedUserId } });
  }
}
