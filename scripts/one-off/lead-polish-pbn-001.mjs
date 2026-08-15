// LEAD-phase field polish for SD-LEO-FEAT-PROVEN-BETTER-NEW-001.
// Fixes: scope==description duplicate (GATE_SD_QUALITY warning), generic rationale,
// 100%-default-template strategic_objectives/key_changes (GATE_PLACEHOLDER_CONTENT_DETECTION),
// generic auto-generated smoke_test_steps (SMOKE_TEST_SPECIFICATION hard fail, LEAD Q9).
// Content is grounded in docs/plans/archived/sd-leo-feat-proven-better-new-001-plan.md
// (the chairman-ratified plan) and the Explore sub-agent evidence stored this session
// (id=27407853-2e50-4600-a6fb-bcd9c7183b6c) — no new claims invented beyond those sources.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const scope = `IN SCOPE: an AI scoring skill at the nursery->Stage-0 promotion boundary (hook point: lib/eva/stage-zero/chairman-review.js, before persistVentureBrief() commits decision==='ready') that decomposes each raw venture_nursery idea into three cited buckets — PROVEN (incumbent mechanics + evidence of existing demand, cited to a real market referent), BETTER (named friction in the proven model + a testable improvement hypothesis), NEW (exactly one novel wedge, pre-declared expected-to-fail) — plus hard codeable gate rules: empty-proven=REJECT, new>1=trim-or-reject, verdict+per-bucket citations persist ON the venture_nursery row, re-check at unpark. REUSES venture_nursery + the SEAMS-hardened promotion path (lib/eva/stage-zero/venture-nursery.js) and searchExistingInfrastructure (lib/utils/validation-automation.js) for internal dedup lookup. EXPLICITLY OUT OF SCOPE (deferred, per Solomon sequencing + chairman ruling): the pre-code idea_probe demand probe (verdict_scope=idea_probe on venture_demand_verdicts, next SD); the automated Client Success Manager (post-first-revenue); trend+competitor ideation intake unpark (post-revenue). NOT IN SCOPE: any new demand-scoring backend, competitive-research engine, or parallel data store — venture_demand_verdicts (lib/marketing/venture-activation-gate.js) is a DIFFERENT, POST-build layer (marketing-channel autonomy on an already-launched venture) with no production writer today; this SD does not modify it, only documents the future linkage as designed-not-wired.`;

const rationale = `Chairman-ratified 2026-08-12 (SMS "A", capture 02318a28) after commissioning Solomon to evaluate a programmatic venture-validation approach. Business problem: the venture factory's only demand instrument (venture_demand_verdicts / computeActivationVerdict) fires POST-commitment — a venture is demand-tested only after it is built — and "merit" at the nursery->Stage-0 promotion point has no definition today (conductChairmanReview maps maturity straight to a decision with zero scoring/evidence check). The Proven/Better/New framework supplies that definition and moves the first filter before code is written, reducing the cost of a bad promotion from "a built-and-launched venture fails its demand floor" to "an idea is rejected or trimmed before any code exists." Value is proportional to venture-factory throughput: every promoted idea that would have failed PROVEN or exceeded NEW>1 is a full build-cycle saved.`;

const strategic_objectives = [
  'Define "merit" at the nursery->Stage-0 promotion boundary with a codeable, two-sided gate (empty-proven rejects, new>1 trims) — closing the gap conductChairmanReview() has today (maturity-only decision, zero evidence check)',
  'Move the venture factory\'s first demand filter BEFORE code/build commitment, catching an unpromising idea at the nursery stage instead of after a full build+launch cycle',
  'Reuse existing rails only: venture_nursery + the SEAMS-hardened promotion path for storage/selection, searchExistingInfrastructure for internal dedup — add no new demand backend, competitive-research engine, or parallel store',
  'Establish coverage-not-completeness reporting (an un-evidenceable bucket is marked, never fabricated) so the gate is honest about what it could and could not cite',
];

const key_changes = [
  { change: 'Add a PBN scoring skill invoked at the nursery->Stage-0 promotion boundary (chairman-review.js, before the decision==="ready" branch) that decomposes a venture_nursery idea into PROVEN/BETTER/NEW buckets with per-bucket citations', impact: 'Introduces the first pre-commitment merit check in the venture factory pipeline; a rejected/trimmed idea never reaches a ventures-table insert' },
  { change: 'Persist the PBN verdict + per-bucket citation objects on the venture_nursery row (never a fused unresolvable blob — per-bucket, per the PER-001 lesson)', impact: 'Verdict becomes queryable/auditable per-idea; downstream consumers (chairman review, future idea_probe SD) read structured citations instead of free text' },
  { change: 'Implement hard gate rules as codeable predicates: empty-proven-bucket=REJECT, new-bucket>1=trim-or-reject, re-check at unpark with a fresh measurement timestamp', impact: 'Gate behavior becomes deterministic and testable via a two-sided control fixture (proven-clone PASSES, all-new REJECTS, two-wedge TRIMS)' },
  { change: 'Document (not implement) the future linkage from BETTER-bucket hypotheses to venture_demand_verdicts as a designed-but-not-wired future dependency, since no production writer exists for that table today', impact: 'PRD and future idea_probe SD inherit an accurate premise instead of an aspirational one; prevents a future SD from assuming wiring that does not exist' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Run the PBN scorer against a known-proven-clone fixture idea (an idea whose PROVEN bucket cites a real, resolvable market referent, e.g. an existing SaaS category leader)', expected_outcome: 'Verdict=PASS; venture_nursery row shows per-bucket citation objects for PROVEN/BETTER/NEW; the cited referent resolves' },
  { step_number: 2, instruction: 'Run the PBN scorer against an all-new fixture idea (empty PROVEN bucket, no incumbent-mechanics citation)', expected_outcome: 'Verdict=REJECT per the empty-proven hard rule; nursery row records the rejection reason and the un-evidenceable bucket, not a fabricated citation' },
  { step_number: 3, instruction: 'Run the PBN scorer against a two-wedge fixture idea (NEW bucket contains 2 novel elements instead of exactly 1)', expected_outcome: 'Verdict=TRIM (or REJECT) per the new>1 hard rule; the trimmed/rejected wedge is identified in the persisted verdict' },
];

const { data: before, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (fetchErr) throw fetchErr;
if (!before) throw new Error(`SD not found: ${SD_KEY}`);

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ scope, rationale, strategic_objectives, key_changes, smoke_test_steps })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, scope, rationale, strategic_objectives, key_changes, smoke_test_steps')
  .maybeSingle();
if (updateErr) throw updateErr;

console.log('UPDATED:', updated.sd_key);
console.log('scope length:', updated.scope.length);
console.log('rationale length:', updated.rationale.length);
console.log('strategic_objectives count:', updated.strategic_objectives.length);
console.log('key_changes count:', updated.key_changes.length);
console.log('smoke_test_steps count:', updated.smoke_test_steps.length);
