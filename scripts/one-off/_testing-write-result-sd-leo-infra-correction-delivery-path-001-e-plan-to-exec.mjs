#!/usr/bin/env node
/**
 * One-off: Write TESTING sub-agent PLAN-TO-EXEC evidence for
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E ("Measurement provenance: stamp
 * perishability onto the existing premise-liveness path").
 *
 * Testability assessment of TS-1..TS-6 against the PRD's binding constraints
 * (TR-1..TR-4). No implementation performed — assessment only, per the
 * canonical repo-evidence + storage pattern used by the sibling LEAD-TO-PLAN
 * Explore evidence script in this directory.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e74cd20f-02b7-4142-aee7-e443421efb7d';
const SD_KEY = 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E';

const findings = [
  {
    id: 'T1-ts1-ts4-ts5-ts6-driven-through-injectable-deps',
    severity: 'INFO',
    summary: 'checkFeedbackPremiseLiveness(feedbackRow, deps) (lib/eva/feedback-premise-adapter.js:83-85) is a thin wrapper over checkPremiseLiveness(descriptor, deps) (lib/eva/premise-liveness.js:221-229), whose deps {supabase, git, recentDays, completedDays, recentThreshold, nowMs} are ALL injectable with safe defaults (git defaults to defaultGit() at :35-41, nowMs falls back to a fixed literal at :45). The existing suites already exercise this exact seam with zero network/DB calls: tests/unit/eva/feedback-premise-adapter.test.js:14-30 (mockSb() stub for sd_phase_handoffs + strategic_directives_v2, noGit/gitWithFix fixtures, nowMs=Date.parse fixed literal) and tests/unit/premise-liveness.test.js:15-36 (same pattern, chainable thenable builder). TS-1 (STALE with provenance), TS-4 (LIVE regression with provenance), and TS-5 (git throws => write still succeeds, tested at the emit-feedback layer not this one) are all deterministically driveable through these seams with zero I/O. TS-6 (spoofing) is a pure-function assertion on the stamping helper output, needs no supabase/git double at all.'
  },
  {
    id: 'T2-ts2-existing-suite-uses-static-source-pattern-matching-not-execution',
    severity: 'WARNING',
    summary: 'scripts/create-quick-fix.js is a top-level CLI script (real createClient() at import time, no exported/injectable entrypoint for the STALE_PREMISE branch at :236-261) — it is NOT unit-testable by execution with a mocked supabase today. The EXISTING precedent test, tests/unit/feedback/create-quick-fix-liveness-gate.test.js, already solves this the same way create-quick-fix-dedup-gate.test.js does: it reads the script source as text (fs.readFileSync, :13) and asserts regex/ordering invariants against it (STALE_GATE_RE, QF_INSERT_RE, FORCE_LIVENESS_FLAG_RE — no execution, no mocking, per its own header comment ":3 avoids mocking the full Supabase chain"). TS-2 (provenance surfaced at the STALE refusal) is achievable in the SAME idiom: add an assertion that the source region between the STALE_PREMISE marker (:248) and the evidence-print loop (:249) references a provenance field (e.g. a regex for `measured_at` or `provenance` scoped to that span). This is deterministic and requires no live DB.'
  },
  {
    id: 'T3-ac2-fails-pre-change-confirmed',
    severity: 'INFO',
    summary: 'Confirmed by direct inspection: today scripts/create-quick-fix.js:242-244 selects `id, title, description, category, severity` from feedback for the freshFb re-fetch -- NOT metadata -- and the STALE_PREMISE console.error loop at :248-249 prints only `fb.id`, `fb.title.slice(0,60)`, and `verdict.evidence` entries, none of which reference measured_at/git_sha/timezone (grep of the file confirms zero occurrences of those tokens). A new regex assertion requiring a provenance token inside that STALE-branch span (as in T2) therefore FAILS against the current, pre-change source verbatim -- satisfying the PRDs AC-2 requirement that "the assertion fails against the pre-change codebase" without needing to fabricate a contrived scenario. Demonstration method: run the new test against HEAD of this worktree BEFORE any EXEC changes land; it must show 1 failing assertion (regex no-match), then re-run green after EXEC adds the provenance-print + widens the freshFb select to include metadata.'
  },
  {
    id: 'T4-descriptor-carry-through-is-additive-not-a-tr3-violation',
    severity: 'INFO',
    summary: 'TR-3 forbids modifying recentRecount (premise-liveness.js:90-109) and findShippedFix (:116-212) specifically -- both are pure verdict-computation helpers that read gate_name/cluster_reason/referenced_files/identifiers off the descriptor and never touch measured_at/git_sha, so they need no changes and FR-4 (verdict unaffected by provenance) is enforced by construction, not by a new code path. feedbackToPremiseDescriptor (feedback-premise-adapter.js:31-61) is a DIFFERENT function (the adapter, not premise-liveness.js) and is explicitly the layer FR-2 names as the extension point ("feedbackToPremiseDescriptor... carries the provenance through") -- adding a `provenance` field there (read from feedbackRow.metadata.measured_at/git_sha/timezone) is in-scope. The one open design question for EXEC (not a testability blocker): whether the evidence[] lines are appended inside checkPremiseLiveness()s OUTER wrapper (:221-308, which TR-3 does NOT name and is a legal edit site) or purely at the create-quick-fix.js consumption point using raw feedback.metadata -- either is testable; TS-1/TS-4 should assert on whichever mechanism EXEC picks by asserting the descriptor or verdict.evidence carries the provenance token, and TS-2 should assert on the printed CLI evidence lines regardless of which layer produced them.'
  },
  {
    id: 'T5-ts3-timezone-independence-established-repo-idiom',
    severity: 'INFO',
    summary: 'The PRD AC-3 literal wording ("byte-identical under process.env.TZ=UTC and America/New_York") is over-specified relative to this repos established test idiom for the identical bug class. Because measured_at will be produced via new Date().toISOString() (always Z-suffixed per FR-1), Date.parse(measured_at) is inherently TZ-invariant -- the four-hour-shift bug only bites NAIVE (no-offset) strings. The repos own precedent test for this exact defect (tests/unit/handoff/wait-verdict.test.js:148-152, "naive (no-TZ) timestamp is treated as UTC") does NOT toggle process.env.TZ mid-process (V8/ICU timezone data is unreliable to hot-swap within one Node process); instead it asserts a naive string and its Z-suffixed equivalent parse to the same instant. TS-3 should follow that idiom: (a) assert measured_at always matches /Z$|[+-]\\d{2}:?\\d{2}$/ (explicit offset, mirrors retro-filters.js parseAsUTC hasTZ check at :43), and (b) assert age-from-measured_at computed via the reused parseAsUTC/normalizeToUTC helper is identical whether the stored value already has Z or (defensively) does not. This is fully deterministic, in-process, and requires no TZ env mutation or subprocess spawning.'
  },
  {
    id: 'T6-reusable-seams-for-ts6-spoof-resistance',
    severity: 'INFO',
    summary: 'lib/governance/hold-state-contract.js:84-93 buildProvenancedStamp already demonstrates and is unit-tested for exactly the spread-caller-first-stamp-provenance-last pattern FR-1 requires ("spoofing" = caller sets metadata.measured_at, stamp must win). lib/governance/emit-feedback.js _buildRowObject (:103-129) already follows this convention today for dedup_hash/emitted_at (`metadata: { ...enrichedMetadata, dedup_hash, emitted_at: new Date().toISOString() }`, :121-125) -- the reference writer FR-1 names is pre-shaped for a same-pattern addition. tests/unit/governance/emit-feedback.test.js:10-32 already exposes `supabase._insert.mock.calls[0][0]` for exactly this kind of post-hoc field assertion (see e.g. :55-57 asserting metadata.dedup_hash), giving TS-6 a direct, already-proven seam: call emitFeedback({..., metadata: { measured_at: "SPOOFED" }}), inspect insertCall.metadata.measured_at, assert it is NOT "SPOOFED".'
  },
  {
    id: 'T7-git-sha-injection-seam-for-ts5',
    severity: 'INFO',
    summary: 'TR-4 (git capture must be injectable and fail-soft) has a direct existing model: premise-liveness.js:34-41 defaultGit() -- an execSync wrapper returning \'\' on ANY throw, already unit-proven fail-soft by both feedback-premise-adapter.test.js (noGit fixture) and premise-liveness.test.js. No canonical getCurrentGitSha()/getCurrentGitRef() helper exists yet (net-new for this SD, confirmed absent repo-wide by a grep for getCurrentGitSha/getCurrentGitRef), so EXEC must add one -- but as long as it is modeled on defaultGit()s injectable-function-with-try/catch-empty-fallback shape, TS-5 (git dep injected to throw => emitFeedback still succeeds, git fields absent/empty rather than the write failing) is directly testable by passing a throwing stub function as the git dependency and asserting (a) emitFeedback resolves normally and (b) insertCall.metadata.git_sha is absent/empty -- same shape as the noGit fixture already in use.'
  },
  {
    id: 'T8-regression-surface',
    severity: 'INFO',
    summary: 'Existing suites that MUST keep passing unmodified in intent (per FR-4 AC "verdict outcomes for descriptors WITHOUT provenance are unchanged" and TR-3): tests/unit/premise-liveness.test.js (271 lines, full verdict matrix -- STALE/LIVE/ambiguous/HOLD_FOR_REVIEW cases across recentRecount+findShippedFix), tests/unit/eva/feedback-premise-adapter.test.js (91 lines, adapter shaping + the b6594220 STALE/LIVE scenarios), tests/unit/eva/feedback-premise-adapter-identity.test.js (94 lines, QF-20260703-428 identity-key regression), tests/unit/feedback/create-quick-fix-liveness-gate.test.js (46 lines, static gate-ordering assertions -- the STALE_GATE_RE/QF_INSERT_RE ordering check must still pass after the provenance-print addition), tests/unit/governance/emit-feedback.test.js (162 lines, dedup_hash/emitted_at/status-default/error-propagation invariants -- must be unaffected by an additive measured_at/git_sha/timezone key), tests/unit/governance/emit-feedback-auto-fill.test.js and tests/unit/governance/emit-feedback-telemetry-audience.test.js (adjacent emit-feedback.js behaviors sharing _buildRowObject). Sibling test tests/unit/sourcing-engine/refill-auto-promote-liveness.test.js and tests/unit/leo-create-sd-feedback-liveness.test.js also consume checkFeedbackPremiseLiveness via the same adapter and should be re-run as regression, though the PRD does not require them to change.'
  }
];

const warnings = [
  'TS-2 as literally read ("the printed evidence includes the measured_at value and git ref/sha") implies EXEC widens the create-quick-fix.js freshFb SELECT at :243 to include `metadata` (currently omitted) -- this is a small, in-scope, non-schema change (same table, existing jsonb column) but is worth flagging explicitly because it is a second touch point beyond the FR-1 writer and FR-2 adapter the PRD narrative emphasizes.',
  'The exact mechanism for "evidence[] lines... include it" (FR-2) is under-specified between two legal options: (a) append provenance evidence lines inside checkPremiseLiveness()s outer wrapper (premise-liveness.js:221-308, NOT recentRecount/findShippedFix, so TR-3-legal) or (b) print feedback.metadata.measured_at/git_sha directly at the create-quick-fix.js STALE branch without touching premise-liveness.js at all. Both are testable; PLAN/EXEC should pick one explicitly since TS-1 and TS-2 will need to assert against whichever is chosen. Recommend (b) as strictly lower-risk (zero touch to premise-liveness.js, keeps the "disjoint from siblings -A..-D" blast-radius claim maximally true).',
  'AC-3s literal wording (byte-identical under two different process.env.TZ values) does not match this repos established test idiom for the same bug class (naive-vs-explicit-offset parse equivalence, not live TZ toggling). Recommend PLAN/EXEC interpret AC-3 via the repo idiom (see finding T5) rather than attempting runtime TZ mutation, which is unreliable across Node/V8 versions within a single test process.'
];

const recommendations = [
  'EXEC: extend tests/unit/eva/feedback-premise-adapter.test.js (or a new tests/unit/eva/feedback-premise-adapter-provenance.test.js) for TS-1 and TS-4, reusing the existing mockSb()/noGit/gitWithFix fixtures and nowMs=Date.parse fixed-literal pattern already proven at feedback-premise-adapter.test.js:14-33 and :73-91.',
  'EXEC: extend tests/unit/feedback/create-quick-fix-liveness-gate.test.js for TS-2 and TS-3s "explicit offset" half, using the SAME fs.readFileSync + regex-over-source-text idiom already established there (do not attempt to mock the full Supabase chain for this file -- that would be a departure from repo convention, not an improvement).',
  'EXEC: add TS-5/TS-6 assertions to tests/unit/governance/emit-feedback.test.js, reusing the buildSupabase()/supabase._insert.mock.calls[0][0] idiom already proven at :10-32 and :55-57.',
  'EXEC: add a small pure-function test for TS-3 asserting measured_at always matches the explicit-offset regex (mirrors retro-filters.js:43 hasTZ check) plus an age-computation-identity assertion via the reused parseAsUTC/normalizeToUTC helper -- do not spawn subprocesses or mutate process.env.TZ mid-test.',
  'PLAN/EXEC: resolve the FR-2 evidence-placement ambiguity (finding T4/warning 2) before implementation -- pick create-quick-fix.js-only rendering (recommended, zero premise-liveness.js touch) over appending to checkPremiseLiveness()s evidence array.',
  'EXEC: run `npm run test:unit -- tests/unit/premise-liveness.test.js tests/unit/eva/feedback-premise-adapter.test.js tests/unit/eva/feedback-premise-adapter-identity.test.js tests/unit/feedback/create-quick-fix-liveness-gate.test.js tests/unit/governance/emit-feedback.test.js` as the regression gate before and after the change.'
];

const summary = 'TESTING testability assessment (no implementation) for SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E PLAN-TO-EXEC. All six TS-1..TS-6 scenarios are implementable as deterministic, DB-free, network-free unit tests using seams that already exist and are already proven in this repo: checkFeedbackPremiseLiveness/checkPremiseLiveness accept fully-injectable {supabase, git, nowMs, recentDays, completedDays, recentThreshold} deps (tests/unit/eva/feedback-premise-adapter.test.js, tests/unit/premise-liveness.test.js already exercise this with zero I/O); emitFeedback is unit-tested today via a mocked supabase double exposing insertCall for post-hoc metadata assertions (tests/unit/governance/emit-feedback.test.js). CRITICAL CHECK for TS-2 (AC-2 must fail pre-change): confirmed directly against the current source that scripts/create-quick-fix.js neither selects feedback.metadata (line 243 select list) nor prints any measured_at/git_sha/timezone token in its STALE_PREMISE branch (lines 248-249) today -- a new regex assertion requiring such a token in that span fails cleanly pre-change and would pass post-change, satisfying AC-2 without a contrived scenario. Because create-quick-fix.js is a non-injectable CLI entrypoint, its existing STALE-gate test (tests/unit/feedback/create-quick-fix-liveness-gate.test.js) already uses static source-pattern matching rather than execution with a mocked Supabase chain (documented in its own header comment) -- TS-2 should extend that same idiom, not introduce a new mocking strategy for this one file. No AC requires modifying TR-3-forbidden code (recentRecount/findShippedFix); the provenance carry-through belongs in feedbackToPremiseDescriptor (the adapter) and/or the create-quick-fix.js print site, both legal edit sites. TS-3s literal "toggle process.env.TZ" wording does not match the repos own precedent test for the identical four-hour-shift bug class (tests/unit/handoff/wait-verdict.test.js:148-152 tests naive-vs-explicit-offset parse equivalence, not live TZ mutation) -- recommend following that idiom instead. Regression surface: 5 existing suites (premise-liveness, feedback-premise-adapter, feedback-premise-adapter-identity, create-quick-fix-liveness-gate, emit-feedback) totaling 664 lines must keep passing. GO for PLAN-TO-EXEC: no AC is undeterminable, no seam is missing, and no test requires touching TR-3-protected code.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN-TO-EXEC',
      mode: 'testability assessment only (no implementation)',
      go_no_go: 'GO',
      test_runner: 'vitest run --project unit (npm run test:unit)',
      test_scenarios: {
        'TS-1': { ac: 'AC-1 stale-with-provenance', target_suite: 'tests/unit/eva/feedback-premise-adapter.test.js', deterministic: true, seam: 'mockSb + nowMs + git fixture (existing pattern)' },
        'TS-2': { ac: 'AC-2 tightened - STALE refusal surfaces provenance', target_suite: 'tests/unit/feedback/create-quick-fix-liveness-gate.test.js', deterministic: true, seam: 'static source-text regex assertion (existing convention for this non-injectable CLI file)', pre_change_fails: true },
        'TS-3': { ac: 'AC-3 timezone-independent age', target_suite: 'new pure-function test (co-locate with feedback-premise-adapter or a new file)', deterministic: true, seam: 'explicit-offset regex + reused parseAsUTC/normalizeToUTC helper; no TZ env mutation' },
        'TS-4': { ac: 'AC-4 regression - fresh provenance-carrying measurement reads LIVE', target_suite: 'tests/unit/eva/feedback-premise-adapter.test.js', deterministic: true, seam: 'mockSb + noGit fixture (existing pattern)' },
        'TS-5': { ac: 'TR-4 - git capture failure must not break a feedback write', target_suite: 'tests/unit/governance/emit-feedback.test.js', deterministic: true, seam: 'throwing git dependency stub + supabase._insert.mock.calls assertion' },
        'TS-6': { ac: 'TR-1/FR-1 - provenance cannot be spoofed by the caller', target_suite: 'tests/unit/governance/emit-feedback.test.js', deterministic: true, seam: 'caller-supplied metadata.measured_at override attempt + supabase._insert.mock.calls assertion' },
      },
      tr3_compliance: 'No test requires modifying recentRecount (premise-liveness.js:90-109) or findShippedFix (:116-212); provenance carry-through belongs in feedbackToPremiseDescriptor (feedback-premise-adapter.js:31-61) and/or the create-quick-fix.js consumption point.',
      regression_suites: [
        'tests/unit/premise-liveness.test.js',
        'tests/unit/eva/feedback-premise-adapter.test.js',
        'tests/unit/eva/feedback-premise-adapter-identity.test.js',
        'tests/unit/feedback/create-quick-fix-liveness-gate.test.js',
        'tests/unit/governance/emit-feedback.test.js',
        'tests/unit/governance/emit-feedback-auto-fill.test.js',
        'tests/unit/governance/emit-feedback-telemetry-audience.test.js',
      ],
    },
    phase: 'PLAN-TO-EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
