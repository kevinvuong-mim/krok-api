import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';
import { IStorageService } from '@/storage/interfaces/storage.interface';

@Injectable()
export class LocalStorageService implements IStorageService, OnModuleInit {
  private uploadDir: string;
  private readonly logger = new Logger(LocalStorageService.name);

  constructor(private configService: ConfigService) {
    // Default to 'uploads' folder in the project root
    this.uploadDir =
      this.configService.get<string>('UPLOAD_DIR') || path.join(process.cwd(), 'uploads');
  }

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      // Ensure the upload directory exists
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
        this.logger.log(`Created upload directory: ${this.uploadDir}`);
      }

      // Verify write access
      const testFile = path.join(this.uploadDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      this.logger.log(`Local storage initialized at: ${this.uploadDir}`);
    } catch (error) {
      this.logger.error(`Failed to initialize local storage at "${this.uploadDir}"`);
      throw error;
    }
  }

  async upload(file: Buffer, key: string, _mimetype: string): Promise<string> {
    // Validate key format
    if (!key || key.trim() === '') throw new Error('Storage key cannot be empty');
    if (key.includes('..')) throw new Error('Storage key cannot contain path traversal');

    try {
      const filePath = path.join(this.uploadDir, key);
      const dir = path.dirname(filePath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, file);

      // Return the storage key (will be used to construct URL later)
      const encodedKey = encodeURI(key);
      return encodedKey;
    } catch (error) {
      this.logger.error(
        `Failed to upload file to local storage: ${error instanceof Error ? error.message : String(error)}`,
        {
          key,
          uploadDir: this.uploadDir,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const decodedKey = decodeURI(key);
      const filePath = path.join(this.uploadDir, decodedKey);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to delete file from local storage: ${error instanceof Error ? error.message : String(error)}`,
        {
          key,
          uploadDir: this.uploadDir,
        },
      );
    }
  }

  /**
   * Get the full file path for a storage key (for serving files)
   */
  getFilePath(key: string): string {
    const decodedKey = decodeURI(key);
    return path.join(this.uploadDir, decodedKey);
  }

  /**
   * Check if a file exists
   */
  exists(key: string): boolean {
    const decodedKey = decodeURI(key);
    const filePath = path.join(this.uploadDir, decodedKey);
    return fs.existsSync(filePath);
  }
}
