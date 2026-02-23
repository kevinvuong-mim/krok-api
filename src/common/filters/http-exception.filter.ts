import {
  Catch,
  Logger,
  HttpStatus,
  ArgumentsHost,
  HttpException,
  ExceptionFilter,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ErrorResponse } from '@/common/interfaces';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const isDevelopment = process.env.NODE_ENV !== 'production';

    let validationErrors = undefined;
    let error = 'Internal Server Error';
    let message = 'Internal server error';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    // Handle HttpException
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        message = res.message || exception.message;
        error = res.error || exception.name;

        // Handle validation errors from class-validator
        if (Array.isArray(res.message)) {
          validationErrors = res.message;
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    // Log error for monitoring
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const errorResponse: ErrorResponse = {
      error,
      message,
      success: false,
      path: request.url,
      statusCode: status,
      timestamp: new Date().toISOString(),
    };

    if (validationErrors) errorResponse.errors = validationErrors;

    if (isDevelopment && exception instanceof Error) errorResponse.stack = exception.stack;

    response.status(status).json(errorResponse);
  }
}
