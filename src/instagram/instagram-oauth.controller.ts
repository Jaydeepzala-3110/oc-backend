import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ConfigService } from '../config/config.service';
import { InstagramOAuthService } from './instagram-oauth.service';
import { InstagramOAuthPersistenceService } from './instagram-oauth-persistence.service';

@Public()
@Controller('auth/instagram')
export class InstagramOAuthController {
  private readonly logger = new Logger(InstagramOAuthController.name);

  constructor(
    private readonly oauth: InstagramOAuthService,
    private readonly persistence: InstagramOAuthPersistenceService,
    private readonly config: ConfigService,
  ) {}

  /** Setup page — start OAuth or paste code manually if redirect fails. */
  @Get('setup')
  setupPage(@Res() res: Response) {
    const authUrl = this.oauth.getAuthorizeUrl();
    const redirectUri = this.config.instagramRedirectUri;
    return res.type('html').send(this.renderSetupPage(authUrl, redirectUri));
  }

  @Get()
  startOAuth(@Query('userId') userId: string | undefined, @Res() res: Response) {
    const state = userId?.trim() || undefined;
    const url = this.oauth.getAuthorizeUrl(state);
    this.logger.log(`Starting Instagram OAuth → ${url}`);
    return res.redirect(url);
  }

  /** Paste authorization code manually (fallback when Instagram redirect breaks). */
  @Post('exchange')
  async manualExchange(
    @Body('code') code: string,
    @Body('userId') userId: string | undefined,
    @Res() res: Response,
  ) {
    if (!code?.trim()) {
      return res.status(400).type('html').send(
        this.renderErrorPage('missing_code', 'Paste the code from your redirect URL.'),
      );
    }
    return this.completeOAuth(res, this.oauth.cleanCode(code), userId);
  }

  @Get('callback')
  async handleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      this.logger.warn(`Instagram OAuth error: ${error} ${errorDescription ?? ''}`);
      return res
        .status(400)
        .type('html')
        .send(this.renderErrorPage(error, errorDescription));
    }

    // Client-side page reads ?code= from URL (works even if ngrok interstitial delayed the request).
    if (!code) {
      return res.status(200).type('html').send(this.renderCallbackClientPage(state));
    }

    return this.completeOAuth(res, this.oauth.cleanCode(code), state);
  }

  /** JSON exchange for client-side callback page and API callers. */
  @Post('api/exchange')
  async apiExchange(
    @Body('code') code: string,
    @Body('userId') userId: string | undefined,
  ) {
    if (!code?.trim()) {
      throw new BadRequestException('Missing authorization code');
    }
    const tokens = await this.oauth.exchangeCodeForTokens(this.oauth.cleanCode(code));
    const profile = await this.oauth.fetchProfile(tokens.accessToken);
    const media = await this.oauth.listMedia(tokens.accessToken, 3);

    let linkedAccount: { userId: number; username: string } | null = null;
    let linkError: string | null = null;

    if (userId?.trim()) {
      try {
        linkedAccount = await this.persistence.linkInstagramAccount(
          Number(userId),
          profile,
          tokens,
        );
      } catch (linkErr) {
        linkError =
          linkErr instanceof Error ? linkErr.message : 'Could not link user';
      }
    }

    return {
      profile,
      tokens: {
        accessToken: this.config.isDevelopment
          ? tokens.accessToken
          : `${tokens.accessToken.slice(0, 16)}...`,
        expiresIn: tokens.expiresIn,
        userId: tokens.userId,
      },
      media,
      linkedAccount,
      linkError,
    };
  }

  @Get('status')
  status(@Req() req: { headers: { host?: string } }) {
    const redirectUri = this.config.instagramRedirectUri;
    const host = req.headers.host ?? '';
    const redirectHost = redirectUri.replace(/^https?:\/\//, '').split('/')[0];
    const hostMatches = host.includes(redirectHost) || redirectHost.includes(host.split(':')[0]);

    return {
      ok: true,
      appId: this.config.instagramAppId,
      redirectUri,
      scopes: this.config.instagramOAuthScopes,
      authUrl: this.oauth.getAuthorizeUrl(),
      setupUrl: '/auth/instagram/setup',
      requestHost: host,
      configOk: hostMatches,
      warning: hostMatches
        ? null
        : `MISMATCH: You opened this via "${host}" but OAuth redirect_uri is "${redirectUri}". Restart backend after .env changes, and register that exact redirect URI in Meta Business login settings.`,
      note: 'redirectUri must match Meta dashboard exactly (including https, no trailing slash)',
    };
  }

  private async completeOAuth(
    res: Response,
    code: string,
    state?: string,
  ) {
    try {
      this.logger.log('Exchanging Instagram authorization code...');
      const tokens = await this.oauth.exchangeCodeForTokens(code);
      const profile = await this.oauth.fetchProfile(tokens.accessToken);
      const media = await this.oauth.listMedia(tokens.accessToken, 3);

      let linkedAccount: { userId: number; username: string } | null = null;
      let linkError: string | null = null;

      if (state?.trim()) {
        try {
          linkedAccount = await this.persistence.linkInstagramAccount(
            Number(state),
            profile,
            tokens,
          );
        } catch (linkErr) {
          linkError =
            linkErr instanceof Error ? linkErr.message : 'Could not link user';
          this.logger.warn(`Token OK but link failed: ${linkError}`);
        }
      }

      const frontendUrl = this.config.frontendUrl;
      if (linkedAccount && frontendUrl && !linkError) {
        const redirectTo = new URL('/dashboard/social-accounts', frontendUrl);
        redirectTo.searchParams.set('connected', '1');
        redirectTo.searchParams.set('username', profile.username);
        return res.redirect(redirectTo.toString());
      }

      return res.status(200).type('html').send(
        this.renderSuccessPage({
          profile,
          tokens,
          media,
          linkedAccount,
          linkError,
          showFullToken: this.config.isDevelopment,
        }),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Instagram connection failed';
      this.logger.error(`OAuth failed: ${message}`);
      return res.status(400).type('html').send(this.renderErrorPage('oauth_failed', message));
    }
  }

  private renderCallbackClientPage(state?: string): string {
    const stateJson = JSON.stringify(state ?? '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Instagram OAuth — processing</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 16px 0; }
    textarea { width: 100%; font-family: monospace; font-size: 12px; }
    .ok { color: #047857; font-weight: 600; }
    .err { color: #b91c1c; }
  </style>
</head>
<body>
  <h1>Processing Instagram login…</h1>
  <p id="status">Reading authorization code from URL…</p>
  <div id="result"></div>
  <script>
    const state = ${stateJson};
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err = params.get('error');
    const status = document.getElementById('status');
    const result = document.getElementById('result');

    if (err) {
      status.innerHTML = '<span class="err">Instagram error: ' + err + '</span>';
      result.innerHTML = '<p>' + (params.get('error_description') || '') + '</p><a href="/auth/instagram/setup">Try again</a>';
    } else if (!code) {
      status.innerHTML = '<span class="err">No code in URL.</span>';
      result.innerHTML = '<p>Instagram did not redirect with a code. Common fixes:</p><ul><li>Log in as <strong>onlycreators_official</strong> (Instagram Tester)</li><li>Account must be Creator/Business</li><li>Redirect URI in Meta must match backend exactly</li></ul><a href="/auth/instagram/setup">Open setup page</a>';
    } else {
      status.textContent = 'Exchanging code for token…';
      fetch('/auth/instagram/api/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId: state || undefined }),
      })
        .then(r => r.json().then(j => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) throw new Error(j.message || JSON.stringify(j));
          status.innerHTML = '<span class="ok">Token generated successfully</span>';
          result.innerHTML =
            '<div class="card"><p><strong>@' + j.profile.username + '</strong> (' + (j.profile.account_type || '') + ')</p>' +
            (j.linkedAccount ? '<p class="ok">Linked to user #' + j.linkedAccount.userId + '</p>' : '') +
            (j.linkError ? '<p class="warn">Link failed: ' + j.linkError + ' (token still valid)</p>' : '') +
            '<h2>Access token (copy this)</h2><textarea readonly rows="5">' + j.tokens.accessToken + '</textarea></div>';
        })
        .catch(e => {
          status.innerHTML = '<span class="err">Exchange failed</span>';
          result.innerHTML =
            '<div class="card"><p>' + e.message + '</p>' +
            '<p>Your code (paste into setup page or run <code>npm run instagram:exchange -- CODE</code>):</p>' +
            '<textarea readonly rows="3">' + code + '</textarea>' +
            '<p><a href="/auth/instagram/setup">Manual exchange on setup page</a></p></div>';
        });
    }
  </script>
</body>
</html>`;
  }

  private renderSetupPage(authUrl: string, redirectUri: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Connect Instagram — Only Creators</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
    h1 { font-size: 1.75rem; }
    .btn { display: inline-block; background: #111; color: #fff; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 12px 0; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0; }
    input, textarea { width: 100%; padding: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
    button { background: #2563eb; color: white; border: none; padding: 12px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 10px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; word-break: break-all; }
    ol { padding-left: 1.2rem; }
  </style>
</head>
<body>
  <h1>Connect Instagram</h1>
  <p>Redirect URI (must match Meta dashboard): <code>${redirectUri}</code></p>
  <p><a href="/auth/instagram/status" target="_blank">Check config status</a></p>

  <div class="card" style="background:#fef2f2;border-color:#ef4444">
    <h2>Login → home feed, no Allow screen?</h2>
    <p><strong>Do these 3 things in order:</strong></p>
    <ol>
      <li><strong>Finish Professional account</strong> — Settings → Account type → pick Creator/Business → choose category → click <strong>Submit</strong> (required for API)</li>
      <li><strong>Remove old app auth</strong> — <a href="https://www.instagram.com/accounts/manage_access/" target="_blank">Apps and websites</a> → Tester Invitations → <strong>Remove</strong> only-creators-IG</li>
      <li><strong>Fresh incognito</strong> → open setup page again → Connect → you should see Allow screen</li>
    </ol>
    <p>When you click Connect, the address bar must show <code>instagram.com/oauth/authorize?...</code> — not just instagram.com</p>
    <p>Backend should log: <code>Starting Instagram OAuth → ...</code> when you click Connect</p>
  </div>

  <div class="card">
    <h2>Option A — Login button</h2>
    <ol>
      <li>Click below → log in as <strong>onlycreators_official</strong></li>
      <li>Tap <strong>Allow</strong></li>
      <li>If ngrok shows "Visit Site", click it (twice if needed)</li>
    </ol>
    <a class="btn" href="${authUrl}">Connect with Instagram</a>
    <p>Or: <a href="/auth/instagram">/auth/instagram</a></p>
  </div>

  <div class="card">
    <h2>Option B — Paste code manually (if redirect fails)</h2>
    <ol>
      <li>Click Connect above, complete login + Allow</li>
      <li>Copy the <strong>entire URL</strong> from the address bar when redirected</li>
      <li>Paste the <code>code=...</code> value below (Meta adds <code>#_</code> at the end — we strip it)</li>
    </ol>
    <form method="POST" action="/auth/instagram/exchange" id="exchange-form">
      <label>Authorization code or full redirect URL</label>
      <textarea name="code" id="code-input" rows="3" placeholder="AQBx... or paste full URL with ?code=..."></textarea>
      <label>Optional user id to link</label>
      <input name="userId" placeholder="1" />
      <button type="submit">Exchange code for token</button>
    </form>
    <script>
      document.getElementById('code-input').addEventListener('paste', function(e) {
        setTimeout(function() {
          var v = e.target.value;
          var m = v.match(/[?&]code=([^&#]+)/);
          if (m) e.target.value = m[1].replace(/#_.*$/, '');
        }, 0);
      });
    </script>
  </div>
</body>
</html>`;
  }

  private renderSuccessPage(data: {
    profile: { id: string; username: string; account_type?: string };
    tokens: { accessToken: string; expiresIn: number; userId: string };
    media: Array<{ id: string; media_type?: string; permalink?: string }>;
    linkedAccount: { userId: number; username: string } | null;
    linkError: string | null;
    showFullToken: boolean;
  }): string {
    const expiresDays = Math.round(data.tokens.expiresIn / 86400);
    const mediaRows =
      data.media.length === 0
        ? '<p>No media yet — post a reel to test insights.</p>'
        : `<ul>${data.media
            .map(
              (item) =>
                `<li><strong>${item.media_type ?? 'MEDIA'}</strong> — ${item.id}</li>`,
            )
            .join('')}</ul>`;

    const linkedMessage = data.linkedAccount
      ? `<p class="ok">Linked to user #${data.linkedAccount.userId}</p>`
      : data.linkError
        ? `<p class="warn">Token OK but link failed: ${data.linkError}</p>`
        : `<p class="muted">Not linked to a dashboard user.</p>`;

    const tokenBlock = data.showFullToken
      ? `<div class="card"><h2>Access token (copy this)</h2><textarea readonly rows="4">${data.tokens.accessToken}</textarea></div>`
      : `<p><strong>Token preview:</strong> ${data.tokens.accessToken.slice(0, 16)}...</p>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Instagram Connected</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; }
    .ok { color: #047857; font-weight: 600; }
    .warn { color: #b45309; }
    .muted { color: #555; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 16px 0; }
    textarea { width: 100%; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Instagram connected successfully</h1>
  ${linkedMessage}
  <div class="card">
    <p><strong>@${data.profile.username}</strong> (${data.profile.account_type ?? 'unknown'})</p>
    <p>Instagram id: ${data.profile.id}</p>
    <p>Token expires in ~${expiresDays} days</p>
  </div>
  ${tokenBlock}
  <div class="card"><h2>Recent media</h2>${mediaRows}</div>
</body>
</html>`;
  }

  private renderErrorPage(error: string, description?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Instagram Connection Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #b91c1c; }
    code { background: #fef2f2; padding: 2px 6px; }
    a.btn { display: inline-block; margin-top: 16px; background: #111; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Instagram connection failed</h1>
  <p><strong>Error:</strong> <code>${error}</code></p>
  ${description ? `<p>${description}</p>` : ''}
  <a class="btn" href="/auth/instagram/setup">Try setup page</a>
</body>
</html>`;
  }
}
