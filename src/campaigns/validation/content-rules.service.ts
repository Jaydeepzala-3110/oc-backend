import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ClipAiRules } from '../types/clip/clip-campaign-config';

export interface ContentRulesResult {
  /** true = rules satisfied, null = cannot confirm (defer to admin review). */
  passed: boolean | null;
  detail: string;
}

interface GeminiVerdict {
  watermarkDetected?: boolean;
  gameDetected?: boolean;
  gameName?: string;
  screenCoveragePercent?: number;
  summary?: string;
}

/**
 * Layer 3 — AI content rules (watermark, required game/content visibility).
 *
 * Analyzes the reel's thumbnail frame via Gemini. A single frame can prove
 * compliance but not violation, so the verdict is conservative:
 *   - all required rules visibly satisfied → passed: true
 *   - anything missing/uncertain/errored → passed: null (admin review decides)
 */
@Injectable()
export class ContentRulesService {
  private readonly logger = new Logger(ContentRulesService.name);
  private readonly genAI: GoogleGenerativeAI | null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  async evaluateThumbnail(
    thumbnailUrl: string | undefined,
    rules: ClipAiRules,
  ): Promise<ContentRulesResult> {
    if (!this.genAI) {
      return {
        passed: null,
        detail: 'AI review unavailable — manual review required',
      };
    }
    if (!thumbnailUrl) {
      return {
        passed: null,
        detail: 'No thumbnail available — manual review required',
      };
    }

    try {
      const imageResponse = await fetch(thumbnailUrl);
      if (!imageResponse.ok) {
        return {
          passed: null,
          detail: 'Thumbnail unreachable — manual review required',
        };
      }
      const mimeType =
        imageResponse.headers.get('content-type') ?? 'image/jpeg';
      const base64Image = Buffer.from(
        await imageResponse.arrayBuffer(),
      ).toString('base64');

      const model = this.genAI.getGenerativeModel(
        { model: 'gemini-flash-latest' },
        { apiVersion: 'v1beta' },
      );

      const requirements: string[] = [];
      if (rules.requireWatermark) {
        requirements.push(
          '1. Watermark/logo: Is a brand watermark or logo overlay visible on the frame?',
        );
      }
      if (rules.requiredGame) {
        requirements.push(
          `2. Game visibility: Is "${rules.requiredGame}" gameplay visible?` +
            (rules.minScreenCoveragePercent
              ? ` Estimate the percentage of the screen it covers (target ${rules.minScreenCoveragePercent}%).`
              : ''),
        );
      }

      const result = await model.generateContent([
        `Analyze this video thumbnail frame for a creator campaign audit.

REQUIREMENTS TO VERIFY:
${requirements.join('\n')}

Respond with ONLY JSON:
{
  "watermarkDetected": boolean,
  "gameDetected": boolean,
  "gameName": string,
  "screenCoveragePercent": number,
  "summary": string
}`,
        { inlineData: { data: base64Image, mimeType } },
      ]);

      const text = result.response.text();
      const verdict = JSON.parse(
        text.replace(/```json|```/g, '').trim(),
      ) as GeminiVerdict;

      const failures: string[] = [];
      if (rules.requireWatermark && !verdict.watermarkDetected) {
        failures.push('watermark not detected');
      }
      if (rules.requiredGame && !verdict.gameDetected) {
        failures.push(`"${rules.requiredGame}" not detected`);
      }
      if (
        rules.requiredGame &&
        rules.minScreenCoveragePercent &&
        verdict.gameDetected &&
        (verdict.screenCoveragePercent ?? 0) < rules.minScreenCoveragePercent
      ) {
        failures.push(
          `coverage ${verdict.screenCoveragePercent ?? 0}% < ${rules.minScreenCoveragePercent}%`,
        );
      }

      if (!failures.length) {
        return {
          passed: true,
          detail: `AI verified on thumbnail${verdict.summary ? `: ${verdict.summary}` : ''}`,
        };
      }

      // One frame can't prove a violation — flag for admin review instead of rejecting.
      return {
        passed: null,
        detail: `AI flagged for review (${failures.join('; ')})`,
      };
    } catch (error) {
      this.logger.warn(
        `Content rules AI check failed: ${error instanceof Error ? error.message : error}`,
      );
      return {
        passed: null,
        detail: 'AI review failed — manual review required',
      };
    }
  }
}
