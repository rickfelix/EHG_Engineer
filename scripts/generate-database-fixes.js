#!/usr/bin/env node

/**
 * Generate Database Fix Scripts
 *
 * Creates SQL migration scripts to fix common validation issues
 * identified by comprehensive-database-validation.js
 *
 * Usage:
 *   node scripts/generate-database-fixes.js <fix-category>
 *
 * Categories:
 *   - invalid-status: Fix invalid status values
 *   - timestamps: Fix timestamp anomalies
 *   - orphaned: Clean up orphaned records
 *   - duplicates: Handle duplicate IDs
 *   - missing-fields: Set defaults for missing required fields
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// FIX GENERATORS
// ============================================================================

async function generateInvalidStatusFixes() {
  console.log('🔧 Generating invalid status fixes...\n');

  const sql = [];
  sql.push('-- Fix Invalid Status Values');
  sql.push('-- Generated: ' + new Date().toISOString());
  sql.push('');

  // Strategic Directives
  sql.push('-- Strategic Directives: Normalize invalid statuses to draft');
  sql.push('UPDATE strategic_directives_v2');
  sql.push('SET status = \'draft\'');
  sql.push('WHERE status NOT IN (\'draft\', \'active\', \'in_progress\', \'on_hold\', \'completed\', \'archived\', \'cancelled\');');
  sql.push('');

  // PRDs
  sql.push('-- Product Requirements: Normalize invalid statuses to draft');
  sql.push('UPDATE product_requirements_v2');
  sql.push('SET status = \'draft\'');
  sql.push('WHERE status NOT IN (\'draft\', \'in_review\', \'approved\', \'active\', \'completed\', \'archived\');');
  sql.push('');

  // User Stories
  sql.push('-- User Stories: Normalize invalid statuses to draft');
  sql.push('UPDATE user_stories');
  sql.push('SET status = \'draft\'');
  sql.push('WHERE status NOT IN (\'draft\', \'ready\', \'in_progress\', \'implemented\', \'verified\', \'archived\');');

  return sql.join('\n');
}

async function generateTimestampFixes() {
  console.log('🔧 Generating timestamp fixes...\n');

  const sql = [];
  sql.push('-- Fix Timestamp Anomalies');
  sql.push('-- Generated: ' + new Date().toISOString());
  sql.push('');

  sql.push('-- Fix future created_at dates');
  sql.push('UPDATE strategic_directives_v2');
  sql.push('SET created_at = NOW()');
  sql.push('WHERE created_at > NOW();');
  sql.push('');

  sql.push('UPDATE product_requirements_v2');
  sql.push('SET created_at = NOW()');
  sql.push('WHERE created_at > NOW();');
  sql.push('');

  sql.push('-- Fix created_at > updated_at');
  sql.push('UPDATE strategic_directives_v2');
  sql.push('SET updated_at = created_at');
  sql.push('WHERE created_at > updated_at;');
  sql.push('');

  sql.push('UPDATE product_requirements_v2');
  sql.push('SET updated_at = created_at');
  sql.push('WHERE created_at > updated_at;');

  return sql.join('\n');
}

async function generateOrphanedRecordCleanup() {
  console.log('🔧 Generating orphaned record cleanup...\n');

  const sql = [];
  sql.push('-- Clean Up Orphaned Records');
  sql.push('-- Generated: ' + new Date().toISOString());
  sql.push('-- WARNING: Review before executing - deletes orphaned data');
  sql.push('');

  sql.push('-- Delete handoffs for non-existent SDs');
  sql.push('DELETE FROM sd_phase_handoffs');
  sql.push('WHERE sd_id NOT IN (SELECT id FROM strategic_directives_v2);');
  sql.push('');

  sql.push('-- Delete user stories for non-existent PRDs');
  sql.push('-- Consider archiving instead of deleting');
  sql.push('-- UPDATE user_stories SET status = \'archived\' WHERE prd_id NOT IN (...);');
  sql.push('DELETE FROM user_stories');
  sql.push('WHERE prd_id NOT IN (SELECT id FROM product_requirements_v2);');

  return sql.join('\n');
}

async function generateInvalidPriorityFixes() {
  console.log('🔧 Generating invalid priority fixes...\n');

  const sql = [];
  sql.push('-- Fix Invalid Priority Values');
  sql.push('-- Generated: ' + new Date().toISOString());
  sql.push('');

  sql.push('-- Strategic Directives: Normalize invalid priorities to medium');
  sql.push('UPDATE strategic_directives_v2');
  sql.push('SET priority = \'medium\'');
  sql.push('WHERE priority NOT IN (\'critical\', \'high\', \'medium\', \'low\');');

  return sql.join('\n');
}

async function generateMissingFieldDefaults() {
  console.log('🔧 Generating missing field defaults...\n');

  const sql = [];
  sql.push('-- Set Defaults for Missing Required Fields');
  sql.push('-- Generated: ' + new Date().toISOString());
  sql.push('');

  sql.push('-- Strategic Directives: Generate titles from id');
  sql.push('UPDATE strategic_directives_v2');
  sql.push('SET title = CONCAT(\'Strategic Directive: \', id)');
  sql.push('WHERE title IS NULL OR title = \'\';');
  sql.push('');

  sql.push('-- Product Requirements: Generate titles from directive');
  sql.push('UPDATE product_requirements_v2 prd');
  sql.push('SET title = CONCAT(sd.title, \' - PRD\')');
  sql.push('FROM strategic_directives_v2 sd');
  sql.push('WHERE prd.directive_id = sd.id');
  sql.push('  AND (prd.title IS NULL OR prd.title = \'\');');

  return sql.join('\n');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const category = process.argv[2];

  if (!category) {
    console.log('Usage: node scripts/generate-database-fixes.js <category>');
    console.log('\nAvailable categories:');
    console.log('  invalid-status    - Fix invalid status values');
    console.log('  timestamps        - Fix timestamp anomalies');
    console.log('  orphaned          - Clean up orphaned records');
    console.log('  invalid-priority  - Fix invalid priority values');
    console.log('  missing-fields    - Set defaults for missing fields');
    console.log('  all               - Generate all fix scripts');
    console.log('\nExample:');
    console.log('  node scripts/generate-database-fixes.js invalid-status');
    process.exit(1);
  }

  const outputDir = path.join(__dirname, '..', 'migrations', 'fixes');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  try {
    let sqlContent = '';
    let filename = '';

    switch (category) {
      case 'invalid-status':
        sqlContent = await generateInvalidStatusFixes();
        filename = `${timestamp}_fix_invalid_status.sql`;
        break;

      case 'timestamps':
        sqlContent = await generateTimestampFixes();
        filename = `${timestamp}_fix_timestamps.sql`;
        break;

      case 'orphaned':
        sqlContent = await generateOrphanedRecordCleanup();
        filename = `${timestamp}_cleanup_orphaned.sql`;
        break;

      case 'invalid-priority':
        sqlContent = await generateInvalidPriorityFixes();
        filename = `${timestamp}_fix_invalid_priority.sql`;
        break;

      case 'missing-fields':
        sqlContent = await generateMissingFieldDefaults();
        filename = `${timestamp}_fix_missing_fields.sql`;
        break;

      case 'all':
        console.log('Generating all fix scripts...\n');
        const allFixes = [
          { name: 'invalid_status', fn: generateInvalidStatusFixes },
          { name: 'timestamps', fn: generateTimestampFixes },
          { name: 'orphaned', fn: generateOrphanedRecordCleanup },
          { name: 'invalid_priority', fn: generateInvalidPriorityFixes },
          { name: 'missing_fields', fn: generateMissingFieldDefaults }
        ];

        for (const fix of allFixes) {
          const content = await fix.fn();
          const file = path.join(outputDir, `${timestamp}_fix_${fix.name}.sql`);
          fs.writeFileSync(file, content, 'utf8');
          console.log(`✅ Generated: ${file}`);
        }

        console.log(`\n📁 All fix scripts saved to: ${outputDir}`);
        console.log('\n⚠️  REVIEW SCRIPTS BEFORE EXECUTING!');
        process.exit(0);
        return;

      default:
        console.error(`❌ Unknown category: ${category}`);
        process.exit(1);
    }

    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, sqlContent, 'utf8');

    console.log(`✅ Fix script generated: ${filepath}\n`);
    console.log('Preview:');
    console.log('─'.repeat(80));
    console.log(sqlContent);
    console.log('─'.repeat(80));
    console.log('\n⚠️  REVIEW BEFORE EXECUTING!');
    console.log('\nTo execute:');
    console.log('  1. Review the SQL carefully');
    console.log('  2. Execute via Supabase Dashboard SQL Editor');
    console.log(`  3. Or use: psql -f ${filepath}`);

  } catch (error) {
    console.error('❌ Error generating fix script:', error);
    process.exit(1);
  }
}

main();
