import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd } = await supabase.from('strategic_directives_v2')
  .select('id, sd_key, target_application, status, current_phase')
  .eq('sd_key', SD_KEY).maybeSingle();
if (!sd) { console.error('SD not found'); process.exit(1); }
console.log('SD uuid:', sd.id, 'target_app:', sd.target_application, 'phase:', sd.current_phase);

const results = {
  verdict: 'WARNING',
  confidence_score: 88,
  phase: 'PLAN',
  execution_time_ms: 0,
  summary: 'PLAN-phase test-plan review of PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A (FR-1..FR-9, TR-1..TR-7, TS-1..TS-28). Every factual premise in the PRD was independently verified against the live DB and repo and all held true. Test plan is implementable; 10 gaps flagged, 3 material. Verdict WARNING (non-blocking): EXEC may proceed, gaps should be folded into the test plan.',
  critical_issues: [],
  warnings: [
    'GAP-1 (material): TR-2 enumerates only the three partial UNIQUE indexes as correction-INSERT collision hazards. public.feedback also carries 6 row-level CHECK constraints that re-evaluate on EVERY correction INSERT: chk_resolved_requires_reference, chk_feedback_terminal_resolution, chk_wont_fix_requires_notes, chk_duplicate_requires_reference, chk_feedback_no_self_duplicate, feedback_status_check. No FR, TR, or TS covers them. Since buildFeedbackCorrection already drops fields unconditionally (it nulls error_hash), a correction carrying status resolved/wont_fix/duplicate can be rejected at write time by a constraint no test exercises. Recommend a new TS: buildFeedbackCorrection output satisfies every feedback CHECK constraint for each in-scope status.',
    'GAP-2 (material): two existing test files pin the .update() behaviour FR-6/FR-7 remove. tests/unit/governance/resolve-feedback.test.js has 30 update references including the explicit assertion "returns { updated: true, id } when the UPDATE matched a non-resolved row"; tests/unit/governance/withheld-registry.test.js builds an update-capable fake db (db.update at L504/L567). The PRD acceptance criterion "0 test regressions" does not acknowledge these must be rewritten, and no FR lists them as deliverables.',
    'GAP-3 (material): FR-9 (the reversible 3-step cutover that closes the critique BLOCK finding) has NO test scenario in TS-1..TS-28. Its three ACs - migration+backfill committed before any producer change, cutover gated on the count match, and producer-only revert restoring pre-SD behaviour with no data loss - are process assertions with no verification artifact. At minimum add a TS asserting the revert was rehearsed and step ordering held.',
    'GAP-4: acceptance_criteria item 4 still reads "new tests cover TS-1 through TS-24" while test_scenarios now contains 28. Stale off-by-4 left over from the critique amendment that added TS-25..TS-28.',
    'GAP-5: FR-2 turns a permanently dead 422 quality gate live (feedback.quality_score does not exist - verified error "column feedback.quality_score does not exist"; corrected to rubric_score). That is a live behaviour change: 22 rows currently carry a non-null rubric_score and 1 of them is under 40, so the gate starts rejecting on day one. No TS covers the new 422 path or the NULL passthrough.',
    'GAP-6: TS-21 and TS-28 pin the live marker counts (136 withheld_pending / 117 promoted_to_qf). Verified still exactly 136/117 today, but the PRD cites a ~132 feedback rows/day organic baseline, so these will drift before EXEC lands. Express the assertion as a measured-at-runtime before/after comparison, never as fixed literals.',
    'GAP-7: TS-11/12/13/15/16 are typed "integration" while TR-5 forbids any real-DB interaction with public.feedback. The termination proofs (TS-15/TS-16 "second run inserts zero rows") therefore require a STATEFUL in-memory fake that accumulates inserts and re-serves them on later selects. tests/helpers/postgrest-fixture-store.js (createFixtureSupabase) fits, but no FR names a harness deliverable - flag it so EXEC does not hand-roll a stateless chain mock that structurally cannot prove termination.',
    'MINOR: trg_log_feedback_resolution_violation is BEFORE INSERT OR UPDATE (not UPDATE-only) and is RAISE WARNING / RETURN NEW - non-blocking, but every correction INSERT landing on resolved/wont_fix/duplicate without a reference now emits one WARNING per correction instead of one per update. Log-noise only, no design change needed.',
    'MINOR: FR-6 claims 3 production callers compare the pinned reason string with strict equality. Repo-wide grep finds 2: scripts/modules/complete-quick-fix/orchestrator.js:1267 and scripts/reconcile-feedback-references.js:210. apply-chairman-decision-captures.mjs did not match. The pin is still required; the count is off by one.',
    'MINOR: product_requirements_v2.activation_test_id and smoke_test_cmd are both NULL. FR-7+FR-8 ship a schema change (new table) plus worker/consumer producer rewiring, which is exactly the dual-scan shape that trips the activation-invariant gate at LEAD-FINAL-APPROVAL. Declare activation_test_id now (TS-20 or TS-21 is the natural candidate) rather than discovering it at final approval.'
  ],
  recommendations: [
    'Add a CHECK-constraint test scenario (GAP-1) before EXEC starts - it is the only gap that can fail at write time in production rather than in a test.',
    'List tests/unit/governance/resolve-feedback.test.js and tests/unit/governance/withheld-registry.test.js as explicit EXEC deliverables under FR-6/FR-7 (GAP-2).',
    'Add a TS for FR-9 step-ordering and producer-only revert (GAP-3).',
    'Correct acceptance_criteria item 4 to read TS-1 through TS-28 (GAP-4).',
    'Add a TS for the newly-live rubric_score 422 gate covering both the under-40 reject and the NULL passthrough (GAP-5).',
    'Rewrite TS-21/TS-28 as runtime-measured before/after comparisons rather than the literals 136/117 (GAP-6).',
    'Name tests/helpers/postgrest-fixture-store.js createFixtureSupabase as the harness for the TS-15/TS-16 termination proofs (GAP-7).',
    'Populate product_requirements_v2.activation_test_id on the PRD now.'
  ],
  detailed_analysis: {
    review_type: 'PLAN-phase test-plan review (pre-implementation, no code written)',
    prd_id: 'PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A',
    scenarios_reviewed: 28,
    functional_requirements_reviewed: 9,
    technical_requirements_reviewed: 7,
    coverage_matrix: {
      'FR-1': ['TS-1', 'TS-2', 'TS-3', 'TS-4', 'TS-5', 'TS-6', 'TS-7', 'TS-8', 'TS-25', 'TS-26'],
      'FR-2': ['TS-11', 'TS-12', 'TS-13'],
      'FR-3': ['TS-14', 'TS-15', 'TS-18'],
      'FR-4': ['TS-17'],
      'FR-5': ['TS-16', 'TS-18'],
      'FR-6': ['TS-9', 'TS-10', 'TS-23'],
      'FR-7': ['TS-19', 'TS-20', 'TS-22', 'TS-27'],
      'FR-8': ['TS-21', 'TS-28'],
      'FR-9': []
    },
    premises_independently_verified: [
      'All 3 partial UNIQUE indexes exist as named in TR-2 (idx_feedback_venture_error_hash, idx_feedback_error_capture_hash, idx_feedback_telemetry_dedup) via pg_indexes',
      'feedback_status_check allowed set matches FR-3 exactly (new, triaged, in_progress, resolved, wont_fix, duplicate, invalid, backlog, shipped); stale is absent, confirming the original update() would have failed independent of the append-only trigger',
      '3 append-only triggers present with tgenabled=A (ENABLE ALWAYS): feedback_no_update, feedback_no_delete_trg, feedback_no_truncate_trg',
      'feedback.quality_score does NOT exist (dead gate at server/routes/feedback.js:58 confirmed); rubric_score and quality_assessment do exist',
      'Live marker counts still exactly 136 metadata.withheld_pending / 117 metadata.promoted_to_qf',
      'withheld_promotion_markers is ABSENT (verified by a non-head select; the head:true+count probe returned no error with count=null, the known false-EXISTS trap)',
      'All 7 owned files exist with .update() sites at the claimed locations: server/routes/feedback.js L119+L239, feedback-staleness-check.js L92, feedback-link-resolution.mjs L81, feedback-age-out.mjs L69, resolve-feedback.js L185, withheld-registry.mjs L170/L239/L263, feedback-fingerprint-promoter.mjs L213',
      'Pinned string no_row_or_already_resolved present at lib/governance/resolve-feedback.js:194',
      'Harness exists: vitest.config.js, tests/helpers/db-available.js (describeDb/itDb), the *.db.test.js convention in active use, tests/helpers/postgrest-fixture-store.js, tests/helpers/supabase-chain-mock.js, and classifyMigration() exported at scripts/lib/migration-tier-classifier.mjs:405',
      'lib/governance/feedback-correction.js correctly absent (FR-1 creates it in EXEC)'
    ],
    verdict_rationale: 'WARNING, not FAIL: the plan is implementable as written, every premise is measured rather than asserted, and the harness already exists. The 3 material gaps are additive test-coverage omissions, not design defects, and none blocks EXEC from starting.'
  },
  metadata: {
    review_mode: 'pre-implementation-plan-review',
    handoff_type: 'PLAN-TO-EXEC',
    no_implementation_performed: true,
    tests_executed: 0,
    verification_method: 'live DB introspection (pg_constraint, pg_indexes, pg_trigger, pg_proc, information_schema) plus repo static inspection',
    gaps_total: 10,
    gaps_material: 3
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application,
  subAgentCode: 'TESTING',
  supabase
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', sd.id, { code: 'TESTING', name: 'QA Engineering Director' }, results, { sdKey: SD_KEY });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase);
