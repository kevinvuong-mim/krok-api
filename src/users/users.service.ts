import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

import { createPaginatedData } from '@/common/utils';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { UpdateProfileDto } from '@/users/dto/update-profile.dto';
import { ImageProcessingService } from '@/image-processing/image-processing.service';

@Injectable()
export class UsersService {
  private readonly awsEndpoint: string;
  private readonly awsBucketName: string;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private configService: ConfigService,
    private imageProcessing: ImageProcessingService,
  ) {
    this.awsEndpoint = this.configService.get<string>('AWS_ENDPOINT') || '';
    this.awsBucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';
  }

  private buildAvatarUrl(avatarKey: string | null): string | null {
    if (!avatarKey) return null;

    // If avatar is already a full URL (legacy data from Google OAuth)
    if (/^https?:\/\//.test(avatarKey)) return avatarKey;

    return `${this.awsEndpoint}/${this.awsBucketName}/${avatarKey}`;
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        avatar: true,
        fullName: true,
        googleId: true,
        isActive: true,
        password: true,
        username: true,
        createdAt: true,
        updatedAt: true,
        phoneNumber: true,
        isEmailVerified: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      hasPassword: !!user.password,
      phoneNumber: user.phoneNumber,
      hasGoogleAuth: !!user.googleId,
      isEmailVerified: user.isEmailVerified,
      avatar: this.buildAvatarUrl(user.avatar),
    };
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatar: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const processedImage = await this.imageProcessing.processImage(file);

    // Generate storage key with correct extension based on mimetype
    const storageKey = `general/avatars/${userId}.webp`;

    // Upload to storage and return encoded key
    const avatarKey = await this.storage
      .upload(processedImage.buffer, storageKey, processedImage.mimetype)
      .catch(() => {
        throw new BadRequestException('Failed to upload avatar');
      });

    // Update database with new avatar key
    const updatedUser = await this.prisma.user.updateMany({
      where: { id: userId, avatar: user.avatar },
      data: { avatar: avatarKey },
    });

    if (storageKey !== user.avatar) {
      // Check for race condition: if count is 0, another request already updated the avatar
      if (updatedUser.count === 0) {
        await this.storage.delete(storageKey);

        throw new ConflictException('Failed to update avatar. Please try again');
      } else {
        // Delete old avatar from storage if it's not a full URL (legacy data from Google OAuth)
        if (user.avatar && !/^https?:\/\//.test(user.avatar)) {
          await this.storage.delete(user.avatar);
        }
      }
    }
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');

    // Check if username is being updated and if it's already taken
    if (updateProfileDto.username && updateProfileDto.username !== user.username) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: updateProfileDto.username },
      });

      if (existingUser) throw new ConflictException('Username is already taken');
    }

    // Update user profile
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(updateProfileDto.username !== undefined && {
          username: updateProfileDto.username,
        }),
        ...(updateProfileDto.fullName !== undefined && {
          fullName: updateProfileDto.fullName,
        }),
        ...(updateProfileDto.phoneNumber !== undefined && {
          phoneNumber: updateProfileDto.phoneNumber,
        }),
      },
    });
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');

    // If user has a password (traditional account or Google account with password set)
    if (user.password) {
      // Current password is required when user already has a password
      if (!currentPassword) {
        throw new BadRequestException('Current password is required to change password');
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isPasswordValid) throw new BadRequestException('Current password is incorrect');
    }
    // If user doesn't have a password (Google-only account), allow setting password without current password

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidate all existing sessions for security
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async getActiveSessions(
    userId: string,
    currentSessionId?: string,
    page: number = 1,
    limit: number = 10,
    skip: number = 0,
  ) {
    const where = {
      userId,
      expiresAt: { gte: new Date() },
    };

    const [sessions, total] = await Promise.all([
      this.prisma.session.findMany({
        skip,
        where,
        take: limit,
        orderBy: { lastUsedAt: 'desc' },
      }),
      this.prisma.session.count({ where }),
    ]);

    const sessionDtos = sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      ipAddress: session.ipAddress || 'Unknown',
      deviceName: session.deviceName || 'Unknown',
      deviceType: session.deviceType || 'Unknown',
      isCurrent: currentSessionId ? session.id === currentSessionId : false,
    }));

    return createPaginatedData(sessionDtos, total, page, limit);
  }

  async logoutAllDevices(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async logoutDevice(userId: string, sessionId: string) {
    const token = await this.prisma.session.findFirst({
      where: {
        userId,
        id: sessionId,
      },
    });

    if (!token) throw new BadRequestException('Session not found');

    await this.prisma.session.delete({ where: { id: sessionId } });
  }

  async getUserByIdOrUsername(identifier: string) {
    // Find user by ID or username (flexible identifier)
    // Only return active users for security
    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ id: identifier }, { username: identifier }],
      },
      select: {
        id: true,
        avatar: true,
        fullName: true,
        username: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      createdAt: user.createdAt,
      avatar: this.buildAvatarUrl(user.avatar),
    };
  }
}
