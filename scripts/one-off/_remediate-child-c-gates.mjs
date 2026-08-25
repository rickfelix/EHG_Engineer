// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C -- LEAD-TO-PLAN precheck remediation.
// Fixes 3 gate failures: GATE_SUBAGENT_EVIDENCE (evidence rows written separately),
// SMOKE_TEST_SPECIFICATION, GATE_MECHANISM_CLAIM_VERIFIER, plus the validation-agent's
// 3 blocking items (B1 unpopulated success_criteria, B2 zero backlog rows, B3 false
// statement in description).
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, description, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH_ERR', fetchErr.message); process.exit(1); }

// --- B3: correct the false census-recon paragraph, replace with the resolved facts ---
const CORRECTION_MARKER = '--- CENSUS-RECON CORRECTION (independent peer sub-agent, 2026-08-25T19:08Z) ---';
const idx = sd.description.indexOf(CORRECTION_MARKER);
const basePrefix = idx >= 0 ? sd.description.slice(0, idx).trimEnd() : sd.description.trimEnd();

const CORRECTED_ADDENDUM = `

--- LEAD VALIDATION RESOLUTION (validation-agent row ca90aaba + Explore row ac2b1580, 2026-08-25) ---
CORRECTED: census-recon's claim that lib/uat/ is "not wired into the venture stage-advancement pipeline at
all" is directionally right but its unresolved discrepancy flag was WRONG on the facts -- SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001
IS real and DID land ~1,900 LOC across 4 merged PRs (#7315/#7323/#7324/#7328, all confirmed ancestors of
origin/main). The peer's grep returned empty because an unscoped repo-root grep exceeded a 20s timeout;
scoped to lib/ scripts/ it returns 13 hits in <1s. CORRECTED FRAMING (stronger case for this SD, not weaker):
that Stage-20 wiring is ZERO-YIELD BY CONSTRUCTION -- 0 SDs carry metadata.journey_steps so the finding
producer always returns []; even if it fired, buildStepExecutor's fallbackExecutor throws on every
uninstrumented step and stepOverrides is {} for every venture except AltifyAI, so journey_walk_result.status
can never equal 'pass'; Stage 20's gate_type is 'none' (advisory only); and the whole path fails open on
error. A converse landmine also exists: PLAN-TO-LEAD's prerequisite-check.js:290 WAIT-blocks on
journey_walk_result.status==='pass', a value that is currently unreachable -- dormant only because nothing
has stamped metadata.journey_steps yet.
lib/eva/synthetic-actor-guard.js's checkSyntheticActorFencing() (line 142, personally verified) is already
stage-agnostic in signature; stage-19 specificity lives in its 2 call sites, and its BINDING enforcement
(stage-execution-worker.js:3134-3135) bypasses the otherwise-generic checkExitGates()/GATE_VERIFIERS
machinery by deliberate per-venture-opt-in design -- PLAN must design a new bespoke binding block for the
new stage, not assume a GATE_VERIFIERS registration alone reproduces blocking enforcement.
6 ADDITIONAL EXISTING IMPLEMENTATIONS must be reused, not re-authored, for the Solomon-C control pack:
run-unique artifact hashing -> lib/evidence/manifest-generator.js + witness-emitter.mjs; nonce round-trip
liveness -> lib/telemetry/canary-gauge-liveness.mjs + scripts/canary/run-adapter-liveness-probe.mjs;
deliberately-broken canary -> scripts/audit/control-seed-test.mjs; minimum-assertion -> quality-analyzer.js
assertion-density + phase5-verdict.js zero-evidence guard; venture-vs-factory classifier ->
factory-defect-recorder.js + gap-class.js GAP_CLASS; venture-agnostic smoke shape ->
tests/e2e/templates/venture-smoke.template.ts.
TWO GENUINE GAPS PLAN MUST DESIGN FOR (neither is answered by existing code): (1) signed-out journey
coverage is absent -- persona is existing|fresh (both signed-in), and the walker's fallback executor forces
a sign-in as step 1 of every step; (2) fence two-sidedness criterion (v)'s "cannot reach real users" half has
no mechanism anywhere -- exclusion_predicate_ref is validated only by isPlaceholder(), never dereferenced --
recommend scoping this to declared-and-asserted-in-the-venture's-own-CI rather than a factory-side guarantee.`;

const newDescription = basePrefix + CORRECTED_ADDENDUM;

// --- success_criteria: replace the [UNPOPULATED] stub with child-C-scoped criteria ---
const SUCCESS_CRITERIA = [
  {
    criterion: 'In-stage robustness (chairman directive): venture-agnostic fenced-identity execution engine, signed-in AND signed-out journey coverage, per-run evidence artifacts, explicit pass/fail with blocking advance, retry semantics, failure->root-fix-SD loop, and an observability proof the run exercised the live app',
    measure: 'each element present in the stage design/PRD AND exercised in at least one recorded UAT run against a live venture (AltifyAI at minimum); signed-out coverage demonstrated via a persona that does not force sign-in as step 1'
  },
  {
    criterion: 'Solomon addition C -- green-while-testing-nothing control pack: (i) per-journey minimum-assertion manifest (run FAILS if executed < manifest); (ii) live-deployment binding via nonce round-trip landed in the venture datastore + deployment sha in artifact; (iii) run-unique evidence bindings (artifact hash differs every run); (iv) paired non-quarantinable mutation control (broken canary journey must FAIL); plus fence two-sidedness (can exercise app AND cannot reach real users)',
    measure: 'all four controls + fence negative control present, each demonstrated firing in a recorded run; reuses lib/evidence/manifest-generator.js, lib/telemetry/canary-gauge-liveness.mjs, and scripts/audit/control-seed-test.mjs rather than re-authoring; criterion (v)\'s "cannot reach real users" half explicitly scoped per the LEAD-validation gap (declared+asserted in venture CI, not a factory-side guarantee)'
  },
  {
    criterion: 'Solomon addition D -- gate semantics: gate_type PROMOTION/blocking (never kill); N-failure ceiling escalates to root-fix SD + chairman visibility; gate failure output CLASSIFIES venture-defect vs factory-defect and routes accordingly',
    measure: 'stage row gate_type=promotion; ceiling + classifier present in gate implementation and exercised in test; classifier reuses lib/eva/findings/factory-defect-recorder.js + gap-class.js GAP_CLASS taxonomy'
  },
  {
    criterion: 'Binding enforcement is real, not observe-only: the UAT gate for the new stage actually blocks advancement on failure in at least one exercised test, not merely logged',
    measure: 'a new bespoke fromStage/toStage binding block (mirroring stage-execution-worker.js:3122-3178) exists for the new stage and a failing UAT run is proven to set advanced:false in a recorded test'
  },
  {
    criterion: 'Code passes lint and type checks; PR reviewed and approved',
    measure: 'CI green on the PR; at least one human or sub-agent review recorded'
  }
];

// --- smoke_test_steps: concrete 30-second demo ---
const SMOKE_TEST_STEPS = [
  {
    step: 'Trigger a UAT run for the new stage against the AltifyAI venture with a deliberately-included broken canary journey in the scenario set',
    expected_outcome: 'The run completes with overall status=FAIL specifically because the canary journey failed (visible in the per-journey breakdown), while all other real journeys pass -- proving the mutation control actually fires rather than the run reading green from an empty or trivial assertion set'
  },
  {
    step: 'Inspect the evidence artifact produced by that same run: its artifact hash, the recorded deployment sha, and the executed-assertion count vs the per-journey manifest minimum',
    expected_outcome: 'Artifact hash differs from the previous run\'s hash for the same venture/stage; deployment sha matches the venture\'s actual current deployed commit; executed-assertion count is >= the manifest minimum for every journey that passed, and the run for a journey with 0 executed assertions is marked FAIL, not PASS'
  }
];

const updatedMetadata = {
  ...sd.metadata,
  mechanism_verifications: [
    ...(sd.metadata?.mechanism_verifications || []),
    {
      claim: 'checkSyntheticActorFencing() in lib/eva/synthetic-actor-guard.js implements the fenced-identity mechanism this SD must generalize/reuse',
      verified_by: 'LEAD (this session, personally read the file + grepped the export)',
      verified_at: 'lib/eva/synthetic-actor-guard.js:142'
    }
  ],
  lead_gate_remediation: {
    remediated_at: new Date(0).toISOString(), // placeholder, corrected below
    validation_evidence_row: 'ca90aaba-884f-4455-9103-f5082410edc6',
    explore_evidence_row: 'ac2b1580-30d6-42e1-9d1e-5cf8406472e8',
    fixed: ['B1_success_criteria_populated', 'B2_backlog_items_added', 'B3_description_corrected', 'smoke_test_steps_concretized', 'mechanism_verification_added']
  }
};
// stamp real time from the instrument, not an estimate
updatedMetadata.lead_gate_remediation.remediated_at = new Date().toISOString();

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description: newDescription,
    success_criteria: SUCCESS_CRITERIA,
    smoke_test_steps: SMOKE_TEST_STEPS,
    metadata: updatedMetadata
  })
  .eq('id', sd.id);
if (updateErr) { console.error('UPDATE_ERR', updateErr.message); process.exit(1); }
console.log('SD_UPDATED=true');

// --- B2: backlog items ---
const BACKLOG_ITEMS = [
  {
    sd_id: SD_KEY,
    backlog_id: 'BL-UAT-C-001',
    backlog_title: 'Bespoke binding gate block for the new UAT stage',
    item_description: 'Add a new fromStage/toStage binding block in lib/eva/stage-execution-worker.js (mirroring the synthetic-actor-guard pattern at lines 3122-3178) that actually blocks advancement on UAT gate failure, rather than routing through the observe-only checkExitGates()/GATE_VERIFIERS machinery alone.',
    item_type: 'story',
    priority: 'critical',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: SD_KEY,
    backlog_id: 'BL-UAT-C-002',
    backlog_title: 'Green-while-testing-nothing control pack (Solomon addition C)',
    item_description: 'Wire per-journey minimum-assertion manifest, live-deployment nonce round-trip, run-unique evidence hashing, and a deliberately-broken canary journey into the UAT run, reusing lib/evidence/manifest-generator.js, lib/telemetry/canary-gauge-liveness.mjs, and scripts/audit/control-seed-test.mjs rather than re-authoring.',
    item_type: 'story',
    priority: 'critical',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: SD_KEY,
    backlog_id: 'BL-UAT-C-003',
    backlog_title: 'Signed-out journey coverage',
    item_description: 'Add a signed-out persona to the walked journey set and change buildStepExecutor\'s fallback so it does not force a sign-in as the first action of every step -- signed-out coverage is currently entirely absent.',
    item_type: 'story',
    priority: 'high',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: SD_KEY,
    backlog_id: 'BL-UAT-C-004',
    backlog_title: 'gate_type=promotion + venture-vs-factory defect classifier',
    item_description: 'Register the new stage with gate_type=promotion (never kill), implement an N-failure ceiling that escalates to a root-fix SD with chairman visibility, and classify gate failures as venture-defect vs factory-defect using lib/eva/findings/factory-defect-recorder.js + gap-class.js GAP_CLASS taxonomy.',
    item_type: 'story',
    priority: 'high',
    completion_status: 'NOT_STARTED'
  }
];

const { error: backlogErr } = await supabase.from('sd_backlog_map').insert(BACKLOG_ITEMS);
if (backlogErr) { console.error('BACKLOG_ERR', backlogErr.message); process.exit(1); }
console.log('BACKLOG_ITEMS_INSERTED=' + BACKLOG_ITEMS.length);
