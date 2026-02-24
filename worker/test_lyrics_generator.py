#!/usr/bin/env python3
"""
Test script for Phase 1 Lyrics Generation Pipeline

Usage:
  python test_lyrics_generator.py <audio_file> [language]

Example:
  python test_lyrics_generator.py vocals.wav en
  python test_lyrics_generator.py vocals.wav vi
"""

import sys
import json
import os
from pathlib import Path
from lyrics_generator import LyricsGenerator


def test_lyrics_generation(audio_path: str, language: str = "en"):
    """Test the Phase 1 lyrics generation pipeline."""
    print(f"\n{'='*70}")
    print(f"Testing Phase 1 Lyrics Generation Pipeline")
    print(f"{'='*70}")
    print(f"Audio: {audio_path}")
    print(f"Language: {language}")
    print(f"{'='*70}\n")

    # Validate audio file exists
    if not Path(audio_path).exists():
        print(f"❌ Error: Audio file not found: {audio_path}")
        sys.exit(1)

    try:
        # Initialize generator
        print("[*] Initializing LyricsGenerator...")
        generator = LyricsGenerator(
            whisper_model=os.getenv("WHISPER_MODEL", "medium"),
            language=language,
        )
        print("✅ LyricsGenerator initialized\n")

        # Run pipeline
        result = generator.generate(audio_path)

        # Display results
        print(f"\n{'='*70}")
        print("Results:")
        print(f"{'='*70}")
        print(f"\n📝 Rough Text (from Whisper):")
        print(f"   {result['rough_text']}\n")

        print(f"🔤 Phonemes:")
        for phoneme in result["phonemes"]:
            print(f"   • {phoneme}")

        print(f"\n⏱️  Aligned Words with Timing:")
        print(f"{'Index':<6} {'Phoneme':<20} {'Start (s)':<12} {'End (s)':<12}")
        print("-" * 50)
        for idx, word in enumerate(result["aligned_words"], 1):
            print(
                f"{idx:<6} {word['phoneme']:<20} {word['start']:<12.3f} {word['end']:<12.3f}"
            )

        print(f"\n{'='*70}")
        print(f"✅ Phase 1 Complete!")
        print(f"Total words/phonemes: {len(result['aligned_words'])}")
        print(f"Duration: {result['aligned_words'][-1]['end']:.2f}s")
        print(f"{'='*70}\n")

        # Save results to JSON
        output_file = Path(audio_path).stem + "_lyrics.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result["aligned_words"], f, indent=2, ensure_ascii=False)

        print(f"💾 Results saved to: {output_file}\n")

        return result

    except Exception as e:
        print(f"\n❌ Error during pipeline execution:")
        print(f"   {type(e).__name__}: {str(e)}\n")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    audio_file = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "en"

    test_lyrics_generation(audio_file, language)
