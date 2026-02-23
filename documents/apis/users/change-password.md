# Change Password API Documentation

## Overview

API đổi mật khẩu cho người dùng đã đăng nhập. Hỗ trợ hai trường hợp:

1. **Người dùng đã có mật khẩu** (tài khoản email/password truyền thống): Phải cung cấp mật khẩu hiện tại
2. **Người dùng Google OAuth chưa có mật khẩu**: Có thể đặt mật khẩu mà không cần mật khẩu hiện tại

**Base URL**: `/users`

---

## Endpoint

**Endpoint**: `PUT /users/password`

**Rate Limit**: 10 requests / 1 giờ (3600 seconds)

**Authentication**: Required (Bearer Token hoặc Cookie)

### Request Headers

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Or using cookies:**

```
Cookie: accessToken=<token>
Content-Type: application/json
```

### Request Body

**Đối với người dùng đã có mật khẩu:**

```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}
```

**Đối với người dùng Google OAuth đặt mật khẩu lần đầu:**

```json
{
  "newPassword": "NewPassword456"
}
```

### Request Body Schema

| Field           | Type   | Required                | Validation                                                        | Description                                                                                            |
| --------------- | ------ | ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| currentPassword | string | Conditional (see notes) | -                                                                 | Mật khẩu hiện tại. **Bắt buộc** nếu user đã có password. **Không bắt buộc** cho user chưa có password. |
| newPassword     | string | Yes                     | MinLength: 8, Must match regex: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)` | Mật khẩu mới. Phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số.                              |

### Password Requirements

- Tối thiểu 8 ký tự
- Ít nhất một chữ hoa (A-Z)
- Ít nhất một chữ thường (a-z)
- Ít nhất một chữ số (0-9)
- Regex validation: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)`

### Business Logic

1. **Find user**: Tìm user bằng userId từ JWT token
2. **Check if user has password**:
   - Nếu `user.password !== null` → User đã có password
   - Nếu `user.password === null` → User chưa có password (Google-only account)
3. **Validate current password** (nếu user đã có password):
   - Check `currentPassword` được cung cấp
   - Verify bằng `bcrypt.compare()`
   - Throw error nếu không match
4. **Allow password setting** (nếu user chưa có password):
   - Không cần `currentPassword`
   - Cho phép set password lần đầu
5. **Hash new password**: Sử dụng `bcrypt.hash()` với 12 salt rounds
6. **Update database**: Lưu hashed password vào `user.password`
7. **Invalidate all sessions**: Xóa tất cả sessions của user để security
8. **Clear cookies**: Xóa accessToken và refreshToken cookies từ response
9. **Return success**: User phải login lại với password mới

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

Hoặc khi user Google đặt mật khẩu lần đầu:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

**Note**: Response data luôn là `null`. Không trả về thông tin user hay password.

### Error Responses

**400 Bad Request - Yêu cầu mật khẩu hiện tại**

Trả về khi user đã có password nhưng không cung cấp `currentPassword`.

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Current password is required to change password",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

**400 Bad Request - Mật khẩu hiện tại không đúng**

Trả về khi `currentPassword` không match với password đã lưu trong database.

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Current password is incorrect",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

**403 Forbidden - User không tồn tại hoặc bị vô hiệu hóa**

Trả về khi userId từ JWT token không tồn tại trong database (user bị xóa) hoặc account bị disable.

```json
{
  "success": false,
  "statusCode": 403,
  "message": "User does not exist",
  "error": "Forbidden",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

hoặc

```json
{
  "success": false,
  "statusCode": 403,
  "message": "Account has been disabled",
  "error": "Forbidden",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

**400 Bad Request - Mật khẩu không hợp lệ**

Trả về khi `newPassword` không đáp ứng các yêu cầu validation.

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "newPassword",
      "constraint": "minLength",
      "message": "Password must be at least 8 characters long",
      "value": "short"
    },
    {
      "field": "newPassword",
      "constraint": "matches",
      "message": "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      "value": "weakpass"
    }
  ],
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

**Possible validation errors**:

- `"New password is required"` - Thiếu newPassword
- `"Password must be at least 8 characters long"` - Dưới 8 ký tự
- `"Password must contain at least one uppercase letter, one lowercase letter, and one number"` - Không đủ yêu cầu

**429 Too Many Requests - Vượt quá rate limit**

```json
{
  "success": false,
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

---

## Use Cases

### Use Case 1: Người dùng truyền thống đổi mật khẩu

Người dùng đã đăng ký bằng email/password muốn thay đổi mật khẩu.

**Request:**

```bash
curl -X PUT http://localhost:3000/users/password \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPassword123",
    "newPassword": "NewSecurePassword456"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

---

### Use Case 2: Người dùng Google OAuth đặt mật khẩu

Người dùng ban đầu đăng nhập bằng Google muốn đặt mật khẩu để sử dụng đăng nhập email/password.

**Request:**

```bash
curl -X PUT http://localhost:3000/users/password \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "newPassword": "NewSecurePassword456"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

---

### Use Case 3: Người dùng nhập sai mật khẩu hiện tại

Người dùng cố gắng đổi mật khẩu nhưng nhập sai mật khẩu hiện tại.

**Request:**

```bash
curl -X PUT http://localhost:3000/users/password \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "WrongPassword123",
    "newPassword": "NewSecurePassword456"
  }'
```

**Response:**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Current password is incorrect",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/password"
}
```

---

## Security Considerations

1. **Xác thực mật khẩu hiện tại**: Đối với người dùng đã có mật khẩu, hệ thống yêu cầu mật khẩu hiện tại để ngăn chặn thay đổi mật khẩu trái phép nếu ai đó truy cập được phiên đăng nhập.

2. **Password Hashing**: Mật khẩu được hash bằng bcrypt với 12 salt rounds trước khi lưu trữ.

3. **Rate Limiting**: Endpoint được bảo vệ bằng rate limiting (5 requests/giờ) để ngăn chặn tấn công brute force.

4. **Yêu cầu Token**: Yêu cầu JWT access token hợp lệ, đảm bảo chỉ người dùng đã xác thực mới có thể đổi mật khẩu.

5. **Session Invalidation**: Đặt lại mật khẩu, tất cả phiên đăng nhập trên mọi thiết bị sẽ bị xóa để bảo mật. Người dùng cần đăng nhập lại với mật khẩu mới.

6. **Cookie Clearing**: Sau khi thay đổi mật khẩu thành công, server sẽ clear accessToken và refreshToken cookies để force logout ngay lập tức trên browser hiện tại.

7. **Người dùng Google OAuth**: Người dùng đăng nhập bằng Google mà chưa có mật khẩu có thể đặt mật khẩu mà không cần mật khẩu hiện tại, cho phép họ sử dụng đăng nhập email/password trong tương lai.

8. **JWT Token Required**: Endpoint yêu cầu valid access token để identify user. Token có thể được gửi qua Authorization header hoặc cookie.

---

## Common Errors and Solutions

### Error: "Current password is required"

**Cause**: User đã có password nhưng không cung cấp `currentPassword`

**Solution**:

- Check `user.hasPassword` flag từ profile API
- Nếu `true`, require current password field
- Validate trước khi submit

### Error: "Current password is incorrect"

**Cause**: User nhập sai current password

**Solution**:

- Show clear error message
- Allow retry (trong rate limit)
- Suggest "Forgot Password" nếu user không nhớ

### Error: Rate limit exceeded

**Cause**: Quá 5 attempts trong 1 giờ

**Solution**:

- Show remaining time cho user
- Implement exponential backoff
- Consider using forgot password flow instead

### Error: Validation failed

**Cause**: New password không meet requirements

**Solution**:

- Show real-time validation
- Highlight which requirements are missing
- Provide clear password rules upfront

---

## Related Endpoints

- **GET /users/me**: Get user profile (includes `hasPassword` flag)
- **POST /auth/forgot-password**: Reset password via email (alternative to change password)
- **GET /users/sessions**: View active sessions
- **DELETE /users/sessions**: Logout all devices (similar effect to password change)

---

## Notes

- **QUAN TRỌNG**: Sau khi đổi mật khẩu thành công, TẤT CẢ các phiên đăng nhập trên mọi thiết bị sẽ bị xóa để đảm bảo bảo mật (gọi `prisma.session.deleteMany({ where: { userId } })`).
- **Cookies Authentication**: accessToken và refreshToken cookies sẽ bị xóa khỏi response để force logout ngay lập tức.
- Người dùng sẽ cần đăng nhập lại bằng mật khẩu mới trên tất cả thiết bị.
- Hành vi này giống với endpoint `POST /verification/reset-password` để đảm bảo tính nhất quán về bảo mật.
- Validation mật khẩu tuân theo các quy tắc giống như đăng ký (MinLength: 8, Regex: uppercase + lowercase + number).
- **Google OAuth Users**: Có thể set password lần đầu mà không cần current password. Sau đó có thể login bằng cả Google VÀ email/password.
- **Dual Login Method**: Sau khi Google user set password, họ có 2 options: login bằng Google OAuth hoặc email/password.
- Rate limit: 5 attempts per hour (3600000ms) để prevent brute force.
- Password được hash bằng bcrypt với 12 salt rounds trước khi lưu database.
