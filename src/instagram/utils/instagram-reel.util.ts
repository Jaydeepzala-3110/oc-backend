import { BadRequestException } from '@nestjs/common';

/** Extract reel/post shortcode from an Instagram URL. */
export function extractInstagramShortcode(url: string): string {
  const trimmed = url?.trim();
  if (!trimmed) {
    throw new BadRequestException('Instagram reel URL is required');
  }

  const match = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i,
  );
  if (!match?.[1]) {
    throw new BadRequestException(
      'Invalid Instagram reel URL. Use a link like https://www.instagram.com/reel/...',
    );
  }

  return match[1];
}

export function reelPermalinkMatches(permalink: string, reelUrl: string): boolean {
  try {
    const shortcode = extractInstagramShortcode(reelUrl);
    return permalink.includes(`/${shortcode}`);
  } catch {
    return false;
  }
}
