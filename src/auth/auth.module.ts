import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '@/mail/mail.module';
import { AuthService } from '@/auth/auth.service';
import { AuthController } from '@/auth/auth.controller';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { GoogleStrategy } from '@/auth/strategies/google.strategy';

@Module({
  exports: [JwtAuthGuard],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, GoogleStrategy],
  imports: [MailModule, ConfigModule, PassportModule, JwtModule.register({})],
})
export class AuthModule {}
