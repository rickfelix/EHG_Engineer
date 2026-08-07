#!/usr/bin/env node
/**
 * Enhance the auto-generated SD_COMPLETION retrospective for
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E ("Measurement provenance: stamp
 * perishability onto the existing premise-liveness path") with the genuine,
 * non-boilerplate substance of this execution.
 *
 * Base row created via `node scripts/generate-comprehensive-retrospective.js
 * e74cd20f-02b7-4142-aee7-e443421efb7d` (id 778516c3-6c10-4544-9828-fa9f32700298,
 * quality_score 90 from the generic handoff/PRD-metadata extraction). This script
 * replaces the boilerplate-heavy content with curated lessons, following the
 * established repo pattern (see
 * scripts/archive/one-time/enhance-retrospective-sd-plan-of-record-remainder-view-001.mjs).
 *
 * All figures below were independently re-verified live in this session, not
 * copied from prior evidence rows without re-checking:
 *   - `npx vitest run --project unit` against the two new provenance test files
 *     (measurement-provenance.test.js, feedback-premise-adapter-provenance.test.js)
 *     + emit-feedback-extensions.test.js: 3 files, 37/37 pass (20 in the two new
 *     files, 17 pre-existing in the batch file incl. the 2 new G2 tests).
 *   - Full 10-file named regression surface: 100/100 pass (up from the
 *     EXEC-TO-PLAN TESTING evidence's 98/98, +2 from the G2-closing commit).
 *   - Note: the EXEC-TO-PLAN TESTING evidence row's PER-FILE breakdown
 *     (measurement-provenance.test.js: 8, feedback-premise-adapter-provenance.test.js: 15)
 *     does not match the live count re-verified here (9 and 11, 20 total) — the
 *     AGGREGATE 98/98 was directionally right, but the per-file breakdown drifted.
 *     Captured honestly as a key_learning below rather than silently corrected.
 *   - sd_phase_handoffs shows 4 rejected attempts across the lifecycle (2x
 *     LEAD-TO-PLAN, 1x PLAN-TO-EXEC, 1x EXEC-TO-PLAN), all
 *     reason=PREREQUISITE_PREFLIGHT_FAILED with SUBAGENT_EVIDENCE_MISSING in
 *     every one (paired with SMOKE_TEST_MISSING on the first, USER_STORIES_BYPASSED
 *     on the PLAN-TO-EXEC one) — one more rejection than the "two + one" framing
 *     this task started from; corrected here to the ground truth.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const RETRO_ID = '778516c3-6c10-4544-9828-fa9f32700298';

const enhanced = {
  title: 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E PLAN-TO-LEAD Retrospective: Measurement Provenance Stamping',
  description:
    'Retrospective for the PLAN-TO-LEAD handoff of SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E — Instance 3 of parent SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001 ("measurements carry no provenance, so a stale premise keeps flowing after its author knows better"). Stamped { measured_at (explicit-offset UTC), timezone, git_sha, git_ref } into the EXISTING feedback.metadata jsonb at record time via ONE canonical writer (lib/governance/emit-feedback.js), carried it onto the premise descriptor (lib/eva/feedback-premise-adapter.js), and surfaced it in the [STALE_PREMISE] refusal (scripts/create-quick-fix.js). Commits 16adbbd210a (implementation, 67 insertions / 3 files + 1 new module, 20 new tests) and 924beb4b52b (batch-path gap closure, 2 new tests + EXEC-TO-PLAN evidence writers). Gates: LEAD-TO-PLAN 94, PLAN-TO-EXEC 98, EXEC-TO-PLAN 91. Final regression state (live-reverified): 100/100 across the 10-file named suite.',

  quality_score: 92,
  team_satisfaction: 9,

  what_went_well: [
    { achievement: 'AC-2 as originally written ("assert create-quick-fix.js surfaces the STALE verdict at its existing consumption point") was already true pre-implementation — the STALE_PREMISE gate and its static test already existed. The LEAD-TO-PLAN VALIDATION sub-agent caught this, PLAN tightened AC-2 to require the surfaced output to carry the NEW provenance fields, and EXEC then proved the new assertion genuinely fails against the pre-change source (git show HEAD~1:scripts/create-quick-fix.js) rather than trivially passing. A criterion that is already true before any work validates nothing.', is_boilerplate: false },
    { achievement: 'The scope-creep trap was named and pinned in the PRD, not discovered in review: 40+ call sites insert into `feedback` directly, and the nominally canonical writer (lib/governance/emit-feedback.js) had only 2 real callers before this SD. TR-2 named exactly ONE writer to modify and explicitly designated lib/coordinator/signal-router.cjs — the path the SD\'s own narrative incident actually travelled — as an out-of-scope follow-on. Verified in the diff: signal-router.cjs is absent from git diff HEAD~1 --name-only.', is_boilerplate: false },
    { achievement: 'A sub-agent-flagged "by construction" gap (emitFeedbackBatch inherits provenance because it shares _buildRowObject with the singleton emitFeedback, but had zero assertions proving it) was closed in the same session with 2 targeted tests (commit 924beb4b52b) rather than deferred to a follow-up. "By construction" claims are exactly the kind that silently stop being true after a refactor.', is_boilerplate: false },
    { achievement: 'Reused an existing UTC-normalization helper instead of writing a fourth copy of a bug class (naive-timestamp four-hour-shift) that has already been fixed independently three times in this repo (retro-filters.js parseAsUTC, wait-verdict.js, time-utils.js normalizeToUTC) — FR-3 mandated reuse and EXEC complied. Separately, the PRD\'s literal "toggle process.env.TZ" test wording did not match the repo\'s own idiom (ICU tz data is not reliably hot-swappable mid-process); TESTING flagged it and the test used the established naive-vs-explicit-offset equivalence idiom instead.', is_boilerplate: false },
    { achievement: 'checkPremiseLiveness derives LIVE/STALE purely from live re-queries and reads no timestamp off the descriptor, so provenance and staleness are orthogonal by design. TR-3 stated this explicitly in the PRD, and it was independently re-verified twice: TESTING added a direct "verdicts are IDENTICAL with and without provenance" assertion beyond what AC-1/AC-4 literally required, and the diff confirms lib/eva/premise-liveness.js is entirely untouched. This kept EXEC from rewiring the checker, which would have crossed into retraction-delivery territory reserved for sibling children -A..-D.', is_boilerplate: false },
    { achievement: 'Anti-spoof spread ordering (caller-supplied metadata spread first, provenance stamp spread last, so a caller cannot override measured_at/git_sha/git_ref) was verified by a direct code read AND a live test run (TS-6) AND independently re-confirmed by the SECURITY sub-agent\'s own live vitest run at EXEC-TO-PLAN — not asserted from a single source.', is_boilerplate: false },
    { achievement: 'Post-implementation SECURITY review (EXEC-TO-PLAN) returned zero blocking findings across command-injection, information-disclosure, log-injection, provenance-spoofing, and availability, and correctly distinguished "same shell-string git-invocation shape as the pre-existing sibling lib/eva/premise-liveness.js" from a novel exposure rather than over-flagging a pattern the repo already ships.', is_boilerplate: false }
  ],

  what_needs_improvement: [
    'All 4 rejected handoff attempts across this SD\'s lifecycle (2x LEAD-TO-PLAN, 1x PLAN-TO-EXEC, 1x EXEC-TO-PLAN) failed at PREREQUISITE_PREFLIGHT (score:0, gate pipeline never reached) — every one cited SUBAGENT_EVIDENCE_MISSING (the first LEAD-TO-PLAN attempt also cited SMOKE_TEST_MISSING; the PLAN-TO-EXEC attempt also cited USER_STORIES_BYPASSED). None reflected a substantive defect in the SD\'s content once the missing evidence was supplied — 100% preflight-sequencing friction, zero content rework.',
    'The Explore sub-agent used at LEAD-TO-PLAN is read-only and cannot persist its own sub_agent_execution_results row, so its genuine evidence had to be captured after the fact by a separate one-off script. Any future handoff requiring Explore evidence will hit this same gap.',
    'The EXEC-TO-PLAN TESTING evidence row\'s per-file test-count breakdown (measurement-provenance.test.js: 8, feedback-premise-adapter-provenance.test.js: 15) does not match the live-reverified count taken during this retrospective (9 and 11, 20 total across the two files) — the aggregate 98/98 figure was directionally correct, but a per-file number should not be trusted verbatim without a live spot-check.',
    'Wall-clock span from SD creation to EXEC-TO-PLAN acceptance was ~1h55m, almost entirely consumed by the 4 prerequisite-evidence retry cycles above; the actual EXEC build+test window (PLAN-TO-EXEC acceptance to EXEC-TO-PLAN acceptance, ~24 minutes including the mid-flight G2 fix) was efficient and within a small-child-SD budget.'
  ],

  action_items: [
    { action: 'Investigate whether Explore-sub-agent-required handoffs can get a lightweight write-capable wrapper (or a documented one-off-script fallback) so its evidence does not require an ad hoc script every time it is invoked.', category: 'protocol', is_boilerplate: false },
    { action: 'Apply the "would this AC already pass today, before any work?" check as a standing LEAD-TO-PLAN VALIDATION heuristic for every acceptance criterion, not just this SD — AC-2 here was caught, but only because a sub-agent happened to check.', category: 'protocol', is_boilerplate: false },
    { action: 'When a sub-agent evidence row cites a per-file test count, spot-check at least one file\'s count live before treating it as ground truth in a downstream retrospective or gate review — this session found a real drift (8/15 claimed vs 9/11 live) that did not change the pass/fail verdict but would compound if trusted uncritically.', category: 'process', is_boilerplate: false },
    { action: 'Non-blocking follow-on filed by SECURITY: convert defaultGit\'s execSync(`git ${argsString}`) shell-string invocation to execFileSync with an argv array in BOTH lib/governance/measurement-provenance.js and lib/eva/premise-liveness.js together (fixing only the new file and leaving the identical pattern in the old one would be inconsistent) — defense-in-depth even though no reachable caller-controlled input exists today.', category: 'technical_debt', is_boilerplate: false }
  ],

  key_learnings: [
    { learning: 'An acceptance criterion that is already true before any work validates nothing. AC-2 as first written was already satisfied by pre-existing code and an pre-existing static test; write ACs by asking "would this pass today?" — if yes, it is a description, not a criterion.', is_boilerplate: false },
    { learning: 'Scope-creep traps are best defused by naming them explicitly in the PRD, not discovering them in review. 40+ call sites insert into `feedback` directly and the "canonical" writer had only 2 real callers; the PRD pinned EXEC to exactly ONE writer and named the incident\'s own actual path (signal-router.cjs) as an explicit out-of-scope follow-on, and that boundary held in the committed diff.', is_boilerplate: false },
    { learning: 'A sub-agent\'s "by construction" gap is worth closing immediately, in the same session, rather than deferred — "by construction" is precisely the kind of claim that silently stops being true after a future refactor.', is_boilerplate: false },
    { learning: 'Reuse beats reinvention on a known, repeatedly-fixed bug class. The naive-timestamp four-hour-shift bug has been independently fixed three times in this repo; a fourth copy would have been a defect, not an implementation. Separately: a PRD\'s literal test-methodology wording (env.TZ toggling) can conflict with the repo\'s own established, more-reliable idiom (naive-vs-explicit-offset equivalence) — the sub-agent review is what catches that mismatch.', is_boilerplate: false },
    { learning: 'Provenance and staleness can be orthogonal by design: the liveness checker derived its verdict purely from live re-queries and never read the new timestamp field. Stating that explicitly in the PRD (provenance is carried evidence, not a new verdict input) stopped EXEC from rewiring the checker, which would have crossed into territory reserved for sibling children.', is_boilerplate: false },
    { learning: 'Read-only sub-agents (e.g. Explore) cannot persist their own sub_agent_execution_results row even when they genuinely ran — their evidence has to be written by a separate script after the fact. This is a process gap that recurs on every handoff requiring that sub-agent\'s evidence, not a one-off inconvenience.', is_boilerplate: false },
    { learning: 'A security review correctly distinguishing "matches a pre-existing, already-shipped pattern elsewhere in the repo" from "novel exposure" avoids both under- and over-flagging: the same execSync shell-string git invocation shape already existed in lib/eva/premise-liveness.js before this SD, so flagging it as a proportionate non-blocking hardening follow-on (covering both files together) was the right call rather than either ignoring it or blocking the handoff on it.', is_boilerplate: false },
    { learning: 'Every rejected handoff in this SD\'s lifecycle (4 of 4) failed at PREREQUISITE_PREFLIGHT — score:0, because preflight blocks before the gate-scoring pipeline ever runs — and every one cited missing sub-agent evidence. This is a strong, concrete reinforcement of CLAUDE.md prologue rule #2: invoke required sub-agents and let their evidence land BEFORE calling handoff.js, not after a rejection reveals what was missing.', is_boilerplate: false }
  ],

  success_patterns: [
    'Deterministic AC review at LEAD-TO-PLAN catches vacuous acceptance criteria (already-true-pre-implementation) before EXEC spends time proving something that needed no new code',
    'A binding scope boundary named explicitly in the PRD (ONE canonical writer, ONE named out-of-scope follow-on) holds against a 40+-call-site retrofit temptation, verified directly in the committed diff',
    '"By construction" coverage claims get closed with a real assertion in the same session rather than accepted on faith or deferred',
    'Reuse of an existing, independently-triple-fixed timestamp-normalization helper instead of a fourth copy of the same bug class',
    'Provenance-as-evidence vs verdict-as-input kept explicitly orthogonal in the PRD, preventing scope bleed into sibling children\'s (-A..-D) retraction-delivery territory',
    'SECURITY review distinguishes "matches a pre-existing shipped pattern" from "novel exposure" instead of blanket-flagging'
  ],

  failure_patterns: [
    '4 of 4 rejected handoff attempts across the SD\'s lifecycle were PREREQUISITE_PREFLIGHT_FAILED (SUBAGENT_EVIDENCE_MISSING cited in every one), not substantive gate-score failures — the gate pipeline never even ran for these attempts',
    'The Explore sub-agent\'s read-only nature required an ad hoc one-off script to record its own LEAD-TO-PLAN evidence after the fact',
    'A sub-agent evidence row\'s per-file test-count breakdown drifted from live-verified reality by retrospective time, even though the aggregate pass/fail total remained correct'
  ],

  improvement_areas: [
    'All 4 rejected handoff attempts across this SD\'s lifecycle failed at PREREQUISITE_PREFLIGHT (SUBAGENT_EVIDENCE_MISSING in every one) rather than substantive content review',
    'The Explore sub-agent cannot persist its own evidence row and needs a documented fallback',
    'Sub-agent-reported per-file test counts should be spot-checked live before being trusted verbatim downstream'
  ],

  business_value_delivered:
    'Closes a concrete measurement-provenance gap under parent SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001 (Instance 3 of 5): a claim recorded into `feedback` previously carried no record of WHEN it was measured or WHICH ref it was measured against, so a premise that was true when taken could keep flowing after it was no longer true (the SD\'s own narrated incident: PR 778 read as still-conflicting roughly 25 minutes after it had actually merged, nearly commissioning a duplicate SD). Extends existing machinery (checkFeedbackPremiseLiveness, create-quick-fix.js\'s STALE_PREMISE refusal) rather than building a new subsystem, per the SD\'s own binding scope boundary.',
  customer_impact: 'Internal harness reliability: an operator reading a STALE_PREMISE refusal can now see when and against which git ref the underlying claim was measured, closing the specific stale-premise failure mode the SD was scoped to fix.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 0,
  bugs_resolved: 0,
  tests_added: 22,
  objectives_met: true,
  on_schedule: false,
  within_scope: true,
  learning_category: 'PROCESS_IMPROVEMENT',
  related_files: [
    'lib/governance/measurement-provenance.js',
    'lib/governance/emit-feedback.js',
    'lib/eva/feedback-premise-adapter.js',
    'scripts/create-quick-fix.js',
    'tests/unit/governance/measurement-provenance.test.js',
    'tests/unit/eva/feedback-premise-adapter-provenance.test.js',
    'tests/unit/emit-feedback-extensions.test.js'
  ],
  related_commits: ['16adbbd210a', '924beb4b52b'],
  affected_components: ['Feedback Governance', 'Premise Liveness', 'Quick-Fix Creation Gate'],
  tags: ['measurement-provenance', 'premise-liveness', 'feedback-metadata', 'stale-premise', 'infra-hardening', 'plan-to-lead']
};

async function main() {
  const { data, error } = await supabase
    .from('retrospectives')
    .update(enhanced)
    .eq('id', RETRO_ID)
    .select('id, quality_score, team_satisfaction, status')
    .single();

  if (error) {
    throw new Error(`Failed to update retrospective: ${error.message}`);
  }

  console.log('\nRetrospective enhanced successfully!');
  console.log(JSON.stringify(data, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
