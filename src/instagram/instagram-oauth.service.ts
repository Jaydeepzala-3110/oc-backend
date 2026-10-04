import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export interface InstagramOAuthTokens {
  accessToken: string;
  expiresIn: number;
  userId: string;
}

export interface InstagramProfile {
  id: string;
  username: string;
  account_type?: string;
}

@Injectable()
export class InstagramOAuthService {
  private readonly logger = new Logger(InstagramOAuthService.name);

  constructor(private readonly config: ConfigService) {}

  /** Meta appends #_ to redirect URLs — must strip before token exchange. */
  cleanCode(raw: string): string {
    const trimmed = raw.trim();
    const fromUrl = trimmed.match(/[?&]code=([^&#]+)/)?.[1];
    const code = fromUrl ?? trimmed;
    return code.replace(/#_.*$/, '').replace(/#+$/, '');
  }

  getAuthorizeUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.instagramAppId,
      redirect_uri: this.config.instagramRedirectUri,
      response_type: 'code',
      scope: this.config.instagramOAuthScopes,
    });

    if (state) {
      params.set('state', state);
    }

    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<InstagramOAuthTokens> {
    const cleaned = this.cleanCode(code);
    const shortLived = await this.exchangeAuthorizationCode(cleaned);
    return this.exchangeForLongLivedToken(shortLived.access_token);
  }

  async fetchProfile(accessToken: string): Promise<InstagramProfile> {
    const url = new URL('https://graph.instagram.com/v21.0/me');
    url.searchParams.set('fields', 'id,username,account_type');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok) {
      this.logger.error(`Instagram /me failed: ${JSON.stringify(body)}`);
      throw new BadRequestException(
        body?.error?.message ?? 'Failed to fetch Instagram profile',
      );
    }

    return body as InstagramProfile;
  }

  async listMedia(accessToken: string, limit = 5) {
    const url = new URL('https://graph.instagram.com/v21.0/me/media');
    url.searchParams.set(
      'fields',
      'id,caption,media_type,permalink,timestamp',
    );
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok) {
      this.logger.warn(`Instagram /me/media failed: ${JSON.stringify(body)}`);
      return [];
    }

    return body?.data ?? [];
  }

  private async exchangeAuthorizationCode(code: string): Promise<{
    access_token: string;
    user_id: string;
  }> {
    const body = new URLSearchParams({
      client_id: this.config.instagramAppId,
      client_secret: this.config.instagramAppSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.instagramRedirectUri,
      code,
    });

    const response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`Token exchange failed: ${JSON.stringify(data)}`);
      throw new BadRequestException(
        data?.error_message ??
          data?.error?.message ??
          'Instagram authorization code exchange failed',
      );
    }

    return data;
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<InstagramOAuthTokens> {
    const url = new URL('https://graph.instagram.com/access_token');
    url.searchParams.set('grant_type', 'ig_exchange_token');
    url.searchParams.set('client_secret', this.config.instagramAppSecret);
    url.searchParams.set('access_token', shortLivedToken);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      this.logger.error(`Long-lived token exchange failed: ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(
        data?.error?.message ?? 'Failed to obtain long-lived Instagram token',
      );
    }

    const profile = await this.fetchProfile(data.access_token);

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      userId: profile.id,
    };
  }
}
