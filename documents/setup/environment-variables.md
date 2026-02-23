# Hướng dẫn lấy các biến môi trường

Tài liệu này hướng dẫn cách lấy các biến môi trường cần thiết cho dự án mimkat-api.

## 1. Google OAuth

### GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET

**Bước 1: Truy cập Google Cloud Console**

- Truy cập [Google Cloud Console](https://console.cloud.google.com/)
- Đăng nhập bằng tài khoản Google của bạn

**Bước 2: Tạo hoặc chọn Project**

- Nếu chưa có project, tạo project mới bằng cách click vào dropdown project ở góc trên bên trái và chọn "New Project"
- Nhập tên project và click "Create"
- Nếu đã có project, chọn project đó

**Bước 3: Tạo OAuth 2.0 Credentials**

- Vào menu "APIs & Services" > "Credentials"
- Click "Create Credentials" > "OAuth client ID"
- Nếu chưa có OAuth consent screen, bạn sẽ được yêu cầu cấu hình:
  - Chọn "External" user type (hoặc "Internal" nếu dùng Google Workspace)
  - Điền thông tin ứng dụng (tên, email hỗ trợ, v.v.)
  - Thêm scopes cần thiết (email, profile, openid)
  - Thêm test users nếu ứng dụng đang ở chế độ testing
  - Click "Save and Continue"

**Bước 4: Cấu hình OAuth Client**

- Chọn "Application type" là "Web application"
- Nhập tên cho OAuth client
- Thêm "Authorized JavaScript origins":
  - `http://localhost:3000` (cho development)
  - Domain production của bạn
- Thêm "Authorized redirect URIs":
  - `http://localhost:3000/auth/google/callback` (cho development)
  - URL production callback của bạn
- Click "Create"

**Bước 5: Lấy credentials**

- Sau khi tạo xong, một popup sẽ hiển thị với:
  - **Client ID** → Sao chép và dán vào `GOOGLE_CLIENT_ID`
  - **Client Secret** → Sao chép và dán vào `GOOGLE_CLIENT_SECRET`
- Bạn cũng có thể xem lại credentials này bất cứ lúc nào trong "Credentials" tab

### GOOGLE_CALLBACK_URL

Đây là URL mà Google OAuth sẽ redirect người dùng về sau khi xác thực thành công.

**Format:**

```
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Lưu ý:**

- Đối với môi trường development: `http://localhost:3000/auth/google/callback`
- Đối với môi trường production: `https://yourdomain.com/auth/google/callback`
- URL này phải khớp với "Authorized redirect URIs" đã cấu hình trong Google Cloud Console

---

## 2. Database

### DATABASE_URL

Đây là connection string để kết nối tới PostgreSQL database.

**Format:**

```
DATABASE_URL="postgresql://username:password@host:port/database_name"
```

**Các thành phần:**

- `username`: Tên user PostgreSQL (mặc định: `postgres`)
- `password`: Mật khẩu của user
- `host`: Địa chỉ server database (mặc định: `localhost`)
- `port`: Cổng PostgreSQL (mặc định: `5432`)
- `database_name`: Tên database (ví dụ: `mimkat`)

**Ví dụ:**

```
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/mimkat"
```

---

## 3. JWT (JSON Web Token)

### JWT_SECRET

Secret key để ký và xác thực access token.

**Cách tạo:**

**Sử dụng OpenSSL:**

```bash
openssl rand -base64 32
```

**Sử dụng Node.js:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Sử dụng online generator:**

- Truy cập [https://randomkeygen.com/](https://randomkeygen.com/)
- Sao chép một trong các CodeIgniter Encryption Keys hoặc 256-bit WPA Key

**Ví dụ:**

```
JWT_SECRET="aB3$xY9#mK8@pL2&nQ7*rT5%vW1!zD4^"
```

**Lưu ý:**

- Phải là chuỗi ngẫu nhiên, dài ít nhất 32 ký tự
- Không chia sẻ secret này với bất kỳ ai
- Sử dụng secret khác nhau cho mỗi môi trường (dev, staging, production)

### JWT_REFRESH_SECRET

Secret key để ký và xác thực refresh token.

**Cách tạo:** Tương tự như JWT_SECRET, nhưng phải khác với JWT_SECRET

```bash
openssl rand -base64 32
```

**Ví dụ:**

```
JWT_REFRESH_SECRET="cD6%eF4*gH2@iJ8#kL1&mN9$oP3!qR7^"
```

**Lưu ý:**

- Phải khác với JWT_SECRET
- Không bao giờ sử dụng cùng một secret cho cả access token và refresh token

---

## 4. Email Configuration

### MAIL_HOST

SMTP server host để gửi email.

**Các SMTP host phổ biến:**

- Gmail: `smtp.gmail.com`
- Outlook/Hotmail: `smtp-mail.outlook.com`
- Yahoo: `smtp.mail.yahoo.com`
- SendGrid: `smtp.sendgrid.net`
- Mailgun: `smtp.mailgun.org`

**Ví dụ:**

```
MAIL_HOST="smtp.gmail.com"
```

### MAIL_PORT

Cổng SMTP server.

**Các port phổ biến:**

- `587`: TLS/STARTTLS (khuyến nghị) - sử dụng `secure: false` trong config
- `465`: SSL - sử dụng `secure: true` trong config
- `25`: Không mã hóa (không khuyến nghị)

**Ví dụ:**

```
MAIL_PORT=587
```

**Lưu ý:**

- Port 587 là lựa chọn tốt nhất cho hầu hết các trường hợp
- Code hiện tại dùng `secure: false` nên phù hợp với port 587
- Nếu muốn dùng port 465, cần thay đổi `secure: true` trong `mail.service.ts`

### MAIL_USER

Địa chỉ email dùng để gửi email.

**Ví dụ:**

```
MAIL_USER="your-email@gmail.com"
```

### MAIL_PASSWORD

Đây là mật khẩu ứng dụng (App Password) để gửi email qua Gmail.

**Bước 1: Bật xác thực 2 bước (2FA)**

- Truy cập [Google Account Security](https://myaccount.google.com/security)
- Đăng nhập bằng tài khoản Gmail muốn sử dụng
- Tìm phần "2-Step Verification" và click vào
- Làm theo hướng dẫn để bật 2FA (nếu chưa bật)

**Bước 2: Tạo App Password**

- Sau khi bật 2FA, quay lại [Google Account Security](https://myaccount.google.com/security)
- Tìm phần "2-Step Verification" và click vào
- Cuộn xuống phần "App passwords" và click vào
- Hoặc truy cập trực tiếp: [App Passwords](https://myaccount.google.com/apppasswords)

**Bước 3: Tạo mật khẩu ứng dụng mới**

- Chọn "Select app" → "Mail"
- Chọn "Select device" → "Other (Custom name)"
- Nhập tên ứng dụng (ví dụ: "Mimkat API")
- Click "Generate"

**Bước 4: Lấy mật khẩu**

- Google sẽ hiển thị một mật khẩu 16 ký tự
- Sao chép mật khẩu này (không có khoảng trắng)
- Dán vào biến `MAIL_PASSWORD` trong file `.env`

**Ví dụ:**

```
MAIL_PASSWORD=abcd efgh ijkl mnop
```

**Lưu ý:**

- Không sử dụng mật khẩu đăng nhập Gmail thông thường
- Mỗi App Password chỉ hiển thị một lần duy nhất, hãy lưu lại cẩn thận
- Nếu mất App Password, bạn cần tạo lại một cái mới
- Có thể thu hồi App Password bất cứ lúc nào từ trang quản lý

### MAIL_FROM

Địa chỉ email hiển thị trong phần "From" khi gửi email.

**Ví dụ:**

```
MAIL_FROM="noreply@mimkat.com"
```

**Lưu ý:**

- Có thể khác với MAIL_USER
- Thường sử dụng địa chỉ dạng `noreply@` hoặc `support@`
- Email này sẽ hiển thị cho người nhận

## 5. CORS (Cross-Origin Resource Sharing)

### CORS_ORIGIN

Danh sách các domain được phép truy cập API.

**Format:**

```
CORS_ORIGIN="http://localhost:3001, http://localhost:3002"
```

**Lưu ý:**

- Các domain cách nhau bởi dấu phẩy và khoảng trắng
- Không có dấu `/` ở cuối URL
- Có thể thêm nhiều domain

**Ví dụ:**

```
# Development - nhiều client app
CORS_ORIGIN="http://localhost:3001, http://localhost:3002, http://localhost:3003"

# Production
CORS_ORIGIN="https://mimkat.com, https://admin.mimkat.com"

# Cho phép tất cả (không khuyến nghị cho production)
CORS_ORIGIN="*"
```

---

## 6. Server Configuration

### PORT

Cổng mà server API sẽ chạy.

**Ví dụ:**

```
PORT=3000
```

**Lưu ý:**

- Port mặc định thường là 3000
- Đảm bảo port không bị sử dụng bởi ứng dụng khác
- Có thể thay đổi nếu cần (3001, 8000, 8080, v.v.)

### NODE_ENV

Môi trường chạy của ứng dụng.

**Các giá trị:**

- `development`: Môi trường phát triển (dev)
- `production`: Môi trường sản xuất (production)
- `test`: Môi trường testing

**Ví dụ:**

```
NODE_ENV="development"
```

**Lưu ý:**

- Trong môi trường development, logging chi tiết hơn và có hot-reload
- Trong production, ứng dụng được tối ưu hóa về hiệu suất

---

## 7. AWS S3 Configuration

### AWS_REGION

AWS region nơi S3 bucket được tạo.

**Các region phổ biến:**

- `us-east-1`: US East (N. Virginia)
- `us-west-2`: US West (Oregon)
- `ap-southeast-1`: Asia Pacific (Singapore)
- `ap-northeast-1`: Asia Pacific (Tokyo)
- `eu-west-1`: Europe (Ireland)

**Ví dụ:**

```
AWS_REGION="ap-southeast-1"
```

**Lưu ý:**

- Region phải match với region của bucket
- Chọn region gần user để giảm latency

### AWS_ACCESS_KEY_ID và AWS_SECRET_ACCESS_KEY

Credentials để truy cập AWS S3.

**Bước 1: Truy cập AWS Console**

- Đăng nhập vào [AWS Console](https://console.aws.amazon.com/)
- Vào **IAM** (Identity and Access Management)

**Bước 2: Tạo IAM User**

- Click **Users** → **Add users**
- Nhập username (ví dụ: `mimkat-api-user`)
- Chọn **Programmatic access**
- Click **Next: Permissions**

**Bước 3: Set Permissions**

Option 1: Attach existing policy (recommended)

- Chọn **Attach existing policies directly**
- Tìm và chọn `AmazonS3FullAccess` (hoặc tạo custom policy với ít quyền hơn)

Option 2: Custom policy (more secure)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::your-bucket-name", "arn:aws:s3:::your-bucket-name/*"]
    }
  ]
}
```

**Bước 4: Lấy Credentials**

- Sau khi tạo user, AWS sẽ hiển thị:
  - **Access key ID** → Sao chép vào `AWS_ACCESS_KEY_ID`
  - **Secret access key** → Sao chép vào `AWS_SECRET_ACCESS_KEY`
- **QUAN TRỌNG**: Secret key chỉ hiển thị một lần duy nhất, hãy lưu lại cẩn thận

**Ví dụ:**

```
AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
```

**Lưu ý:**

- Không bao giờ commit credentials vào Git
- Sử dụng IAM role khi deploy trên AWS EC2/ECS
- Rotate credentials định kỳ cho bảo mật

### AWS_BUCKET_NAME

Tên của S3 bucket để lưu trữ files.

**Bước 1: Tạo S3 Bucket**

- Truy cập [S3 Console](https://s3.console.aws.amazon.com/)
- Click **Create bucket**
- Nhập bucket name (phải unique globally)
- Chọn region (phải match với `AWS_REGION`)

**Bước 2: Configure Bucket**

Object Ownership:

- Chọn **ACLs disabled (recommended)**

Block Public Access:

- Giữ nguyên setting mặc định (block all public access) cho private storage
- Hoặc adjust nếu muốn public read access

Bucket Versioning:

- Enable nếu cần version control (optional)

**Bước 3: Configure CORS (nếu cần)**

Nếu client truy cập trực tiếp từ browser, thêm CORS policy:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["http://localhost:3001", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

**Ví dụ:**

```
AWS_BUCKET_NAME="mimkat-storage"
```

**Lưu ý:**

- Bucket name phải unique globally (không trùng với bất kỳ bucket nào khác)
- Chỉ dùng lowercase, numbers, hyphens
- Không dùng underscores hoặc uppercase

### AWS_ENDPOINT

S3 endpoint URL.

**For AWS S3:**

Format: `https://s3.{region}.amazonaws.com`

**Examples:**

- US East: `https://s3.us-east-1.amazonaws.com`
- Singapore: `https://s3.ap-southeast-1.amazonaws.com`
- Ireland: `https://s3.eu-west-1.amazonaws.com`

**For S3-compatible services:**

- **MinIO**: `http://localhost:9000` (local) hoặc `https://minio.yourdomain.com`
- **DigitalOcean Spaces**: `https://{region}.digitaloceanspaces.com`
- **Wasabi**: `https://s3.wasabisys.com`
- **Backblaze B2**: `https://s3.{region}.backblazeb2.com`

**Ví dụ:**

```
# AWS S3 Singapore
AWS_ENDPOINT="https://s3.ap-southeast-1.amazonaws.com"

# MinIO self-hosted
AWS_ENDPOINT="https://oss.s3.mimkat.vn"

# DigitalOcean Spaces
AWS_ENDPOINT="https://sgp1.digitaloceanspaces.com"
```

**Lưu ý:**

- Endpoint phải match với region của bucket
- Bao gồm protocol (http:// hoặc https://)
- Không có trailing slash

---

## Tổng hợp - File .env hoàn chỉnh

Sau khi lấy được tất cả các biến, thêm chúng vào file `.env` của dự án:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mimkat"

# JWT
JWT_SECRET="your-jwt-secret-key-at-least-32-chars"
JWT_REFRESH_SECRET="your-jwt-refresh-secret-key-at-least-32-chars"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"

# Email
MAIL_PORT=587
MAIL_HOST="smtp.gmail.com"
MAIL_FROM="noreply@mimkat.com"
MAIL_USER="your-email@gmail.com"
MAIL_PASSWORD="your-app-password"

# CORS
CORS_ORIGIN="http://localhost:3001, http://localhost:3002"

# Server
PORT=3000
NODE_ENV="development"

# AWS S3 Configuration
AWS_REGION="ap-southeast-1"
AWS_BUCKET_NAME="mimkat-storage"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_ENDPOINT="https://oss.s3.mimkat.vn"
AWS_SECRET_ACCESS_KEY="your-secret-key"
```

**Lưu ý quan trọng:**

- File `.env` chứa thông tin nhạy cảm, **KHÔNG BAO GIỜ commit lên Git**
- Đảm bảo `.env` đã được thêm vào `.gitignore`
- Sử dụng file `.env.example` để chia sẻ template với team
- Mỗi môi trường (dev, staging, production) nên có file `.env` riêng với các giá trị khác nhau

---

## Troubleshooting - Các lỗi thường gặp

### 1. Lỗi Database Connection

**Lỗi:** `Error: Can't reach database server`

**Nguyên nhân:**

- PostgreSQL chưa chạy
- DATABASE_URL sai format
- Port/host/credentials không đúng

**Giải pháp:**

```bash
# Kiểm tra PostgreSQL đang chạy
# macOS
brew services list

# Hoặc
ps aux | grep postgres

# Start PostgreSQL nếu chưa chạy
brew services start postgresql

# Test connection
psql -U postgres -d mimkat
```

### 2. Google OAuth không work

**Lỗi:** `Redirect URI mismatch` hoặc không redirect về

**Nguyên nhân:**

- GOOGLE_CALLBACK_URL không match với "Authorized redirect URIs" trong Google Console

**Giải pháp:**

- Kiểm tra GOOGLE_CALLBACK_URL phải giống y hệt trong Google Console
- Re-check Google Client ID và Secret

### 3. Email không gửi được

**Lỗi:** `Failed to send verification email`

**Nguyên nhân:**

- Gmail App Password sai
- Chưa bật 2FA
- SMTP config sai

**Giải pháp:**

```bash
# Test SMTP connection
curl smtp://smtp.gmail.com:587 --user "your-email@gmail.com:app-password" -v

# Kiểm tra:
# 1. Đã bật 2FA chưa?
# 2. App Password có đúng không? (16 ký tự, không spaces)
# 3. MAIL_PORT=587 và secure: false
```

### 4. CORS Error trong browser

**Lỗi:** `Access to fetch at ... has been blocked by CORS policy`

**Nguyên nhân:**

- CORS_ORIGIN không include frontend URL
- Format sai (thiếu protocol http:// hoặc có `/` cuối)

**Giải pháp:**

```env
# Đảm bảo format đúng
CORS_ORIGIN="http://localhost:3001, http://localhost:3002"

# Không được:
# - Thiếu protocol: "localhost:3001"
# - Có slash cuối: "http://localhost:3001/"
# - Sai separator: "http://localhost:3001,http://localhost:3002" (thiếu space)
```

### 5. JWT Token không work

**Lỗi:** `Unauthorized` hoặc token invalid

**Nguyên nhân:**

- JWT_SECRET hoặc JWT_REFRESH_SECRET chưa set
- Secret quá ngắn
- Hai secrets giống nhau

**Giải pháp:**

```bash
# Generate proper secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For JWT_REFRESH_SECRET (khác với trên)

# Đảm bảo:
# - Mỗi secret >= 32 characters
# - JWT_SECRET ≠ JWT_REFRESH_SECRET
```

### 6. Verification/Reset links không work

**Lỗi:** Link trong email redirect sai trang hoặc 404

**Nguyên nhân:**

- Frontend URL không được extract đúng từ request headers
- Client routes chưa setup

**Giải pháp:**

- Đảm bảo frontend gửi request với đúng `Origin` hoặc `Referer` headers
- Kiểm tra client có routes:
  - `/verify-email`
  - `/reset-password`
- Nếu không có headers, system sẽ fallback về `http://localhost:3001` (development)

### 7. Port already in use

**Lỗi:** `Error: listen EADDRINUSE: address already in use :::3000`

**Nguyên nhân:** Port 3000 đã được process khác sử dụng

**Giải pháp:**

```bash
# Tìm process đang dùng port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Hoặc đổi PORT trong .env
PORT=3001
```

### 8. Environment variables không load

**Lỗi:** `undefined` khi access `process.env.XXX`

**Nguyên nhân:**

- File `.env` không ở root folder
- Chưa install `@nestjs/config`
- Chưa import ConfigModule

**Giải pháp:**

```bash
# Kiểm tra file .env ở đúng vị trí
ls -la .env

# Restart server
npm run start:dev

# Verify variables loaded
# Trong code, log ra xem:
console.log(process.env.JWT_SECRET);
```

### 9. Database migration lỗi

**Lỗi:** `Prisma migration failed`

**Nguyên nhân:**

- DATABASE_URL chưa đúng
- Database chưa được tạo

**Giải pháp:**

```bash
# Tạo database trước
psql -U postgres
CREATE DATABASE mimkat;
\q

# Run migration
npx prisma migrate dev

# Hoặc reset database
npx prisma migrate reset
```

### 10. Avatar upload không work

**Lỗi:** `Failed to upload avatar` hoặc S3 connection error

**Nguyên nhân:**

- AWS credentials sai hoặc chưa set
- Bucket không tồn tại
- Không có quyền truy cập bucket
- Endpoint URL sai

**Giải pháp:**

```bash
# Test S3 connection
aws s3 ls s3://your-bucket-name --profile your-profile

# Kiểm tra:
# 1. AWS_REGION đúng chưa?
# 2. AWS_ACCESS_KEY_ID và AWS_SECRET_ACCESS_KEY có quyền?
# 3. AWS_BUCKET_NAME tồn tại không?
# 4. AWS_ENDPOINT đúng format?
```

**Check IAM permissions:**

- User phải có quyền: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
- Bucket policy cho phép user access

### 11. Production deployment issues

**Lỗi:** Works local nhưng không work khi deploy

**Giải pháp checklist:**

- [ ] Tất cả env variables đã set trên production server
- [ ] NODE_ENV="production"
- [ ] CORS_ORIGIN có production domain
- [ ] Google OAuth callback URL có production URL
- [ ] Database accessible từ production server
- [ ] AWS S3 credentials và bucket configured
- [ ] Cookies `secure: true` requires HTTPS
- [ ] Frontend gửi đúng Origin/Referer headers trong requests

---
