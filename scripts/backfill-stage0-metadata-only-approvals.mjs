#!/usr/bin/env node
/**
 * QF-20260712-481: backfill chairman_decisions for ventures whose Stage-0 approval was
 * stamped directly into metadata.stage_zero.chairman_approval instead of a real decision row
 * (pre-isfixture-fix reachability gap: the old isFixtureVenture launch_mode check silently
 * skipped mintStageZeroGate, so createOrReusePendingDecision never ran -- fixed going forward
 * by SD-FDBK-FIX-ISFIXTUREVENTURE-FALSE-POSITIVES-001, but that fix does not retro-process
 * approvals stamped BEFORE it shipped). decision-activation.js only consumes EXISTING
 * chairman_decisions rows, so these ventures can never self-resolve. This backfills the
 * canonical row from the metadata stamp, then invokes the real activation consumer so
 * activation (status->active, awaiting_chairman_decision->false) happens through the same
 * path a normal approval would -- never hand-flips the flag directly.
 *
 * Usage:
 *   node scripts/backfill-stage0-metadata-only-approvals.mjs           (dry-run)
 *   node scripts/backfill-stage0-metadata-only-approvals.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { processStageZeroDecisions } from '../lib/eva/stage-zero/decision-activation.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const APPLY = process.argv.includes('--apply');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: ventures, error } = await supabase
    .from('ventures')
    .select('id, name, metadata')
    .eq('status', 'paused')
    .eq('metadata->stage_zero->>awaiting_chairman_decision', 'true')
    .eq('metadata->stage_zero->chairman_approval->>approved', 'true');
  if (error) throw error;

  const candidates = [];
  for (const v of ventures || []) {
    const { data: existing } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('venture_id', v.id)
      .eq('lifecycle_stage', 0)
      .eq('decision_type', 'stage_gate')
      .limit(1);
    if (!existing?.length) candidates.push(v);
  }

  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', candidates: candidates.map(v => ({ id: v.id, name: v.name })) }, null, 2));
  if (!candidates.length) { console.error('\nNo stranded metadata-only approvals found.'); return; }
  if (!APPLY) { console.error(`\n[DRY_RUN] ${candidates.length} candidate(s). Re-run with --apply to backfill.`); return; }

  for (const v of candidates) {
    const stamp = v.metadata.stage_zero.chairman_approval;
    const { error: insErr } = await supabase.from('chairman_decisions').insert({
      venture_id: v.id,
      lifecycle_stage: 0,
      decision_type: 'stage_gate',
      status: 'approved',
      decision: 'proceed',
      rationale: `Backfilled from pre-existing metadata stamp (QF-20260712-481): ${stamp.note}`,
      decided_by: `chairman_metadata_backfill (orig approver: ${stamp.approver})`,
      context: { stage: 0, timestamp: new Date().toISOString(), backfill_source: 'QF-20260712-481', original_approved_at: stamp.approved_at },
      created_at: stamp.approved_at,
    });
    if (insErr) { console.error(`  x ${v.id} insert failed: ${insErr.message}`); continue; }
    console.error(`  + ${v.id} (${v.name}) backfilled`);
  }

  const summary = await processStageZeroDecisions({ supabase, logger: console });
  console.error(`\n[Activation] ${JSON.stringify(summary)}`);
}

if (isMainModule(import.meta.url)) {
  main().catch(err => { console.error('Backfill failed:', err); process.exit(1); });
}
