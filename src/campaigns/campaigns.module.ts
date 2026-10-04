import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { GameValidationService } from './game-validation.service';
import { SocialMetricsService } from './social-metrics.service';
import { MetricsScheduler } from './metrics.scheduler';
import { ClipValidationPipeline } from './validation/clip-validation.pipeline';
import { SoundMatchService } from './validation/sound-match.service';
import { ContentRulesService } from './validation/content-rules.service';
import { ClipHandler } from './types/clip/clip.handler';
import { PrismaModule } from '../prisma/prisma.module';
import { InstagramModule } from '../instagram/instagram.module';

@Module({
  imports: [PrismaModule, InstagramModule],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    GameValidationService,
    SocialMetricsService,
    MetricsScheduler,
    ClipValidationPipeline,
    SoundMatchService,
    ContentRulesService,
    ClipHandler,
  ],
  exports: [GameValidationService, SocialMetricsService, ClipHandler],
})
export class CampaignsModule { }
