#!/usr/bin/env node
/**
 * SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-3
 *
 * Idempotent rescue for ventures stuck on decision-creating stages with no
 * chairman_decisions row. Dry-run by default; --apply gated on explicit
 * chairman approval.
 *
 * Empirical state at PRD time (DATABASE sub-agent LEAD verdict, 2026-05-13):
 *   0 candidates. Script ships as defense-in-depth.
 *
 * Predicate: gate_stages = stage_config WHERE (gate_type IN kill/promotion OR
 *   review_mode = 'review'). Candidate ventures = ventures on a gate_stage with
 *   NO chairman_decisions row at ANY status (subsumes the partial-unique-pending
 *   index — see DATABASE sub-agent PLAN row c866978f for the why).
 *
 * Usage:
 *   node scripts/backfill-chairman-decisions-missing-rows.mjs
 *   node scripts/backfill-chairman-decisions-missing-rows.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: gateStages, error: e1 } = await supabase
    .from('stage_config')
    .select('stage_number,gate_type,review_mode');
  if (e1) throw e1;

  const decisionStages = gateStages
    .filter(s => ['kill', 'promotion'].includes(s.gate_type) || s.review_mode === 'review')
    .map(s => s.stage_number);

  const { data: ventures, error: e2 } = await supabase
    .from('ventures')
    .select('id,current_lifecycle_stage,status,killed_at')
    .in('current_lifecycle_stage', decisionStages);
  if (e2) throw e2;

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
      const stageRow = gateStages.find(s => s.stage_number === v.current_lifecycle_stage);
      const decisionType = ['kill', 'promotion'].includes(stageRow.gate_type) ? 'stage_gate' : 'review';
      candidates.push({
        venture_id: v.id,
        lifecycle_stage: v.current_lifecycle_stage,
        gate_type: stageRow.gate_type,
        review_mode: stageRow.review_mode,
        derived_decision_type: decisionType,
      });
    }
  }

  const summary = {
    sd_key: 'SD-LEO-REFAC-GATE-DECISION-CREATION-001',
    ran_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    decision_stages_count: decisionStages.length,
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
    summary: `Backfill via SD-LEO-REFAC-GATE-DECISION-CREATION-001 FR-3 for stage ${c.lifecycle_stage}`,
  }));

  const { data: inserted, error: e3 } = await supabase
    .from('chairman_decisions')
    .upsert(rows, { onConflict: 'venture_id,lifecycle_stage,attempt_number', ignoreDuplicates: true })
    .select('id,venture_id,lifecycle_stage');
  if (e3) throw e3;
  console.error(`\n[APPLY] Inserted ${inserted?.length || 0} chairman_decisions rows.`);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
