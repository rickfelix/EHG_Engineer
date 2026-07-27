// Enhance the auto-generated (boilerplate) SD_COMPLETION retrospective for
// SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 with the actual session narrative:
// two camouflaged-failure bugs fixed, a camouflage bug RECURRING inside the fix
// itself (caught by adversarial mutation-testing), a genuine PRD-text defect
// converged on independently by 3 roles across 3 phases, a live near-miss on the
// exact volatile-population trap this SD exists to prevent, an orphan-session
// adoption recovery, and an honest, numbers-not-reassurance statement that the
// SD is NOT fully delivered (branch unmerged, chairman-gated migration unapplied,
// 1 row matching the stranded signature live in production at write time).
//
// Base row generated via the canonical scripts/generate-comprehensive-retrospective.js
// (id fd442d13-f751-4651-833d-31522452eb63, mechanical quality_score 90 from
// auto-extracted handoff/PRD boilerplate). This pass replaces the generic content
// with grounded, independently-verified analysis per CLAUDE.md prologue rule 11's
// sibling principle for retrospectives: evidence over restated summary.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RETRO_ID = 'fd442d13-f751-4651-833d-31522452eb63';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';
const NOW_ISO = new Date().toISOString();

const update = {
  description: `Two camouflaged failures from the 2026-07-26 outage (a cleared claim that silently strands a QF while the supply gauge still counts it; a dispatch-hint pass that aborts fleet-wide on one undeliverable addressee) were fixed and independently, adversarially re-verified across EXEC and PLAN. A THIRD camouflage bug — of the identical shape as the SD's own subject — was found recurring INSIDE the fix (a resolved insert error silently counted as a delivered hint) and closed via mutation-tested code. Built by a session that was reaped mid-build (9 commits) and recovered by an adopting session that merged 28 stale origin/main commits, found and fixed the recursion bug, and drove the SD from a rejected EXEC-TO-PLAN handoff (SUBAGENT_EVIDENCE_MISSING) to an accepted one (score 93). HONEST STATE AS OF THIS RETROSPECTIVE (numbers, not reassurance): the branch is NOT merged to origin/main; the chairman-gated FR-2 migration is NOT applied (re-verified live moments ago: 5/5 checks FAIL); and 1 row (QF-20260727-157) matches the exact stranded signature in production right now, out of 9 in_progress quick_fixes rows. The code is correct and well-tested; the incident's root cause is not yet closed in production.`,

  what_went_well: [
    { achievement: 'Two independent EXEC-phase sub-agents (TESTING, via literal mutation-testing — disabling a check and confirming exactly the tests built to catch it went red; SECURITY, via reading the actual contract of the shared dependency insertCoordinationRow) converged on the SAME two real bugs in the as-built FR-5/FR-6 code without one inheriting the other\'s work, both fixed in commit 80273a9fc0f.', is_boilerplate: false },
    { achievement: 'Adversarial verification did not stop once two agents agreed: a THIRD, PLAN-phase pass (REGRESSION) asked a structurally different question — "who consumes the value this change altered?" rather than "does the changed function behave correctly?" — and found a genuinely different, still-open risk (detectThunderingHerd becoming measurably more sensitive under the FR-4 gauge narrowing) that neither EXEC-phase pass could have surfaced by construction.', is_boilerplate: false },
    { achievement: 'THREE independent traces — EXEC\'s own commit message while building FR-3 (ed0fda01bc1), TESTING\'s second-pass re-verification (downgraded HIGH to LOW), and VALIDATION\'s PLAN-phase adjudication (finding V3) — each independently reconstructed the identical conclusion by tracing the real call path rather than trusting the PRD text: complete-quick-fix/orchestrator.js:84 always writes a real, non-null pr_url, so it can never satisfy FR-1\'s own guard (pr_url IS NULL) by construction. All three cited the same live measurement (9 in_progress rows, exactly 2 carrying pr_url/commit_sha).', is_boilerplate: false },
    { achievement: 'VALIDATION caught itself about to fall into the exact volatile-population trap this SD exists to prevent: it measured 0 stranded rows, then explicitly flagged that the branch is unmerged (so this reflects pre-fix code) and that it personally watched one row (QF-20260726-175) move from stranded into merge-witnessed between two of its own queries roughly a minute apart — refusing to report the 0 as a validated "after" result.', is_boilerplate: false },
    { achievement: 'Full recovery from a mid-build session reap: the original session (61d2bb66) committed 9 commits (FR-1 through an initial hardening fix) before being reaped; the adopting session merged 28 stale commits from origin/main, found and fixed the two-bug recursion the original build had missed, and drove the SD to an accepted EXEC-TO-PLAN handoff (score 93) — with zero rework needed on any of the 9 inherited commits (FR-3\'s scope-correction in particular held up unmodified under three later, independent rounds of scrutiny).', is_boilerplate: false },
    { achievement: 'Every numeric claim in the final PLAN-phase evidence was independently re-derived, not inherited: VALIDATION re-ran the live migration-verification script itself, re-grepped all 16 release_sd RPC call sites itself rather than trusting SECURITY\'s prior count of 17, and re-ran the SD\'s test suites itself rather than citing EXEC\'s pass/fail numbers.', is_boilerplate: false },
    { achievement: 'Both of the SD\'s explicit non-goals (no widening self-service to non-critical QFs; no repo/application filter) were independently re-verified across LEAD, EXEC and PLAN, including one out-of-band script VALIDATION wrote specifically to bypass a stale, unrelated test-quarantine entry that would otherwise have hidden whether the pull-order guarantee was genuinely intact.', is_boilerplate: false },
    { achievement: 'PRD created and validated with 7 functional requirements and 3 technical requirements; LEAD-TO-PLAN (95), PLAN-TO-EXEC (97) and EXEC-TO-PLAN (93) all passed with sub-agent evidence grounding every score.', is_boilerplate: false },
  ],

  what_needs_improvement: [
    'Three separate handoff attempts were rejected purely on missing/failed sub-agent evidence, not code defects: LEAD-TO-PLAN (SUBAGENT_EVIDENCE_MISSING), PLAN-TO-EXEC (USER_STORIES_BYPASSED + SUBAGENT_EVIDENCE_MISSING), and EXEC-TO-PLAN twice (once SUBAGENT_EVIDENCE_MISSING, once MANDATORY_TESTING_VALIDATION_FAILED on a WARNING verdict) — the artifact was ready each time; the attestation was not.',
    'The as-shipped FR-5/FR-6 fix reintroduced this SD\'s own subject bug one layer up, inside the metric built to detect it: insertCoordinationRow\'s resolved-{error} return value was silently counted as a successful delivery until an adversarial mutation-testing pass caught it — a 0-of-10 delivery pass could have reported a false 10-of-10 ratio.',
    'The chairman-gated FR-2 migration was not flagged at SD-sourcing time (no requires_chairman_apply/hold metadata anywhere on the SD row) — a recurrence of an already-named, tracked gap: a different SD\'s feedback on 2026-07-20 explicitly names "the known pre-flag-chairman-gated-DDL-at-sourcing gap," and several 2026-06 completion-flags separately record chairman-gated migrations left unapplied. This is now at least a 3rd-plus recurrence over 5+ weeks.',
    'FR-3\'s PRD text (product_requirements_v2 functional_requirements[2]) still literally names orchestrator.js:84 as a required routing site and still asserts a "zero bare-clear grep hits" acceptance criterion that the current, correct implementation does not satisfy — even after 3 independent sub-agent passes concluded the text itself is wrong, nobody has yet edited the PRD row.',
    'REGRESSION found a real, currently-untested behavior change: narrowing the supply gauge (FR-4) makes the pre-existing detectThunderingHerd detector measurably more sensitive to the same idle-worker count, and no test or explicit PRD note covers whether that sensitivity increase is an accepted tradeoff.',
    'As of this retrospective, the branch is still not merged to origin/main and the FR-2 migration is still not applied — re-verified live (scripts/one-off/verify-release-sd-qf-branch.mjs) moments before this retrospective was written: 5/5 checks FAIL. The population this SD targets is provably still moving: 1 row (QF-20260727-157) matches the exact stranded signature in production right now, out of 9 in_progress rows.',
  ],

  key_learnings: [
    { learning: 'FR-3 UNSATISFIABLE-BY-CONSTRUCTION: when a requirement names a specific call site as a fix target AND a separate clause in the same document defines an exclusion guard, the two can contradict each other even though each reads correctly alone. Here, FR-3 named orchestrator.js:84 as a required routing site while FR-1 (which FR-3 must route through) excludes any row carrying a non-null pr_url — and that exact call site always writes a real pr_url. Generalizable rule: before finalizing requirement text, check whether the named site\'s OTHER written fields satisfy the guard\'s FULL predicate, not just whether the site superficially matches the described symptom. It took three independent full traces across three phases to actually reach this conclusion in practice, and even now the PRD text itself remains uncorrected — fixing the code is not the same as fixing the requirement, and both are needed.', is_boilerplate: false },
    { learning: 'UNTIMESTAMPED VOLATILE POPULATION: a "0" (or any count) measured against a population that turns over on a timescale shorter than the investigation itself is one sample, not evidence of a stable state. VALIDATION measured 0 stranded rows and, to its credit, immediately caveated that (a) the branch is unmerged so this reflects PRE-fix code, and (b) it personally watched a row move buckets between two of its own queries about a minute apart. This retrospective independently re-measured at write time and found the count had moved AGAIN, to 1 — not a regression, exactly the behavior the SD\'s own text warns the population will exhibit. Generalizable rule: always pair a live count with the artifact\'s actual deploy/merge state and either a repeat measurement or an explicit volatility caveat, especially when the SD\'s entire premise is that this exact population is measured wrong elsewhere in the system — and never reuse an earlier "0" in a later report without re-measuring and re-timestamping it.', is_boilerplate: false },
    { learning: 'CHAIRMAN-GATED DDL MUST BE PRE-FLAGGED AT SOURCING: this is not an isolated miss — it is a repeatedly-recurring gap in SD creation, independently found again here after a different SD\'s feedback on 2026-07-20 already named it explicitly ("the known pre-flag-chairman-gated-DDL-at-sourcing gap") and multiple 2026-06 completion-flags separately recorded the same unapplied-migration pattern. Generalizable rule: a cheap, mechanical check at SD-creation time — scan the new SD\'s own description/scope text and any named fix-files for schema-mutation signatures (CREATE OR REPLACE FUNCTION, ALTER TABLE, a database/migrations/ path) and auto-stamp metadata.requires_chairman_apply — would close this class at near-zero ongoing cost, instead of every SD\'s LEAD/PLAN/EXEC independently re-discovering the identical dependency from scratch.', is_boilerplate: false },
    { learning: 'EVIDENCE, NOT IMPLEMENTATION, WAS THE BLOCKER: a reaped session can leave code that is 100% functionally complete but 0% attested, and from the DB\'s point of view those two states are indistinguishable until a new session manually re-runs the sub-agents. Because a handoff attempt is the most natural point at which a session notices it should wrap up — and therefore also a likely point to be interrupted or reaped — evidence-writing deferred until the handoff attempt is structurally exposed to exactly this failure mode. Here it cost roughly 7-8 hours between the code being functionally complete (04:35 UTC) and the handoff finally landing (12:06 UTC), almost entirely on evidence recovery, not further code changes. Generalizable rule: couple evidence capture closer to the commit/build boundary (or make it durably resumable) rather than deferring it to the handoff attempt.', is_boilerplate: false },
    { learning: 'ADVERSARIAL VERIFICATION HAS DIMINISHING BUT STILL-POSITIVE RETURNS FROM A DIFFERENTLY-ANGLED THIRD PASS: two independent reviewers agreeing that something is fixed is strong evidence for the things they both checked — but it is a claim about their shared blind spots, not about the absence of any blind spot. Here, two EXEC-phase agents (one mutation-testing the function directly, one reading its dependency\'s actual contract) agreed and were both right. A third, PLAN-phase pass that asked a structurally different question — trace the CONSUMERS of the values this change altered, rather than re-test the function that produces them — found something real (the THUNDERING_HERD sensitivity change) that neither prior pass could have found by construction. Generalizable rule: when budget allows a third review pass, its value is highest if it asks a genuinely different KIND of question, not if it re-runs the same method a third time.', is_boilerplate: false },
  ],

  action_items: [
    {
      owner: 'Chairman',
      action: 'Apply database/migrations/20260727_release_sd_qf_reopen.sql and re-run scripts/one-off/verify-release-sd-qf-branch.mjs to confirm the live function passes all 5 checks (currently 5/5 FAIL, re-verified live at retrospective write time) — this closes the dominant remaining exposure across ~15 of 16 release_sd RPC callers that stay on the unpatched function until this lands.',
      source: 'gap_at_lead_final',
      priority: 'high',
      smart_format: true,
      success_criteria: 'verify-release-sd-qf-branch.mjs reports 5/5 PASS against the live database.',
      evidence_ref: 'Live re-run at retrospective time (2026-07-27); sub_agent_execution_results e4a07b5a (VALIDATION V4), eceae9b1 (REGRESSION R1)',
    },
    {
      owner: 'Coordinator / PRD owner',
      action: 'Correct FR-3\'s acceptance_criteria/description text in product_requirements_v2 to remove or footnote complete-quick-fix/orchestrator.js:84 as a "stranding" site, so the PRD matches the shipped, correct implementation — 3 independent passes have concluded this, but the PRD row itself has not yet been edited.',
      source: 'prd_text_defect',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'product_requirements_v2 functional_requirements[2] no longer names orchestrator.js:84 as a required routing site, or carries an explicit documented exception.',
      evidence_ref: 'commit ed0fda01bc1; sub_agent_execution_results d1edcb38/12516639 (TESTING T3), e4a07b5a (VALIDATION V3)',
    },
    {
      owner: 'Coordinator',
      action: 'Merge feat/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 to origin/main. Confirmed NOT merged as of this retrospective (git merge-base --is-ancestor HEAD origin/main returns false) — none of FR-1/FR-3/FR-4/FR-5/FR-6 are live, and a row matching the exact stranded signature (QF-20260727-157) exists in production right now.',
      source: 'deployment_gap',
      priority: 'high',
      smart_format: true,
      success_criteria: 'git merge-base --is-ancestor HEAD origin/main returns true.',
      evidence_ref: 'Live git check at retrospective time (2026-07-27)',
    },
    {
      owner: 'LEO Protocol / harness team',
      action: 'File a harness-backlog SD to auto-detect chairman-gated DDL at SD-sourcing time: scan a new SD\'s own description/scope and named fix-files for schema-mutation signatures (CREATE OR REPLACE FUNCTION, ALTER TABLE, a database/migrations/ path) and auto-stamp metadata.requires_chairman_apply.',
      source: 'recurring_process_gap',
      priority: 'high',
      smart_format: true,
      success_criteria: 'A tracked SD/QF exists for this fix; cites feedback row 856969b1 (2026-07-20, different SD, same named gap) as prior recurrence evidence.',
      evidence_ref: 'feedback id 856969b1-c962-450b-9d9d-b65e09226f7d',
    },
    {
      owner: 'PLAN',
      action: 'Add a test pinning detectThunderingHerd\'s behavior against the FR-4-narrowed unclaimedItems value under a realistic mixed-supply fixture, and explicitly record whether the resulting sensitivity increase is an accepted tradeoff.',
      source: 'regression_finding_R2',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'A test exists asserting detectThunderingHerd\'s firing behavior under the new gauge definition; FR-4\'s PRD text or a follow-up note states the tradeoff is accepted.',
      evidence_ref: 'sub_agent_execution_results eceae9b1 (REGRESSION R2)',
    },
    {
      owner: 'Harness/process owner',
      action: 'Consider tightening the coupling between EXEC build completion and sub-agent evidence capture (e.g. a pre-handoff auto-invoke, or a durable partial-evidence checkpoint) so a reaped session does not leave a fully-built-but-zero-evidence state for the next session to reconstruct from git log alone.',
      source: 'session_reap_recovery_cost',
      priority: 'medium',
      smart_format: true,
      success_criteria: 'A documented or implemented mechanism exists that reduces evidence-recovery latency after a session reap mid-EXEC.',
      evidence_ref: 'This SD\'s own handoff history: 3 evidence-grounds rejections (bfccf739, 5ccafb9a, fab550a3/058e0e88) before EXEC-TO-PLAN finally passed (9d0abbf9, score 93)',
    },
    {
      owner: 'Follow-on owner (low priority)',
      action: 'Wire clearAndReopenQf\'s repair mode (expectedHolder omitted) into a periodic sweep pass so rows stranded via the ~15 un-migrated release_sd callers get auto-healed even before FR-2 ships — implemented and unit-tested, but zero production call sites invoke it today.',
      source: 'security_S13_validation_V6',
      priority: 'low',
      smart_format: true,
      success_criteria: 'A production call site invokes clearAndReopenQf without expectedHolder on a schedule.',
      evidence_ref: 'sub_agent_execution_results 2c32a603 (SECURITY S13), e4a07b5a (VALIDATION V6)',
    },
  ],

  success_patterns: [
    'Independent multi-angle adversarial review (mutation-testing + dependency-contract-reading + consumer-tracing) found real bugs a single-method review would have missed, across 3 phases without any one pass repeating another\'s method',
    'Live re-verification instead of trusting a prior verdict: VALIDATION and REGRESSION both re-ran the migration-check script, the test suites, and the RPC-call-site grep themselves rather than citing SECURITY\'s or TESTING\'s numbers',
    'A scope-correction made mid-build (commit ed0fda01bc1) held up unmodified under three independent later reviews, across two further phases',
    'Explicit, numbered before/after population measurement was demanded by the SD\'s own acceptance criteria and then actually delivered, including a caught near-miss on a stale/point-in-time read',
    'Both of the SD\'s own explicit non-goals (no self-service widening; no repo filter) were independently re-verified at every phase rather than assumed once and carried forward',
  ],

  failure_patterns: [
    '3 handoff rejections (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN x2) on evidence/attestation grounds, zero on code defects — process latency, not workmanship',
    'The as-built fix reintroduced this SD\'s own subject bug one layer up (a resolved {error} silently counted as a delivery) inside the very metric meant to detect it, caught only by adversarial mutation-testing',
    'Chairman-gated DDL dependency (FR-2) not flagged at SD-sourcing — a now 3rd-plus recurrence of an already-named, tracked gap',
    'PRD text (FR-3) left uncorrected after 3 independent sub-agent passes concluded it was wrong — the code was fixed, the requirement document was not',
    'A real, untested behavior-change risk (detectThunderingHerd sensitivity) shipped without a pinning test or explicit PRD acknowledgment',
    'Root cause remains live in production: branch unmerged, migration unapplied (5/5 FAIL, re-verified live at retrospective write time), and a row matching the exact stranded signature exists right now',
  ],

  improvement_areas: [
    'Correct FR-3\'s PRD text (still wrong after 3 independent findings)',
    'Merge the branch and apply the chairman-gated FR-2 migration — the incident\'s root cause is not yet closed in production',
    'Auto-detect chairman-gated DDL at SD-sourcing time — a recurring, named, still-unfixed gap',
    'Pin detectThunderingHerd\'s new sensitivity under the FR-4 gauge narrowing with an explicit test',
  ],

  quality_score: 88,
  team_satisfaction: 8,
  business_value_delivered: `Removes a class of camouflaged fleet-dispatch failure that directly cost the chairman multiple hours of blocked work on 2026-07-26 (idle workers sitting beside unclaimed work while the coordinator's own gauges reported healthy supply). The code-level fix is complete and independently, adversarially verified across EXEC and PLAN (three converging passes, 103/103 tests green across the SD-owned + directly-relevant suites). The value is NOT yet realized in production: the branch is unmerged and the root-cause RPC migration is chairman-gated and unapplied, so the exact incident class remains live — 1 row (QF-20260727-157) matches the stranded signature in production at the time of this retrospective.`,
  customer_impact: 'Internal-only (fleet coordination / dispatch reliability), no external end-user-facing surface. The party exposed to the original failure mode is the chairman and the worker fleet\'s own throughput, and both remain exposed until merge + chairman-approved migration apply.',
  technical_debt_addressed: true,
  technical_debt_created: true,
  bugs_found: 5,
  bugs_resolved: 4,
  tests_added: 74,
  test_total_count: 103,
  test_passed_count: 103,
  test_failed_count: 0,
  test_pass_rate: 100,
  test_verdict: 'PASS',
  performance_impact: 'Negligible-to-positive at the code level: FR-4\'s gauge narrowing is a pure predicate change (no new queries), FR-5\'s per-target try/catch adds negligible overhead per idle-hint tick, and FR-6\'s alarm write is fail-soft and only triggers below a configured ratio threshold. One indirect, currently-untested effect: narrowing the supply gauge makes the pre-existing detectThunderingHerd detector measurably more sensitive to the same idle-worker count (REGRESSION R2) — likely a correctness improvement, not yet confirmed as an accepted tradeoff.',
  objectives_met: false,
  on_schedule: true,
  within_scope: true,
  protocol_improvements: [
    'Auto-detect chairman-gated DDL at SD-sourcing time (scan description/scope + named fix-files for schema-mutation signatures) and stamp metadata.requires_chairman_apply automatically — this is now a repeatedly-recurring gap, not a one-off.',
    'Consider coupling sub-agent evidence capture closer to the commit/build boundary rather than deferring it to the handoff attempt — a session reap at exactly the handoff-attempt moment currently produces a fully-built-but-zero-evidence state the next session must reconstruct from git log alone.',
    'When 2 independent EXEC-phase sub-agents agree a fix is complete, consider still running one PLAN-phase pass that asks a structurally different question (who consumes the altered values, not does the changed function behave) — it found a real, different issue here that neither EXEC pass could have surfaced by construction.',
  ],
  unnecessary_work_identified: [],
  verbatim_citations: [
    { quote: 'Both defects share one property and that property is the reason to fix them together: THEY FAIL WHILE LOOKING HEALTHY.', source: 'SD description (strategic_directives_v2)' },
    { quote: 'A logged skip count is a record nobody reads.', source: 'SD description / PRD FR-6 (the SD\'s own stated thesis)' },
    { quote: 'So the FR-6 ratio would read a confident 10-of-10 while every row was dropped: precisely the reports-success-having-delivered-nothing shape of Part A, seated inside the metric meant to detect it.', source: 'commit 80273a9fc0f commit message' },
    { quote: 'I personally watched one row (QF-20260726-175) move from stranded into the merge-witnessed bucket between two of my own queries roughly a minute apart — direct, first-hand confirmation of the SD\'s own warning that this population turns over in minutes.', source: 'VALIDATION finding V8, sub_agent_execution_results e4a07b5a' },
    { quote: 'SCOPE CORRECTION — complete-quick-fix/orchestrator.js:84 IS NOT IN FR-3, AND WIRING IT IN WOULD BE A DEFECT.', source: 'commit ed0fda01bc1 commit message' },
    { quote: 'Recurrence of the known pre-flag-chairman-gated-DDL-at-sourcing gap: LEAD VALIDATION had to independently discover the blocking prerequisite rather than it being stated in the sourcing proposal.', source: 'feedback id 856969b1 (2026-07-20, SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001)' },
  ],
  triangulation_divergence_insights: {
    divergence: 'The SD\'s own sourcing/LEAD-validation language called complete-quick-fix/orchestrator.js:84 a site that "actively manufactures the stranded state," and FR-3\'s PRD text names it as a required routing site with a "zero bare-clear grep hits" acceptance criterion — directly contradicting FR-1\'s own guard (requires pr_url IS NULL), which the same PRD requires this exact helper to enforce verbatim.',
    resolution: 'EXEC (while building, commit ed0fda01bc1), TESTING (re-verification pass, downgraded HIGH to LOW) and VALIDATION (PLAN-phase adjudication, finding V3) each independently traced the actual call path and the guard\'s own predicate and reached the identical conclusion: this call site\'s prUrl is always a real, non-null, self-derived value, so a row from it can never satisfy FR-1\'s guard by construction, independent of any implementation choice. The shipped exclusion is correct; the PRD text is the defect.',
    generalizable_rule: 'When a requirement names a specific site as a fix target and ALSO defines an exclusion guard elsewhere in the same document, the two clauses can contradict each other even though each reads correctly in isolation — always check whether the named site\'s OTHER written fields satisfy the guard\'s full predicate before finalizing the requirement text, not just whether the site "looks like" the described symptom.',
    ground_truth_check: 'Read buildMergedReconcileUpdate\'s only call site (orchestrator.js:217-219: always passes probeWitness.prUrl) against FR-1\'s four-predicate guard (requires pr_url IS NULL) and against a live measurement (9 in_progress rows, exactly 2 carrying pr_url/commit_sha).',
    sub_agent_consensus: 'EXEC (commit ed0fda01bc1) -> TESTING (downgraded HIGH to LOW on re-verification, sub_agent_execution_results d1edcb38/12516639) -> VALIDATION (PLAN-phase, e4a07b5a, finding V3) — three separate traces, same conclusion, and yet the PRD row itself (product_requirements_v2 functional_requirements[2]) remains uncorrected as of this retrospective.',
  },
  related_files: [
    'database/migrations/20260727_release_sd_qf_reopen.sql',
    'lib/coordinator/coordination-events.cjs',
    'lib/coordinator/qf-supply-predicate.cjs',
    'lib/fleet/best-effort-release.mjs',
    'scripts/coordinator-idle-qf-hint.mjs',
    'scripts/one-off/verify-release-sd-qf-branch.mjs',
    'scripts/stale-session-sweep.cjs',
    'tests/unit/coordinator/idle-qf-hint-delivery.test.js',
    'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
    'tests/unit/db/release-sd-qf-branch-sql.test.js',
    'tests/unit/fleet/qf-clear-and-reopen.test.js',
    'tests/unit/stale-sweep-qf211-claim-guards.test.js',
  ],
  related_commits: [
    '88b5e7342f3', 'ed0fda01bc1', 'f68f691cbfb', '984db683471', '418a78c345a',
    'e667ca11b35', 'e1ea84d68ff', 'fd58d87aa9d', '7ffe67879ba', 'fe40d076492',
    '80273a9fc0f', '9f865479e0e', '7401ad4f87b', 'f7433f2c829',
  ],
  affected_components: [
    'quick_fixes claim-clear/release lifecycle (release_sd RPC, clearAndReopenQf, stale-session-sweep)',
    'Coordinator supply gauges (coordination-events.cjs, both call sites)',
    'Coordinator idle-QF dispatch hint pass (coordinator-idle-qf-hint.mjs)',
    'Coordinator detector suite (detectThunderingHerd — behaviorally affected, not directly touched)',
  ],
  tags: ['dispatch-integrity', 'camouflaged-failure', 'chairman-gated-migration', 'orphan-session-adoption', 'adversarial-verification', 'delivery-ratio-alarm', 'quick-fixes-claim-lifecycle'],
  period_start: '2026-07-26T20:47:29.590Z',
  period_end: NOW_ISO,
  metadata: {
    live_migration_check_at_retro_time: { script: 'scripts/one-off/verify-release-sd-qf-branch.mjs', result: '5/5 FAIL', checked_at: NOW_ISO },
    live_stranded_population_at_retro_time: { total_in_progress: 9, stranded_signature_count: 1, stranded_ids: ['QF-20260727-157'], checked_at: NOW_ISO },
    branch_merged_to_main: false,
    orphan_adoption: {
      original_session: '61d2bb66-6cb7-421b-a0e1-ef8563dc5a51',
      adopting_session: 'd6f66610-2fbd-442b-a0bc-bf438ff86dbe',
      commits_before_adoption: 9,
      commits_merged_in_from_origin_main: 28,
      original_build_last_commit: '7ffe67879ba (2026-07-27T04:35:36Z)',
      adoption_merge_commit: 'fe40d076492 (2026-07-27T10:48:26Z)',
    },
    handoff_history: [
      { handoff: 'LEAD-TO-PLAN', status: 'rejected', score: 0, reason: 'SUBAGENT_EVIDENCE_MISSING' },
      { handoff: 'LEAD-TO-PLAN', status: 'accepted', score: 95 },
      { handoff: 'PLAN-TO-EXEC', status: 'rejected', score: 0, reason: 'USER_STORIES_BYPASSED, SUBAGENT_EVIDENCE_MISSING' },
      { handoff: 'PLAN-TO-EXEC', status: 'accepted', score: 97 },
      { handoff: 'EXEC-TO-PLAN', status: 'rejected', score: 0, reason: 'SUBAGENT_EVIDENCE_MISSING' },
      { handoff: 'EXEC-TO-PLAN', status: 'rejected', score: 0, reason: 'MANDATORY_TESTING_VALIDATION_FAILED (TESTING verdict WARNING)' },
      { handoff: 'EXEC-TO-PLAN', status: 'accepted', score: 93 },
    ],
    sub_agent_evidence_rows: {
      lead_validation: '199e89e3-f8d8-4ac5-940b-b66b61b996b1',
      exec_testing_first_pass_warning: 'd1edcb38-fe48-48fe-85d5-25dab9bf4fb4',
      exec_testing_second_pass_conditional_pass: '12516639-547f-4624-8969-fda63522a3ad',
      exec_security: '2c32a603-6002-4bff-bf8e-da018ed9c14b',
      plan_regression_partial: 'ee308d53-e55e-4599-b9a2-841a077345c1',
      plan_regression_final: 'eceae9b1-b3de-4269-b38a-ab8e21ed5ac4',
      plan_validation: 'e4a07b5a-3012-4b5a-812a-562ee63b713a',
    },
  },
};

const { data: sd, error: sdErr } = await s.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) {
  console.error('SD LOOKUP ERROR:', sdErr.message);
  process.exit(1);
}

const { data, error } = await s
  .from('retrospectives')
  .update(update)
  .eq('id', RETRO_ID)
  .select('id, sd_id, quality_score, status')
  .single();

if (error) {
  console.error('ENHANCE ERROR:', error.message);
  process.exit(1);
}

if (data.sd_id !== sd.id) {
  console.error(`ENHANCE ERROR: RETRO_ID ${RETRO_ID} belongs to sd_id=${data.sd_id}, not ${SD_KEY} (${sd.id}) — refusing to report success on a mismatched retro.`);
  process.exit(1);
}

console.log('Enhanced retrospective', data.id, 'for', SD_KEY, '- quality_score:', data.quality_score, '- status:', data.status);
