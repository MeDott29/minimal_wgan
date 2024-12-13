const fs = require('fs');
const { exec } = require('child_process');

// Function to create a PPM frame
function createPPMFrame(width, height, color) {
    const header = `P3\n${width} ${height}\n255\n`;
    let frameData = header;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            frameData += `${color.r} ${color.g} ${color.b} `;
        }
        frameData += '\n';
    }
    return frameData;
}

// Function to save a frame to a file
function saveFrame(frameDir, frameIndex, frameData) {
    const framePath = `${frameDir}/frame_${String(frameIndex).padStart(4, '0')}.ppm`;
    fs.writeFileSync(framePath, frameData);
    console.log(`Generated frame ${frameIndex + 1}`);
}

// Function to combine frames into a video using ffmpeg
function createVideo(frameDir, frameRate, outputVideoPath) {
    return new Promise((resolve, reject) => {
        const ffmpegCommand = `ffmpeg -framerate ${frameRate} -i ${frameDir}/frame_%04d.ppm -c:v libx264 -pix_fmt yuv420p ${outputVideoPath}`;
        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error creating video: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`ffmpeg stderr: ${stderr}`);
            }
            console.log(`Video saved to ${outputVideoPath}`);
            resolve();
        });
    });
}

// Function to clean up the frames directory
function cleanupFrames(frameDir) {
    fs.rmSync(frameDir, { recursive: true, force: true });
}

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
        const width = 800;
        const height = 400;
        const frameDir = 'frames';

        // Create frames directory if it doesn't exist
        if (!fs.existsSync(frameDir)) {
            fs.mkdirSync(frameDir);
        }

        // Generate frames
        for (let i = 0; i < numFrames; i++) {
            // Calculate the color index based on the frame number
            const colorIndex = Math.floor((i / numFrames) * colors.length);
            const color = colors[colorIndex];

            // Create and save the frame
            const frameData = createPPMFrame(width, height, color);
            saveFrame(frameDir, i, frameData);
        }

        // Combine frames into a video
        await createVideo(frameDir, frameRate, outputVideoPath);

        // Clean up frames directory
        cleanupFrames(frameDir);

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
