const fs = require('fs');

function combineColorData(csvFilePath, rawTextFilePath, outputFilePath) {
    try {
        // Read the CSV file
        const csvData = fs.readFileSync(csvFilePath, 'utf-8');
        const colors = csvData.trim().split('\n').map(line => {
            const [r, g, b] = line.split(',').map(Number);
            return { r, g, b };
        });

        // Read the raw text file
        const rawText = fs.readFileSync(rawTextFilePath, 'utf-8');

        // Create the combined data structure
        const combinedData = {
            rawText: rawText,
            colors: colors
        };

        // Convert the combined data to JSON
        const jsonData = JSON.stringify(combinedData, null, 2);

        // Write the JSON data to the output file
        fs.writeFileSync(outputFilePath, jsonData);

        console.log(`Successfully combined data and saved to ${outputFilePath}`);

    } catch (error) {
        console.error("Error:", error);
    }
}

// Get the file names from the command line arguments
const csvFile = process.argv[2];
const rawTextFile = process.argv[3];
const outputFile = process.argv[4] || 'combined-data.json'; // Default output file

if (!csvFile || !rawTextFile) {
    console.error("Usage: node combine-data.js <colors-csv-file> <raw-text-file> [output-file]");
    process.exit(1);
}

combineColorData(csvFile, rawTextFile, outputFile);
