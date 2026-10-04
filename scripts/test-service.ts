import { GoogleGenerativeAI } from "@google/generative-ai";
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GameValidationService } from '../src/campaigns/game-validation.service';

/**
 * Technical Demo: Service-based Game Detection Test
 * This script tests the actual GameValidationService within the NestJS context.
 */

async function runTest() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const validationService = app.get(GameValidationService);

    const imagePath = "/Users/jaydeepzala/Dev/Projects/only-creators/oc-backend/scripts/image.png";
    const mockCampaign = {
        title: "DLS X SUGAR RUSH",
        validationRules: {
            minDuration: 10,
            requiredGame: "Sugar Rush",
            minScreenCoverage: 33.3,
            requiredLanguage: "English"
        }
    };

    console.log(`🔍 Testing GameValidationService with: ${imagePath}`);

    try {
        const result = await validationService.validateReel(imagePath, mockCampaign);

        console.log("\n✅ SERVICE ANALYSIS COMPLETED:");
        console.log("----------------------------");
        console.log(`🎮 Overall Passed: ${result.allPassed ? "YES" : "NO"}`);
        console.log(`📝 Summary: ${result.summary}`);

        console.log("\n📊 DETAILED CHECKS:");
        result.checks.forEach((c: any) => {
            console.log(`   [${c.passed ? "✓" : "✗"}] ${c.label}`);
        });

    } catch (error) {
        console.error("❌ Service test failed:", error);
    } finally {
        await app.close();
    }
}

runTest();
