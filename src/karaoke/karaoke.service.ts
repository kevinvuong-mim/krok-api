import axios from 'axios';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { KaraokeAssetStatus } from '@prisma/client';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

import {
  LyricsWord,
  KaraokeReadyResponse,
  KaraokeFailedResponse,
  KaraokeCompletedResponse,
  KaraokeProcessingResponse,
} from '@/karaoke/interfaces/karaoke.interface';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class KaraokeService implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly awsEndpoint: string;
  private readonly awsBucketName: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = Number(this.configService.get<string>('REDIS_PORT') || 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const queueName = this.configService.get<string>('KARAOKE_QUEUE_NAME') || 'karaoke-processing';

    this.awsEndpoint = this.configService.get<string>('AWS_ENDPOINT') || '';
    this.awsBucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';
    this.publicBaseUrl =
      this.configService.get<string>('KARAOKE_PUBLIC_BASE_URL') || this.awsEndpoint;

    const connection = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue(queueName, { connection });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  async requestKaraoke(videoId: string): Promise<KaraokeProcessingResponse | KaraokeReadyResponse> {
    const existing = await this.prisma.karaokeAsset.findUnique({ where: { videoId } });

    if (
      existing?.status === KaraokeAssetStatus.READY &&
      existing.instrumentalUrl &&
      existing.lyricsUrl
    ) {
      const instrumentalUrl = this.buildPublicUrl(existing.instrumentalUrl);
      const lyrics = await this.getLyricsFromUrl(this.buildPublicUrl(existing.lyricsUrl));

      return {
        status: 'ready',
        instrumentalUrl,
        lyrics,
      };
    }

    if (existing?.status === KaraokeAssetStatus.PROCESSING && existing.jobId) {
      return {
        status: 'processing',
        jobId: existing.jobId,
      };
    }

    const job = await this.queue.add(
      this.configService.get<string>('KARAOKE_JOB_NAME') || 'process-video',
      { videoId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    const jobId = String(job.id);

    await this.prisma.karaokeAsset.upsert({
      where: { videoId },
      update: {
        jobId,
        status: KaraokeAssetStatus.PROCESSING,
        lyricsUrl: null,
        instrumentalUrl: null,
      },
      create: {
        videoId,
        jobId,
        status: KaraokeAssetStatus.PROCESSING,
      },
    });

    return {
      status: 'processing',
      jobId,
    };
  }

  async getJobStatus(
    jobId: string,
  ): Promise<KaraokeProcessingResponse | KaraokeCompletedResponse | KaraokeFailedResponse> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      const asset = await this.prisma.karaokeAsset.findFirst({ where: { jobId } });

      if (!asset) return { status: 'failed' };

      if (asset.status === KaraokeAssetStatus.READY && asset.instrumentalUrl && asset.lyricsUrl) {
        return {
          status: 'completed',
          instrumentalUrl: this.buildPublicUrl(asset.instrumentalUrl),
          lyrics: await this.getLyricsFromUrl(this.buildPublicUrl(asset.lyricsUrl)),
        };
      }

      if (asset.status === KaraokeAssetStatus.PROCESSING) return { status: 'processing', jobId };

      return { status: 'failed' };
    }

    const state = await job.getState();

    if (this.isProcessingState(state)) {
      return { status: 'processing', jobId };
    }

    if (state === 'failed') {
      return { status: 'failed' };
    }

    const videoId = typeof job.data?.videoId === 'string' ? job.data.videoId : null;

    if (!videoId) {
      return { status: 'failed' };
    }

    const asset = await this.prisma.karaokeAsset.findUnique({ where: { videoId } });

    if (
      !asset ||
      asset.status !== KaraokeAssetStatus.READY ||
      !asset.instrumentalUrl ||
      !asset.lyricsUrl
    ) {
      return { status: 'processing', jobId };
    }

    return {
      status: 'completed',
      instrumentalUrl: this.buildPublicUrl(asset.instrumentalUrl),
      lyrics: await this.getLyricsFromUrl(this.buildPublicUrl(asset.lyricsUrl)),
    };
  }

  private isProcessingState(state: string): boolean {
    return ['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(state);
  }

  private buildPublicUrl(pathOrUrl: string): string {
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;

    return `${this.publicBaseUrl}/${this.awsBucketName}/${pathOrUrl}`;
  }

  private async getLyricsFromUrl(lyricsUrl: string): Promise<LyricsWord[]> {
    const response = await axios.get<unknown>(lyricsUrl, {
      timeout: 15000,
      headers: { Accept: 'application/json' },
    });

    if (!Array.isArray(response.data)) return [];

    return response.data
      .filter(
        (item): item is LyricsWord =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as LyricsWord).word === 'string' &&
          typeof (item as LyricsWord).start === 'number' &&
          typeof (item as LyricsWord).end === 'number',
      )
      .map((item) => ({
        word: item.word,
        start: item.start,
        end: item.end,
      }));
  }
}
