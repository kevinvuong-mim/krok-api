import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';
import { IStorageService } from '@/storage/interfaces/storage.interface';

@Injectable()
export class S3Service implements IStorageService, OnModuleInit {
  private region: string;
  private s3Client: S3Client;
  private bucketName: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const endpoint = this.configService.get<string>('AWS_ENDPOINT');
    const bucketName = this.configService.get<string>('AWS_BUCKET_NAME');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    // Validate all required environment variables
    if (!region || !endpoint || !bucketName) {
      throw new Error(
        'AWS_REGION, AWS_BUCKET_NAME, and AWS_ENDPOINT are required in environment variables.',
      );
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials are required. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables.',
      );
    }

    this.region = region;
    this.bucketName = bucketName;

    this.s3Client = new S3Client({
      region: this.region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      // Check if the bucket is accessible
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
    } catch (error) {
      this.logger.error(`Failed to access S3 bucket "${this.bucketName}"`);

      throw error;
    }
  }

  async upload(file: Buffer, key: string, mimetype: string): Promise<string> {
    // Validate key format
    if (!key || key.trim() === '') throw new Error('Storage key cannot be empty');

    if (key.includes('..')) throw new Error('Storage key cannot contain path traversal');

    try {
      const command = new PutObjectCommand({
        Key: key,
        Body: file,
        ContentType: mimetype,
        Bucket: this.bucketName,
      });

      await this.s3Client.send(command);

      // Return encoded storage key for database storage
      // The public URL will be constructed by UsersService.buildAvatarUrl() when needed
      const encodedKey = encodeURI(key);

      return encodedKey;
    } catch (error) {
      this.logger.error(
        `Failed to upload file to S3: ${error instanceof Error ? error.message : String(error)}`,
        {
          key,
          region: this.region,
          bucketName: this.bucketName,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Key: key,
        Bucket: this.bucketName,
      });

      await this.s3Client.send(command);
    } catch (error) {
      this.logger.warn(
        `Failed to delete file from S3: ${error instanceof Error ? error.message : String(error)}`,
        {
          key,
          region: this.region,
          bucketName: this.bucketName,
        },
      );
    }
  }
}
