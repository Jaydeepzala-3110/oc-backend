import { Injectable, Logger } from '@nestjs/common';
import { Campaign } from '@prisma/client';
import { calculateCampaignEarnings } from '../../utils/campaign-earnings.util';
import { ClipValidationPipeline } from '../../validation/clip-validation.pipeline';
import {
  ClipValidationResult,
  SubmissionStatus,
} from '../../validation/validation-types';
import { ClipCampaignConfig, parseClipConfig } from './clip-campaign-config';

export interface ClipSubmissionOutcome {
  validation: ClipValidationResult;
  earnings: number;
}

/**
 * Campaign-type handler for CLIP campaigns.
 * Owns the type-specific logic: validation pipeline + earnings rules
 * (minimum views for earnings, per-submission caps).
 *
 * Future types (UGC, MUSIC_PROMO, ...) get their own handler with the
 * same shape, registered in CampaignsService by Campaign.type.
 */
@Injectable()
export class ClipHandler {
  private readonly logger = new Logger(ClipHandler.name);

  constructor(private readonly pipeline: ClipValidationPipeline) {}

  async handleSubmission(
    campaign: Campaign,
    clipperId: number,
    reelUrl: string,
  ): Promise<ClipSubmissionOutcome> {
    const validation = await this.pipeline.validate(
      campaign,
      clipperId,
      reelUrl,
    );
    const earnings = this.calculateEarnings(campaign, validation);
    return { validation, earnings };
  }

  calculateEarnings(
    campaign: Campaign,
    validation: ClipValidationResult,
  ): number {
    if (validation.status === SubmissionStatus.REJECTED) return 0;

    const config = parseClipConfig(campaign.typeConfig);
    return this.earningsForViews(campaign, config, validation.metrics.views);
  }

  earningsForViews(
    campaign: Campaign,
    config: ClipCampaignConfig,
    views: number,
  ): number {
    if (
      config.minimumViewsForEarnings &&
      views < config.minimumViewsForEarnings
    ) {
      return 0;
    }

    let earnings = calculateCampaignEarnings(
      views,
      campaign.payRate,
      campaign.payUnit,
    );

    if (config.maxEarningsPerSubmission) {
      earnings = Math.min(earnings, config.maxEarningsPerSubmission);
    }

    // One participation per user per campaign today, so the per-user cap
    // applies directly. With multi-submission this must cap the user's sum.
    if (config.maxEarningsPerUser) {
      earnings = Math.min(earnings, config.maxEarningsPerUser);
    }

    return Number(earnings.toFixed(2));
  }
}
