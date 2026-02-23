import axios from 'axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { SearchItem, VideoRenderer, InnertubeConfig } from './interfaces';

@Injectable()
export class KrokService {
  private static readonly YOUTUBE_HOME_URL = 'https://www.youtube.com';
  private static readonly YOUTUBE_SEARCH_API_URL = 'https://www.youtube.com/youtubei/v1/search';
  private static readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

  async search(query: string, continuation?: string) {
    const config = await this.getInnertubeConfig();

    const response = await axios.post(
      `${KrokService.YOUTUBE_SEARCH_API_URL}?key=${encodeURIComponent(config.apiKey)}`,
      {
        query,
        context: {
          client: {
            clientName: config.clientName,
            clientVersion: config.clientVersion,
          },
        },
        ...(continuation ? { continuation } : {}),
      },
      {
        timeout: 20000,
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
          Origin: KrokService.YOUTUBE_HOME_URL,
          'User-Agent': KrokService.USER_AGENT,
          Referer: `${KrokService.YOUTUBE_HOME_URL}/`,
        },
      },
    );

    const videos = this.extractVideoRenderers(response.data);

    return {
      items: videos.map((video) => this.mapVideoItem(video)),
      continuation: this.extractContinuationToken(response.data),
    };
  }

  private async getInnertubeConfig(): Promise<InnertubeConfig> {
    const response = await axios.get<string>(KrokService.YOUTUBE_HOME_URL, {
      timeout: 20000,
      responseType: 'text',
      headers: {
        'User-Agent': KrokService.USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = response.data;
    const apiKey = this.extractHtmlConfigValue(html, 'INNERTUBE_API_KEY');
    const clientName =
      this.extractHtmlConfigValue(html, 'INNERTUBE_CLIENT_NAME') ||
      this.extractHtmlConfigValue(html, 'INNERTUBE_CONTEXT_CLIENT_NAME') ||
      'WEB';
    const clientVersion = this.extractHtmlConfigValue(html, 'INNERTUBE_CLIENT_VERSION');

    if (!apiKey || !clientVersion) {
      throw new InternalServerErrorException('Failed to extract config');
    }

    return { apiKey, clientName, clientVersion };
  }

  private extractHtmlConfigValue(html: string, key: string): string | null {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const patterns = [
      new RegExp(`"${escapedKey}":"([^"]+)"`),
      new RegExp(`${escapedKey}:"([^"]+)"`),
      new RegExp(`"${escapedKey}":([^,}]+)`),
    ];

    for (const pattern of patterns) {
      const matched = html.match(pattern);
      if (!matched?.[1]) continue;

      return matched[1].replace(/^"|"$/g, '').trim();
    }

    return null;
  }

  private extractVideoRenderers(payload: unknown): VideoRenderer[] {
    const videoRenderers: VideoRenderer[] = [];

    this.deepCollectVideoRenderers(payload, videoRenderers);

    return videoRenderers;
  }

  private deepCollectVideoRenderers(node: unknown, output: VideoRenderer[]): void {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        this.deepCollectVideoRenderers(item, output);
      }

      return;
    }

    if (typeof node === 'object') {
      const nodeRecord = node as Record<string, unknown>;

      if (nodeRecord.videoRenderer) {
        output.push(nodeRecord.videoRenderer as VideoRenderer);
      }

      for (const value of Object.values(nodeRecord)) {
        this.deepCollectVideoRenderers(value, output);
      }
    }
  }

  private extractContinuationToken(payload: unknown): string | null {
    return this.findContinuationToken(payload);
  }

  private findContinuationToken(node: unknown): string | null {
    if (!node) return null;

    if (Array.isArray(node)) {
      for (const item of node) {
        const token = this.findContinuationToken(item);
        if (token) return token;
      }

      return null;
    }

    if (typeof node === 'object') {
      const nodeRecord = node as Record<string, unknown>;
      const continuationEndpoint = nodeRecord.continuationEndpoint as
        | Record<string, unknown>
        | undefined;
      const continuationCommand = continuationEndpoint?.continuationCommand as
        | Record<string, unknown>
        | undefined;
      const token = continuationCommand?.token;

      if (typeof token === 'string' && token.length > 0) {
        return token;
      }

      for (const value of Object.values(nodeRecord)) {
        const foundToken = this.findContinuationToken(value);
        if (foundToken) return foundToken;
      }
    }

    return null;
  }

  private mapVideoItem(video: VideoRenderer): SearchItem {
    const bylineRun = video.longBylineText?.runs?.[0];
    const channelAvatar =
      video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail
        ?.thumbnails?.[0]?.url ?? null;

    return {
      channelAvatar,
      id: video.videoId ?? null,
      channelName: bylineRun?.text ?? null,
      title: video.title?.runs?.[0]?.text ?? null,
      duration: video.lengthText?.simpleText ?? null,
      thumbnail: video.thumbnail?.thumbnails?.[0]?.url ?? null,
    };
  }
}
