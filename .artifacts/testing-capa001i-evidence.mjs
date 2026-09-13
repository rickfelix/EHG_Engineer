import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

// Runner-produced artifact: counts and hash are read from the vitest JSON report, never hand-typed.
const ARTIFACT_PATH = '.artifacts/testing-capa001i-baseline.json';
const raw = readFileSync(ARTIFACT_PATH);
const report = JSON.parse(raw.toString('utf8'));
const artifactSha = createHash('sha256').update(raw).digest('hex');
const testExecution = buildTestExecution({
  executed: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  skipped: report.numPendingTests,
  artifactSha,
  runner: 'vitest',
  artifactPath: ARTIFACT_PATH,
  source: 'sub_agent_code_path',
  mappedCandidates: 4,
  foundFiles: report.testResults.length,
});

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  execution_time_ms: 0,
  summary:
    'Prospective PLAN-phase validation of the PRD test plan (8 scenarios / 6 FRs) for ' + SD +
    '. All three PRD-cited live numbers independently re-verified TRUE. Test plan is NOT yet ' +
    'implementation-ready: 3 blocking defects (FR-1 unreachable AC, FR-6 false premise + ' +
    'non-discriminating AC, FR-4 undeclared chairman-gated migration dependency) and 5 ' +
    'test-coverage gaps.',
  metadata: {
    test_execution: testExecution,
    validation_mode: 'prospective',
    test_execution_note:
      'The measured run is a BASELINE of the existing harness on the four test surfaces this PRD ' +
      'names, not a test of unwritten FR code: tests/unit/eva/artifact-type-db-parity.test.js (the ' +
      'B3 chairman-gated-constraint baseline), tests/unit/eva/legal-doc-producer.test.js and ' +
      'tests/unit/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.test.js (the FR-1 ' +
      'regression surface TS-8 extends), and lib/eva/__tests__/github-artifact-fetcher.test.js (the ' +
      'FR-6 surface, whose 15 tests are the ONLY callers of fetchLatestWorkflowRun — which is how B2 ' +
      'was established). All 42 pass today, so any later failure on these files is attributable to ' +
      'EXEC, not to pre-existing breakage.',
    prd_id: 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I',
    scope: 'test-plan review only; no product code exists yet, no product tests executed',

    live_data_reverification: {
      method: 'independent queries + direct invocation of the real exported functions, not PRD text',
      venture_legal_overrides_altifyai: 'CONFIRMED 0 rows (PRD claim TRUE)',
      coverage_selfcheck_unreachable_screens:
        'CONFIRMED exactly 5: screen-0, screen-1, screen-6, screen-7, screen-8 (PRD claim TRUE; ' +
        'artifact 4b60d6fe, screens_total=9, screens_reached=4)',
      wireframe_screens: 'CONFIRMED exactly 9 screens (artifact 81e39c29); names match the PRD mapping',
      chairman_decision_978b0c19:
        'CONFIRMED verbatim (978b0c19-2b25-4af4-862a-b9fb2d67f9e2): retire Integrations with a written ' +
        'reason, Account Settings via auth-provider profile component, Subscription and Billing via ' +
        'Stripe customer portal; the row itself names "C2.2 coverage reader dispositions" as its consumer',
      file_citations:
        'all 8 PRD-named files exist; GUIDED_TOUR_STOPS :51/:52/:54 nulls EXACT; ' +
        'stage-23-dedicated-venture-uat.js :28/:52 EXACT; worker :1056 and duplicate :1583-1592 EXACT; ' +
        'computeCoverageSelfcheck and WIRED_CAPABILITY_FEEDBACK_TYPES off-by-one only',
    },

    blocking_defects: [
      {
        id: 'B1', fr: 'FR-1', severity: 'BLOCKING',
        finding:
          'AC-1 is unreachable as scoped. Measured by invoking the real exported readVentureContext ' +
          'against AltifyAI: returns {ok:false, missingFields:["COMPANY_DOMAIN"]}. AltifyAI.company_id ' +
          'resolves to companies row "EHG" (d73aac88) which has website=NULL, so extractBareDomain(null) ' +
          'is null. generateLegalDocsForVenture will return insufficient_context and write ZERO rows. ' +
          'Both required legal_templates ARE active, so templates are not the blocker.',
        impact: 'TS-1 cannot pass. FR-1 is not "verify-and-run"; it needs a data prerequisite first.',
        secondary:
          'The resolved company is the EHG holding company, not AltifyAI, so generated ToS/Privacy would ' +
          'name EHG and use legal@<ehg-domain>. A chairman-facing content decision the PRD does not make.',
      },
      {
        id: 'B2', fr: 'FR-6', severity: 'BLOCKING',
        finding:
          'Premise false and AC-2 non-discriminating. (a) The PRD says the AltifyAI repo "contains only ' +
          'a generic ci.yml" — that was a STALE LOCAL CLONE reading; local HEAD is 141 commits behind ' +
          'origin/main, which has 13 workflows including deploy.yml and contamination-scan.yml. ' +
          '(b) fetchLatestWorkflowRun has ZERO production callers (only its own unit test file), so ' +
          '"the factory already reads venture CI conclusions" is false in the load-bearing sense. ' +
          '(c) Its signature is (repoFullName, token) with no workflow filter, it reads only ' +
          'per_page=5 completed runs, and returns runs.find(conclusion===success)||runs[0] — it cannot ' +
          'return THE stack-scan run, and it actively PREFERS a success, so a failing stack-scan is ' +
          'silently swallowed behind a passing ci.yml or deploy.yml run.',
        impact:
          'TS-7 ("returns the stack-scan run conclusion with the fetcher unmodified") is unsatisfiable. ' +
          'AC-2 passes TODAY, before stack-scan.yml exists, so it cannot distinguish pass from fail. ' +
          'AC-3 names no consumer field or section, so it is untestable as written.',
        resolved_open_item:
          'The PRD left the repo identifier open; it is already recorded: ' +
          'ventures.metadata.synthetic_actor.github_repo = "rickfelix/altifyai". The same blob pins ' +
          'workflow_file="deploy.yml", i.e. the codebase already has a workflow-name-scoped precedent.',
        environment_note:
          'Neither GITHUB_TOKEN nor LEO_ALTIFYAI_UAT_READ_TOKEN is set locally, so TS-7 cannot be executed here at all.',
        not_redundant:
          'contamination-scan.yml is a synthetic-identity scan, not a stack-compliance scan, so FR-6 is ' +
          'genuinely net-new. It is a good structural template for the new workflow.',
      },
      {
        id: 'B3', fr: 'FR-4', severity: 'BLOCKING',
        finding:
          'Undeclared chairman-gated migration dependency. venture_artifacts.artifact_type is constrained ' +
          'by venture_artifacts_artifact_type_check (~140 enumerated values). Widening it lives under ' +
          'database/chairman-gated/. database/artifact-type-parity-pending-chairman-gate.json currently ' +
          'has allow:{} (zero pending exemptions) and tests/unit/eva/artifact-type-db-parity.test.js ' +
          'passes 5/5 today (measured baseline). Adding an ARTIFACT_TYPES entry without an applied ' +
          'widening breaks CI; staging it in the allow-list instead means the artifact cannot actually ' +
          'be persisted.',
        impact:
          'AC-2 ("produces exactly 9 rows") cannot be verified against real persistence on the staged ' +
          'path. The PRD hedge "new artifact_type OR equivalent persisted structure" is exactly where ' +
          'the test plan stops discriminating — TS-5 never says whether the 9 rows are persisted or in-memory.',
      },
    ],

    test_coverage_gaps: [
      {
        id: 'G1', fr: 'FR-3', severity: 'HIGH',
        gap:
          'No scenario for the "override present but reason empty/whitespace" rejection path. TS-3 covers ' +
          'zero overrides, TS-4 covers a valid override. AC-2 states the non-empty rule but no scenario ' +
          'exercises it, so an implementation accepting {override_reason:""} passes the entire test plan.',
        note:
          'Prior art already exists IN THE SAME FILE and the PRD does not reference it: ' +
          'validateVentureDefaultCapabilities (:74-89) already implements a written-reason override hatch ' +
          'that trims and fails closed on empty/whitespace (:83-86). FR-3 risks building a second, ' +
          'divergent override mechanism. Reuse it and port its test cases.',
      },
      {
        id: 'G2', fr: 'FR-3', severity: 'HIGH',
        gap:
          'AC-3 ("AltifyAI reaching a real pass or recorded override on all 7") is understated and partly ' +
          'self-contradictory. Measured live via verifyCapabilityWired for all 7: only 1 of 7 is wired ' +
          '(error-capture-middleware). The PRD flags only telemetry-analytics as AltifyAI’s gap; ' +
          'feedback-widget is ALSO not wired. FR-3 scopes the override path to the 4 no-signal ' +
          'capabilities, so feedback-widget (which HAS a signal) may not be overridden and must reach a ' +
          'real pass — requiring a genuine user feedback row for a venture with no users. That ' +
          'reintroduces the exact fail-closed deadlock FR-3 exists to prevent, and invites manufacturing ' +
          'a fake feedback row to clear a gate.',
        measured_baseline:
          'feedback-widget NOT | error-capture-middleware WIRED | cost-instrumentation NOT(no signal) | ' +
          'telemetry-analytics NOT | calm-decision-card NOT(no signal) | health-uptime-probe NOT(no signal) | ' +
          'operating-model-grounding NOT(no signal)',
      },
      {
        id: 'G3', fr: 'FR-2', severity: 'MEDIUM',
        gap:
          'The ENTRY_POINT disposition can swallow broken screens, and not only for a NEW screen. AC-3 ' +
          'covers a newly-appearing undisposed screen_id (a genuine discriminator). But the chairman D2 ' +
          'ruling commits screen-7 and screen-8 to be BUILT via third parties (auth-provider profile ' +
          'component, Stripe customer portal) — a commitment, not a present fact. TS-2 tags screen-6/7/8 ' +
          'as disposed today, asserting they are handled when nothing verifies the third-party surfaces ' +
          'exist for AltifyAI. Only screen-6 (retire) is a true present-tense disposition. Recommend a ' +
          'scenario asserting a BUILD-class disposition stays OPEN until its surface is evidenced.',
        also:
          'The PRD never names where dispositions are PERSISTED (FR-4 names a persisted structure; FR-2 ' +
          'does not). If dispositions are hardcoded in the reader, TS-2 is a tautology.',
      },
      {
        id: 'G4', fr: 'FR-5', severity: 'HIGH',
        gap:
          'FR-5’s primary binding target does not exist. Measured: AltifyAI’s ' +
          'visual_device_screenshots (334b1d53) has rendering_status="specs_only", file_urls=[], and NO ' +
          'screen_id / no per-screen breakdown — device_screenshots is keyed by DEVICE ' +
          '(macbook_pro/iphone_15/ipad) with prose scene text, and contains no signup or core-action ' +
          'entry. So FR-5’s conditional ("if a screen-level breakdown exists there") resolves FALSE ' +
          'and the whole FR falls to its fallback ("introduce the minimal new artifact_type") — ' +
          'materially more work than the PRD framing, and it inherits B3’s CHECK-constraint problem. ' +
          'The PRD also cites it as stage 22; the artifact is titled "S21 Visual Assets".',
        also:
          'AC-1 ("zero artifactType:null") is satisfiable by binding all 3 stops to artifact types that do ' +
          'not exist for AltifyAI — buildGuidedTour (:117-121) would still emit the "Not yet documented" ' +
          'fallback and the packet would look identical. AC-3 is the only real discriminator, and it ' +
          'needs a named field to assert on, since buildGuidedTour returns {stop, note} with no ' +
          'artifact-reference field. Verified the 3 already-bound stops DO resolve for AltifyAI ' +
          '(marketing_landing_hero, marketing_email_welcome, identity_brand_name all present), so ' +
          'AC-3’s failure surface is correctly confined to the 3 currently-null stops.',
      },
      {
        id: 'G5', severity: 'MEDIUM',
        gap:
          'Scenario-to-FR coverage is complete (FR-1: TS-1/TS-8, FR-2: TS-2, FR-3: TS-3/TS-4, FR-4: TS-5, ' +
          'FR-5: TS-6, FR-6: TS-7) but no scenario covers the FR-1 to FR-5 dependency: the pricing_terms ' +
          'tour stop has no binding named anywhere in FR-5’s description and most plausibly binds to ' +
          'the FR-1 legal docs, which B1 shows cannot be generated. TS-6 assumes "AltifyAI’s artifacts ' +
          'exist as they will after FR-1 through FR-4 ship" and therefore inherits B1 silently.',
      },
    ],

    confirmed_sound: [
      'FR-4 scope correction is CORRECT and well-evidenced: worker :1056 is an evaluatePromotionGate ' +
        'legacy-param remap inside the pending-decision auto-approve path, with a near-identical ' +
        'duplicate at :1583-1592 — not a checklist-input shim. Re-framing FR-4 as purely additive is right.',
      'FR-1 AC-2 / TS-8 (no duplicate legal-producer wiring) is sound and already has partial harness ' +
        'coverage: exactly one call site exists (stage-23-dedicated-venture-uat.js:52) and ' +
        'tests/unit/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.test.js plus ' +
        'tests/integration/legal-doc-producer-activation.test.js already exist to extend.',
      'FR-2 AC-3 is a genuine pass/fail discriminator (names the specific undisposed screen_id).',
      'No reconciliation_table / registry_scorecard / reconciliation_status / built_surface prior art ' +
        'exists anywhere in lib or scripts — FR-4 and FR-5 sections are correctly identified as net-new.',
      'The legal-doc-producer CLI path is viable: SUPABASE_URL is set, so legal-doc-producer.js:283 runs.',
    ],

    activation_invariant_note:
      'product_requirements_v2.activation_test_id is NULL and smoke_test_cmd is NULL. This SD ships a ' +
      'schema-ish leg (FR-4 persisted artifact behind a chairman-gated CHECK constraint) plus a worker ' +
      '(FR-3 stage-24 checklist) plus a consumer/UI (FR-5 sitting packet) — the exact chain shape the ' +
      'LEAD-FINAL-APPROVAL activation-invariant gate exists to catch. Measured caveat, stated at its true ' +
      'extent: evaluateTrigger() against the CURRENT SD row returns triggered=false (lane2 ' +
      'schemaMatch=false over 7740 chars of title+description). I did NOT establish post-EXEC behavior — ' +
      'my simulated key_changes went to metadata.key_changes and the evaluator read lane1.types=[], so ' +
      'that limb was never exercised. Recommend declaring activation_test_id during PLAN rather than ' +
      'discovering the gap at LEAD-FINAL-APPROVAL.',

    recommended_prd_amendments: [
      'FR-1: add an explicit precondition and AC for resolving COMPANY_DOMAIN (populate companies.website ' +
        'for d73aac88, or resolve the domain from ventures.metadata.live_url = ' +
        'https://altifyai.rickfelix2000.workers.dev), and decide whether the ToS should name EHG or AltifyAI.',
      'FR-6: rewrite AC-2 and TS-7 to assert the STACK-SCAN run specifically. Either add an optional ' +
        'workflow-file filter to fetchLatestWorkflowRun (accepting that AC-2’s "zero changes" must go) ' +
        'or follow the existing synthetic-actor-guard workflow-scoped pattern. Name AC-3’s consumer ' +
        'field explicitly. Use repo "rickfelix/altifyai" and re-run the workflow inventory against ' +
        'origin/main, not the 141-commit-stale local clone.',
      'FR-4: declare the artifact_type decision now (chairman-gated widening vs. a new table vs. nesting in ' +
        'an already-allowed type) and state in TS-5 whether the 9 rows are persisted or in-memory.',
      'FR-3: add a scenario for whitespace-only override_reason rejection; reuse the existing override hatch ' +
        'in validate-venture-default-capabilities.js:74-89; restate AC-3 against the measured 1-of-7 ' +
        'baseline and rule explicitly on whether feedback-widget may be overridden.',
      'FR-2: name the disposition persistence location; add a scenario keeping BUILD-class dispositions open ' +
        'until the third-party surface is evidenced.',
      'FR-5: re-plan the signup/core_action/pricing_terms bindings given that visual_device_screenshots is ' +
        'specs_only with no per-screen breakdown; give AC-3 a concrete field to assert on.',
    ],

    verdict_rationale:
      'CONDITIONAL_PASS, not PASS: the PRD is unusually well-evidenced (every file citation verified, every ' +
      'live number TRUE, the FR-4 scope correction independently confirmed correct) and its structure is ' +
      'sound, but three acceptance criteria cannot be satisfied or cannot distinguish pass from fail as ' +
      'written. Not FAIL: no FR is misconceived; all three blockers are fixable by PRD amendment without ' +
      're-planning the SD.',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD,
  { name: 'QA Engineering Director', code: 'TESTING' },
  results,
  { phase: 'PLAN', sdKey: SD, sdId: SD, subAgentCode: 'TESTING' }
);

console.log('STORED_ID=' + (stored?.id || JSON.stringify(stored)));
