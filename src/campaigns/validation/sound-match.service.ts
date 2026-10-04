import { Injectable, Logger } from '@nestjs/common';
import { ClipSoundRequirement } from '../types/clip/clip-campaign-config';
import { InstagramMediaItem } from '../../instagram/instagram-insights.service';

export interface SoundMatchResult {
  /** true = matched, false = definitively wrong sound, null = cannot determine yet. */
  matched: boolean | null;
  matchedSound?: ClipSoundRequirement;
  detail: string;
}

/**
 * Layer 2 — required-sound verification.
 *
 * The Instagram Graph API (Instagram Login) does not expose the audio track
 * of a media item, so automated matching is not possible from insights alone.
 * Current strategy: caption heuristic (weak signal) + defer to review.
 *
 * Planned upgrades, in order:
 *  1. oEmbed/page metadata scrape for the audio attribution line
 *  2. Audio fingerprinting of the downloaded reel against sound samples
 *  3. Manual review queue fallback in the admin dashboard
 */
@Injectable()
export class SoundMatchService {
  private readonly logger = new Logger(SoundMatchService.name);

  matchSound(
    media: InstagramMediaItem,
    requiredSounds: ClipSoundRequirement[],
  ): SoundMatchResult {
    if (!requiredSounds.length) {
      return { matched: true, detail: 'No sound requirement' };
    }

    // Weak positive signal only: sound name mentioned in the caption.
    const caption = media.caption?.toLowerCase() ?? '';
    const captionHit = requiredSounds.find(
      (sound) =>
        sound.soundName && caption.includes(sound.soundName.toLowerCase()),
    );
    if (captionHit) {
      return {
        matched: null,
        matchedSound: captionHit,
        detail: `Caption mentions "${captionHit.soundName}" — pending audio confirmation`,
      };
    }

    return {
      matched: null,
      detail: 'Sound usage verified during review',
    };
  }
}
