import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { GameValidationService } from './game-validation.service';
import { SocialMetricsService } from './social-metrics.service';
import { MetricsScheduler } from './metrics.scheduler';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    GameValidationService,
    SocialMetricsService,
    MetricsScheduler,
    ConfigService
  ],
  exports: [GameValidationService, SocialMetricsService],
})
export class CampaignsModule { }
