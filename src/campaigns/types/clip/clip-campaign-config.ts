/**
 * Per-campaign clip configuration, stored in Campaign.typeConfig (Json).
 * Mirrors Clipster campaign fields (see src/main.json) so 100+ campaigns
 * can each carry their own thresholds without code changes.
 */
export interface ClipCampaignConfig {
  /** Views required before a submission can be VERIFIED (else stays PENDING). */
  minimumViewsForApproval?: number;
  /** Views required before earnings start counting. */
  minimumViewsForEarnings?: number;
  /** Minimum clip length in seconds (AI/manual layer — Graph API has no duration). */
  minimumDurationSeconds?: number;
  /** Minimum (likes+comments)/views * 100. e.g. 0.5 means 0.5% */
  minimumEngagementPercent?: number;
  /** Max submissions per connected social account for this campaign. */
  maxSubmissionsPerAccount?: number;
  /** Hard cap on earnings for a single submission. */
  maxEarningsPerSubmission?: number;
  /** Hard cap on a single user's earnings across the campaign. */
  maxEarningsPerUser?: number;
  /** Required sounds — reel must use one of these (per platform). */
  sounds?: ClipSoundRequirement[];
  /** Raw DO/DONT guidelines for display + manual/AI review. */
  guidelines?: ClipGuideline[];
  /** AI (Gemini) content rules — watermark/logo/game visibility. */
  aiRules?: ClipAiRules;
}

export interface ClipSoundRequirement {
  /** Platform enum value (e.g. INSTAGRAM) or raw platform string. */
  platform: string;
  soundId: string;
  soundName?: string;
  soundUrl?: string;
}

export interface ClipGuideline {
  kind: 'DO' | 'DONT';
  content: string;
}

export interface ClipAiRules {
  requireWatermark?: boolean;
  watermarkAssetUrl?: string;
  requiredGame?: string;
  minScreenCoveragePercent?: number;
  requiredLanguage?: string;
}

export function parseClipConfig(typeConfig: unknown): ClipCampaignConfig {
  if (!typeConfig || typeof typeConfig !== 'object') return {};
  return typeConfig as ClipCampaignConfig;
}
