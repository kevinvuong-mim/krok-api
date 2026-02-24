# Karaoke Processing Pipeline

## Pipeline Overview

The karaoke processing pipeline transforms a YouTube video into karaoke assets:

```
YouTube Video (mp4/webm)
    ↓
Audio Extraction (yt-dlp + ffmpeg)
    → audio.wav (44100 Hz stereo)
    ↓
Voice Separation (demucs)
    → vocals.wav (speech)
    → no_vocals.wav (instrumental)
    ↓
Lyrics Generation (whisper + wav2vec2)
    → rough text transcription
    → word-level alignment with timing
    → lyrics.json [{"word": "...", "start": X, "end": Y}]
    ↓
Upload to S3
    → instrumental: no_vocals.wav
    → lyrics: lyrics.json
    ↓
Update Database
    → karaoke_assets.status = READY
    → karaoke_assets.instrumentalUrl
    → karaoke_assets.lyricsUrl
```

## Step 1: Video Download (yt-dlp)

**Purpose**: Download best available audio from YouTube

**Command**:

```bash
yt-dlp \
  --format "bestaudio[ext=webm]/bestaudio" \
  --output "audio.webm" \
  "https://www.youtube.com/watch?v={videoId}"
```

**Input**:

- YouTube video URL from `videoId`

**Output**:

- `audio.webm` - Best quality audio in WebM format

**Configuration**:

- Format: WebM (fallback to any audio if not available)
- Quality: Best available

**Possible Failures**:

- Video not found (404)
- Video unavailable in region
- Age-restricted video
- Video deleted

**Error Handling**:

```python
if process.returncode != 0:
    raise RuntimeError(f"yt-dlp failed: {stderr}")
    # Job status → FAILED
    # Retry 3 times with exponential backoff
```

## Step 2: Audio Conversion (ffmpeg)

**Purpose**: Convert audio to standardized WAV format for processing

**Command**:

```bash
ffmpeg -y \
  -i audio.webm \
  -ar 44100 \           # Resample to 44100 Hz
  -ac 2 \               # Convert to stereo
  audio.wav
```

**Input**:

- `audio.webm` from Step 1

**Output**:

- `audio.wav` - Stereo WAV file @ 44100 Hz

**Why these parameters?**:

- **44100 Hz**: Standard sample rate for audio (CD quality)
- **Stereo (2 channels)**: Required by demucs

**Processing Time**:

- 3 min video: ~1-2 seconds
- 10 min video: ~3-4 seconds

**Possible Failures**:

- ffmpeg not installed
- Audio codec not supported

## Step 3: Voice Separation (demucs)

**Purpose**: Separate vocal track from instrumental using machine learning

**Command**:

```bash
python3 -m demucs.separate \
  -n htdemucs \                      # Model name
  --two-stems=vocals \               # Extract only vocals + rest
  -o demucs_out \                    # Output directory
  audio.wav
```

**Input**:

- `audio.wav` from Step 2

**Output Structure**:

```
demucs_out/
└── htdemucs/
    └── audio/
        ├── vocals.wav        # Extracted vocals
        ├── drums.wav         # (not used)
        ├── bass.wav          # (not used)
        └── other.wav         # Combined to no_vocals
```

**What demucs does**:

1. Load pre-trained model (htdemucs)
2. Process audio through transformer network
3. Isolate vocal frequencies from instrumental
4. Return 4 stems: vocals, drums, bass, other

**Model**: htdemucs

- **Size**: ~330MB model file
- **Accuracy**: ~5-6 dB SDR (source-to-distortion ratio)
- **Processing Time**: 3x real-time on CPU, 0.5x on GPU

**Processing Time**:
| Duration | CPU | GPU |
|----------|-----|-----|
| 1 min | ~3s | ~0.5s |
| 3 min | ~9s | ~1.5s |
| 5 min | ~15s | ~2.5s |
| 10 min | ~30s | ~5s |

**Alternative Models**:

- `mt_sdr`: Faster, slightly lower quality
- `htdemucs_ft`: Finetuned, better for certain genres

**Output Extraction**:

```python
# Find vocals.wav in potentially nested directory
vocals_path = candidate[0]  # First match

# Combine other stems to create instrumental
# instrument = (drums + bass + other)
no_vocals_path = vocals_path.parent / "no_vocals.wav"
```

**Possible Failures**:

- No vocals found in audio (speech too faint)
- demucs model not found (download on first run)
- CUDA out of memory (if using GPU)

## Step 4: Lyrics Generation (whisper + wav2vec2)

**Purpose**: Convert audio to text with word-level timing

This is a 3-step process:

### 4a: Rough Transcription (Whisper)

**Model**: OpenAI Whisper

**Command**:

```python
result = whisper_model.transcribe(
    "vocals.wav",
    beam_size=5,
    best_of=5,
    temperature=0,
    condition_on_previous_text=False,
    language="vi",  # From WHISPER_LANGUAGE
    verbose=False
)
```

**Output**:

```python
{
    "text": "Hello world this is a test",
    "segments": [
        {"start": 0.0, "end": 1.5, "text": "Hello world"},
        {"start": 1.5, "end": 3.0, "text": "this is a test"}
    ],
    "language": "vi"
}
```

**Model Variants**:
| Model | Params | Size | Speed | Accuracy |
|-------|--------|------|-------|----------|
| tiny | 39M | 140MB | Very Fast | 60% |
| small | 140M | 490MB | Fast | 75% |
| base | 140M | 490MB | Medium | 80% |
| **medium** | 769M | 3.1GB | Slow | 92% (default) |
| large | 1550M | 3.1GB | Very Slow | 95% |

**Processing Time** (on CPU):
| Duration | Time |
|----------|------|
| 1 min | ~5-10s |
| 3 min | ~15-30s |
| 5 min | ~25-50s |
| 10 min | ~50-100s |

**Language Support**:

- Supports 99+ languages
- Auto-detect if not specified
- Better accuracy when language is pre-specified

**Output**: Raw text without word-level timing

### 4b: Phonemization

**Purpose**: Convert text to phonemes for alignment

**Method**: espeak-ng backend

```python
phonemes = backend.phonemize(
    ["Hello world"],
    separator=Separator(phone=" ", word="|"),
    language="vi"
)
# Output: "h|ə|l|o w|ər|l|d"
```

**Use**: Debug and validation only (not in final output)

### 4c: Word-Level Alignment (wav2vec2)

**Purpose**: Find exact start/end time for each word

**Model**: WAV2VEC2-XLSR (multilingual)

**Process**:

```
Audio Waveform (sample @ 44100 Hz)
    ↓
wav2vec2 Encoder
    → Continuous representation
    ↓
CTC Head (Connectionist Temporal Classification)
    → Frame-level predictions
    ↓
Forced Alignment
    → Align predicted frames with reference text
    → Suppress spaces between words
    ↓
Frame-to-Time Conversion
    → frame_duration = audio_duration / num_frames
    → word_start = start_frame * frame_duration
    → word_end = end_frame * frame_duration
```

**Output**:

```python
[
    {"word": "Hello", "start": 0.5, "end": 1.2},
    {"word": "world", "start": 1.3, "end": 2.0},
]
```

**Model Variants**:
| Bundle | Language | Size | RAM |
|--------|----------|------|-----|
| **xlsr_300m** | Multilingual | 300MB | ~2GB (default) |
| base_960h | English | 300MB | ~2GB |
| large_960h | English | 1.2GB | ~3GB |

**Timing Accuracy**:

- ±100-200ms per word (typical)
- Better for clearly spoken content
- Worse for overlapping speech/music

**Processing Time**:
| Duration | Time |
|----------|------|
| 1 min | ~2-3s |
| 3 min | ~6-10s |
| 5 min | ~10-15s |
| 10 min | ~20-30s |

## Step 5: Upload to S3

**Purpose**: Store instrumental and lyrics for long-term retrieval

### 5a: Upload Instrumental

**Input**: `no_vocals.wav` from Step 3

**S3 Details**:

```
Bucket: ${AWS_BUCKET_NAME}
Key: general/temp/{videoId}/no_vocals.wav
Content-Type: audio/wav
ACL: Private (only with credentials)
```

**Code**:

```python
s3_client.upload_file(
    local_file="no_vocals.wav",
    bucket_name="krok-storage",
    key="general/temp/dQw4w9WgXcQ/no_vocals.wav",
    ExtraArgs={"ContentType": "audio/wav"}
)
```

**Returned URL**:

```
https://{KARAOKE_PUBLIC_BASE_URL}/krok-storage/general/temp/dQw4w9WgXcQ/no_vocals.wav
```

**File Size**: ~0.5-5 MB depending on video length

### 5b: Upload Lyrics JSON

**Input**: `lyrics.json` created from Step 4

**S3 Details**:

```
Bucket: ${AWS_BUCKET_NAME}
Key: general/temp/{videoId}/lyrics.json
Content-Type: application/json
```

**JSON Structure**:

```json
[
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
```

**File Size**: ~5-50 KB depending on speech amount

## Step 6: Database Update

**Purpose**: Record completion status and URLs

**Table**: `karaoke_assets` (Prisma schema)

**Update Query**:

```sql
UPDATE karaoke_assets
SET
  status = 'READY',
  instrumentalUrl = 's3://krok-storage/general/temp/dQw4w9WgXcQ/no_vocals.wav',
  lyricsUrl = 's3://krok-storage/general/temp/dQw4w9WgXcQ/lyrics.json'
WHERE videoId = 'dQw4w9WgXcQ'
```

**Connection**:

```python
with psycopg2.connect(os.getenv("DATABASE_URL")) as conn:
    with conn.cursor() as cursor:
        cursor.execute(...)
        conn.commit()
```

**Atomicity**: Single transaction ensures consistency

## Error Handling & Cleanup

### Automatic Cleanup

```python
with tempfile.TemporaryDirectory(prefix="karaoke-") as temp_dir_str:
    # All operations use temp_dir
    # Automatically deleted on exit (success or error)
```

**Files Cleaned**:

- `audio.webm`
- `audio.wav`
- `demucs_out/` directory
- `lyrics.json` (before upload)

### Error Propagation

```python
try:
    result = process_video(video_id, job_id)
    print(json.dumps(result))      # Stdout for worker
    return 0                        # Exit code 0
except Exception as e:
    # Log error details
    try:
        update_asset_status(video_id, "FAILED")  # Mark failed
    except:
        pass  # Ignore DB errors
    raise                           # Exit code 1 → BullMQ retry
```

### Retry Policy (in bullmq-worker.js)

```javascript
queue.add(
  'process-video',
  { videoId, jobId },
  {
    attempts: 3, // 3 total attempts
    backoff: {
      type: 'exponential', // Exponential wait
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: false, // Keep job results
    removeOnFail: false, // Keep failure info
  },
);
```

**Timeline**:

```
Attempt 1 fails at t=10s
├─ Wait 5 seconds
└─ Retry at t=15s

Attempt 2 fails at t=30s
├─ Wait 10 seconds
└─ Retry at t=40s

Attempt 3 fails at t=60s
├─ Mark job FAILED
└─ Status in DB: FAILED, no URLs
```

## Performance Optimization

### Parallel Processing (Future)

Currently: Sequential (1 job at a time per worker)

Could enable:

- Run yt-dlp + ffmpeg in parallel
- Batch upload to S3
- Requires better resource isolation

### Caching (Current Limitation)

Not implemented in worker. Caching happens API-side:

- Check if karaoke_assets exists for videoId
- If status=READY, return without enqueuing

### GPU Acceleration

PyTorch automatically uses GPU if available:

```python
# Automatic in all models
device = "cuda" if torch.cuda.is_available() else "cpu"

# Expected speedup:
# - whisper: 3-5x faster
# - wav2vec2: 2-4x faster
```

## Monitoring & Debugging

### Verbose Logging

Each step logs progress:

```
[Step 1] Downloading video: dQw4w9WgXcQ
[Step 2] Converting audio: ffmpeg
[Step 3] Voice separation: demucs
[Step 4] Aligning lyrics
[Step 4.1] Transcribing audio
[Step 4.2] Phonemizing text
[Step 4.3] Aligning with wav2vec2: 45 words aligned
[Step 5] Uploading to S3
[Step 5.1] Uploading instrumental: 2.3 MB
[Step 5.2] Uploading lyrics: 15 KB
[Step 6] Updating database
```

### Testing Individual Steps

```bash
# Test yt-dlp
yt-dlp --format "bestaudio" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -o test.webm

# Test demucs
demucs --two-stems=vocals test.wav

# Test whisper
whisper test.wav --language=vi --model=medium

# Test S3 upload
aws s3 cp test.wav s3://bucket/test.wav
```

## Known Limitations

1. **Whisper accuracy**: ~5-10% error rate even with medium model
2. **Word alignment**: Frame-level errors can cause ±200ms offset
3. **Emotional singing**: Models trained on speech, not singing
4. **Low audio quality**: Heavy compression reduces accuracy
5. **Very fast speech**: Struggling with >200 words per minute
6. **Multilingual**: Better with pure language vs. mixed
