import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SocialAccountsService } from '../src/social-accounts/social-accounts.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SocialPlatform } from '../src/social-accounts/dto/init-social-account.dto';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const socialService = app.get(SocialAccountsService);
    const prisma = app.get(PrismaService);

    // 1. Get a user
    const user = await prisma.users.findFirst({ where: { role: 'CLIPPER' } });
    if (!user) {
        console.log('No clipper user found');
        await app.close();
        return;
    }

    // Cleanup existing
    await prisma.socialAccount.deleteMany({ where: { userId: user.id } });

    console.log('Testing initVerification...');

    // 2. Init Verification
    const initResult = await socialService.initVerification(user.id, {
        username: 'test_user_123',
        platform: SocialPlatform.INSTAGRAM
    });
    console.log('Init Result:', initResult);

    if (!initResult || !initResult.accountId) {
        console.error('Init failed');
        await app.close();
        return;
    }

    // 3. Verify Account (Simulated)
    console.log('Testing verifyAccount...');
    // Note: in the service I mocked the bio check to be true/simulated, so this should pass
    try {
        const verifyResult = await socialService.verifyAccount(user.id, {
            accountId: initResult.accountId,
            code: initResult.code,
        });
        console.log('Verify Result:', verifyResult);
    } catch (e: any) {
        console.error('Verification failed:', e.message);
    }

    // 4. Get Accounts
    console.log('Testing getUserAccounts...');
    const accounts = await socialService.getUserAccounts(user.id);
    console.log('User Accounts:', accounts);

    // Cleanup
    await prisma.socialAccount.deleteMany({ where: { userId: user.id } });

    await app.close();
}

bootstrap();
