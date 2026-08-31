import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-LEO-PHASE-TAGGED-001';

const description = `Chairman-ordered (in-terminal 2026-08-31, A5 telemetry lever of the ratified burn-lever plan): add LEO-phase and SD-key tagging to the existing token-telemetry pipeline (context_usage_log, built by SD-LEO-INFRA-BURN-TELEMETRY-PER-001) so per-phase, per-SD burn becomes queryable and joinable to gate outcomes. Explore (LEAD phase) confirmed the write/sync/upsert pipeline, compaction detection, and outcome-side data (sub_agent_execution_results.phase/sd_id, sd_phase_handoffs.sd_id/from_phase/to_phase) already exist and are reusable -- this SD closes the missing SD-key/phase tag on the COST side and wires the join, rather than rebuilding the pipeline. A pre-built, immutable baseline-snapshot slot (sd_phase_handoffs.baseline_snapshot.metrics, added by the phase-snapshot-window migration) is explicitly reserved for exactly this data and currently empty.`;

const scope = `IN SCOPE (measurable core, corrected after LEAD-phase Explore found the real gap boundary):
- FR-1: tag context_usage_log rows with LEO phase + SD key at WRITE time (not retroactive join) -- Explore's key hazard finding: claude_sessions.sd_key is a point-in-time claim field, not historical per-snapshot data, so a long-lived session touching multiple SDs would misattribute tokens if joined retroactively. Follow the existing CLAUDE_LOOP_NAME env-var pattern: read an env var (e.g. CLAUDE_LEO_PHASE, CLAUDE_LEO_SD_KEY) at each statusline-hook tick, set/cleared by the worker loop as it transitions phases.
- FR-2: join token cost to gate outcome -- populate the reserved sd_phase_handoffs.baseline_snapshot.metrics slot with real token deltas per phase attempt, using the already-existing is_self_transition flag (v_phase_snapshot_windows) to distinguish first-pass from rework without inventing new phase-cycle detection.
- FR-3: sub-agent evidence cost -- extend the existing v_agent_class_rates join pattern (sub_agent_execution_results x sd_type) with a token-cost column sourced from FR-1's tagged rows, joined on sd_id + phase + a time window bounded by the sub-agent's own execution_time.
- FR-4: gap visibility -- an SD/phase with zero recorded token rows must render as an explicit "instrumentation gap" in any rollup query/view, never silently absent (Explore confirmed today's aggregation functions silently omit zero-row groups; this SD must not repeat that for the new phase-scoped views).
- FR-5: replicate the existing fail-soft/piggyback posture exactly (worker-checkin.cjs's try/catch-wrapped tickContextUsageSync pattern) -- no dispatch/cadence changes, confirmed as the existing pipeline's posture and the passive-meter constraint both this SD and CLAUDE.md's normal-ops ruling require.
DESCOPED (>10% reduction per LEAD deletion-audit, follow-up SD if wanted):
- Per-QF-tier rollups (criterion 5's QF-tier half) -- no existing tier-aware telemetry pattern to extend; would require inventing new infra rather than wiring existing infra, disproportionate to this SD's wiring-focused scope.
- Comms-vs-build session-class split (part of criterion 6) -- Explore found ZERO existing analog anywhere in the surveyed pipeline (loop_name/working_directory don't encode this axis); this is a genuinely new classification scheme, not a join, and belongs in its own SD.
- Cache-rebuild-cost-per-compaction-event as a STANDALONE deliverable (criterion 6's other half) -- compaction detection/analysis already exists (get_compaction_analysis) and will be phase/SD-scoped for free once FR-1 lands; no separate work needed, folded into FR-1's outcome rather than built separately.
UNCHANGED FROM ORIGINAL:
- Criterion 7 (EHG intelligence_budget_tracking cited as prior art, not merged) -- Explore independently verified zero schema overlap; no action needed beyond the citation already in this SD.`;

const success_criteria = [
  { criterion: 'context_usage_log rows are tagged with LEO phase + SD key at write time, not via a fragile retroactive join', measure: 'A worker loop transitioning through claim -> LEAD-TO-PLAN -> PRD -> EXEC -> gates -> PR -> completion produces context_usage_log rows each correctly tagged to the phase and SD key active at write time, verified across a session that touches 2+ SDs sequentially' },
  { criterion: 'Token cost per phase-attempt is queryable and joined to pass/fail/retry outcome via the existing baseline_snapshot.metrics slot', measure: 'A query joining sd_phase_handoffs.baseline_snapshot.metrics to validation_passed for a real SD shows non-null token deltas per attempt, with first-pass vs rework distinguishable via is_self_transition' },
  { criterion: 'Sub-agent invocation cost is joinable to whether that evidence changed a gate outcome', measure: 'v_agent_class_rates (or an extension of it) can be joined to per-invocation token cost sourced from FR-1 tagged rows' },
  { criterion: 'A phase with zero recorded tokens is loud, not silent, in any new rollup view', measure: 'A fixture SD/phase with deliberately zero context_usage_log rows renders an explicit instrumentation-gap indicator in the new rollup query, not silent omission' },
  { criterion: 'The meter observes only -- zero dispatch/cadence side effects', measure: "The new write/sync logic is wrapped fail-soft exactly like the existing tickContextUsageSync pattern; a forced failure in the new logic does not affect /checkin's result or exit code" }
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run a worker-checkin.cjs claim cycle for a real SD through at least 2 phase transitions, then query context_usage_log for rows written during that window.',
    expected_outcome: 'Rows are tagged with both the correct LEO phase and the correct SD key at the time each row was written, not the SD key from a later or earlier claim.'
  },
  {
    step_number: 2,
    instruction: 'Query sd_phase_handoffs.baseline_snapshot.metrics for a completed SD phase handoff.',
    expected_outcome: 'The reserved metrics field is populated with real token-cost data (not the empty {} placeholder), and a rejected-then-retried phase shows is_self_transition=true with distinguishable token cost between the two attempts.'
  },
  {
    step_number: 3,
    instruction: 'Deliberately force a fixture SD/phase to have zero context_usage_log rows, then run the new rollup query/view against it.',
    expected_outcome: 'The rollup explicitly flags the zero-row SD/phase as an instrumentation gap (a visible marker), rather than the row simply being absent from the output with no indication anything is missing.'
  }
];

async function main() {
  const { data: existing } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = { ...(existing?.metadata || {}), lead_scope_correction: "Explore (LEAD) surveyed existing BURN-TELEMETRY-PER-001 pipeline: write/sync/upsert, outcome-side phase+sd_id tagging, and a reserved baseline_snapshot.metrics slot all already exist and are reusable. Scope narrowed to closing the SD-key/phase gap on the COST side (write-time env-var tagging, avoiding a point-in-time claude_sessions.sd_key retroactive-join hazard) and wiring the join -- QF-tier rollups and comms-vs-build split descoped as genuinely new classification schemes disproportionate to this SD's wiring-focused scope." };
  const { error } = await supabase.from('strategic_directives_v2')
    .update({ description, scope, success_criteria, smoke_test_steps, metadata, scope_reduction_percentage: 25 })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK enriched', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
