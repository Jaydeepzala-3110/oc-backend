import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";

/**
 * Technical Demo: Game Detection & Rule Verification Script
 * This script demonstrates how we use AI Vision (Gemini) to verify campaign rules.
 */

async function runTest() {
    // Use Gemeni API Key from environment
    const API_KEY = 'AIzaSyAMsSsm8RykA6SU6U9kgcdPebhJhu9YMe8';


    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel(
        { model: "gemini-flash-latest" },
        { apiVersion: 'v1beta' }
    );

    // Path to the test image (one of the uploaded screenshots)
    const imagePath = "/Users/jaydeepzala/Dev/Projects/only-creators/oc-backend/scripts/image.png";

    console.log(`🔍 Analyzing Image: ${path.basename(imagePath)}`);

    try {
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString("base64");

        const prompt = `
      Analyze this video frame for a creator campaign audit.
      
      RULES TO VERIFY:
      1. Game Visibility: Is there a gambling/slot game visible? If so, what is the name?
      2. Screen Coverage: Estimate the percentage of the screen the game covers.
      3. Creator Visibility: Is there a person (streamer) visible?
      4. Text Recognition: Are there visible numbers for "Credit", "Bet", or "Win"?
      5. Layout Quality: Is the video cropped or blurred?

      Respond in JSON format with the following keys:
      {
        "gameDetected": boolean,
        "gameName": string,
        "screenCoverage": number (percentage),
        "creatorVisible": boolean,
        "metricsVisible": boolean,
        "isHighQuality": boolean,
        "violations": string[]
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

        // Clean up potential markdown formatting in response
        const jsonStr = text.replace(/```json|```/g, "").trim();
        const analysis = JSON.parse(jsonStr);

        console.log("\n✅ AI ANALYSIS COMPLETED:");
        console.log("------------------------");
        console.log(`🎮 Game Detected: ${analysis.gameDetected ? "YES (" + analysis.gameName + ")" : "NO"}`);
        console.log(`📊 Screen Coverage: ${analysis.screenCoverage}%`);
        console.log(`👤 Creator Visible: ${analysis.creatorVisible ? "YES" : "NO"}`);
        console.log(`💰 Stats Visible: ${analysis.metricsVisible ? "YES" : "NO"}`);
        console.log(`✨ Quality Check: ${analysis.isHighQuality ? "PASS" : "FAIL"}`);

        if (analysis.violations.length > 0) {
            console.log("\n⚠️ VIOLATIONS DETECTED:");
            analysis.violations.forEach((v: string) => console.log(`   - ${v}`));
        } else {
            console.log("\n🚀 ALL RULES PASSED!");
        }

        // Logic for the requested "1/3rd Screen" rule
        if (analysis.screenCoverage < 33.3) {
            console.log("\n❌ REJECTED: Game covers less than 1/3rd of the screen.");
        } else {
            console.log("\n✅ APPROVED: Meet the 1/3rd screen coverage requirement.");
        }

    } catch (error) {
        console.error("❌ Processing failed:", error);
    }
}

runTest();
