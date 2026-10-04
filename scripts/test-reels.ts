import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReelsService } from '../src/reels/reels.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const reelsService = app.get(ReelsService);
    const prismaName = app.get(PrismaService);

    // 1. Get a user and campaign
    const user = await prismaName.users.findFirst({ where: { role: 'CLIPPER' } });
    if (!user) {
        console.log('No clipper user found');
        await app.close();
        return;
    }

    const campaign = await prismaName.campaign.create({
        data: {
            title: 'Test Campaign',
            description: 'Test Description',
            requirements: 'Test Requirements',
            payRate: 100,
            payUnit: 'USD',
            budget: 1000,
            startDate: new Date(),
            endDate: new Date(),
            status: 'ACTIVE',
            clientId: user.id
        }
    });

    // 2. Join campaign
    await prismaName.participation.create({
        data: {
            campaignId: campaign.id,
            clipperId: user.id
        }
    });

    // 3. Create Reels
    console.log('Testing createReels...');
    const result = await reelsService.createReels(user.id, {
        urls: ['https://test.com/reel1', 'https://test.com/reel2'],
        campaignId: campaign.id
    });
    console.log('Create result:', result);

    // 4. Get Reels
    console.log('Testing getUserReels...');
    const reels = await reelsService.getUserReels(user.id);
    console.log('User reels:', reels);

    // Cleanup
    await prismaName.reel.deleteMany({ where: { participation: { campaignId: campaign.id } } });
    await prismaName.participation.deleteMany({ where: { campaignId: campaign.id } });
    await prismaName.campaign.delete({ where: { id: campaign.id } });

    await app.close();
}

bootstrap();
