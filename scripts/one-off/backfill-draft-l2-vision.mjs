#!/usr/bin/env node
/**
 * SD-LEO-INFRA-RELIABLE-S19-BUILD-001 / FR-4 — backfill draft_seed L2 vision docs.
 *
 * In-flight leo_bridge ventures already past S17 never ran the new
 * _postStageHook_S17_SeedDraftVision, so they have NO L2 vision and would hit
 * VENTURE_L2_VISION_MISSING at the S19 gate (now fail-loud). This seeds a
 * status='draft_seed' L2 vision for each affected venture using the SAME
 * seedDraftL2Vision logic the S17 hook uses.
 *
 * Selection: ventures with current_lifecycle_stage BETWEEN 17 AND 20,
 *   COALESCE(build_model,'leo_bridge') <> 'seeded_repo',
 *   and NO eva_vision_documents row with level='L2' + status='active' + chairman_approved=true.
 * seedDraftL2Vision itself is idempotent (no-op if ANY L2 doc — incl. draft_seed — exists),
 * so a venture that already has an unapproved draft_seed L2 is left untouched.
 *
 * Does NOT auto-approve and does NOT reroute build_model.
 *
 * DRY-RUN by default (lists affected ventures); pass --apply to mutate.
 *
 * Usage:
 *   node scripts/one-off/backfill-draft-l2-vision.mjs           # dry-run
 *   node scripts/one-off/backfill-draft-l2-vision.mjs --apply   # mutate
 */

import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { seedDraftL2Vision } from '../lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const supabase = await createSupabaseServiceClient('engineer');

  console.log(`[backfill-draft-l2] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // 1. Candidate ventures: stage 17-20, not seeded_repo.
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, build_model')
    .gte('current_lifecycle_stage', 17)
    .lte('current_lifecycle_stage', 20);

  if (vErr) {
    console.error('[backfill-draft-l2] venture query failed:', vErr);
    process.exit(1);
  }

  const candidates = (ventures || []).filter(
    (v) => (v.build_model || 'leo_bridge') !== 'seeded_repo'
  );
  console.log(`[backfill-draft-l2] stage 17-20 ventures: ${ventures?.length ?? 0}; non-seeded_repo candidates: ${candidates.length}`);

  // 2. Exclude ventures that already have a chairman-approved canonical L2 vision.
  const affected = [];
  for (const v of candidates) {
    const { data: approved, error: aErr } = await supabase
      .from('eva_vision_documents')
      .select('vision_key')
      .eq('venture_id', v.id)
      .eq('level', 'L2')
      .eq('status', 'active')
      .eq('chairman_approved', true)
      .limit(1)
      .maybeSingle();
    if (aErr) {
      console.error(`[backfill-draft-l2] approved-L2 check failed for ${v.id}:`, aErr.message);
      process.exit(2);
    }
    if (!approved) affected.push(v);
  }

  console.log(`[backfill-draft-l2] ventures needing a draft_seed L2 (no approved canonical L2): ${affected.length}`);
  for (const v of affected) {
    console.log(`   - ${v.name || '(unnamed)'} (id=${v.id}, stage=${v.current_lifecycle_stage}, build_model=${v.build_model || 'leo_bridge (default)'})`);
  }

  if (affected.length === 0) {
    console.log('[backfill-draft-l2] Nothing to backfill. Idempotent no-op.');
    return;
  }

  if (!APPLY) {
    console.log('[backfill-draft-l2] DRY-RUN — no changes made. Re-run with --apply to seed draft_seed L2 visions.');
    return;
  }

  let seeded = 0;
  let skipped = 0;
  let failed = 0;
  for (const v of affected) {
    const res = await seedDraftL2Vision({
      supabase,
      ventureId: v.id,
      ventureName: v.name,
      logger: console,
    });
    if (res.error) {
      console.error(`[backfill-draft-l2] FAILED for ${v.id}:`, res.error.message);
      failed += 1;
    } else if (res.skipped) {
      // An L2 (e.g. an existing unapproved draft_seed) already exists — left untouched.
      skipped += 1;
    } else {
      console.log(`[backfill-draft-l2] OK ${v.name || v.id}: seeded ${res.vision?.vision_key}`);
      seeded += 1;
    }
  }

  console.log(`[backfill-draft-l2] Done. seeded=${seeded}, skipped(existing L2)=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(3);
}

main().catch((e) => {
  console.error('[backfill-draft-l2] Unexpected error:', e);
  process.exit(99);
});
