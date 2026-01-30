#!/usr/bin/env node
/**
 * JSONB Field Integrity Check
 *
 * Validates that JSONB columns in strategic_directives_v2 contain proper arrays,
 * not stringified JSON, and that required fields are populated.
 *
 * Root Cause Fix: PAT-JSONB-STRING-TYPE (RCA 2026-01-30)
 *
 * Usage:
 *   node scripts/check-jsonb-integrity.js           # Check only
 *   node scripts/check-jsonb-integrity.js --fix     # Check and fix issues
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FIX_MODE = process.argv.includes('--fix');

// Fields to check (JSONB array fields)
const JSONB_FIELDS = [
  'success_criteria',
  'success_metrics',
  'key_principles',
  'key_changes',
  'strategic_objectives',
  'dependencies',
  'risks'
];

// Default values for fixing empty arrays
const DEFAULTS = {
  key_principles: [
    'Follow LEO Protocol for all changes',
    'Ensure backward compatibility',
    'Database-first: All data in database, not markdown files'
  ],
  success_metrics: [
    { metric: 'Work completed per SD scope', target: 'Pass', type: 'completion' }
  ],
  success_criteria: [
    { criterion: 'SD scope completed', measure: 'All tasks done' }
  ]
};

async function checkIntegrity() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  JSONB FIELD INTEGRITY CHECK');
  console.log('  Root Cause Fix: PAT-JSONB-STRING-TYPE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Mode: ${FIX_MODE ? '🔧 FIX' : '🔍 CHECK ONLY'}`);
  console.log('');

  // Fetch all active SDs
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select(`id, title, status, ${JSONB_FIELDS.join(', ')}`)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching SDs:', error.message);
    process.exit(1);
  }

  console.log(`Checking ${sds.length} active SDs...\n`);

  // Group issues by SD for batch fixing
  const sdIssues = new Map(); // sdId -> { stringFields: {field: value}, emptyFields: [field] }
  let totalStringIssues = 0;
  let totalEmptyIssues = 0;

  for (const sd of sds) {
    const issues = { stringFields: {}, emptyFields: [] };

    for (const field of JSONB_FIELDS) {
      const value = sd[field];

      // Check if stored as string (should be array/object)
      if (typeof value === 'string') {
        issues.stringFields[field] = value;
        totalStringIssues++;
      }

      // Check for empty arrays on constrained fields (constraint applies to ALL statuses)
      // Need to heal these before any update can succeed
      if (Array.isArray(value) && value.length === 0) {
        if (['success_metrics', 'success_criteria', 'key_principles'].includes(field)) {
          issues.emptyFields.push(field);
          totalEmptyIssues++;
        }
      }
    }

    if (Object.keys(issues.stringFields).length > 0 || issues.emptyFields.length > 0) {
      sdIssues.set(sd.id, { ...issues, title: sd.title, status: sd.status });
    }
  }

  // Report findings
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FINDINGS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  console.log(`📛 STRING TYPE ISSUES: ${totalStringIssues} fields across ${[...sdIssues.values()].filter(i => Object.keys(i.stringFields).length > 0).length} SDs`);
  console.log(`⚠️  EMPTY ARRAY ISSUES: ${totalEmptyIssues} fields across ${[...sdIssues.values()].filter(i => i.emptyFields.length > 0).length} SDs`);
  console.log('');

  // Show sample of affected SDs
  let shown = 0;
  for (const [sdId, issues] of sdIssues) {
    if (shown >= 5) {
      console.log(`   ... and ${sdIssues.size - 5} more SDs`);
      break;
    }
    const stringCount = Object.keys(issues.stringFields).length;
    const emptyCount = issues.emptyFields.length;
    console.log(`   - ${sdId}: ${stringCount} string, ${emptyCount} empty`);
    shown++;
  }
  console.log('');

  // Summary
  const totalIssues = totalStringIssues + totalEmptyIssues;
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${totalIssues} issue(s) in ${sdIssues.size} SD(s)`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (totalIssues === 0) {
    console.log('✅ All JSONB fields have correct types!');
    return;
  }

  // Fix mode - batch all fixes per SD
  if (FIX_MODE && totalIssues > 0) {
    console.log('');
    console.log('🔧 FIXING ISSUES (batch per SD)...');
    console.log('');

    let fixedSDs = 0;
    let fixedFields = 0;
    let failedSDs = 0;

    for (const [sdId, issues] of sdIssues) {
      const updates = {};
      let fieldsFix = 0;

      // Convert all string fields to arrays
      for (const [field, value] of Object.entries(issues.stringFields)) {
        try {
          const parsed = JSON.parse(value);
          let finalValue = Array.isArray(parsed) ? parsed : [parsed];

          // If parsed to empty array and we have a default, use the default
          // This handles stringified empty arrays like "[]"
          if (Array.isArray(finalValue) && finalValue.length === 0 && DEFAULTS[field]) {
            finalValue = DEFAULTS[field];
          }

          updates[field] = finalValue;
          fieldsFix++;
        } catch (_parseError) {
          // If we can't parse but have a default, use the default
          if (DEFAULTS[field]) {
            updates[field] = DEFAULTS[field];
            fieldsFix++;
          } else {
            console.log(`   ⚠️  ${sdId}.${field}: Parse error (skipped)`);
          }
        }
      }

      // Apply defaults for empty arrays
      for (const field of issues.emptyFields) {
        if (DEFAULTS[field]) {
          updates[field] = DEFAULTS[field];
          fieldsFix++;
        }
      }

      if (Object.keys(updates).length === 0) continue;

      // Single atomic update per SD
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update(updates)
        .eq('id', sdId);

      if (updateError) {
        console.log(`   ❌ ${sdId}: ${updateError.message}`);
        failedSDs++;
      } else {
        console.log(`   ✅ ${sdId}: Fixed ${fieldsFix} field(s)`);
        fixedSDs++;
        fixedFields += fieldsFix;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  RESULT: ${fixedSDs} SDs fixed (${fixedFields} fields), ${failedSDs} failed`);
    console.log('═══════════════════════════════════════════════════════════════');
  } else if (totalIssues > 0) {
    console.log('');
    console.log('💡 Run with --fix to automatically repair issues:');
    console.log('   node scripts/check-jsonb-integrity.js --fix');
  }
}

checkIntegrity().catch(console.error);
