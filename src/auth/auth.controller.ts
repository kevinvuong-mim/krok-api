import {
  Get,
  Req,
  Res,
  Body,
  Post,
  HttpCode,
  UseGuards,
  Controller,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { LoginDto } from '@/auth/dto/login.dto';
import { AuthService } from '@/auth/auth.service';
import { RegisterDto } from '@/auth/dto/register.dto';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RefreshTokenDto } from '@/auth/dto/refresh-token.dto';
import { DeviceUtil, extractFrontendUrl } from '@/common/utils';
import { GoogleAuthGuard } from '@/auth/guards/google-auth.guard';
import { Public, CurrentUser, type UserPayload } from '@/common/decorators';
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 requests per 15 minutes
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    const frontendUrl = extractFrontendUrl(req);

    return this.authService.register(registerDto, frontendUrl);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 requests per 15 minutes
  async login(
    @Req() req: Request,
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = DeviceUtil.extractDeviceInfo(req);
    const result = await this.authService.login(loginDto, deviceInfo);

    // Set access token in httpOnly cookie
    res.cookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRATION, // 1 hour
    });

    // Set refresh token in httpOnly cookie
    res.cookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY, result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRATION, // 7 days
    });

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @CurrentUser() user: UserPayload,
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Get refresh token from cookie if not provided in body
    const refreshToken = refreshTokenDto.refreshToken || req.cookies?.refreshToken;

    await this.authService.logout(user.id, refreshToken);

    // Clear authentication cookies after logout
    res.clearCookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY);
    res.clearCookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Req() req: Request,
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const deviceInfo = DeviceUtil.extractDeviceInfo(req);

      // Get refresh token from cookie if not provided in body
      const refreshToken = refreshTokenDto.refreshToken || req.cookies?.refreshToken;

      const result = await this.authService.refreshTokens(refreshToken, deviceInfo);

      // Set new access token in httpOnly cookie
      res.cookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY, result.accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRATION, // 1 hour
      });

      // Set new refresh token in httpOnly cookie
      res.cookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY, result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRATION, // 7 days
      });

      return result;
    } catch (error) {
      // Clear invalid cookies on refresh token error
      res.clearCookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY);
      res.clearCookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY);

      throw error; // Re-throw để NestJS handle
    }
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // This route initiates the Google OAuth flow
    // User will be redirected to Google's login page
    // GoogleAuthGuard will automatically handle state parameter
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    // After Google authentication, this callback is triggered
    const deviceInfo = DeviceUtil.extractDeviceInfo(req);

    const result = await this.authService.googleLogin(req.user as any, deviceInfo);

    // Set access token in httpOnly cookie
    res.cookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRATION, // 1 hour
    });

    // Set refresh token in httpOnly cookie
    res.cookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY, result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRATION, // 7 days
    });

    // Get the redirect URL from state parameter (returned by Google OAuth flow)
    const redirectUrl = req.query.state as string;

    res.redirect(redirectUrl);
  }
}
