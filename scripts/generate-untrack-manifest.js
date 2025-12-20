#!/usr/bin/env node

/**
 * Generate Untrack Manifest
 *
 * Analyzes tracked files and generates a manifest of files that should be
 * untracked from git. Uses pattern matching and whitelist to ensure safety.
 *
 * Usage:
 *   npm run untrack:manifest              # Generate manifest
 *   npm run untrack:manifest -- --verbose # With detailed output
 *
 * Output: untrack-manifest.json
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Files that should NEVER be untracked (essential project files)
  whitelist: [
    // Package files
    'package.json',
    'package-lock.json',

    // Config files (any *.config.* pattern)
    /^[^/]+\.config\.(js|mjs|cjs|ts|json)$/,
    /^tsconfig.*\.json$/,

    // Essential dotfiles
    '.gitignore',
    '.nvmrc',
    '.node-version',
    '.env.example',

    // Documentation
    'README.md',
    /^CLAUDE.*\.md$/,
    'LICENSE',
    'CONTRIBUTING.md',

    // ESLint configs
    /^\.eslintrc.*$/,
    /^eslint\.config\.(js|mjs|cjs)$/,

    // Legitimate root-level config files
    '.claude-code-config.json',
    'leo-protocol-config.json',
    'dashboard-config.json',

    // Directories we want to keep
    /^\.husky\//,
    /^\.github\//,
    /^scripts\//,
    /^lib\//,
    /^src\//,
    /^docs\//,
    /^database\//,
    /^templates\//,
    /^tests\//,
    /^applications\//,

    // Legitimate root scripts (tracked intentionally)
    'fix-all-modules.js',
    'fix-module-system.js',
    'fix-shebangs.js'
  ],

  // Patterns that indicate a file should be untracked
  tempPatterns: [
    // One-off scripts at root level
    { pattern: /^[^/]+\.mjs$/, category: 'One-off .mjs script', rootOnly: true },
    { pattern: /^[^/]+\.cjs$/, category: 'One-off .cjs script', rootOnly: true },

    // Report files at root
    { pattern: /^[^/]*-report[^/]*\.json$/, category: 'Report JSON', rootOnly: true },
    { pattern: /^handoff-[^/]+\.json$/, category: 'Handoff artifact', rootOnly: true },
    { pattern: /^[^/]*-config\.json$/, category: 'Config artifact', rootOnly: true },

    // Analysis/debug scripts at root
    { pattern: /^analyze-[^/]+\.(js|mjs|cjs)$/, category: 'Analysis script', rootOnly: true },
    { pattern: /^check-[^/]+\.(js|mjs|cjs)$/, category: 'Check script', rootOnly: true },
    { pattern: /^create-[^/]+\.(js|mjs|cjs)$/, category: 'Creation script', rootOnly: true },
    { pattern: /^debug-[^/]+\.(js|mjs|cjs)$/, category: 'Debug script', rootOnly: true },
    { pattern: /^demo-[^/]+\.(js|mjs|cjs)$/, category: 'Demo script', rootOnly: true },
    { pattern: /^fetch-[^/]+\.(js|mjs|cjs)$/, category: 'Fetch script', rootOnly: true },
    { pattern: /^find-[^/]+\.(js|mjs|cjs)$/, category: 'Find script', rootOnly: true },
    { pattern: /^get-[^/]+\.(js|mjs|cjs)$/, category: 'Get script', rootOnly: true },
    { pattern: /^query-[^/]+\.(js|mjs|cjs)$/, category: 'Query script', rootOnly: true },
    { pattern: /^test-[^/]+\.(js|mjs|cjs)$/, category: 'Test script', rootOnly: true },
    { pattern: /^update-[^/]+\.(js|mjs|cjs)$/, category: 'Update script', rootOnly: true },
    { pattern: /^verify-[^/]+\.(js|mjs|cjs)$/, category: 'Verify script', rootOnly: true },
    { pattern: /^run-[^/]+\.(js|mjs|cjs)$/, category: 'Run script', rootOnly: true },
    { pattern: /^sync-[^/]+\.(js|mjs|cjs)$/, category: 'Sync script', rootOnly: true },
    { pattern: /^temp-[^/]+\.(js|mjs|cjs)$/, category: 'Temp script', rootOnly: true },
    { pattern: /^store-[^/]+\.(js|mjs|cjs)$/, category: 'Store script', rootOnly: true },
    { pattern: /^lead-[^/]+\.(js|mjs|cjs)$/, category: 'Lead script', rootOnly: true },
    { pattern: /^map-[^/]+\.(js|mjs|cjs)$/, category: 'Map script', rootOnly: true },
    { pattern: /^prepare-[^/]+\.(js|mjs|cjs)$/, category: 'Prepare script', rootOnly: true },
    { pattern: /^archive-[^/]+\.(js|mjs|cjs)$/, category: 'Archive script', rootOnly: true },
    { pattern: /^cancel-[^/]+\.(js|mjs|cjs)$/, category: 'Cancel script', rootOnly: true },
    { pattern: /^capture-[^/]+\.(js|mjs|cjs)$/, category: 'Capture script', rootOnly: true },
    { pattern: /^complete-[^/]+\.(js|mjs|cjs)$/, category: 'Complete script', rootOnly: true },
    { pattern: /^enhance-[^/]+\.(js|mjs|cjs)$/, category: 'Enhance script', rootOnly: true },
    { pattern: /^generate-[^/]+\.(js|mjs|cjs)$/, category: 'Generate script', rootOnly: true },
    { pattern: /^implement-[^/]+\.(js|mjs|cjs)$/, category: 'Implement script', rootOnly: true },
    { pattern: /^reconstruct-[^/]+\.(js|mjs|cjs)$/, category: 'Reconstruct script', rootOnly: true },
    { pattern: /^reject-[^/]+\.(js|mjs|cjs)$/, category: 'Reject script', rootOnly: true },
    { pattern: /^rollback-[^/]+\.(js|mjs|cjs)$/, category: 'Rollback script', rootOnly: true },
    { pattern: /^toggle-[^/]+\.(js|mjs|cjs)$/, category: 'Toggle script', rootOnly: true },

    // Screenshots at root
    { pattern: /^[^/]+\.png$/, category: 'Screenshot', rootOnly: true },

    // LEO artifacts at root
    { pattern: /^[^/]*_APPLIED\.md$/, category: 'Applied marker', rootOnly: true },
    { pattern: /^SD-[^/]+-README\.md$/, category: 'SD README', rootOnly: true },
    { pattern: /^[^/]*-quality-report\.md$/, category: 'Quality report', rootOnly: true },
    { pattern: /^[^/]*-stories-summary\.json$/, category: 'Stories summary', rootOnly: true },
    { pattern: /^credential-scan-results\.json$/, category: 'Scan results', rootOnly: true },

    // Misc temp files at root
    { pattern: /^[^/]*-progress\.json$/, category: 'Progress file', rootOnly: true },
    { pattern: /^[^/]*-metrics\.json$/, category: 'Metrics file', rootOnly: true },
    { pattern: /^compliance-[^/]+\.json$/, category: 'Compliance file', rootOnly: true },
    { pattern: /^cost-[^/]+\.json$/, category: 'Cost file', rootOnly: true },
    { pattern: /^dashboard-[^/]+\.json$/, category: 'Dashboard file', rootOnly: true },
    { pattern: /^database-[^/]+\.json$/, category: 'Database export', rootOnly: true },
    { pattern: /^design-[^/]+\.json$/, category: 'Design file', rootOnly: true },
    { pattern: /^directive-[^/]+\.json$/, category: 'Directive file', rootOnly: true },
    { pattern: /^documentation-[^/]+\.json$/, category: 'Doc file', rootOnly: true },
    { pattern: /^security-[^/]+\.json$/, category: 'Security file', rootOnly: true },
    { pattern: /^verification-[^/]+\.json$/, category: 'Verification file', rootOnly: true }
  ]
};

// ============================================================================
// FUNCTIONS
// ============================================================================

function isWhitelisted(filePath) {
  for (const entry of CONFIG.whitelist) {
    if (typeof entry === 'string') {
      if (filePath === entry) return true;
    } else if (entry instanceof RegExp) {
      if (entry.test(filePath)) return true;
    }
  }
  return false;
}

function isRootLevel(filePath) {
  return !filePath.includes('/');
}

function matchesTempPattern(filePath) {
  for (const { pattern, category, rootOnly } of CONFIG.tempPatterns) {
    if (rootOnly && !isRootLevel(filePath)) continue;
    if (pattern.test(filePath)) {
      return { match: true, category };
    }
  }
  return { match: false, category: null };
}

function getFileStats(filePath) {
  try {
    const fullPath = path.join(PROJECT_ROOT, filePath);
    const stats = fs.statSync(fullPath);
    return {
      size: stats.size,
      lastModified: stats.mtime.toISOString()
    };
  } catch {
    return { size: 0, lastModified: null };
  }
}

function getTrackedFiles() {
  try {
    const output = execSync('git ls-files', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024  // 10MB buffer
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to get tracked files:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('='.repeat(60));
  console.log('UNTRACK MANIFEST GENERATOR');
  console.log('='.repeat(60));
  console.log('');

  const trackedFiles = getTrackedFiles();
  console.log(`Total tracked files: ${trackedFiles.length}`);

  const toUntrack = [];
  const whitelisted = [];
  const categoryCounts = {};

  for (const filePath of trackedFiles) {
    // Skip if whitelisted
    if (isWhitelisted(filePath)) {
      if (VERBOSE) {
        whitelisted.push({ path: filePath, reason: 'Whitelisted' });
      }
      continue;
    }

    // Check if matches temp pattern
    const { match, category } = matchesTempPattern(filePath);
    if (match) {
      const stats = getFileStats(filePath);
      toUntrack.push({
        path: filePath,
        reason: category,
        size: stats.size,
        lastModified: stats.lastModified
      });
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  }

  // Sort by category then path
  toUntrack.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason.localeCompare(b.reason);
    return a.path.localeCompare(b.path);
  });

  // Build manifest
  const manifest = {
    generated_at: new Date().toISOString(),
    summary: {
      total_tracked: trackedFiles.length,
      to_untrack: toUntrack.length,
      whitelisted: whitelisted.length,
      by_category: categoryCounts
    },
    files_to_untrack: toUntrack,
    files_whitelisted: VERBOSE ? whitelisted : []
  };

  // Write manifest
  const manifestPath = path.join(PROJECT_ROOT, 'untrack-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Summary output
  console.log('');
  console.log('-'.repeat(60));
  console.log('SUMMARY');
  console.log('-'.repeat(60));
  console.log(`Files to untrack: ${toUntrack.length}`);
  console.log('');

  if (Object.keys(categoryCounts).length > 0) {
    console.log('By category:');
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1]);
    for (const [category, count] of sortedCategories) {
      console.log(`  ${category}: ${count}`);
    }
  }

  console.log('');
  console.log('Manifest written to: untrack-manifest.json');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the manifest: cat untrack-manifest.json | jq .');
  console.log('  2. Execute untracking: npm run untrack:execute --force');
  console.log('');
  console.log('='.repeat(60));
}

main();
