import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SocialMetricsService {
    private readonly logger = new Logger(SocialMetricsService.name);

    /**
     * Mock method to fetch live metrics from a Reel URL.
     * In a real implementation, this would use yt-dlp or a social media API.
     */
    async getReelMetrics(url: string) {
        this.logger.log(`Fetching metrics for: ${url}`);

        // Simulating API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // For demo: Generate realistic view counts
        // We'll base it on the timestamp to make it "increase" over time
        const baseViews = 1200;
        const growthRate = 150; // views per hour since submission

        // In a real mock, we might store the 'lastViewCount' and increment it
        // For now, let's return a random increase
        const currentViews = baseViews + Math.floor(Math.random() * 5000);

        return {
            views: currentViews,
            likes: Math.floor(currentViews * 0.05),
            comments: Math.floor(currentViews * 0.01),
            shares: Math.floor(currentViews * 0.005),
            updatedAt: new Date()
        };
    }

    /**
     * Calculate earnings based on views and campaign pay rate.
     */
    calculateEarnings(views: number, payRate: number, payUnit: string): number {
        const unit = payUnit.toUpperCase();

        if (unit === 'CPM' || unit.includes('1K') || unit.includes('1000')) {
            return (views / 1000) * payRate;
        }

        if (unit === 'VIEW' || unit === 'PER_VIEW') {
            return views * payRate;
        }

        if (unit === 'INR' || unit === 'USD' || unit === 'FIXED') {
            return payRate; // Assume fixed for currency units for now
        }

        return 0;
    }
}
