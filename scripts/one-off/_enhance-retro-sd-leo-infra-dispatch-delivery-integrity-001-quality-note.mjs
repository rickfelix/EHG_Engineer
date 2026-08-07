// Second pass: record the HONEST quality assessment inside metadata, because
// validate_retrospective_quality_trigger (BEFORE INSERT OR UPDATE on this table)
// mechanically discards any caller-supplied quality_score and recomputes its own
// prose-completeness/specificity heuristic (observed: my explicit 88 was silently
// replaced with 100 on the prior write). This is a documented, previously-signalled
// harness bug (retrospective id 33857181-36fa-4ec6-8a64-1147f9318091, feedback
// 6dc346b9: "the retrospective quality trigger cannot store an honest low score").
// Same workaround as that precedent: metadata.retro_assigned_quality_score is the
// authoritative number; the top-level quality_score column is machine-owned and
// not comparable across rows or time.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = 'fd442d13-f751-4651-833d-31522452eb63';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';

const { data: current, error: readErr } = await s
  .from('retrospectives')
  .select('id, sd_id, quality_score, metadata')
  .eq('id', RETRO_ID)
  .single();

if (readErr) { console.error('READ ERROR:', readErr.message); process.exit(1); }

const mergedMetadata = {
  ...current.metadata,
  sd_key: SD_KEY,
  branch: 'feat/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
  merged: false,
  worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
  commits: 14,
  frs_shipped: ['FR-1', 'FR-3', 'FR-4', 'FR-5', 'FR-6', 'FR-7'],
  frs_blocked: ['FR-2 (migration drafted + file-level tested, NOT applied to live DB — chairman-gated CREATE OR REPLACE FUNCTION DDL)'],
  gate_scores: {
    'LEAD-TO-PLAN_first_attempt': 0,
    'LEAD-TO-PLAN': 95,
    'PLAN-TO-EXEC_first_attempt': 0,
    'PLAN-TO-EXEC': 97,
    'EXEC-TO-PLAN_first_attempt': 0,
    'EXEC-TO-PLAN_second_attempt': 0,
    'EXEC-TO-PLAN': 93,
  },
  trigger_name: 'validate_retrospective_quality_trigger',
  trigger_semantics: 'prose completeness + specificity heuristic; discards any caller-supplied quality_score on every write; the column is machine-owned and not meaningfully comparable across rows or time',
  quality_score_is_agent_settable: false,
  trigger_assigned_quality_score: current.quality_score,
  trigger_assigned_quality_score_note: `Explicit quality_score:88 supplied on the prior UPDATE was silently discarded and replaced with ${current.quality_score} by the trigger — matching the documented behavior on retrospective 33857181-36fa-4ec6-8a64-1147f9318091 (feedback 6dc346b9). Not treated as this retrospective's true assessment; see retro_assigned_quality_score below.`,
  retro_assigned_quality_score: 63,
  score_rationale: {
    craft_of_shipped_work: 90,
    purpose_achievement: 40,
    composite: 63,
    note: 'craft_of_shipped_work is high: both incident classes (Part A stranding, Part B fail-fatal-abort) are fully built, mutation-tested, and adversarially re-verified across 3 independent phases, with a genuine self-recursion camouflage bug found and fixed inside the fix itself. purpose_achievement is capped well below craft because NONE of it is live in production yet: the branch is unmerged (confirmed) and the RPC-level root fix (FR-2) is chairman-gated and unapplied (5/5 verification checks FAIL, re-checked live at retrospective time) — so the 2026-07-26 incident class remains fully exploitable in production right now (1 row, QF-20260727-157, currently matches the exact stranded signature). Composite is a judgment call, not a formula, weighted toward purpose because delivered value is what the SD exists to produce, but pulled up by the unusually rigorous, triply-adversarial craft.',
  },
  technical_debt_addressed_detail: 'Generalized a one-off compensating write (previously only on stale-session-sweep.cjs\'s SD branch, per the pre-existing CLAIM_BOUNDARY_PROBE comment) into a shared, guarded clear+revert helper reused by every currently-known JS-level stranding site; unified two independently-drifting supply-gauge predicates (coordination-events.cjs:193-194 and :496) into one shared predicate module; converted a fail-fatal per-target dispatch loop into skip-and-continue with a durable, deduplicated, fail-soft delivered/attempted ratio alarm.',
  technical_debt_created_detail: 'FR-4\'s gauge-narrowing measurably increases detectThunderingHerd\'s sensitivity to the same idle-worker count, with zero test coverage or explicit PRD acknowledgment (REGRESSION R2). ~15 of 16 release_sd RPC callers remain on the unpatched function until the chairman-gated migration applies; the tested "repair already-stranded row" mode (clearAndReopenQf without expectedHolder) is implemented and unit-tested but wired into zero production call sites.',
};

const { data, error } = await s
  .from('retrospectives')
  .update({ metadata: mergedMetadata })
  .eq('id', RETRO_ID)
  .select('id, sd_id, quality_score, metadata')
  .single();

if (error) { console.error('ENHANCE ERROR:', error.message); process.exit(1); }

if (data.sd_id !== current.sd_id) {
  console.error('ENHANCE ERROR: sd_id mismatch after update — refusing to report success.');
  process.exit(1);
}

console.log('Quality-note update written to', data.id);
console.log('  trigger-assigned (mechanical) quality_score:', data.quality_score);
console.log('  retro_assigned_quality_score (authoritative):', data.metadata.retro_assigned_quality_score);
