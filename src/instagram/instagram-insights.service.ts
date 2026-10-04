import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  extractInstagramShortcode,
  reelPermalinkMatches,
} from './utils/instagram-reel.util';

export interface InstagramMediaItem {
  id: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  caption?: string;
  thumbnail_url?: string;
}

export interface ReelMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  mediaId: string;
  permalink: string;
  mediaType: string;
  timestamp?: string;
  updatedAt: Date;
}

export interface ReelValidationResult extends ReelMetrics {
  username: string;
  passed: boolean;
  rejectionReason?: string;
}

@Injectable()
export class InstagramInsightsService {
  private readonly logger = new Logger(InstagramInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getConnectedInstagramAccount(userId: number) {
    const account = await this.prisma.socialAccount.findFirst({
      where: {
        userId,
        platform: Platform.INSTAGRAM,
        isVerified: true,
        accessToken: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!account?.accessToken) {
      throw new BadRequestException(
        'Connect your Instagram account via OAuth before submitting reels.',
      );
    }

    if (
      account.accessTokenExpiresAt &&
      account.accessTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'Instagram access token expired. Reconnect from Social Connect.',
      );
    }

    return account;
  }

  async findMediaByReelUrl(
    accessToken: string,
    reelUrl: string,
  ): Promise<InstagramMediaItem | null> {
    const shortcode = extractInstagramShortcode(reelUrl);
    let nextUrl: string | null =
      `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,permalink,timestamp,thumbnail_url&limit=50&access_token=${encodeURIComponent(accessToken)}`;

    for (let page = 0; page < 5 && nextUrl; page++) {
      const response = await fetch(nextUrl);
      const body = await response.json();

      if (!response.ok) {
        this.logger.error(`Instagram media list failed: ${JSON.stringify(body)}`);
        throw new BadRequestException(
          body?.error?.message ?? 'Could not load Instagram media for this account',
        );
      }

      const items: InstagramMediaItem[] = body?.data ?? [];
      const match = items.find(
        (item) =>
          item.permalink &&
          (item.permalink.includes(`/${shortcode}`) ||
            reelPermalinkMatches(item.permalink, reelUrl)),
      );
      if (match) return match;

      nextUrl = body?.paging?.next ?? null;
    }

    return null;
  }

  async getMediaInsights(
    accessToken: string,
    mediaId: string,
    mediaType?: string,
  ): Promise<Omit<ReelMetrics, 'mediaId' | 'permalink' | 'mediaType' | 'timestamp'>> {
    const isReel =
      mediaType === 'REELS' ||
      mediaType === 'VIDEO' ||
      !mediaType;
    const metric = isReel
      ? 'plays,reach,likes,comments,shares,saved,total_interactions'
      : 'reach,likes,comments,saved';

    const url = new URL(`https://graph.instagram.com/v21.0/${mediaId}/insights`);
    url.searchParams.set('metric', metric);
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok) {
      this.logger.warn(`Insights failed for ${mediaId}: ${JSON.stringify(body)}`);
      return {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        updatedAt: new Date(),
      };
    }

    const parsed = this.parseInsightMetrics(body?.data ?? []);

    return {
      views: parsed.plays ?? parsed.reach ?? 0,
      likes: parsed.likes ?? 0,
      comments: parsed.comments ?? 0,
      shares: parsed.shares ?? 0,
      reach: parsed.reach ?? 0,
      updatedAt: new Date(),
    };
  }

  async getReelMetricsForUser(
    userId: number,
    reelUrl: string,
    knownMediaId?: string,
  ): Promise<ReelMetrics> {
    const account = await this.getConnectedInstagramAccount(userId);
    const media =
      knownMediaId && knownMediaId.length > 0
        ? { id: knownMediaId, media_type: 'REELS', permalink: reelUrl }
        : await this.findMediaByReelUrl(account.accessToken!, reelUrl);

    if (!media) {
      throw new NotFoundException(
        'Reel not found on your connected Instagram account. Submit a reel you posted from that account.',
      );
    }

    const insights = await this.getMediaInsights(
      account.accessToken!,
      media.id,
      media.media_type,
    );

    return {
      ...insights,
      mediaId: media.id,
      permalink: media.permalink ?? reelUrl,
      mediaType: media.media_type ?? 'REELS',
      timestamp: media.timestamp,
    };
  }

  async validateClipperReel(
    userId: number,
    reelUrl: string,
    minimumPostDate?: Date | null,
  ): Promise<ReelValidationResult> {
    const account = await this.getConnectedInstagramAccount(userId);
    const media = await this.findMediaByReelUrl(account.accessToken!, reelUrl);

    if (!media) {
      return {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        mediaId: '',
        permalink: reelUrl,
        mediaType: 'UNKNOWN',
        updatedAt: new Date(),
        username: account.username,
        passed: false,
        rejectionReason:
          'Reel not found on your connected Instagram account. Post the reel from @' +
          account.username +
          ' first, then submit the link.',
      };
    }

    if (
      minimumPostDate &&
      media.timestamp &&
      new Date(media.timestamp) < minimumPostDate
    ) {
      return {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        mediaId: media.id,
        permalink: media.permalink ?? reelUrl,
        mediaType: media.media_type ?? 'REELS',
        timestamp: media.timestamp,
        updatedAt: new Date(),
        username: account.username,
        passed: false,
        rejectionReason: `Reel was posted before the campaign minimum date (${minimumPostDate.toISOString().slice(0, 10)}).`,
      };
    }

    const insights = await this.getMediaInsights(
      account.accessToken!,
      media.id,
      media.media_type,
    );

    return {
      ...insights,
      mediaId: media.id,
      permalink: media.permalink ?? reelUrl,
      mediaType: media.media_type ?? 'REELS',
      timestamp: media.timestamp,
      username: account.username,
      passed: true,
    };
  }

  private parseInsightMetrics(
    rows: Array<{ name: string; values?: Array<{ value: number }> }>,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of rows) {
      out[row.name] = row.values?.[0]?.value ?? 0;
    }
    return out;
  }
}
