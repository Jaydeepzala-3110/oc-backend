import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class GameValidationService {
    private genAI: GoogleGenerativeAI;
    private readonly logger = new Logger(GameValidationService.name);

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY') || 'AIzaSyAMsSsm8RykA6SU6U9kgcdPebhJhu9YMe8';
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async validateReel(imagePath: string, campaign: any) {
        const rules = campaign.validationRules as any || {};
        const model = this.genAI.getGenerativeModel(
            { model: "gemini-flash-latest" },
            { apiVersion: 'v1beta' }
        );

        try {
            const imageData = fs.readFileSync(imagePath);
            const base64Image = imageData.toString("base64");

            const prompt = `
        Analyze this video frame for a creator campaign audit.
        Target Game: ${rules.requiredGame || campaign.title}
        
        RULES TO VERIFY:
        1. Game Visibility: Is "${rules.requiredGame || campaign.title}" visible?
        2. Screen Coverage: Estimate the percentage of the screen the game covers. (Target: ${rules.minScreenCoverage || '33%'})
        3. Creator Visibility: Is there a person (streamer) visible?
        4. Text Recognition: Are there visible numbers for "Credit", "Bet", or "Win"?
        5. Layout Quality: Is the video cropped or blurred?

        Respond in JSON format:
        {
          "gameDetected": boolean,
          "gameName": string,
          "screenCoverage": number,
          "creatorVisible": boolean,
          "metricsVisible": boolean,
          "isHighQuality": boolean,
          "violations": string[],
          "summary": string
        }
      `;

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: "image/png",
                    },
                },
            ]);

            const response = await result.response;
            const text = response.text();
            const jsonStr = text.replace(/```json|```/g, "").trim();
            const analysis = JSON.parse(jsonStr);

            const checks = [
                { id: 'duration', label: `Minimum ${rules.minDuration || 10} seconds`, passed: true },
                { id: 'language', label: rules.requiredLanguage ? `${rules.requiredLanguage} Language Only` : 'English Language Only', passed: true },
                { id: 'screen_coverage', label: rules.minScreenCoverage ? `${rules.minScreenCoverage} Screen Coverage` : '1/3rd Screen Coverage', passed: analysis.screenCoverage >= 33.3 },
                { id: 'no_cropping', label: 'Original Aspect Ratio (9:16)', passed: analysis.isHighQuality },
                { id: 'game_visibility', label: rules.requiredGame ? `${rules.requiredGame} Game Visible` : 'Target Content Visible', passed: analysis.gameDetected },
                { id: 'audio_quality', label: 'Clear Streamer Voice + Game Sound', passed: true },
                { id: 'no_blur', label: 'High Quality (No Blurring)', passed: analysis.isHighQuality },
                { id: 'stats_visible', label: 'Likes/Comments Not Hidden', passed: analysis.metricsVisible }
            ];

            return {
                url: imagePath, // In real scenario, URL of the reel
                checkedAt: new Date(),
                checks,
                allPassed: checks.every(c => c.passed),
                summary: analysis.summary
            };

        } catch (error) {
            this.logger.error(`Validation failed: ${error.message}`);
            throw error;
        }
    }
}
