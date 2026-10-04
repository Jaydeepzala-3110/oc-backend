import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
    constructor(private configService: NestConfigService) { }

    // Database
    get databaseUrl(): string {
        return this.getOrThrow('DATABASE_URL');
    }

    // JWT Secrets
    get jwtAccessSecret(): string {
        return this.getOrThrow('JWT_ACCESS_SECRET');
    }

    get jwtRefreshSecret(): string {
        return this.getOrThrow('JWT_REFRESH_SECRET');
    }

    // JWT Expiration Times
    get jwtAccessExpiration(): string {
        return this.get('JWT_ACCESS_EXPIRATION', '3d');
    }

    get jwtRefreshExpiration(): string {
        return this.get('JWT_REFRESH_EXPIRATION', '7d');
    }


    get rapidAPIkey():string {
        return this.getOrThrow('X_REPID_API_KEY')
    }

    get instagramAppId(): string {
        return this.getEnv('INSTA_APP_ID');
    }

    get instagramAppSecret(): string {
        return this.getEnv('INSTA_APP_SECRET');
    }

    get instagramWebhookVerifyToken(): string {
        return this.get('INSTAGRAM_WEBHOOK_VERIFY_TOKEN', 'onlycreators_webhook_verify');
    }

    get instagramRedirectUri(): string {
        return this.getOrThrow('INSTAGRAM_REDIRECT_URI');
    }

    get instagramOAuthScopes(): string {
        return this.get(
            'INSTAGRAM_OAUTH_SCOPES',
            'instagram_business_basic,instagram_business_manage_insights',
        );
    }

    get frontendUrl(): string {
        return this.get('FRONTEND_URL', 'http://localhost:3000');
    }

    // Server Configuration
    get port(): number {
        return parseInt(this.get('PORT', '3000'), 10);
    }

    get nodeEnv(): string {
        return this.get('NODE_ENV', 'development');
    }

    get isDevelopment(): boolean {
        return this.nodeEnv === 'development';
    }

    get isProduction(): boolean {
        return this.nodeEnv === 'production';
    }

    // CORS Configuration
    get corsOrigin(): string {
        return this.get('CORS_ORIGIN', 'http://localhost:3001');
    }

    // Helper methods
    private get(key: string, defaultValue?: string): string {
        const value = defaultValue
            ? this.configService.get<string>(key, defaultValue)
            : this.configService.get<string>(key);
        return value ?? '';
    }

    private getOrThrow(key: string): string {
        const value = this.configService.get<string>(key);
        if (!value) {
            throw new Error(`Environment variable ${key} is not defined`);
        }
        return value;
    }

    // Generic getter for any environment variable
    getEnv(key: string, defaultValue?: string): string {
        return defaultValue
            ? this.get(key, defaultValue)
            : this.get(key);
    }

    getEnvOrThrow(key: string): string {
        return this.getOrThrow(key);
    }
}
