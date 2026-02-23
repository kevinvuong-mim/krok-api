# Authentication API Documentation

## Overview

API xác thực người dùng, hỗ trợ cả Bearer tokens và HttpOnly cookies.

**Base URL**: `/auth`

**Authentication Methods**:

- Web Applications: HttpOnly Cookies (tự động, secure hơn)
- Mobile/API Clients: Bearer Token trong Authorization header

**Security Features**:

- Bcrypt password hashing (12 rounds)
- JWT tokens (HS256)
- Token rotation on refresh
- Session management với device tracking
- Rate limiting
- HttpOnly cookies với SameSite=Lax
- Maximum 10 concurrent sessions per user

---

## Endpoints

### 1. Register (Đăng ký)

Tạo tài khoản người dùng mới với email và mật khẩu. Sau khi đăng ký thành công, hệ thống sẽ gửi email xác thực đến địa chỉ email đã đăng ký. Người dùng phải xác thực email trước khi có thể đăng nhập.

**Endpoint**: `POST /auth/register`

**Rate Limit**: 5 requests / 15 phút (900 seconds)

**Authentication**: Không yêu cầu (Public)

#### Request Body

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

| Field    | Type   | Required | Validation           | Description          |
| -------- | ------ | -------- | -------------------- | -------------------- |
| email    | string | Yes      | Valid email format   | Email của người dùng |
| password | string | Yes      | Minimum 8 characters | Mật khẩu             |

**Password Requirements:**

- Tối thiểu 8 ký tự
- Không yêu cầu chữ hoa, chữ thường, hoặc số (validation đơn giản cho đăng ký)

#### Response

**Success (201 Created)**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/register"
}
```

**Error Responses**

- **400 Bad Request**: Dữ liệu không hợp lệ

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "email",
      "constraint": "isEmail",
      "message": "email must be an email",
      "value": "invalid-email"
    },
    {
      "field": "password",
      "constraint": "minLength",
      "message": "password must be longer than or equal to 8 characters",
      "value": "short"
    }
  ],
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/register"
}
```

- **409 Conflict**: Email đã tồn tại

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Email already in use",
  "error": "Conflict",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/register"
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
  "path": "/auth/register"
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

#### Notes

- Mật khẩu được hash bằng bcrypt với salt rounds = 12
- Token xác thực email có hiệu lực 48 giờ
- Email xác thực được gửi tự động sau khi đăng ký (nếu gửi thất bại, user vẫn được tạo)
- Người dùng **bắt buộc** phải xác thực email trước khi có thể đăng nhập
- Token xác thực cũng được hash bằng bcrypt (salt rounds = 10) trước khi lưu vào database

---

### 2. Login (Đăng nhập)

Đăng nhập vào hệ thống với email và password. Tự động set cookies và trả về tokens trong response body.

**Endpoint**: `POST /auth/login`

**Rate Limit**: 10 requests / 15 phút (900 seconds)

**Authentication**: Không yêu cầu (Public)

#### Request Body

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

| Field    | Type   | Required | Description      |
| -------- | ------ | -------- | ---------------- |
| email    | string | Yes      | Email đã đăng ký |
| password | string | Yes      | Mật khẩu         |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/login"
}
```

**Note về Response Body**: Mặc dù tokens được set trong HttpOnly cookies (an toàn cho web apps), chúng cũng được trả về trong response body để hỗ trợ mobile/API clients có thể lưu vào storage (localStorage, AsyncStorage, etc.)

**Response Headers (Set-Cookie)**:

```
Set-Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Lax; Max-Age=3600; Path=/
Set-Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/
```

| Field        | Type   | Description                                       |
| ------------ | ------ | ------------------------------------------------- |
| accessToken  | string | JWT token để xác thực các API requests (1 giờ)    |
| refreshToken | string | Token để làm mới accessToken khi hết hạn (7 ngày) |

**Error Responses**

- **400 Bad Request**: Dữ liệu không hợp lệ

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "email",
      "constraint": "isEmail",
      "message": "email must be an email",
      "value": "invalid-email"
    },
    {
      "field": "password",
      "constraint": "isNotEmpty",
      "message": "password should not be empty"
    }
  ],
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/login"
}
```

- **401 Unauthorized**: Sai email hoặc mật khẩu

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid email or password",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/login"
}
```

- **401 Unauthorized**: Email chưa được xác thực

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Please verify your email address before logging in. Check your inbox for the verification link.",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/login"
}
```

- **401 Unauthorized**: Tài khoản không hỗ trợ đăng nhập bằng password

```json
{
  "success": false,
  "statusCode": 401,
  "message": "This account does not have a password set. Please use Google login or reset your password.",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/login"
}
```

- **401 Unauthorized**: Tài khoản bị vô hiệu hóa

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Account has been disabled",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/login"
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
  "path": "/auth/login"
}
```

#### cURL Examples

**With response tokens:**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

**With cookies (save cookies):**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

#### Notes

- **Dual Authentication Support**: Response tokens + HttpOnly cookies
- **Web Apps**: Sử dụng cookies (secure hơn, tự động gửi)
- **Mobile/APIs**: Sử dụng Authorization header với tokens từ response body
- **Secure Cookie**: Chỉ được bật trong production mode (NODE_ENV=production)
- Hệ thống tự động thu thập thông tin thiết bị từ request headers
- Mỗi người dùng có giới hạn **10 phiên đăng nhập đồng thời** (MAX_CONCURRENT_SESSIONS)
- Khi vượt quá giới hạn, phiên cũ nhất (theo lastUsedAt) sẽ tự động bị đăng xuất
- AccessToken: 1 giờ, RefreshToken: 7 ngày
- Password được verify bằng bcrypt.compare()
- Refresh token được hash với bcrypt (salt rounds = 10) trước khi lưu vào database

---

### 3. Logout (Đăng xuất)

Đăng xuất khỏi thiết bị hiện tại, xóa session và clear cookies.

**Endpoint**: `POST /auth/logout`

**Authentication**: Required (Bearer Token hoặc Cookie)

#### Headers (Option 1)

```
Authorization: Bearer {accessToken}
```

#### Request Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field        | Type   | Required | Description                                 |
| ------------ | ------ | -------- | ------------------------------------------- |
| refreshToken | string | No       | Refresh token (optional nếu sử dụng cookie) |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/logout"
}
```

**Response Headers (Clear cookies)**:

```
Set-Cookie: accessToken=; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/
Set-Cookie: refreshToken=; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/
```

**Error Responses**

- **400 Bad Request**: Refresh token không được cung cấp

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Refresh token not provided",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/logout"
}
```

- **400 Bad Request**: Refresh token không hợp lệ

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid refresh token",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/logout"
}
```

- **401 Unauthorized**: Access token không hợp lệ hoặc hết hạn

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/logout"
}
```

#### cURL Examples

**Using Authorization header:**

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Using cookies:**

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -c cookies.txt
```

#### Notes

- **Cookie Method**: Refresh token tự động lấy từ cookie nếu không có trong body
- **Token Method**: Cần truyền refresh token trong body
- **Token Verification**: Sử dụng bcrypt.compare() để so sánh refresh token với hash trong database
- Chỉ xóa phiên đăng nhập của thiết bị hiện tại (dựa vào refresh token)
- Các thiết bị khác vẫn giữ phiên đăng nhập
- Cookies tự động được clear (cả accessToken và refreshToken)
- Session record được xóa khỏi database

---

### 4. Refresh Token (Làm mới token)

Sử dụng refresh token để lấy cặp access token và refresh token mới. Hỗ trợ lấy refresh token từ cookie hoặc request body.

**Endpoint**: `POST /auth/refresh`

**Authentication**: Không yêu cầu (Public)

#### Request Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field        | Type   | Required | Description                                 |
| ------------ | ------ | -------- | ------------------------------------------- |
| refreshToken | string | No       | Refresh token (optional nếu sử dụng cookie) |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/refresh"
}
```

**Note về Response Body**: Tương tự login endpoint, tokens được trả về trong cả cookies (web) và response body (mobile/API).

**Response Headers (Set new cookies)**:

```
Set-Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Lax; Max-Age=3600; Path=/
Set-Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/
```

| Field        | Type   | Description                                    |
| ------------ | ------ | ---------------------------------------------- |
| accessToken  | string | JWT token mới để xác thực các API requests     |
| refreshToken | string | Refresh token mới (token cũ đã bị vô hiệu hóa) |

**Error Responses**

- **400 Bad Request**: Refresh token không được cung cấp

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Refresh token not provided",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/refresh"
}
```

- **401 Unauthorized**: Refresh token không hợp lệ

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid refresh token",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/refresh"
}
```

- **401 Unauthorized**: Refresh token hết hạn

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Refresh token has expired",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/auth/refresh"
}
```

**Response Headers (Clear cookies khi có lỗi)**:

```
Set-Cookie: accessToken=; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/
Set-Cookie: refreshToken=; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/
```

#### cURL Examples

**Using request body:**

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**Using cookies:**

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -c cookies.txt
```

#### Notes

- **Hybrid Support**: Lấy refresh token từ cookie trước, fallback sang body
- **Token Rotation**: Mỗi lần refresh, token cũ sẽ được update với token mới (session giữ nguyên ID)
- **Token Hashing**: Refresh token mới được hash bằng bcrypt (salt rounds = 10) trước khi lưu vào database
- **Session Preservation**: Session ID được giữ nguyên khi refresh, chỉ update `refreshToken` (hash) và `lastUsedAt`
- **Cookie Update**: Tự động set cookies mới cho web clients
- **Response Tokens**: Vẫn trả về tokens trong response body cho mobile/API clients
- **Device Info Update**: Thông tin thiết bị được cập nhật nếu có deviceInfo mới trong request
- **Token Validation**: Verify JWT trước, sau đó dùng bcrypt.compare() để tìm session trong database
- **Error Handling**: Khi có lỗi (invalid/expired token), cookies sẽ được tự động clear trong try-catch block của controller. Sau đó exception được re-throw để HttpExceptionFilter xử lý response
- **Expired Session Cleanup**: Session hết hạn được tự động xóa khỏi database
- **JWT First**: Verify JWT signature trước, sau đó mới compare hash trong database
- AccessToken mới: 1 giờ, RefreshToken mới: 7 ngày
- Both new tokens contain the same `sessionId` as the old one

---

## Token Information

### Access Token

- **Thuật toán**: HS256 (HMAC with SHA-256)
- **Thời gian sống**: 1 giờ
- **Cookie Name**: `accessToken`
- **Secret**: `JWT_SECRET` (environment variable)
- **Payload**:
  ```json
  {
    "sub": "userId",
    "sessionId": "clx1234567890abcdefghij",
    "iat": 1699286400,
    "exp": 1699290000
  }
  ```

### Refresh Token

- **Thuật toán**: HS256 (HMAC with SHA-256)
- **Thời gian sống**: 7 ngày
- **Cookie Name**: `refreshToken`
- **Secret**: `JWT_REFRESH_SECRET` (environment variable)
- **Lưu trữ**: Database (bảng Session)
- **Token Rotation**: Được áp dụng khi refresh
- **Payload**:
  ```json
  {
    "sub": "userId",
    "sessionId": "clx1234567890abcdefghij",
    "iat": 1699286400,
    "exp": 1700150400
  }
  ```

**Session ID trong JWT**:

- Session ID được tự động embed vào cả access token và refresh token
- Sử dụng để identify session hiện tại khi gọi API (VD: GET /users/sessions)
- Không cần truyền refresh token riêng để xác định "current session"
- Session ID được tạo khi login hoặc OAuth, và giữ nguyên khi refresh token

**Refresh Token Validation Flow**:

1. **Input Source**: Lấy refresh token từ cookie hoặc request body (cookie được ưu tiên)
2. **JWT Verification**: Verify JWT signature với `JWT_REFRESH_SECRET` và lấy userId từ payload
3. **Database Lookup**: Tìm tất cả sessions của user trong database
4. **Hash Comparison**: Sử dụng bcrypt.compare() để so sánh refresh token với các hash trong database
5. **Expiration Check**: Kiểm tra `expiresAt` field của session tìm được
6. **Token Generation**: Tạo cặp access/refresh token mới với cùng `sessionId`
7. **Hash New Token**: Hash refresh token mới bằng bcrypt (salt rounds = 10)
8. **Session Update**: Cập nhật session với refresh token hash mới và thông tin device
9. **Cookie Setting**: Set cookies mới cho client (web browsers)
10. **Response**: Trả về tokens trong response body (mobile/API clients)
11. **Error Cleanup**: Nếu có lỗi, tự động clear cookies và xóa invalid sessions

---

## Security Features

### Password Hashing

- **Algorithm**: bcrypt
- **Salt Rounds**: 12 (high security cho passwords)
- **Computation Time**: ~300-500ms per hash

### Refresh Token Hashing

- **Algorithm**: bcrypt
- **Salt Rounds**: 10 (balanced security cho refresh tokens)
- **Storage**: Hash được lưu trong database thay vì plain text
- **Verification**: Sử dụng bcrypt.compare() để so sánh token với hash
- **Security Benefit**: Ngăn chặn token theft nếu database bị compromised

### Rate Limiting

| Endpoint       | Limit                 |
| -------------- | --------------------- |
| POST /register | 5 requests / 15 phút  |
| POST /login    | 10 requests / 15 phút |
| POST /refresh  | Không giới hạn        |
| POST /logout   | Không giới hạn        |

**Note**: TTL = 900000ms (15 phút = 900 seconds)

### CORS Configuration

- **Credentials**: `true` (cho phép cookies cross-origin)
- **Origins**: Cấu hình qua `CORS_ORIGIN` environment variable (phải match chính xác)
- **Allowed Headers**: `Content-Type`, `Authorization`, `X-Client-Type`
- **Methods**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`

### Cookie Configuration

- **HttpOnly**: `true` (không thể truy cập qua JavaScript)
- **Secure**: `true` trong production (chỉ gửi qua HTTPS)
- **SameSite**: `lax` (bảo vệ CSRF)
- **Path**: `/` (available cho tất cả routes)
- **Domain**: Không set (default to current domain)

### Session Management

- **Số phiên đăng nhập đồng thời tối đa**: 10 sessions (AUTH_CONSTANTS.MAX_CONCURRENT_SESSIONS)
- **Khi vượt quá giới hạn**: Tự động đăng xuất phiên cũ nhất (dựa theo `lastUsedAt` field)
- **Thông tin lưu trữ trong Session table**:
  - `refreshToken`: JWT refresh token được hash bằng bcrypt (salt rounds = 10) trước khi lưu vào database
  - `userId`: User ID (foreign key)
  - `expiresAt`: Thời gian hết hạn của session
  - `deviceName`: Tên thiết bị (extracted from User-Agent)
  - `deviceType`: Loại thiết bị (Desktop, Mobile, Tablet)
  - `ipAddress`: IP address của request
  - `userAgent`: Full User-Agent string
  - `lastUsedAt`: Timestamp lần cuối sử dụng token
  - `createdAt`: Timestamp tạo session
- **Session Cleanup**: Tự động xóa sessions hết hạn khi refresh token
- **Refresh Token Security**: Refresh token được hash với bcrypt trước khi lưu vào database để tăng cường bảo mật. Khi verify, sử dụng bcrypt.compare() để so sánh token từ client với hash trong database

### JWT Strategy

- **Token Sources**: Authorization header (`Bearer {token}`) OR cookies (`accessToken`)
- **Priority**: Header token được ưu tiên trước, fallback về cookie
- **Validation Steps**:
  1. Extract token từ header hoặc cookie
  2. Verify JWT signature với `JWT_SECRET`
  3. Check token expiration
  4. Validate payload structure (must have `sub` field)
  5. Extract `sessionId` from payload (if present)
  6. Find user by ID từ payload
  7. Check user exists và `isActive = true`
  8. Return user object with `sessionId` attached
- **Payload Structure**:
  ```json
  {
    "sub": "user-id-uuid",
    "sessionId": "session-id-uuid",
    "iat": 1699286400,
    "exp": 1699290000
  }
  ```
- **Guards**: `JwtAuthGuard` sử dụng strategy này để protect routes
- **Current User Decorator**: `@CurrentUser()` returns user object với `sessionId` field

---

## Common Response Codes

| Status Code | Description                                      |
| ----------- | ------------------------------------------------ |
| 200         | OK - Request successful                          |
| 201         | Created - Resource created successfully          |
| 400         | Bad Request - Invalid input data                 |
| 401         | Unauthorized - Invalid or missing authentication |
| 409         | Conflict - Resource already exists               |
| 429         | Too Many Requests - Rate limit exceeded          |
| 500         | Internal Server Error - Server error             |

---

## Troubleshooting

### "Invalid email or password"

- Check email and password are correct
- Ensure email is verified (check `isEmailVerified` status)
- Check if account uses password login (not Google-only)

### "Account has been disabled"

- Contact administrator to re-enable account
- Check `isActive` field in database

### "Refresh token has expired"

- User needs to login again
- Refresh tokens expire after 7 days of inactivity
- Clear stored tokens and redirect to login

### "Too many requests"

- Wait 15 minutes before retrying
- Register: 5 attempts limit
- Login: 10 attempts limit

### Cookies not being set

- Check `CORS_ORIGIN` matches frontend URL exactly
- Ensure `credentials: 'include'` in fetch/axios
- Verify `NODE_ENV=production` for secure cookies in production
- Check SameSite policy compatibility with your setup
