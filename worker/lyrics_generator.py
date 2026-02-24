"""
Phase 1: Audio → Phoneme → Lyric-like Text → Timing

Pipeline:
1. Whisper (rough transcription with beam search)
2. Phonemizer (convert text to phonemes)
3. wav2vec2 alignment (forced alignment using phonemes)
"""

import os
import json
import numpy as np
import librosa
import soundfile as sf
import whisper
from pathlib import Path
from typing import Any
from phonemizer.backend import EspeakBackend
from phonemizer.separator import Separator
from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
import torch


class LyricsGenerator:
    """Generate lyrics with timing from audio."""

    def __init__(self, whisper_model: str = "medium", language: str = "en"):
        """
        Initialize LyricsGenerator.

        Args:
            whisper_model: Whisper model size (tiny, base, small, medium, large)
            language: Language code for phonemizer (en, vi, etc.)
        """
        self.whisper_model = whisper.load_model(whisper_model)
        self.language = language
        self.sample_rate = 16000

        # Load wav2vec2 model for alignment
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = Wav2Vec2Processor.from_pretrained(
            "facebook/wav2vec2-large-xlsr-53-english"
        )
        self.wav2vec_model = Wav2Vec2ForCTC.from_pretrained(
            "facebook/wav2vec2-large-xlsr-53-english"
        ).to(self.device)
        self.wav2vec_model.eval()

    def step1_transcribe_rough(self, audio_path: str) -> dict[str, Any]:
        """
        Step 1: Rough transcription using Whisper.

        Optimized for singing with:
        - beam_size=5
        - best_of=5
        - temperature=0
        - condition_on_previous_text=False
        """
        print(f"[Step 1] Transcribing: {audio_path}")

        result = self.whisper_model.transcribe(
            audio_path,
            beam_size=5,
            best_of=5,
            temperature=0,
            condition_on_previous_text=False,
            language=self.language,
            verbose=False,
        )

        # Extract text and segment info
        rough_text = result.get("text", "").strip()
        segments = result.get("segments", [])

        print(f"[Step 1] Rough text: {rough_text}")

        return {
            "rough_text": rough_text,
            "segments": segments,
            "language": result.get("language"),
        }

    def step2_phonemize(self, text: str) -> list[str]:
        """
        Step 2: Convert text to phonemes using phonemizer.

        Returns list of phonemes for each word.
        """
        print(f"[Step 2] Phonemizing: {text}")

        backend = EspeakBackend(
            language=self.language,
            preserve_punctuation=False,
            with_stress=False,
        )

        # Get phonemes with word separation
        separator = Separator(phone=" ", word="|")
        phonemes = backend.phonemize([text], separator=separator)

        # Split by word and clean
        phoneme_words = [p.strip() for p in phonemes[0].split("|") if p.strip()]

        print(f"[Step 2] Phonemes: {phoneme_words}")

        return phoneme_words

    def _load_audio(self, audio_path: str) -> tuple[np.ndarray, int]:
        """Load audio and resample to 16kHz."""
        y, sr = librosa.load(audio_path, sr=None, mono=True)

        if sr != self.sample_rate:
            y = librosa.resample(y, orig_sr=sr, target_sr=self.sample_rate)

        return y, self.sample_rate

    def _align_with_wav2vec2(
        self, audio: np.ndarray, phoneme_sequence: str
    ) -> list[dict[str, Any]]:
        """
        Perform forced alignment using wav2vec2.

        Returns list of phonemes with timing.
        """
        # Prepare audio for wav2vec2
        inputs = self.processor(
            audio, sampling_rate=self.sample_rate, return_tensors="pt", padding=True
        )

        # Get wav2vec2 outputs
        with torch.no_grad():
            logits = self.wav2vec_model(
                inputs.input_values.to(self.device),
                attention_mask=inputs.attention_mask.to(self.device),
            ).logits

        # Get predictions
        predicted_ids = torch.argmax(logits, dim=-1)
        predicted_ids_list = predicted_ids[0].cpu().numpy()

        # Convert to characters
        vocab = self.processor.tokenizer.get_vocab()
        inv_vocab = {v: k for k, v in vocab.items()}

        predicted_chars = [inv_vocab.get(id, "[UNK]") for id in predicted_ids_list]

        # Calculate timing
        num_frames = len(predicted_chars)
        audio_duration = len(audio) / self.sample_rate
        frame_duration = audio_duration / num_frames if num_frames > 0 else 0

        # Simple alignment: map phonemes to frames
        aligned_phonemes = []
        phoneme_chars = phoneme_sequence.replace("|", " ").split()

        current_pos = 0
        for phoneme_idx, phoneme in enumerate(phoneme_chars):
            # Find where this phoneme appears in predicted_chars
            phoneme_length = len(phoneme.replace(" ", ""))
            start_frame = current_pos
            end_frame = min(current_pos + phoneme_length * 2, len(predicted_chars))

            aligned_phonemes.append(
                {
                    "phoneme": phoneme,
                    "start": start_frame * frame_duration,
                    "end": end_frame * frame_duration,
                    "start_frame": start_frame,
                    "end_frame": end_frame,
                }
            )

            current_pos = end_frame

        return aligned_phonemes

    def step3_align(self, audio_path: str, phoneme_words: list[str]) -> list[dict[str, Any]]:
        """
        Step 3: Forced alignment using wav2vec2.

        Returns words with timing information.
        """
        print(f"[Step 3] Aligning with wav2vec2...")

        # Load audio
        audio, sr = self._load_audio(audio_path)

        # Convert phoneme words to sequence
        phoneme_sequence = "|".join(phoneme_words)

        # Perform alignment
        aligned_phonemes = self._align_with_wav2vec2(audio, phoneme_sequence)

        print(f"[Step 3] Aligned {len(aligned_phonemes)} phonemes")

        return aligned_phonemes

    def generate(self, audio_path: str) -> dict[str, Any]:
        """
        Full Phase 1 pipeline: Audio → Phoneme → Alignment → Timing.

        Returns:
            {
                "rough_text": str,
                "phonemes": list[str],
                "aligned_words": [
                    {
                        "phoneme": str,
                        "start": float (seconds),
                        "end": float (seconds),
                    },
                    ...
                ]
            }
        """
        print("\n" + "=" * 60)
        print("Phase 1: Lyrics Generation Pipeline")
        print("=" * 60)

        # Step 1: Rough transcription
        transcription = self.step1_transcribe_rough(audio_path)
        rough_text = transcription["rough_text"]

        # Step 2: Phonemize
        phoneme_words = self.step2_phonemize(rough_text)

        # Step 3: Alignment
        aligned_words = self.step3_align(audio_path, phoneme_words)

        result = {
            "rough_text": rough_text,
            "phonemes": phoneme_words,
            "aligned_words": aligned_words,
        }

        print("\n" + "=" * 60)
        print("Phase 1 Complete!")
        print("=" * 60)
        print(json.dumps(result, indent=2))

        return result


def generate_lyrics(vocals_path: str, language: str = "en") -> list[dict[str, Any]]:
    """
    Generate lyrics with timing from vocal audio.

    Args:
        vocals_path: Path to vocal audio file
        language: Language code (en, vi, etc.)

    Returns:
        List of words with timing: [{"word": str, "start": float, "end": float}, ...]
    """
    generator = LyricsGenerator(
        whisper_model=os.getenv("WHISPER_MODEL", "medium"),
        language=language,
    )

    result = generator.generate(vocals_path)

    # Convert aligned phonemes to word format
    words = []
    for item in result["aligned_words"]:
        words.append(
            {
                "word": item["phoneme"],
                "start": item["start"],
                "end": item["end"],
            }
        )

    return words


if __name__ == "__main__":
    # Test example
    import sys

    if len(sys.argv) < 2:
        print("Usage: python lyrics_generator.py <audio_path> [language]")
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "en"

    result = generate_lyrics(audio_path, language)
    print(json.dumps(result, indent=2))
