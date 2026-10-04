import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MetricsScheduler } from '../src/campaigns/metrics.scheduler';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Technical Demo: Automated Metrics Sync Test
 * This script manually triggers the scheduler to sync views and earnings.
 */

async function runTest() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const scheduler = app.get(MetricsScheduler);
    const prisma = app.get(PrismaService);

    console.log("🚀 Starting Manual Metrics Sync Test...");

    try {
        // 1. Check if there are any verified participations
        const count = await prisma.participation.count({
            where: { submissionStatus: 'VERIFIED' }
        });

        if (count === 0) {
            console.log("⚠️ No verified submissions found. Please submit and verify a Reel first via the UI.");
            console.log("Forcefully setting one participation to VERIFIED for testing...");

            const firstParticipation = await prisma.participation.findFirst();
            if (firstParticipation) {
                await prisma.participation.update({
                    where: { id: firstParticipation.id },
                    data: {
                        submissionStatus: 'VERIFIED',
                        submissionUrl: 'https://www.instagram.com/reel/C123456789/'
                    }
                });
                console.log(`✅ Participation ID ${firstParticipation.id} marked as VERIFIED for testing.`);
            } else {
                console.log("❌ No participations found in the database. Join a campaign first.");
                return;
            }
        }

        // 2. Trigger the sync
        await scheduler.syncAllMetrics();

        // 3. Verify the changes
        const updated = await prisma.participation.findMany({
            where: { submissionStatus: 'VERIFIED' },
            include: { campaign: true }
        });

        console.log("\n📊 SYNC VERIFICATION RESULTS:");
        console.log("----------------------------");
        updated.forEach(p => {
            console.log(`[Participation ${p.id}]`);
            console.log(`   Views: ${p.views}`);
            console.log(`   Earnings: $${p.earnings?.toFixed(2)}`);
            console.log(`   Last Sync: ${p.lastMetricsSync}`);
            console.log(`   Pay Rate: ${p.campaign.payRate} / ${p.campaign.payUnit}`);
        });

        // 4. Verify UserStats
        const stats = await prisma.userStats.findFirst();
        if (stats) {
            console.log("\n👤 UPDATED USER STATS:");
            console.log(`   Total Views: ${stats.totalViews}`);
            console.log(`   Total Earnings: $${stats.totalEarnings.toFixed(2)}`);
        }

    } catch (error) {
        console.error("❌ Sync test failed:", error);
    } finally {
        await app.close();
    }
}

runTest();
