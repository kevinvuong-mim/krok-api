# Image Processing Module

Module xử lý và tối ưu hóa ảnh trước khi upload lên storage.

## Tổng quan

Image Processing Module sử dụng thư viện [Sharp](https://sharp.pixelplumbing.com/) để:

- Validate định dạng và kích thước ảnh
- Resize ảnh về kích thước tối đa
- Convert ảnh sang định dạng WebP (tối ưu dung lượng)
- Preserve animation cho GIF files
- Compress ảnh với quality tối ưu

## Kiến trúc

```
src/image-processing/
├── image-processing.service.ts   # Service xử lý ảnh
└── image-processing.module.ts    # Module definition
```

## Image Processing Service

### Configuration Constants

```typescript
private readonly MAX_DIMENSION = 1024;      // Max width/height
private readonly QUALITY = 80;              // WebP quality (0-100)
private readonly ALLOWED_MIMETYPES = [
  'image/gif',
  'image/png',
  'image/jpeg',
  'image/webp',
];
```

### Interface: ProcessedImage

```typescript
export interface ProcessedImage {
  size: number; // Final file size in bytes
  buffer: Buffer; // Processed image buffer
  mimetype: string; // Output mimetype (always image/webp)
}
```

## Method: processImage()

```typescript
async processImage(file: Express.Multer.File): Promise<ProcessedImage>
```

Xử lý và tối ưu hóa ảnh upload.

### Parameters

- `file: Express.Multer.File` - File upload từ multer

**File properties:**

- `file.buffer: Buffer` - Raw file content
- `file.mimetype: string` - Original MIME type
- `file.size: number` - Original file size
- `file.originalname: string` - Original filename

### Returns

`Promise<ProcessedImage>` - Object chứa processed image:

- `buffer: Buffer` - Ảnh đã xử lý
- `mimetype: string` - Luôn là `image/webp`
- `size: number` - Kích thước file sau xử lý (bytes)

### Validation Rules

#### 1. MIME Type Validation

Chỉ chấp nhận:

- `image/gif` (GIF)
- `image/png` (PNG)
- `image/jpeg` (JPG, JPEG)
- `image/webp` (WebP)

**Error:** `BadRequestException` - "Invalid file type. Only JPG, PNG, WebP, and GIF are allowed."

#### 2. Minimum Dimensions

Ảnh phải có kích thước tối thiểu: **50x50 pixels**

**Error:** `BadRequestException` - "Image too small. Minimum dimensions: 50x50 pixels."

#### 3. Aspect Ratio Validation

Tỷ lệ khung hình (width/height) phải trong khoảng **1:5 đến 5:1**

**Prevents:**

- Banner-like images (quá ngang)
- Vertical strips (quá dọc)

**Error:** `BadRequestException` - "Invalid aspect ratio. Image dimensions must be between 1:5 and 5:1."

**Examples:**

- ✅ Valid: 1000x1000 (1:1), 1000x500 (2:1), 500x1000 (1:2)
- ✅ Valid: 1000x200 (5:1), 200x1000 (1:5)
- ❌ Invalid: 1000x100 (10:1), 100x1000 (1:10)

### Processing Logic

#### All Images (Bao gồm Animated GIFs)

**Tất cả ảnh đều được convert sang WebP** để tối ưu dung lượng, bao gồm cả GIF animated:

```typescript
// Get metadata from first frame only (without animated flag)
const metadata = await sharp(file.buffer).metadata();

// Create Sharp instance with animated support for processing
const sharpInstance = sharp(file.buffer, { animated: true });
```

**Lý do tạo 2 instances:**

1. **Instance không có `animated: true`**: Để lấy metadata chính xác (width/height của frame đầu tiên)
2. **Instance với `animated: true`**: Để xử lý và preserve animation khi convert

**WebP với animation:**

WebP hỗ trợ animation tương tự GIF, nhưng với dung lượng nhỏ hơn đáng kể (~30-50% so với GIF gốc).

```typescript
// Resize if needed
if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
  processedBuffer = await sharpInstance
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside', // Maintain aspect ratio
      withoutEnlargement: true, // Don't upscale small images
    })
    .webp({ quality: 80 })
    .toBuffer();
} else {
  // Just convert to WebP and optimize
  processedBuffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
}

return {
  mimetype: 'image/webp',
  buffer: processedBuffer,
  size: processedBuffer.length,
};
```

**Behavior:**

- Convert **TẤT CẢ** JPG, PNG, WebP, GIF → WebP
- **Preserve animation** cho GIF animated (Sharp tự động giữ animation khi có `animated: true`)
- Resize nếu vượt quá MAX_DIMENSION (1024px)
- Maintain aspect ratio (không làm méo ảnh)
- Không upscale ảnh nhỏ hơn MAX_DIMENSION
- Compress với quality = 80

**Animation Preservation:**

- Khi Sharp được khởi tạo với `{ animated: true }`, nó sẽ xử lý tất cả frames của GIF
- Resize sẽ apply cho từng frame
- Convert sang WebP sẽ giữ nguyên animation và timing giữa các frame
- WebP animated có dung lượng nhỏ hơn GIF gốc khoảng ~30-50%
- Output cuối cùng luôn là `image/webp`, không còn `image/gif`

### Resize Options

```typescript
.resize(MAX_DIMENSION, MAX_DIMENSION, {
  fit: 'inside',              // Fit within box, maintain aspect ratio
  withoutEnlargement: true,   // Don't make small images larger
})
```

**Fit modes:**

- `inside`: Ảnh sẽ fit trong box 1024x1024, giữ nguyên tỷ lệ
- Ảnh 2000x1000 → resize thành 1024x512
- Ảnh 1000x2000 → resize thành 512x1024
- Ảnh 500x500 → giữ nguyên 500x500

### Error Handling

#### Out of Memory Errors

```typescript
if (error.message?.includes('memory') || error.message?.includes('allocation')) {
  throw new BadRequestException('Image is too large to process. Please use a smaller file.');
}
```

**Khi nào xảy ra:**

- File quá lớn (> 50MB)
- Dimensions quá lớn (> 10000px)
- Server không đủ RAM

**Solution:** Reject file và yêu cầu user upload file nhỏ hơn

#### Invalid/Corrupted Files

```typescript
throw new BadRequestException('Failed to process image. File may be corrupted.');
```

**Khi nào xảy ra:**

- File bị corrupt
- File không phải ảnh (mặc dù có mimetype đúng)
- Format không support bởi Sharp

## Usage Examples

### Example 1: Basic Usage

```typescript
import { ImageProcessingService } from '@/image-processing/image-processing.service';

@Injectable()
export class AvatarService {
  constructor(private imageProcessing: ImageProcessingService) {}

  async uploadAvatar(file: Express.Multer.File) {
    // Process image
    const processedImage = await this.imageProcessing.processImage(file);

    console.log('Original:', file.size, 'bytes');
    console.log('Processed:', processedImage.size, 'bytes');
    console.log(
      'Savings:',
      (((file.size - processedImage.size) / file.size) * 100).toFixed(1),
      '%',
    );

    // Upload to storage
    const key = await storage.upload(
      processedImage.buffer,
      `avatars/${userId}.webp`,
      processedImage.mimetype,
    );

    return key;
  }
}
```

### Example 2: Handle Different File Types

```typescript
async processAndUpload(file: Express.Multer.File, userId: string) {
  // Process image - TẤT CẢ các loại ảnh đều convert sang WebP
  const processed = await this.imageProcessing.processImage(file);

  // Output luôn là WebP
  const key = `avatars/${userId}.webp`;

  // Upload
  return await this.storage.upload(
    processed.buffer,
    key,
    processed.mimetype  // Luôn là 'image/webp'
  );
}
```

### Example 3: With Error Handling

```typescript
async handleImageUpload(file: Express.Multer.File) {
  try {
    const processed = await this.imageProcessing.processImage(file);

    // Success - upload to storage
    return await this.uploadToStorage(processed);

  } catch (error) {
    if (error instanceof BadRequestException) {
      // Validation error - inform user
      throw error;
    } else {
      // Unexpected error - log and throw generic error
      this.logger.error('Image processing failed', error);
      throw new InternalServerErrorException(
        'Failed to process image. Please try again.'
      );
    }
  }
}
```

## Performance Considerations

### Memory Management

Sharp được thiết kế để:

- Reuse instances khi có thể
- Auto cleanup memory
- Stream processing cho large files

```typescript
// Good: Reuse instance
const sharpInstance = sharp(file.buffer);
const metadata = await sharpInstance.metadata();
const processed = await sharpInstance.resize(...).webp().toBuffer();

// Bad: Multiple instances
const metadata = await sharp(file.buffer).metadata();
const processed = await sharp(file.buffer).resize(...).toBuffer();
```

### Compression Savings

Typical compression ratios (all convert to WebP):

| Original Format | Original Size | WebP Size | Savings |
| --------------- | ------------- | --------- | ------- |
| PNG 5000x5000   | 8.5 MB        | 850 KB    | ~90%    |
| JPG 4000x3000   | 3.2 MB        | 420 KB    | ~87%    |
| PNG 2000x2000   | 2.1 MB        | 280 KB    | ~87%    |
| GIF animated    | 1.5 MB        | 750 KB    | ~50%    |
| GIF static      | 500 KB        | 150 KB    | ~70%    |

**Lưu ý:**

- Tất cả file (bao gồm GIF) đều convert sang WebP
- GIF animated → WebP animated: giảm ~30-50% dung lượng, vẫn giữ animation
- GIF static → WebP: giảm ~70% dung lượng

## Configuration

### Adjust Quality

Thay đổi quality trong service:

```typescript
private readonly QUALITY = 80;  // 0-100
```

**Trade-offs:**

- Quality 60-70: Smaller files, visible artifacts
- Quality 80 (current): Good balance
- Quality 90-100: Larger files, minimal quality improvement

### Adjust Max Dimensions

Thay đổi max dimensions:

```typescript
private readonly MAX_DIMENSION = 1024;  // pixels
```

**Recommendations:**

- Avatar: 512-1024px
- Profile cover: 1920px
- Thumbnails: 256-512px

### Add More Formats

Thêm format khác:

```typescript
private readonly ALLOWED_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',  // Add SVG
  'image/bmp',      // Add BMP
];
```

**Lưu ý:** Kiểm tra Sharp có support format đó không

## Testing

### Mock Service

```typescript
const mockImageProcessing = {
  processImage: jest.fn().mockResolvedValue({
    buffer: Buffer.from('mock-image'),
    mimetype: 'image/webp',
    size: 1024,
  }),
};
```

### Test Cases

```typescript
describe('ImageProcessingService', () => {
  it('should convert JPG to WebP', async () => {
    const result = await service.processImage(jpgFile);
    expect(result.mimetype).toBe('image/webp');
    expect(result.size).toBeLessThan(jpgFile.size);
  });

  it('should convert GIF to WebP and preserve animation', async () => {
    const result = await service.processImage(gifFile);
    expect(result.mimetype).toBe('image/webp');
    expect(result.size).toBeLessThan(gifFile.size);
  });

  it('should reject small images', async () => {
    await expect(service.processImage(tinyImage)).rejects.toThrow('Image too small');
  });

  it('should reject invalid aspect ratio', async () => {
    await expect(service.processImage(bannerImage)).rejects.toThrow('Invalid aspect ratio');
  });
});
```

## Troubleshooting

### 1. Sharp installation issues

**Error:** `Cannot find module 'sharp'` hoặc `sharp installation failed`

**Solutions:**

```bash
# Reinstall sharp
npm uninstall sharp
npm install sharp

# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# For specific platform
npm install --platform=linux --arch=x64 sharp
```

### 2. Out of memory errors

**Error:** `Image is too large to process`

**Solutions:**

- Limit upload file size (10MB in controller)
- Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`
- Use Sharp streams for very large files

### 3. Slow processing

**Symptoms:** Image processing takes too long

**Solutions:**

- Reduce QUALITY setting (80 → 70)
- Reduce MAX_DIMENSION (1024 → 512)
- Use Sharp caching
- Process in background queue (Bull/BullMQ)

### 4. Invalid file type error

**Error:** `Invalid file type. Only JPG, PNG, WebP, and GIF are allowed`

**Solutions:**

- Client đang gửi sai mimetype
- File extension không match content
- Validate trên client trước khi upload

## Best Practices

### 1. Validate before processing

```typescript
// In controller
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async upload(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
        new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/ }),
      ],
    }),
  )
  file: Express.Multer.File,
) {
  return await this.imageProcessing.processImage(file);
}
```

### 2. Log processing stats

```typescript
const startSize = file.size;
const processed = await this.imageProcessing.processImage(file);
const savings = (((startSize - processed.size) / startSize) * 100).toFixed(1);

this.logger.log(`Image processed: ${startSize} → ${processed.size} bytes (${savings}% saved)`);
```

### 3. Handle errors gracefully

```typescript
try {
  const processed = await this.imageProcessing.processImage(file);
  return processed;
} catch (error) {
  if (error instanceof BadRequestException) {
    // User error - show friendly message
    throw error;
  } else {
    // Server error - log and show generic message
    this.logger.error('Processing failed', error);
    throw new InternalServerErrorException('Failed to process image');
  }
}
```

### 4. Don't process twice

```typescript
// Bad: Processing ảnh nhiều lần
const processed1 = await imageProcessing.processImage(file);
const processed2 = await imageProcessing.processImage(processed1); // ❌

// Good: Process một lần rồi reuse
const processed = await imageProcessing.processImage(file);
await storage.upload(processed.buffer, key1, processed.mimetype);
await storage.upload(processed.buffer, key2, processed.mimetype); // ✅
```

## Related Documentation

- [Storage Module](./storage.md) - Upload processed images to S3
- [Update Avatar API](../apis/users/update-avatar.md) - API endpoint using this module
- [Sharp Documentation](https://sharp.pixelplumbing.com/) - Official Sharp docs
