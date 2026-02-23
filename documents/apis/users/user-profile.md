# User Profile API Documentation

## Overview

API lấy thông tin profile đầy đủ của người dùng hiện tại dựa trên JWT token. Bao gồm thông tin về phương thức đăng nhập (`hasPassword`, `hasGoogleAuth`) để hỗ trợ logic frontend.

**Base URL**: `/users`

---

## Endpoint

### Get Current User Profile (Lấy thông tin profile đầy đủ)

Lấy thông tin profile đầy đủ của user đang đăng nhập, bao gồm `hasPassword` và `hasGoogleAuth` để xác định phương thức đăng nhập.

**Endpoint**: `GET /users/me`

**Authentication**: Required (Bearer Token hoặc Cookie)

**Rate Limit**: Không giới hạn

#### Headers

```
Authorization: Bearer {accessToken}
```

**Or using cookies:**

```
Cookie: accessToken=<token>
```

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "id": "clx1234567890abcdefghij",
    "email": "user@example.com",
    "fullName": "John Doe",
    "username": "johndoe",
    "avatar": "https://example.com/avatar.jpg",
    "phoneNumber": "+84 123 456 789",
    "isActive": true,
    "isEmailVerified": true,
    "hasPassword": true,
    "hasGoogleAuth": false,
    "createdAt": "2025-11-07T00:00:00.000Z",
    "updatedAt": "2025-11-07T00:00:00.000Z"
  },
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/me"
}
```

#### Response Schema

| Field           | Type         | Description                                                        |
| --------------- | ------------ | ------------------------------------------------------------------ |
| id              | string       | User ID (CUID format)                                              |
| email           | string       | Email address (unique, required)                                   |
| fullName        | string\|null | Tên đầy đủ của user (null nếu chưa set)                            |
| username        | string\|null | Username (null nếu chưa set)                                       |
| avatar          | string\|null | URL avatar (null nếu không có)                                     |
| phoneNumber     | string\|null | Số điện thoại (null nếu chưa set)                                  |
| isActive        | boolean      | Trạng thái tài khoản (true = active, false = disabled)             |
| isEmailVerified | boolean      | Email đã được xác thực chưa (true = verified)                      |
| hasPassword     | boolean      | User có password được set hay không (computed from password field) |
| hasGoogleAuth   | boolean      | User có liên kết Google OAuth không (computed from googleId field) |
| createdAt       | string       | Thời gian tạo tài khoản (ISO 8601 format)                          |
| updatedAt       | string       | Thời gian cập nhật cuối (ISO 8601 format)                          |

**Important Notes**:

- `hasPassword` = `!!user.password` - Boolean flag, không expose actual password
- `hasGoogleAuth` = `!!user.googleId` - Indicates nếu Google account được linked
- `fullName`, `username`, `avatar`, `phoneNumber` có thể null nếu user chưa set
- Response không bao gồm sensitive fields: `password`, `googleId`, `verificationToken`, etc.

**Error Responses**

- **401 Unauthorized**: Token không hợp lệ hoặc hết hạn

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/me"
}
```

- **403 Forbidden**: User không tồn tại hoặc bị vô hiệu hóa

```json
{
  "success": false,
  "statusCode": 403,
  "message": "User does not exist",
  "error": "Forbidden",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/me"
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
  "path": "/users/me"
}
```

#### cURL Example

**Using Authorization header:**

```bash
curl -X GET http://localhost:3000/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Using cookies:**

```bash
curl -X GET http://localhost:3000/users/me \
  -b "accessToken=YOUR_TOKEN"
```

---

### Get User Profile by ID or Username (Lấy thông tin public profile của người khác)

Lấy thông tin public profile của user khác thông qua ID hoặc username. Endpoint này chỉ trả về thông tin công khai, không bao gồm thông tin nhạy cảm.

**Endpoint**: `GET /users/:identifier`

**Authentication**: Required (Bearer Token hoặc Cookie)

**Rate Limit**: Không giới hạn

#### Path Parameters

| Parameter  | Type   | Description                                          |
| ---------- | ------ | ---------------------------------------------------- |
| identifier | string | User ID (CUID format) hoặc username của user cần xem |

#### Headers

```
Authorization: Bearer {accessToken}
```

**Or using cookies:**

```
Cookie: accessToken=<token>
```

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "id": "clx1234567890abcdefghij",
    "username": "johndoe",
    "fullName": "John Doe",
    "avatar": "https://example.com/avatar.jpg",
    "createdAt": "2025-11-07T00:00:00.000Z"
  },
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/johndoe"
}
```

#### Response Schema

| Field     | Type         | Description                               |
| --------- | ------------ | ----------------------------------------- |
| id        | string       | User ID (CUID format)                     |
| username  | string\|null | Username (null nếu chưa set)              |
| fullName  | string\|null | Tên đầy đủ của user (null nếu chưa set)   |
| avatar    | string\|null | URL avatar (null nếu không có)            |
| createdAt | string       | Thời gian tạo tài khoản (ISO 8601 format) |

**Important Notes**:

- Endpoint này **chỉ trả về thông tin công khai** (public profile)
- **Không bao gồm**: `email`, `isActive`, `isEmailVerified`, `hasPassword`, `hasGoogleAuth`, `updatedAt`
- `identifier` có thể là **User ID** (UUID) hoặc **username**
- Chỉ trả về user có `isActive = true` (user bị disable sẽ trả về 404)
- `username`, `fullName`, `avatar` có thể null nếu user chưa set

**Error Responses**

- **401 Unauthorized**: Token không hợp lệ hoặc hết hạn

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/johndoe"
}
```

- **404 Not Found**: User không tồn tại hoặc bị vô hiệu hóa

```json
{
  "success": false,
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/johndoe"
}
```

#### cURL Examples

**Using User ID (CUID):**

```bash
curl -X GET http://localhost:3000/users/clx1234567890abcdefghij \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Using username:**

```bash
curl -X GET http://localhost:3000/users/johndoe \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Using cookies:**

```bash
curl -X GET http://localhost:3000/users/johndoe \
  -b "accessToken=YOUR_TOKEN"
```

#### Use Cases

- Xem profile của user khác trong social features
- Hiển thị thông tin tác giả của post/comment
- User directory/search results
- @ mention autocomplete
- Friend/follower lists

---

## Business Logic

### GET /users/me (Current User Profile)

1. **Extract userId**: Lấy userId từ JWT token payload (`sub` field)
2. **Query database**: Tìm user với Prisma `findUnique({ where: { id: userId } })`
3. **Check user exists**: Throw `ForbiddenException` (403) nếu user không tồn tại (via JWT Strategy)
4. **Check user active**: Throw `ForbiddenException` (403) nếu user bị disabled (via JWT Strategy)
5. **Check session valid**: Throw `ForbiddenException` (403) nếu session không tồn tại hoặc đã bị logout (via JWT Strategy)
6. **Select fields**: Chỉ select các fields cần thiết (bao gồm `password` và `googleId` để check)
7. **Compute flags**:
   - `hasPassword = !!user.password`
   - `hasGoogleAuth = !!user.googleId`
8. **Return safe data**: Exclude sensitive fields, return computed flags
9. **Auto-wrap response**: Response được wrap trong standard format bởi `ResponseInterceptor`

### GET /users/:identifier (Other User Profile)

1. **Extract identifier**: Lấy `identifier` từ path parameter (có thể là ID hoặc username)
2. **Query database**: Tìm user với Prisma `findFirst({ where: { OR: [{ id }, { username }], isActive: true } })`
3. **Check user exists**: Throw `NotFoundException` (404) nếu user không tồn tại hoặc bị disabled
4. **Select public fields only**: Chỉ select `id`, `username`, `fullName`, `avatar`, `createdAt`
5. **Return public data**: Không expose sensitive information
6. **Auto-wrap response**: Response được wrap trong standard format bởi `ResponseInterceptor`

**Key Differences**:

- `/me` trả về **full profile** với sensitive info (email, verification status, auth methods)
- `/:identifier` chỉ trả về **public profile** (username, name, avatar)
- `/me` dùng `findUnique` với ID từ token, `/:identifier` dùng `findFirst` với OR condition
- `/:identifier` filter `isActive: true`, `/me` check qua JWT Strategy

---

## Related Endpoints

- **GET /users/me**: Get current user's full profile (private info)
- **GET /users/:identifier**: Get other user's public profile (by ID or username)
- **PUT /users/password**: Change password (uses `hasPassword` để decide logic)
- **GET /users/sessions**: View active sessions
- **POST /auth/login**: Login endpoint
- **POST /auth/register**: Create account
- **GET /auth/google**: Link Google account

---

## Troubleshooting

### Problem: "User not found" error

**Cause**:

- User đã bị xóa từ database
- Token chứa invalid userId

**Solution**:

- Logout user và redirect to login
- Clear stored tokens
- User cần đăng ký lại

### Problem: Profile data không update

**Cause**:

- Frontend cache stale data
- Không refetch sau updates

**Solution**:

- Call refetch() sau mỗi update
- Implement cache invalidation
- Use SWR or React Query cho auto-revalidation

### Problem: Avatar không hiển thị

**Cause**:

- URL invalid hoặc expired
- CORS issues
- Google avatar URL expired

**Solution**:

- Check `user.avatar !== null`
- Use fallback image
- Handle image load errors:
  ```typescript
  <img
    src={user.avatar}
    onError={(e) => e.currentTarget.src = '/default-avatar.png'}
  />
  ```

### Problem: `hasPassword` và `hasGoogleAuth` đều false

**Cause**: Data inconsistency (không nên xảy ra)

**Solution**:

- Check database integrity
- User cần reset hoặc set password
- Contact support

### Problem: Không tìm thấy user khi search bằng username (GET /users/:identifier)

**Cause**:

- Username không tồn tại
- User đã bị disable (`isActive = false`)
- Username chứa ký tự đặc biệt không được encode

**Solution**:

- Verify username tồn tại trong database
- Check `isActive` status của user
- URL encode username nếu chứa ký tự đặc biệt:
  ```javascript
  const encodedUsername = encodeURIComponent(username);
  fetch(`/users/${encodedUsername}`);
  ```

### Problem: Endpoint trả về user hiện tại thay vì user khác khi dùng GET /users/me

**Cause**: Route order issue - `/users/me` phải được define trước `/users/:identifier`

**Solution**:

- Verify route order trong controller (đã fix - `/me` ở trước `:identifier`)
- Clear route cache nếu cần

---

## Notes

### GET /users/me

- **Read-only endpoint**: Chỉ GET, không modify data
- **No rate limiting**: Có thể call nhiều lần không giới hạn
- **Automatic wrapping**: Response được wrap bởi `ResponseInterceptor`
- **JWT required**: Không thể anonymous access
- **User-specific**: Chỉ return data của user hiện tại
- **Computed fields**: `hasPassword` và `hasGoogleAuth` được compute runtime, không store trong DB
- **Nullable fields**: `fullName`, `username`, `avatar`, `phoneNumber` có thể null - handle gracefully in frontend

### GET /users/:identifier

- **Read-only endpoint**: Chỉ GET, không modify data
- **Public profile only**: Chỉ trả về thông tin công khai, không có email/sensitive data
- **JWT required**: Cần authentication để xem profile người khác (prevent abuse)
- **Flexible identifier**: Có thể dùng User ID (UUID) hoặc username
- **Active users only**: User bị disable sẽ trả về 404
- **No rate limiting**: Có thể call nhiều lần không giới hạn
- **Nullable fields**: `username`, `fullName`, `avatar` có thể null
- **Route order**: Endpoint này phải được define **sau** `/users/me` để tránh conflict
