import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting full system reset...');

// Delete database file if it exists
const dbPath = join(__dirname, 'restaurant.db');
if (fs.existsSync(dbPath)) {
    console.log('Deleting existing database...');
    fs.unlinkSync(dbPath);
    console.log('Database deleted.');
}

// Execute scripts in sequence
const scripts = [
    'reset-cache.js',
    'reset-comments-tags.js',
    'init-db.js',
    'download-restaurants.js',
    'migrate-amenities.js'
];

for (const script of scripts) {
    console.log(`\nExecuting ${script}...`);
    try {
        execSync(`node ${script}`, { stdio: 'inherit' });
        console.log(`${script} completed successfully.`);
    } catch (error) {
        console.error(`Error executing ${script}:`, error);
        process.exit(1);
    }
}

console.log('\nStarting server...');
execSync('npm start', { stdio: 'inherit' });
