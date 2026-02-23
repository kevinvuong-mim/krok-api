import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      scope: ['email', 'profile'],
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || '',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || '',
    });
  }

  validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
    const { id, name, emails, photos } = profile;

    const user = {
      accessToken,
      googleId: id,
      refreshToken,
      email: emails[0].value,
      avatar: photos[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
    };

    done(null, user);
  }
}
