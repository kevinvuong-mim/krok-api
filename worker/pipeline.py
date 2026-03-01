import os
import sys
import json
import time
import shutil
import shlex
import torch
import logging
import psycopg2
import tempfile
import subprocess
from typing import Any
from pathlib import Path
from lyrics_generator import generate_lyrics as generate_lyrics_phase1

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Constants
SUBPROCESS_TIMEOUT = 1800  # 30 minutes
DB_RETRY_COUNT = 3
DB_RETRY_DELAY = 2  # seconds


def run(command: list[str], cwd: Path | None = None, timeout: int = SUBPROCESS_TIMEOUT) -> str:
    """Execute subprocess with timeout and full output capture."""
    try:
        process = subprocess.run(
            command,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )

        if process.returncode != 0:
            cmd_str = " ".join(shlex.quote(part) for part in command)
            error_output = f"STDOUT:\n{process.stdout}\n\nSTDERR:\n{process.stderr}"
            raise RuntimeError(
                f"Command failed (exit code {process.returncode}): {cmd_str}\n{error_output}"
            )

        return process.stdout

    except subprocess.TimeoutExpired as e:
        cmd_str = " ".join(shlex.quote(part) for part in command)
        raise RuntimeError(f"Command timed out after {timeout}s: {cmd_str}") from e


def update_asset_status(
    video_id: str,
    status: str,
    instrumental_url: str | None = None,
    lyrics_url: str | None = None,
) -> None:
    """Update asset status with retry logic for transient failures."""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    last_error = None
    for attempt in range(DB_RETRY_COUNT):
        try:
            with psycopg2.connect(database_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE "karaoke_assets"
                        SET "status" = %s,
                            "instrumentalUrl" = COALESCE(%s, "instrumentalUrl"),
                            "lyricsUrl" = COALESCE(%s, "lyricsUrl")
                        WHERE "videoId" = %s
                        """,
                        (status, instrumental_url, lyrics_url, video_id),
                    )
            return
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            last_error = e
            if attempt < DB_RETRY_COUNT - 1:
                logger.warning(f"DB update failed (attempt {attempt + 1}), retrying in {DB_RETRY_DELAY}s: {e}")
                time.sleep(DB_RETRY_DELAY)
            else:
                raise RuntimeError(f"DB update failed after {DB_RETRY_COUNT} attempts") from last_error


def upload_to_storage(local_file: Path, object_key: str, content_type: str) -> str:
    """Upload file to local storage (uploads folder)."""
    # Get upload directory - defaults to 'uploads' folder relative to krok-api root
    upload_dir = os.getenv("UPLOAD_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    base_url = os.getenv("BASE_URL") or "http://localhost:3000"

    # Create target directory if it doesn't exist
    target_path = Path(upload_dir) / object_key
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # Copy file to uploads folder
    shutil.copy2(str(local_file), str(target_path))

    logger.info(f"File saved to local storage: {target_path}")

    # Return the public URL for accessing the file
    return f"{base_url.rstrip('/')}/files/{object_key}"


def generate_lyrics(vocals_path: Path, output_path: Path) -> list[dict[str, Any]]:
    """Generate lyrics from vocals with GPU cleanup."""
    language = os.getenv("WHISPER_LANGUAGE") or "vi"

    words = generate_lyrics_phase1(str(vocals_path), language=language)

    # GPU memory cleanup after Whisper
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        logger.info("GPU cache cleared after Whisper")

    output_path.write_text(
        json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return words


def find_demucs_output(base_dir: Path, model_name: str = "htdemucs") -> tuple[Path, Path]:
    """
    Find Demucs output files following the actual structure:
    demucs_out/{model}/{track_name}/vocals.wav
    demucs_out/{model}/{track_name}/no_vocals.wav
    """
    # Look for model directory first
    model_dir = base_dir / model_name
    if not model_dir.exists():
        # Fallback to any model directory
        model_dirs = [d for d in base_dir.iterdir() if d.is_dir()]
        if not model_dirs:
            raise RuntimeError(f"No Demucs model output found in {base_dir}")
        model_dir = model_dirs[0]

    # Find track directory (should be exactly one)
    track_dirs = [d for d in model_dir.iterdir() if d.is_dir()]
    if not track_dirs:
        raise RuntimeError(f"No track output found in {model_dir}")
    
    # Use the first (and usually only) track directory
    track_dir = track_dirs[0]
    
    vocals_path = track_dir / "vocals.wav"
    no_vocals_path = track_dir / "no_vocals.wav"

    if not vocals_path.exists():
        raise RuntimeError(f"Demucs output vocals.wav not found at {vocals_path}")

    if not no_vocals_path.exists():
        raise RuntimeError(f"Demucs output no_vocals.wav not found at {no_vocals_path}")

    logger.info(f"Found Demucs output: {track_dir}")
    return vocals_path, no_vocals_path


def process_video(video_id: str, job_id: str) -> dict[str, Any]:
    """Process video with full pipeline: download, separate, transcribe, upload."""
    logger.info(f"Job started: video_id={video_id}, job_id={job_id}")
    
    update_asset_status(video_id, "PROCESSING")

    # Job-aware temp directory for traceability
    with tempfile.TemporaryDirectory(prefix=f"karaoke-{job_id}-") as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        audio_webm = temp_dir / "audio.webm"
        audio_wav = temp_dir / "audio.wav"
        vocals_16k = temp_dir / "vocals_16k.wav"
        demucs_output_dir = temp_dir / "demucs_out"
        lyrics_path = temp_dir / "lyrics.json"

        # Download with hardened yt-dlp options
        run(
            [
                "yt-dlp",
                "--format", "bestaudio[ext=webm]/bestaudio",
                "--output", str(audio_webm),
                "--no-playlist",
                "--quiet",
                "--no-warnings",
                "--ignore-errors",
                f"https://www.youtube.com/watch?v={video_id}",
            ]
        )
        
        if not audio_webm.exists():
            raise RuntimeError(f"yt-dlp failed to download video: {video_id}")
        
        logger.info("yt-dlp download completed")

        # Convert to WAV
        run(
            [
                "ffmpeg",
                "-y",
                "-i", str(audio_webm),
                "-ar", "44100",
                "-ac", "2",
                str(audio_wav),
            ]
        )

        # Run Demucs separation
        demucs_model = os.getenv("DEMUCS_MODEL") or "htdemucs"
        run(
            [
                "python3",
                "-m", "demucs.separate",
                "-n", demucs_model,
                "--two-stems=vocals",
                "-o", str(demucs_output_dir),
                str(audio_wav),
            ]
        )
        logger.info("Demucs separation completed")

        vocals_path, no_vocals_path = find_demucs_output(demucs_output_dir, demucs_model)

        # Convert vocals to 16kHz mono for Whisper optimization
        run(
            [
                "ffmpeg",
                "-y",
                "-i", str(vocals_path),
                "-ar", "16000",
                "-ac", "1",
                str(vocals_16k),
            ]
        )
        logger.info("Vocals converted to 16kHz mono")

        # Generate lyrics using optimized audio
        lyrics = generate_lyrics(vocals_16k, lyrics_path)
        logger.info(f"Lyrics generated: {len(lyrics)} words")

        # Idempotent storage paths with job_id
        instrumental_key = f"general/temp/{video_id}/{job_id}/no_vocals.wav"
        lyrics_key = f"general/temp/{video_id}/{job_id}/lyrics.json"

        instrumental_url = upload_to_storage(
            no_vocals_path, instrumental_key, "audio/wav"
        )
        lyrics_url = upload_to_storage(lyrics_path, lyrics_key, "application/json")
        logger.info("Upload completed")

        update_asset_status(
            video_id, "READY", instrumental_url=instrumental_url, lyrics_url=lyrics_url
        )

        logger.info(f"Job completed: video_id={video_id}, job_id={job_id}")

        return {
            "status": "ready",
            "videoId": video_id,
            "jobId": job_id,
            "instrumentalUrl": instrumental_url,
            "lyricsUrl": lyrics_url,
            "lyrics": lyrics,
        }


def main() -> None:
    if len(sys.argv) < 2:
        raise RuntimeError("Worker payload argument is required")

    video_id = ""

    try:
        payload = json.loads(sys.argv[1])
        video_id = str(payload.get("videoId", "")).strip()
        job_id = str(payload.get("jobId", "")).strip()

        if not video_id:
            raise RuntimeError("videoId is required")

        result = process_video(video_id, job_id)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        logger.error(f"Job failed: {e}", exc_info=True)
        
        if video_id:
            try:
                update_asset_status(video_id, "FAILED")
            except Exception as db_error:
                logger.error(f"Failed to update status to FAILED: {db_error}")

        raise


if __name__ == "__main__":
    main()
