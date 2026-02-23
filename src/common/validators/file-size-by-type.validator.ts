import { FileValidator } from '@nestjs/common';

export interface FileSizeByTypeValidatorOptions {
  defaultMaxSize: number;
  maxSizeByType: {
    [mimeType: string]: number;
  };
}

export class FileSizeByTypeValidator extends FileValidator<FileSizeByTypeValidatorOptions> {
  constructor(protected override readonly validationOptions: FileSizeByTypeValidatorOptions) {
    super(validationOptions);
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;

    return file.size <= this.getMaxSizeForFile(file);
  }

  buildErrorMessage(file: Express.Multer.File): string {
    const maxSize = this.getMaxSizeForFile(file);
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

    return `File size (${fileSizeMB}MB) exceeds the maximum allowed size (${maxSizeMB}MB) for ${file.mimetype}`;
  }

  private getMaxSizeForFile(file: Express.Multer.File): number {
    const { maxSizeByType, defaultMaxSize } = this.validationOptions;

    // Check if there's a specific limit for this MIME type
    if (maxSizeByType[file.mimetype]) return maxSizeByType[file.mimetype];

    // Return default max size
    return defaultMaxSize;
  }
}
