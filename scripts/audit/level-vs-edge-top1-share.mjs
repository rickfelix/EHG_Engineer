#!/usr/bin/env node
/**
 * Level-vs-edge retire-check census — QF-20260831-127 (Solomon retire-check).
 *
 * Post-fix acceptance: no single standing condition should account for a dominant share of
 * NEW rows in the affected tables. This census measures that directly — a top-1-condition-share
 * over a recent window — rather than trusting the fix by inspection. Rerunnable, read-only.
 *
 * SCOPE: wired against `feedback` (metadata.dedup_key), the WAVE_LINKAGE_STARVATION instance
 * this QF has full code access to. The other two named instances (eva_scheduler_metrics's
 * per-venture-per-poll suppression condition; Hotel-3's bypass_detection re-log) live in
 * different tables/shapes and are explicitly BACKLOG to wire in, per the QF's own text.
 *
 * KNOWN LIMITATION: this census only ever looks at `feedback` rows carrying
 * `metadata.dedup_key` -- it cannot see level-vs-edge re-assertion happening through any OTHER
 * emission path (a different table, a differently-shaped metadata field, or a condition that
 * doesn't use dedup_key at all). It also cannot distinguish a genuinely pathological repeating
 * condition from a legitimately-flappy-but-healthy one at small group counts (see the
 * documented 2-group boundary caveat on computeTop1Share below) -- a human/coordinator reading
 * the printed group breakdown is still required to interpret a FAIL, not just its exit code.
 *
 * Usage: node scripts/audit/level-vs-edge-top1-share.mjs [--days N] [--threshold 0.5]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

function parseArgs(argv) {
  // `|| default` treats an explicit --days 0 / --threshold 0 as falsy and silently substitutes
  // the default -- use an explicit undefined/NaN check instead (adversarial-review finding).
  const rawDays = Number(argv.find((a, i) => argv[i - 1] === '--days'));
  const rawThreshold = Number(argv.find((a, i) => argv[i - 1] === '--threshold'));
  const days = Number.isFinite(rawDays) && argv.includes('--days') ? rawDays : 30;
  const threshold = Number.isFinite(rawThreshold) && argv.includes('--threshold') ? rawThreshold : 0.5;
  return { days, threshold };
}

/**
 * PURE: given rows with a groupKey extractor, compute the top-1 group's share of the total.
 *
 * Scoped to REPEATING keys only (count >= minRepeats, default 2): a key that appears exactly
 * once in the window is, by definition, not "a standing condition re-asserted" — it's a genuine
 * one-off edge event. Mixing those into the denominator dilutes the signal this census exists to
 * catch (measured live: WAVE_LINKAGE_STARVATION's 21 repeats over 7 days reads as a mere 5.8%
 * against ~340 mostly-unique completion-flag/one-off keys, when the actual question is "of the
 * conditions that DO repeat, does one dominate").
 *
 * INTERPRETATION CAVEAT (adversarial-review finding on this same PR): with few surviving
 * repeating-key groups, top1Share is mechanically pushed toward or past the 50% threshold by
 * construction (e.g. exactly 2 groups always yields >=50% for the larger one) regardless of
 * whether the leading group is actually pathological relative to overall traffic. This census
 * is a signal for a human/coordinator to interpret alongside the group COUNT and the raw counts
 * printed above, not a fully-automated pass/fail oracle in isolation -- a future caller wiring
 * this into a hard CI gate should also require a minimum number of surviving groups (e.g. >=3)
 * before treating top1Share as meaningful.
 *
 * @param {Array<object>} rows
 * @param {(row: object) => string|null} groupKeyOf
 * @param {{minRepeats?: number}} [opts]
 * @returns {{total: number, groups: Array<{key: string, count: number, share: number}>, top1Share: number}}
 */
export function computeTop1Share(rows, groupKeyOf, { minRepeats = 2 } = {}) {
  const counts = new Map();
  for (const row of rows) {
    const key = groupKeyOf(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeating = [...counts.entries()].filter(([, count]) => count >= minRepeats);
  const total = repeating.reduce((sum, [, count]) => sum + count, 0);
  const groups = repeating
    .map(([key, count]) => ({ key, count, share: total === 0 ? 0 : count / total }))
    .sort((a, b) => b.count - a.count);
  return { total, groups, top1Share: groups.length ? groups[0].share : 0 };
}

async function main() {
  const { days, threshold } = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[level-vs-edge-census] missing Supabase creds'); process.exit(1); }
  const supabase = createClient(url, key);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await fetchAllPaginated(() => supabase
    .from('feedback')
    .select('metadata, created_at')
    .eq('category', 'harness_backlog')
    .gte('created_at', since)
    .order('id', { ascending: true }));

  const { total, groups, top1Share } = computeTop1Share(rows, (r) => r.metadata?.dedup_key || null);

  console.log(`[level-vs-edge-census] window: last ${days}d, ${total} rows across repeating (>=2x) dedup keys`);
  for (const g of groups.slice(0, 10)) {
    console.log(`  ${g.key.padEnd(40)} ${String(g.count).padStart(5)}  (${(g.share * 100).toFixed(1)}%)`);
  }
  console.log(`  top-1 share: ${(top1Share * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`);

  if (total > 0 && top1Share >= threshold) {
    console.error(`[level-vs-edge-census] FAIL — one standing condition dominates new rows (${groups[0]?.key})`);
    process.exit(1);
  }
  console.log('[level-vs-edge-census] PASS');
}

// Idiomatic repo pattern (matches scripts/adam-triangulation-audit-stamp.mjs and others) --
// adversarial review flagged the prior ad-hoc `file://` string-building guard as a known-fragile
// Windows pattern (missing the third slash) that only worked here by accident of the `||` fallback.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('[level-vs-edge-census] ERROR:', e?.message || e); process.exit(1); });
}
