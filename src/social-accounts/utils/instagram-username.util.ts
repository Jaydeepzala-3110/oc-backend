import { BadRequestException } from '@nestjs/common';

const USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;

/**
 * Normalizes input to an Instagram handle (strips @ and extracts handle from pasted URLs).
 */
export function parseInstagramUsername(input: string): string {
  const trimmed = input?.trim();
  if (!trimmed) {
    throw new BadRequestException('Instagram username is required.');
  }

  let value = trimmed.replace(/^@+/, '');

  const urlMatch = value.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i,
  );
  if (urlMatch?.[1]) {
    value = urlMatch[1];
  } else {
    const shortUrlMatch = value.match(
      /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([A-Za-z0-9._]+)/i,
    );
    if (shortUrlMatch?.[1]) {
      value = shortUrlMatch[1];
    }
  }

  value = value.split('?')[0].split('#')[0].replace(/\/+$/, '');

  if (!USERNAME_PATTERN.test(value)) {
    throw new BadRequestException(
      'Invalid Instagram username. Use only letters, numbers, dots, and underscores (without @).',
    );
  }

  return value;
}
