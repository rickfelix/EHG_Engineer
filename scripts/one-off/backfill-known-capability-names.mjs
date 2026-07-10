#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-3)
 *
 * Backfills `name` on existing sd_capabilities rows seeded by
 * lib/capabilities/capability-seeder.js's KNOWN_CAPABILITIES, whose name
 * column was previously left null -- causing v_unified_capabilities'
 * COALESCE(name, capability_key) to leak the raw internal slug (e.g.
 * "auto-proceed", "db-prd-system") to any consumer, including the Stage-0
 * requirement extractor's LLM prompt context.
 *
 * Idempotent: only updates rows whose name IS NULL and whose capability_key
 * matches a KNOWN_CAPABILITIES entry -- safe to re-run.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { KNOWN_CAPABILITIES } from '../../lib/capabilities/known-capabilities.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
  const { data: rows, error } = await supabase
    .from('sd_capabilities')
    .select('id, capability_key, name')
    .is('name', null);

  if (error) {
    console.error('Failed to load sd_capabilities:', error.message);
    process.exit(1);
  }

  const nameByKey = new Map(KNOWN_CAPABILITIES.map((c) => [c.capability_key, c.name]));
  const stats = { updated: 0, skipped: 0, errors: 0 };

  for (const row of rows || []) {
    const name = nameByKey.get(row.capability_key);
    if (!name) {
      stats.skipped++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('sd_capabilities')
      .update({ name })
      .eq('id', row.id);

    if (updateErr) {
      console.error(`  ERROR: ${row.capability_key}: ${updateErr.message}`);
      stats.errors++;
    } else {
      console.log(`  BACKFILLED: ${row.capability_key} -> "${name}"`);
      stats.updated++;
    }
  }

  console.log('\nResults:');
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Skipped (no known name mapping): ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors}`);
  process.exit(stats.errors > 0 ? 1 : 0);
}

backfill();
