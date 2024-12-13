const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  systemInstruction: "You only respond in base64.", // Improved system instruction
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const safetySettings = [ // Added safety settings for responsible use
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

async function run(userPrompt) { // Made run function accept a prompt
  try {
    const chatSession = model.startChat({
      generationConfig,
      safetySettings, // Include safety settings
      history: [
        // Removed hardcoded example from history. This is not how you use the API.
      ],
    });

    const result = await chatSession.sendMessage(userPrompt); // Use the provided prompt
    const base64Image = result.response.text();

    // Basic validation to check if the response looks like base64
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64Image) && base64Image.length > 0) {
        console.error("Response is not valid base64:", base64Image.substring(0, 100)); // Log a preview
        throw new Error("Invalid base64 response received.");
    } else if (base64Image.length === 0) {
        console.error("Empty response received from the model.");
        throw new Error("Empty response received from the model.");
    }

    console.log(base64Image); // Output the base64 string
  } catch (error) {
    console.error("Error:", error);
  }
}

// Example usage:
const prompt = "Imagine a single frame of a GIF that visually represents the 'space' between the encoded and decoded state of a chess game. This frame should be abstract and not directly depict a chess game. Focus on the data transformation process.\n\nUse a low-poly, geometric visual style. Depict a swirling vortex or tunnel made of interconnected, colored polygonal shapes. The colors should transition from cool blues and purples (representing the encoded, digital state) to warmer yellows and oranges (representing the decoded, more 'playable' state). Within the vortex, hint at abstract representations of chess pieces, as if they are being broken down and reassembled. The overall feeling should be that of a chaotic but controlled transformation of information. The background should be a dark, solid color to emphasize the colorful shapes in the foreground. The scene is not to look like a chess board. The shapes should have a flowing motion, suggesting dynamic transformation. The image should be centered. Output the image as a base64 encoded string for a GIF frame. No other text is needed.";
run(prompt);

// Or call it with a different prompt:
// run("A futuristic cityscape at night, neon lights reflecting on wet streets.");