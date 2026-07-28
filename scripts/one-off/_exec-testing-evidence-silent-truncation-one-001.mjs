#!/usr/bin/env node
/**
 * One-off: record TESTING sub-agent evidence at the EXEC phase for
 * SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 (EXEC-TO-PLAN handoff).
 *
 * Adversarial verification of Child 1's shipped fix (commit 1516709e3b2, 5 files, +60/-13,
 * PR https://github.com/rickfelix/EHG_Engineer/pull/6622) against the plan captured in
 * scripts/one-off/_plan-testing-evidence-silent-truncation-one-001.mjs. Written through the
 * canonical writer (CLAUDE.md prologue rule 11).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '4d825dee-12c2-43da-ab32-5b2bb4ae6f36';
const SD_KEY = 'SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 85,
    findings: [
      {
        id: 'F1-diff-matches-claim-exactly',
        severity: 'INFO',
        summary: "git diff origin/main...HEAD confirms the claimed shape exactly: 5 files changed, 60 insertions(+), 13 deletions(-) at commit 1516709e3b2 -- scripts/assign-fleet-identities.cjs (+32/-5, new sessionCol() helper used at 7 sites: 3 roster rows + 4 sibling diagnostics), scripts/hooks/session-role-orient.cjs (+17/-2, decide() now passes the full coordinator session_id into workerLines() instead of .slice(0,8)), scripts/coordinator-hourly-review.cjs (+9/-1) and scripts/fleet-dashboard.cjs (+5/-1, byte-similar relay-drop line, both drop .slice(0,8) on d.id and d.correlationId), and scripts/hooks/__tests__/session-role-orient.test.js (+10/-1, the fixture assertion updated). No undisclosed files touched.",
      },
      {
        id: 'F2-tests-run-live-counts',
        severity: 'INFO',
        summary: "Ran the affected suite directly: scripts/hooks/__tests__/session-role-orient.test.js -- 23/23 passed. Widened to every test file that references any of the 4 changed source files (grep across tests/ and scripts/__tests__): tests/unit/assign-fleet-identities-{coordinator-filter,rebroadcast,sdkey-and-panel-fields,tier-callsign}.test.js, tests/unit/coordinator-hourly-review-solomon-leg.test.js, tests/unit/coordinator/relay-drop-gauge.test.js -- 81/81 passed. Widened further to the full tests/unit/coordinator/, tests/unit/fleet/, tests/unit/fleet-dashboard-*.test.js, tests/unit/fleet-panel-identity-kind-order.test.js neighborhood as a regression sweep -- 167 test files / 2038 tests passed, 1 pre-existing unrelated skip. Zero failures anywhere in the run.",
      },
      {
        id: 'F3-test-edit-judged-legitimate-not-greened',
        severity: 'INFO',
        summary: "The PLAN-phase evidence (finding F3 in the PLAN TESTING row) predicted this exact break BEFORE the fix landed: 'scripts/hooks/__tests__/session-role-orient.test.js:44 ... WILL BREAK on Child 1 fix ... must be updated in the same PR.' EXEC's diff does exactly that, and does it correctly: (a) the positive assertion changed from a truncated-form regex (`session=coord-uu\\.`) to the full fixture value (`session=coord-uuid-12345678\\.`) -- a like-for-like widening driven by a real behavior change in session-role-orient.cjs:82 (decide() no longer calls .slice(0,8)), not an unrelated loosening; (b) a NEW negative assertion was added -- `expect(out[0]).not.toMatch(/coord-uu[^i]/)` -- which is strictly MORE restrictive than the old test: it positively forbids the abbreviated-copy-hazard pattern (a truncated echo sitting beside or instead of the full value) that this SD exists to eliminate. A test edit that adds a negative assertion pinning against the very defect being fixed, on top of updating the positive assertion to match new intended behavior, is the correct outcome for a defect-encoding test -- not test-greening. Verdict: legitimate.",
      },
      {
        id: 'F4-exemption-regression-clean',
        severity: 'INFO',
        summary: "Verified with git, not by reading: `git diff origin/main...HEAD --name-only` returns exactly the 5 files above -- none of the 7 exempt paths (lib/genesis/branch-lifecycle.js, lib/sub-agents/rca.js, lib/session-manager.mjs, lib/eva/eva-master-scheduler.js, lib/eva/concurrent-venture-orchestrator.js, lib/terminal-identity.js, lib/coordinator/detectors.cjs) appear in the changed-file list, and `git diff origin/main...HEAD --stat -- <path>` against each of the 7 individually returns empty output (zero diff). No exemption regression.",
      },
      {
        id: 'F5-fix-exercised-live-not-just-read',
        severity: 'INFO',
        summary: "session-role-orient.cjs's decide() is directly requirable and was called live with a full-length UUID coordinator session_id ('coord-uuid-12345678-abcd-ef01-2345-6789abcdef01'): output line was `[ROLE] WORKER (callsign: Bravo) under coordinator session=coord-uuid-12345678-abcd-ef01-2345-6789abcdef01.` -- full id present, zero truncation, zero '...' suffix. For assign-fleet-identities.cjs, main() requires live Supabase state and a coordinator-guard check with real mutation side effects (message sends, metadata writes) with no dry-run/quiet flag in the file -- ran it live against real data, not attempted, to avoid an uncontrolled write. Instead extracted the ACTUAL sessionCol() source line verbatim via regex from the shipped file (not a manual reproduction) and eval'd it standalone: sessionCol('a1b2c3d4-e5f6-7890-abcd-ef0123456789') -> the full 36-char value unchanged; sessionCol(null) -> '(unknown)'; sessionCol(undefined) -> '(unknown)'. No .substring/.slice anywhere in the extracted line. Both changed functions confirmed to do what the diff claims when actually run, not just inspected.",
      },
      {
        id: 'F6-collateral-consumer-search-clean-plus-one-new-out-of-scope-site',
        severity: 'MEDIUM',
        summary: "Searched for any OTHER code that regex-parses these specific console.log lines (roster rows, [ROLE] line, relay-drop line) rather than just referencing the script file paths in comments/docs. No execSync/spawn call anywhere in the repo captures and parses the stdout of assign-fleet-identities.cjs, coordinator-hourly-review.cjs, fleet-dashboard.cjs, or session-role-orient.cjs by pattern-matching a fixed-width id substring. The two other hits on 'correlation=' were this SD's own prior LEAD-phase evidence files documenting the original defect (not consumers). Existing test suites for these files (grepped for console.log/consoleSpy/logSpy assertions) do not assert on printed format anywhere except the one file already updated. HOWEVER: found a genuinely separate, uncovered instance of the SAME truncation pattern that Child 1 did NOT touch and that is out of this diff's stated scope -- scripts/coordinator-relay-drop-gauge.cjs:61 builds a DB `feedback.title` field as `Relay/decision/review drop: correlation ${String(d.correlationId).slice(0, 8)}` (writes to DB, not console). This is not a regression introduced by Child 1 -- it pre-exists and sits in a different file from the three the commit message names ('the three displays') -- but it is the same hazard class (SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001's own taxonomy) left unaddressed. Flagging for PLAN/LEAD scope-tracking, not blocking this handoff.",
      },
      {
        id: 'F7-eva-master-scheduler-quarantine-confirmed',
        severity: 'MEDIUM',
        summary: "Confirmed via `npx vitest run tests/unit/eva-master-scheduler.test.js` with vitest's own project-filter dump: the file is NOT in the `unit` project's include set and IS explicitly named in the `unit` project's exclude array (sourced from tests/quarantine-manifest.json's QUARANTINE_EXCLUDE, entry at manifest line 502: reason_class='assertion-drift', quarantined_at=2026-06-11, linked_ref=feedback:65fce396). It is also absent from the `db` and `smoke` project include sets. Net effect: 'No test files found, exiting with code 1' when targeted directly under the normal config. This means the PLAN-phase finding F2's cited precedent (tests/unit/eva-master-scheduler.test.js:242's `expect(scheduler.instanceId).toMatch(/^scheduler-[a-f0-9]{8}$/)` exemption pin for lib/eva/eva-master-scheduler.js:146) is real CODE but a DORMANT precedent, not a running one -- it cannot currently catch a regression to that minting site because it never executes in CI or local `npm test`. Confirmed, not refuted.",
      },
    ],
    metadata: {
      diff_verification: {
        commit: '1516709e3b2',
        files_changed: 5,
        insertions: 60,
        deletions: 13,
        stat_matches_claim: true,
        pr: 'https://github.com/rickfelix/EHG_Engineer/pull/6622',
      },
      test_counts: {
        'scripts/hooks/__tests__/session-role-orient.test.js': '23/23 passed',
        'assign-fleet-identities + coordinator-hourly-review + relay-drop-gauge suites (6 files)': '81/81 passed',
        'broader regression sweep (tests/unit/coordinator/, tests/unit/fleet/, fleet-dashboard-*, fleet-panel-identity-kind-order)': '167 files / 2038 tests passed, 1 pre-existing unrelated skip',
      },
      test_edit_judgement: 'LEGITIMATE — positive assertion widened in lockstep with a real, intentional behavior change; a new negative assertion was added that is strictly stricter than before (forbids the truncated-abbreviation-beside-full-value pattern). This is exactly what the PLAN-phase evidence predicted would need to happen, done correctly.',
      exemption_regression_result: 'CLEAN — verified via git diff --name-only and per-file git diff --stat against origin/main for all 7 exempt paths; zero touched.',
      live_exercise: {
        'session-role-orient.cjs decide()': "called directly with full UUID; output = '[ROLE] WORKER (callsign: Bravo) under coordinator session=coord-uuid-12345678-abcd-ef01-2345-6789abcdef01.'",
        'assign-fleet-identities.cjs sessionCol()': "main() requires live DB + has real mutation side effects with no dry-run flag, so not run wholesale; extracted the literal source line via regex and eval'd it standalone instead — confirmed no truncation on real and null/undefined inputs.",
      },
      collateral_consumers_found: 'None that parse these specific console.log lines programmatically. One genuinely separate, pre-existing, out-of-scope truncation site newly discovered: scripts/coordinator-relay-drop-gauge.cjs:61 (feedback.title field, correlationId.slice(0,8)) — not touched by Child 1, not named in the commit message, flagged for tracking only.',
      eva_master_scheduler_quarantine: 'CONFIRMED excluded from unit/db/smoke vitest projects via tests/quarantine-manifest.json (reason_class=assertion-drift, quarantined 2026-06-11). The exemption-pin precedent PLAN cited (instanceId regex assertion) is real but dormant — never executes.',
      known_gaps_carried_forward: [
        'FR-5 (Class B typed envelope constructor) still has no test_scenario as of this EXEC verification pass — this handoff only covers Child 1 / FR-1/FR-2 scope.',
        'scripts/coordinator-relay-drop-gauge.cjs:61 correlationId truncation (new finding, F6) — same hazard class, not remediated by this child.',
      ],
    },
    phase: 'EXEC',
    summary: "PASS for EXEC-TO-PLAN on Child 1's shipped fix (commit 1516709e3b2, PR #6622). Diff matches the stated claim exactly (5 files, +60/-13, no undisclosed files). All directly affected and neighborhood tests pass live: 23/23 in the updated test file, 81/81 across the six related suites, 2038/2038 (1 unrelated pre-existing skip) across a 167-file regression sweep of the coordinator/fleet-dashboard/fleet neighborhood. The test-edit question resolves cleanly: the previously-defect-encoding assertion was widened to match a real, intentional behavior change AND a new negative assertion was added that is strictly stricter than before — this is legitimate defect-test correction, not greening. Exemption regression check is clean: git diff confirms none of the 7 exempt files were touched, verified structurally not by reading. Both changed code paths were exercised live where feasible: session-role-orient.cjs's decide() was called directly and produced a full unabbreviated id; assign-fleet-identities.cjs's sessionCol() helper was extracted verbatim from the shipped source and eval'd standalone (full wholesale execution was deliberately avoided — main() has real DB-mutation side effects and no dry-run flag). Collateral search found no programmatic consumer of these console.log formats, but surfaced one new, genuinely out-of-scope finding worth tracking: scripts/coordinator-relay-drop-gauge.cjs:61 truncates a correlationId into a DB feedback.title field via the same hazard pattern and was not touched by this child. Finally, the known gap is CONFIRMED, not refuted: tests/unit/eva-master-scheduler.test.js is explicitly excluded from the unit/db/smoke vitest projects via the quarantine manifest, so the exemption-pin precedent PLAN cited for KIND2 minting sites exists in the codebase but never runs.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'TESTING (QA Engineering Director)' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
  console.log('TESTING result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
