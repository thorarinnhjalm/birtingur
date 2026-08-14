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

// EXPLICIT allow-list, not a directory copy.
//
// `includes/` used to be copied wholesale, which ships whatever happens to be
// sitting in it: an editor backup, a `.orig` left by a merge, or the "filename
// 2.php" duplicates a file-sync daemon creates on branch switches (a real set
// of those was found in this working tree on 2026-08-14). A stray
// "birtingur-ads 2.php" in the plugin root is not cosmetic — WordPress scans
// plugin files for headers and would list a second plugin with the same name.
//
// Listing files by hand also means a missing one is caught here rather than
// discovered by a publisher with a broken install.
const filesToCopy = [
  'birtingur-ads.php',
  'readme.txt',
  'includes/class-birtingur-ads-api.php',
  'includes/class-birtingur-ads-admin.php',
  'includes/class-birtingur-ads-frontend.php',
  'includes/class-birtingur-ads-shortcodes.php',
];

const missing = filesToCopy.filter((file) => !fs.existsSync(path.join(__dirname, file)));
if (missing.length > 0) {
  // Previously each copy was wrapped in `if (fs.existsSync(...))`, so a missing
  // main plugin file produced a valid-looking zip and a success message.
  console.error(`[WordPress Plugin] Refusing to build, missing:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

for (const file of filesToCopy) {
  const dest = path.join(stagingDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(__dirname, file), dest);
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
