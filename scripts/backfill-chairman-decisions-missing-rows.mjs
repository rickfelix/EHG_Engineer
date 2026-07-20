#!/usr/bin/env node
/**
 * SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-3 (original)
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-1 (this revision):
 *   5-way switch derived from venture_stages.work_type (canonical),
 *   not venture_stages.gate_type (lossy mirror).
 *
 * Canonical rule:
 *   - work_type='sd_required'     → SKIP (SD-driven, no chairman_decisions row)
 *   - work_type='decision_gate'   → derive decision_type='stage_gate'
 *   - work_type='artifact_only'   → SKIP (unless review_mode='review')
 *   - work_type='automated_check' → SKIP (system-driven)
 *   - review_mode='review'        → derive decision_type='review' (independent)
 *   - work_type=NULL/unknown      → SKIP with warning
 *
 * Empirical state at PRD time (DATABASE sub-agent LEAD verdict, 2026-05-13):
 *   0 candidates. Script ships as defense-in-depth.
 *
 * Usage:
 *   node scripts/backfill-chairman-decisions-missing-rows.mjs
 *   node scripts/backfill-chairman-decisions-missing-rows.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the ventures scan below is
// UNBOUNDED-PROCESSED (ventures grows with portfolio size; the playbook explicitly warns not
// to assume "small now"); paginate to completion, and chunk the resulting bulk upsert so
// removing the read's implicit ~1000-row ceiling doesn't push an unchunked write past a
// request-URI-too-long failure.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const UPSERT_CHUNK = 200;
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Derive decision_type from canonical work_type + auxiliary fields.
 * Returns null when the stage should NOT produce a chairman_decisions row.
 * Exported for unit testing.
 */
export function deriveDecisionType(workType, gateType, reviewMode) {
  switch (workType) {
    case 'sd_required':
      return null; // SD-driven, no chairman_decisions row
    case 'decision_gate':
      if (gateType === 'kill' || gateType === 'promotion') return 'stage_gate';
      // decision_gate without kill/promotion: fall through to review check
      if (reviewMode === 'review') return 'review';
      return null;
    case 'artifact_only':
      // Pure artifact stage, but may still need review approval
      if (reviewMode === 'review') return 'review';
      return null;
    case 'automated_check':
      return null; // Fully automated, no chairman action
    case null:
    case undefined:
      console.warn(`[backfill] WARNING: stage has NULL work_type; SKIPPING (no chairman_decisions row created)`);
      return null;
    default:
      console.warn(`[backfill] WARNING: unknown work_type='${workType}'; SKIPPING`);
      return null;
  }
}

async function main() {
  // Read canonical (venture_stages) AND auxiliary (venture_stages) in parallel.
  const [stageRes, lifecycleRes] = await Promise.all([
    supabase.from('venture_stages').select('stage_number,gate_type,review_mode'),
    supabase.from('venture_stages').select('stage_number,work_type'),
  ]);
  if (stageRes.error) throw stageRes.error;
  if (lifecycleRes.error) throw lifecycleRes.error;

  // JOIN by stage_number — build per-stage classification table
  const workTypeByStage = new Map();
  for (const row of lifecycleRes.data || []) {
    workTypeByStage.set(row.stage_number, row.work_type);
  }

  // Candidate decision stages: those whose canonical rule yields a non-null decision_type
  const classifications = new Map(); // stage_number → { gate_type, review_mode, work_type, decisionType }
  for (const row of stageRes.data || []) {
    const workType = workTypeByStage.get(row.stage_number);
    const decisionType = deriveDecisionType(workType, row.gate_type, row.review_mode);
    classifications.set(row.stage_number, {
      gate_type: row.gate_type,
      review_mode: row.review_mode,
      work_type: workType,
      decisionType,
    });
  }

  const decisionStages = [...classifications.entries()]
    .filter(([, c]) => c.decisionType !== null)
    .map(([n]) => n);

  const ventures = await fetchAllPaginated(() => supabase
    .from('ventures')
    .select('id,current_lifecycle_stage,status,killed_at')
    .in('current_lifecycle_stage', decisionStages)
    .order('id', { ascending: true }));

  const live = ventures.filter(v => v.status !== 'archived' && v.status !== 'killed' && !v.killed_at);

  const candidates = [];
  for (const v of live) {
    const { data: existing } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('venture_id', v.id)
      .eq('lifecycle_stage', v.current_lifecycle_stage)
      .limit(1);
    if (!existing || existing.length === 0) {
      const classification = classifications.get(v.current_lifecycle_stage);
      if (!classification || classification.decisionType === null) continue;
      candidates.push({
        venture_id: v.id,
        lifecycle_stage: v.current_lifecycle_stage,
        gate_type: classification.gate_type,
        review_mode: classification.review_mode,
        work_type: classification.work_type,
        derived_decision_type: classification.decisionType,
      });
    }
  }

  const summary = {
    sd_key: 'SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001',
    ran_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    decision_stages_count: decisionStages.length,
    decision_stages: decisionStages,
    ventures_on_gate_stages: live.length,
    candidates_to_backfill: candidates.length,
    candidates,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    console.error(`\n[DRY_RUN] ${candidates.length} candidates would be backfilled. Re-run with --apply to insert.`);
    return;
  }

  if (candidates.length === 0) {
    console.error('\n[APPLY] No candidates — nothing to insert.');
    return;
  }

  const rows = candidates.map(c => ({
    venture_id: c.venture_id,
    lifecycle_stage: c.lifecycle_stage,
    decision_type: c.derived_decision_type,
    status: 'pending',
    decision: 'pending',
    attempt_number: 1,
    summary: `Backfill via SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-1 for stage ${c.lifecycle_stage} (work_type=${c.work_type})`,
  }));

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: chunked because `rows` is built
  // from the now-unbounded `ventures` scan above — an unchunked upsert could carry an
  // arbitrarily large payload.
  let inserted = [];
  for (const rowChunk of chunk(rows, UPSERT_CHUNK)) {
    const { data: chunkInserted, error: e3 } = await supabase
      .from('chairman_decisions')
      // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: uq_chairman_decision_attempt was widened to
      // (venture_id, lifecycle_stage, decision_type, attempt_number) -- the old 3-column onConflict
      // target no longer matches any unique index/constraint and would 42P10.
      .upsert(rowChunk, { onConflict: 'venture_id,lifecycle_stage,decision_type,attempt_number', ignoreDuplicates: true })
      .select('id,venture_id,lifecycle_stage');
    if (e3) throw e3;
    inserted = inserted.concat(chunkInserted || []);
  }
  console.error(`\n[APPLY] Inserted ${inserted.length} chairman_decisions rows.`);
}

// Only run main() when invoked directly — allows tests to import deriveDecisionType
if (isMainModule(import.meta.url)) {
  main().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
