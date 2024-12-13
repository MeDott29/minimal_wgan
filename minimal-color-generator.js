const fs = require('fs');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  systemInstruction: "Respond with raw data that can be interpreted as colors."
});

// Simplified color extraction
function extractColors(input) {
    const bytes = Array.from(input).map(char => char.charCodeAt(0));
    const colors = [];
    
    // Convert bytes directly to RGB triplets
    for(let i = 0; i < bytes.length; i += 3) {
        colors.push({
            r: bytes[i] ?? 0,
            g: bytes[i + 1] ?? 0,
            b: bytes[i + 2] ?? 0
        });
    }
    
    return colors;
}

async function run(userPrompt) {
    try {
        const chatSession = model.startChat({
            generationConfig: {
                temperature: 1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192
            },
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                }
            ]
        });

        const result = await chatSession.sendMessage(userPrompt);
        const response = result.response.text();
        
        // Extract colors
        const colors = extractColors(response);
        
        // Save raw response
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(`raw-response-${timestamp}.txt`, response);
        
        // Save colors in a simple format
        const colorData = colors.map(c => `${c.r},${c.g},${c.b}`).join('\n');
        fs.writeFileSync(`colors-${timestamp}.csv`, colorData);
        
        // Log some stats
        console.log({
            responseLength: response.length,
            colorCount: colors.length,
            rawFile: `raw-response-${timestamp}.txt`,
            colorFile: `colors-${timestamp}.csv`
        });
        
    } catch (error) {
        console.error("Error:", error);
        // Save error text too
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(`error-${timestamp}.txt`, error.toString());
    }
}

// Test prompt
const prompt = `Create a sequence of colors that represents a transformation from order to chaos. 
Start with cool, structured colors and progress to warmer, more chaotic patterns.`;

run(prompt);