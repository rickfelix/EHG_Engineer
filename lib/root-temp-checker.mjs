/**
 * Root Temp File Checker
 *
 * Lightweight utility to check for accumulated temp files at repo root.
 * Used by sd-next.js for non-blocking warnings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Patterns for temp files
const TEMP_PATTERNS = [
  /^[^/]+\.mjs$/,           // One-off .mjs scripts
  /^[^/]+\.cjs$/,           // One-off .cjs scripts
  /^[^/]*-report[^/]*\.json$/,  // Report files
  /^handoff-[^/]+\.json$/,  // Handoff artifacts
  /^[^/]+\.png$/,           // Screenshots
];

// Files to never count as temp (even if they match patterns)
const WHITELIST = [
  /\.config\.(js|mjs|cjs)$/,  // Config files
  'package.json',
  'package-lock.json',
  '.claude-code-config.json',
  'leo-protocol-config.json',
  'dashboard-config.json',
];

function isWhitelisted(filename) {
  for (const entry of WHITELIST) {
    if (typeof entry === 'string' && filename === entry) return true;
    if (entry instanceof RegExp && entry.test(filename)) return true;
  }
  return false;
}

function isTempFile(filename) {
  if (isWhitelisted(filename)) return false;

  for (const pattern of TEMP_PATTERNS) {
    if (pattern.test(filename)) return true;
  }
  return false;
}

/**
 * Count temp files at repository root
 * @returns {Promise<{count: number, files: string[]}>}
 */
export async function checkRootTempFiles() {
  try {
    const entries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
    const tempFiles = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (isTempFile(entry.name)) {
        tempFiles.push(entry.name);
      }
    }

    return {
      count: tempFiles.length,
      files: tempFiles
    };
  } catch (error) {
    console.error('Error checking root temp files:', error.message);
    return { count: 0, files: [] };
  }
}

/**
 * Display temp file warning if threshold exceeded
 * @param {number} threshold - Number of files to trigger warning (default 10)
 */
export async function warnIfTempFilesExceedThreshold(threshold = 10) {
  const { count, files } = await checkRootTempFiles();

  if (count > threshold) {
    console.log('');
    console.log(`⚠️  ${count} temp files at repository root`);
    console.log('   Run: npm run leo:cleanup:root');
    console.log('');
    return true;
  }

  return false;
}

// Allow running as CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { count, files } = await checkRootTempFiles();
  console.log(`Root temp files: ${count}`);
  if (count > 0 && process.argv.includes('--verbose')) {
    files.forEach(f => console.log(`  - ${f}`));
  }
}
