const { createCanvas } = require('canvas');
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
  systemInstruction: "Respond with raw data that can be interpreted as colors. Your response can be anything - it doesn't need to be valid base64 or follow any particular format.", 
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const safetySettings = [
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
  },
];

// Color generation functions
function stringToColors(input) {
    const bytes = Array.from(input).map(char => char.charCodeAt(0));
    
    const colors = {
        rgb: [],
        hsv: [],
        byteChunks: [],
        patterns: []
    };

    // Method 1: Direct RGB from byte triplets
    for(let i = 0; i < bytes.length; i += 3) {
        const r = bytes[i] ?? 0;
        const g = bytes[i + 1] ?? 0;
        const b = bytes[i + 2] ?? 0;
        colors.rgb.push(`rgb(${r},${g},${b})`);
    }

    // Method 2: HSV color space - use position for hue
    for(let i = 0; i < bytes.length; i++) {
        const hue = (bytes[i] / 255) * 360;
        const saturation = 0.8;
        const value = 0.9;
        colors.hsv.push(hsvToRgb(hue, saturation, value));
    }

    // Method 3: Raw byte chunks
    for(let i = 0; i < bytes.length; i++) {
        const intensity = bytes[i] / 255;
        colors.byteChunks.push({
            raw: bytes[i],
            normalized: intensity,
            color: `rgba(${bytes[i]},${bytes[i]},${bytes[i]},1)`
        });
    }

    // Method 4: Pattern detection
    const patterns = findPatterns(bytes);
    colors.patterns = patterns.map(pattern => ({
        sequence: pattern,
        color: patternToColor(pattern)
    }));

    return colors;
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

function findPatterns(bytes, minLength = 2, maxLength = 8) {
    const patterns = [];
    
    for(let len = minLength; len <= maxLength; len++) {
        for(let i = 0; i < bytes.length - len; i++) {
            const pattern = bytes.slice(i, i + len);
            const patternStr = pattern.join(',');
            
            let count = 0;
            for(let j = 0; j < bytes.length - len; j++) {
                const testPattern = bytes.slice(j, j + len).join(',');
                if(testPattern === patternStr) count++;
            }
            
            if(count > 1 && !patterns.some(p => p.join(',') === patternStr)) {
                patterns.push(pattern);
            }
        }
    }
    
    return patterns;
}

function patternToColor(pattern) {
    const sum = pattern.reduce((a, b) => a + b, 0);
    const avg = sum / pattern.length;
    const hue = (avg / 255) * 360;
    return hsvToRgb(hue / 360, 0.9, 0.9);
}

// Visualization setup
const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 400;
document.body.appendChild(canvas);

function createVisualization(colors) {
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    
    // RGB stripes
    const stripeWidth = width / colors.rgb.length;
    colors.rgb.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, height/4);
    });
    
    // HSV colors
    colors.hsv.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * stripeWidth, height/4, stripeWidth, height/4);
    });
    
    // Byte chunks
    colors.byteChunks.forEach((chunk, i) => {
        ctx.fillStyle = chunk.color;
        ctx.fillRect(i * stripeWidth, height/2, stripeWidth, height/4);
    });
    
    // Patterns
    if(colors.patterns.length > 0) {
        const patternWidth = width / colors.patterns.length;
        colors.patterns.forEach((pattern, i) => {
            ctx.fillStyle = pattern.color;
            ctx.fillRect(i * patternWidth, height * 3/4, patternWidth, height/4);
        });
    }

    // Save to file
    const buffer = canvas.toBuffer('image/png');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `color-output-${timestamp}.png`;
    fs.writeFileSync(filename, buffer);
    return filename;
}

async function run(userPrompt) {
    try {
        const chatSession = model.startChat({
            generationConfig,
            safetySettings,
            history: [],
        });

        const result = await chatSession.sendMessage(userPrompt);
        const response = result.response.text();
        
        // Log raw response for debugging
        console.log("Raw response from model:", response.substring(0, 200));
        
        // Process and visualize the response
        const colors = stringToColors(response);
        const outputFile = createVisualization(colors);
        
        // Log color data for analysis
        console.log("Generated colors:", {
            rgbCount: colors.rgb.length,
            hsvCount: colors.hsv.length,
            byteCount: colors.byteChunks.length,
            patternCount: colors.patterns.length,
            outputFile: outputFile
        });
        
    } catch (error) {
        console.error("Error:", error);
        // Visualize the error as colors too!
        const colors = stringToColors(error.toString());
        const outputFile = createVisualization(colors);
        console.log("Error visualization saved to:", outputFile);
    }
}

// Test with your original prompt
const prompt = `Imagine a single frame of a GIF that visually represents the 'space' between the encoded and decoded state of a chess game. This frame should be abstract and not directly depict a chess game. Focus on the data transformation process.

Use a low-poly, geometric visual style. Depict a swirling vortex or tunnel made of interconnected, colored polygonal shapes. The colors should transition from cool blues and purples (representing the encoded, digital state) to warmer yellows and oranges (representing the decoded, more 'playable' state). Within the vortex, hint at abstract representations of chess pieces, as if they are being broken down and reassembled. The overall feeling should be that of a chaotic but controlled transformation of information. The background should be a dark, solid color to emphasize the colorful shapes in the foreground. The scene is not to look like a chess board. The shapes should have a flowing motion, suggesting dynamic transformation. The image should be centered.`;

run(prompt);