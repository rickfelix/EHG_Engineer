#!/usr/bin/env node
/**
 * youtube-backlog-clear — SD-LEO-INFRA-DISTILL-YT-REVIEW-GAP-AND-BACKLOG-CLEAR-001 (FR-2/FR-3).
 *
 * Clears the classified+unreviewed eva_youtube_intake backlog by the chairman's "auto-route by AI-rec"
 * method: each row's EXISTING ai chairman_intent is accepted as the chairman's verdict. Routable rows
 * (reference/insight -> reference lane; idea -> wave lane) get chairman_reviewed_at + status='processed'
 * stamped; rows with a null/non-routable intent are SKIPPED and reported. The physical playlist move of
 * the still-unprocessed rows is then delegated to the PROVEN lib/integrations/post-processor.js
 * (insert-to-Processed-then-delete, fail-safe + idempotent).
 *
 * DRY-RUN BY DEFAULT: the bare command reports the per-lane route plan + the would-move count and writes
 * NOTHING / moves NOTHING. Staging the review stamps + physical move requires --apply.
 * (post-processor.js has no internal dry-run, so the WHOLE move is gated behind --apply here; dry-run
 * counts come from independent read-only selects — PLAN security review C1.)
 *
 * Usage:  node scripts/eva/youtube-backlog-clear.mjs            # dry-run plan only
 *         node scripts/eva/youtube-backlog-clear.mjs --apply    # stamp reviewed + move (chairman-gated)
 */
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { planBacklogClear } from '../../lib/eva/youtube-backlog-clear.js';
import { postProcessAll } from '../../lib/integrations/post-processor.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: the classified+unreviewed
// backlog grows indefinitely -- an un-paginated read here would silently leave part of
// the backlog un-routed past the PostgREST 1000-row cap.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

dotenv.config();

const apply = process.argv.includes('--apply');

/** Load the classified+unreviewed eva_youtube_intake rows (the backlog). Read-only. */
async function loadBacklog(supabase) {
  try {
    return await fetchAllPaginated(() => supabase
      .from('eva_youtube_intake')
      .select('id, youtube_video_id, youtube_playlist_item_id, title, chairman_intent, target_application, classification_confidence, status, classified_at, chairman_reviewed_at, processed_at, destination_playlist_id')
      .not('classified_at', 'is', null)
      .is('chairman_reviewed_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (error) { console.error('Error loading backlog:', error.message); return []; }
}

function printPlan(plan) {
  const fmt = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ') || '(none)';
  console.log('=== YOUTUBE BACKLOG-CLEAR — auto-route-by-AI-rec plan ===');
  console.log(`classified+unreviewed rows : ${plan.total}`);
  console.log(`to auto-route (stamp review): ${plan.toRoute.length}   by lane: ${fmt(plan.byLane)}`);
  console.log(`to physically move now      : ${plan.toMove.length}   (unprocessed + has playlist-item id)`);
  console.log(`skipped (non-routable)      : ${plan.toSkip.length}   reasons: ${fmt(plan.skipReasons)}`);
  for (const r of plan.toRoute.slice(0, 8)) {
    console.log(`  route ${r.lane.padEnd(9)} <- ${(r.chairman_intent || '').padEnd(9)} | ${(r.title || r.youtube_video_id || '').slice(0, 56)}`);
  }
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const rows = await loadBacklog(supabase);
  const plan = planBacklogClear(rows);
  printPlan(plan);

  if (!apply) {
    console.log(`\nDRY-RUN — wrote nothing, moved nothing. Re-run with --apply to stamp ${plan.toRoute.length} reviewed + move ${plan.toMove.length}.`);
    return;
  }

  // --apply: 1) stamp chairman_reviewed_at + status='processed' on the routable rows (auto-route),
  //          2) delegate the physical playlist move to the proven post-processor.
  console.log(`\n--apply: stamping ${plan.toRoute.length} rows reviewed (auto-routed by AI intent)...`);
  let stamped = 0; const stampErrors = [];
  for (const r of plan.toRoute) {
    const { error } = await supabase
      .from('eva_youtube_intake')
      .update({ chairman_reviewed_at: new Date().toISOString(), status: 'processed' })
      .eq('id', r.id)
      .is('chairman_reviewed_at', null); // idempotent: never re-stamp an already-reviewed row
    if (error) stampErrors.push({ id: r.id, error: error.message }); else stamped++;
  }
  console.log(`  stamped reviewed: ${stamped}  (errors: ${stampErrors.length})`);

  console.log('  delegating physical playlist move to post-processor (insert-then-delete, fail-safe)...');
  const moved = await postProcessAll({ supabase, verbose: true });
  const yt = moved?.youtube || moved || {};
  console.log(`  post-processor: processed=${yt.processed ?? 'n/a'} errors=${(yt.errors || []).length}`);

  // FR-3 verify: query the ACTUAL drain state. After stamping, the review backlog
  // (chairman_reviewed_at IS NULL) is empty by construction, so it cannot reveal whether the physical
  // move happened — the honest signal is rows still status='processed' with processed_at IS NULL.
  const { count: unreviewed } = await supabase
    .from('eva_youtube_intake').select('id', { count: 'exact', head: true })
    .not('classified_at', 'is', null).is('chairman_reviewed_at', null);
  const { count: unmoved } = await supabase
    .from('eva_youtube_intake').select('id', { count: 'exact', head: true })
    .eq('status', 'processed').is('processed_at', null);
  console.log(`\nVERIFY: classified-unreviewed remaining=${unreviewed ?? '?'} (target 0). Reviewed-but-NOT-physically-moved=${unmoved ?? '?'} (target 0).`);
  if ((unmoved ?? 0) > 0) {
    console.warn(`  ⚠️  ${unmoved} row(s) reviewed but their videos are NOT yet moved out of For-Processing.`);
    console.warn('     Most likely cause: YouTube not authenticated (run `npm run eva:ideas:auth:youtube`).');
    console.warn('     Re-run this command (or the post-processor) once authenticated — the move is idempotent.');
  }
  if (stampErrors.length) for (const e of stampErrors.slice(0, 5)) console.warn(`  [stamp error] ${e.id}: ${e.error}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[youtube-backlog-clear] fatal:', e.message); process.exit(1); });
