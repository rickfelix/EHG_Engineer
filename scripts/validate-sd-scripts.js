#!/usr/bin/env node

/**
 * Validate SD Creation Scripts for Required and Recommended Fields
 *
 * Checks all scripts that create Strategic Directives to ensure they include
 * proper fields based on the current strategic_directives_v2 schema.
 *
 * Required fields (from schema constraints):
 * - id, title, description, rationale, scope, category, priority, status
 *
 * Strongly Recommended fields (for LEO Protocol compliance):
 * - sd_key (unique identifier)
 * - target_application (EHG or EHG_engineer)
 * - current_phase (IDEATION, LEAD, PLAN, EXEC, etc.)
 * - phase_progress (0-100)
 * - progress (0-100)
 * - is_active (boolean)
 * - created_by, created_at, updated_at
 * - strategic_intent, strategic_objectives, success_criteria
 * - key_changes, key_principles
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Required fields (database NOT NULL constraints)
const REQUIRED_FIELDS = [
  'id',
  'title',
  'description',
  'rationale',
  'scope',
  'category',
  'priority',
  'status'
];

// Strongly recommended fields for LEO Protocol compliance
const RECOMMENDED_FIELDS = [
  'sd_key',
  'target_application',
  'current_phase',
  'strategic_intent',
  'strategic_objectives',
  'success_criteria',
  'key_changes',
  'key_principles',
  'created_by',
  'created_at',
  'updated_at'
];

// Optional but useful fields
const OPTIONAL_FIELDS = [
  'phase_progress',
  'progress',
  'is_active',
  'uuid_id',
  'version',
  'metadata',
  'dependencies',
  'risks',
  'success_metrics',
  'implementation_guidelines'
];

async function analyzeScript(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // Extract all field assignments within object literals
  // Look for patterns like: fieldName: value
  const fieldPattern = /(\w+):\s*(?:['"`]|{|\[|\d|true|false|null|new Date)/g;
  const matches = [...content.matchAll(fieldPattern)];
  const fieldsUsed = new Set(matches.map(m => m[1]));

  // Check for .insert() or .update() calls to identify SD creation
  const isSDCreationScript = content.includes('strategic_directives_v2') ||
                            content.includes('strategic_directives') ||
                            fileName.toLowerCase().includes('create-sd') ||
                            fileName.toLowerCase().includes('strategic-directive');

  if (!isSDCreationScript) {
    return null; // Skip non-SD scripts
  }

  const missing = {
    required: REQUIRED_FIELDS.filter(f => !fieldsUsed.has(f)),
    recommended: RECOMMENDED_FIELDS.filter(f => !fieldsUsed.has(f)),
    optional: OPTIONAL_FIELDS.filter(f => fieldsUsed.has(f))
  };

  return {
    filePath,
    fileName,
    fieldsUsed: Array.from(fieldsUsed).sort(),
    missing,
    hasIssues: missing.required.length > 0 || missing.recommended.length > 3
  };
}

async function findSDScripts() {
  const scriptsDir = path.join(__dirname);
  const files = await fs.readdir(scriptsDir);

  return files
    .filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'))
    .filter(f =>
      f.includes('create-sd-') ||
      f.includes('strategic-directive') ||
      f.includes('create-backend-') ||
      f.includes('create-reconnection-') ||
      f.includes('create-infrastructure-')
    )
    .map(f => path.join(scriptsDir, f));
}

async function main() {
  console.log('🔍 Validating SD Creation Scripts');
  console.log('=' .repeat(80));
  console.log();

  // Find all potential SD creation scripts
  const allFiles = await findSDScripts();

  console.log(`Found ${allFiles.length} potential SD creation scripts\n`);

  const results = [];
  for (const file of allFiles) {
    const analysis = await analyzeScript(file);
    if (analysis) {
      results.push(analysis);
    }
  }

  console.log(`Analyzed ${results.length} SD creation scripts\n`);
  console.log('=' .repeat(80));
  console.log();

  // Summary statistics
  const withIssues = results.filter(r => r.hasIssues);
  const withMissingRequired = results.filter(r => r.missing.required.length > 0);
  const withMissingRecommended = results.filter(r => r.missing.recommended.length > 0);

  console.log('📊 Summary:');
  console.log(`  Total scripts: ${results.length}`);
  console.log(`  Scripts with issues: ${withIssues.length}`);
  console.log(`  Missing required fields: ${withMissingRequired.length}`);
  console.log(`  Missing recommended fields: ${withMissingRecommended.length}`);
  console.log();

  // Detailed report
  if (withIssues.length > 0) {
    console.log('⚠️  Scripts with Issues:');
    console.log('=' .repeat(80));

    for (const result of withIssues) {
      console.log(`\n📄 ${result.fileName}`);
      console.log(`   Path: ${result.filePath}`);

      if (result.missing.required.length > 0) {
        console.log(`   ❌ Missing REQUIRED fields: ${result.missing.required.join(', ')}`);
      }

      if (result.missing.recommended.length > 0) {
        console.log(`   ⚠️  Missing recommended fields: ${result.missing.recommended.join(', ')}`);
      }

      console.log(`   ✅ Has ${result.fieldsUsed.length} fields total`);
    }
  }

  // Scripts that are good
  const goodScripts = results.filter(r => !r.hasIssues);
  if (goodScripts.length > 0) {
    console.log('\n\n✅ Scripts with Good Coverage:');
    console.log('=' .repeat(80));

    for (const result of goodScripts) {
      console.log(`\n📄 ${result.fileName}`);
      if (result.missing.recommended.length > 0) {
        console.log(`   Minor: Missing ${result.missing.recommended.length} recommended fields: ${result.missing.recommended.join(', ')}`);
      } else {
        console.log(`   Perfect: All recommended fields present`);
      }
    }
  }

  // Field usage statistics
  console.log('\n\n📈 Field Usage Statistics:');
  console.log('=' .repeat(80));

  const fieldCounts = {};
  const allFields = [...REQUIRED_FIELDS, ...RECOMMENDED_FIELDS, ...OPTIONAL_FIELDS];

  for (const field of allFields) {
    fieldCounts[field] = results.filter(r => r.fieldsUsed.includes(field)).length;
  }

  const sortedFields = Object.entries(fieldCounts)
    .sort((a, b) => b[1] - a[1]);

  console.log('\nField Name                    | Usage | Coverage');
  console.log('-'.repeat(60));

  for (const [field, count] of sortedFields) {
    const coverage = ((count / results.length) * 100).toFixed(0);
    const type = REQUIRED_FIELDS.includes(field) ? 'REQ' :
                RECOMMENDED_FIELDS.includes(field) ? 'REC' : 'OPT';
    const bar = '█'.repeat(Math.floor(coverage / 5));
    console.log(`${field.padEnd(28)} | ${type}   | ${coverage}% ${bar}`);
  }

  // Recommendations
  console.log('\n\n💡 Recommendations:');
  console.log('=' .repeat(80));
  console.log();

  if (withMissingRequired.length > 0) {
    console.log('1. CRITICAL: Fix scripts with missing required fields');
    console.log(`   Affected scripts: ${withMissingRequired.length}`);
    console.log('   Required fields ensure database constraints are met');
    console.log();
  }

  const missingTargetApp = results.filter(r => r.missing.recommended.includes('target_application'));
  if (missingTargetApp.length > 0) {
    console.log('2. HIGH: Add target_application field');
    console.log(`   Affected scripts: ${missingTargetApp.length}`);
    console.log('   Needed to distinguish EHG vs EHG_engineer implementations');
    console.log();
  }

  const missingSDKey = results.filter(r => r.missing.recommended.includes('sd_key'));
  if (missingSDKey.length > 0) {
    console.log('3. HIGH: Add sd_key field');
    console.log(`   Affected scripts: ${missingSDKey.length}`);
    console.log('   Needed for human-readable unique identification');
    console.log();
  }

  const missingPhase = results.filter(r => r.missing.recommended.includes('current_phase'));
  if (missingPhase.length > 0) {
    console.log('4. MEDIUM: Add current_phase field');
    console.log(`   Affected scripts: ${missingPhase.length}`);
    console.log('   Needed for LEO Protocol workflow tracking');
    console.log();
  }

  console.log('\n✅ Validation complete!');
  console.log(`\nNext steps:`);
  console.log(`1. Review scripts with missing required fields and update them`);
  console.log(`2. Add recommended fields to improve LEO Protocol compliance`);
  console.log(`3. Run this script again to verify improvements`);
}

main().catch(console.error);
