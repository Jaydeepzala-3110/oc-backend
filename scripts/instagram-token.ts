#!/usr/bin/env npx ts-node
/**
 * Manual Instagram token tool — use when browser OAuth redirect fails.
 *
 * 1. npm run instagram:auth-url     → print login URL, open in browser
 * 2. After login, copy ?code=... from redirect URL (strip #_ at end)
 * 3. npm run instagram:exchange -- PASTE_CODE_HERE
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv(): void {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const APP_ID = process.env.INSTA_APP_ID;
const APP_SECRET = process.env.INSTA_APP_SECRET;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const SCOPES =
  process.env.INSTAGRAM_OAUTH_SCOPES ??
  'instagram_business_basic,instagram_business_manage_insights';

function cleanCode(raw: string): string {
  return raw.trim().replace(/#_.*$/, '').replace(/#+$/, '');
}

function authUrl(): string {
  const params = new URLSearchParams({
    force_reauth: 'true',
    client_id: APP_ID!,
    redirect_uri: REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPES,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    client_id: APP_ID!,
    client_secret: APP_SECRET!,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI!,
    code: cleanCode(code),
  });

  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const shortData = await shortRes.json();

  if (!shortRes.ok) {
    console.error('Short-lived token exchange failed:');
    console.error(JSON.stringify(shortData, null, 2));
    process.exit(1);
  }

  console.log('Short-lived token OK, user_id:', shortData.user_id);

  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type', 'ig_exchange_token');
  longUrl.searchParams.set('client_secret', APP_SECRET!);
  longUrl.searchParams.set('access_token', shortData.access_token);

  const longRes = await fetch(longUrl);
  const longData = await longRes.json();

  if (!longRes.ok) {
    console.error('Long-lived token exchange failed:');
    console.error(JSON.stringify(longData, null, 2));
    process.exit(1);
  }

  const token = longData.access_token as string;

  const meUrl = new URL('https://graph.instagram.com/v21.0/me');
  meUrl.searchParams.set('fields', 'id,username,account_type');
  meUrl.searchParams.set('access_token', token);

  const meRes = await fetch(meUrl);
  const me = await meRes.json();

  console.log('\n========== SUCCESS ==========');
  console.log('Profile:', me);
  console.log('\nLONG-LIVED ACCESS TOKEN (60 days):\n');
  console.log(token);
  console.log('\nExpires in (seconds):', longData.expires_in);
  console.log('\nTest insights on a reel:');
  console.log(
    `curl "https://graph.instagram.com/v21.0/me/media?fields=id,media_type&access_token=${token.slice(0, 20)}..."`,
  );
}

function requireEnv() {
  if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
    console.error('Missing INSTA_APP_ID, INSTA_APP_SECRET, or INSTAGRAM_REDIRECT_URI in .env');
    process.exit(1);
  }
}

async function main() {
  requireEnv();
  const cmd = process.argv[2];
  const arg = process.argv[3];

  if (cmd === 'url' || !cmd) {
    console.log('\nOpen this URL in your browser (log in as onlycreators_official):\n');
    console.log(authUrl());
    console.log('\nAfter Allow, copy the FULL redirect URL from the address bar.');
    console.log('Look for ?code=... — strip anything after # if present.');
    console.log('\nThen run:');
    console.log('  npm run instagram:exchange -- YOUR_CODE_HERE\n');
    return;
  }

  if (cmd === 'exchange') {
    if (!arg) {
      console.error('Usage: npm run instagram:exchange -- AUTHORIZATION_CODE');
      process.exit(1);
    }
    await exchangeCode(arg);
    return;
  }

  // Allow passing code directly: npm run instagram:exchange -- CODE
  if (cmd.startsWith('AQ') || cmd.length > 20) {
    await exchangeCode(cmd);
    return;
  }

  console.error('Unknown command. Use: npm run instagram:auth-url');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
