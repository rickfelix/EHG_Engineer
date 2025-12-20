#!/usr/bin/env node

/**
 * Root Temp File Cleaner
 *
 * Safely removes accumulated temp files from project root.
 * Part of LEO Protocol workflow hygiene.
 *
 * Usage:
 *   npm run leo:cleanup:root           # Dry run (default)
 *   npm run leo:cleanup:root:force     # Actually delete
 *
 * Safety features:
 * - Whitelist of known legitimate root files
 * - Dry-run mode by default
 * - Detailed logging
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Configuration
const CONFIG = {
  dryRun: !process.argv.includes('--force'),
  verbose: process.argv.includes('--verbose'),

  // Whitelisted root-level files (never delete)
  whitelist: [
    // Config files
    'jest.config.cjs',
    'eslint.config.js',
    'eslint.config.mjs',
    'playwright.config.js',
    'playwright-ehg.config.js',
    'playwright-uat.config.js',
    'vitest.config.js',
    'tailwind.config.js',
    'postcss.config.js',
    'commitlint.config.js',
    'tsconfig.json',
    // Essential files
    'package.json',
    'package-lock.json',
    '.gitignore',
    'README.md',
    'CLAUDE.md',
    'CLAUDE_CORE.md',
    'CLAUDE_LEAD.md',
    'CLAUDE_PLAN.md',
    'CLAUDE_EXEC.md',
    '.nvmrc',
    '.node-version',
    // Tracked utility scripts
    'fix-all-modules.js',
    'fix-module-system.js',
    'fix-shebangs.js',
    'audit_rls.js'
  ],

  // Temp file patterns to clean
  tempPatterns: [
    { pattern: /_APPLIED\.md$/, description: 'Applied markers' },
    { pattern: /-quality-report\.md$/, description: 'Quality reports' },
    { pattern: /-stories-summary\.json$/, description: 'Story summaries' },
    { pattern: /^credential-scan-results\.json$/, description: 'Scan results' },
    { pattern: /^SD-.*-README\.md$/, description: 'SD READMEs' },
    { pattern: /^SD-.*-database-analysis\.md$/, description: 'DB analysis' }
  ]
};

// Statistics
const stats = {
  scanned: 0,
  matched: 0,
  deleted: 0,
  byType: {}
};

function isTempFile(filename) {
  // Never delete whitelisted files
  if (CONFIG.whitelist.includes(filename)) {
    return null;
  }

  // Check against temp patterns
  for (const { pattern, description } of CONFIG.tempPatterns) {
    if (pattern.test(filename)) {
      return { description };
    }
  }

  return null;
}

function scanAndClean() {
  console.log('='.repeat(60));
  console.log('LEO Root Temp File Cleaner');
  console.log('='.repeat(60));
  console.log(`Mode: ${CONFIG.dryRun ? 'DRY-RUN (use --force to delete)' : 'FORCE DELETE'}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log('');

  // Read root directory
  const entries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });

  for (const entry of entries) {
    // Only check files, not directories
    if (!entry.isFile()) continue;

    stats.scanned++;
    const filePath = path.join(PROJECT_ROOT, entry.name);
    const tempInfo = isTempFile(entry.name);

    if (!tempInfo) continue;

    stats.matched++;
    stats.byType[tempInfo.description] = (stats.byType[tempInfo.description] || 0) + 1;

    if (CONFIG.dryRun) {
      console.log(`  [DRY-RUN] Would delete: ${entry.name} (${tempInfo.description})`);
    } else {
      try {
        fs.unlinkSync(filePath);
        console.log(`  DELETED: ${entry.name}`);
        stats.deleted++;
      } catch (err) {
        console.error(`  ERROR: ${entry.name} - ${err.message}`);
      }
    }
  }

  // Also check temp directories
  const tempDirs = ['sub-agents', 'validation'];
  for (const dirName of tempDirs) {
    const dirPath = path.join(PROJECT_ROOT, dirName);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      stats.matched++;
      if (CONFIG.dryRun) {
        console.log(`  [DRY-RUN] Would delete directory: ${dirName}/`);
      } else {
        try {
          fs.rmSync(dirPath, { recursive: true });
          console.log(`  DELETED: ${dirName}/`);
          stats.deleted++;
        } catch (err) {
          console.error(`  ERROR: ${dirName}/ - ${err.message}`);
        }
      }
    }
  }

  // Summary
  console.log('');
  console.log('-'.repeat(60));
  console.log('Summary');
  console.log('-'.repeat(60));
  console.log(`Files scanned:    ${stats.scanned}`);
  console.log(`Temp files found: ${stats.matched}`);
  console.log(`Deleted:          ${stats.deleted}`);
  console.log('');

  if (Object.keys(stats.byType).length > 0) {
    console.log('By type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  if (CONFIG.dryRun && stats.matched > 0) {
    console.log('');
    console.log('Run with --force to actually delete these files.');
  }

  console.log('='.repeat(60));
}

scanAndClean();
