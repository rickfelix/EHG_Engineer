#!/usr/bin/env node

/**
 * Story-Test Mapping Validator
 *
 * SD: SD-E2E-STORY-MAPPING-001
 * Purpose: Validate that E2E tests have proper user story annotations
 *
 * Usage:
 *   node scripts/validate-story-test-mapping.js [--verbose] [--fix]
 *
 * Options:
 *   --verbose  Show detailed output for each test file
 *   --fix      Generate template annotations for unmapped tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const E2E_DIR = path.join(__dirname, '..', 'tests', 'e2e');
const MAPPING_FILE = path.join(E2E_DIR, 'story-test-mapping.json');

// Recursive file finder for spec files
function findSpecFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findSpecFiles(fullPath, files);
    } else if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.spec.js')) {
      files.push(path.relative(E2E_DIR, fullPath));
    }
  }
  return files;
}

// Patterns to detect user story references
const STORY_PATTERNS = [
  /User Story: (US-[\w-]+)/,
  /\* US-[\w-]+/,
  /Story(?:Id)?:\s*["']?(US-[\w-]+)["']?/i,
  /@story\s+(US-[\w-]+)/i,
  /testInfo\.annotations\.push.*story.*["'](US-|SD-)[\w-]+["']/
];

// Alternative patterns (domain-specific prefixes)
const DOMAIN_PREFIXES = ['BKS-', 'VLC-', 'MEM-', 'AGT-', 'STM-'];

async function validateMapping() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const fix = args.includes('--fix');

  console.log('\n📊 STORY-TEST MAPPING VALIDATOR');
  console.log('=' .repeat(60));
  console.log('   SD: SD-E2E-STORY-MAPPING-001');
  console.log(`   E2E Directory: ${E2E_DIR}`);
  console.log('=' .repeat(60));

  // Find all E2E test files
  const testFiles = findSpecFiles(E2E_DIR);

  let mapped = 0;
  let unmapped = 0;
  const unmappedFiles = [];
  const mappedDetails = [];

  for (const testFile of testFiles) {
    const fullPath = path.join(E2E_DIR, testFile);
    const content = fs.readFileSync(fullPath, 'utf-8');

    let hasStoryReference = false;
    let storyId = null;

    // Check for standard US-XXX patterns
    for (const pattern of STORY_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        hasStoryReference = true;
        storyId = match[1] || match[0];
        break;
      }
    }

    // Check for domain-specific prefixes
    if (!hasStoryReference) {
      for (const prefix of DOMAIN_PREFIXES) {
        if (content.includes(prefix)) {
          hasStoryReference = true;
          storyId = `${prefix}*`;
          break;
        }
      }
    }

    if (hasStoryReference) {
      mapped++;
      mappedDetails.push({ file: testFile, storyId });
      if (verbose) {
        console.log(`   ✅ ${testFile} → ${storyId}`);
      }
    } else {
      unmapped++;
      unmappedFiles.push(testFile);
      if (verbose) {
        console.log(`   ❌ ${testFile} → NO STORY REFERENCE`);
      }
    }
  }

  // Summary
  console.log('\n📈 MAPPING SUMMARY');
  console.log('-'.repeat(60));
  console.log(`   Total test files:    ${testFiles.length}`);
  console.log(`   Mapped to stories:   ${mapped} (${((mapped/testFiles.length)*100).toFixed(1)}%)`);
  console.log(`   Unmapped:            ${unmapped} (${((unmapped/testFiles.length)*100).toFixed(1)}%)`);

  // Unmapped files list
  if (unmappedFiles.length > 0) {
    console.log('\n⚠️  UNMAPPED TEST FILES');
    console.log('-'.repeat(60));
    for (const file of unmappedFiles) {
      console.log(`   • ${file}`);
    }
  }

  // Generate fix templates if requested
  if (fix && unmappedFiles.length > 0) {
    console.log('\n🔧 GENERATING FIX TEMPLATES');
    console.log('-'.repeat(60));
    console.log('   Add this to the top of each unmapped test file:\n');

    for (const file of unmappedFiles.slice(0, 5)) { // Show first 5
      const basename = path.basename(file, path.extname(file));
      const storyId = `US-${basename.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 20)}`;
      console.log(`   // File: ${file}`);
      console.log('   /**');
      console.log(`    * ${basename} E2E Tests`);
      console.log('    *');
      console.log(`    * User Story: ${storyId}`);
      console.log('    * Strategic Directive: SD-XXX');
      console.log('    */');
      console.log('');
    }

    if (unmappedFiles.length > 5) {
      console.log(`   ... and ${unmappedFiles.length - 5} more files`);
    }
  }

  // Update mapping file statistics
  if (fs.existsSync(MAPPING_FILE)) {
    const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
    mapping.statistics = {
      totalTestFiles: testFiles.length,
      mappedFiles: mapped,
      unmappedFiles: unmapped,
      coveragePercentage: parseFloat(((mapped/testFiles.length)*100).toFixed(1)),
      lastValidated: new Date().toISOString()
    };
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
    console.log('\n📁 Updated story-test-mapping.json statistics');
  }

  // Verdict
  console.log('\n' + '='.repeat(60));
  const coverageThreshold = 50; // 50% minimum coverage
  const coverage = (mapped/testFiles.length)*100;

  if (coverage >= coverageThreshold) {
    console.log(`✅ PASS: Story mapping coverage ${coverage.toFixed(1)}% >= ${coverageThreshold}% threshold`);
    process.exit(0);
  } else {
    console.log(`⚠️  WARNING: Story mapping coverage ${coverage.toFixed(1)}% < ${coverageThreshold}% threshold`);
    console.log('   Run with --fix to generate annotation templates');
    console.log('   Run with --verbose to see all files');
    process.exit(0); // Non-blocking for now
  }
}

validateMapping().catch(error => {
  console.error('Error validating mapping:', error);
  process.exit(1);
});
