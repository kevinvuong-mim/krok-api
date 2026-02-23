import {
  Get,
  Put,
  Res,
  Body,
  Param,
  Query,
  Delete,
  HttpCode,
  UseGuards,
  Controller,
  HttpStatus,
  UploadedFile,
  ParseFilePipe,
  UseInterceptors,
  FileTypeValidator,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';

import { UsersService } from '@/users/users.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { FileSizeByTypeValidator } from '@/common/validators';
import { AUTH_CONSTANTS } from '@/auth/constants/auth.constants';
import { UpdateProfileDto } from '@/users/dto/update-profile.dto';
import { ChangePasswordDto } from '@/users/dto/change-password.dto';
import { CurrentUser, type UserPayload } from '@/common/decorators';
import { getPaginationParams } from '@/common/utils/pagination.util';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getCurrentUser(@CurrentUser() user: UserPayload) {
    // Return full profile with hasPassword and hasGoogleAuth flags
    return this.usersService.getCurrentUser(user.id);
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  updateProfile(@CurrentUser() user: UserPayload, @Body() updateProfileDto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, updateProfileDto);
  }

  @Put('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 uploads per hour
  updateAvatar(
    @CurrentUser() user: UserPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileSizeByTypeValidator({
            maxSizeByType: {
              'image/gif': 5 * 1024 * 1024, // 5MB for GIF
            },
            defaultMaxSize: 10 * 1024 * 1024, // 10MB for other image types
          }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.updateAvatar(user.id, file);
  }

  @Put('password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 requests per 1 hour
  async changePassword(
    @CurrentUser() user: UserPayload,
    @Res({ passthrough: true }) res: Response,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(
      user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    // Clear authentication cookies to force re-login after password change
    res.clearCookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY);
    res.clearCookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY);
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  getActiveSessions(
    @CurrentUser() user: UserPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const {
      skip,
      page: normalizedPage,
      limit: normalizedLimit,
    } = getPaginationParams(Number(page), Number(limit));

    return this.usersService.getActiveSessions(
      user.id,
      user.sessionId,
      normalizedPage,
      normalizedLimit,
      skip,
    );
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  async logoutAllDevices(
    @CurrentUser() user: UserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.usersService.logoutAllDevices(user.id);

    // Clear authentication cookies on current device
    res.clearCookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY);
    res.clearCookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY);
  }

  @HttpCode(HttpStatus.OK)
  @Delete('sessions/:sessionId')
  logoutDevice(@CurrentUser() user: UserPayload, @Param('sessionId') sessionId: string) {
    return this.usersService.logoutDevice(user.id, sessionId);
  }

  @Get(':identifier')
  @HttpCode(HttpStatus.OK)
  getUserByIdOrUsername(@Param('identifier') identifier: string) {
    return this.usersService.getUserByIdOrUsername(identifier);
  }
}
