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
  verdict: 'FAIL',
  confidence: 92,
  summary: [
    'PLAN_VERIFICATION independent validation of SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ bb0b4bd6eaa.',
    'Migration/category-widening work and all in-scope test scenarios (TS-1, TS-2, TS-4) were independently re-run and GENUINELY PASS.',
    'FR-2 and FR-3 code verified correct. FR-1 FAILS: the axe-core scan crashes at runtime on every invocation',
    '(AxeBuilder rejects a page created by browser.newPage(); it requires browser.newContext()), reproduced live.',
    'PRD acceptance criterion #1 ("one baseline run on AltifyAI persists accessibility, performance and responsive findings")',
    'is UNMET: zero rows exist in those categories repo-wide, and the run could not have succeeded if attempted.',
    'FR-4/TS-3 deferral is correct and is not counted as a gap.',
  ].join(' '),
  critical_issues: [
    {
      id: 'VAL-1',
      severity: 'CRITICAL',
      issue: 'FR-1 accessibility baseline is non-functional at runtime. scripts/eva/capa-001-a-baseline-runner.mjs main() creates the page via chromium.launch() -> browser.newPage() (line 315) and passes it to new AxeBuilder({ page }).analyze() (line 270). @axe-core/playwright 4.8 throws "Please use browser.newContext()" for an implicitly-created page. Reproduced live against https://altifyai.app; isolating browser.newContext() + context.newPage() as the ONLY change made the identical scan succeed. Unit tests never catch this because TS-1 exercises buildAccessibilityFindings() over fixture violations and never the real AxeBuilder call.',
      recommendation: 'One-line fix in main(): const context = await browser.newContext(); const page = await context.newPage();',
    },
    {
      id: 'VAL-2',
      severity: 'HIGH',
      issue: 'The baseline run itself -- the SD deliverable -- was never performed. venture_quality_findings holds 0 rows in accessibility/performance/responsive across all 66 rows repo-wide. FR-1, FR-2, FR-3 and the PRD top-level acceptance criteria each require "one baseline run against AltifyAI persists ... findings"; the SD title is "baseline AltifyAI once ... persisted as informational findings".',
      recommendation: 'After VAL-1 is fixed, execute node scripts/eva/capa-001-a-baseline-runner.mjs --venture AltifyAI and verify persisted rows before PLAN-TO-LEAD.',
    },
  ],
  warnings: [
    {
      severity: 'MEDIUM',
      issue: 'Zero-yield baseline leaves no evidence of coverage. Measured live on the current AltifyAI surface: 0 axe violations and 0px horizontal overflow at all three breakpoints. FR-2 anticipated this and always emits a low-severity performance:run-recorded finding, but FR-1 and FR-3 emit findings ONLY on defect. A successful baseline run would therefore persist nothing for accessibility or responsive, so the FR-3 acceptance criterion ("layout-break findings persisted for all three breakpoints, tagged with the breakpoint name") yields no row proving the three breakpoints were ever checked, and the FR-4 sitting packet would have nothing to render.',
      recommendation: 'Mirror the FR-2 run-recorded precedent: emit a low-severity accessibility:run-recorded finding and a responsive:<breakpoint>:checked finding per breakpoint.',
    },
    {
      severity: 'MEDIUM',
      issue: 'Single-surface coverage versus FR-1/FR-3 wording. FR-1 says "scan every built AltifyAI surface" and FR-3 says "AltifyAI built surfaces"; the runner scans only the ventures.deployment_url root. The live page exposes /register, and ratifications D2/D3 name Account Settings, Subscription & Billing, and registration/login/logout journeys -- the surfaces most likely to carry the defects this baseline exists to find. The scanned root is a 38-node marketing landing page.',
      recommendation: 'Either enumerate surfaces (at minimum / and /register) or record the single-surface limitation explicitly as an accepted PLAN scope reduction.',
    },
    {
      severity: 'LOW',
      issue: 'Scope expansion in shared code owned by a sibling SD. sd-generator.js selectPendingFindings() now skips ALL WARN_CAPPED_CATEGORIES, which includes usability/accessibility/journey_coherence owned by SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001. That SD stated contract is verdict-capping only ("persisted at true severity" but excluded from the hasCritical/hasHigh scan); suppressing remediation-SD generation broadens it. Live blast radius is currently zero (usability and journey_coherence are still rejected by the live CHECK constraint), but the semantic change is real and was not in this PRD.',
      recommendation: 'Have PLAN ratify the broadened contract, or narrow the exclusion to the three baseline categories.',
    },
    {
      severity: 'LOW',
      issue: 'validateDeploymentUrl() (SEC-2) blocks literal loopback/RFC1918/link-local hostnames only. It does not resolve DNS, so a public hostname pointing at a private address, an IPv6 ULA (fc00::/7), or decimal/hex-encoded IPv4 literals still pass. Acceptable for an internally written DB field and beyond the PRD scope, but it is a partial guard.',
      recommendation: 'Advisory only; no action required for this SD.',
    },
  ],
  recommendations: [
    { priority: 'CRITICAL', title: 'Fix the AxeBuilder context defect', description: 'Use browser.newContext() then context.newPage() in main(). Add one test that constructs the page the way the runner does, so the unit tier can catch this class of defect instead of passing over fixtures.' },
    { priority: 'HIGH', title: 'Actually perform the baseline run and verify persisted rows', description: 'The runner is not wired to any npm script or cron; it is a manual one-time invocation, so nothing will perform the run implicitly.' },
    { priority: 'MEDIUM', title: 'Decide the zero-yield coverage-evidence question before FR-4 lands', description: 'FR-4 renders persisted rows; with the current defect-only emission there may be nothing to render.' },
  ],
  detailed_analysis: {
    scope: 'PLAN_VERIFICATION / VERIFY-phase validation against PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A, branch feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A @ bb0b4bd6eaa (4 commits).',
    fr_verdicts: {
      FR_1_accessibility: 'FAIL -- runtime defect (AxeBuilder/newPage) + no baseline run + single-surface coverage. Severity cap logic is correct (critical/serious/moderate -> medium, minor -> low) and the enforceSeverityCap() guard is correctly placed before writeFindingsBatch.',
      FR_2_performance: 'PASS (code) / UNMET (run). Threshold keys read from repo-root lighthouserc.json match exactly: categories:performance[1].minScore=0.6, first-contentful-paint[1].maxNumericValue=3000, largest-contentful-paint[1].maxNumericValue=3500. Verified empirically that the lhci CLI --url flag overrides the rc collect.url (localhost:8080), so only the venture URL is collected. require.resolve("@lhci/cli/src/cli.js") resolves. The best-practices score is captured via evidence_pointer.categories on the run-recorded finding. No new budgets defined (TR-1 respected).',
      FR_3_responsive: 'PASS (code) / UNMET (run). VIEWPORTS duplicated exactly from lib/eva/stage-17/screenshot-generator.js (DESKTOP 1440x900, MOBILE 375x812, TABLET 768x1024) with the source cited in a comment and AGNOSTIC correctly excluded as an alias; asserted by a unit test. See the zero-yield and single-surface warnings.',
      FR_4_sitting_packet: 'CORRECTLY DEFERRED -- lib/eva/chairman-product-review.js is untouched by this branch (0 files in the diff), matching the PRD sequencing note pending sibling -I. Not counted as a gap.',
    },
    test_scenarios: {
      TS_1: 'PASS -- tests/unit/eva/quality-findings/capa-001-a-baseline-runner.test.js, 24 tests, re-run by me. Asserts FindingShape conformance over fixture axe violations, the severity cap, evidence_pointer traceability, Lighthouse threshold comparison, signature stability across runIds, enforceSeverityCap, and validateDeploymentUrl.',
      TS_2: 'PASS -- tests/database/venture-quality-findings-capa-baseline-categories-check.test.js re-run against the LIVE DB with VITEST_DB_ALLOW_REF designated (2 tests, 1023ms of real round-trips; not skipped). Genuine set containment rather than a count assertion, and the negative control asserts Postgres error code 23514 specifically.',
      TS_3: 'DEFERRED with FR-4 per the PRD sequencing note. Not counted as a gap.',
      TS_4: 'PASS -- full blast radius re-run: all 16 test files referencing FINDING_CATEGORIES / WARN_CAPPED_CATEGORIES / TIER_MAP / selectPendingFindings / finding_category. 5 files / 94 tests plus 10 files / 132 tests all green. Stage-20 verdict formula regression tests confirm non-WARN-capped criticals still FAIL and highs still WARN.',
    },
    independent_db_verification: {
      migration_applied_live: 'CONFIRMED by my own probe-insert sweep: accessibility, performance and responsive are all ACCEPTED live; usability and journey_coherence are still REJECTED (23514), confirming the 20260828 migration remains unapplied exactly as the code comments claim. All 10 base categories are still accepted (additive-only verified). 13 probe rows were inserted and deleted; the table returned to its original 66 rows.',
      baseline_findings_present: 'NO -- 0 rows in accessibility/performance/responsive repo-wide (the basis for VAL-2).',
    },
    fix_history_closure: {
      TESTING: 'ALL 5 CLOSED AND VERIFIED -- (1) WARN_CAPPED_CATEGORIES excluded from selectPendingFindings with a warn_capped_category_skipped audit_log, covered by 3 new passing tests; (2) the Lighthouse finding_signature no longer embeds runId, so re-runs UPSERT on (venture_id, finding_hash) instead of accumulating, asserted by a dedicated test; (3) the enforceSeverityCap() runtime guard was added and is correctly invoked in main() before writeFindingsBatch, 4 tests; (4) the TS-2 probe now asserts error code 23514 specifically rather than any error, closing the vacuous-pass hole; (5) the unrelated, unapplied 20260828 migration was widened to include performance/responsive so it stays a superset if ever applied. No TESTING finding was left open.',
      SECURITY: 'ALL 3 CLOSED AND VERIFIED -- SEC-1 (BLOCKER): the shell:true npx invocation is gone; execFileSync now runs process.execPath against a require.resolve()d @lhci/cli entry with shell:false, so argv never reaches a shell (I confirmed the module resolves and the CLI runs). SEC-2: validateDeploymentUrl() enforces https, rejects embedded credentials, and rejects loopback/RFC1918/link-local hosts, correctly handling the bracketed IPv6 form of URL#hostname; 8 tests. SEC-3: .lighthouseci cleanup moved into a finally block plus a .gitignore entry as defense in depth. No SECURITY finding was left open.',
      not_caught_by_either: 'Neither sub-agent could have caught VAL-1: no test and no review step ever constructs a real browser page the way main() does.',
    },
    scope_check: 'No unauthorized feature shipped. chairman-product-review.js untouched (FR-4 boundary respected). No new gate, threshold or blocking behavior introduced; the stage-20 verdict formula is unchanged (TR-1). The migration is additive-only (TR-2) and was applied via the DATABASE sub-agent. TR-4 category-count assertions were updated in the same PR (finding-shape, vision-detectors, warn-cap tests). TR-5: the URL is read from ventures.deployment_url. One scope expansion is noted as a LOW warning (sibling-SD WARN-cap semantics).',
    method: 'Read the PRD from product_requirements_v2; read every changed file and diff; independently probed the live CHECK constraint; re-ran all 6 changed test files plus the full 16-file blast radius; reproduced the main-branch pre-existing failure in fr-c-generator.db.test.js to prove it is not a regression from this branch; executed a READ-ONLY probe of the runner exported builders against the real https://altifyai.app surface. The probe wrote nothing to the database -- per the gate-evidence provenance rule I did not author the baseline run this gate exists to check.',
    pre_existing_failure_note: 'tests/unit/lib/eva/quality-findings/fr-c-generator.db.test.js TS-6 fails (cancelTestSds blocked by the aaa_enforce_canonical_lifecycle_write canonical-writer guard). I reproduced the IDENTICAL failure (1 failed | 4 passed) on main with this branch absent. Pre-existing and unrelated; it belongs to SD-LEO-FIX-FIX-GENERATOR-INTEGRATION-001. NOT counted against this SD.',
  },
  conditions: [
    { action: 'Fix VAL-1: construct the Playwright page via browser.newContext() -> context.newPage() in capa-001-a-baseline-runner.mjs main(), and add a test that builds the page the way the runner does.', priority: 'critical', blocking: true },
    { action: 'Fix VAL-2: perform the actual baseline run against AltifyAI and verify persisted venture_quality_findings rows exist before PLAN-TO-LEAD.', priority: 'high', blocking: true },
    { action: 'Decide the zero-yield coverage-evidence question (emit run-recorded/checked findings for accessibility and each breakpoint) so FR-4 has rows to render.', priority: 'medium', blocking: false },
    { action: 'PLAN to ratify or narrow the WARN_CAPPED_CATEGORIES exclusion applied to a sibling SD categories in sd-generator.js.', priority: 'low', blocking: false },
  ],
  justification: 'FAIL rather than CONDITIONAL_PASS: FR-1 is a high-priority functional requirement whose mechanism cannot execute at all (reproduced live, not inferred), and the PRD first top-level acceptance criterion -- one baseline run persisting findings -- is unmet with zero corresponding rows in the database. The surrounding work (migration applied live and additively, category and tier-map widening, TS-1/TS-2/TS-4 all genuinely passing, and every TESTING and SECURITY finding closed) is sound and needs no rework; the remediation is a one-line context fix plus actually executing the run.',
  metadata: {
    phase: 'PLAN_VERIFICATION',
    commit: 'bb0b4bd6eaa',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A',
    validator_model: 'claude-opus-5[1m]',
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
