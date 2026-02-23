import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      // Use TLS/SSL: true for port 465 (implicit TLS), false for port 587/25 (STARTTLS)
      secure: false,
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(email: string, token: string, frontendUrl: string) {
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;

    try {
      await this.transporter.sendMail({
        to: email,
        subject: 'Verify Your Email Address',
        from: this.configService.get<string>('MAIL_FROM'),
        html: this.getVerificationEmailTemplate(verificationUrl),
      });
    } catch (error) {
      this.logger.error(
        'Failed to send verification email',
        error instanceof Error ? error.stack : String(error),
      );

      throw new Error('Failed to send verification email');
    }
  }

  async sendPasswordResetEmail(email: string, token: string, frontendUrl: string) {
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await this.transporter.sendMail({
        to: email,
        subject: 'Reset Your Password',
        from: this.configService.get<string>('MAIL_FROM'),
        html: this.getPasswordResetEmailTemplate(resetUrl),
      });
    } catch (error) {
      this.logger.error(
        'Failed to send password reset email',
        error instanceof Error ? error.stack : String(error),
      );

      throw new Error('Failed to send password reset email');
    }
  }

  private getVerificationEmailTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
          }
          .content {
            background-color: white;
            padding: 25px;
            border-radius: 6px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #2563eb;
            color: white !important;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            margin: 20px 0;
          }
          .button:hover {
            background-color: #1d4ed8;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            color: #666;
          }
          .warning {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin-top: 20px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Verification</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>Thank you for registering! Please verify your email address to complete your registration and access all features.</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb; font-size: 14px;">${verificationUrl}</p>
            <div class="warning">
              <strong>Note:</strong> This verification link will expire in 48 hours. If you didn't request this email, please ignore it.
            </div>
          </div>
          <div class="footer">
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #dc2626;
            margin: 0;
          }
          .content {
            background-color: white;
            padding: 25px;
            border-radius: 6px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #dc2626;
            color: white !important;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            margin: 20px 0;
          }
          .button:hover {
            background-color: #b91c1c;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            color: #666;
          }
          .warning {
            background-color: #fee2e2;
            border-left: 4px solid #dc2626;
            padding: 12px;
            margin-top: 20px;
            font-size: 14px;
          }
          .info {
            background-color: #dbeafe;
            border-left: 4px solid #2563eb;
            padding: 12px;
            margin-top: 20px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #dc2626; font-size: 14px;">${resetUrl}</p>
            <div class="info">
              <strong>Security Tips:</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Choose a strong password with at least 8 characters</li>
                <li>Include uppercase, lowercase letters and numbers</li>
                <li>Don't reuse passwords from other accounts</li>
              </ul>
            </div>
            <div class="warning">
              <strong>Important:</strong> This reset link will expire in 1 hour for security reasons. If you didn't request this password reset, please ignore this email and your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
