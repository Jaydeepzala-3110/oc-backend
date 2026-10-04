import { Injectable, Logger } from '@nestjs/common';
import { calculateCampaignEarnings } from './utils/campaign-earnings.util';
import { InstagramInsightsService } from '../instagram/instagram-insights.service';

@Injectable()
export class SocialMetricsService {
    private readonly logger = new Logger(SocialMetricsService.name);

    constructor(private readonly instagramInsights: InstagramInsightsService) {}

    /**
     * Fetch live reel metrics via Instagram Graph API (clipper OAuth token).
     * Falls back to zero views if insights are unavailable.
     */
    async getReelMetrics(
        url: string,
        clipperId: number,
        instagramMediaId?: string,
    ) {
        this.logger.log(`Fetching Instagram insights for: ${url}`);

        try {
            const metrics = await this.instagramInsights.getReelMetricsForUser(
                clipperId,
                url,
                instagramMediaId,
            );

            return {
                views: metrics.views,
                likes: metrics.likes,
                comments: metrics.comments,
                shares: metrics.shares,
                reach: metrics.reach,
                mediaId: metrics.mediaId,
                updatedAt: metrics.updatedAt,
            };
        } catch (error) {
            this.logger.warn(
                `Instagram insights unavailable for participation clipper ${clipperId}: ${error instanceof Error ? error.message : error}`,
            );

            return {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                reach: 0,
                mediaId: instagramMediaId ?? '',
                updatedAt: new Date(),
            };
        }
    }

    calculateEarnings(views: number, payRate: number, payUnit: string): number {
        return calculateCampaignEarnings(views, payRate, payUnit);
    }
}
