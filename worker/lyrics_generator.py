import os
import re
import json
import torch
import whisper
import torchaudio
import unicodedata
from typing import Any
from phonemizer.separator import Separator
from phonemizer.backend import EspeakBackend


class LyricsGenerator:
    def __init__(self, whisper_model: str = "medium", language: str = "vi"):
        self.whisper_model = whisper.load_model(whisper_model)
        self.language = language

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.word_delim = "|"
        self.align_enabled = False

        default_bundle = os.getenv("WAV2VEC2_ALIGN_BUNDLE") or "xlsr_300m"
        self.align_bundle = self._load_alignment_bundle(default_bundle)
        self.align_model = None
        self.align_sample_rate = 16000
        self.labels: list[str] = []
        self.label_to_id: dict[str, int] = {}
        self.blank_id = 0
        self.labels_are_upper = False

        try:
            self.align_model = self.align_bundle.get_model().to(self.device).eval()
            self.align_sample_rate = self._get_bundle_sample_rate(self.align_bundle)
            self.labels = self._get_bundle_labels(self.align_bundle)
            self.label_to_id = {
                label: index for index, label in enumerate(self.labels)
            }
            self.blank_id = self.label_to_id.get("<blk>", 0)
            self.labels_are_upper = any(
                label.isalpha() and label.upper() == label for label in self.labels
            )
            self.align_enabled = True
        except Exception as error:
            print(f"[Step 3] Wav2Vec2 alignment disabled: {error}")

    def _get_bundle_labels(self, bundle) -> list[str]:
        if hasattr(bundle, "get_labels") and callable(bundle.get_labels):
            return list(bundle.get_labels())

        labels = getattr(bundle, "labels", None)
        if labels is not None:
            return list(labels)

        raise RuntimeError("Selected wav2vec2 bundle does not expose labels")

    def _get_bundle_sample_rate(self, bundle) -> int:
        sample_rate = getattr(bundle, "sample_rate", None)
        if sample_rate is not None:
            return int(sample_rate)

        if hasattr(bundle, "get_sample_rate") and callable(bundle.get_sample_rate):
            return int(bundle.get_sample_rate())

        raise RuntimeError("Selected wav2vec2 bundle does not expose sample rate")

    def _load_alignment_bundle(self, name: str | None):
        if not name:
            return torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H

        bundles = {
            "base_960h": torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H,
            "large_960h": torchaudio.pipelines.WAV2VEC2_ASR_LARGE_960H,
            "xlsr_300m": torchaudio.pipelines.WAV2VEC2_XLSR_300M,
        }

        return bundles.get(name.lower(), torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H)

    def step1_transcribe_rough(self, audio_path: str) -> dict[str, Any]:
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

        rough_text = result.get("text", "").strip()
        segments = result.get("segments", [])

        print(f"[Step 1] Rough text: {rough_text}")

        return {
            "rough_text": rough_text,
            "segments": segments,
            "language": result.get("language"),
        }

    def step2_phonemize(self, text: str) -> list[str]:
        print(f"[Step 2] Phonemizing: {text}")

        backend = EspeakBackend(
            language=self.language,
            preserve_punctuation=False,
            with_stress=False,
        )

        separator = Separator(phone=" ", word="|")
        phonemes = backend.phonemize([text], separator=separator)

        phoneme_words = [p.strip() for p in phonemes[0].split("|") if p.strip()]

        print(f"[Step 2] Phonemes: {phoneme_words}")

        return phoneme_words

    def _load_audio(self, audio_path: str) -> tuple[torch.Tensor, int]:
        waveform, sample_rate = torchaudio.load(audio_path)

        if waveform.size(0) > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        if sample_rate != self.align_sample_rate:
            resampler = torchaudio.transforms.Resample(
                orig_freq=sample_rate, new_freq=self.align_sample_rate
            )
            waveform = resampler(waveform)

        return waveform, self.align_sample_rate

    def _strip_diacritics(self, text: str) -> str:
        decomposed = unicodedata.normalize("NFD", text)
        stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
        return stripped.replace("đ", "d").replace("Đ", "D")

    def _normalize_text_for_alignment(self, text: str) -> str:
        normalized = self._strip_diacritics(text)
        normalized = normalized.upper() if self.labels_are_upper else normalized.lower()
        normalized = re.sub(r"\s+", " ", normalized).strip()

        filtered: list[str] = []
        for char in normalized:
            if char == " ":
                if self.word_delim in self.label_to_id:
                    filtered.append(self.word_delim)
                continue

            if char in self.label_to_id:
                filtered.append(char)

        return "".join(filtered)

    def _tokenize(self, text: str) -> torch.Tensor:
        token_ids = [self.label_to_id[char] for char in text if char in self.label_to_id]
        return torch.tensor(token_ids, dtype=torch.int64)

    def _get_emissions(self, waveform: torch.Tensor) -> torch.Tensor:
        with torch.inference_mode():
            emissions, _ = self.align_model(waveform.to(self.device))
            emissions = torch.log_softmax(emissions, dim=-1)

        return emissions[0].cpu()

    def _align_words_from_text(
        self, waveform: torch.Tensor, transcript: str
    ) -> list[dict[str, Any]]:
        normalized_text = self._normalize_text_for_alignment(transcript)

        if not normalized_text:
            return []

        tokens = self._tokenize(normalized_text)
        emissions = self._get_emissions(waveform)

        aligned_tokens, scores = torchaudio.functional.forced_align(
            emissions, tokens, blank=self.blank_id
        )
        spans = torchaudio.functional.merge_tokens(aligned_tokens, scores)

        audio_duration = waveform.size(1) / self.align_sample_rate
        frame_duration = audio_duration / emissions.size(0)

        words: list[dict[str, Any]] = []
        current_chars: list[str] = []
        current_start: float | None = None
        current_end: float | None = None

        for span in spans:
            label = self.labels[span.token]

            if label == self.word_delim:
                if current_chars:
                    words.append(
                        {
                            "word": "".join(current_chars),
                            "start": current_start or 0.0,
                            "end": current_end or 0.0,
                        }
                    )

                current_chars = []
                current_start = None
                current_end = None
                continue

            if current_start is None:
                current_start = span.start * frame_duration

            current_end = span.end * frame_duration
            current_chars.append(label)

        if current_chars:
            words.append(
                {
                    "word": "".join(current_chars),
                    "start": current_start or 0.0,
                    "end": current_end or 0.0,
                }
            )

        return words

    def step3_align(
        self, audio_path: str, rough_text: str
    ) -> list[dict[str, Any]]:
        print(f"[Step 3] Aligning with wav2vec2...")

        waveform, _ = self._load_audio(audio_path)
        aligned_words: list[dict[str, Any]] = []

        if self.align_enabled:
            try:
                aligned_words = self._align_words_from_text(waveform, rough_text)
            except Exception as error:
                print(f"[Step 3] Forced alignment failed: {error}")
        else:
            print("[Step 3] Forced alignment unavailable, using duration fallback")

        print(f"[Step 3] Aligned {len(aligned_words)} words")

        if aligned_words:
            return aligned_words

        audio_duration = waveform.size(1) / self.align_sample_rate
        rough_words = re.findall(r"\S+", rough_text)

        if not rough_words:
            return []

        word_duration = audio_duration / len(rough_words)

        return [
            {
                "word": word,
                "start": index * word_duration,
                "end": (index + 1) * word_duration,
            }
            for index, word in enumerate(rough_words)
        ]

    def generate(self, audio_path: str) -> dict[str, Any]:
        print("\n" + "=" * 60)
        print("Phase 1: Lyrics Generation Pipeline")
        print("=" * 60)

        transcription = self.step1_transcribe_rough(audio_path)
        rough_text = transcription["rough_text"]

        phoneme_words = self.step2_phonemize(rough_text)

        aligned_words = self.step3_align(audio_path, rough_text)
        rough_words = re.findall(r"\S+", rough_text)

        combined_words: list[dict[str, Any]] = []
        for index, aligned in enumerate(aligned_words):
            word_text = rough_words[index] if index < len(rough_words) else aligned["word"]
            phoneme = phoneme_words[index] if index < len(phoneme_words) else ""

            combined_words.append(
                {
                    "word": word_text,
                    "phoneme": phoneme,
                    "start": aligned["start"],
                    "end": aligned["end"],
                }
            )

        result = {
            "rough_text": rough_text,
            "phonemes": phoneme_words,
            "aligned_words": combined_words,
        }

        print("\n" + "=" * 60)
        print("Phase 1 Complete!")
        print("=" * 60)
        print(json.dumps(result, indent=2))

        return result


def generate_lyrics(vocals_path: str, language: str = "vi") -> list[dict[str, Any]]:
    generator = LyricsGenerator(
        whisper_model=os.getenv("WHISPER_MODEL", "medium"),
        language=language,
    )

    result = generator.generate(vocals_path)

    words = []
    for item in result["aligned_words"]:
        words.append(
            {
                "word": item["word"],
                "start": item["start"],
                "end": item["end"],
            }
        )

    return words


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python lyrics_generator.py <audio_path> [language]")
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "vi"

    result = generate_lyrics(audio_path, language)
    print(json.dumps(result, indent=2))
