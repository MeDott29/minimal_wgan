const fs = require('fs');

function prepareMultimodalPrompt(colors) {
    // Extract key characteristics for audio/visual generation
    const colorAnalysis = analyzeColorSequence(colors);
    
    return {
        visual: {
            dimensions: {
                width: 512,  // Standard size for many image models
                height: 512
            },
            colorSequence: colors,
            keyTransitions: colorAnalysis.transitions,
            dominantColors: colorAnalysis.dominantColors,
            mood: colorAnalysis.mood
        },
        audio: {
            duration: colors.length * 0.5, // Half second per color
            structure: {
                frequencies: colorToFrequency(colors),
                amplitudes: colorToAmplitude(colors),
                timbre: colorToTimbre(colors)
            }
        }
    };
}

function analyzeColorSequence(colors) {
    const transitions = [];
    const dominantColors = new Map();
    let prevColor = null;
    
    colors.forEach((color, i) => {
        // Track major transitions (significant changes in RGB values)
        if (prevColor) {
            const delta = {
                r: color.r - prevColor.r,
                g: color.g - prevColor.g,
                b: color.b - prevColor.b
            };
            
            if (Math.abs(delta.r) > 50 || Math.abs(delta.g) > 50 || Math.abs(delta.b) > 50) {
                transitions.push({
                    index: i,
                    from: prevColor,
                    to: color,
                    magnitude: Math.sqrt(delta.r**2 + delta.g**2 + delta.b**2)
                });
            }
        }
        
        // Track color frequencies
        const key = `${color.r},${color.g},${color.b}`;
        dominantColors.set(key, (dominantColors.get(key) || 0) + 1);
        
        prevColor = color;
    });
    
    // Determine overall mood based on color characteristics
    const mood = determineMood(colors);
    
    return {
        transitions: transitions,
        dominantColors: Array.from(dominantColors.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
        mood: mood
    };
}

function determineMood(colors) {
    let totalWarmth = 0;
    let totalSaturation = 0;
    let totalBrightness = 0;
    
    colors.forEach(color => {
        // Calculate warmth (red vs blue ratio)
        totalWarmth += (color.r - color.b) / 255;
        
        // Calculate saturation
        const max = Math.max(color.r, color.g, color.b);
        const min = Math.min(color.r, color.g, color.b);
        totalSaturation += (max - min) / 255;
        
        // Calculate brightness
        totalBrightness += (color.r + color.g + color.b) / (3 * 255);
    });
    
    const avgWarmth = totalWarmth / colors.length;
    const avgSaturation = totalSaturation / colors.length;
    const avgBrightness = totalBrightness / colors.length;
    
    return {
        warmth: avgWarmth,
        saturation: avgSaturation,
        brightness: avgBrightness,
        description: characterizeMood(avgWarmth, avgSaturation, avgBrightness)
    };
}

function characterizeMood(warmth, saturation, brightness) {
    let moods = [];
    if (warmth > 0.3) moods.push("energetic");
    if (warmth < -0.3) moods.push("calm");
    if (saturation > 0.6) moods.push("intense");
    if (saturation < 0.3) moods.push("subtle");
    if (brightness > 0.7) moods.push("bright");
    if (brightness < 0.3) moods.push("dark");
    return moods.join(", ") || "neutral";
}

function colorToFrequency(colors) {
    // Map colors to frequencies (20Hz - 20000Hz, logarithmic scale)
    return colors.map(color => {
        const intensity = (color.r + color.g + color.b) / (3 * 255);
        return 20 * Math.pow(1000, intensity);
    });
}

function colorToAmplitude(colors) {
    // Map color brightness to amplitude (0-1)
    return colors.map(color => 
        (color.r + color.g + color.b) / (3 * 255)
    );
}

function colorToTimbre(colors) {
    // Map color components to harmonic ratios
    return colors.map(color => ({
        fundamentalWeight: color.r / 255,
        harmonicWeights: [
            color.g / 255,
            color.b / 255,
            (color.r + color.g) / (2 * 255),
            (color.g + color.b) / (2 * 255)
        ]
    }));
}

// Load and process the color data
const rawData = fs.readFileSync('raw-response-2024-12-13T22-34-25-300Z.txt', 'utf8');
const colors = JSON.parse(rawData);

// Generate the multimodal prompt
const prompt = prepareMultimodalPrompt(colors);

// Save the prompt for the next model
fs.writeFileSync('multimodal-prompt.json', 
    JSON.stringify(prompt, null, 2)
);

console.log("Generated multimodal prompt with:");
console.log(`- ${colors.length} colors`);
console.log(`- ${prompt.visual.keyTransitions.length} major transitions`);
console.log(`- Mood: ${prompt.audio.structure.frequencies.length} frequency points`);
console.log(`- Duration: ${prompt.audio.duration} seconds`);
console.log("Full prompt saved to multimodal-prompt.json");