interface SearchItem {
  id: string | null;
  title: string | null;
  duration: string | null;
  thumbnail: string | null;
  channelName: string | null;
  channelAvatar: string | null;
}

interface VideoRenderer {
  videoId?: string;
  title?: {
    runs?: Array<{
      text?: string;
    }>;
  };
  lengthText?: {
    simpleText?: string;
  };
  thumbnail?: {
    thumbnails?: Array<{
      url?: string;
    }>;
  };
  longBylineText?: {
    runs?: Array<{
      text?: string;
      navigationEndpoint?: {
        browseEndpoint?: {
          canonicalBaseUrl?: string;
        };
      };
    }>;
  };
  channelThumbnailSupportedRenderers?: {
    channelThumbnailWithLinkRenderer?: {
      thumbnail?: {
        thumbnails?: Array<{
          url?: string;
        }>;
      };
    };
  };
}

interface InnertubeConfig {
  apiKey: string;
  clientName: string;
  clientVersion: string;
}

export type { SearchItem, VideoRenderer, InnertubeConfig };
