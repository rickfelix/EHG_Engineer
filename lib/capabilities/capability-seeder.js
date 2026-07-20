/**
 * Capability Seeder
 * SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001
 *
 * Seeds the sd_capabilities table with known codebase capabilities
 * so the disposition engine can detect "already_exists" items.
 *
 * Usage:
 *   node lib/capabilities/capability-seeder.js [--dry-run]
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-3/FR-6): the data moved to a
// side-effect-free module so the Stage-0 requirement extractor's structural denylist guard
// (discovery-mode.js) can import it without pulling in this file's Supabase client creation
// and argv-based CLI-invocation trigger. Every entry now carries an explicit, human-readable
// `name` distinct from its `capability_key` slug -- without it, v_unified_capabilities'
// COALESCE(sc.name, sc.capability_key) falls back to the raw internal key (e.g.
// "auto-proceed", "db-prd-system"), which the Stage-0 extractor's LLM prompt context
// previously echoed back as if it were a real venture-requirable capability.
import { KNOWN_CAPABILITIES } from './known-capabilities.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — sd_capabilities accumulates
// registrations from every SD across the whole system (not just this seeder's rows); a
// capped dedup-key read would silently re-insert capabilities that already exist.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

dotenv.config();

const supabase = createSupabaseServiceClient();

// SD that owns these seeded capabilities
const SEED_SD_UUID = '017467d3-ba34-4dec-a52a-3294d84b6c03';
const SEED_SD_ID = 'SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001';

/**
 * Seed the sd_capabilities table with known capabilities
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - If true, only show what would be inserted
 * @param {string} [options.sdUuid] - Override SD UUID for ownership
 * @param {string} [options.sdId] - Override SD ID for ownership
 * @returns {Promise<{inserted: number, skipped: number, errors: number}>}
 */
export async function seedCapabilities(options = {}) {
  const stats = { inserted: 0, skipped: 0, errors: 0 };
  const sdUuid = options.sdUuid || SEED_SD_UUID;
  const sdId = options.sdId || SEED_SD_ID;

  // Get existing capability keys to avoid duplicates
  let existing;
  try {
    existing = await fetchAllPaginated(() => supabase
      .from('sd_capabilities')
      .select('capability_key')
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch {
    existing = []; // fail-open: original destructure also tolerated an errored/empty read
  }

  const existingKeys = new Set(existing.map(e => e.capability_key));

  for (const cap of KNOWN_CAPABILITIES) {
    if (existingKeys.has(cap.capability_key)) {
      stats.skipped++;
      if (options.dryRun) {
        console.log(`  SKIP: ${cap.capability_key} (already exists)`);
      }
      continue;
    }

    if (options.dryRun) {
      console.log(`  INSERT: [${cap.capability_type}/${cap.category}] ${cap.capability_key}`);
      stats.inserted++;
      continue;
    }

    const { error } = await supabase
      .from('sd_capabilities')
      .insert({
        sd_uuid: sdUuid,
        sd_id: sdId,
        capability_key: cap.capability_key,
        name: cap.name,
        capability_type: cap.capability_type,
        category: cap.category,
        action_details: {
          name: cap.name,
          description: cap.action_details,
          capability_key: cap.capability_key,
          capability_type: cap.capability_type
        },
        action: 'registered'
      });

    if (error) {
      console.error(`  ERROR: ${cap.capability_key}: ${error.message}`);
      stats.errors++;
    } else {
      stats.inserted++;
    }
  }

  return stats;
}

// CLI execution
if (process.argv[1]?.includes('capability-seeder')) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\nCapability Seeder ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(50));
  console.log(`Known capabilities: ${KNOWN_CAPABILITIES.length}`);
  console.log('');

  seedCapabilities({ dryRun }).then(stats => {
    console.log('\nResults:');
    console.log(`  Inserted: ${stats.inserted}`);
    console.log(`  Skipped: ${stats.skipped} (already exist)`);
    console.log(`  Errors: ${stats.errors}`);
    process.exit(stats.errors > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Seeder failed:', err.message);
    process.exit(1);
  });
}

export default { seedCapabilities, KNOWN_CAPABILITIES };
