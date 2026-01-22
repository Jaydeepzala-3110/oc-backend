import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SocialMetricsService } from './social-metrics.service';

@Injectable()
export class MetricsScheduler {
    private readonly logger = new Logger(MetricsScheduler.name);

    constructor(
        private prisma: PrismaService,
        private metricsService: SocialMetricsService,
    ) { }

    /**
     * Sync metrics for all verified submissions every hour.
     * In a real system, you might run this less frequently (e.g., every 6-12 hours).
     */
    @Cron(CronExpression.EVERY_HOUR)
    async syncAllMetrics() {
        this.logger.log('Starting automated metrics sync...');

        const verifiedParticipations = await this.prisma.participation.findMany({
            where: {
                submissionStatus: 'VERIFIED',
            },
            include: {
                campaign: true,
            },
        });

        this.logger.log(`Found ${verifiedParticipations.length} verified submissions to sync.`);

        for (const participation of verifiedParticipations) {
            try {
                await this.syncParticipationMetrics(participation);
            } catch (error) {
                this.logger.error(`Failed to sync metrics for participation ${participation.id}: ${error.message}`);
            }
        }

        this.logger.log('Metrics sync completed.');
    }

    private async syncParticipationMetrics(participation: any) {
        const { submissionUrl, campaign } = participation;

        // 1. Fetch live metrics
        const metrics = await this.metricsService.getReelMetrics(submissionUrl);

        // 2. Calculate earnings
        const newEarnings = this.metricsService.calculateEarnings(
            metrics.views,
            campaign.payRate,
            campaign.payUnit
        );

        // 3. Update Participation
        const previousViews = participation.views || 0;
        const previousEarnings = participation.earnings || 0;

        await this.prisma.participation.update({
            where: { id: participation.id },
            data: {
                views: metrics.views,
                earnings: newEarnings,
                lastMetricsSync: new Date(),
            },
        });

        // 4. Update Global UserStats
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

        this.logger.log(`Synced: [ID ${participation.id}] Views: ${metrics.views} | Earnings: $${newEarnings.toFixed(2)}`);
    }
}
