#!/usr/bin/env node
/**
 * One-time backfill: clear the stale oracle-hold marker on already-terminal QFs.
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-5).
 *
 * LEAD-phase investigation found several QFs in status IN ('completed','closed') that still
 * carry owner='chairman' plus the oracle_read_pending marker -- they reached a terminal state
 * via a path that bypassed releaseQfOracleHold entirely, leaving stale hold residue that could
 * confuse isOracleHeldQF()/isChairmanGatedQF() checks on rows that already finished.
 *
 * Selection predicate (exact, no other terminal-QF residue class is touched):
 *   status IN ('completed','closed') AND owner='chairman'
 *   AND release_condition LIKE '[oracle_read_pending]%'
 *
 * Usage:
 *   node scripts/one-off/backfill-terminal-oracle-hold-markers.mjs                 (dry-run, default)
 *   node scripts/one-off/backfill-terminal-oracle-hold-markers.mjs --dry-run       (explicit dry-run)
 *   node scripts/one-off/backfill-terminal-oracle-hold-markers.mjs --execute       (mutate, snapshot first)
 *   node scripts/one-off/backfill-terminal-oracle-hold-markers.mjs --restore <snapshot-file>  (revert)
 */
import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { QF_ORACLE_HOLD_PREFIX } from '../../lib/fleet/hold-writer.js';

const TERMINAL_STATUSES = ['completed', 'closed'];

export function parseArgs(argv) {
  const out = { execute: false, restoreFile: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--execute') out.execute = true;
    else if (argv[i] === '--restore') out.restoreFile = argv[++i];
    else if (argv[i] === '--dry-run') out.execute = false;
  }
  return out;
}

/** Pure: candidate selection predicate, exported for unit testing. */
export function isTerminalOracleHoldResidue(qf) {
  if (!qf) return false;
  return TERMINAL_STATUSES.includes(qf.status)
    && qf.owner === 'chairman'
    && typeof qf.release_condition === 'string'
    && qf.release_condition.startsWith(QF_ORACLE_HOLD_PREFIX);
}

export async function findCandidates(supabase) {
  const { data, error } = await supabase
    .from('quick_fixes')
    .select('id, status, owner, release_condition, verification_notes')
    .in('status', TERMINAL_STATUSES)
    .eq('owner', 'chairman')
    .like('release_condition', `${QF_ORACLE_HOLD_PREFIX}%`);
  if (error) throw new Error(`findCandidates: ${error.message}`);
  return data || [];
}

export async function executeBackfill(supabase, candidates, { snapshotPath }) {
  const snapshot = candidates.map((c) => ({
    id: c.id, owner: c.owner, release_condition: c.release_condition, verification_notes: c.verification_notes,
  }));
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`[backfill] before-state snapshot written: ${snapshotPath} (${snapshot.length} rows)`);

  const results = [];
  for (const c of candidates) {
    const stamp = `[TERMINAL-STATE-BACKFILL ${new Date().toISOString()}]: terminal-state backfill, SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (was: ${String(c.release_condition).slice(0, 200)})`;
    const verification_notes = c.verification_notes ? `${c.verification_notes}\n${stamp}` : stamp;
    const { data, error } = await supabase
      .from('quick_fixes')
      .update({ owner: null, release_condition: null, verification_notes })
      .eq('id', c.id)
      .eq('owner', 'chairman')
      .like('release_condition', `${QF_ORACLE_HOLD_PREFIX}%`)
      .select('id')
      .maybeSingle();
    if (error) results.push({ id: c.id, ok: false, error: error.message });
    else if (!data) results.push({ id: c.id, ok: false, error: 'zero_row_no_op (already cleared)' });
    else results.push({ id: c.id, ok: true });
  }
  return results;
}

export async function restoreFromSnapshot(supabase, snapshotPath) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const results = [];
  for (const row of snapshot) {
    const { error } = await supabase
      .from('quick_fixes')
      .update({ owner: row.owner, release_condition: row.release_condition, verification_notes: row.verification_notes })
      .eq('id', row.id);
    results.push({ id: row.id, ok: !error, error: error?.message });
  }
  return results;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (parsed.restoreFile) {
    const results = await restoreFromSnapshot(supabase, parsed.restoreFile);
    const failed = results.filter((r) => !r.ok);
    console.log(`[backfill] restore complete: ${results.length - failed.length}/${results.length} rows reverted`);
    if (failed.length) { console.error('[backfill] FAILED restores:', JSON.stringify(failed)); process.exit(1); }
    return;
  }

  const candidates = await findCandidates(supabase);
  if (candidates.length === 0) {
    console.log('[backfill] 0 candidates -- no terminal QF carries the stale oracle-hold marker (idempotent no-op)');
    return;
  }

  console.log(`[backfill] ${candidates.length} candidate(s):`);
  for (const c of candidates) console.log(`  - ${c.id} (status=${c.status}): ${c.release_condition}`);

  if (!parsed.execute) {
    console.log('[backfill] DRY-RUN (default) -- no rows mutated. Pass --execute to apply.');
    return;
  }

  const snapshotPath = `scripts/one-off/backfill-terminal-oracle-hold-markers.snapshot.${Date.now()}.json`;
  const results = await executeBackfill(supabase, candidates, { snapshotPath });
  const failed = results.filter((r) => !r.ok);
  console.log(`[backfill] execute complete: ${results.length - failed.length}/${results.length} rows cleared`);
  if (failed.length) { console.error('[backfill] FAILED:', JSON.stringify(failed)); process.exit(1); }
  console.log(`[backfill] to revert: node scripts/one-off/backfill-terminal-oracle-hold-markers.mjs --restore ${snapshotPath}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('[backfill] FATAL:', e.message); process.exit(1); });
}
