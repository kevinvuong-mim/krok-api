# Worker Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API Server                            │
│                    (NestJS + Node.js)                        │
│                                                               │
│  POST /karaoke/request  → enqueue job → Redis Queue         │
│  GET /karaoke/status    → query DB status                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                         Redis Queue
                      (BullMQ Channel)
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Worker Container                          │
│                  (Node.js + Python)                          │
│                                                               │
│  ┌────────────────────────────────────────────────┐         │
│  │ bullmq-worker.js                               │         │
│  │ - Listen to Redis queue                        │         │
│  │ - Spawn pipeline.py subprocess                 │         │
│  │ - Handle job success/failure                   │         │
│  └────────────────────────────────────────────────┘         │
│           ↓                                                   │
│  ┌────────────────────────────────────────────────┐         │
│  │ pipeline.py                                    │         │
│  │ subprocess execution:                          │         │
│  │ 1. Download video (yt-dlp)                     │         │
│  │ 2. Convert audio (ffmpeg)                      │         │
│  │ 3. Voice separation (demucs)                   │         │
│  │ 4. Generate lyrics (lyrics_generator.py)       │         │
│  │ 5. Upload to S3 (boto3)                        │         │
│  │ 6. Update DB (psycopg2)                        │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
            ↓                              ↓
      AWS S3 Storage              PostgreSQL Database
    (instrumental + lyrics)       (karaoke_assets table)
```

## Component Details

### 1. BullMQ Worker (Node.js)

**File**: `bullmq-worker.js`

**Responsibilities**:

- Create Redis connection pool
- Create and register BullMQ queue with name from `KARAOKE_QUEUE_NAME` env
- Listen for jobs with name matching `KARAOKE_JOB_NAME`
- Spawn Python subprocess with job data as JSON argument
- Parse subprocess result JSON
- Mark job complete/failed based on exit code

**Job Lifecycle**:

```
Job Added (API enqueues)
    ↓
Wait in Queue
    ↓
Worker picks up job
    ↓
Spawn subprocess: python3 pipeline.py '{"videoId": "...", "jobId": "..."}'
    ↓
Wait for subprocess (blocking)
    ↓
Parse stdout JSON result
    ↓
Mark Job Complete/Failed
    ↓
Job done (client polls status)
```

**Configuration**:

```yaml
Queue Name: ${KARAOKE_QUEUE_NAME} (default: "karaoke-processing")
Job Name: ${KARAOKE_JOB_NAME} (default: "process-video")
Concurrency: 1 (sequential processing)
Connection: Redis with password auth
```

### 2. Python Pipeline

**File**: `pipeline.py`

**Entry Point**:

```python
def main():
    payload = json.loads(sys.argv[1])
    video_id = payload.get("videoId")
    job_id = payload.get("jobId")
    process_video(video_id, job_id)
```

**Subprocess Execution Flow**:

```
process_video(videoId, jobId)
    ├─ run(["yt-dlp", ...]) → audio.webm
    │  └─ Download best audio format from YouTube
    │
    ├─ run(["ffmpeg", ...]) → audio.wav
    │  └─ Convert webm to WAV (44100 Hz, stereo)
    │
    ├─ run(["python3", "-m", "demucs", ...]) → demucs_out/
    │  └─ Voice separation using htdemucs model
    │
    ├─ find_demucs_output() → vocals.wav, no_vocals.wav
    │  └─ Extract output files
    │
    ├─ generate_lyrics(vocals.wav) → lyrics.json
    │  └─ Call lyrics_generator.py to create word-level timing
    │
    ├─ upload_to_storage(no_vocals.wav) → instrumental_url
    │  └─ Upload to S3 with Content-Type: audio/wav
    │
    ├─ upload_to_storage(lyrics.json) → lyrics_url
    │  └─ Upload to S3 with Content-Type: application/json
    │
    └─ update_asset_status(videoId, "READY", instrumental_url, lyrics_url)
       └─ Update PostgreSQL karaoke_assets table
```

**Environment Variables Used**:

```env
DEMUCS_MODEL           # Model selection (default: htdemucs)
WHISPER_LANGUAGE       # Language for transcription
AWS_*                  # S3 credentials
KARAOKE_PUBLIC_BASE_URL # Public URL prefix for returned links
DATABASE_URL           # PostgreSQL connection
```

### 3. Lyrics Generator (Python)

**File**: `lyrics_generator.py`

**Main Class**: `LyricsGenerator`

**Pipeline**:

```
Step 1: Transcribe (Whisper)
    Input: vocals.wav
    OpenAI Whisper Model → Rough text transcription
    Output: rough_text (string), segments (timing info)

Step 2: Phonemize
    Rough text → Phonemes (for each word)
    Using espeak-ng backend
    Output: phoneme_words

Step 3: Align (wav2vec2 forced alignment)
    Input: audio + rough text
    Model: WAV2VEC2 (xlsr_300m by default)
    Forced alignment with CTC framework
    Output: aligned_words with frame-level timing
    Convert frames to seconds: frame_time = time / sample_rate

Step 4: Combine
    Merge rough words + phonemes + timing
    Output: [{"word": "Hello", "start": 0.5, "end": 1.2}, ...]
```

**Models Used**:
| Model | Purpose | Size | RAM |
|-------|---------|------|-----|
| whisper-{size} | Speech-to-text | tiny/small/medium/large | 1GB/1GB/1.5GB/3GB |
| wav2vec2-xlsr-300m | Word alignment | 300MB | ~2GB |
| espeak-ng (system) | Phonemization | System dep | Minimal |

**Configuration**:

```env
WHISPER_MODEL="medium"              # Speech recognition model size
WHISPER_LANGUAGE="vi"               # Language code
WAV2VEC2_ALIGN_BUNDLE="xlsr_300m"   # Alignment model bundle
```

### 4. Database Integration

**Table**: `karaoke_assets`

**Fields Updated**:

```sql
UPDATE karaoke_assets
SET
  status = 'READY',                    -- Processing status
  instrumentalUrl = 's3://...',        -- S3 path to instrumental
  lyricsUrl = 's3://...'               -- S3 path to lyrics JSON
WHERE videoId = 'dQw4w9WgXcQ'
```

**Status Values**:

- `PROCESSING` - Job running or queued
- `READY` - Successfully completed, ready to serve
- `FAILED` - Job failed after 3 retries

### 5. S3 Storage Structure

```
s3://krok-storage/
└── general/temp/
    └── {videoId}/
        ├── no_vocals.wav           -- Instrumental track
        └── lyrics.json             -- Word-level lyrics
```

**Public URLs**:

```
https://{KARAOKE_PUBLIC_BASE_URL}/krok-storage/general/temp/{videoId}/no_vocals.wav
https://{KARAOKE_PUBLIC_BASE_URL}/krok-storage/general/temp/{videoId}/lyrics.json
```

## Data Flow

### Request → Response Path

1. **Client Request**

   ```json
   POST /karaoke/request
   { "videoId": "dQw4w9WgXcQ" }
   ```

2. **API Action**
   - Check if karaoke_assets exists for this videoId
   - If READY: return immediately with URLs
   - If PROCESSING: return existing jobId
   - If not exists: create job, return new jobId

3. **Job Enqueue**

   ```javascript
   queue.add(
     'process-video', // KARAOKE_JOB_NAME
     { videoId, jobId },
     { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
   );
   ```

4. **Worker Processing** (async, in background)
   - BullMQ picks up job when available
   - Execute pipeline (can take 10-60 seconds)
   - Update database with URLs
   - Mark job complete

5. **Client Poll**

   ```json
   GET /karaoke/status/:jobId

   Response (if still processing):
   { "status": "processing", "jobId": "..." }

   Response (if complete):
   {
     "status": "completed",
     "instrumentalUrl": "https://...",
     "lyrics": [...]
   }
   ```

## Concurrency Model

**Single-threaded, Sequential Processing**:

```
Time:  0s      10s     20s     30s     40s
       │       │       │       │       │
Job 1: [=======X Video 1 Complete======X]
                      Job 2: [========X Video 2 Complete=========X]
                                      Job 3: [=====X Video 3 Complete===X]
```

**Rationale**:

- Whisper + demucs are CPU/GPU intensive
- One job per worker prevents resource contention
- Can scale horizontally with multiple worker instances

**Future Optimization**:

- Could use worker pool with 2-3 concurrent jobs
- Need GPU memory analysis
- Would require health check improvements

## Retry Logic

**Job Failure Handling**:

```
Attempt 1: Failed
  └─ Wait 5 seconds (exponential backoff)

Attempt 2: Failed
  └─ Wait 10 seconds (exponential backoff)

Attempt 3: Failed
  └─ Mark job failed permanently
  └─ Update DB: status = 'FAILED'
  └─ Client gets { status: 'failed' }
```

**Reasons for Retry**:

- Transient network issues
- Temporary resource unavailability
- Redis connection loss (reconnects)

**Non-Retryable Failures**:

- Invalid videoId
- YouTube video not found
- Audio too short
- Whisper transcription error (no speech)

## Error Handling

**Pipeline Error Flow**:

```
try:
  result = process_video(videoId, jobId)
  print(json.dumps(result))  # Success
except Exception as e:
  try:
    update_asset_status(videoId, "FAILED")  # Mark failed
  except:
    pass  # Ignore DB errors
  raise  # Exit with code 1
```

**Worker Error Handling**:

```javascript
worker.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed: ${error.message}`);
  // BullMQ handles retry logic
});
```

## Performance Considerations

### Memory Usage

- Whisper model (medium): ~1.5GB
- Demucs model: ~500MB
- wav2vec2 model: ~2GB
- Audio buffers: variable (0.5GB for 10min @ 44kHz)
- **Total**: ~4-5GB for single job

### CPU Usage

- Single job utilizes 1-2 CPU cores
- Peak during demucs separation
- Can scale with multiple workers

### Network

- YouTube download: 1-10 Mbps (depends on video)
- S3 upload: configurable

### Storage

- Temp files in /tmp: ~500MB per job (cleaned up)
- S3: permanent storage

## Deployment Considerations

1. **Docker Image Size**: ~2.5GB (models included)
2. **Startup Time**: ~30-60s (model loading)
3. **Health Check**: Worker stays alive, monitors queue
4. **Graceful Shutdown**: Waits for current job to finish
5. **Logging**: All output to stderr/stdout for docker logs
