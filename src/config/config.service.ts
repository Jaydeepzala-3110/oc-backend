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
        return this.get('JWT_ACCESS_EXPIRATION', '15m');
    }

    get jwtRefreshExpiration(): string {
        return this.get('JWT_REFRESH_EXPIRATION', '7d');
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
