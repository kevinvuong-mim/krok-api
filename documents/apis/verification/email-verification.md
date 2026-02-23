# Email Verification API Documentation

## Overview

API xác thực email người dùng sau khi đăng ký tài khoản. Email xác thực được gửi tự động sau khi đăng ký và có thể được gửi lại nếu cần.

**Base URL**: `/verification`

---

## Endpoints

### 1. Verify Email (Xác thực email)

Xác thực email của người dùng thông qua token được gửi qua email. Token được hash và lưu trữ an toàn trong database.

**Endpoint**: `GET /verification/email`

**Authentication**: Không yêu cầu (Public)

**Rate Limit**: Không giới hạn (vì đây là one-time link từ email)

#### Query Parameters

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| token     | string | Yes      | Token xác thực (64 ký tự hex) từ email |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/email"
}
```

**Error Responses**

- **400 Bad Request**: Token không hợp lệ hoặc thiếu

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid or expired verification token",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/email"
}
```

#### URL Example

```
http://localhost:3000/verification/email?token=a1b2c3d4e5f6...
```

#### cURL Example

```bash
curl -X GET "http://localhost:3000/verification/email?token=YOUR_VERIFICATION_TOKEN"
```

#### Notes

- Token được tạo bằng `crypto.randomBytes(32).toString('hex')` (64 ký tự hex)
- Token được hash bằng bcrypt (10 salt rounds) trước khi lưu vào database
- Token có hiệu lực 48 giờ (2880 phút)
- Sau khi xác thực thành công, `isEmailVerified = true` và token bị xóa (`verificationToken = null`, `verificationTokenExpiry = null`)
- Email đã xác thực không thể xác thực lại (check `isEmailVerified = false` trong query)
- **Security**: Backend loop qua tất cả unverified users để compare token bằng bcrypt (không thể query directly vì token được hash)

### Business Logic

1. **Query unverified users**: Tìm tất cả users có `isEmailVerified = false` và `verificationTokenExpiry >= now`
2. **Loop and compare**: Với mỗi user, dùng `bcrypt.compare(token, user.verificationToken)` để check
3. **Find match**: Nếu tìm thấy matching user, lưu `matchedUserId`
4. **Validate**: Nếu không tìm thấy match → throw "Invalid or expired verification token"
5. **Update user**: Set `isEmailVerified = true`, clear `verificationToken` và `verificationTokenExpiry`
6. **Return success**: User có thể login ngay

---

### 2. Resend Verification Email (Gửi lại email xác thực)

Gửi lại email xác thực cho người dùng chưa xác thực email. Tạo token mới và gửi email xác thực.

**Endpoint**: `POST /verification/resend`

**Rate Limit**: 12 requests / 1 giờ (3600 seconds)

**Authentication**: Không yêu cầu (Public)

#### Request Body

```json
{
  "email": "user@example.com"
}
```

| Field | Type   | Required | Validation         | Description                |
| ----- | ------ | -------- | ------------------ | -------------------------- |
| email | string | Yes      | Valid email format | Email cần gửi lại xác thực |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/resend"
}
```

**Error Responses**

- **400 Bad Request**: Email không hợp lệ hoặc user không tồn tại

```json
{
  "success": false,
  "statusCode": 400,
  "message": "User not found",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/resend"
}
```

- **400 Bad Request**: Email đã được xác thực

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Email is already verified",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/resend"
}
```

- **429 Too Many Requests**: Vượt quá rate limit

```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Too Many Requests",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/resend"
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/verification/resend \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

#### Notes

- Tạo token mới mỗi lần gửi lại (token cũ bị thay thế)
- Token mới có hiệu lực 48 giờ từ thời điểm tạo
- Rate limit (12 requests/hour) ngăn spam email
- Nếu gửi email thất bại, throw exception (không silent fail như register)
- API throw exception cụ thể ("User not found", "Email is already verified") thay vì generic response
- Token được hash với bcrypt 10 salt rounds trước khi lưu

### Business Logic

1. **Find user**: Query user bằng email
2. **Check exists**: Nếu không tồn tại → throw "User not found"
3. **Check verified**: Nếu `isEmailVerified = true` → throw "Email is already verified"
4. **Generate token**: Tạo random 32-byte token (64 hex chars)
5. **Hash token**: Hash bằng bcrypt với 10 salt rounds
6. **Set expiry**: 48 hours from now
7. **Update database**: Lưu hashed token và expiry
8. **Send email**: Gửi verification email với plain token
9. **Return success**: Response không chứa token vì security

---

## Security Features

### Token Generation

```typescript
// Generate random 32-byte token (64 hex characters)
const verificationToken = crypto.randomBytes(32).toString('hex');

// Hash token before storing in database
const hashedToken = await bcrypt.hash(verificationToken, 10);
```

### Token Storage

- **Plain token**: Gửi qua email (1 lần duy nhất)
- **Hashed token**: Lưu trong database
- **Expiry**: 48 giờ từ thời điểm tạo

### Verification Process

1. User nhận email với plain token
2. User click link verification
3. Backend nhận plain token từ query parameter
4. So sánh plain token với hashed token trong database bằng bcrypt
5. Nếu khớp và chưa hết hạn → xác thực thành công
6. Xóa token khỏi database

---

## Common Errors

### Token Expired

**Scenario**: User click link sau 48 giờ

**Response**:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid or expired verification token",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/email"
}
```

**Solution**: Sử dụng endpoint `POST /verification/resend`

### Email Already Verified

**Scenario**: User đã verify nhưng click link lần nữa

**Response**:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Email is already verified",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/resend"
}
```

**Solution**: User có thể đăng nhập ngay

### User Not Found

**Scenario**: Gửi lại verification cho email không tồn tại

**Response**:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "User not found",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/resend"
}
```

---

## Email Template

### Verification Email Content

**Subject**: "Verify Your Email Address"

**Email Body** (simplified):

```
Hi there,

Thanks for signing up! Please verify your email address by clicking the link below:

{FRONTEND_URL}/verify-email?token={VERIFICATION_TOKEN}

This link will expire in 48 hours.

If you didn't create an account, you can safely ignore this email.

Thanks,
The Team
```

**Variables**:

- `{FRONTEND_URL}`: Extracted from request headers (Origin or Referer), fallback to `http://localhost:3001` for development
- `{VERIFICATION_TOKEN}`: 64-character hex string (plain text, not hashed)

---

## Use Cases

### Use Case 1: Normal Registration Flow

1. User đăng ký với email + password
2. Backend tạo user với `isEmailVerified = false`
3. Backend gửi verification email với token
4. User nhận email và click link
5. Frontend extract token và call `/verification/email?token=...`
6. Backend verify token → set `isEmailVerified = true`
7. User được redirect đến login page
8. User có thể login thành công

---

### Use Case 2: Token Expired

1. User đăng ký nhưng không verify trong 48 giờ
2. User click verification link
3. Backend check: token expired
4. Return error "Invalid or expired verification token"
5. Frontend hiển thị error với "Resend" button
6. User click "Resend Verification Email"
7. Frontend call `POST /verification/resend`
8. Backend tạo token mới và gửi email
9. User nhận email mới và verify thành công

---

### Use Case 3: Tried Login Without Verification

1. User đăng ký nhưng skip email verification
2. User cố gắng login
3. Backend check: `isEmailVerified = false`
4. Return error "Please verify your email address before logging in"
5. Frontend show verification prompt với email address
6. User click "Resend Verification Email"
7. Call resend endpoint
8. User verify email và login thành công

---

### Use Case 4: Lost Verification Email

1. User đăng ký nhưng không tìm thấy verification email
2. User vào resend verification page
3. Nhập email address
4. Call `POST /verification/resend`
5. Check spam folder
6. Receive new email và verify

---

## Troubleshooting

### Problem: Verification email không đến

**Causes**:

- Email trong spam folder
- Email service down
- Invalid email address
- Email sending failed

**Solutions**:

- Check spam/junk folder
- Use resend verification
- Verify email address correct
- Check server logs cho email errors

### Problem: Token không work

**Causes**:

- Token expired (> 48h)
- Token đã được sử dụng
- Token incorrect (copy/paste error)
- User đã verified

**Solutions**:

- Use resend verification để get new token
- Check token trong URL (không có extra spaces/characters)
- Verify user chưa verified

### Problem: "Email is already verified"

**Cause**: User đã verify nhưng cố verify lại

**Solution**: User có thể login trực tiếp, không cần verify lại

### Problem: Rate limit exceeded

**Cause**: Resend quá 12 lần trong 1 giờ

**Solution**:

- Đợi 1 giờ
- Check spam folder thay vì resend
- Contact support nếu cần

---

## Related Endpoints

- **POST /auth/register**: Tạo user và gửi verification email tự động
- **POST /auth/login**: Check `isEmailVerified` trước khi cho phép login
- **GET /users/me**: Return `isEmailVerified` status

---

## Notes

- **Automatic Sending**: Verification email được gửi tự động sau register
- **Required for Login**: User phải verify email trước khi login
- **Token Format**: 64 hex characters (32 bytes random)
- **Token Storage**: Hashed với bcrypt 10 salt rounds
- **Expiry**: 48 hours from creation
- **Security**: Token rotation (mỗi lần resend tạo token mới)
- **Performance**: Loop through users để compare (có thể optimize bằng index hoặc alternative approach)
- **Email Service**: Sử dụng MailService (Nodemailer hoặc SendGrid)
- **Error Handling**: API throw specific exceptions ("User not found", "Email is already verified") thay vì generic responses
