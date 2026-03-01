interface IStorageService {
  initialize(): Promise<void>;

  upload(file: Buffer, key: string, mimetype: string): Promise<string>;

  delete(key: string): Promise<void>;

  getFilePath?(key: string): string;

  exists?(key: string): boolean;
}

export type { IStorageService };
