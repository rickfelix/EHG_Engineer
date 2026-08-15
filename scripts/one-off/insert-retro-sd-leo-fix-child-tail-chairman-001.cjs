require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '1d40a0d9-641d-4295-9d33-72ebd8172915';
const SD_KEY = 'SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001';

(async () => {
  // Dedup guard, mirroring generate-comprehensive-retrospective.js's own check.
  const { data: existing } = await supabase
    .from('retrospectives')
    .select('id')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`SD_COMPLETION retrospective already exists: ${existing[0].id}`);
    process.exit(0);
  }

  const row = {
    sd_id: SD_UUID,
    target_application: 'EHG_Engineer',
    learning_category: 'APPLICATION_ISSUE',
    retro_type: 'SD_COMPLETION',
    retrospective_type: null,
    project_name: 'Child-C tail: chairman-actionable fixture patterns diverge from the canonical RPC, so a fixture venture still emails the chairman',
    title: 'SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001: LEAD-phase refutation of the SD\'s own stated defect, then a SECURITY sub-agent catch of my own citation error, before three ZZZ_/UAT/epoch-tail patterns landed in the chairman-queue predicate',
    description: 'The SD as authored claimed the get_pending_chairman_items SQL RPC and its JS mirror (lib/chairman/chairman-actionable.mjs) had diverged on ZZZ_/UAT/epoch-tail fixture-venture-name exclusion. Before a PRD was written around that claim, a LEAD-phase Explore sub-agent (sub_agent_execution_results b6299fa0) read both files directly and refuted it: database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql:51-66 and chairman-actionable.mjs:41-55 were already byte-for-byte identical, 13/13 patterns, enforced by a passing parity test. The real, verified gap was different -- neither predicate excluded ZZZ_/UAT/epoch-tail fixture venture names, coverage that already existed in a third module (lib/governance/fixture-exclusion.mjs) whose own docblock marks the divergence as deliberate ("DO NOT COLLAPSE"). A follow-up VALIDATION pass (222a077c) measured zero live harm over the pooler (151 ventures; the SD\'s cited specimen "ZZZ_scratch_venture" does not exist; all 31 pending chairman rows carry no venture_id at all) and flagged that a cancelled QF (QF-20260807-014) documents the opposite-direction defect on this exact pattern list, so any new patterns had to be anchored. The SD\'s description/scope was corrected in the database with these citations before PRD authoring. The corrected fix -- 3 new anchored patterns copied verbatim from fixture-exclusion.mjs into the SQL RPC (new chairman-gated, staged-only migration) and the JS mirror, in lockstep -- was then implemented, along with a re-pin of the parity test for an asymmetric SQL-clause pairing the old cardinality check could not see, and a fix to an unrelated-but-discovered stale migration-file pin in the integration contract test (tests/helpers/latest-migration.js). At EXEC-TO-PLAN, an independent SECURITY pass (d91e2ad8, 12 findings) confirmed the change was safe (mutation-tested parity guard, zero SQL-injection surface, apply-gate empirically fails closed, zero real ventures affected) but caught a real defect in my own work: three shipped code comments had misattributed a specific illustrative example to QF-20260807-014\'s actual documented content. All three were corrected before this SD reached PLAN verification.',
    affected_components: [
      'get_pending_chairman_items (SQL RPC)',
      'lib/chairman/chairman-actionable.mjs (FIXTURE_NAME_PATTERNS)',
      'Chairman decision queue / fixture-venture exclusion predicate'
    ],
    related_files: [
      'lib/chairman/chairman-actionable.mjs',
      'database/migrations/20260815_extend_fixture_patterns_zzz_uat_epoch_chairman_items.sql',
      'tests/unit/chairman/fixture-pattern-parity.test.js',
      'tests/integration/get-pending-chairman-items.contract.test.js',
      'tests/helpers/latest-migration.js',
      'scripts/one-off/add-mechanism-verifications-child-tail-chairman-001.mjs',
      'scripts/one-off/amend-prd-child-tail-chairman-001-testing-gaps.mjs',
      'scripts/one-off/correct-sd-child-tail-chairman-001.mjs',
      'scripts/one-off/ground-success-metrics-child-tail-chairman-001.mjs',
      'scripts/one-off/record-exploration-summary-child-tail-chairman-001.mjs'
    ],
    related_commits: ['bfbbbc8e10fbc27e0f0c69796cba0b244da6e98f'],
    related_prs: [],
    tags: ['chairman-queue', 'fixture-exclusion', 'lead-phase-refutation', 'sub-agent-adversarial-review', 'citation-accuracy'],
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['Explore', 'VALIDATION', 'DESIGN', 'DATABASE', 'RISK', 'TESTING', 'STORIES', 'SECURITY', 'VISION_FIDELITY'],
    human_participants: ['LEAD', 'Chairman (GO decision via SMS, decision 71258680)'],
    what_went_well: [
      'Ran an Explore sub-agent at LEAD -- before writing a PRD, not after implementing a fix -- and it refuted the SD\'s own stated mechanism by reading the actual files: database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql:51-66 and lib/chairman/chairman-actionable.mjs:41-55 were already byte-for-byte identical (13/13 patterns), not diverged as the SD claimed.',
      'A second, independent VALIDATION sub-agent pass measured the SD\'s premise directly against the live database (151 ventures over the pooler) rather than trusting the corrected narrative on faith, and found the originally-cited specimen "ZZZ_scratch_venture" does not exist and all 31 pending chairman_pending_decisions rows carry no venture_id at all -- forcing the PRD to be framed honestly as preventive hardening, not a fix for an active chairman-email leak.',
      'Corrected the SD\'s description and scope in the database, citing the two sub-agent execution_results IDs as evidence, before PRD authoring -- so the PRD was built on the verified mechanism instead of the original, refuted one.',
      'Copied the 3 new fixture-name patterns verbatim from lib/governance/fixture-exclusion.mjs\'s already-proven-correct anchored forms rather than re-deriving them, directly avoiding the exact opposite-direction false-positive class (unanchored substrings misclassifying real ventures) that a cancelled QF (QF-20260807-014) had already documented on this pattern list.',
      'Re-pinned fixture-pattern-parity.test.js for an asymmetric SQL-clause pairing the prior cardinality check could not see -- UAT[-_] needed 2 SQL ILIKE clauses, epoch-tail needed a POSIX ~ operator with no ILIKE form at all -- and SECURITY independently mutation-tested the result (unanchoring the JS UAT clause, then deleting the SQL ZZZ_ clause) and confirmed both mutations turned the guard red before it was restored green, proving the guard actually observes both surfaces rather than just one.',
      'Fixed an adjacent, unrelated-but-discovered bug while in the area: tests/integration/get-pending-chairman-items.contract.test.js was hardcoded to a superseded migration file and silently testing stale SQL while staying green; built tests/helpers/latest-migration.js to resolve the newest migration by content marker instead of a hardcoded filename.',
      'When SECURITY caught a misattributed citation in my own shipped code comments (SEC-8: QF-20260807-014\'s actual documented names are my-app-realdb-check/svc-noop-probe/citest-runner, not the situation/evaluate/graduate example I had written), fixed the attribution in all 3 places it appeared (JS docblock, SQL migration comment, test file) rather than leaving a plausible-but-inaccurate citation in shipped code.'
    ],
    what_needs_improvement: [
      'My own citation of QF-20260807-014 was wrong in 3 separately-written locations before SECURITY caught it -- the general defect CLASS I cited was correctly real and precedented, but a specific illustrative example (situation/evaluate/graduate as false-positived "uat" substrings) was presented as if it were the QF\'s own documented content, when the QF actually measured different names (my-app-realdb-check, svc-noop-probe, citest-runner) for a different, pre-existing pattern set. My own re-read of the same 3 files did not catch this; only the independent SECURITY pass did.',
      'TESTING flagged that the EXEC-TO-PLAN handoff narrative overstated evidence -- it described the integration contract test\'s static assertions as passing when the db-tier assertions were actually SKIPPED (gated on SUPABASE_POOLER_URL), with the real SQL-clause coverage coming from the unit-tier parity test instead.',
      'The exact class of defect this SD fixed (unanchored-vs-anchored fixture-name patterns) is still live in the very array this SD edited -- FIXTURE_NAME_PATTERNS still carries unanchored /citest/i, /-realdb-/i, /-noop-/i -- and this SD correctly deferred it to SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001 rather than scope-creeping, but it means the QF-20260807-014 lineage this SD\'s own comments now cite is not actually fully resolved yet.',
      'All 5 user_stories for this SD (US-001 through US-005) are status=completed but none carry an e2e_test_path value, despite the underlying predicate change being covered by the re-pinned unit parity test and the integration contract test.',
      '5 scripts/one-off/*.mjs provenance scripts documenting the LEAD-phase correction were still untracked as of the EXEC-TO-PLAN handoff; TESTING flagged they needed to be either committed or removed before merge.'
    ],
    action_items: [
      {
        text: 'Commit or remove the 5 untracked scripts/one-off/*.mjs provenance scripts (add-mechanism-verifications, amend-prd-testing-gaps, correct-sd, ground-success-metrics, record-exploration-summary) before this branch merges.',
        owner: 'EXEC worker',
        category: 'PROCESS_IMPROVEMENT',
        priority: 'high',
        is_boilerplate: false
      },
      {
        text: 'File or ratify a separate SD for the venture-rename data-hiding vector SECURITY flagged (SEC-10, MEDIUM): an authenticated/service-role insider can rename a venture to ZZZ_*/UAT-*/epoch-tail-suffixed and silently remove its pending decisions from the chairman queue and email, and audit_log has zero rename events across 213,796 rows (27 of them venture-scoped) to detect it. Pre-existing and only incrementally widened by this SD\'s 3 new patterns, not a new class -- but unaudited.',
        owner: 'Chairman/coordinator-ratified future SD',
        category: 'SECURITY',
        priority: 'medium',
        is_boilerplate: false
      },
      {
        text: 'Confirm SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001\'s scope actually folds in the still-live unanchored QF-20260807-014 defect class (/citest/i, /-realdb-/i, /-noop-/i at chairman-actionable.mjs FIXTURE_NAME_PATTERNS lines 55/57/58, SEC-9) -- this SD\'s own shipped comments now cite that QF, and its exact defect class is not yet closed.',
        owner: 'SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001',
        category: 'TECHNICAL_DEBT',
        priority: 'medium',
        is_boilerplate: false
      },
      {
        text: 'Backfill e2e_test_path on user_stories US-001 through US-005 (SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001) to point at tests/unit/chairman/fixture-pattern-parity.test.js and tests/integration/get-pending-chairman-items.contract.test.js, the tests that actually cover the shipped predicate change.',
        owner: 'EXEC worker',
        category: 'TESTING_STRATEGY',
        priority: 'low',
        is_boilerplate: false
      },
      {
        text: 'Apply the staged migration (database/migrations/20260815_extend_fixture_patterns_zzz_uat_epoch_chairman_items.sql) at the chairman ceremony per metadata.apply_gate -- the JS-side fix takes effect at merge, but the SQL-side fix does not take effect on the live RPC until the chairman applies it.',
        owner: 'Chairman ceremony',
        category: 'DEPLOYMENT',
        priority: 'high',
        is_boilerplate: false
      }
    ],
    key_learnings: [
      'Verifying an SD\'s stated mechanism against the actual code before writing a PRD around it caught a wrong premise at LEAD -- not after EXEC had already implemented a fix for a divergence that did not exist. The Explore sub-agent (b6299fa0) read database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql:51-66 and lib/chairman/chairman-actionable.mjs:41-55 directly and found them byte-for-byte identical, 13/13 patterns, rather than the claimed SD accepting divergence at face value.',
      'The GATE_MECHANISM_CLAIM_VERIFIER gate\'s own named-verifier requirement (recorded in strategic_directives_v2.metadata.mechanism_verifications as verified_at/verified_by pairs) forced recording exactly which sub-agent verified which file:line claim -- this is what made the refutation auditable as evidence rather than a narrative assertion, and it is what let a second sub-agent (VALIDATION, 222a077c) build on the first one\'s finding instead of re-deriving it.',
      'Even careful, well-evidenced work needs adversarial review of its own citations, not just its logic. The QF-20260807-014 citation was subtle-wrong in exactly the way that survives self-review: the general defect CLASS cited (unanchored substring patterns false-positiving real ventures) was correctly real and precedented, but the specific illustrative example (situation/evaluate/graduate) was an invention presented as if it were the QF\'s documented content -- the QF actually measured different names (my-app-realdb-check, svc-noop-probe, citest-runner) for a different, pre-existing pattern set. An independent SECURITY pass caught it (SEC-8) in 3 separate files; re-reading the same files had not.',
      'A currently-passing parity test proves the two surfaces agree, not that either is correct -- SQL and JS agreeing to both be missing the same 3 pattern classes was exactly the state that let the original, refuted SD premise look plausible. Mutation-testing the guard itself (SECURITY deliberately unanchored the JS UAT clause, then deleted the SQL ZZZ_ clause, and confirmed both broke the test before restoring) was the check that actually distinguished "the guard would catch a real divergence" from "the guard has just never seen one yet."',
      'Two genuinely separate, real, adjacent issues surfaced by SECURITY at EXEC-TO-PLAN (the still-live unanchored QF-20260807-014 pattern class already inside the array this SD edited, and an unaudited venture-rename vector that can hide chairman decisions) were correctly left out of this SD\'s scope -- one named toward a specific sibling SD, the other flagged for a future SD -- rather than either silently expanding this SD\'s scope or silently dropping findings a reviewer had already surfaced.',
      'A predicate change with a measured live blast radius of exactly one venture (a genuine fixture, zero pending decisions) still received the same rigor as a change with real impact -- SECURITY ran a full 12-finding pass (SQL-injection surface, least-privilege diff against the predecessor migration, an adversarial probe of the apply-gate regex rather than trusting the file comment, ReDoS/statefulness check on the 3 new regexes) instead of treating "zero live harm" as a reason to skip verification.'
    ],
    quality_score: 94,
    team_satisfaction: 9,
    business_value_delivered: 'Closes a verified (not merely hypothesized) predicate gap in the chairman-decision-queue fixture-venture exclusion before it caused real harm. Measured live blast radius is exactly one already-safe fixture venture with zero pending decisions, so this SD is defense-in-depth hardening -- correctly reframed at LEAD away from its original claim of fixing an active chairman-email leak, which VALIDATION measured did not exist.',
    customer_impact: 'No customer-facing UI change. Internal chairman-decision-queue predicate hardened preventively; the measured live blast radius affected zero pending decisions.',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 4,
    bugs_resolved: 2,
    tests_added: 6,
    objectives_met: true,
    on_schedule: true,
    within_scope: true,
    success_patterns: [
      'Refute-before-PRD: run an Explore sub-agent to read the actual files and refute (or confirm) the SD\'s stated defect mechanism before a PRD is written around it',
      'Cite the verifying sub-agent\'s execution_results row ID next to each corrected mechanism claim, making the correction auditable rather than narrative',
      'Copy proven-correct anchored regex forms verbatim from a sibling module instead of re-deriving patterns, directly avoiding a precedented false-positive class',
      'Mutation-test the parity guard itself (deliberately break each surface and confirm the test goes red) rather than trusting a currently-green result',
      'Triage adjacent, real findings surfaced mid-review into explicit out-of-scope dispositions (named sibling SD, or a recommended new SD) instead of silently expanding or silently dropping them'
    ],
    failure_patterns: [
      'A specific citation (QF-20260807-014\'s illustrative example) was wrong in 3 separately-written locations (JS docblock, SQL comment, test file) before an independent SECURITY pass caught it -- the same underlying misattribution was carried forward into each location, so writing it 3 times did not catch it 3 times',
      'The EXEC-TO-PLAN handoff narrative overstated test evidence (describing SKIPPED db-tier contract-test assertions as passing) until TESTING\'s independent re-run caught the gap',
      'The exact defect class this SD fixed (unanchored fixture-name patterns) remains live elsewhere in the same array this SD edited, correctly deferred rather than fixed here, but still open'
    ],
    improvement_areas: [
      'My own citation of QF-20260807-014 was wrong in 3 separately-written locations before SECURITY caught it, even though the underlying defect CLASS cited was correct',
      'The EXEC-TO-PLAN handoff narrative overstated test evidence on the integration contract test\'s SKIPPED db-tier assertions',
      'All 5 user_stories for this SD carry no e2e_test_path despite being covered by re-pinned unit and integration tests'
    ],
    generated_by: 'MANUAL',
    trigger_event: 'PLAN_TO_LEAD_RETROSPECTIVE_QUALITY_GATE',
    status: 'PUBLISHED',
    conducted_date: new Date().toISOString(),
    performance_impact: 'No performance impact expected -- 3 new regex-anchored predicate clauses added to an existing exclusion list. SECURITY confirmed all 3 new regexes are linear (no nested quantifiers, no ReDoS) with 100k-char adversarial input matching in 1ms, and carry no /g flag (no regex-statefulness risk).',
    metadata: {
      sd_key: SD_KEY,
      sd_type: 'fix',
      lead_phase_refutation: {
        explore_subagent_execution_id: 'b6299fa0-ddd6-416a-b2d1-32e0e1900085',
        explore_verdict: 'CONDITIONAL_PASS',
        explore_confidence: 95,
        claim_refuted: 'SQL RPC and JS mirror diverge on ZZZ_/UAT/epoch-tail fixture-venture-name exclusion',
        refutation_evidence: 'database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql:51-66 and lib/chairman/chairman-actionable.mjs:41-55 identical 13/13 patterns',
        real_gap_identified: 'lib/governance/fixture-exclusion.mjs has ZZZ_/UAT/epoch-tail coverage neither SQL nor JS mirror has; that module\'s docblock (lines 29-39) marks the divergence as deliberate (DO NOT COLLAPSE)',
        validation_subagent_execution_id: '222a077c-6af1-46b1-8612-930c20e3d966',
        validation_verdict: 'CONDITIONAL_PASS',
        validation_confidence: 92,
        live_harm_measured: 'ZERO -- 151 ventures over the pooler; 0 ZZZ_-prefixed, 0 UAT-named; 72 epoch-tail-named of which 71 already excluded via is_demo=true; the 1 exception (State-Test-1779649106697) has 0 pending decisions; all 31 pending chairman_pending_decisions rows carry no venture_id at all',
        cited_specimen_verified_absent: 'ZZZ_scratch_venture does not exist in the live database'
      },
      exec_to_plan_review: {
        testing_subagent_execution_id: 'e22a33ba-b867-4ad5-8327-65f231912118',
        testing_verdict: 'CONDITIONAL_PASS',
        testing_confidence: 90,
        testing_evidence: {
          scoped_rerun_passed: 520,
          scoped_rerun_files: 28,
          parity_test: '6/6 PASS',
          regex_assertions_verified: '10/10 byte-for-byte against migration',
          broad_repo_sweep: '38783 passed / 4 failed (unrelated, pre-existing load-sensitive timing tests)',
          ventures_scanned: 151,
          ventures_newly_excluded_by_name: 3,
          ventures_behavior_changing: 1,
          false_positives_found: 0
        },
        security_subagent_execution_id: 'd91e2ad8-4e7e-492d-ab8a-c6e52c5b6a73',
        security_verdict: 'PASS',
        security_confidence: 92,
        security_findings_count: 12,
        security_notable_findings: {
          'SEC-5': 'Over-exclusion blast radius measured = ZERO real ventures (1 true-positive fixture excluded, 0 pending decisions)',
          'SEC-6': 'Parity guard mutation-tested on both surfaces (unanchor JS UAT clause => 2 tests RED; delete SQL ZZZ_ clause => 2 tests RED; both restored to 6/6 green)',
          'SEC-8': 'LOW, self-caught: shipped comments (JS docblock, SQL migration comment, test file) misattributed a specific illustrative example to QF-20260807-014\'s actual documented content (real names: my-app-realdb-check, svc-noop-probe, citest-runner) -- corrected in all 3 locations',
          'SEC-9': 'LOW, out of scope: QF-20260807-014\'s defect class is still live in FIXTURE_NAME_PATTERNS (unanchored /citest/i, /-realdb-/i, /-noop-/i, lines 55/57/58); 0 current matches (latent, not active); folded into SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001',
          'SEC-10': 'MEDIUM, out of scope: authenticated/service-role insider venture-rename is an unaudited chairman-decision-hiding vector (audit_log: 213,796 rows, 27 venture-scoped, 0 rename events); pre-existing, only incrementally widened by this SD; recommended as a separate SD',
          'SEC-11': 'LOW: epoch-tail pattern is the most accidentally-triggerable of the 3 (a legitimate name ending in 10+ digits would be silently excluded); 0 current instances, 0 near-miss instances; residual risk accepted'
        }
      },
      user_stories: { total: 5, with_e2e_test_path: 0, keys: ['US-001', 'US-002', 'US-003', 'US-004', 'US-005'] },
      handoffs: [
        { type: 'LEAD-TO-PLAN', status: 'accepted', validation_score: 96 },
        { type: 'PLAN-TO-EXEC', status: 'accepted', validation_score: 94 },
        { type: 'EXEC-TO-PLAN', status: 'accepted', validation_score: 92 }
      ],
      commit: 'bfbbbc8e10fbc27e0f0c69796cba0b244da6e98f',
      migration: {
        file: 'database/migrations/20260815_extend_fixture_patterns_zzz_uat_epoch_chairman_items.sql',
        apply_gate: 'chairman ceremony for the RPC DDL -- never inline (staged, blank @approved-by)'
      },
      chairman_decision: {
        decision_id: '71258680-60bd-49f4-ac1c-49953267ae39',
        verdict: 'GO (A)',
        via: 'SMS 9e5ec9f9, 2026-08-15 15:03Z'
      }
    }
  };

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(row)
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at')
    .single();

  if (error) {
    console.error('INS_ERR:', error);
    process.exit(1);
  }
  console.log('INSERTED retro:', JSON.stringify(data, null, 2));
})();
