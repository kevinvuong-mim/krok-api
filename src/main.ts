import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { Logger, HttpException, ValidationPipe } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters';
import { ResponseInterceptor } from '@/common/interceptors';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Helmet - Security headers middleware
  app.use(
    helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
    }),
  );

  // Enable CORS - Support both Bearer token and cookies
  app.enableCors({
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(', ').filter(Boolean) : '*',
  });

  // Cookie parser middleware
  app.use(cookieParser());

  // Global validation pipe với whitelist để tránh mass assignment
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Auto transform types
      whitelist: true, // Strip properties không có decorator
      forbidNonWhitelisted: true, // Throw error nếu có property không mong muốn
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.flatMap((error) => {
          if (!error.constraints) return [];

          return Object.entries(error.constraints).map(([key, message]) => ({
            constraint: key,
            message: message,
            value: error.value,
            field: error.property,
          }));
        });

        const exception = new HttpException(
          {
            statusCode: 400,
            error: 'Bad Request',
            message: formattedErrors,
          },
          400,
        );

        return exception;
      },
    }),
  );

  // Global exception filter - Format all error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor - Format all success responses
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Compression - Enable response compression
  app.use(
    compression({
      level: 6, // Compression level (0-9)
      threshold: 1024, // Only compress response > 1KB
    }),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;

  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', err);
  process.exit(1);
});
