/** Avatar URL that loads reliably in browsers (Instagram CDN blocks hotlinking). */
export function buildAccountAvatarUrl(username: string): string {
  const handle = username.replace(/^@+/, '').trim();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(handle)}&size=128&background=8b5cf6&color=ffffff&bold=true`;
}

export function resolveStoredAvatarUrl(
  username: string,
  storedUrl?: string | null,
): string {
  if (!storedUrl) {
    return buildAccountAvatarUrl(username);
  }
  if (
    storedUrl.includes('fbcdn.net') ||
    storedUrl.includes('cdninstagram.com')
  ) {
    return buildAccountAvatarUrl(username);
  }
  return storedUrl;
}
