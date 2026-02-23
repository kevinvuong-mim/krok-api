# Password Reset API Documentation

## Overview

API đặt lại mật khẩu cho người dùng quên mật khẩu. Chỉ áp dụng cho tài khoản có password (tài khoản local hoặc tài khoản đã liên kết local login).

**Base URL**: `/verification`

---

## Endpoints

### 1. Forgot Password (Quên mật khẩu)

Gửi email chứa link đặt lại mật khẩu. Endpoint này không tiết lộ thông tin về sự tồn tại của email (security best practice).

**Endpoint**: `POST /verification/forgot-password`

**Rate Limit**: 3 requests / 1 giờ (3600000 milliseconds)

**Authentication**: Không yêu cầu (Public)

#### Request Body

```json
{
  "email": "user@example.com"
}
```

| Field | Type   | Required | Validation         | Description                |
| ----- | ------ | -------- | ------------------ | -------------------------- |
| email | string | Yes      | Valid email format | Email cần đặt lại mật khẩu |

#### Response

**Success (200 OK)** - Luôn trả về 200 OK nếu request hợp lệ, bất kể email có tồn tại hay không (security measure)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/forgot-password"
}
```

**Notes về Security Behavior**:

- **Khi user TỒN TẠI và có password**: Email được gửi thực tế, trả về 200 OK
- **Khi user KHÔNG TỒN TẠI**: THROW BadRequestException (400) với message "If an account with that email exists, we sent a password reset link."
- **Khi user KHÔNG CÓ PASSWORD** (OAuth-only): THROW BadRequestException (400) với message giống nhau
- Message error giống nhau cho cả 2 trường hợp fail để không tiết lộ user existence

**Error Responses**

- **400 Bad Request**: Email không tồn tại hoặc account không có password

```json
{
  "success": false,
  "statusCode": 400,
  "message": "If an account with that email exists, we sent a password reset link.",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/forgot-password"
}
```

**Note**: Message giống nhau cho cả 2 trường hợp (email không tồn tại hoặc không có password) để không tiết lộ thông tin user

- **429 Too Many Requests**: Vượt quá rate limit

```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Too Many Requests",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/forgot-password"
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/verification/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

#### Notes

- Chỉ gửi email cho tài khoản có password được set
- Tài khoản chỉ có Google OAuth (không có password) không thể đặt lại mật khẩu
- Token có hiệu lực 1 giờ (ngắn hơn email verification để tăng bảo mật)
- Nếu gửi email thất bại, log error nhưng không throw exception (vẫn return 200)
- Nếu user không tồn tại hoặc không có password, throw BadRequestException với message giống nhau để không tiết lộ user existence

---

### 2. Reset Password (Đặt lại mật khẩu)

Đặt lại mật khẩu mới sử dụng token từ email.

**Endpoint**: `POST /verification/reset-password`

**Rate Limit**: 10 requests / 1 giờ (3600000 milliseconds)

**Authentication**: Không yêu cầu (Public)

#### Request Body

```json
{
  "token": "a1b2c3d4e5f6...",
  "password": "NewSecurePass123"
}
```

| Field    | Type   | Required | Validation                                                                                | Description    |
| -------- | ------ | -------- | ----------------------------------------------------------------------------------------- | -------------- |
| token    | string | Yes      | 64 hex characters                                                                         | Token từ email |
| password | string | Yes      | Min 8 chars, 1 uppercase, 1 lowercase, 1 number (Regex: ^(?=._[a-z])(?=._[A-Z])(?=.\*\d)) | Mật khẩu mới   |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/reset-password"
}
```

**Error Responses**

- **400 Bad Request**: Token không hợp lệ hoặc hết hạn

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid or expired reset token",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/reset-password"
}
```

- **400 Bad Request**: Password too short

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "password",
      "constraint": "minLength",
      "message": "Password must be at least 8 characters long",
      "value": "short"
    }
  ],
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/reset-password"
}
```

- **400 Bad Request**: Password không đủ mạnh (thiếu uppercase/lowercase/number)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "password",
      "constraint": "matches",
      "message": "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      "value": "weakpassword"
    }
  ],
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/reset-password"
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
  "path": "/verification/reset-password"
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/verification/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_RESET_TOKEN",
    "password": "NewSecurePass123"
  }'
```

#### Business Logic

**Forgot Password Flow (forgotPassword)**:

1. **Lookup User**: Tìm user theo email
2. **Check Existence**:
   - Nếu user không tồn tại → THROW BadRequestException (400) với message "If an account with that email exists, we sent a password reset link."
   - Nếu user tồn tại → continue
3. **Check Password Capability**:
   - Nếu user không có password field (OAuth-only account) → THROW BadRequestException (400) với message "If an account with that email exists, we sent a password reset link."
   - Chỉ accounts có password mới được reset
4. **Generate Reset Token**: Create 32-byte random token (64 hex chars)
5. **Hash Token**: Hash với bcrypt (10 salt rounds)
6. **Set Expiry**: 1 giờ từ bây giờ
7. **Update Database**: Lưu `passwordResetToken` và `passwordResetTokenExpiry`
8. **Send Email**: Gửi plain token qua email (có try-catch, log error nếu fail nhưng KHÔNG throw exception - silent fail để không reveal email sending status)
9. **Return**: Method kết thúc, NestJS auto-wrap thành 200 OK response với `data: null`

**Reset Password Flow (resetPassword)**:

1. **Find Candidates**: Query tất cả users có `passwordResetToken` NOT NULL và `passwordResetTokenExpiry >= NOW()`
2. **Loop & Compare**: Dùng bcrypt.compare() để tìm matching token (vì token đã hashed)
3. **Validate Token**:
   - Nếu không match → throw "Invalid or expired reset token"
   - Nếu match → lấy userId
4. **Hash New Password**: Hash password mới với bcrypt (12 salt rounds)
5. **Update User**: Set `password` = new hash, clear `passwordResetToken` và `passwordResetTokenExpiry`
6. **Invalidate Sessions**: Delete ALL sessions của user (`Session.deleteMany`)
7. **Clear Cookies**: Xóa accessToken và refreshToken cookies từ response
8. **Return**: Success (null data)

#### Notes

- Sau khi đặt lại mật khẩu thành công:
  - Password cũ bị thay thế bằng password mới (hash bcrypt, salt rounds = 12)
  - **Tất cả sessions hiện tại bị xóa** (security measure)
  - **Cookies bị xóa** (accessToken và refreshToken cleared từ response)
  - Token reset bị xóa khỏi database
  - User cần đăng nhập lại với mật khẩu mới
- **Token Security**:
  - Plain token gửi qua email (1 lần)
  - Hashed token lưu DB (bcrypt 10 rounds for tokens)
  - Password hash sử dụng 12 rounds (cao hơn)
- **Security Behavior**: Forgot password THROW BadRequestException (400) cho CẢHẢ 2 trường hợp lỗi (user không tồn tại hoặc không có password) với cùng message để không tiết lộ user existence
- **Performance**: Loop qua users để compare tokens (giống email verification, có thể optimize)

---

## Security Features

### Token Generation

```typescript
// Generate random 32-byte token (64 hex characters)
const resetToken = crypto.randomBytes(32).toString('hex');

// Hash token before storing in database
const hashedToken = await bcrypt.hash(resetToken, 10);
```

### Token Storage

- **Plain token**: Gửi qua email (1 lần duy nhất)
- **Hashed token**: Lưu trong database (field `passwordResetToken`)
- **Expiry**: 1 giờ từ thời điểm tạo (field `passwordResetTokenExpiry`)

### Password Hashing

- **Algorithm**: bcrypt
- **Salt Rounds**: 12 (high security)
- **Same as registration**: Đảm bảo consistency

### Session Invalidation

Sau khi đặt lại mật khẩu:

```typescript
// Invalidate all existing sessions
await prisma.session.deleteMany({
  where: { userId: matchedUserId },
});

// Clear authentication cookies
res.clearCookie(AUTH_CONSTANTS.ACCESS_TOKEN_KEY);
res.clearCookie(AUTH_CONSTANTS.REFRESH_TOKEN_KEY);
```

**Rationale**: Ngăn attacker sử dụng sessions cũ nếu họ đã chiếm quyền truy cập và force logout ngay lập tức

---

## Common Errors

### Token Expired

**Scenario**: User click link sau 1 giờ

**Response**:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid or expired reset token",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/reset-password"
}
```

**Solution**: Yêu cầu gửi lại email reset bằng `/verification/forgot-password`

### OAuth Account

**Scenario**: User chỉ có Google account (không có password) cố đặt lại mật khẩu

**Response**:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "If an account with that email exists, we sent a password reset link.",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/forgot-password"
}
```

**Note**: Không gửi email thực tế, nhưng throw BadRequestException với message giống nhau

**Solution**: Thông báo user sử dụng Google login

### Password Too Weak

**Scenario**: Password không đủ requirements (< 8 chars, thiếu uppercase/lowercase/number)

**Response**:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "password",
      "constraint": "matches",
      "message": "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      "value": "weakpassword"
    }
  ],
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/verification/reset-password"
}
```

---

## Email Template

### Password Reset Email Content

**Subject**: "Reset Your Password"

**Email Body** (simplified):

```
Hi there,

We received a request to reset your password. Click the link below to create a new password:

{FRONTEND_URL}/reset-password?token={RESET_TOKEN}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.

Thanks,
The Team
```

**Variables**:

- `{FRONTEND_URL}`: Extracted from request headers (Origin or Referer), fallback to `http://localhost:3001` for development
- `{RESET_TOKEN}`: 64-character hex string (plain text, not hashed)

**Security Note**: Email nên include warning về phishing và không request password qua email

---

## Use Cases

### Use Case 1: Normal Password Reset Flow

1. User click "Forgot Password" trên login page
2. Nhập email address và submit
3. Backend check: user tồn tại và có password → gửi email
4. User nhận email với reset link
5. User click link → redirect đến reset password page với token
6. User nhập password mới (đủ requirements) và confirm
7. Frontend validate và call reset API
8. Backend verify token → update password → delete all sessions
9. User redirected đến login page
10. User login với password mới thành công

---

### Use Case 2: Token Expired

1. User request password reset
2. User đợi > 1 giờ trước khi click link
3. User click reset link
4. Frontend extract token và call API
5. Backend check: token expired
6. Return error "Invalid or expired reset token"
7. Frontend show error với "Request New Link" button
8. User click button → redirect đến forgot password page
9. User request new reset email
10. User complete reset với token mới

---

### Use Case 3: OAuth Account Tries Reset

1. User có Google-only account (không có password)
2. User quên và cố reset password
3. User nhập email vào forgot password form
4. Backend check: user không có password field
5. Throw BadRequestException với message "If an account with that email exists, we sent a password reset link."
6. User không nhận email (vì không eligible)
7. User thử login → nhớ ra dùng Google
8. User login với Google successfully

---

### Use Case 4: Multiple Reset Requests

1. User request reset password (lần 1)
2. User request lại (lần 2) - token cũ bị overwrite
3. User request lần 3
4. User cố request lần 4 → hit rate limit
5. Backend return 429 Too Many Requests
6. Frontend show "Too many requests, wait 1 hour"
7. User check email và dùng token từ request lần 3
8. Reset thành công

---

### Use Case 5: Password Validation Failed

1. User request và receive reset email
2. User click link và nhập password: "password123" (no uppercase)
3. Frontend show error: "Must contain uppercase letter"
4. User try "Password" (too short)
5. Frontend show error: "Must be at least 8 characters"
6. User enter "Password123" (valid)
7. Submit → backend validate và accept
8. Password reset successful

---

## Troubleshooting

### Problem: Reset email không đến

**Causes**:

- Email trong spam folder
- Email service down
- User không có password (OAuth-only account)
- Email address incorrect

**Solutions**:

- Check spam/junk folder
- Verify email address spelling
- Try resend (nếu chưa hit rate limit)
- Check server logs cho email errors
- If OAuth account: use Google login instead

---

### Problem: "Invalid or expired reset token"

**Causes**:

- Token expired (> 1 hour)
- Token đã được sử dụng (one-time use)
- Token incorrect (copy/paste error, extra spaces)
- Multiple reset requests (old token invalidated)

**Solutions**:

- Request new reset email
- Check token trong URL (no extra characters)
- Make sure using latest email
- Copy full token without spaces

---

### Problem: Password validation failed

**Causes**:

- Password < 8 characters
- Missing uppercase letter
- Missing lowercase letter
- Missing number

**Solutions**:

- Use password like "Password123"
- Check validation requirements:
  - ✓ At least 8 characters
  - ✓ One uppercase (A-Z)
  - ✓ One lowercase (a-z)
  - ✓ One number (0-9)

---

### Problem: Rate limit exceeded

**Cause**: Quá nhiều requests (3+ forgot password hoặc 5+ reset password trong 1 giờ)

**Solutions**:

- Đợi 1 giờ trước khi try again
- Use existing reset link trong email
- Contact support nếu urgent

---

### Problem: "Cannot login after reset"

**Causes**:

- Using old password
- All sessions invalidated (expected behavior)
- Password not saved correctly

**Solutions**:

- Use NEW password vừa set
- Clear browser cache/cookies
- Try reset password again
- Verify password meets requirements

---

### Problem: Multiple devices logged out

**Cause**: All sessions deleted after password reset (security feature)

**Solution**:

- This is expected behavior
- Login again trên tất cả devices với password mới
- Security measure để protect account

---

## Related Endpoints

- **POST /auth/login**: Login với password mới sau reset
- **POST /auth/register**: Tạo account mới (sets initial password)
- **POST /users/change-password**: Change password when logged in (requires current password)
- **GET /users/me**: Check user `hasPassword` flag để biết có thể reset không

---

## Notes

- **Automatic Email Sending**: Reset email được gửi automatically sau forgot-password request
- **Token Format**: 64 hex characters (32 bytes random)
- **Token Storage**: Hashed với bcrypt 10 salt rounds
- **Password Storage**: Hashed với bcrypt 12 salt rounds (stronger than token)
- **Expiry**: 1 hour from creation (shorter than email verification for security)
- **Security**: THROW BadRequestException (400) cho cả email không tồn tại VÀ không có password (message giống nhau để không reveal user existence)
- **Session Invalidation**: Tất cả sessions bị xóa after reset (force re-login)
- **Performance**: Loop through users để compare tokens (có thể optimize với index)
- **Email Service**: Uses MailService (Nodemailer/SendGrid)
- **One-Time Use**: Token bị xóa sau successful reset
- **OAuth Accounts**: Chỉ accounts có password field mới có thể reset
