const fs = require('fs');
const { createCanvas } = require('canvas');
const { exec } = require('child_process');

async function generateAnimation(inputFilePath, outputVideoPath, frameRate = 30, duration = 5) {
    try {
        // Read the combined data
        const rawData = fs.readFileSync(inputFilePath, 'utf-8');
        const combinedData = JSON.parse(rawData);
        const colors = combinedData.colors;

        if (!colors || colors.length === 0) {
            console.error("No color data found.");
            return;
        }

        const numFrames = frameRate * duration;
        const canvasWidth = 800;
        const canvasHeight = 400;
        const frameDir = 'frames';

        // Create frames directory if it doesn't exist
        if (!fs.existsSync(frameDir)) {
            fs.mkdirSync(frameDir);
        }

        // Generate frames
        for (let i = 0; i < numFrames; i++) {
            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext('2d');

            // Calculate the color index based on the frame number
            const colorIndex = Math.floor((i / numFrames) * colors.length);
            const color = colors[colorIndex];

            // Clear the canvas
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Draw a rectangle with the current color
            ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Save the frame
            const framePath = `${frameDir}/frame_${String(i).padStart(4, '0')}.png`;
            const buffer = canvas.toBuffer('image/png');
            fs.writeFileSync(framePath, buffer);
            console.log(`Generated frame ${i + 1}/${numFrames}`);
        }

        // Combine frames into a video using ffmpeg
        const ffmpegCommand = `ffmpeg -framerate ${frameRate} -i ${frameDir}/frame_%04d.png -c:v libx264 -pix_fmt yuv420p ${outputVideoPath}`;
        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error creating video: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`ffmpeg stderr: ${stderr}`);
            }
            console.log(`Video saved to ${outputVideoPath}`);

            // Clean up frames directory
            fs.rmSync(frameDir, { recursive: true, force: true });
        });

    } catch (error) {
        console.error("Error:", error);
    }
}

// Get the file names from the command line arguments
const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'output.mp4'; // Default output file

if (!inputFile) {
    console.error("Usage: node generate-animation.js <combined-data-file> [output-video-file]");
    process.exit(1);
}

generateAnimation(inputFile, outputFile);
