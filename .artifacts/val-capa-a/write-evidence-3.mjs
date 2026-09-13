import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A';
const SD_UUID = '566eb446-0f7c-4fbb-8d39-d0584bdd417f';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  fallback: process.cwd(),
  probeExistsRelative: 'scripts/eva/capa-001-a-baseline-runner.mjs',
  supabase,
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 93,
  summary: [
    'Re-validation of SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ 311780d1b25.',
    'All three originally blocking defects are independently verified CLOSED: VAL-1 (AxeBuilder crash), VAL-2 (baseline never run), VAL-3 (Lighthouse scores discarded).',
    'runLighthouseCheck() now calls the lighthouse + chrome-launcher Node APIs directly with a guarded chrome.kill(); the lhci subprocess is gone entirely, which also strictly improves the SEC-1 posture and makes the SEC-3 temp-dir exposure structurally impossible.',
    'The real baseline persisted the material defect I predicted: performance:largest-contentful-paint-above-threshold at 4316.96ms against the 3500ms budget, plus run-recorded scores {performance 0.82, best-practices 0.74}, both under one run_id.',
    'Both stale rows are deleted and the PRD risk register now records the actual resolution instead of the disproven premise.',
    '159 unit tests across 10 files and the live TS-2 suite all pass against the rewritten module.',
    'One condition remains for PLAN to dispose of: accessibility and responsive persist ZERO rows on a clean run, so FR-3 acceptance criterion has no corresponding row and a clean baseline is indistinguishable from one that never ran.',
  ].join(' '),
  critical_issues: [],
  warnings: [
    {
      severity: 'MEDIUM',
      issue: 'Zero-yield coverage is the one substantive gap left, and it is now measured rather than predicted. The completed baseline persisted 2 rows, both performance. Accessibility and responsive each executed and found nothing, so the database holds no row naming the surface scanned, no breakpoint names, and no evidence either dimension ran. This leaves FR-3 acceptance criterion ("layout-break findings persisted for all three breakpoints, tagged with the breakpoint name as part of the finding surface/evidence") with no corresponding row at all, and the PRD top-level acceptance criterion literally names accessibility, performance AND responsive findings. Downstream, FR-4 sitting packet will render nothing for two of the three dimensions once sibling -I lands. Most importantly a clean baseline and a baseline that never ran are byte-identical in the data, which is the exact integrity property a baseline exists to provide.',
      recommendation: 'Either emit coverage findings mirroring the existing FR-2 run-recorded precedent already in this same file (a low-severity accessibility:run-recorded carrying the scanned URL, and a responsive:<breakpoint>:checked per breakpoint) -- roughly ten lines against an established in-file pattern -- or have PLAN explicitly narrow FR-3 acceptance criterion to defect-only emission and record that decision. Either disposition is acceptable; leaving the ambiguity unresolved is not.',
    },
    {
      severity: 'LOW',
      issue: 'Single-surface scope. FR-1 says "scan every built AltifyAI surface" and the SD scope text repeats it; the run covered only the deployment_url root, a 38-node marketing landing page. /register is reachable and the D2/D3 ratifications name Account Settings, Subscription and Billing, and registration/login/logout journeys. The clean accessibility and responsive result therefore describes the landing page, not the venture. The two persisted performance findings do carry the scanned url in evidence_pointer, so the performance dimension is self-documenting; the two zero-row dimensions are not.',
      recommendation: 'FOLLOW-UP, not blocking, and largely subsumed by the coverage-emission fix above: if the coverage findings carry the scanned URL, the single-surface limitation documents itself in the data. I recommend recording the scope honestly rather than expanding it -- authenticated surfaces were never budgeted in this PRD, and per ratification 4730357d AltifyAI is test cargo for the factory, not a venture-completeness exercise.',
    },
    {
      severity: 'LOW',
      issue: 'isLikelyTestFixture() discriminator gap (pre-existing, not introduced by this SD). It recognizes only the fc000000- venture_id prefix or a t- prefixed evidence_pointer.sig. The stray row I flagged (venture_id 00000000-0000-0000-0000-000000000000, finding_hash probe3-*, empty evidence_pointer) matched neither and read as a genuine production finding to the FR-C generator and aggregator. That specific row is now deleted and verified gone, but the discriminator gap remains and will re-admit the next hand-written probe row.',
      recommendation: 'FOLLOW-UP in its own ticket, do NOT fix inline here. The discriminator belongs to lib/eva/quality-findings/sd-generator.js under the FR-C generator SD, not to this child, and this SD has already expanded once into that file. Widening it (all-zeros venture_id, or any finding_hash not matching the computeFindingHash 16-hex-char shape) is a clean standalone change.',
    },
    {
      severity: 'LOW',
      issue: 'Evidence-provenance hygiene: 11 of my VALIDATION scratch scripts are tracked on the branch under .artifacts/val-capa-a/, swept in across commits 5b5e9d9f938 and 311780d1b25. Validator-authored files sitting in the EXEC branch read as EXEC deliverables in a diff review and muddy the producer/reader separation the gate-evidence provenance rule exists to protect.',
      recommendation: 'FOLLOW-UP, trivial: git rm -r --cached .artifacts/val-capa-a/ before merge.',
    },
    {
      severity: 'LOW',
      issue: 'The rewritten runLighthouseCheck() has no automated test coverage -- it is not exported and no suite exercises the chrome launch, the lighthouse() call, or the guarded kill. The pure builders it feeds (buildLighthouseFindings, buildLighthouseFailureFinding) are well covered, and the new path has now succeeded live, so the residual risk is low for a one-time script.',
      recommendation: 'FOLLOW-UP or accept. Noted so the absence is a recorded decision rather than an oversight.',
    },
  ],
  recommendations: [
    { priority: 'MEDIUM', title: 'Dispose of the coverage-emission question before PLAN-TO-LEAD', description: 'Implement the run-recorded/checked findings, or narrow FR-3 acceptance criterion explicitly. This is the only item I consider blocking.' },
    { priority: 'LOW', title: 'Log the isLikelyTestFixture gap and the single-surface scope as follow-ups', description: 'Both are real and neither belongs in this child.' },
    { priority: 'LOW', title: 'Untrack .artifacts/val-capa-a/ before merge', description: 'Validator scratch should not ship as EXEC output.' },
  ],
  detailed_analysis: {
    scope: 'Third validation pass at PLAN_VERIFICATION, branch feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ 311780d1b25. Supersedes rows 28ffd80f-afc7-4bdd-ae06-fc83413a76b6 and a235f245-4a37-435f-9ab5-5f96980e8da0.',
    val_3_closure: {
      code: 'VERIFIED. runLighthouseCheck() now dynamically imports lighthouse and chrome-launcher, launches Chrome with --headless=new --no-sandbox, calls lighthouse(url, { onlyCategories: [performance, best-practices], port }) and reads runnerResult.lhr from memory. chrome.kill() is wrapped in its own try/catch inside a finally, so a teardown throw can no longer discard a held result. A chrome-launch failure returns a chrome-launch-failed finding before the try block, so the kill guard is never reached with an undefined handle -- ordering is correct.',
      subprocess_removed: 'VERIFIED by grep: no execFileSync, no readdirSync, no rmSync, and no .lighthouseci reference remains anywhere in the runner. SEC-1 is now moot by construction (no subprocess and no argv to inject), and SEC-3 is structurally impossible (nothing is written to the repo root at all). The .gitignore entry is now redundant but harmless.',
      threshold_source_unchanged: 'VERIFIED. loadLighthouseThresholds() still reads the repo-root lighthouserc.json, so FR-2 mandate (reuse existing thresholds, define no new budgets) and TR-1 are both intact. onlyCategories narrows the audit to exactly the two categories FR-2 names; LCP and FCP both live in the performance category and remain available, as the persisted LCP finding demonstrates.',
      dependencies: 'VERIFIED. lighthouse ^11.4.0 and chrome-launcher ^0.13.4 added to devDependencies. This matches the established precedent in this repo for the runner other tooling -- @lhci/cli and @axe-core/playwright are both devDependencies already -- so it introduces no new packaging risk.',
      live_result: 'VERIFIED in the database, not taken from the summary. Two rows, one run_id capa-001-a-1789326047731, venture 50763b6a: (1) 0ab650d3, performance, MEDIUM, performance:largest-contentful-paint-above-threshold, value_ms 4316.96 vs max_ms 3500; (2) 89b2c45b, performance, LOW, performance:run-recorded, categories {performance 0.82, best-practices 0.74}. The 4316.96ms LCP sits squarely inside the 3990-5253ms band I measured independently across my own two node-API runs, so the persisted result is consistent with a genuine fresh run rather than a replay. Severity cap held: the medium finding filed no remediation SD.',
    },
    cleanup_verified: 'Stale collect-failed row 86d4e5a9 and stray probe row b8ffac8b both confirmed DELETED by direct lookup. Table is 68 rows = 66 pre-existing + the 2 legitimate new findings. The baseline-category query now returns exactly the 2 real rows and nothing else.',
    prd_correction_verified: 'PRD risk register updated 2026-09-13T19:02:13Z, now 7 entries. Entry [6] is re-scoped to low severity, correctly attributes the fault to the lhci CLI wrapper discarding an already-saved LHR, and its mitigation records the actual resolution. The disproven "unfixable environment limitation" framing is gone from the record.',
    regression_recheck: 'Re-run after the rewrite because the module own imports changed: 10 unit files / 159 tests pass (TS-1 baseline-runner suite, finding-shape, vision-detectors, warn-cap, fr-c-generator, sd-generator, writer, aggregator, stage-20 categories, stage-20 persistence). TS-2 re-run live against the designated DB: 2 passed, not skipped. TS-4 blast radius unchanged and green. TS-3 remains correctly deferred with FR-4; chairman-product-review.js is still untouched.',
    fr_verdicts: {
      FR_1_accessibility: 'SATISFIED as to mechanism and execution. Residual: zero-yield coverage and single-surface scope, both recorded as conditions/follow-ups.',
      FR_2_performance: 'SATISFIED. Real performance and best-practice scores persisted with a run id, thresholds sourced from the existing lighthouserc.json, no new budgets, informational only, and the one genuine over-budget metric surfaced as a medium finding.',
      FR_3_responsive: 'SATISFIED as to mechanism and execution (all three breakpoints measured live against the real surface, VIEWPORTS matching screenshot-generator.js exactly). Its acceptance criterion as literally written is not evidenced by any persisted row -- this is the outstanding condition.',
      FR_4_sitting_packet: 'CORRECTLY DEFERRED, unchanged. Not counted as a gap.',
    },
    severity_calls_requested_by_coordinator: {
      blocking: 'Coverage emission for the clean dimensions (or an explicit PLAN decision narrowing FR-3 acceptance criterion). Reason: without it FR-3 criterion has zero supporting rows, FR-4 will render nothing for two dimensions, and a clean baseline cannot be distinguished from a baseline that never ran -- which defeats the purpose of a baseline and matches the CAPA programme own root-cause class B (producer wired to no reader).',
      follow_up_not_blocking: 'Single-surface scanning scope (record it honestly rather than expand it; largely self-documenting once coverage findings carry the URL). The isLikelyTestFixture() discriminator gap (pre-existing, belongs to the FR-C generator SD, and this child has already expanded once into that file). Untracking .artifacts/val-capa-a/. Absence of automated coverage for the rewritten runLighthouseCheck().',
    },
    method: 'Checked out 311780d1b25 and read the full diff; verified dependency placement against existing precedent; grepped to confirm the subprocess and temp-dir mechanisms are fully removed; queried the persisted findings, the two deletions and the table count directly; read the updated PRD risk register from the database; re-ran 10 unit suites plus the live TS-2 suite against the rewritten module. I did NOT re-run the baseline myself -- per the gate-evidence provenance rule the validator must not author the evidence it gates -- and instead corroborated the persisted LCP value against the independent node-API measurements I took in the previous pass.',
  },
  conditions: [
    { action: 'Dispose of the zero-yield coverage question before PLAN-TO-LEAD: either emit accessibility:run-recorded and responsive:<breakpoint>:checked findings mirroring the existing FR-2 run-recorded precedent, or have PLAN explicitly narrow FR-3 acceptance criterion to defect-only emission and record that decision.', priority: 'medium', blocking: true },
    { action: 'Log the single-surface scanning scope as a recorded limitation (follow-up, not an expansion of this child).', priority: 'low', blocking: false },
    { action: 'File the isLikelyTestFixture() discriminator gap as its own ticket against the FR-C generator SD; do not fix it inline here.', priority: 'low', blocking: false },
    { action: 'Untrack .artifacts/val-capa-a/ from the branch before merge.', priority: 'low', blocking: false },
  ],
  justification: 'CONDITIONAL_PASS. Every defect I raised as blocking is independently verified closed at the code, the database and the test level: the AxeBuilder crash is fixed, the baseline genuinely ran, and the Lighthouse leg now persists real performance and best-practice scores including the material LCP-over-budget finding that the previous lhci path silently discarded. The migration, category widening and all in-scope test scenarios remain green, and the PRD record has been corrected rather than left carrying a disproven premise. What remains is not a defect but an unresolved acceptance-criteria interpretation that belongs to PLAN: on a clean run this baseline persists nothing for two of its three dimensions, so FR-3 criterion has no supporting row and a clean result is indistinguishable from a run that never happened. That must be disposed of -- by a ten-line emission change against an established in-file precedent, or by an explicit decision to narrow the criterion -- but it does not warrant reopening the implementation.',
  metadata: {
    phase: 'PLAN_VERIFICATION',
    commit: '311780d1b25',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
    validator_model: 'claude-opus-5[1m]',
    supersedes: ['28ffd80f-afc7-4bdd-ae06-fc83413a76b6', 'a235f245-4a37-435f-9ab5-5f96980e8da0'],
  },
  execution_time_ms: 0,
};

applySubAgentRepoVerdict(results, resolution);

const { data: sa } = await supabase.from('leo_sub_agents').select('*').eq('code', 'VALIDATION').maybeSingle();
const stored = await storeSubAgentResults('VALIDATION', SD_UUID, sa, results, {
  phase: 'PLAN_VERIFICATION',
  sdKey: SD_KEY,
});
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase);
