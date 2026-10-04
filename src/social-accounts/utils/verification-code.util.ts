const VERIFICATION_CODE_PATTERN = /OC-\d{4,6}/g;

export function extractVerificationCodesFromBio(biography: string): string[] {
  if (!biography) return [];
  const matches = biography.match(VERIFICATION_CODE_PATTERN);
  return matches ? [...new Set(matches)] : [];
}

export function bioContainsVerificationCode(
  biography: string,
  verificationCode: string,
): boolean {
  const bio = biography?.trim() ?? '';
  const code = verificationCode?.trim() ?? '';
  if (!bio || !code) return false;
  return bio.includes(code);
}
