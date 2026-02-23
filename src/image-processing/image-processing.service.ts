import sharp from 'sharp';
import { Logger, Injectable, BadRequestException } from '@nestjs/common';

export interface ProcessedImage {
  size: number;
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class ImageProcessingService {
  private readonly QUALITY = 80;
  private readonly MAX_DIMENSION = 1024;
  private readonly logger = new Logger(ImageProcessingService.name);
  private readonly ALLOWED_MIMETYPES = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'];

  async processImage(file: Express.Multer.File): Promise<ProcessedImage> {
    // Validate mimetype
    if (!this.ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPG, PNG, WebP, and GIF are allowed.');
    }

    try {
      // Get metadata from first frame only (without animated flag)
      const metadata = await sharp(file.buffer).metadata();

      // Validate image dimensions
      if (metadata.width < 50 || metadata.height < 50) {
        throw new BadRequestException('Image too small. Minimum dimensions: 50x50 pixels.');
      }

      // Validate aspect ratio (prevent banner-like images)
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio > 5 || aspectRatio < 0.2) {
        throw new BadRequestException(
          'Invalid aspect ratio. Image dimensions must be between 1:5 and 5:1.',
        );
      }

      // Process all images to WebP (including animated GIFs)
      // Create Sharp instance with animated support for processing
      const sharpInstance = sharp(file.buffer, { animated: true });
      let processedBuffer: Buffer;

      if (metadata.width > this.MAX_DIMENSION || metadata.height > this.MAX_DIMENSION) {
        processedBuffer = await sharpInstance
          .resize(this.MAX_DIMENSION, this.MAX_DIMENSION, {
            fit: 'inside', // Maintain aspect ratio
            withoutEnlargement: true,
          })
          .webp({ quality: this.QUALITY })
          .toBuffer();
      } else {
        // Just convert to WebP and optimize
        processedBuffer = await sharpInstance.webp({ quality: this.QUALITY }).toBuffer();
      }

      return {
        mimetype: 'image/webp',
        buffer: processedBuffer,
        size: processedBuffer.length,
      };
    } catch (error) {
      // Handle out-of-memory errors specifically
      if (
        error instanceof Error &&
        (error.message?.includes('memory') || error.message?.includes('allocation'))
      ) {
        this.logger.error('Out of memory while processing image', error);
        throw new BadRequestException('Image is too large to process. Please use a smaller file.');
      }

      // Re-throw BadRequestException as-is
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle unexpected errors (corrupt file, unsupported format, Sharp processing errors)
      this.logger.error('Failed to process image', error);
      throw new BadRequestException('Failed to process image. File may be corrupted.');
    }
  }
}
