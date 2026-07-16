#!/usr/bin/env node
// @wire-check-exempt — one-off backfill CLI (run manually, not imported)
/**
 * SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 (FR-4) — comprehensive, done-state-VERIFIED backfill
 * of currently-unstamped roadmap_wave_items rows against genuinely-completed SDs.
 *
 * Matches ONLY via a direct sd_key/title correlation corroborated by
 * strategic_directives_v2.status='completed' AND a plausible completion_date/created_at
 * ordering — NEVER a bare title-string match alone (the exact 2026-07-16 dedup-miss failure
 * mode this explicitly avoids: 4 already-shipped SPINE satellites were re-promoted by a prior
 * pass that matched by title only). The conversion_ledger-link matching path from earlier
 * drafts is DROPPED — source_type='conversion_ledger' is CHECK-illegal on this table and 0
 * live rows use it (DATABASE sub-agent finding, evidence 325c9993).
 *
 * Sets item_disposition='promoted' (NOT 'done' — CHECK-illegal) alongside promoted_to_sd_key
 * on a verified match. Every write is a compare-and-set guarded by
 * `.is('promoted_to_sd_key', null)` (idempotent, and avoids a same-tick race with the
 * sourcing-engine refill-auto-promote cron, which also scans unstamped rows) and is
 * read-after-write verified (rowCount > 0 checked — RLS under the wrong role silently returns
 * success with zero rows written).
 *
 * DRY-RUN by default; pass --apply to write.
 *
 * Usage: node scripts/one-off/backfill-roadmap-completion-linkage.mjs [--apply]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { pathToFileURL } from 'url';

/**
 * A title correlation is only trusted when corroborated by BOTH a completed SD status AND a
 * plausible temporal ordering: the SD's completion cannot predate the roadmap item's own
 * creation (an SD cannot have completed a task that did not yet exist as a roadmap item) —
 * never a bare title-string match alone.
 */
function isPlausibleMatch(item, sd) {
  if (!sd || sd.status !== 'completed') return false;
  if (!item.title || !sd.title) return false;
  if (item.title.trim().toLowerCase() !== sd.title.trim().toLowerCase()) return false;
  if (['dropped', 'promoted'].includes(item.item_disposition)) return false; // never resurrect a curated-away or already-terminal item
  if (!sd.completion_date || !item.created_at) return false;
  const sdCompletedAt = new Date(sd.completion_date).getTime();
  const itemCreatedAt = new Date(item.created_at).getTime();
  if (!Number.isFinite(sdCompletedAt) || !Number.isFinite(itemCreatedAt)) return false;
  return sdCompletedAt >= itemCreatedAt;
}

export async function runBackfill({ supabase, apply = false, log = console.log } = {}) {
  const { data: items, error: itemsErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, title, item_disposition, promoted_to_sd_key, created_at')
    .is('promoted_to_sd_key', null);
  if (itemsErr) { log(`[backfill] items query failed: ${itemsErr.message}`); return { selected: 0, stamped: 0, leftOpen: 0, ambiguousSkipped: 0, applied: apply }; }

  // 'dropped' items are a deliberate human curation decision -- never a backfill candidate.
  const candidates = (items || []).filter((i) => !!i.title && i.item_disposition !== 'dropped');

  const { data: completedSds, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, completion_date')
    .eq('status', 'completed');
  if (sdErr) { log(`[backfill] strategic_directives_v2 query failed: ${sdErr.message}`); return { selected: candidates.length, stamped: 0, leftOpen: 0, ambiguousSkipped: 0, applied: apply }; }

  const sdsByTitle = new Map();
  for (const sd of completedSds || []) {
    const key = sd.title?.trim().toLowerCase();
    if (!key) continue;
    if (sdsByTitle.has(key)) sdsByTitle.set(key, null); // ambiguous (multiple SDs share this title) -> skip
    else sdsByTitle.set(key, sd);
  }

  let stamped = 0, leftOpen = 0, ambiguousSkipped = 0;
  for (const item of candidates) {
    const key = item.title.trim().toLowerCase();
    const matchedSd = sdsByTitle.get(key);
    if (matchedSd === null) { ambiguousSkipped++; log(`[backfill] SKIP ${item.id} (ambiguous: multiple completed SDs share title "${item.title.slice(0, 60)}")`); continue; }
    if (!matchedSd || !isPlausibleMatch(item, matchedSd)) { leftOpen++; continue; }

    if (!apply) { stamped++; log(`[backfill] DRY-RUN would stamp ${item.id} -> ${matchedSd.sd_key}`); continue; }

    const { data: upd, error: uErr } = await supabase
      .from('roadmap_wave_items')
      .update({ promoted_to_sd_key: matchedSd.sd_key, item_disposition: 'promoted' })
      .eq('id', item.id)
      .is('promoted_to_sd_key', null) // idempotency + anti-race guard
      .select('id');
    if (uErr) { ambiguousSkipped++; log(`[backfill] ERROR ${item.id}: ${uErr.message}`); continue; }
    if (upd && upd.length) { stamped++; log(`[backfill] stamped ${item.id} -> ${matchedSd.sd_key}`); }
    else { leftOpen++; log(`[backfill] no-op ${item.id} (already stamped by a concurrent process — idempotent)`); }
  }

  log(`[backfill] ${apply ? 'APPLIED' : 'DRY-RUN'}: selected ${candidates.length}, stamped ${stamped}, left-open ${leftOpen}, ambiguous-skipped ${ambiguousSkipped}`);
  return { selected: candidates.length, stamped, leftOpen, ambiguousSkipped, applied: apply };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  runBackfill({ supabase: createSupabaseServiceClient(), apply })
    .then(() => process.exit(0))
    .catch((err) => { console.error('backfill error:', err.message); process.exit(1); });
}
