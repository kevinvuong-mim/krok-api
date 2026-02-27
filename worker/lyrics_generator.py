import os
import re
import json
import torch
import whisper
import torchaudio
from typing import Any


# Whisper transcription thresholds - tune these to reduce hallucinations
WHISPER_NO_SPEECH_THRESHOLD = 0.5
WHISPER_LOGPROB_THRESHOLD = -0.8
WHISPER_COMPRESSION_RATIO_THRESHOLD = 2.0

# Audio energy threshold for detecting actual speech
SILENCE_ENERGY_THRESHOLD = 0.01

# VAD (Voice Activity Detection) settings
VAD_THRESHOLD = 0.5
VAD_MIN_SPEECH_RATIO = 0.3

# Confidence filtering for Whisper segments
MIN_SEGMENT_AVG_LOGPROB = -0.7


class LyricsGenerator:
    def __init__(self, whisper_model: str = "medium", language: str = "vi"):
        self.whisper_model = self._load_whisper_model(whisper_model)
        self.language = language

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.word_delim = "|"
        self.align_enabled = False
        self.vad_enabled = False

        # Load Silero VAD model for voice activity detection
        try:
            self.vad_model, vad_utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
                trust_repo=True
            )
            self.vad_model = self.vad_model.to(self.device)
            self.get_speech_timestamps = vad_utils[0]
            self.vad_enabled = True
            print("[VAD] Silero VAD loaded successfully")
        except Exception as error:
            print(f"[VAD] Silero VAD disabled: {error}")
            self.vad_model = None
            self.get_speech_timestamps = None

        # Use BASE_960H as default for lower memory usage, can override via env
        default_bundle = os.getenv("WAV2VEC2_ALIGN_BUNDLE") or "base_960h"
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
            print(f"[Alignment] wav2vec2 loaded: {len(self.labels)} labels")
        except Exception as error:
            print(f"[Alignment] wav2vec2 alignment disabled: {error}")

    def _load_whisper_model(self, model_name: str):
        """Load Whisper model with fallback to smaller models if memory is limited."""
        # Order by memory efficiency for CPU environments
        preferred_models = ["large-v3", "medium", "small", "base"]
        
        if model_name in preferred_models:
            try_order = [model_name] + [m for m in preferred_models if m != model_name]
        else:
            try_order = [model_name] + preferred_models
        
        for model in try_order:
            try:
                print(f"[Whisper] Loading model: {model}")
                return whisper.load_model(model)
            except Exception as error:
                print(f"[Whisper] Failed to load {model}: {error}")
                continue
        
        raise RuntimeError("Failed to load any Whisper model")

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

    def _get_audio_energy(self, waveform: torch.Tensor, sample_rate: int, 
                          start_time: float, end_time: float) -> float:
        """Calculate RMS energy for a specific time range in the audio."""
        start_sample = int(start_time * sample_rate)
        end_sample = int(end_time * sample_rate)
        
        # Clamp to valid range
        start_sample = max(0, start_sample)
        end_sample = min(waveform.size(1), end_sample)
        
        if end_sample <= start_sample:
            return 0.0
        
        segment = waveform[:, start_sample:end_sample]
        rms = torch.sqrt(torch.mean(segment ** 2)).item()
        return rms

    def _get_speech_ratio_vad(self, waveform: torch.Tensor, sample_rate: int,
                               start_time: float, end_time: float) -> float:
        """
        Use Silero VAD to determine what ratio of the segment contains speech.
        Returns a value between 0.0 (no speech) and 1.0 (all speech).
        """
        if not self.vad_enabled or self.vad_model is None:
            return 1.0  # Assume speech if VAD not available
        
        start_sample = int(start_time * sample_rate)
        end_sample = int(end_time * sample_rate)
        
        start_sample = max(0, start_sample)
        end_sample = min(waveform.size(1), end_sample)
        
        if end_sample <= start_sample:
            return 0.0
        
        segment = waveform[:, start_sample:end_sample]
        
        # Silero VAD requires 16kHz audio
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(
                orig_freq=sample_rate, new_freq=16000
            )
            segment = resampler(segment)
        
        # Flatten to 1D for VAD
        segment_1d = segment.squeeze(0)
        
        try:
            # Get speech timestamps from VAD
            speech_timestamps = self.get_speech_timestamps(
                segment_1d,
                self.vad_model,
                threshold=VAD_THRESHOLD,
                sampling_rate=16000,
                return_seconds=False,
            )
            
            if not speech_timestamps:
                return 0.0
            
            # Calculate total speech duration
            total_speech_samples = sum(
                ts["end"] - ts["start"] for ts in speech_timestamps
            )
            total_samples = segment_1d.size(0)
            
            return total_speech_samples / total_samples if total_samples > 0 else 0.0
            
        except Exception as error:
            print(f"[VAD] Error processing segment: {error}")
            return 1.0  # Assume speech on error

    def _filter_hallucinated_segments(self, segments: list[dict], 
                                       waveform: torch.Tensor, 
                                       sample_rate: int) -> list[dict]:
        """
        Filter out segments where there's no actual speech/singing.
        Uses BOTH energy AND VAD - segment is removed only if both indicate silence.
        This preserves soft singing that VAD alone might miss.
        """
        filtered = []
        removed_count = 0
        
        for segment in segments:
            start_time = segment.get("start", 0)
            end_time = segment.get("end", 0)
            text = segment.get("text", "").strip()
            avg_logprob = segment.get("avg_logprob", 0.0)
            
            # Confidence filtering based on logprob
            if avg_logprob < MIN_SEGMENT_AVG_LOGPROB:
                print(f"[Filter] Low confidence segment: '{text}' "
                      f"(avg_logprob={avg_logprob:.2f})")
                removed_count += 1
                continue
            
            # Calculate energy
            energy = self._get_audio_energy(waveform, sample_rate, start_time, end_time)
            
            # Calculate speech ratio via VAD
            speech_ratio = self._get_speech_ratio_vad(waveform, sample_rate, start_time, end_time)
            
            # Remove ONLY if BOTH energy is low AND speech ratio is low
            # This preserves soft singing that VAD might miss
            is_silent = energy < SILENCE_ENERGY_THRESHOLD
            is_no_speech = speech_ratio < VAD_MIN_SPEECH_RATIO
            
            if is_silent and is_no_speech:
                print(f"[Filter] Removed hallucinated segment: '{text}' "
                      f"(energy={energy:.4f}, speech_ratio={speech_ratio:.2f})")
                removed_count += 1
                continue
            
            filtered.append(segment)
        
        if removed_count > 0:
            print(f"[Filter] Removed {removed_count} hallucinated segment(s)")
        
        return filtered

    def _clean_text_for_alignment(self, text: str) -> str:
        """
        Clean transcribed text for alignment.
        Remove punctuation, keep Vietnamese letters and spaces.
        """
        # Remove punctuation and special characters, keep Vietnamese letters and spaces
        cleaned = re.sub(r'[^\w\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]', '', text, flags=re.IGNORECASE)
        # Collapse multiple spaces
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned

    def _normalize_vietnamese_for_alignment(self, text: str) -> str:
        """
        Normalize Vietnamese text for alignment.
        
        Strategy: Remove TONE marks but preserve vowel identity.
        
        Vietnamese tones to remove: ̀ ́ ̉ ̃ ̣ (combining diacritics)
        
        Vowel mappings (preserve base vowel structure):
        ă, â → a
        ê → e  
        ô, ơ → o
        ư → u
        đ → d
        
        Example: "thương" → "thuong" (NOT "thng")
        """
        # First, clean punctuation
        text = self._clean_text_for_alignment(text)
        
        # Vietnamese tone mark removal (combining diacritics)
        # These are the 5 Vietnamese tones represented as combining marks
        tone_marks = [
            '\u0300',  # grave (huyền)
            '\u0301',  # acute (sắc)
            '\u0303',  # tilde (ngã)
            '\u0309',  # hook above (hỏi)
            '\u0323',  # dot below (nặng)
        ]
        
        # Complete Vietnamese character mappings
        # Maps each accented vowel to its base form (tone removed, vowel identity preserved)
        vietnamese_char_map = {
            # a with tones
            'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
            # ă with tones → a
            'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
            # â with tones → a
            'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
            # e with tones
            'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
            # ê with tones → e
            'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
            # i with tones
            'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
            # o with tones
            'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
            # ô with tones → o
            'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
            # ơ with tones → o
            'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
            # u with tones
            'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
            # ư with tones → u
            'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
            # y with tones
            'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
            # đ → d
            'đ': 'd',
            # Uppercase versions
            'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
            'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
            'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
            'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
            'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
            'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
            'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
            'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
            'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
            'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
            'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
            'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y',
            'Đ': 'D',
        }
        
        # Apply character mapping
        normalized = []
        for char in text:
            if char in vietnamese_char_map:
                normalized.append(vietnamese_char_map[char])
            elif char not in tone_marks:
                normalized.append(char)
        
        return ''.join(normalized)

    def step1_transcribe(self, audio_path: str) -> dict[str, Any]:
        """Transcribe audio using Whisper with Vietnamese singing optimization."""
        print(f"[Transcribe] Processing: {audio_path}")

        # Load audio for filtering
        waveform, sample_rate = torchaudio.load(audio_path)
        if waveform.size(0) > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        # Vietnamese contextual prompt for lyrics
        initial_prompt = "Đây là lời bài hát tiếng Việt, hãy chép lại chính xác."

        result = self.whisper_model.transcribe(
            audio_path,
            beam_size=5,
            best_of=5,
            temperature=0,
            condition_on_previous_text=False,
            language=self.language,
            verbose=False,
            initial_prompt=initial_prompt,
            no_speech_threshold=WHISPER_NO_SPEECH_THRESHOLD,
            logprob_threshold=WHISPER_LOGPROB_THRESHOLD,
            compression_ratio_threshold=WHISPER_COMPRESSION_RATIO_THRESHOLD,
        )

        raw_segments = result.get("segments", [])
        raw_text = result.get("text", "").strip()
        
        # Filter hallucinated segments
        filtered_segments = self._filter_hallucinated_segments(
            raw_segments, waveform, sample_rate
        )
        
        # Rebuild and clean text from filtered segments
        lyrics_text = " ".join(seg.get("text", "").strip() for seg in filtered_segments)
        lyrics_text = self._clean_text_for_alignment(lyrics_text)

        if len(filtered_segments) != len(raw_segments):
            print(f"[Transcribe] Raw: {raw_text}")
            print(f"[Transcribe] Cleaned: {lyrics_text}")
        else:
            print(f"[Transcribe] Lyrics: {lyrics_text}")

        return {
            "lyrics_text": lyrics_text,
            "segments": filtered_segments,
            "language": result.get("language"),
        }

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

    def _normalize_text_for_alignment(self, text: str) -> str:
        """Normalize text for wav2vec2 alignment using Vietnamese grapheme normalization."""
        # Apply Vietnamese-specific normalization
        normalized = self._normalize_vietnamese_for_alignment(text)
        
        # Convert to appropriate case for model
        normalized = normalized.upper() if self.labels_are_upper else normalized.lower()
        normalized = re.sub(r"\s+", " ", normalized).strip()

        # Filter to only characters in the model's vocabulary
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

    def step2_align(
        self, audio_path: str, lyrics_text: str
    ) -> list[dict[str, Any]]:
        """Align lyrics with audio using wav2vec2 forced alignment."""
        print(f"[Align] Aligning with wav2vec2...")

        waveform, _ = self._load_audio(audio_path)
        aligned_words: list[dict[str, Any]] = []

        if self.align_enabled:
            try:
                aligned_words = self._align_words_from_text(waveform, lyrics_text)
            except Exception as error:
                print(f"[Align] Forced alignment failed: {error}")
        else:
            print("[Align] Forced alignment unavailable, using duration fallback")

        print(f"[Align] Aligned {len(aligned_words)} words")

        if aligned_words:
            return aligned_words

        # Fallback to duration-based timing
        audio_duration = waveform.size(1) / self.align_sample_rate
        words_list = re.findall(r"[a-zA-ZÀ-ỹ]+", lyrics_text)

        if not words_list:
            return []

        word_duration = audio_duration / len(words_list)

        return [
            {
                "word": word,
                "start": index * word_duration,
                "end": (index + 1) * word_duration,
            }
            for index, word in enumerate(words_list)
        ]

    def generate(self, audio_path: str) -> dict[str, Any]:
        """Generate word-level timestamped lyrics from audio."""
        print("\n" + "=" * 60)
        print("Vietnamese Lyrics Generation Pipeline")
        print("=" * 60)

        # Step 1: Transcribe
        transcription = self.step1_transcribe(audio_path)
        lyrics_text = transcription["lyrics_text"]

        # Step 2: Align
        aligned_words = self.step2_align(audio_path, lyrics_text)
        original_words = re.findall(r"[a-zA-ZÀ-ỹ]+", lyrics_text)

        # Combine original words with alignment timestamps
        combined_words: list[dict[str, Any]] = []
        for index, aligned in enumerate(aligned_words):
            word_text = original_words[index] if index < len(original_words) else aligned["word"]
            combined_words.append(
                {
                    "word": word_text,
                    "start": aligned["start"],
                    "end": aligned["end"],
                }
            )

        result = {
            "lyrics_text": lyrics_text,
            "aligned_words": combined_words,
        }

        print("\n" + "=" * 60)
        print("Pipeline Complete!")
        print("=" * 60)
        print(json.dumps(result, indent=2))

        return result


def generate_lyrics(vocals_path: str, language: str = "vi") -> list[dict[str, Any]]:
    """Generate word-level timestamped lyrics from vocal audio."""
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
