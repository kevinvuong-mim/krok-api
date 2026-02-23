# Storage Module

Module quản lý lưu trữ file trên cloud storage (AWS S3 hoặc S3-compatible services).

## Tổng quan

Storage Module cung cấp một abstraction layer để upload và delete files trên cloud storage. Module được thiết kế theo pattern Strategy, cho phép dễ dàng thay đổi storage provider trong tương lai (S3, MinIO, DigitalOcean Spaces, etc.).

## Kiến trúc

```
src/storage/
├── interfaces/
│   └── storage.interface.ts      # Interface định nghĩa storage operations
├── providers/
│   └── s3.service.ts             # S3 implementation
├── storage.service.ts            # Main service (wrapper)
└── storage.module.ts             # Module definition
```

### Storage Interface

```typescript
export interface IStorageService {
  initialize(): Promise<void>;
  upload(file: Buffer, key: string, mimetype: string): Promise<string>;
  delete(key: string): Promise<void>;
}
```

## Storage Service

Service chính làm wrapper cho các storage providers.

### Constructor

```typescript
constructor(private s3Service: S3Service)
```

Hiện tại sử dụng S3Service làm provider mặc định.

### Methods

#### `initialize(): Promise<void>`

Khởi tạo kết nối với storage provider.

**Lưu ý:** Method này được gọi tự động khi service được inject vào các module khác.

#### `upload(file: Buffer, key: string, mimetype: string): Promise<string>`

Upload file lên storage.

**Parameters:**

- `file: Buffer` - File content dưới dạng buffer
- `key: string` - Storage key (path) của file (ví dụ: `general/avatars/user-id.webp`)
- `mimetype: string` - MIME type của file (ví dụ: `image/webp`, `image/jpeg`)

**Returns:** `Promise<string>` - Storage key (URI-encoded)

**Throws:**

- `Error` nếu key rỗng hoặc chứa path traversal (`..`)
- `Error` nếu upload thất bại

**Example:**

```typescript
const storageKey = await this.storage.upload(
  fileBuffer,
  'general/avatars/user-123.webp',
  'image/webp',
);
// Returns: "general/avatars/user-123.webp"
```

#### `delete(key: string): Promise<void>`

Xóa file khỏi storage.

**Parameters:**

- `key: string` - Storage key của file cần xóa

**Returns:** `Promise<void>`

**Lưu ý:**

- Method này không throw error nếu file không tồn tại
- Chỉ log warning nếu delete thất bại

**Example:**

```typescript
await this.storage.delete('general/avatars/user-123.webp');
```

## S3 Service

Implementation cụ thể cho AWS S3 và S3-compatible services.

### Environment Variables

```env
AWS_REGION="ap-southeast-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_BUCKET_NAME="mimkat-storage"
AWS_ENDPOINT="https://oss.s3.mimkat.vn"
```

**Required variables:**

- `AWS_REGION` - AWS region (ví dụ: `ap-southeast-1`, `us-east-1`)
- `AWS_ACCESS_KEY_ID` - Access key ID
- `AWS_SECRET_ACCESS_KEY` - Secret access key
- `AWS_BUCKET_NAME` - Tên bucket
- `AWS_ENDPOINT` - S3 endpoint URL

### Constructor

S3Service tự động validate tất cả environment variables khi khởi tạo:

```typescript
constructor(private configService: ConfigService)
```

**Throws:**

- `Error` nếu thiếu bất kỳ environment variable nào
- `Error` nếu thiếu credentials

### Initialization

```typescript
async initialize(): Promise<void>
```

Kiểm tra bucket có tồn tại và accessible không.

**Throws:**

- `Error` với message cụ thể nếu:
  - Bucket không tồn tại (`NoSuchBucket`)
  - Không có quyền truy cập (`Forbidden`)
  - Lỗi kết nối khác

**Logging:**

- Log error với message cụ thể nếu có lỗi (không log khi thành công)

### Upload Method

```typescript
async upload(file: Buffer, key: string, mimetype: string): Promise<string>
```

Upload file lên S3 bucket.

**Validation:**

- Key không được rỗng
- Key không được chứa `..` (path traversal protection)

**Returns:**

- URI-encoded storage key (không phải full URL)

**Example:**

```typescript
await s3Service.upload(buffer, 'general/avatars/user-123.webp', 'image/webp');
// Returns: "general/avatars/user-123.webp"
```

**Error Handling:**

- Log chi tiết error với key, bucket name, region, và stack trace
- Throw error ra ngoài để caller xử lý

### Delete Method

```typescript
async delete(key: string): Promise<void>
```

Xóa file khỏi S3 bucket.

**Behavior:**

- Không throw error nếu file không tồn tại
- Chỉ log warning nếu delete thất bại

**Example:**

```typescript
await s3Service.delete('general/avatars/user-123.webp');
```

## Configuration

### Path Style

Service sử dụng `forcePathStyle: true` để support S3-compatible services như MinIO, DigitalOcean Spaces.

```typescript
this.s3Client = new S3Client({
  region: this.region,
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true, // Support for S3-compatible services
});
```

### Bucket Structure

Recommended folder structure:

```
bucket-name/
├── general/
│   ├── avatars/
│   │   ├── user-id-1.webp
│   │   ├── user-id-2.webp
│   │   └── ...
│   └── uploads/
│       └── ...
└── temp/
    └── ...
```

**Lưu ý:** Tất cả avatars đều có extension `.webp` vì image processing module convert tất cả ảnh (bao gồm GIF) sang WebP.

## Usage

### Import Module

```typescript
import { StorageModule } from '@/storage/storage.module';

@Module({
  imports: [StorageModule],
  // ...
})
export class YourModule {}
```

### Inject Service

```typescript
import { StorageService } from '@/storage/storage.service';

@Injectable()
export class YourService {
  constructor(private storage: StorageService) {}

  async uploadFile(file: Express.Multer.File) {
    const key = `uploads/${Date.now()}-${file.originalname}`;
    const storageKey = await this.storage.upload(file.buffer, key, file.mimetype);

    // Build full URL
    const fullUrl = `${this.endpoint}/${this.bucketName}/${storageKey}`;
    return fullUrl;
  }

  async deleteFile(key: string) {
    await this.storage.delete(key);
  }
}
```

## Security

### Key Validation

Service tự động validate storage key để prevent path traversal attacks:

```typescript
if (!key || key.trim() === '') {
  throw new Error('Storage key cannot be empty');
}

if (key.includes('..')) {
  throw new Error('Storage key cannot contain path traversal');
}
```

### Credentials

- Không bao giờ hardcode credentials trong code
- Sử dụng environment variables
- Không commit credentials vào Git
- Sử dụng IAM roles khi deploy trên AWS

## Error Handling

### Upload Errors

```typescript
try {
  const key = await storage.upload(buffer, key, mimetype);
} catch (error) {
  // Handle upload error
  console.error('Failed to upload:', error.message);
}
```

### Delete Errors

Delete method không throw error, chỉ log warning:

```typescript
await storage.delete(key); // Safe to call, won't throw
```

## Best Practices

### 1. Sử dụng meaningful keys

```typescript
// Good
const key = `general/avatars/${userId}.webp`;
const key = `posts/${postId}/images/${imageId}.jpg`;

// Bad
const key = `${Math.random()}.jpg`;
const key = `file.jpg`;
```

### 2. Include file extension trong key

Vì tất cả ảnh đều được convert sang WebP, luôn dùng extension `.webp`:

```typescript
// Tất cả ảnh đều là WebP sau khi xử lý
const key = `general/avatars/${userId}.webp`;

// Hoặc nếu xử lý ảnh đã processed
const extension = 'webp'; // Always webp from image processing
const key = `general/avatars/${userId}.${extension}`;
```

### 3. Cleanup old files

Xóa file cũ khi upload file mới:

```typescript
// Upload new file
const newKey = await storage.upload(newFile, key, mimetype);

// Delete old file
if (oldKey && oldKey !== newKey) {
  await storage.delete(oldKey);
}
```

### 4. Handle upload failures

```typescript
try {
  const key = await storage.upload(buffer, key, mimetype);
  // Update database with new key
  await db.update({ avatar: key });
} catch (error) {
  // Rollback or retry
  throw new BadRequestException('Failed to upload file');
}
```

### 5. Rollback on database errors

```typescript
let uploadedKey: string;

try {
  // Upload file first
  uploadedKey = await storage.upload(buffer, key, mimetype);

  // Update database
  await db.update({ avatar: uploadedKey });
} catch (error) {
  // Rollback: delete uploaded file
  if (uploadedKey) {
    await storage.delete(uploadedKey);
  }
  throw error;
}
```

## Testing

### Mock Storage Service

```typescript
const mockStorage = {
  upload: jest.fn().mockResolvedValue('mock-key.webp'),
  delete: jest.fn().mockResolvedValue(undefined),
  initialize: jest.fn().mockResolvedValue(undefined),
};

// In test
const result = await service.uploadAvatar(userId, file);
expect(mockStorage.upload).toHaveBeenCalledWith(
  expect.any(Buffer),
  'general/avatars/user-123.webp',
  'image/webp',
);
```

## Troubleshooting

### 1. Bucket not accessible

**Error:** `S3 bucket "xxx" does not exist` hoặc `Access denied to bucket`

**Solutions:**

- Kiểm tra bucket name đúng chưa
- Verify AWS credentials có quyền truy cập bucket
- Check IAM permissions: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
- Kiểm tra bucket policy và CORS config

### 2. Connection timeout

**Error:** Connection timeout khi upload

**Solutions:**

- Check network connectivity
- Verify endpoint URL đúng
- Check firewall/security groups
- Tăng timeout trong S3Client config (nếu cần)

### 3. Path traversal error

**Error:** `Storage key cannot contain path traversal`

**Solutions:**

- Đừng sử dụng `..` trong key
- Sanitize user input trước khi dùng làm key
- Use safe path building methods

### 4. Invalid credentials

**Error:** `AWS credentials are required`

**Solutions:**

- Check `.env` file có đầy đủ credentials không
- Restart application sau khi update `.env`
- Verify credentials format (không có spaces, quotes)

## Future Enhancements

### Multiple Provider Support

Có thể extend để support nhiều providers:

```typescript
@Injectable()
export class StorageService {
  private provider: IStorageService;

  constructor(
    private configService: ConfigService,
    private s3Service: S3Service,
    // private minioService: MinioService,
    // private digitalOceanService: DOService,
  ) {
    const provider = this.configService.get('STORAGE_PROVIDER');

    switch (provider) {
      case 's3':
        this.provider = this.s3Service;
        break;
      // case 'minio':
      //   this.provider = this.minioService;
      //   break;
      default:
        this.provider = this.s3Service;
    }
  }
}
```

### CDN Integration

Thêm CDN URL cho faster delivery:

```typescript
buildPublicUrl(key: string): string {
  const cdnUrl = this.configService.get('CDN_URL');
  if (cdnUrl) {
    return `${cdnUrl}/${key}`;
  }
  return `${this.endpoint}/${this.bucketName}/${key}`;
}
```

## Related Documentation

- [Image Processing Module](./image-processing.md) - Xử lý ảnh trước khi upload
- [Update Avatar API](../apis/users/update-avatar.md) - API sử dụng storage module
- [Environment Variables](../setup/environment-variables.md) - Cấu hình AWS S3
