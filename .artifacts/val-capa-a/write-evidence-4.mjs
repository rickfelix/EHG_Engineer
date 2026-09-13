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
  verdict: 'PASS',
  confidence: 95,
  summary: [
    'Final validation of SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ 7f02aca7e1a. PASS.',
    'Every blocking finding I raised across four passes is independently verified closed: VAL-1 (AxeBuilder crash), VAL-2 (baseline never run), VAL-3 (Lighthouse scores discarded by the lhci wrapper), and the zero-yield coverage gap.',
    'The baseline now persists all 6 dimension rows under one run: accessibility:run-recorded (violation_count 0), responsive:DESKTOP/MOBILE/TABLET:checked (each tagged with the breakpoint name and 0px overflow), performance:largest-contentful-paint-above-threshold (medium, 4329.238ms vs the 3500ms budget) and performance:run-recorded (performance 0.82, best-practices 0.74).',
    'Idempotency is proven by live data, not only by unit tests: the two performance rows carry the SAME finding_hash values as the previous run and were upserted in place with a new run_id, while the table grew by exactly the 4 new marker rows.',
    '163 unit tests across 10 files and the live TS-2 suite pass. FR-1, FR-2 and FR-3 are satisfied; FR-4/TS-3 remain correctly deferred to sibling -I.',
    'Four non-blocking follow-ups are recorded below; none should hold PLAN-TO-LEAD.',
  ].join(' '),
  critical_issues: [],
  warnings: [
    {
      severity: 'LOW',
      issue: 'Single-surface scope, now honestly self-documenting rather than hidden. The baseline covers only the deployment_url root (a 38-node marketing landing page); /register and the D2/D3 journey surfaces are unscanned. Every one of the 6 persisted rows carries evidence_pointer.url, so a downstream reader can see exactly what was scanned and the clean accessibility/responsive result cannot be silently over-read as venture-wide. This is the disposition I recommended -- record the limitation rather than expand the child -- and the coordinator adopted it.',
      recommendation: 'FOLLOW-UP: carry the single-surface limitation into the SD retrospective and into FR-4 sitting-packet wording when sibling -I lands, so the packet presents a landing-page baseline as such. No code change in this child.',
    },
    {
      severity: 'LOW',
      issue: 'isLikelyTestFixture() discriminator gap in lib/eva/quality-findings/sd-generator.js recognizes only the fc000000- venture_id prefix or a t- prefixed evidence_pointer.sig, so a hand-written probe row (all-zeros venture_id, arbitrary finding_hash) reads as a genuine production finding. Pre-existing, not introduced here, and correctly left untouched by this child.',
      recommendation: 'FOLLOW-UP in its own ticket against the FR-C generator SD. Suggested widening: treat an all-zeros venture_id, or any finding_hash not matching the 16-hex-char computeFindingHash shape, as a fixture.',
    },
    {
      severity: 'LOW',
      issue: 'Scope expansion carried forward from the EXEC phase and still unratified: sd-generator.js selectPendingFindings() now skips ALL WARN_CAPPED_CATEGORIES, which includes usability/accessibility/journey_coherence owned by SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001. That SD stated contract is verdict-capping only. Live blast radius remains zero (usability and journey_coherence are still rejected by the live CHECK constraint) and the behavior is defensible, but it broadens a sibling SD semantics without that SD sign-off.',
      recommendation: 'FOLLOW-UP: PLAN to ratify the broadened contract in the handoff record, or narrow the exclusion to the three baseline categories.',
    },
    {
      severity: 'LOW',
      issue: 'runLighthouseCheck() and runAccessibilityAndResponsiveChecks() have no automated coverage -- neither is exported and no suite exercises the chrome launch, the lighthouse() call, the guarded kill, or the axe/viewport orchestration. The pure builders they feed are now thoroughly covered (28 tests in the TS-1 suite, including explicit signature-stability/idempotency assertions for both new marker builders), and both paths have succeeded live, so residual risk is low for a one-time script.',
      recommendation: 'ACCEPT as a recorded decision rather than an oversight. No action required.',
    },
    {
      severity: 'LOW',
      issue: 'Evidence-hygiene disposition noted for the record: the coordinator elected to keep .artifacts/val-capa-a/ committed, consistent with how the TESTING and SECURITY evidence dirs were handled on this branch. I verified those files contain no hardcoded credential literals. One precision for the record: my scripts are VALIDATOR-authored ad-hoc probes, not runner-produced or hash-stamped artifacts, so they do not themselves satisfy the gate-evidence-provenance contract the way a stamped evidence file does, and they should not be counted as EXEC deliverables in any LOC or deliverable accounting (they are 298+ of the added lines across three commits).',
      recommendation: 'ACCEPT the coordinator disposition. Recorded so the diff is not misread.',
    },
  ],
  recommendations: [
    { priority: 'LOW', title: 'Carry the single-surface limitation into the retrospective and FR-4 packet wording', description: 'So a landing-page baseline is presented as such once sibling -I lands.' },
    { priority: 'LOW', title: 'File the isLikelyTestFixture gap against the FR-C generator SD', description: 'Real but out of scope for this child.' },
    { priority: 'LOW', title: 'PLAN to ratify or narrow the WARN_CAPPED_CATEGORIES exclusion', description: 'Last unratified scope expansion from the EXEC phase.' },
  ],
  detailed_analysis: {
    scope: 'Fourth and final validation pass at PLAN_VERIFICATION, branch feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ 7f02aca7e1a. Supersedes rows 28ffd80f (FAIL), a235f245 (FAIL) and eeb6a651 (CONDITIONAL_PASS).',
    coverage_blocker_closure: {
      code: 'VERIFIED. buildAccessibilityRunRecordedFinding() emits exactly one low-severity accessibility:run-recorded finding carrying url and violation_count. buildResponsiveCheckedFindings() emits one low-severity responsive:<BREAKPOINT>:checked finding per breakpoint, carrying the breakpoint name, the viewport dimensions, horizontal_overflow_px and url. Both are wired into runAccessibilityAndResponsiveChecks() and concatenated into the returned set. All markers are severity low, so the severity cap and enforceSeverityCap() guard are unaffected.',
      fr3_criterion: 'FR-3 acceptance criterion ("layout-break findings persisted for all three breakpoints, tagged with the breakpoint name as part of the finding surface/evidence") is now satisfiable and satisfied: the breakpoint name appears in BOTH the finding_signature and evidence_pointer.breakpoint, for all three breakpoints, with viewport dimensions matching lib/eva/stage-17/screenshot-generator.js exactly (DESKTOP 1440x900, MOBILE 375x812, TABLET 768x1024).',
      integrity_property_restored: 'A clean baseline is no longer indistinguishable from a baseline that never ran. accessibility:run-recorded with violation_count 0 is an affirmative record of a clean scan; three :checked markers with horizontal_overflow_px 0 are an affirmative record that each breakpoint was measured.',
    },
    live_verification: {
      rows: '6 baseline rows verified by direct query, all on venture 50763b6a: accessibility:run-recorded (low, violation_count 0); responsive DESKTOP/MOBILE/TABLET :checked (low, 0px overflow each, correct viewport dims); performance:largest-contentful-paint-above-threshold (MEDIUM, value_ms 4329.238 vs max_ms 3500); performance:run-recorded (low, categories performance 0.82 / best-practices 0.74). Both performance rows share one run_id capa-001-a-1789326623633.',
      no_hash_collisions: '6 rows, 6 distinct finding_hash values.',
      idempotency_proven_live: 'The two performance rows carry finding_hash 469ef600a67c0000 and 068be41c6a280000 -- byte-identical to the PREVIOUS run commit 311780d1b25 -- but now hold a new run_id and a new value_ms (4316.96 -> 4329.238). They were therefore UPSERTED in place, not duplicated. The table moved 68 -> 72, exactly the 4 new marker rows and nothing else. This is stronger evidence of the upsert contract than the unit tests alone.',
      informational_only_held: '0 strategic directives auto-filed since the run; the medium LCP finding did not trigger remediation-SD generation. TR-1 holds end to end.',
      table_accounting: '72 rows = 66 pre-existing + 6 baseline. No stray or fixture rows remain; the two rows I previously flagged (86d4e5a9 stale collect-failed, b8ffac8b stray probe) stay deleted.',
    },
    git_integrity_after_detached_head: 'CHECKED and CLEAN, and the cause was mine, not the coordinator: I ran `git checkout 311780d1b25` in this shared worktree during my third pass, which left HEAD detached for the coordinator subsequent commit. Verified now: HEAD is back on feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A at 7f02aca7e1a, local and origin refs are identical, 311780d1b25 is a direct ancestor of 7f02aca7e1a (linear, nothing lost or orphaned), the full 9-commit branch history is intact, and the working tree is clean with 0 modified or untracked entries. The only unreachable commits in the repo belong to unrelated sibling branches (-I, -F). Lesson recorded: a validator must not run git checkout in a worktree another agent is committing into; read a commit via `git show <sha>:<path>` or a detached read-only clone instead.',
    regression_recheck: '10 unit files / 163 tests pass (up from 159 -- the 4 new tests assert one marker per breakpoint tagged with the breakpoint name, exactly one accessibility marker, and signature stability across runs for both builders, i.e. the idempotency contract). Live TS-2 re-verified earlier in this pass chain and unaffected by this commit, which touches only the runner and its unit suite. TS-4 blast radius green. chairman-product-review.js still untouched, so the FR-4 boundary holds.',
    fr_verdicts: {
      FR_1_accessibility: 'SATISFIED. Scan executes, severity capped, run performed, coverage marker persisted with the scanned surface recorded.',
      FR_2_performance: 'SATISFIED. Real performance and best-practice scores persisted with a run id, thresholds sourced from the existing repo-root lighthouserc.json, no new budgets, informational only, and the one genuine over-budget metric surfaced as a medium finding.',
      FR_3_responsive: 'SATISFIED. All three breakpoints measured against the live surface and persisted, each tagged with its breakpoint name in both signature and evidence.',
      FR_4_sitting_packet: 'CORRECTLY DEFERRED to sibling -I per the PRD sequencing note. Not a gap. FR-4 now has 6 real rows to render when it lands.',
    },
    technical_requirements: 'TR-1 no new gate/threshold/blocking behavior: held (all markers low severity, WARN-capped categories, zero SDs generated, stage-20 verdict formula unchanged). TR-2 additive-only migration applied via the DATABASE sub-agent: verified live by probe sweep. TR-4 hardcoded category-count assertions updated in the same PR: verified. TR-5 URL read from ventures.deployment_url: verified. TR-3 coordination with -I: honored by deferring FR-4.',
    method: 'Fetched and inspected the branch; verified git integrity after the detached-HEAD episode (ancestry, ref parity, working-tree cleanliness, orphan scan); read the full implementation diff; scanned the committed validator scripts for credential literals; queried all 6 persisted rows, their hashes, run ids, venture and the table total directly; compared the performance row hashes against the previous run to prove upsert idempotency from live data; confirmed zero auto-filed SDs; re-ran 10 unit suites. I did not re-run the baseline myself, per the gate-evidence-provenance rule that a validator must not author the evidence it gates.',
    validation_history: 'Pass 1 @ bb0b4bd6eaa: FAIL (VAL-1 AxeBuilder runtime crash reproduced live; VAL-2 baseline never run). Pass 2 @ 5b5e9d9f938: FAIL (VAL-3 -- the environment-limitation premise was tested via the lighthouse node API and disproven 2/2, exposing a masked medium LCP defect). Pass 3 @ 311780d1b25: CONDITIONAL_PASS (zero-yield coverage gap). Pass 4 @ 7f02aca7e1a: PASS. Every finding was closed at the root rather than worked around, and the PRD record was corrected where it had preserved a disproven premise.',
  },
  conditions: [],
  justification: 'PASS. All four blocking findings raised across this validation chain are independently verified closed at the code, database and test levels, and each was fixed at the root rather than worked around -- notably VAL-3, where the graceful-degradation path was correctly recognized as masking a real over-budget LCP rather than absorbing a genuine tool outage. The baseline now persists an affirmative record for all three dimensions, so a clean result is distinguishable from a run that never happened; idempotency is demonstrated by live upsert behavior; the informational-only contract holds with zero remediation SDs generated; and all in-scope test scenarios (TS-1, TS-2, TS-4) pass, with TS-3 correctly deferred alongside FR-4. The five remaining items are all LOW severity follow-ups or accepted dispositions, none of which should hold PLAN-TO-LEAD.',
  metadata: {
    phase: 'PLAN_VERIFICATION',
    commit: '7f02aca7e1a',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
    validator_model: 'claude-opus-5[1m]',
    supersedes: ['28ffd80f-afc7-4bdd-ae06-fc83413a76b6', 'a235f245-4a37-435f-9ab5-5f96980e8da0', 'eeb6a651-9525-473d-bd6a-ca4d18aeda34'],
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
