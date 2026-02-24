# Worker Module Documentation

## Overview

Worker là một Node.js + Python service xử lý karaoke jobs từ BullMQ queue. Nó chạy độc lập như một Docker container và:

1. **Lắng nghe** Redis queue để nhận karaoke processing jobs
2. **Thực thi** Python pipeline để:
   - Tải video từ YouTube (yt-dlp)
   - Tách vocals khỏi instrumental (demucs)
   - Tạo lyrics từ vocals (whisper + wav2vec2)
3. **Lưu trữ** instrumental + lyrics JSON lên AWS S3
4. **Cập nhật** database status khi xong

## Project Structure

```
worker/
├── Dockerfile                 # Docker image definition
├── package.json              # Node.js dependencies (bullmq, ioredis)
├── requirements.txt          # Python dependencies
├── bullmq-worker.js          # BullMQ job consumer (Node.js)
├── pipeline.py               # Main karaoke processing pipeline (Python)
├── lyrics_generator.py       # Speech-to-text + word timing (Python)
└── README.md                 # This file
```

## Key Components

### 1. **bullmq-worker.js**

- Node.js server dùng BullMQ để consume jobs từ Redis
- Spawn Python subprocess khi nhận job
- Handle job success/failure, logging

### 2. **pipeline.py**

- Main orchestration script tọa lệnh subprocess
- Tải video → tách beats → tạo lyrics → upload S3 → update DB
- Xử lý error và cleanup temp files

### 3. **lyrics_generator.py**

- Gọi Whisper (OpenAI) để speech-to-text
- Gọi wav2vec2 để align text với audio (word-level timing)
- Trả về mảng words với start/end timestamps

## Flow Diagram

```
API Request to /karaoke/request
    ↓
Add Job to Redis Queue (BullMQ)
    ↓
Worker (bullmq-worker.js) picks up job
    ↓
Spawn Python subprocess (pipeline.py)
    ├─ yt-dlp: Download video from YouTube
    ├─ ffmpeg: Convert audio format
    ├─ demucs: Voice separation (vocals + instrumental)
    ├─ Whisper: Speech-to-text transcription
    ├─ wav2vec2: Word-level alignment
    ├─ Upload to S3 (instrumental + lyrics.json)
    └─ Update Database (status=READY, URLs)
    ↓
Client polls /karaoke/status/:jobId
    ↓
Return instrumental URL + lyrics with timing
```

## Environment Variables

Worker cần các biến trong `.env`:

```env
# Redis Queue
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
KARAOKE_QUEUE_NAME=karaoke-processing
KARAOKE_JOB_NAME=process-video

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/krok

# AWS S3
AWS_REGION=ap-southeast-1
AWS_ENDPOINT=https://s3.ap-southeast-1.amazonaws.com
AWS_BUCKET_NAME=krok-storage
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
KARAOKE_PUBLIC_BASE_URL=https://cdn.example.com  # optional

# AI Models Tuning (optional)
WHISPER_LANGUAGE=vi                # default
WHISPER_MODEL=medium               # default
DEMUCS_MODEL=htdemucs              # default
WAV2VEC2_ALIGN_BUNDLE=xlsr_300m    # default
```

## Running Worker

### Local Development

```bash
# Install dependencies
cd worker
npm install
pip3 install -r requirements.txt

# Run worker
node bullmq-worker.js
```

### Docker (Recommended)

```bash
# Build worker image
docker-compose build worker

# Start with postgres + redis
docker-compose up -d postgres redis worker

# View logs
docker-compose logs -f worker
```

## Dependencies

### Node.js

- **bullmq** - Job queue consumer
- **ioredis** - Redis client

### Python

- **torch, torchaudio** - PyTorch for wav2vec2 alignment
- **demucs** - Music source separation (voice extraction)
- **openai-whisper** - Speech-to-text transcription
- **transformers** - Model loading for wav2vec2
- **yt-dlp** - YouTube video downloader
- **boto3** - AWS S3 client
- **psycopg2** - PostgreSQL Python client
- **phonemizer** - Phoneme generation
- **ffmpeg** - Audio/video processing (system dependency)

## System Requirements

### Hardware

- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum (8GB+ recommended for whisper + demucs)
- **GPU**: Optional but recommended for faster processing (CUDA 11.8+)

### OS-level Dependencies

- ffmpeg
- espeak-ng (for phonemizer)
- libsndfile1
- Python 3.9+

All installed in Dockerfile automatically.

## Processing Time

Typical processing time per video:

| Video Length | CPU Time | GPU Time |
| ------------ | -------- | -------- |
| 3 min        | 15-30s   | 5-10s    |
| 5 min        | 25-50s   | 8-15s    |
| 10 min       | 50-120s  | 15-30s   |

_GPU time with CUDA-enabled Whisper and demucs_

## Storage

- **Location**: AWS S3 bucket
- **Path**: `s3://{bucket}/general/temp/{videoId}/`
- **Files**:
  - `no_vocals.wav` - Instrumental track
  - `lyrics.json` - Lyrics with word timing
- **Cleanup**: Automatic (depends on S3 lifecycle policy)

## Logging

Worker logs to stderr/stdout:

```bash
# View realtime logs
docker-compose logs -f worker

# Log format: [worker] {message}
# Examples:
# [worker] Job completed: 123456
# [worker] Job failed: 123456 - {error}
```

## Error Handling

Common failure reasons:

1. **YouTube video not found/deleted**
   → Status: FAILED

2. **Audio too short/no speech detected**
   → Status: FAILED

3. **Whisper transcription fails**
   → Status: FAILED

4. **S3 upload fails (credentials/permissions)**
   → Status: FAILED

5. **Database connection lost**
   → Job retries 3 times with exponential backoff

All failures log full error message for debugging.

## Troubleshooting

See [troubleshooting guide](./troubleshooting.md) for common issues and solutions.

## Files in This Documentation

- [README.md](README.md) - This overview
- [architecture.md](architecture.md) - Detailed architecture and design
- [setup.md](setup.md) - Installation and configuration
- [pipeline.md](pipeline.md) - Step-by-step pipeline flow
- [troubleshooting.md](troubleshooting.md) - Common issues and solutions
