import { Injectable, Logger } from '@nestjs/common';
import { Campaign, Platform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InstagramInsightsService,
  InstagramMediaItem,
} from '../../instagram/instagram-insights.service';
import { SoundMatchService } from './sound-match.service';
import { ContentRulesService } from './content-rules.service';
import {
  ClipCampaignConfig,
  parseClipConfig,
} from '../types/clip/clip-campaign-config';
import {
  ClipValidationResult,
  RejectionCode,
  REJECTION_MESSAGES,
  SubmissionStatus,
  ValidationCheck,
  computeEngagementPercent,
} from './validation-types';

interface PipelineContext {
  campaign: Campaign;
  config: ClipCampaignConfig;
  clipperId: number;
  reelUrl: string;
}

const EMPTY_METRICS = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  reach: 0,
  engagementPercent: 0,
};

/**
 * Config-driven validation for clip campaigns.
 *
 * Layer 1 (this pipeline, fully automated via Instagram Graph API):
 *   ownership, platform, post date, min views, min engagement, submission cap.
 * Layer 2/3 (sound matching, watermark/logo AI) report as `passed: null`
 * checks so the frontend can show "pending review" until those engines land.
 *
 * Every threshold comes from Campaign.typeConfig — 100+ campaigns share this
 * one pipeline with different numbers, no code changes per campaign.
 */
@Injectable()
export class ClipValidationPipeline {
  private readonly logger = new Logger(ClipValidationPipeline.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InstagramInsightsService,
    private readonly soundMatch: SoundMatchService,
    private readonly contentRules: ContentRulesService,
  ) {}

  async validate(
    campaign: Campaign,
    clipperId: number,
    reelUrl: string,
  ): Promise<ClipValidationResult> {
    const ctx: PipelineContext = {
      campaign,
      config: parseClipConfig(campaign.typeConfig),
      clipperId,
      reelUrl,
    };
    const checks: ValidationCheck[] = [];

    // --- Hard gates that don't need the reel ---------------------------------

    const platformCheck = this.checkPlatform(ctx);
    checks.push(platformCheck);
    if (platformCheck.passed === false) {
      return this.reject(RejectionCode.PLATFORM_NOT_ALLOWED, checks);
    }

    const endedCheck = this.checkCampaignWindow(ctx);
    checks.push(endedCheck);
    if (endedCheck.passed === false) {
      return this.reject(RejectionCode.CAMPAIGN_ENDED, checks);
    }

    const capCheck = await this.checkSubmissionCap(ctx);
    checks.push(capCheck);
    if (capCheck.passed === false) {
      return this.reject(RejectionCode.SUBMISSION_LIMIT_REACHED, checks);
    }

    // --- Resolve reel on the connected account (ownership) -------------------

    const account = await this.insights
      .getConnectedInstagramAccount(ctx.clipperId)
      .catch(() => null);
    if (!account) {
      checks.push({
        id: 'account_connected',
        label: 'Instagram account connected via OAuth',
        passed: false,
      });
      return this.reject(RejectionCode.ACCOUNT_NOT_CONNECTED, checks);
    }
    checks.push({
      id: 'account_connected',
      label: 'Instagram account connected via OAuth',
      passed: true,
      detail: `@${account.username}`,
    });

    const media = await this.insights.findMediaByReelUrl(
      account.accessToken!,
      ctx.reelUrl,
    );
    if (!media) {
      checks.push({
        id: 'ownership',
        label: 'Reel posted from your connected account',
        passed: false,
        detail: `Not found on @${account.username}`,
      });
      return this.reject(RejectionCode.REEL_NOT_FOUND, checks);
    }
    checks.push({
      id: 'ownership',
      label: 'Reel posted from your connected account',
      passed: true,
      detail: media.permalink,
    });

    const postDateCheck = this.checkPostDate(ctx, media.timestamp);
    checks.push(postDateCheck);
    if (postDateCheck.passed === false) {
      return this.reject(RejectionCode.POSTED_TOO_EARLY, checks, {
        mediaId: media.id,
        permalink: media.permalink,
        mediaType: media.media_type,
        postedAt: media.timestamp,
        username: account.username,
      });
    }

    // --- Metrics-driven checks ------------------------------------------------

    const insights = await this.insights.getMediaInsights(
      account.accessToken!,
      media.id,
      media.media_type,
    );
    const engagementPercent = computeEngagementPercent(
      insights.views,
      insights.likes,
      insights.comments,
    );
    const metrics = {
      views: insights.views,
      likes: insights.likes,
      comments: insights.comments,
      shares: insights.shares,
      reach: insights.reach,
      engagementPercent,
    };
    const identity = {
      mediaId: media.id,
      permalink: media.permalink,
      mediaType: media.media_type,
      postedAt: media.timestamp,
      username: account.username,
    };

    const engagementCheck = this.checkEngagement(ctx, metrics);
    checks.push(engagementCheck);
    if (engagementCheck.passed === false) {
      return this.reject(
        RejectionCode.ENGAGEMENT_TOO_LOW,
        checks,
        identity,
        metrics,
      );
    }

    // Layer 2: required-sound matching (stub — defers to review when undecidable)
    const soundCheck = this.checkRequiredSound(ctx, media);
    if (soundCheck) {
      checks.push(soundCheck);
      if (soundCheck.passed === false) {
        return this.reject(
          RejectionCode.SOUND_NOT_MATCHED,
          checks,
          identity,
          metrics,
        );
      }
    }

    // Layer 3: AI content rules (watermark / required game on thumbnail)
    const contentCheck = await this.checkContentRules(ctx, media);
    if (contentCheck) checks.push(contentCheck);

    // Not evaluable yet — surfaced as pending checks.
    checks.push(...this.pendingLayerChecks(ctx));

    const viewsCheck = this.checkMinimumViews(ctx, metrics.views);
    checks.push(viewsCheck);

    const status =
      viewsCheck.passed === false
        ? SubmissionStatus.PENDING // below approval threshold → wait for cron
        : SubmissionStatus.VERIFIED;

    this.logger.log(
      `Clip validation [campaign ${ctx.campaign.id}] @${account.username} → ${status} (${metrics.views} views, ${engagementPercent}% eng)`,
    );

    return { status, checks, metrics, ...identity };
  }

  // --- Individual checks (config-driven) --------------------------------------

  private checkPlatform(ctx: PipelineContext): ValidationCheck {
    const allowed =
      !ctx.campaign.platforms?.length ||
      ctx.campaign.platforms.includes(Platform.INSTAGRAM);
    return {
      id: 'platform',
      label: 'Platform allowed for this campaign',
      passed: allowed,
      detail: allowed
        ? 'Instagram'
        : `Allowed: ${ctx.campaign.platforms.join(', ')}`,
    };
  }

  private checkCampaignWindow(ctx: PipelineContext): ValidationCheck {
    const endDate = ctx.campaign.endDate
      ? new Date(ctx.campaign.endDate)
      : null;
    const ended = !!endDate && endDate < new Date();
    return {
      id: 'campaign_window',
      label: 'Campaign is open for submissions',
      passed: !ended,
      detail: ended ? `Ended ${endDate.toISOString().slice(0, 10)}` : undefined,
    };
  }

  private async checkSubmissionCap(
    ctx: PipelineContext,
  ): Promise<ValidationCheck> {
    const cap = ctx.config.maxSubmissionsPerAccount;
    if (!cap) {
      return { id: 'submission_cap', label: 'Submission limit', passed: true };
    }

    const submitted = await this.prisma.reel.count({
      where: {
        participation: {
          campaignId: ctx.campaign.id,
          clipperId: ctx.clipperId,
        },
      },
    });

    return {
      id: 'submission_cap',
      label: `Max ${cap} submissions per account`,
      passed: submitted < cap,
      detail: `${submitted}/${cap} used`,
    };
  }

  private checkPostDate(
    ctx: PipelineContext,
    timestamp?: string,
  ): ValidationCheck {
    const min = ctx.campaign.minimumPostDate;
    if (!min || !timestamp) {
      return { id: 'post_date', label: 'Post date', passed: true };
    }
    const ok = new Date(timestamp) >= new Date(min);
    return {
      id: 'post_date',
      label: `Posted on or after ${new Date(min).toISOString().slice(0, 10)}`,
      passed: ok,
      detail: `Posted ${timestamp.slice(0, 10)}`,
    };
  }

  private checkEngagement(
    ctx: PipelineContext,
    metrics: { views: number; engagementPercent: number },
  ): ValidationCheck {
    const min = ctx.config.minimumEngagementPercent;
    if (min === undefined || min === null) {
      return { id: 'min_engagement', label: 'Engagement rate', passed: true };
    }
    // Don't reject for engagement until there are meaningful views.
    if (metrics.views < 100) {
      return {
        id: 'min_engagement',
        label: `Minimum ${min}% engagement`,
        passed: true,
        detail: 'Too few views to evaluate — rechecked on sync',
      };
    }
    const ok = metrics.engagementPercent >= min;
    return {
      id: 'min_engagement',
      label: `Minimum ${min}% engagement`,
      passed: ok,
      detail: `Current: ${metrics.engagementPercent}%`,
    };
  }

  private checkMinimumViews(
    ctx: PipelineContext,
    views: number,
  ): ValidationCheck {
    const min = ctx.config.minimumViewsForApproval;
    if (!min) {
      return { id: 'min_views_approval', label: 'Minimum views', passed: true };
    }
    return {
      id: 'min_views_approval',
      label: `${min.toLocaleString()} views to approve`,
      passed: views >= min,
      detail: `Current: ${views.toLocaleString()}`,
    };
  }

  /** Layer 2 — required sound. Delegates to SoundMatchService. */
  private checkRequiredSound(
    ctx: PipelineContext,
    media: InstagramMediaItem,
  ): ValidationCheck | null {
    const sounds = ctx.config.sounds ?? [];
    if (!sounds.length) return null;

    const result = this.soundMatch.matchSound(media, sounds);
    return {
      id: 'required_sound',
      label: `Uses required sound (${sounds.map((s) => s.soundName ?? s.soundId).join(' / ')})`,
      passed: result.matched,
      detail: result.detail,
    };
  }

  /** Layer 3 — AI content rules on the reel thumbnail (Gemini). */
  private async checkContentRules(
    ctx: PipelineContext,
    media: InstagramMediaItem,
  ): Promise<ValidationCheck | null> {
    const aiRules = ctx.config.aiRules;
    if (!aiRules?.requireWatermark && !aiRules?.requiredGame) return null;

    const result = await this.contentRules.evaluateThumbnail(
      media.thumbnail_url,
      aiRules,
    );
    return {
      id: 'content_rules',
      label: aiRules.requiredGame
        ? `${aiRules.requiredGame} content rules`
        : 'Watermark / content rules',
      passed: result.passed,
      detail: result.detail,
    };
  }

  /** Checks we can't automate yet. */
  private pendingLayerChecks(ctx: PipelineContext): ValidationCheck[] {
    const pending: ValidationCheck[] = [];

    if (ctx.config.minimumDurationSeconds) {
      pending.push({
        id: 'min_duration',
        label: `Minimum ${ctx.config.minimumDurationSeconds}s clip length`,
        passed: null,
        detail: 'Verified during review',
      });
    }
    return pending;
  }

  private reject(
    code: RejectionCode,
    checks: ValidationCheck[],
    identity: Partial<
      Pick<
        ClipValidationResult,
        'mediaId' | 'permalink' | 'mediaType' | 'postedAt' | 'username'
      >
    > = {},
    metrics = EMPTY_METRICS,
  ): ClipValidationResult {
    return {
      status: SubmissionStatus.REJECTED,
      rejectionCode: code,
      rejectionReason: REJECTION_MESSAGES[code],
      checks,
      metrics,
      ...identity,
    };
  }
}
