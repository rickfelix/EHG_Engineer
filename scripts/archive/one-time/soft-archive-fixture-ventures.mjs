#!/usr/bin/env node
/**
 * Soft-archive fixture ventures — one-time, dry-run-DEFAULT, guardrailed, REVERSIBLE.
 * SD-LEO-INFRA-VENTURES-DATA-HYGIENE-001 (FR-2 + FR-3).
 *
 * Reversibly soft-archives fixture/test ventures (deleted_at + status='archived') using
 * the PINNED precision-over-recall predicate (lib/governance/venture-archive-predicate.mjs).
 * NEVER a hard delete. Idempotent: the `deleted_at IS NULL` write filter makes a 2nd
 * --apply a no-op. The sanctioned live is_demo canary is excluded by the predicate.
 *
 * Usage:
 *   node scripts/archive/one-time/soft-archive-fixture-ventures.mjs                 # DRY-RUN (default): print candidates + guardrails, zero writes
 *   node scripts/archive/one-time/soft-archive-fixture-ventures.mjs --apply         # perform the reversible soft-archive
 *   node scripts/archive/one-time/soft-archive-fixture-ventures.mjs --ceiling 130   # override the abort ceiling (default 130)
 *
 * GUARDRAILS (evaluated BEFORE any write, in BOTH modes):
 *   (a) applications-row tripwire — ABORT (zero writes) if any candidate id is referenced
 *       by an applications.venture_id (real ventures have an applications row).
 *   (b) ceiling tripwire         — ABORT if candidate count > ceiling (default 130).
 *   (c) empty set                — explicit "nothing to archive" no-op (zero writes, exit 0).
 *
 * @wire-check-exempt: one-time archive CLI under scripts/archive/one-time/ — no permanent
 *   runtime entry point by design (mirrors venture-lifecycle.cjs).
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../../lib/db/fetch-all-paginated.mjs';
import { isArchivableFixtureVenture } from '../../../lib/governance/venture-archive-predicate.mjs';

export const DEFAULT_CEILING = 130;
const CHUNK_SIZE = 200;

/** Pure: candidate rows = ventures the pinned predicate positively classifies. */
export function selectCandidates(ventures) {
  return (ventures || []).filter(isArchivableFixtureVenture);
}

/** Why did a candidate match — for the dry-run report. */
export function whyMatched(v) {
  return v && v.is_demo === true ? 'is_demo' : 'name-pattern';
}

/** Parse CLI args → { apply, ceiling }. Defaults to dry-run (apply=false). */
export function parseArgs(argv = []) {
  const apply = argv.includes('--apply');
  let ceiling = DEFAULT_CEILING;
  const ci = argv.indexOf('--ceiling');
  if (ci !== -1 && argv[ci + 1] != null) {
    const n = Number(argv[ci + 1]);
    if (Number.isFinite(n) && n > 0) ceiling = n;
  }
  return { apply, ceiling };
}

/**
 * Pure guardrail evaluation. Returns {ok, abortReason, offendingIds}.
 *   abortReason: 'applications_overlap' | 'empty' | 'over_ceiling' | null
 *   'empty' is a no-op (not a failure); the caller exits 0 without writing.
 */
export function checkGuardrails(candidates, applicationsVentureIds, ceiling = DEFAULT_CEILING) {
  const appSet = new Set((applicationsVentureIds || []).filter(Boolean));
  const offendingIds = (candidates || []).filter((v) => appSet.has(v.id)).map((v) => v.id);
  if (offendingIds.length > 0) {
    return { ok: false, abortReason: 'applications_overlap', offendingIds };
  }
  if (!candidates || candidates.length === 0) {
    return { ok: false, abortReason: 'empty', offendingIds: [] };
  }
  if (candidates.length > ceiling) {
    return { ok: false, abortReason: 'over_ceiling', offendingIds: [] };
  }
  return { ok: true, abortReason: null, offendingIds: [] };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const { apply, ceiling } = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const supabase = createClient(url, key);

  // Load ALL ventures + ALL applications venture refs (paginate — never trust a single page).
  const ventures = await fetchAllPaginated(() => supabase.from('ventures').select('*').order('id', { ascending: true }));
  const apps = await fetchAllPaginated(() => supabase.from('applications').select('venture_id').order('venture_id', { ascending: true }));
  const applicationsVentureIds = apps.map((a) => a.venture_id).filter(Boolean);

  const candidates = selectCandidates(ventures);
  const guard = checkGuardrails(candidates, applicationsVentureIds, ceiling);

  console.log(`\n── Soft-archive fixture ventures (${apply ? 'APPLY' : 'DRY-RUN'}) ──`);
  console.log(`   ventures scanned:   ${ventures.length}`);
  console.log(`   candidates matched: ${candidates.length}  (ceiling ${ceiling})`);
  console.log('');
  console.log('   id                                     why           name');
  for (const v of candidates) {
    console.log(`   ${String(v.id).padEnd(38)} ${whyMatched(v).padEnd(13)} ${v.name}`);
  }

  // ── Guardrail report ──
  console.log('\n   Guardrails:');
  console.log(`     applications-row tripwire: ${guard.abortReason === 'applications_overlap' ? `FAIL (${guard.offendingIds.length} real-ref candidate(s))` : 'PASS'}`);
  console.log(`     ceiling (<= ${ceiling}):          ${guard.abortReason === 'over_ceiling' ? `FAIL (${candidates.length})` : 'PASS'}`);
  console.log(`     non-empty:                 ${guard.abortReason === 'empty' ? 'no candidates' : 'PASS'}`);

  if (guard.abortReason === 'empty') {
    console.log('\n   Nothing to archive — 0 candidates. No writes. ✅');
    return;
  }
  if (!guard.ok) {
    if (guard.abortReason === 'applications_overlap') {
      console.error(`\n   ⛔ ABORT: ${guard.offendingIds.length} candidate(s) are referenced by applications.venture_id — a REAL venture may be in the set. Zero writes.`);
      for (const id of guard.offendingIds) console.error(`      offending: ${id}`);
    } else if (guard.abortReason === 'over_ceiling') {
      console.error(`\n   ⛔ ABORT: candidate count ${candidates.length} > ceiling ${ceiling} — implausibly large. Zero writes. Re-run with --ceiling N if intended.`);
    }
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log('\n   DRY-RUN — guardrails PASS, zero writes. Re-run with --apply to soft-archive. ✅');
    return;
  }

  // ── APPLY: reversible chunked soft-archive (deleted_at IS NULL filter ⇒ idempotent) ──
  const ids = candidates.map((v) => v.id);
  const archivedIds = [];
  for (const group of chunk(ids, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('ventures')
      .update({ deleted_at: new Date().toISOString(), status: 'archived' })
      .in('id', group)
      .is('deleted_at', null)
      .select('id');
    if (error) throw new Error(`soft-archive chunk failed: ${error.message}`);
    for (const row of data || []) archivedIds.push(row.id);
  }

  console.log(`\n   ✅ Soft-archived ${archivedIds.length} venture(s) (already-archived rows skipped by the deleted_at IS NULL filter).`);
  console.log('\n   ── ROLLBACK RECIPE (reverse each id) ──');
  for (const id of archivedIds) {
    console.log(`   node scripts/archive/one-time/venture-lifecycle.cjs restore ${id}`);
  }
  if (archivedIds.length > 0) {
    console.log('\n   Or reverse in one statement:');
    console.log(`   UPDATE ventures SET deleted_at = NULL, status = 'active' WHERE id IN (${archivedIds.map((id) => `'${id}'`).join(', ')});`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
