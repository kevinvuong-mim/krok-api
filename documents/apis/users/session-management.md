# Session Management API Documentation

## Overview

API quản lý phiên đăng nhập (sessions) trên nhiều thiết bị. Cho phép xem danh sách thiết bị đang đăng nhập và đăng xuất khỏi thiết bị cụ thể.

**Base URL**: `/users`

---

## Endpoints

### 1. Get Active Sessions (Danh sách phiên đăng nhập)

Lấy danh sách tất cả các thiết bị đang đăng nhập của user hiện tại.

**Endpoint**: `GET /users/sessions`

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

#### Query Parameters

| Parameter | Type   | Required | Default | Description                              |
| --------- | ------ | -------- | ------- | ---------------------------------------- |
| page      | number | No       | 1       | Số trang (minimum: 1)                    |
| limit     | number | No       | 10      | Số sessions mỗi trang (min: 1, max: 100) |

#### Response

**Success (200 OK)**

```json
{
  "items": [
    {
      "id": "clx1234567890abcdefghij",
      "deviceName": "Chrome on macOS",
      "deviceType": "Desktop",
      "ipAddress": "192.168.1.100",
      "createdAt": "2025-11-07T08:00:00.000Z",
      "lastUsedAt": "2025-11-07T10:30:00.000Z",
      "expiresAt": "2025-11-14T08:00:00.000Z",
      "isCurrent": true
    },
    {
      "id": "clx0987654321zyxwvutsrq",
      "deviceName": "Safari on iPhone",
      "deviceType": "Mobile",
      "ipAddress": "192.168.1.101",
      "createdAt": "2025-11-06T15:20:00.000Z",
      "lastUsedAt": "2025-11-06T18:45:00.000Z",
      "expiresAt": "2025-11-13T15:20:00.000Z",
      "isCurrent": false
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "perPage": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

| Field                | Type    | Description                            |
| -------------------- | ------- | -------------------------------------- |
| items                | array   | Danh sách các phiên đăng nhập          |
| items[].id           | string  | Session ID (để dùng cho logout device) |
| items[].deviceName   | string  | Tên thiết bị (browser + OS)            |
| items[].deviceType   | string  | Loại thiết bị: Desktop, Mobile, Tablet |
| items[].ipAddress    | string  | Địa chỉ IP của thiết bị                |
| items[].createdAt    | string  | Thời điểm tạo session (ISO 8601)       |
| items[].lastUsedAt   | string  | Lần cuối sử dụng (ISO 8601)            |
| items[].expiresAt    | string  | Thời điểm hết hạn (ISO 8601)           |
| items[].isCurrent    | boolean | true nếu là thiết bị hiện tại          |
| meta                 | object  | Thông tin phân trang                   |
| meta.total           | number  | Tổng số sessions                       |
| meta.page            | number  | Trang hiện tại                         |
| meta.perPage         | number  | Số lượng sessions mỗi trang            |
| meta.totalPages      | number  | Tổng số trang                          |
| meta.hasNextPage     | boolean | Có trang tiếp theo hay không           |
| meta.hasPreviousPage | boolean | Có trang trước hay không               |

**Error Responses**

- **401 Unauthorized**: Access token không hợp lệ hoặc hết hạn

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/sessions"
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
  "path": "/users/sessions"
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
  "path": "/users/sessions"
}
```

#### cURL Example

**Using Authorization header:**

```bash
# Get first page (default)
curl -X GET http://localhost:3000/users/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get second page with 5 items per page
curl -X GET "http://localhost:3000/users/sessions?page=2&limit=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Using cookies:**

```bash
# Get first page (default)
curl -X GET http://localhost:3000/users/sessions \
  -b "accessToken=YOUR_TOKEN"

# Get specific page with custom limit
curl -X GET "http://localhost:3000/users/sessions?page=1&limit=20" \
  -b "accessToken=YOUR_TOKEN"
```

#### Notes

- **Pagination**:
  - Default: `page=1`, `limit=10`
  - Limit range: 1-100 (values >100 will be capped at 100)
  - Invalid page numbers (<1) will default to 1
- Chỉ hiển thị sessions chưa hết hạn (`expiresAt >= now`)
- Sessions được sắp xếp theo `lastUsedAt` giảm dần (mới nhất trước)
- `isCurrent` được set `true` tự động dựa trên `sessionId` trong JWT access token
- JWT payload structure:
  ```json
  {
    "sub": "userId",
    "sessionId": "clx1234567890abcdefghij"
  }
  ```
- Session matching `sessionId` trong token sẽ có `isCurrent: true`
- Default values nếu không có data:
  - `deviceName`: "Unknown"
  - `deviceType`: "Unknown"
  - `ipAddress`: "Unknown"
- Response luôn bao gồm array `items` (có thể empty nếu không có session nào)

---

### 2. Logout All Devices (Đăng xuất tất cả thiết bị)

Đăng xuất khỏi tất cả các thiết bị bằng cách xóa tất cả sessions và xoá cookie phiên đăng nhập (accessToken). User cần đăng nhập lại trên tất cả thiết bị.

**Endpoint**: `DELETE /users/sessions`

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
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/sessions"
}
```

#### cURL Example

**Using Authorization header:**

```bash
curl -X DELETE http://localhost:3000/users/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Using cookies:**

```bash
curl -X DELETE http://localhost:3000/users/sessions \
  -b "accessToken=YOUR_TOKEN"
```

#### Notes

- Xóa **TẤT CẢ** sessions của user (gọi `prisma.session.deleteMany({ where: { userId } })`)
- Xoá cookies xác thực (`accessToken` và `refreshToken`) trên thiết bị hiện tại để force logout ngay lập tức
- Bao gồm cả thiết bị hiện tại đang gọi API
- User cần đăng nhập lại trên tất cả thiết bị
- Access tokens hiện tại vẫn valid cho đến khi hết hạn (1h), nhưng không thể refresh
- Response data luôn là `null`
- Hữu ích khi:
  - Nghi ngờ tài khoản bị xâm nhập
  - Muốn đăng xuất khỏi tất cả thiết bị cũ
  - Đổi mật khẩu và muốn force re-login (tương tự behavior của PUT /users/password)
  - Phát hiện activity đáng ngờ

---

### 3. Logout Specific Device (Đăng xuất thiết bị cụ thể)

Đăng xuất khỏi một thiết bị cụ thể bằng session ID.

**Endpoint**: `DELETE /users/sessions/:sessionId`

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

#### URL Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| sessionId | string | Session ID (từ GET /sessions) |

#### Response

**Success (200 OK)**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": null,
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/sessions/:sessionId"
}
```

**Error Responses**

- **401 Unauthorized**: Access token không hợp lệ hoặc hết hạn

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/sessions/:sessionId"
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
  "path": "/users/sessions/:sessionId"
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
  "path": "/users/sessions/:sessionId"
}
```

- **400 Bad Request**: Session không tồn tại hoặc không thuộc về user

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Session not found",
  "error": "Bad Request",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/sessions/:sessionId"
}
```

- **401 Unauthorized**: Access token không hợp lệ

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "path": "/users/sessions/:sessionId"
}
```

#### cURL Example

**Using Authorization header:**

```bash
curl -X DELETE http://localhost:3000/users/sessions/clx1234567890abcdefghij \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Using cookies:**

```bash
curl -X DELETE http://localhost:3000/users/sessions/clx1234567890abcdefghij \
  -b "accessToken=YOUR_TOKEN"
```

#### Notes

- Chỉ xóa session được chỉ định (gọi `prisma.session.delete({ where: { id: sessionId } })`)
- Không ảnh hưởng đến thiết bị khác
- Validate session thuộc về user hiện tại (check `userId`)
- User có thể logout thiết bị hiện tại (sẽ cần đăng nhập lại)
- Response data luôn là `null`
- Hữu ích khi:
  - Thấy thiết bị lạ trong danh sách
  - Muốn đăng xuất khỏi thiết bị cũ không còn sử dụng
  - Remote logout từ thiết bị khác
  - Quên đăng xuất ở máy public/shared

---

## Session Lifecycle

### Session Creation

Sessions được tạo tự động khi:

- User đăng nhập (POST /auth/login)
- User đăng nhập bằng Google (GET /auth/google/callback)
- Refresh token (POST /auth/refresh) - token rotation with same session

**Session ID in JWT**:

- Khi tạo session mới, backend generate session ID
- Session ID được embed vào cả access token và refresh token payload
- Frontend không cần lưu hoặc quản lý session ID riêng
- Access token tự động chứa session ID để identify current session

### Session Expiry

- **Refresh Token TTL**: 7 ngày (cấu hình trong `AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRATION`)
- **Auto cleanup**: Expired sessions được tự động xóa bởi cleanup service
- **Manual cleanup**: User có thể xóa bất kỳ lúc nào

### Session Limit

- **Max concurrent sessions**: 10 (cấu hình trong `AUTH_CONSTANTS.MAX_CONCURRENT_SESSIONS`)
- **Enforcement**: Khi đạt limit, session cũ nhất (oldest `lastUsedAt`) bị xóa tự động
- **Example**: Nếu limit = 10, login lần thứ 11 sẽ xóa session cũ nhất
- **Automatic cleanup**: Xảy ra trong `auth.service.ts` method `enforceSessionLimit()`

---

## Use Cases

### Use Case 1: User kiểm tra thiết bị đang đăng nhập

**Scenario**: User muốn xem có bao nhiêu thiết bị đang đăng nhập tài khoản của họ.

**Steps**:

1. User vào Settings > Security > Active Devices
2. Frontend gọi `GET /users/sessions`
3. Hiển thị danh sách devices với thông tin:
   - Device name và type (icon)
   - IP address
   - Last active time
   - "Current device" badge

**Expected Result**: User thấy list tất cả active sessions, với current device được highlight.

---

### Use Case 2: User phát hiện thiết bị lạ

**Scenario**: User thấy một device không nhận ra trong danh sách.

**Steps**:

1. User xem session list, thấy "Chrome on Windows" nhưng họ không có Windows PC
2. User click "Logout" button trên session đó
3. Frontend gọi `DELETE /users/sessions/{sessionId}`
4. Session bị xóa, device kia bị logout
5. Frontend refresh list, thiết bị lạ không còn

**Expected Result**: Thiết bị lạ bị logout, user account an toàn.

---

### Use Case 3: User bị mất điện thoại

**Scenario**: User mất phone và muốn logout khỏi tất cả devices để bảo mật.

**Steps**:

1. User login từ computer
2. Vào Settings > Security
3. Click "Logout All Devices"
4. Confirm dialog warning: "This will logout all devices including this one"
5. Frontend gọi `DELETE /users/sessions`
6. Tất cả sessions bị xóa
7. User tự động logout và redirect về login page

**Expected Result**: Mọi device bị logout, kể cả lost phone. User phải login lại.

---

### Use Case 4: User đổi mật khẩu

**Scenario**: User đổi password và muốn force re-login everywhere.

**Steps**:

1. User gọi `PUT /users/password` với current và new password
2. Backend xử lý:
   - Validate và update password
   - Tự động gọi `prisma.session.deleteMany({ where: { userId } })`
3. Tất cả sessions bị xóa (giống như logout all)
4. User phải login lại với password mới

**Expected Result**: Security enhanced, tất cả devices phải re-authenticate.

---

## Related Endpoints

- **POST /auth/login**: Tạo session mới khi login
- **POST /auth/refresh**: Rotate session (token rotation)
- **POST /auth/logout**: Logout current device
- **PUT /users/password**: Tự động logout all devices sau khi đổi password
- **GET /users/me**: Get user profile (không liên quan trực tiếp nhưng useful)

---

## Troubleshooting

### Problem: `isCurrent` luôn là `false`

**Cause**:

- Access token không chứa `sessionId` (token cũ từ trước khi implement feature này)
- Session đã bị xóa nhưng token vẫn còn valid

**Solution**:

- Logout và login lại để get token mới với `sessionId`
- Refresh token để get access token mới
- Check JWT payload có field `sessionId` không

### Problem: Sessions không hiển thị

**Cause**:

- Token hết hạn
- User chưa login
- Tất cả sessions đã expired

**Solution**:

- Check access token còn valid
- Login lại nếu cần
- Check `expiresAt` của sessions

### Problem: Cannot delete session

**Cause**:

- Session ID không tồn tại
- Session không thuộc về user hiện tại
- Session đã bị xóa

**Solution**:

- Verify session ID đúng
- Refresh session list
- Check authorization

### Problem: "Session not found" error

**Cause**: Session đã bị xóa (expired, logout, hoặc replaced do session limit)

**Solution**:

- Refresh session list
- Accept rằng session không còn tồn tại
- User có thể đã logout từ device đó

---

## Security Considerations

### Session Security

1. **Session ID in JWT**: Session ID được embed trong token payload để track current session
2. **Refresh token rotation**: Token mới khi refresh, nhưng giữ nguyên session ID
3. **Device limit**: Ngăn unlimited sessions
4. **IP tracking**: Phát hiện suspicious activity
5. **Last used tracking**: Identify inactive sessions

### JWT Payload Structure

Access Token và Refresh Token đều chứa:

```json
{
  "sub": "userId", // User ID
  "sessionId": "sessionId", // Session ID
  "iat": 1699430400, // Issued at
  "exp": 1699434000 // Expiration
}
```

**Benefits của Session ID trong JWT**:

- Không cần gửi refresh token để identify current session
- Frontend không cần track session ID riêng
- GET request không cần body (tuân thủ HTTP standards)
- Secure và stateless

### Privacy Protection

1. **User-only access**: Chỉ user mới xem được sessions của mình
2. **No sensitive data**: Không lưu sensitive data trong session
3. **Secure storage**: Refresh tokens được lưu an toàn trong database

### Attack Prevention

1. **Session hijacking**: Token rotation giảm thiểu risk
2. **Concurrent login limit**: Ngăn spam sessions
3. **Auto cleanup**: Xóa expired sessions
4. **Logout all**: Quick response khi nghi ngờ bị hack
