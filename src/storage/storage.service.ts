import { Injectable } from '@nestjs/common';

import { S3Service } from '@/storage/providers/s3.service';
import { IStorageService } from '@/storage/interfaces/storage.interface';

@Injectable()
export class StorageService implements IStorageService {
  private provider: IStorageService;

  constructor(private s3Service: S3Service) {
    this.provider = this.s3Service;
  }

  async initialize(): Promise<void> {
    return this.provider.initialize();
  }

  async upload(file: Buffer, key: string, mimetype: string): Promise<string> {
    return this.provider.upload(file, key, mimetype);
  }

  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }
}
