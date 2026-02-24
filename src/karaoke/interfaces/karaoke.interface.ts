interface LyricsWord {
  end: number;
  word: string;
  start: number;
}

interface KaraokeReadyResponse {
  status: 'ready';
  lyrics: LyricsWord[];
  instrumentalUrl: string;
}

interface KaraokeFailedResponse {
  status: 'failed';
}

interface KaraokeCompletedResponse {
  status: 'completed';
  lyrics: LyricsWord[];
  instrumentalUrl: string;
}

interface KaraokeProcessingResponse {
  jobId: string;
  status: 'processing';
}

export type {
  LyricsWord,
  KaraokeReadyResponse,
  KaraokeFailedResponse,
  KaraokeCompletedResponse,
  KaraokeProcessingResponse,
};
