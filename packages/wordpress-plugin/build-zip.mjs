import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const zipFile = path.join(distDir, 'birtingur-ads.zip');
const stagingDir = path.join(distDir, 'staging', 'birtingur-ads');

// Clean and create directories
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Files and directories to include in release
const filesToCopy = [
  'birtingur-ads.php',
  'readme.txt',
];

const dirsToCopy = [
  'includes',
];

for (const file of filesToCopy) {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(stagingDir, file));
  }
}

for (const dir of dirsToCopy) {
  const src = path.join(__dirname, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(stagingDir, dir), { recursive: true });
  }
}

// Create ZIP file from staging directory
try {
  const stagingParent = path.join(distDir, 'staging');
  execSync(`cd "${stagingParent}" && zip -r "${zipFile}" birtingur-ads`, { stdio: 'inherit' });
  console.log(`\n[WordPress Plugin] Successfully built: ${zipFile}`);
  const stats = fs.statSync(zipFile);
  console.log(`[WordPress Plugin] Size: ${(stats.size / 1024).toFixed(2)} KB\n`);
} catch (error) {
  console.error('Failed to create zip file:', error);
  process.exit(1);
}
