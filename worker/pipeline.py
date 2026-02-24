import os
import sys
import json
import boto3
import shlex
import psycopg2
import tempfile
import subprocess
from typing import Any
from pathlib import Path
from lyrics_generator import generate_lyrics as generate_lyrics_phase1

def run(command: list[str], cwd: Path | None = None) -> None:
    process = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if process.returncode != 0:
        raise RuntimeError(
            f"Command failed: {' '.join(shlex.quote(part) for part in command)}\n{process.stderr.strip()}"
        )


def update_asset_status(
    video_id: str,
    status: str,
    instrumental_url: str | None = None,
    lyrics_url: str | None = None,
) -> None:
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE "karaoke_assets"
                SET "status" = %s,
                    "instrumentalUrl" = %s,
                    "lyricsUrl" = %s
                WHERE "videoId" = %s
                """,
                (status, instrumental_url, lyrics_url, video_id),
            )


def upload_to_storage(local_file: Path, object_key: str, content_type: str) -> str:
    endpoint = os.getenv("AWS_ENDPOINT")
    public_base_url = os.getenv("KARAOKE_PUBLIC_BASE_URL") or endpoint
    region = os.getenv("AWS_REGION") or "us-east-1"
    bucket_name = os.getenv("AWS_BUCKET_NAME")
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

    if not endpoint or not bucket_name or not access_key or not secret_key:
        raise RuntimeError(
            "AWS_ENDPOINT, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY are required"
        )

    s3_client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    s3_client.upload_file(
        str(local_file),
        bucket_name,
        object_key,
        ExtraArgs={"ContentType": content_type},
    )

    return f"{public_base_url.rstrip('/')}/{bucket_name}/{object_key}"


def generate_lyrics(vocals_path: Path, output_path: Path) -> list[dict[str, Any]]:
    """
    Generate lyrics using Phase 1 pipeline:
    Audio → Whisper → Phoneme → wav2vec2 Alignment → Timing
    """
    language = os.getenv("WHISPER_LANGUAGE") or "en"

    # Use Phase 1 pipeline
    words = generate_lyrics_phase1(str(vocals_path), language=language)

    output_path.write_text(
        json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return words


def find_demucs_output(base_dir: Path) -> tuple[Path, Path]:
    candidates = list(base_dir.glob("**/vocals.wav"))

    if not candidates:
        raise RuntimeError("Demucs output vocals.wav not found")

    vocals_path = candidates[0]
    no_vocals_path = vocals_path.parent / "no_vocals.wav"

    if not no_vocals_path.exists():
        raise RuntimeError("Demucs output no_vocals.wav not found")

    return vocals_path, no_vocals_path


def process_video(video_id: str, job_id: str) -> dict[str, Any]:
    update_asset_status(video_id, "PROCESSING")

    with tempfile.TemporaryDirectory(prefix="karaoke-") as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        audio_webm = temp_dir / "audio.webm"
        audio_wav = temp_dir / "audio.wav"
        demucs_output_dir = temp_dir / "demucs_out"
        lyrics_path = temp_dir / "lyrics.json"

        run(
            [
                "yt-dlp",
                "--format",
                "bestaudio[ext=webm]/bestaudio",
                "--output",
                str(audio_webm),
                f"https://www.youtube.com/watch?v={video_id}",
            ]
        )

        run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(audio_webm),
                "-ar",
                "44100",
                "-ac",
                "2",
                str(audio_wav),
            ]
        )

        run(
            [
                "python3",
                "-m",
                "demucs.separate",
                "-n",
                os.getenv("DEMUCS_MODEL") or "htdemucs",
                "--two-stems=vocals",
                "-o",
                str(demucs_output_dir),
                str(audio_wav),
            ]
        )

        vocals_path, no_vocals_path = find_demucs_output(demucs_output_dir)
        lyrics = generate_lyrics(vocals_path, lyrics_path)

        instrumental_key = f"general/temp/{video_id}/no_vocals.wav"
        lyrics_key = f"general/temp/{video_id}/lyrics.json"

        instrumental_url = upload_to_storage(
            no_vocals_path, instrumental_key, "audio/wav"
        )
        lyrics_url = upload_to_storage(lyrics_path, lyrics_key, "application/json")

        update_asset_status(
            video_id, "READY", instrumental_url=instrumental_url, lyrics_url=lyrics_url
        )

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

    payload = json.loads(sys.argv[1])
    video_id = str(payload.get("videoId", "")).strip()
    job_id = str(payload.get("jobId", "")).strip()

    if not video_id:
        raise RuntimeError("videoId is required")

    try:
        result = process_video(video_id, job_id)
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        try:
            update_asset_status(video_id, "FAILED")
        except Exception:
            pass

        raise


if __name__ == "__main__":
    main()
