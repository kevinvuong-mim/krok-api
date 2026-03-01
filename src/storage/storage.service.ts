import { Injectable } from '@nestjs/common';

import { LocalStorageService } from '@/storage/providers/local.service';
import { IStorageService } from '@/storage/interfaces/storage.interface';

@Injectable()
export class StorageService implements IStorageService {
  private provider: LocalStorageService;

  constructor(private localStorageService: LocalStorageService) {
    this.provider = this.localStorageService;
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

  getFilePath(key: string): string {
    return this.provider.getFilePath(key);
  }

  exists(key: string): boolean {
    return this.provider.exists(key);
  }
}
