#!/usr/bin/env node

/**
 * Automated SD Script Field Fixer
 *
 * This script helps fix SD creation scripts by adding missing required
 * and recommended fields based on the strategic_directives_v2 schema.
 *
 * Usage:
 *   node scripts/fix-sd-scripts.js --script <script-name> [--dry-run]
 *   node scripts/fix-sd-scripts.js --all [--dry-run]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_VALUES = {
  // Required fields with sensible defaults
  rationale: 'FIXME: Add rationale explaining why this SD is necessary',
  scope: 'FIXME: Define what is included and excluded from this SD',

  // Recommended fields
  sd_key: (sdId) => sdId, // Use id as default sd_key
  target_application: 'FIXME: Set to "EHG" or "EHG_engineer"',
  current_phase: 'IDEATION',
  strategic_intent: 'FIXME: Add high-level strategic goal',
  key_principles: [
    'Database-first approach',
    'Comprehensive testing required',
    'User experience paramount'
  ],
  created_by: 'SYSTEM',
  created_at: 'new Date().toISOString()',
  updated_at: 'new Date().toISOString()'
};

/**
 * Analyzes an SD object definition in source code to find missing fields
 */
function analyzeSDObject(content, objectStart) {
  const fields = new Set();

  // Extract object literal content
  let braceCount = 1;
  let current = objectStart + 1;
  let objectContent = '';

  while (braceCount > 0 && current < content.length) {
    const char = content[current];
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (braceCount > 0) objectContent += char;
    current++;
  }

  // Find all field assignments
  const fieldPattern = /(\w+):\s*(?:['"`]|{|\[|\d|true|false|null|new Date)/g;
  const matches = [...objectContent.matchAll(fieldPattern)];
  matches.forEach(m => fields.add(m[1]));

  return {
    fields: Array.from(fields),
    objectStart,
    objectEnd: current,
    objectContent
  };
}

/**
 * Generates field addition code
 */
function generateFieldAddition(field, value, indent = '    ') {
  if (typeof value === 'string') {
    if (value.startsWith('new Date') || value === 'true' || value === 'false') {
      return `${indent}${field}: ${value},`;
    }
    return `${indent}${field}: '${value}',`;
  } else if (Array.isArray(value)) {
    const items = value.map(v => `'${v}'`).join(', ');
    return `${indent}${field}: [${items}],`;
  } else if (typeof value === 'object') {
    return `${indent}${field}: ${JSON.stringify(value, null, 2).split('\n').join('\n' + indent)},`;
  }
  return `${indent}${field}: ${value},`;
}

/**
 * Adds missing fields to an SD object in the source code
 */
function addMissingFields(content, sdId) {
  const REQUIRED = ['id', 'title', 'description', 'rationale', 'scope', 'category', 'priority', 'status'];
  const RECOMMENDED = ['sd_key', 'target_application', 'current_phase', 'strategic_intent',
                      'strategic_objectives', 'success_criteria', 'key_changes', 'key_principles',
                      'created_by', 'created_at', 'updated_at'];

  // Find SD object definitions
  const sdObjectPattern = /{\s*id:\s*['"]SD-[^'"]+['"]/g;
  const matches = [...content.matchAll(sdObjectPattern)];

  if (matches.length === 0) {
    console.log('  ⚠️  No SD object definitions found');
    return content;
  }

  let modified = content;
  let offset = 0;

  for (const match of matches) {
    const objectStart = match.index + offset;
    const analysis = analyzeSDObject(modified, objectStart);
    const existingFields = new Set(analysis.fields);

    // Determine missing fields
    const missingRequired = REQUIRED.filter(f => !existingFields.has(f));
    const missingRecommended = RECOMMENDED.filter(f => !existingFields.has(f));

    if (missingRequired.length === 0 && missingRecommended.length === 0) {
      console.log('  ✅ All fields present');
      continue;
    }

    console.log(`  Missing required: ${missingRequired.join(', ') || 'none'}`);
    console.log(`  Missing recommended: ${missingRecommended.join(', ') || 'none'}`);

    // Build additions
    let additions = '\n    // ===== ADDED BY FIX SCRIPT =====\n';

    // Add required fields
    for (const field of missingRequired) {
      const value = DEFAULT_VALUES[field] || `FIXME: Add ${field}`;
      additions += generateFieldAddition(field, value);
      additions += '\n';
    }

    // Add recommended fields
    if (missingRecommended.length > 0) {
      additions += '\n    // Recommended fields for LEO Protocol\n';
      for (const field of missingRecommended) {
        let value = DEFAULT_VALUES[field];
        if (field === 'sd_key' && typeof value === 'function') {
          value = value(sdId);
        }
        if (value) {
          additions += generateFieldAddition(field, value);
          additions += '\n';
        }
      }
    }

    additions += '    // ===== END ADDITIONS =====\n';

    // Insert additions before closing brace
    const insertPosition = analysis.objectEnd - 1 + offset;
    modified = modified.slice(0, insertPosition) + additions + modified.slice(insertPosition);
    offset += additions.length;
  }

  return modified;
}

/**
 * Fixes a single script file
 */
async function fixScript(scriptPath, dryRun = false) {
  const fileName = path.basename(scriptPath);
  console.log(`\n📄 Processing: ${fileName}`);

  try {
    // Read original content
    const original = await fs.readFile(scriptPath, 'utf-8');

    // Extract SD ID if present
    const sdIdMatch = original.match(/id:\s*['"]SD-([^'"]+)['"]/);
    const sdId = sdIdMatch ? `SD-${sdIdMatch[1]}` : 'UNKNOWN';

    // Apply fixes
    const modified = addMissingFields(original, sdId);

    if (modified === original) {
      console.log('  ℹ️  No changes needed');
      return { changed: false };
    }

    if (dryRun) {
      console.log('  🔍 DRY RUN - Would modify file');
      // Show diff stats
      const originalLines = original.split('\n').length;
      const modifiedLines = modified.split('\n').length;
      console.log(`  📊 Would add ${modifiedLines - originalLines} lines`);
      return { changed: true, dryRun: true };
    }

    // Backup original
    const backupPath = `${scriptPath}.backup`;
    await fs.writeFile(backupPath, original);
    console.log(`  💾 Backup created: ${backupPath}`);

    // Write modified
    await fs.writeFile(scriptPath, modified);
    console.log('  ✅ File updated successfully');

    return { changed: true, dryRun: false };

  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const scriptArg = args.find(a => a.startsWith('--script='));
  const fixAll = args.includes('--all');

  console.log('🔧 SD Script Field Fixer');
  console.log('========================\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  if (!scriptArg && !fixAll) {
    console.log('Usage:');
    console.log('  node scripts/fix-sd-scripts.js --script=<script-name> [--dry-run]');
    console.log('  node scripts/fix-sd-scripts.js --all [--dry-run]');
    console.log('\nExamples:');
    console.log('  node scripts/fix-sd-scripts.js --script=create-infrastructure-quality-sds.js');
    console.log('  node scripts/fix-sd-scripts.js --all --dry-run');
    process.exit(1);
  }

  let scriptsToFix = [];

  if (fixAll) {
    // Find all SD creation scripts
    const files = await fs.readdir(__dirname);
    scriptsToFix = files
      .filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'))
      .filter(f =>
        f.includes('create-sd-') ||
        f.includes('strategic-directive') ||
        f.includes('create-infrastructure-') ||
        f.includes('create-backend-')
      )
      .map(f => path.join(__dirname, f));

    console.log(`Found ${scriptsToFix.length} scripts to process\n`);
  } else {
    const scriptName = scriptArg.split('=')[1];
    scriptsToFix = [path.join(__dirname, scriptName)];
  }

  // Process scripts
  const results = {
    total: 0,
    changed: 0,
    unchanged: 0,
    errors: 0
  };

  for (const scriptPath of scriptsToFix) {
    results.total++;
    const result = await fixScript(scriptPath, dryRun);

    if (result.error) {
      results.errors++;
    } else if (result.changed) {
      results.changed++;
    } else {
      results.unchanged++;
    }
  }

  // Summary
  console.log('\n\n📊 Summary');
  console.log('==========');
  console.log(`Total scripts processed: ${results.total}`);
  console.log(`Scripts modified: ${results.changed}`);
  console.log(`Scripts unchanged: ${results.unchanged}`);
  console.log(`Errors: ${results.errors}`);

  if (results.changed > 0 && !dryRun) {
    console.log('\n✅ Files updated successfully!');
    console.log('💡 Backups created with .backup extension');
    console.log('⚠️  Review FIXME comments and update with actual values');
    console.log('🔍 Run validation again: node scripts/validate-sd-scripts.js');
  } else if (dryRun) {
    console.log('\n🔍 Dry run complete. Use without --dry-run to apply changes.');
  }
}

main().catch(console.error);
