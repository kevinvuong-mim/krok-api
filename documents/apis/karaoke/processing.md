# Karaoke Processing API Documentation

## Overview

API để xử lý video karaoke từ YouTube. API sẽ:

1. Tải video từ YouTube
2. Tách vocals từ instrumental (voice separation)
3. Tạo lyrics từ vocals (speech-to-text with word timing)
4. Lưu trữ instrumental và lyrics

Quá trình xử lý được thực hiện asynchronously qua BullMQ queue, **không yêu cầu authentication** (`@Public()`).

**Base Path**: `/karaoke`

---

## Architecture

```
API Request → BullMQ Queue (Redis) → Worker (Node.js + Python) → AWS S3
                                    ↓
                              Database (Prisma)
```

- **API**: Tiếp nhận request, enqueue job, trả về jobId
- **Worker**: Xử lý Python pipeline (yt-dlp, demucs, whisper)
- **Redis**: Queue lưu trữ jobs
- **S3**: Lưu instrumental và lyrics JSON

---

## Endpoints

### 1. Request Karaoke Processing

Gửi yêu cầu xử lý karaoke cho một video YouTube.

**Method**: `POST`

**URL**: `/karaoke/request`

**Authentication**: Not required (`@Public()`)

**Status Code**: `200 OK`

#### Request Body

```json
{
  "videoId": "dQw4w9WgXcQ"
}
```

| Field     | Type   | Required | Validation                     | Description                  |
| --------- | ------ | -------- | ------------------------------ | ---------------------------- |
| `videoId` | string | Yes      | `IsString`, `IsNotEmpty`, trim | YouTube video ID (không URL) |

#### Success Response

**Case 1: Video chưa pernah được xử lý**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "processing",
    "jobId": "1234567890"
  },
  "timestamp": "2026-02-24T10:00:00.000Z",
  "path": "/karaoke/request"
}
```

**Case 2: Video đã được xử lý xong**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "ready",
    "instrumentalUrl": "https://s3.ap-southeast-1.amazonaws.com/krok-storage/general/temp/dQw4w9WgXcQ/no_vocals.wav",
    "lyrics": [
      {
        "word": "Hello",
        "start": 0.5,
        "end": 1.2
      },
      {
        "word": "world",
        "start": 1.3,
        "end": 2.0
      }
    ]
  },
  "timestamp": "2026-02-24T10:00:00.000Z",
  "path": "/karaoke/request"
}
```

**Case 3: Video đang xử lý từ request khác**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "processing",
    "jobId": "9876543210"
  },
  "timestamp": "2026-02-24T10:00:00.000Z",
  "path": "/karaoke/request"
}
```

#### Response Schema

| Field             | Type                       | Description                                  |
| ----------------- | -------------------------- | -------------------------------------------- |
| `status`          | `'processing' \| 'ready'`  | Trạng thái xử lý                             |
| `jobId`           | `string` (nếu processing)  | ID của job trong queue, dùng để poll status  |
| `instrumentalUrl` | `string` (nếu ready)       | URL file instrumental (music without vocals) |
| `lyrics`          | `LyricsWord[]` (nếu ready) | Mảng lyrics với word timing                  |

#### `LyricsWord`

| Field   | Type     | Description               |
| ------- | -------- | ------------------------- |
| `word`  | `string` | Từ/âm tiết                |
| `start` | `number` | Thời gian bắt đầu (giây)  |
| `end`   | `number` | Thời gian kết thúc (giây) |

---

### 2. Get Job Status

Lấy trạng thái xử lý của một karaoke job.

**Method**: `GET`

**URL**: `/karaoke/status/:jobId`

**Authentication**: Not required (`@Public()`)

**Status Code**: `200 OK`

#### URL Parameters

| Parameter | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| `jobId`   | string | Yes      | Job ID từ request |

#### Success Responses

**Case 1: Job đang xử lý**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "processing",
    "jobId": "1234567890"
  },
  "timestamp": "2026-02-24T10:00:30.000Z",
  "path": "/karaoke/status/1234567890"
}
```

**Case 2: Job hoàn thành thành công**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "completed",
    "instrumentalUrl": "https://s3.ap-southeast-1.amazonaws.com/krok-storage/general/temp/dQw4w9WgXcQ/no_vocals.wav",
    "lyrics": [
      {
        "word": "Hello",
        "start": 0.5,
        "end": 1.2
      },
      {
        "word": "world",
        "start": 1.3,
        "end": 2.0
      }
    ]
  },
  "timestamp": "2026-02-24T10:00:30.000Z",
  "path": "/karaoke/status/1234567890"
}
```

**Case 3: Job thất bại**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "failed"
  },
  "timestamp": "2026-02-24T10:00:30.000Z",
  "path": "/karaoke/status/1234567890"
}
```

#### Response Schema

| Field             | Type                                      | Description                 |
| ----------------- | ----------------------------------------- | --------------------------- |
| `status`          | `'processing' \| 'completed' \| 'failed'` | Trạng thái job              |
| `instrumentalUrl` | `string` (nếu completed)                  | URL file instrumental       |
| `lyrics`          | `LyricsWord[]` (nếu completed)            | Mảng lyrics với word timing |

---

## Workflow Example

### 1. Request karaoke

```bash
curl -X POST https://api.example.com/karaoke/request \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "processing",
    "jobId": "1234567890"
  }
}
```

### 2. Poll status (hàng vài giây)

```bash
curl https://api.example.com/karaoke/status/1234567890
```

**Response (sau 5 giây):**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "processing",
    "jobId": "1234567890"
  }
}
```

**Response (sau 30 giây - hoàn thành):**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "completed",
    "instrumentalUrl": "https://s3.../no_vocals.wav",
    "lyrics": [...]
  }
}
```

---

## Error Responses

### 400 Bad Request (Validation)

Khi `videoId` bị lỗi validation.

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "constraint": "isNotEmpty",
      "message": "videoId should not be empty",
      "value": "",
      "field": "videoId"
    }
  ],
  "timestamp": "2026-02-24T10:00:00.000Z",
  "path": "/karaoke/request"
}
```

### 500 Internal Server Error

Ví dụ khi worker fail hoặc Redis không connect.

```json
{
  "success": false,
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error",
  "timestamp": "2026-02-24T10:00:00.000Z",
  "path": "/karaoke/request"
}
```

---

## Processing Timeline

Processing time tùy thuộc vào độ dài video:

| Độ dài video | Thời gian xử lý | Bước                                         |
| ------------ | --------------- | -------------------------------------------- |
| 3 phút       | ~10-15 giây     | Download, demucs, whisper                    |
| 5 phút       | ~15-25 giây     | Download → voice separation → speech-to-text |
| 10 phút      | ~30-60 giây     | Tùy CPU/GPU tốc độ                           |

**Lưu ý:** Whisper processing trên CPU chậm, recommend có GPU cho production.

---

## Status Values

| Status       | Meaning                                    | Next Action                          |
| ------------ | ------------------------------------------ | ------------------------------------ |
| `processing` | Job đang chạy hoặc đang chờ queue          | Poll sau 2-5 giây                    |
| `ready`      | Karaoke đã sẵn sàng                        | Sử dụng `instrumentalUrl` + `lyrics` |
| `completed`  | Job hoàn thành thành công                  | Sử dụng kết quả                      |
| `failed`     | Job thất bại (video invalid, timeout, etc) | Retry từ request mới                 |

---

## Storage

- **Instrumental**: `s3://{bucket}/general/temp/{videoId}/no_vocals.wav`
- **Lyrics JSON**: `s3://{bucket}/general/temp/{videoId}/lyrics.json`

Liên kết public thông qua `KARAOKE_PUBLIC_BASE_URL` hoặc `AWS_ENDPOINT`.

---

## Environment Variables

Các biến cần trong `.env`:

```env
# Redis (Queue)
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD="your-password"
KARAOKE_QUEUE_NAME="karaoke-processing"
KARAOKE_JOB_NAME="process-video"

# AWS S3
AWS_REGION="ap-southeast-1"
AWS_ENDPOINT="https://s3.ap-southeast-1.amazonaws.com"
AWS_BUCKET_NAME="krok-storage"
AWS_ACCESS_KEY_ID="your-key"
AWS_SECRET_ACCESS_KEY="your-secret"
KARAOKE_PUBLIC_BASE_URL="https://cdn.example.com"  # optional

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/krok"
```

---

## cURL Examples

### Request karaoke

```bash
curl -X POST https://api.example.com/karaoke/request \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}'
```

### Get status

```bash
curl https://api.example.com/karaoke/status/1234567890
```

### With jq (parse JSON)

```bash
# Request dan extract jobId
JOB_ID=$(curl -s -X POST https://api.example.com/karaoke/request \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ"}' | jq -r '.data.jobId')

echo "Job ID: $JOB_ID"

# Poll status
until curl -s https://api.example.com/karaoke/status/$JOB_ID | jq -e '.data.status == "completed"' > /dev/null; do
  echo "Still processing..."
  sleep 5
done

echo "Done!"
```

---

## Notes

- Worker sử dụng Python subprocesses: yt-dlp, ffmpeg, demucs, whisper
- Job retry 3 lần với exponential backoff trước khi fail
- **Important**: Whisper model default là `medium` (1.5GB), có thể thay bằng `small` hoặc `tiny` nếu cần tốc độ cao hơn
- Demucs model default là `htdemucs` (best quality)
- Lyrics language detection theo `WHISPER_LANGUAGE` (.env)
