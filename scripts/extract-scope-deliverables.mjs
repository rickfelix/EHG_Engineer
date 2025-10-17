#!/usr/bin/env node

/**
 * Extract Scope Deliverables Script
 * Purpose: Parse SD scope and populate sd_scope_deliverables table
 * Usage: node scripts/extract-scope-deliverables.mjs <SD-ID>
 *
 * This script:
 * 1. Queries strategic_directives_v2 for the SD
 * 2. Parses scope field for deliverable keywords
 * 3. Inserts deliverables into sd_scope_deliverables table
 * 4. Sets priority based on context (required/high/medium/low)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

const SUPABASE_URL = envContent.match(/SUPABASE_URL="?(.*?)"?$/m)?.[1].replace(/"/g, '');
const SUPABASE_ANON_KEY = envContent.match(/SUPABASE_ANON_KEY="?(.*?)"?$/m)?.[1].replace(/"/g, '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Deliverable type detection patterns
const DELIVERABLE_PATTERNS = [
  // Database patterns
  { pattern: /\b(create|add|modify|update)\s+(table|schema|migration|database|column|index)\b/gi, type: 'database' },
  { pattern: /\b(supabase|postgres|sql|rls|row level security)\b/gi, type: 'database' },

  // UI patterns
  { pattern: /\b(UI|interface|component|page|view|dashboard|modal|form|button)\b/gi, type: 'ui_feature' },
  { pattern: /\b(design|styling|css|tailwind|responsive|layout)\b/gi, type: 'ui_feature' },

  // API patterns
  { pattern: /\b(API|endpoint|route|service|controller|handler)\b/gi, type: 'api' },
  { pattern: /\b(REST|GraphQL|webhook|integration)\b/gi, type: 'api' },

  // Documentation patterns
  { pattern: /\b(documentation|docs|readme|guide|tutorial|wiki)\b/gi, type: 'documentation' },
  { pattern: /\b(comment|docstring|JSDoc|API docs)\b/gi, type: 'documentation' },

  // Configuration patterns
  { pattern: /\b(config|configuration|settings|environment|env)\b/gi, type: 'configuration' },

  // Test patterns
  { pattern: /\b(test|testing|unit test|e2e|integration test|playwright|vitest)\b/gi, type: 'test' },

  // Migration patterns
  { pattern: /\b(migration|migrate|upgrade|data migration)\b/gi, type: 'migration' },

  // Integration patterns
  { pattern: /\b(integration|integrate|connect|sync|webhook)\b/gi, type: 'integration' },
];

// Priority keywords
const PRIORITY_PATTERNS = {
  required: /\b(must|required|critical|essential|mandatory)\b/gi,
  high: /\b(should|important|high priority|needed)\b/gi,
  medium: /\b(could|nice to have|medium priority|optional)\b/gi,
  low: /\b(future|later|low priority|defer)\b/gi,
};

/**
 * Extract deliverables from scope text
 */
function extractDeliverablesFromScope(scope, sd_id) {
  const deliverables = [];
  const seen = new Set();

  // Split scope into sentences
  const sentences = scope.split(/[.!?]\s+/);

  sentences.forEach((sentence) => {
    // Detect deliverable type
    let deliverableType = 'other';
    let matchedPattern = null;

    for (const { pattern, type } of DELIVERABLE_PATTERNS) {
      if (pattern.test(sentence)) {
        deliverableType = type;
        matchedPattern = pattern;
        break;
      }
    }

    // Only process if a pattern matched
    if (matchedPattern) {
      // Detect priority
      let priority = 'required'; // Default
      for (const [priorityLevel, priorityPattern] of Object.entries(PRIORITY_PATTERNS)) {
        if (priorityPattern.test(sentence)) {
          priority = priorityLevel;
          break;
        }
      }

      // Clean sentence for deliverable name
      const deliverableName = sentence.trim().replace(/\s+/g, ' ').substring(0, 500);

      // Avoid duplicates
      const key = `${deliverableType}:${deliverableName}`;
      if (!seen.has(key)) {
        seen.add(key);
        deliverables.push({
          sd_id,
          deliverable_type: deliverableType,
          deliverable_name: deliverableName,
          priority,
          completion_status: 'pending',
        });
      }
    }
  });

  return deliverables;
}

/**
 * Main function
 */
async function main() {
  const sd_id = process.argv[2];

  if (!sd_id) {
    console.error('❌ Usage: node extract-scope-deliverables.mjs <SD-ID>');
    process.exit(1);
  }

  console.log(`\n🔍 Extracting deliverables from SD: ${sd_id}\n`);

  // Query SD
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sd_id)
    .single();

  if (sdError || !sd) {
    console.error(`❌ SD not found: ${sd_id}`);
    console.error(sdError);
    process.exit(1);
  }

  console.log(`📄 SD: ${sd.title}`);
  console.log(`📝 Scope length: ${sd.scope?.length || 0} characters\n`);

  if (!sd.scope || sd.scope.trim().length === 0) {
    console.error('❌ SD has no scope defined');
    process.exit(1);
  }

  // Extract deliverables
  const deliverables = extractDeliverablesFromScope(sd.scope, sd_id);

  console.log(`✅ Extracted ${deliverables.length} deliverables:\n`);

  deliverables.forEach((d, i) => {
    console.log(`${i + 1}. [${d.deliverable_type.toUpperCase()}] ${d.deliverable_name}`);
    console.log(`   Priority: ${d.priority}\n`);
  });

  // Check if deliverables already exist
  const { data: existing, error: existingError } = await supabase
    .from('sd_scope_deliverables')
    .select('id')
    .eq('sd_id', sd_id);

  if (existingError) {
    console.error('❌ Error checking existing deliverables:', existingError);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`⚠️  Warning: ${existing.length} deliverables already exist for this SD`);
    console.log('   Use --force to overwrite\n');

    if (!process.argv.includes('--force')) {
      console.log('Aborted. Use --force to overwrite existing deliverables.');
      process.exit(0);
    }

    // Delete existing
    const { error: deleteError } = await supabase
      .from('sd_scope_deliverables')
      .delete()
      .eq('sd_id', sd_id);

    if (deleteError) {
      console.error('❌ Error deleting existing deliverables:', deleteError);
      process.exit(1);
    }

    console.log('✅ Deleted existing deliverables\n');
  }

  // Insert deliverables
  const { data: inserted, error: insertError } = await supabase
    .from('sd_scope_deliverables')
    .insert(deliverables)
    .select();

  if (insertError) {
    console.error('❌ Error inserting deliverables:', insertError);
    process.exit(1);
  }

  console.log(`\n✅ Successfully inserted ${inserted.length} deliverables into database\n`);

  // Summary by type
  const typeCount = {};
  deliverables.forEach((d) => {
    typeCount[d.deliverable_type] = (typeCount[d.deliverable_type] || 0) + 1;
  });

  console.log('📊 Breakdown by type:');
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  console.log('\n🎯 Next steps:');
  console.log('   1. Review deliverables in database');
  console.log('   2. Mark deliverables as completed when implemented');
  console.log('   3. Use check_deliverables_complete() to verify completion\n');
}

main().catch(console.error);
