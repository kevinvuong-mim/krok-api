# Video Search API Documentation

## Overview

API tìm kiếm video YouTube thông qua Innertube API. Endpoint này là public, không yêu cầu authentication.

**Base Path**: `/video`

---

## Endpoint

### Search Videos

Tìm video theo từ khóa và hỗ trợ phân trang bằng `continuation` token.

**Method**: `GET`

**URL**: `/video/search`

**Authentication**: Not required (`@Public()`)

### Query Parameters

| Parameter      | Type   | Required | Validation                     | Description                |
| -------------- | ------ | -------- | ------------------------------ | -------------------------- |
| `query`        | string | Yes      | `IsString`, `IsNotEmpty`, trim | Từ khóa tìm kiếm           |
| `continuation` | string | No       | `IsString`, `IsOptional`, trim | Token để lấy trang kế tiếp |

### Request Example

```http
GET /video/search?query=nestjs%20tutorial
```

```http
GET /video/search?query=nestjs%20tutorial&continuation=TOKEN_HERE
```

---

## Success Response

**Status**: `200 OK`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "items": [
      {
        "id": "dQw4w9WgXcQ",
        "title": "NestJS Tutorial - Full Course for Beginners",
        "duration": "3:42:15",
        "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "channelName": "Tech Academy",
        "channelAvatar": "https://yt3.ggpht.com/ytc/AAUvwn..."
      }
    ],
    "continuation": "NEXT_PAGE_TOKEN"
  },
  "timestamp": "2026-02-23T10:00:00.000Z",
  "path": "/video/search?query=nestjs%20tutorial"
}
```

### Data Schema

| Field          | Type             | Description                                     |
| -------------- | ---------------- | ----------------------------------------------- |
| `items`        | `SearchItem[]`   | Danh sách video                                 |
| `continuation` | `string \| null` | Token cho trang kế tiếp, `null` nếu hết dữ liệu |

### `SearchItem`

| Field           | Type             | Description      |
| --------------- | ---------------- | ---------------- |
| `id`            | `string \| null` | YouTube video ID |
| `title`         | `string \| null` | Tiêu đề video    |
| `duration`      | `string \| null` | Thời lượng video |
| `thumbnail`     | `string \| null` | URL thumbnail    |
| `channelName`   | `string \| null` | Tên kênh         |
| `channelAvatar` | `string \| null` | URL avatar kênh  |

---

## Error Responses

### 400 Bad Request (Validation)

Khi thiếu `query`, hoặc `query` rỗng sau khi trim.

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "constraint": "isNotEmpty",
      "message": "query should not be empty",
      "value": "",
      "field": "query"
    }
  ],
  "timestamp": "2026-02-23T10:00:00.000Z",
  "path": "/video/search?query=%20%20%20"
}
```

### 500 Internal Server Error

Ví dụ khi không extract được Innertube config từ YouTube.

```json
{
  "success": false,
  "statusCode": 500,
  "message": "Failed to extract config",
  "error": "Internal Server Error",
  "timestamp": "2026-02-23T10:00:00.000Z",
  "path": "/video/search?query=nestjs"
}
```

---

## cURL

```bash
curl -X GET "https://api.example.com/video/search?query=nestjs%20tutorial"
```

```bash
curl -X GET "https://api.example.com/video/search?query=nestjs%20tutorial&continuation=TOKEN_HERE"
```

---

## Notes

- Service gọi trực tiếp YouTube Innertube Search API bằng `axios`.
- Timeout hiện tại cho request YouTube: `20000ms`.
- Các field trong `SearchItem` có thể `null` khi YouTube không trả về dữ liệu tương ứng.
