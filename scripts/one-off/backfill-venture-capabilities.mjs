#!/usr/bin/env node
/**
 * One-off backfill: populate venture_capabilities from completed venture SDs.
 * SD: SD-LEO-GEN-UNIFY-VENTURE-CAPABILITIES-001 | US-004 / FR-4
 *
 * The capability flywheel registers PLATFORM capabilities (sd_capabilities) via
 * trg_capability_lifecycle when an SD completes, but VENTURE capabilities
 * (venture_capabilities, consumed by the cross-venture graph + v_unified_capabilities
 * 'venture' arm) have no equivalent populator. This backfill reads completed SDs that
 * (a) carry a venture_id and (b) declare delivers_capabilities, and materializes one
 * venture_capabilities row per declared capability.
 *
 * Forward-looking + no-op-safe: venture_capabilities is currently empty and the only
 * venture SDs are cancelled with delivers_capabilities=[], so today this logs
 * "0 to populate" explicitly (NC-7) rather than silently doing nothing.
 *
 * Idempotent: existence is checked by (origin_sd_key, name) in JS before insert, so
 * re-runs make no changes and the script does not depend on a specific DB unique
 * constraint being present.
 *
 * delivers_capabilities element shape (per 20251202_capability_lifecycle_automation.sql):
 *   { capability_type, capability_key, name, description, metadata }
 *
 * Usage:
 *   node scripts/one-off/backfill-venture-capabilities.mjs            # populate
 *   node scripts/one-off/backfill-venture-capabilities.mjs --dry-run  # preview only
 */
import 'dotenv/config';
import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Allowed venture_capabilities.maturity_level values (CHECK constraint). Note this
// scale differs from sd_capabilities' computed production/beta/experimental — 'beta'
// is NOT valid here — so values that fall outside the set are coerced to 'experimental'.
export const VENTURE_MATURITY_LEVELS = Object.freeze(['experimental', 'stable', 'production', 'deprecated']);

/** Clamp a score to the [0,10] CHECK range; null/non-numeric → null. */
function clampScore(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(10, n));
}

/**
 * Map a single delivers_capabilities element + its originating SD to a
 * venture_capabilities insert row. Pure — no I/O. Exported for unit testing.
 * Output is guaranteed to satisfy the venture_capabilities CHECK constraints
 * (maturity_level ∈ VENTURE_MATURITY_LEVELS; scores in [0,10] or null).
 */
export function toVentureCapabilityRow(cap, sd) {
  const meta = cap.metadata || {};
  const name = cap.name || cap.capability_key;
  // delivers_capabilities does not carry scores/maturity directly; pull from metadata
  // if present, else default to the lowest maturity. Forward-looking — venture SDs may
  // enrich these. Coerce to satisfy the DB CHECK constraints.
  const rawMaturity = meta.maturity_level || cap.maturity_level || 'experimental';
  return {
    name,
    capability_type: cap.capability_type || 'tool',
    origin_venture_id: sd.venture_id,
    origin_sd_key: sd.sd_key,
    maturity_level: VENTURE_MATURITY_LEVELS.includes(rawMaturity) ? rawMaturity : 'experimental',
    reusability_score: clampScore(meta.reusability_score ?? cap.reusability_score),
    revenue_leverage_score: clampScore(meta.revenue_leverage_score ?? cap.revenue_leverage_score),
  };
}

async function main() {
  console.log(`Backfill venture_capabilities  (dryRun=${dryRun})`);

  // Completed SDs that carry a venture_id. delivers_capabilities array-length is
  // filtered in JS (PostgREST cannot express jsonb_array_length in a filter).
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, venture_id, status, delivers_capabilities')
    .eq('status', 'completed')
    .not('venture_id', 'is', null);

  if (error) {
    console.error(`  ERROR querying SDs: ${error.message}`);
    process.exit(1);
  }

  const eligible = (sds || []).filter(
    (sd) => Array.isArray(sd.delivers_capabilities) && sd.delivers_capabilities.length > 0
  );

  console.log(`  completed venture SDs: ${(sds || []).length} | with delivers_capabilities: ${eligible.length}`);

  if (eligible.length === 0) {
    // NC-7: surface the no-op explicitly so callers can distinguish "ran, nothing to do"
    // from "did not run".
    console.log('  ✅ 0 venture capabilities to populate (no completed venture SDs declare delivers_capabilities).');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  const previews = [];

  for (const sd of eligible) {
    // Existing venture_capabilities for this SD — idempotency by (origin_sd_key, name).
    const { data: existingRows, error: exErr } = await supabase
      .from('venture_capabilities')
      .select('name')
      .eq('origin_sd_key', sd.sd_key);
    if (exErr) {
      console.error(`  ERROR reading existing rows for ${sd.sd_key}: ${exErr.message}`);
      process.exit(1);
    }
    const existingNames = new Set((existingRows || []).map((r) => r.name));

    for (const cap of sd.delivers_capabilities) {
      const row = toVentureCapabilityRow(cap, sd);
      if (existingNames.has(row.name)) {
        skipped++;
        continue;
      }
      if (dryRun) {
        previews.push(`${sd.sd_key} -> ${row.name} [${row.capability_type}]`);
        inserted++; // counted as "would insert"
        existingNames.add(row.name); // avoid double-counting dupes within the same SD payload
        continue;
      }
      const { error: insErr } = await supabase.from('venture_capabilities').insert(row);
      if (insErr) {
        console.error(`  ERROR inserting ${row.name} (${sd.sd_key}): ${insErr.message}`);
        process.exit(1);
      }
      existingNames.add(row.name);
      inserted++;
    }
  }

  if (dryRun) {
    console.log(`  DRY RUN — would insert ${inserted}, skip ${skipped} (already present).`);
    for (const p of previews.slice(0, 20)) console.log(`    + ${p}`);
    return;
  }

  console.log(`  ✅ inserted=${inserted} skipped=${skipped} (idempotent: re-run inserts 0).`);
}

// Only run when invoked directly (not when imported by tests).
const invokedDirectly = (() => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((e) => {
    console.error('Backfill failed:', e.message);
    process.exit(1);
  });
}
