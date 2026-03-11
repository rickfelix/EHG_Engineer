#!/usr/bin/env node
/**
 * Prompt Migration CLI — Seeds hardcoded prompts into leo_prompts table
 *
 * Reads SYSTEM_PROMPT constants from EVA source files, computes SHA-256 checksum,
 * and inserts into leo_prompts with status='active', version=1.
 *
 * Usage:
 *   node scripts/migrate-prompts.js           # Insert prompts
 *   node scripts/migrate-prompts.js --dry-run  # List without inserting
 *
 * Idempotent: skips prompts whose checksum already exists.
 *
 * Part of SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-B
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const dryRun = process.argv.includes('--dry-run');

// System UUID for created_by (migration tool identity)
const MIGRATION_TOOL_UUID = '00000000-0000-0000-0000-000000000001';

/**
 * Prompt source definitions.
 * Each entry maps a prompt name to the source file and extraction method.
 */
const PROMPT_SOURCES = [
  {
    name: 'stage-00-acquirability',
    file: 'lib/eva/stage-templates/analysis-steps/stage-00-acquirability.js',
    extract: 'const_system_prompt',
  },
];

/**
 * Extract a SYSTEM_PROMPT constant from a JS source file.
 * Handles backtick template literals and regular string literals.
 *
 * @param {string} filePath - Absolute path to the source file
 * @returns {string | null} The extracted prompt text, or null if not found
 */
function extractSystemPrompt(filePath) {
  const content = readFileSync(filePath, 'utf-8');

  // Match: const SYSTEM_PROMPT = `...`;
  const backtickMatch = content.match(/const\s+SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
  if (backtickMatch) return backtickMatch[1];

  // Match: const SYSTEM_PROMPT = "..."; or '...';
  const stringMatch = content.match(/const\s+SYSTEM_PROMPT\s*=\s*(['"])([\s\S]*?)\1;/);
  if (stringMatch) return stringMatch[2];

  return null;
}

/**
 * Compute SHA-256 hex digest of a string.
 * @param {string} text
 * @returns {string}
 */
function computeChecksum(text) {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no inserts will be made\n' : '🚀 Migrating prompts to leo_prompts\n');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const source of PROMPT_SOURCES) {
    const filePath = resolve(ROOT, source.file);
    let promptText;

    try {
      if (source.extract === 'const_system_prompt') {
        promptText = extractSystemPrompt(filePath);
      }
    } catch (err) {
      console.error(`  ❌ ${source.name}: Failed to read file — ${err.message}`);
      failed++;
      continue;
    }

    if (!promptText) {
      console.error(`  ❌ ${source.name}: Could not extract prompt from ${source.file}`);
      failed++;
      continue;
    }

    const checksum = computeChecksum(promptText);
    console.log(`  📝 ${source.name}`);
    console.log(`     File: ${source.file}`);
    console.log(`     Length: ${promptText.length} chars`);
    console.log(`     Checksum: ${checksum.slice(0, 16)}...`);

    if (dryRun) {
      console.log(`     [DRY RUN] Would insert with version=1, status=active\n`);
      inserted++;
      continue;
    }

    // Check if checksum already exists (idempotency)
    const { data: existing } = await supabase
      .from('leo_prompts')
      .select('id, name, version')
      .eq('checksum', checksum)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`     ⏭️  Skipped — checksum already exists (${existing[0].name} v${existing[0].version})\n`);
      skipped++;
      continue;
    }

    // Also check if name+version exists (different content)
    const { data: nameExists } = await supabase
      .from('leo_prompts')
      .select('id, version')
      .eq('name', source.name)
      .order('version', { ascending: false })
      .limit(1);

    const version = (nameExists && nameExists.length > 0) ? nameExists[0].version + 1 : 1;

    const { error } = await supabase
      .from('leo_prompts')
      .insert({
        name: source.name,
        version,
        status: 'active',
        prompt_text: promptText,
        checksum,
        created_by: MIGRATION_TOOL_UUID,
        metadata: {
          source_file: source.file,
          migrated_at: new Date().toISOString(),
          migrated_by: 'scripts/migrate-prompts.js',
        },
      });

    if (error) {
      console.error(`     ❌ Insert failed: ${error.message}\n`);
      failed++;
    } else {
      console.log(`     ✅ Inserted as v${version}\n`);
      inserted++;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${PROMPT_SOURCES.length}`);
  if (dryRun) console.log('\n  ℹ️  Re-run without --dry-run to insert');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
