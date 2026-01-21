#!/usr/bin/env node
/**
 * Scan codebase for files exceeding a LOC threshold
 * Usage: node scripts/scan-large-files.js [threshold] [--all]
 * Default threshold: 1000
 * --all: Include archive/deprecated files
 */

import fs from 'fs';
import path from 'path';

const threshold = parseInt(process.argv[2]) || 1000;
const includeAll = process.argv.includes('--all');

const excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'];
if (!includeAll) {
  excludeDirs.push('archive', '_deprecated', 'docs/archive');
}

// Patterns for one-off scripts that don't need refactoring
const excludePatterns = includeAll ? [] : [
  /\.bundle\./,
  /create-.*-sds/,
  /add-user-stories-/,
  /create-prd-sd-/
];

const extensions = ['.js', '.ts', '.tsx', '.jsx', '.mjs'];

function scanDir(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('_')) {
          scanDir(fullPath, results);
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        // Skip files matching exclusion patterns
        if (excludePatterns.some(p => p.test(entry.name))) continue;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          if (lines > threshold) {
            results.push({ path: fullPath, lines });
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  } catch (e) {
    // Skip unreadable directories
  }
  return results;
}

console.log(`\nScanning for files with >${threshold} LOC...`);
if (!includeAll) {
  console.log('(excluding archive/deprecated/one-off scripts - use --all to include)\n');
} else {
  console.log('(including all files)\n');
}
console.log('═'.repeat(70));

const results = scanDir('.');
results.sort((a, b) => b.lines - a.lines);

if (results.length === 0) {
  console.log('\n  ✅ No files found with >' + threshold + ' lines of code!\n');
} else {
  console.log('');
  results.forEach((f, i) => {
    const relativePath = f.path.replace(/\\/g, '/');
    console.log(`${String(i + 1).padStart(2)}. ${String(f.lines).padStart(5)} lines: ${relativePath}`);
  });
  console.log('');
  console.log('─'.repeat(70));
  console.log(`Total: ${results.length} files exceeding ${threshold} LOC`);
  console.log(`Combined: ${results.reduce((sum, f) => sum + f.lines, 0).toLocaleString()} lines`);
}
