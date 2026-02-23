import { AuthGuard } from '@nestjs/passport';
import { Injectable, ExecutionContext } from '@nestjs/common';

import { extractFrontendUrl } from '@/common/utils';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  override getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // Get redirect URL from query parameter (if provided) or extract from headers
    const redirectUrl = request.query.redirect_url || extractFrontendUrl(request);

    // Pass redirect URL as state parameter to Google OAuth
    return { state: redirectUrl };
  }
}
