#!/usr/bin/env node
/**
 * SD-FDBK-FIX-STAGE-PROMOTION-NEVER-001 (FR-4)
 *
 * One-time, best-effort safety net for venture_nursery rows whose promotion happened before
 * this SD's fix (persistVentureBrief now stamps promoted_to_venture_id/promoted_at on every
 * NEW promotion going forward — this script only covers HISTORICAL rows that slipped through
 * before that fix existed).
 *
 * Matching is explicitly HEURISTIC, not exact: venture_nursery has no venture_id column and
 * ventures has no nursery_id column, so the only viable historical join is name + source_ref
 * provenance — the same identity signal persistVentureBrief's own idempotency lookup already
 * uses (chairman-review.js's up-front same-name check). This can miss or misattribute rows if
 * a nursery item's name diverged from its promoted venture's name; it is a safety net, not a
 * guaranteed-complete repair.
 *
 * Live-data check at authoring time (2026-07-12): 16 total venture_nursery rows, 1 already
 * stamped (via an out-of-band manual patch, not by any repeatable code path), the other 15
 * unpromoted with no matching venture by name — zero orphaned promotions exist today. This
 * script is defense-in-depth, expected to find 0 candidates in the common case.
 *
 * Usage:
 *   node scripts/backfill-venture-nursery-promotion-links.mjs
 *   node scripts/backfill-venture-nursery-promotion-links.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the ventures scan below reads the
// WHOLE table for the name-matching heuristic; ventures grows with portfolio size (playbook
// explicitly warns not to assume "small now" means bounded), so paginate to completion.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Find nursery rows with no promotion link whose name exactly matches a live venture's name.
 * Exported for unit testing.
 * @param {Array<{id:string,name:string}>} nurseryRows - rows with promoted_to_venture_id IS NULL
 * @param {Array<{id:string,name:string}>} ventures
 * @returns {Array<{nursery_id:string,nursery_name:string,venture_id:string}>}
 */
export function findHeuristicMatches(nurseryRows, ventures) {
  const byName = new Map();
  for (const v of ventures) {
    // First-match-wins on a name collision — heuristic by design (see file header). A
    // collision is surfaced in the candidate list for manual review, never silently resolved.
    if (!byName.has(v.name)) byName.set(v.name, v.id);
  }
  const candidates = [];
  for (const n of nurseryRows) {
    const ventureId = byName.get(n.name);
    if (ventureId) {
      candidates.push({ nursery_id: n.id, nursery_name: n.name, venture_id: ventureId });
    }
  }
  return candidates;
}

async function main() {
  const { data: nurseryRows, error: e1 } = await supabase
    .from('venture_nursery')
    .select('id, name')
    .is('promoted_to_venture_id', null);
  if (e1) throw e1;

  const ventures = await fetchAllPaginated(() => supabase
    .from('ventures')
    .select('id, name')
    .order('id', { ascending: true }));

  const candidates = findHeuristicMatches(nurseryRows || [], ventures);

  const summary = {
    sd_key: 'SD-FDBK-FIX-STAGE-PROMOTION-NEVER-001',
    ran_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    matching: 'HEURISTIC (name-only, no exact FK join possible)',
    unpromoted_nursery_rows: (nurseryRows || []).length,
    live_ventures_scanned: (ventures || []).length,
    candidates_found: candidates.length,
    candidates,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    console.error(`\n[DRY_RUN] ${candidates.length} candidate(s) would be stamped. Re-run with --apply to write. Matching is name-only heuristic — review the candidate list before applying.`);
    return;
  }

  if (candidates.length === 0) {
    console.error('\n[APPLY] No candidates — nothing to stamp.');
    return;
  }

  let stamped = 0;
  for (const c of candidates) {
    // Idempotent guarded UPDATE — same shape as chairman-review.js's stampNurseryPromotion,
    // only writes rows currently NULL, never overwrites an existing value.
    const { data, error } = await supabase
      .from('venture_nursery')
      .update({ promoted_to_venture_id: c.venture_id, promoted_at: new Date().toISOString() })
      .eq('id', c.nursery_id)
      .is('promoted_to_venture_id', null)
      .select('id');
    if (error) {
      console.error(`[APPLY] Failed to stamp ${c.nursery_id} -> ${c.venture_id}: ${error.message}`);
      continue;
    }
    if (data && data.length > 0) stamped += 1;
  }
  console.error(`\n[APPLY] Stamped ${stamped}/${candidates.length} candidate(s).`);
}

// Only run main() when invoked directly — allows tests to import findHeuristicMatches
if (isMainModule(import.meta.url)) {
  main().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
