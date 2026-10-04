import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialMetricsService } from './social-metrics.service';
import { ClipHandler } from './types/clip/clip.handler';
import { parseClipConfig } from './types/clip/clip-campaign-config';
import {
    SubmissionStatus,
    computeEngagementPercent,
} from './validation/validation-types';

@Injectable()
export class MetricsScheduler {
    private readonly logger = new Logger(MetricsScheduler.name);

    constructor(
        private prisma: PrismaService,
        private metricsService: SocialMetricsService,
        private clipHandler: ClipHandler,
    ) { }

    /**
     * Hourly sync for active submissions:
     * - refresh views/engagement from Instagram Graph API
     * - promote PENDING → VERIFIED once minimumViewsForApproval is reached
     * - recalculate earnings (thresholds + caps via ClipHandler)
     */
    @Cron(CronExpression.EVERY_HOUR)
    async syncAllMetrics() {
        this.logger.log('Starting automated metrics sync...');

        const participations = await this.prisma.participation.findMany({
            where: {
                submissionStatus: {
                    in: [SubmissionStatus.VERIFIED, SubmissionStatus.PENDING],
                },
                submissionUrl: { not: null },
            },
            include: {
                campaign: true,
            },
        });

        this.logger.log(`Found ${participations.length} submissions to sync.`);

        for (const participation of participations) {
            try {
                await this.syncParticipationMetrics(participation);
            } catch (error) {
                this.logger.error(`Failed to sync metrics for participation ${participation.id}: ${error.message}`);
            }
        }

        this.logger.log('Metrics sync completed.');
    }

    private async syncParticipationMetrics(participation: any) {
        const { submissionUrl, campaign, clipperId, submissionDetails } = participation;
        const details =
            typeof submissionDetails === 'object' && submissionDetails !== null
                ? (submissionDetails as Record<string, any>)
                : {};
        const instagramMediaId = details.mediaId as string | undefined;

        const metrics = await this.metricsService.getReelMetrics(
            submissionUrl,
            clipperId,
            instagramMediaId,
        );

        // PENDING → VERIFIED promotion once approval threshold is met
        let status = participation.submissionStatus as string;
        if (
            status === SubmissionStatus.PENDING &&
            campaign.type === CampaignType.CLIP
        ) {
            const config = parseClipConfig(campaign.typeConfig);
            if (
                !config.minimumViewsForApproval ||
                metrics.views >= config.minimumViewsForApproval
            ) {
                status = SubmissionStatus.VERIFIED;
                this.logger.log(
                    `Participation ${participation.id} promoted PENDING → VERIFIED (${metrics.views} views)`,
                );
            }
        }

        const newEarnings =
            campaign.type === CampaignType.CLIP
                ? this.clipHandler.earningsForViews(
                    campaign,
                    parseClipConfig(campaign.typeConfig),
                    metrics.views,
                )
                : this.metricsService.calculateEarnings(
                    metrics.views,
                    campaign.payRate,
                    campaign.payUnit,
                );

        const previousViews = participation.views || 0;
        const previousEarnings = participation.earnings || 0;

        await this.prisma.participation.update({
            where: { id: participation.id },
            data: {
                views: metrics.views,
                earnings: newEarnings,
                submissionStatus: status,
                submissionDetails: {
                    ...details,
                    metrics: {
                        views: metrics.views,
                        likes: metrics.likes,
                        comments: metrics.comments,
                        shares: metrics.shares,
                        reach: metrics.reach,
                        engagementPercent: computeEngagementPercent(
                            metrics.views,
                            metrics.likes,
                            metrics.comments,
                        ),
                    },
                },
                lastMetricsSync: new Date(),
            },
        });

        const viewDiff = metrics.views - previousViews;
        const earningDiff = newEarnings - previousEarnings;

        await this.prisma.userStats.upsert({
            where: { userId: participation.clipperId },
            update: {
                totalViews: { increment: viewDiff > 0 ? viewDiff : 0 },
                totalEarnings: { increment: earningDiff > 0 ? earningDiff : 0 },
            },
            create: {
                userId: participation.clipperId,
                totalViews: metrics.views,
                totalEarnings: newEarnings,
            },
        });

        this.logger.log(`Synced: [ID ${participation.id}] ${status} | Views: ${metrics.views} | Earnings: $${newEarnings.toFixed(2)}`);
    }
}
