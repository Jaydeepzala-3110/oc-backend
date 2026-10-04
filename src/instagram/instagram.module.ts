import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InstagramWebhooksController } from './instagram-webhooks.controller';
import { InstagramOAuthController } from './instagram-oauth.controller';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramOAuthPersistenceService } from './instagram-oauth-persistence.service';
import { InstagramInsightsService } from './instagram-insights.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [InstagramWebhooksController, InstagramOAuthController],
  providers: [
    InstagramOAuthService,
    InstagramOAuthPersistenceService,
    InstagramInsightsService,
  ],
  exports: [InstagramOAuthService, InstagramInsightsService],
})
export class InstagramModule {}
