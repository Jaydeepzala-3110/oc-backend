import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Controller('webhooks/instagram')
export class InstagramWebhooksController {
  private readonly logger = new Logger(InstagramWebhooksController.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Meta webhook verification (Step 3 in Instagram API setup).
   * GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expectedToken = this.config.instagramWebhookVerifyToken;

    if (mode === 'subscribe' && verifyToken === expectedToken) {
      this.logger.log('Instagram webhook verified successfully');
      return challenge;
    }

    throw new ForbiddenException('Webhook verification failed');
  }

  /** Incoming Instagram events (messages, comments, etc.) — log only for now. */
  @Post()
  @HttpCode(200)
  handleWebhook(@Body() body: unknown): { received: true } {
    this.logger.log(`Instagram webhook event: ${JSON.stringify(body)}`);
    return { received: true };
  }
}
