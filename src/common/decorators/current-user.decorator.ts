import { Request } from 'express';
import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface UserPayload {
  id: string;
  sessionId: string;
}

declare module 'express' {
  interface Request {
    user?: UserPayload;
  }
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();

    return request.user;
  },
);
