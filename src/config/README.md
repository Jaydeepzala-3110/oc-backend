# Configuration Service

This module provides a centralized, type-safe way to access environment variables throughout the application.

## Installation

The `@nestjs/config` package has been installed and configured.

## Usage

Since `ConfigModule` is marked as `@Global()`, you can inject `ConfigService` anywhere in your application without importing the module.

### Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class YourService {
    constructor(private config: ConfigService) {}

    someMethod() {
        // Access predefined environment variables
        const dbUrl = this.config.databaseUrl;
        const jwtSecret = this.config.jwtAccessSecret;
        const port = this.config.port;
        
        // Check environment
        if (this.config.isDevelopment) {
            console.log('Running in development mode');
        }
        
        // Access custom environment variables
        const customVar = this.config.getEnv('CUSTOM_VAR', 'default-value');
        
        // Access required environment variables (throws if not found)
        const requiredVar = this.config.getEnvOrThrow('REQUIRED_VAR');
    }
}
```

## Available Properties

### Database
- `databaseUrl`: Database connection URL (required)

### JWT Configuration
- `jwtAccessSecret`: JWT access token secret (required)
- `jwtRefreshSecret`: JWT refresh token secret (required)
- `jwtAccessExpiration`: Access token expiration (default: '15m')
- `jwtRefreshExpiration`: Refresh token expiration (default: '7d')

### Server Configuration
- `port`: Server port (default: 3000)
- `nodeEnv`: Node environment (default: 'development')
- `isDevelopment`: Boolean flag for development environment
- `isProduction`: Boolean flag for production environment

### CORS
- `corsOrigin`: CORS origin (default: 'http://localhost:3001')

## Generic Methods

- `getEnv(key, defaultValue?)`: Get any environment variable with optional default
- `getEnvOrThrow(key)`: Get any environment variable, throws if not found

## Adding New Environment Variables

To add new environment variables:

1. Add the variable to your `.env` file
2. Add a getter method in `config.service.ts`:

```typescript
get myNewVariable(): string {
    return this.get('MY_NEW_VARIABLE', 'default-value');
}
```

## Example: Updating Auth Service

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private config: ConfigService,
    ) {}

    async generateTokens(userId: number) {
        const accessToken = await this.jwtService.signAsync(
            { sub: userId },
            {
                secret: this.config.jwtAccessSecret,
                expiresIn: this.config.jwtAccessExpiration,
            }
        );

        const refreshToken = await this.jwtService.signAsync(
            { sub: userId },
            {
                secret: this.config.jwtRefreshSecret,
                expiresIn: this.config.jwtRefreshExpiration,
            }
        );

        return { accessToken, refreshToken };
    }
}
```
