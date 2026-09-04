#!/usr/bin/env node
/**
 * Improves the auto-generated (preflight_autogen) SD_COMPLETION retrospective for
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D with genuine, SD-specific content — the existing
 * row (id ba7eaba4-7029-4796-b576-17e9af5e96bb) is templated boilerplate ("SD X defined
 * success metric Y with target Z", generic FR_PATTERN/EXECUTION_TIMELINE entries, and a
 * stale what_needs_improvement citing "blocking issues from: TESTING" derived from
 * counting ALL historical rows rather than the latest-per-agent verdict) that never
 * names the actual shipped work: the named-axis/no-op-default seatIdleVerdict predicate,
 * the frozen-population differential harness, the stale-is_coordinator gap the harness's
 * own excluded fixture was hiding, or the SEC-1 fail-open-vs-fail-closed fix. This script
 * REPLACES what_went_well / what_needs_improvement / key_learnings / action_items /
 * success_patterns / failure_patterns with specifics, keeping the row id, sd_id, quality
 * metadata, and PUBLISHED status intact — same pattern as
 * scripts/one-off/improve-retro-coordinator-loaded-quiet-002.mjs.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '63b99adc-5a32-45f5-9409-f193c34fd438';
const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D';
const RETRO_ID = 'ba7eaba4-7029-4796-b576-17e9af5e96bb';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const s = createClient(url, key);

  const patch = {
    what_went_well: [
      {
        achievement:
          'The named-axis, no-op-default predicate pattern (lib/fleet/seat-idle-predicate.mjs, seatIdleVerdict) reused the shape already proven in lib/fleet/claim-eligibility.cjs (INELIGIBILITY_AXES) instead of inventing a new consolidation technique: each axis is a pure (session, ctx) => reason|null check with a documented no-op default, so a caller supplying ctx={} gets a well-defined baseline (today\'s isDispatchableFleetMember identity check, with the stale is_coordinator gap closed) rather than silently inheriting whichever axis a wrapper happened to wire first. This is also what let the consolidation avoid the failure mode of the two prior withdrawn attempts (SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001, withdrawn mid-LEAD after a blind-substitution regression; SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001, shipped a census and zero code).',
        is_boilerplate: false,
      },
      {
        achievement:
          'The frozen-population differential technique (lib/fleet/fr3-idle-consolidation-differential.mjs) compared each of the four consumers\' REAL pre-migration function (isLiveCountableWorker, isDispatchableFleetMember, isBuildForbiddenSession, eligibleIdleWorkers — none deleted, so this is not a reimplementation) against its REAL live post-migration call, over a frozen session-fixture population, and checked every observed verdict change against an explicit PER-CONSUMER x PER-REASON MATRIX rather than a flat allow-list — catching that the correct implementation legitimately changes verdicts on at least three more reasons (QF-holder, released-shell, spin-up-grace) than the original two-reason allow-list would have permitted.',
        is_boilerplate: false,
      },
      {
        achievement:
          'Two gate-review findings were caught and fixed BEFORE merge rather than discovered as production incidents: EXEC-phase TESTING (evidence cf105d66) measured that the frozen population excluded \'stale-is-coordinator\' as a test fixture, which was hiding this SD\'s own headline fix (fleet-dashboard\'s isDispatchableFleetMember never checked is_coordinator at all, flipping on both bool and JSON-string shapes; adam-quiet-tick\'s isBuildForbiddenSession is boolean-only so it flips only on the string shape) — fixed in commit 37a949dac94 by adding both shapes to the matrix and asserting all four consumer flips per-shape.',
        is_boilerplate: false,
      },
      {
        achievement:
          'EXEC-TO-PLAN SECURITY (evidence 9949b384) surfaced a real fail-open-vs-fail-closed gap: idle-ctx-population.mjs\'s three try/catch blocks were unreachable for the DOMINANT failure mode, because postgrest-js 2.103.0 resolves a query fault as a RETURNED {data:null, error} rather than a thrown exception — so a query error was silently degrading qfHolderSessionIds/seatBusySessionIds to empty Sets (fail-open toward over-dispatch, the wrong direction) instead of reaching the correctly-written catch bodies. Fixed in commit 0541375a60f by destructuring `error` alongside `data` on all three queries and throwing it into the existing (already-correct) catch bodies — a one-line-per-query change once the DEFECT LOCATION was correctly diagnosed as "the throw never happens", not "the catch body is wrong".',
        is_boilerplate: false,
      },
      {
        achievement:
          'The two SECURITY findings that were genuinely out of THIS SD\'s scope (SEC-2: no role-singleton axis for coordinator/solomon in seatIdleVerdict; SEC-4: lib/claim/build-forbidden-session.cjs remains boolean-only on is_coordinator, now disagreeing with the four migrated consumers that accept the JSON-string shape too) were named explicitly and filed as follow-up tickets (QF-20260904-962, QF-20260904-968) rather than silently deferred or scope-crept into this PR.',
        is_boilerplate: false,
      },
    ],
    what_needs_improvement: [
      'The stale-is_coordinator gap (fleet-dashboard never checking is_coordinator at all) was only caught because the FR-3 frozen-population differential\'s allow-list was reviewed by TESTING for what it excluded, not just what it included — a differential harness whose frozen population omits the fixture that would prove the SD\'s own headline fix is a harness that can pass green while the fix it exists to prove is silently absent. Worth a standing checklist item: for any "prove behavioural equivalence" harness, explicitly enumerate which fixture proves the PRIMARY defect the SD claims to fix, not only the fixtures for secondary/incidental changes.',
      'The SEC-1 fail-open bug (unreachable try/catch because postgrest-js returns rather than throws) was a VERBATIM lift from an existing, already-shipped consumer (coordinator-idle-qf-hint.mjs) — this SD promoted that same pattern into a shared module with a header advertising a fail-closed guarantee it did not actually provide, and added a second consumer, doubling the blast radius of a pre-existing bug rather than introducing a new one. Promoting an existing helper into a shared/SSOT module is exactly the moment to re-verify its documented guarantees against the actual client library behaviour (postgrest-js resolves errors as return values, not throws — a project-wide pattern worth a lint/grep sweep rather than relying on per-SD SECURITY review to catch each instance).',
      'The auto-generated preflight retrospective for this SD (before this pass) was pure boilerplate — templated "SD X defined success metric Y" entries, a REWORK_PATTERN citing repeated handoffs without noting WHY (a legitimate LEAD-TO-PLAN re-approval plus an EXEC-TO-PLAN rejection-then-fix cycle, not thrashing), and a what_needs_improvement citing "blocking issues from: TESTING" derived by counting ALL historical sub_agent_execution_results rows rather than the LATEST verdict per agent (TESTING\'s latest row, cf105d66, is CONDITIONAL_PASS, not the BLOCKED verdict from an earlier iteration the generator was still counting) — despite scoring 80% on the quality gate. The quality score measures structural completeness (are the buckets populated), not content accuracy or specificity.',
    ],
    key_learnings: [
      {
        learning:
          'A shared consolidation module\'s header comment that ADVERTISES a guarantee (e.g. "fails closed / fails open to X on read failure") is a testable claim, not documentation — SEC-1 existed precisely because the module\'s try/catch structure LOOKED like it implemented the guarantee the header described, and the gap (postgrest-js returning rather than throwing) was invisible to a code reader who trusted the try/catch shape without checking the client library\'s actual error-signalling contract for that call.',
        is_boilerplate: false,
      },
      {
        learning:
          'The correct response to a moved/promoted bug is to fix it inline at the promotion site, not defer it as a follow-up: SEC-1 was pre-existing in coordinator-idle-qf-hint.mjs before this SD, but promoting it into a shared module with a NEW second consumer doubled its blast radius, which is what made "close it inline rather than deferring" the right call even though the bug itself predates this SD\'s scope.',
        is_boilerplate: false,
      },
      {
        learning:
          'A frozen-population differential harness proves behavioural equivalence only for the fixtures it FREEZES — a harness that is comprehensive on "what changed" axes but omits the fixture proving the SD\'s primary claim can pass 100% green while silently failing to demonstrate the one thing that matters most. The fix (adding stale-is-coordinator to the matrix in both bool/string shapes) is a reminder to explicitly cross-check a differential harness\'s fixture set against the SD\'s own headline claim, not only against the FR-defined change matrix.',
        is_boilerplate: false,
      },
      {
        learning:
          'Named-axis pure predicates with no-op defaults (ctx={} reproduces a well-defined, deliberately-chosen baseline) make partial migration safe: each of the four consumers could adopt exactly the axes that reproduce its OWN current behaviour without having to reconcile all four consumers\' historical divergences in one step — the divergences become explicit MATRIX CELLS (per-consumer x per-reason) rather than implicit behaviour buried in four separate implementations.',
        is_boilerplate: false,
      },
      {
        learning:
          'Distinguishing in-scope fixes from out-of-scope-but-related findings at gate-review time, and filing the latter as tracked follow-ups (QF-20260904-962, QF-20260904-968) rather than either scope-creeping the PR or silently dropping them, kept the PR focused on FR-1..FR-4 while ensuring the two additional SECURITY observations (missing role-singleton axis; a sibling file\'s boolean-only is_coordinator check now disagreeing with the newly-migrated four) are not lost.',
        is_boilerplate: false,
      },
    ],
    action_items: [
      {
        owner: 'LEO-Session',
        action:
          'Track QF-20260904-962 (seat-idle-predicate has a role===\'adam\' axis but none for \'coordinator\'/\'solomon\', letting a stale coordinator-role session read idle) and QF-20260904-968 (build-forbidden-session.cjs is_coordinator check is boolean-only, disagreeing with the four consumers this SD taught to accept the JSON-string shape) to resolution.',
        deadline: 'Next available session',
        verification: 'Both QF rows read status=resolved/closed in the quick_fixes table',
        is_boilerplate: false,
      },
      {
        owner: 'RETRO Sub-Agent tooling',
        action:
          'Fix the what_needs_improvement/REWORK_PATTERN generator logic to use the LATEST verdict per sub_agent_code (matching GATE_SUBAGENT_EVIDENCE\'s own latest-per-code grouping) rather than counting every historical row — the preflight-autogenerated retrospective for this SD reported "blocking issues from: TESTING" based on a superseded BLOCKED verdict while the latest TESTING row was already CONDITIONAL_PASS, producing a misleading completion narrative despite scoring 80% on the quality gate.',
        source: 'evidence_gap',
        deadline: '2026-09-11',
        priority: 'medium',
        smart_format: true,
        success_criteria: 'generateRetrospective (lib/sub-agents/retro/generators.js) groups sub_agent_execution_results by latest-per-code before deriving what_needs_improvement/REWORK_PATTERN content',
      },
      {
        owner: 'RETRO Sub-Agent tooling',
        action:
          'Consider weighting the retrospective quality score toward content specificity (does the row name actual files/functions/commits) rather than only structural bucket population — this row scored 80% while its key_learnings/what_went_well were pure templated boilerplate with zero mention of seatIdleVerdict, the differential harness, or either gate-review fix, and required this manual PLAN-TO-LEAD pass to correct in place, same finding as SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002\'s retrospective.',
        source: 'evidence_gap',
        deadline: '2026-09-11',
        priority: 'low',
        smart_format: true,
        success_criteria: 'Quality scoring incorporates a specificity/genericness check, or the gate documents that it measures structure only',
      },
    ],
    success_patterns: [
      'Named-axis, no-op-default pure predicate (lib/fleet/claim-eligibility.cjs\'s INELIGIBILITY_AXES shape, reused for seatIdleVerdict) let four historically-divergent consumers migrate independently and safely',
      'Frozen-population differential harness comparing REAL pre- vs REAL post-migration functions (not reimplementations) against an explicit per-consumer x per-reason matrix caught both a missing fixture (stale-is-coordinator) and validated intentional verdict changes (QF-holder, released-shell, spin-up-grace) that a flat allow-list would have rejected',
      'Both post-PLAN gate-review findings (EXEC-phase TESTING, EXEC-TO-PLAN SECURITY) were fixed inline before merge with root-cause diagnoses (wrong fixture population; wrong exception-throwing assumption about postgrest-js) rather than worked around',
      'Out-of-scope-but-related SECURITY findings (SEC-2, SEC-4) were named and filed as tracked QFs instead of either scope-creeping the PR or being silently dropped',
    ],
    failure_patterns: [
      'A shared module\'s header comment advertising a fail-closed guarantee was not actually verified against the true error-signalling behaviour of the client library it wrapped (postgrest-js resolves query faults as a returned {data:null,error}, not a thrown exception) — the try/catch SHAPE looked correct on inspection while the throw that would trigger it never fired',
      'A frozen-population differential harness initially omitted the one fixture (stale-is-coordinator) that would prove the SD\'s own headline fix, so the harness could read as comprehensively green while silently not exercising the primary claim',
      'The preflight-autogenerated retrospective scored 80% on the quality gate while being pure boilerplate with zero SD-specific technical content, and its what_needs_improvement bucket was actively misleading (cited TESTING as still-blocking based on a superseded verdict) — recurring finding, same as SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002',
    ],
  };

  const { data, error } = await s
    .from('retrospectives')
    .update(patch)
    .eq('id', RETRO_ID)
    .eq('sd_id', SD_UUID)
    .select('id, sd_id, quality_score, status')
    .single();

  if (error) {
    console.error('Update error:', error.message);
    process.exit(1);
  }
  console.log('Retrospective updated:', JSON.stringify(data, null, 2));
}

import { isMainModule } from '../../lib/utils/is-main-module.js';

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
