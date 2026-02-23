# Update User Profile API

API cho phép người dùng cập nhật thông tin cá nhân của họ.

## Endpoint

```
PUT /users/me
```

## Authentication

Yêu cầu JWT token trong:

- **Cookie**: `access_token` (HttpOnly cookie)
- **Header**: `Authorization: Bearer <access_token>`

## Request Body

```json
{
  "username": "johndoe",
  "fullName": "John Doe",
  "phoneNumber": "+84 123 456 789"
}
```

### Request Fields

Tất cả các trường đều là **optional** (có thể gửi một hoặc nhiều trường):

| Field         | Type   | Required | Validation                                                                                                                                                                                 | Description               |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `username`    | string | No       | - Min: 3 characters<br>- Max: 20 characters<br>- Pattern: chỉ chữ cái, số, dấu chấm (.), gạch dưới (\_)<br>- Bắt đầu và kết thúc bằng chữ hoặc số<br>- Không có hai dấu đặc biệt liên tiếp | Username duy nhất         |
| `fullName`    | string | No       | - Max: 100 characters                                                                                                                                                                      | Tên đầy đủ của người dùng |
| `phoneNumber` | string | No       | - Min: 10 characters<br>- Max: 20 characters<br>- Pattern: số, +, -, khoảng trắng, ngoặc đơn                                                                                               | Số điện thoại             |

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": null,
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

**Note**: Response `data` luôn là `null`. Endpoint này chỉ xác nhận cập nhật thành công mà không trả về thông tin user. Để lấy thông tin user đã cập nhật, gọi endpoint `GET /users/me`.

### Error Responses

#### 400 Bad Request - Validation Error

Khi dữ liệu không hợp lệ:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "username",
      "constraint": "minLength",
      "message": "Username must be at least 3 characters long",
      "value": "ab"
    },
    {
      "field": "username",
      "constraint": "matches",
      "message": "Username must start and end with a letter or number, contain only letters, numbers, dots, and underscores, and cannot have consecutive special characters",
      "value": "ab"
    },
    {
      "field": "phoneNumber",
      "constraint": "matches",
      "message": "Phone number can only contain numbers, +, -, spaces, and parentheses",
      "value": "invalid"
    }
  ],
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

#### 401 Unauthorized

Khi không có JWT token hoặc token không hợp lệ:

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized",
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

#### 404 Not Found

Khi người dùng không tồn tại:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found",
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

#### 409 Conflict

Khi username đã được sử dụng bởi người dùng khác:

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Username is already taken",
  "error": "Conflict",
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

## Examples

### Example 1: Cập nhật tất cả thông tin

**Request:**

```bash
curl -X PUT http://localhost:3000/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "username": "johndoe",
    "fullName": "John Doe",
    "phoneNumber": "+84 123 456 789"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": null,
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

### Example 2: Cập nhật chỉ username

**Request:**

```bash
curl -X PUT http://localhost:3000/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "username": "newusername"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": null,
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

### Example 3: Cập nhật số điện thoại

**Request:**

```bash
curl -X PUT http://localhost:3000/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "phoneNumber": "+1 (555) 123-4567"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": null,
  "timestamp": "2024-12-01T07:00:00.000Z",
  "path": "/users/me"
}
```

## Validation Rules

### Username

- Độ dài: 3-20 ký tự
- Chỉ chấp nhận: chữ cái (a-z, A-Z), số (0-9), dấu chấm (.), gạch dưới (\_)
- Bắt đầu và kết thúc bằng chữ cái hoặc số
- Không được có hai dấu đặc biệt (. hoặc \_) liên tiếp
- Phải là duy nhất trong hệ thống
- Ví dụ username hợp lệ:
  - `john.doe`
  - `user_123`
  - `jane.smith_99`
  - `tech.user`
- Ví dụ username không hợp lệ:
  - `.john` (bắt đầu bằng dấu chấm)
  - `user..name` (hai dấu chấm liên tiếp)
  - `name_` (kết thúc bằng gạch dưới)
  - `ab` (quá ngắn, dưới 3 ký tự)

### Full Name

- Độ dài tối đa: 100 ký tự

### Phone Number

- Độ dài: 10-20 ký tự
- Chỉ chấp nhận: số (0-9), dấu cộng (+), dấu trừ (-), khoảng trắng, ngoặc đơn ()
- Ví dụ format hợp lệ:
  - `+84 123 456 789`
  - `+1 (555) 123-4567`
  - `0123456789`
  - `+84-123-456-789`

## Notes

- Endpoint này chỉ cập nhật các trường được gửi trong request body
- Các trường không được gửi sẽ giữ nguyên giá trị cũ
- Username phải unique - nếu username đã tồn tại, API sẽ trả về lỗi 409 Conflict
- Nếu username trong request giống với username hiện tại của user, không cần kiểm tra uniqueness
- Tất cả các trường đều optional - có thể gửi request body rỗng `{}`
- **Avatar không thể update qua endpoint này** - sử dụng `PUT /users/me/avatar` để upload avatar
- Email không thể thay đổi qua endpoint này
- Thời gian `updatedAt` sẽ tự động được cập nhật khi có thay đổi
- **Response không trả về data**: Endpoint này chỉ trả về `data: null` để xác nhận cập nhật thành công
- Để lấy thông tin user đã cập nhật, sử dụng `GET /users/me` sau khi cập nhật

## Related APIs

- [Get User Profile](./user-profile.md) - Lấy thông tin profile hiện tại
- [Update Avatar](./update-avatar.md) - Upload và cập nhật avatar
- [Change Password](./change-password.md) - Đổi mật khẩu
- [Session Management](./session-management.md) - Quản lý phiên đăng nhập
