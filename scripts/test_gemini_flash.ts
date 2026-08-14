// test_gemini_flash.ts - Test Google Gemini 2.5 Flash API Integration

import { GoogleGenerativeAI } from "@google/generative-ai";

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`GEMINI_API_KEY present: ${!!apiKey}`);

  if (!apiKey) {
    console.log("No GEMINI_API_KEY set. API key warning validated.");
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "You are PDACopilot, an expert bioinformatics assistant."
    });

    const result = await model.generateContent("What is the role of KRAS in pancreatic ductal adenocarcinoma?");
    console.log("\nGemini 2.5 Flash Response Preview:");
    console.log(result.response.text().slice(0, 300));
  } catch (err: any) {
    console.error("Gemini API Error:", err.message || err);
  }
}

testGemini();
