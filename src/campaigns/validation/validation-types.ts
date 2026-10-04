/**
 * Shared validation contracts for all campaign types.
 * Every submission produces a structured result with per-check outcomes
 * and a stable rejection code the frontend can map to friendly copy.
 */

export enum SubmissionStatus {
  /** Structurally valid but waiting (e.g. views below approval threshold). */
  PENDING = 'PENDING',
  /** All automated checks passed. */
  VERIFIED = 'VERIFIED',
  /** Failed a hard rule — rejectionCode/rejectionReason explain why. */
  REJECTED = 'REJECTED',
}

export enum RejectionCode {
  ACCOUNT_NOT_CONNECTED = 'ACCOUNT_NOT_CONNECTED',
  REEL_NOT_FOUND = 'REEL_NOT_FOUND',
  PLATFORM_NOT_ALLOWED = 'PLATFORM_NOT_ALLOWED',
  POSTED_TOO_EARLY = 'POSTED_TOO_EARLY',
  CAMPAIGN_ENDED = 'CAMPAIGN_ENDED',
  DURATION_TOO_SHORT = 'DURATION_TOO_SHORT',
  ENGAGEMENT_TOO_LOW = 'ENGAGEMENT_TOO_LOW',
  SUBMISSION_LIMIT_REACHED = 'SUBMISSION_LIMIT_REACHED',
  SOUND_NOT_MATCHED = 'SOUND_NOT_MATCHED',
  CONTENT_RULES_FAILED = 'CONTENT_RULES_FAILED',
}

export const REJECTION_MESSAGES: Record<RejectionCode, string> = {
  [RejectionCode.ACCOUNT_NOT_CONNECTED]:
    'Connect your Instagram account via OAuth before submitting reels.',
  [RejectionCode.REEL_NOT_FOUND]:
    'This reel was not found on your connected Instagram account. Post it from your connected account, then submit the link.',
  [RejectionCode.PLATFORM_NOT_ALLOWED]:
    'This campaign does not accept submissions from this platform.',
  [RejectionCode.POSTED_TOO_EARLY]:
    'This reel was posted before the campaign minimum post date.',
  [RejectionCode.CAMPAIGN_ENDED]: 'This campaign has ended.',
  [RejectionCode.DURATION_TOO_SHORT]:
    'Your clip is shorter than the minimum required duration.',
  [RejectionCode.ENGAGEMENT_TOO_LOW]:
    'Your reel does not meet the minimum engagement rate for this campaign.',
  [RejectionCode.SUBMISSION_LIMIT_REACHED]:
    'You have reached the maximum number of submissions for this campaign.',
  [RejectionCode.SOUND_NOT_MATCHED]:
    'Your reel must use one of the required sounds for this campaign.',
  [RejectionCode.CONTENT_RULES_FAILED]:
    'Your clip did not pass the campaign content rules. See details below.',
};

export interface ValidationCheck {
  id: string;
  label: string;
  /** true = passed, false = failed, null = not evaluable yet (pending/AI layer). */
  passed: boolean | null;
  detail?: string;
}

export interface SubmissionMetricsSnapshot {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  engagementPercent: number;
}

export interface ClipValidationResult {
  status: SubmissionStatus;
  rejectionCode?: RejectionCode;
  rejectionReason?: string;
  checks: ValidationCheck[];
  metrics: SubmissionMetricsSnapshot;
  /** Instagram media identity, when resolved. */
  mediaId?: string;
  permalink?: string;
  mediaType?: string;
  postedAt?: string;
  username?: string;
}

export function computeEngagementPercent(
  views: number,
  likes: number,
  comments: number,
): number {
  if (!views || views <= 0) return 0;
  return Number((((likes + comments) / views) * 100).toFixed(3));
}
