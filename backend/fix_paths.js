const fs = require('fs-extra');
const path = require('path');

const dataDirectory = path.join(__dirname, '..', 'frontend', 'js', 'data');
const filesToProcess = [
    path.join(dataDirectory, 'digimon.json'),
    path.join(dataDirectory, 'evolutions.json'),
    path.join(dataDirectory, 'equipment.json'),
    path.join(dataDirectory, 'items.json'),
    path.join(dataDirectory, 'guides', 'area.json'),
    path.join(dataDirectory, 'guides', 'boss.json'),
    path.join(dataDirectory, 'guides', 'gameplay.json'),
    path.join(dataDirectory, 'synthesis.json')
];

// Use a regular expression for global replacement
const searchStringRegex = /http:\/\/localhost:3001/g;
let fixesCount = 0;

function fixPaths(obj) {
    if (obj === null || typeof obj !== 'object') {
        return;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (typeof value === 'string' && value.includes('http://localhost:3001')) {
                const originalValue = value;
                const newValue = value.replace(searchStringRegex, '');
                
                // Only log and count if a change was actually made
                if (originalValue !== newValue) {
                    obj[key] = newValue;
                    console.log(`  - Fixed: ${newValue}`);
                    fixesCount++;
                }
            } else if (typeof value === 'object') {
                // Recursively process nested objects and arrays
                fixPaths(value);
            }
        }
    }
}

async function processFiles() {
    console.log('Starting data file cleanup with improved logic...');
    for (const filePath of filesToProcess) {
        try {
            if (await fs.pathExists(filePath)) {
                console.log(`\n--- Processing ${path.relative(dataDirectory, filePath)} ---`);
                const data = await fs.readJson(filePath);
                fixPaths(data);
                await fs.writeJson(filePath, data, { spaces: 2 });
            } else {
                console.log(`\nSkipping (not found): ${path.relative(dataDirectory, filePath)}`);
            }
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error);
        }
    }
    console.log(`\nCleanup complete. Total paths fixed: ${fixesCount}.`);
}

processFiles(); 