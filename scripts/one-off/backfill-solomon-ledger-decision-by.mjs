#!/usr/bin/env node
/**
 * backfill-solomon-ledger-decision-by.mjs — FR-2, SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001.
 *
 * decision_by is meant to be an identity, not a notes field. 1208 of 1552 non-null historical
 * values are prose sentences (e.g. "adam:d02c9e34 2026-07-12: SD/QF ranking answer consumed in
 * the ranking group discussion; ..."). This truncates every non-null value to its leading
 * identity token via normalizeDecisionBy() — the SAME function the write paths
 * (coordinator-ack-adam.cjs recordLedgerDecision + inheritTailDecisions) now enforce going
 * forward, so THOSE two write paths' future rows converge on one representation.
 *
 * RUN THIS AFTER the write-path fix (coordinator-ack-adam.cjs) merges and deploys, not before —
 * this is a point-in-time cleanup, not a standing invariant: TESTING's EXEC-2 review found rows
 * matching the pre-normalization prose shape still appearing AFTER this SD's implementation began,
 * from a writer that is neither of the two enforced call sites (confirmed against both the current
 * and the pre-this-SD main-branch coordinator-ack-adam.cjs — both only ever pass a bare session
 * UUID) nor any direct caller of recordLedgerDecision/inheritTailDecisions found in this repo.
 * That third writer is unidentified and out of this SD's scope to chase further; running this
 * backfill does not stop it from producing new non-normalized rows going forward, and running it
 * before the two enforced sites deploy just means immediately-stale results.
 *
 * Idempotent: a row whose decision_by already equals its normalized form is skipped (0 rows
 * changed on a second run) — TS-9.
 *
 * SECURITY (EXEC review, post-incident): DEFAULTS TO DRY-RUN. The bare `import()` incident above
 * proved a destructive one-off script that defaults to live writes is one accidental invocation
 * away from an irreversible production mutation — the main-guard stops an accidental IMPORT from
 * running main() at all, but a deliberate but hasty DIRECT run (`node this-file.mjs`, no flags)
 * should not ALSO default to live. Repo precedent: commit c435a5b2b9c ("default-dry-run CLI").
 * `--apply` is required to actually write; `--dry-run` is still accepted as a no-op/explicit-intent
 * flag for anyone who already knows the old spelling. Updates remain per-row inside the scan loop
 * (no cross-page transaction) — an abort mid-run can leave a partially-migrated table; re-running
 * is safe (idempotent, TS-9) but is not automatic.
 *
 * Usage: node scripts/one-off/backfill-solomon-ledger-decision-by.mjs [--dry-run]   (default; report only)
 *        node scripts/one-off/backfill-solomon-ledger-decision-by.mjs --apply       (writes for real)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { normalizeDecisionBy } from '../coordinator-ack-adam.cjs';

const PAGE_SIZE = 500;

async function main() {
  // Dry-run BY DEFAULT (SECURITY, EXEC review) — --apply is the one flag that enables live writes.
  // --dry-run is still accepted (no-op: it's already the default) for anyone using the old spelling.
  const dryRun = !process.argv.includes('--apply');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let page = 0;
  let scanned = 0;
  let changed = 0;
  let unchanged = 0;
  const sampleChanges = [];

  for (;;) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from('solomon_advice_outcome_ledger')
      .select('id, decision_by')
      .not('decision_by', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) { console.error('FATAL: read failed:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data) {
      scanned += 1;
      const normalized = normalizeDecisionBy(row.decision_by);
      if (normalized === row.decision_by) { unchanged += 1; continue; }
      changed += 1;
      if (sampleChanges.length < 10) sampleChanges.push({ id: row.id, from: row.decision_by, to: normalized });
      if (!dryRun) {
        const { error: updErr } = await supabase
          .from('solomon_advice_outcome_ledger')
          .update({ decision_by: normalized })
          .eq('id', row.id);
        if (updErr) { console.error(`FATAL: update failed for ${row.id}:`, updErr.message); process.exit(1); }
      }
    }

    if (data.length < PAGE_SIZE) break;
    page += 1;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Scanned: ${scanned} non-null decision_by rows`);
  console.log(`${dryRun ? 'Would change' : 'Changed'}: ${changed}`);
  console.log(`Already-normalized (unchanged): ${unchanged}`);
  if (sampleChanges.length > 0) {
    console.log('Sample changes:');
    for (const c of sampleChanges) console.log(`  ${c.id}: ${JSON.stringify(c.from).slice(0, 60)} -> ${JSON.stringify(c.to)}`);
  }
}

// Incident, 2026-08-21: importing this module for ESM/CJS-interop inspection (no intent to run
// it) executed main() for real against live prod — 1212 decision_by rows mutated, irreversibly,
// pre-merge. Guard so import()/require() alone can never trigger a write; only running this file
// directly does.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((e) => { console.error('FATAL:', e.message || e); process.exit(1); });
}
