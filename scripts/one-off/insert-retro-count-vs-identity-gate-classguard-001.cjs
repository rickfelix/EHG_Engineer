// @wire-check-exempt
// One-off SD-completion retrospective insert for
// SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001.
//
// Written directly (not via generate-comprehensive-retrospective.js) because that
// script's analyzeHandoffs() looks up sd_phase_handoffs by sd.sd_key (string) but
// rows store sd_id as a UUID -- the lookup 0-matches and produces boilerplate-only
// content (already flagged 4x this session, feedback id
// 5fe083a2-f6b3-480d-837e-ad59961761a2). See scripts/modules/handoff/retro-filters.js
// for the retro_type/retrospective_type/created_at filter invariants this row must
// satisfy (getFilteredRetrospective) -- mirrors the pattern used in
// insert-retro-adaptive-comms-cadence-001.cjs and
// insert-retro-comms-presence-grounding-signals-001.cjs.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = 'e0d589d2-9a63-4b77-b195-c3a84e62e2e7';
const SD_KEY = 'SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001';

(async () => {
  const row = {
    sd_id: SD_UUID,
    target_application: 'EHG_Engineer',
    learning_category: 'PROCESS_IMPROVEMENT',
    retro_type: 'SD_COMPLETION',
    // retrospective_type left NULL (canonical generate-retrospective.js convention) --
    // handoff-time retros tag this with a PHASE (this SD already has one:
    // retro_type='HANDOFF', retrospective_type='LEAD_TO_PLAN'), so NULL here plus
    // retro_type='SD_COMPLETION' cleanly distinguishes this as the genuine
    // completion retro per getFilteredRetrospective's OR filter.
    retrospective_type: null,
    project_name: 'Class-guard the COUNT-based-should-be-IDENTITY-based gate anti-pattern',
    title: 'SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 — identity-set diff gate + lint guard against count-delta gate assertions',
    description: 'A gate that flags on a raw failure-COUNT delta (e.g. "failures rose 105->107") false-positives on unrelated flaky/CI-secret/shared-DB-drift noise unrelated to the change under test -- 2 confirmed real-world instances (scripts/ci/red-merge-detector.mjs, scripts/compare-to-main-snapshot.mjs BASELINE_REGRESSION, the latter having false-blocked PR #5330). This SD is the CLASS-GUARD (not a per-instance fix), mirroring the shipped sibling SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001\'s exact shape: (1) a reusable identity-diff primitive, (2) convert the one genuinely-in-scope live gate to identity-based, (3) a name-anchored ESLint rule banning the anti-pattern going forward, (4) a blocking CI lint workflow, (5) an audit doc distinguishing the flagged class from adjacent classes that must NOT be flagged. Built: NEW lib/gates/identity-diff-gate.cjs (computeIdentityRegression: a SET diff of failing identities rather than a raw count subtraction, flags only identities present in current-failing but absent from baseline-failing; extractFailingIds parses vitest JSON into file::fullName identities; filterReachable is the diff-reachability half) shaped as a drop-in superset of QF-20260701-833\'s inline primitive (which independently prototyped the same identity-diff conversion for compare-to-main-snapshot.mjs and has since merged to main as commit 6f1c74a81c) so the two deliberately-deferred instances can adopt the shared module later with zero behavior change. Converted scripts/hooks/compare-test-baseline.cjs to identity-based -- a genuinely-discovered 3rd count-delta instance found via an Explore sweep during PLAN, confirmed by LEAD-phase VALIDATION as not already carved out by any other in-flight fix -- additive/backward-compatible (all legacy fields preserved, new_failures now derived from the identity-set diff instead of a raw subtraction); scripts/hooks/capture-baseline-test-state.cjs additively captures failing_ids alongside existing counts. NEW name-anchored ESLint rule eslint-rules/no-count-delta-gate-assertion.js, NEW scripts/lint/count-delta-gate-lint.mjs production scanner (reuses the rule via ESLint\'s Linter API) + NEW .github/workflows/count-delta-gate-lint.yml (genuinely blocking, mirrors the sibling class-guard\'s exact posture since npm run lint is never invoked by any CI workflow in this repo) + package.json lint:count-delta-gate script. Audit doc added to docs/reference/infrastructure-hardening-patterns.md (v1.1.0->1.2.0) -- a 6-row table separating GATE-THAT-FLAGS (compare-test-baseline.cjs converted; compare-to-main-snapshot.mjs and red-merge-detector.mjs deliberately deferred with a named follow-up consolidation item) from COUNT-READER and ABSOLUTE-THRESHOLD classes (explicitly NOT flagged, would create noise) and contrastive already-identity-scoped examples (row-growth-snapshot.cjs, ci-recurrence-detector.mjs). 29 new/updated unit tests across 3 test files (identity-diff-gate.test.js, compare-test-baseline-identity.test.js, no-count-delta-gate-assertion.test.js), all passing, zero regressions. Net commit 533baef941, branch feat/SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001.',
    affected_components: [
      'lib/gates/identity-diff-gate.cjs',
      'scripts/hooks/compare-test-baseline.cjs',
      'scripts/hooks/capture-baseline-test-state.cjs',
      'eslint-rules/no-count-delta-gate-assertion.js',
      'scripts/lint/count-delta-gate-lint.mjs',
      '.github/workflows/count-delta-gate-lint.yml',
      'docs/reference/infrastructure-hardening-patterns.md'
    ],
    what_went_well: [
      'Shaping computeIdentityRegression(currentIds, priorFailingIds) as a deliberate drop-in superset of QF-20260701-833\'s already-merged inline primitive (commit 6f1c74a81c) means the two deliberately-deferred instances (red-merge-detector.mjs, compare-to-main-snapshot.mjs) can adopt the shared module later with zero behavior change -- avoids a second, subtly-different identity-diff implementation drifting from the one QF already proved out in production.',
      'Keeping scripts/hooks/compare-test-baseline.cjs\'s conversion strictly additive/backward-compatible (all legacy fields -- baseline_failed, current_failed, new_failures, fixed, status -- preserved on the return shape, new_failures now DERIVED from the identity-set diff instead of a raw subtraction) meant REGRESSION sub-agent could verify zero behavior change for every existing consumer of the hook without needing to audit every call site.',
      'LEAD-phase VALIDATION caught two real risks BEFORE EXEC started: it required the identity-diff primitive be name-anchored/superset-shaped for QF-833 consolidation (not a second independent implementation), and it confirmed compare-test-baseline.cjs was a genuinely new 3rd instance rather than something another in-flight branch was already touching -- both corrections were incorporated pre-build, avoiding rework.',
      'Building the audit doc as an explicit 6-row table that separates the flagged class (GATE-THAT-FLAGS on a raw count delta) from two adjacent classes that must NOT be flagged (COUNT-READER: just reports a number; ABSOLUTE-THRESHOLD: compares against a fixed cap, not a delta) turned what could have been a vague "count math is bad" rule into a precise, defensible boundary -- directly informed the ESLint rule\'s exclusion logic.'
    ],
    what_needs_improvement: [
      'The initial general count-comparison AST match in eslint-rules/no-count-delta-gate-assertion.js produced 9 false positives when run against the real repo (scripts/modules/auto-trigger-stories.mjs, test-runner.js, failure-pattern-capture.js, test-output-parser.js) -- all were existence checks (failed > 0) or absolute-cap checks (< MIN_FAILURES_FOR_PATTERN), exactly the COUNT-READER/ABSOLUTE-THRESHOLD classes LEAD-phase VALIDATION had predicted as out-of-scope noise. Fixed by excluding relational comparisons against a numeric literal or an ALL_CAPS constant identifier, bringing false positives to zero across a 690-file scan. Lesson: a "ban this pattern" AST rule needs its exclusion set derived from a real full-repo dry run, not just the motivating examples, before it can be trusted as a blocking gate.',
      'A second bug surfaced during pragma-testing: the pragma-comment detector in the ESLint rule only checked comments immediately preceding the flagged AST node, but a comment placed above a `while` statement does not directly precede the BinaryExpression nested deep inside the loop\'s condition -- the token immediately preceding the flagged node is `&&`, not the comment. Fixed by walking up to the nearest enclosing STATEMENT first, then checking for the pragma comment there. Lesson: pragma-suppression comment lookups in custom ESLint rules must anchor on the nearest enclosing statement, not the specific flagged sub-expression node, or legitimate suppressions silently fail to apply on nested conditions.',
      'Two of the three known count-delta gate instances (scripts/ci/red-merge-detector.mjs and scripts/compare-to-main-snapshot.mjs -- the latter the one that actually false-blocked PR #5330) remain deliberately UNCONVERTED in this SD, tracked only as a named follow-up in the audit doc. The class-guard (lint rule + CI workflow) now prevents NEW instances, but the two known offenders that motivated the SD keep running count-delta logic until a follow-up SD lands the conversion using the shared identity-diff-gate.cjs module.',
      'REGRESSION flagged one non-blocking transitional gap: a stale pre-SD baseline lacking failing_ids falls back to count-only comparison in compare-test-baseline.cjs, so the identity-based behavior only fully activates once a fresh baseline (captured via the additively-updated capture-baseline-test-state.cjs) has run at least once -- self-resolving, but worth noting for anyone debugging why an immediate post-merge comparison still looks count-based.'
    ],
    action_items: [
      { item: 'Convert scripts/compare-to-main-snapshot.mjs (BASELINE_REGRESSION check that false-blocked PR #5330) to use lib/gates/identity-diff-gate.cjs, consolidating with QF-20260701-833\'s already-merged inline primitive (commit 6f1c74a81c) rather than maintaining two separate identity-diff implementations', owner: 'TBD', priority: 'high' },
      { item: 'Convert scripts/ci/red-merge-detector.mjs to use lib/gates/identity-diff-gate.cjs -- the second of the two deliberately-deferred instances named in the audit doc', owner: 'TBD', priority: 'medium' },
      { item: 'Re-run the eslint-rules/no-count-delta-gate-assertion.js dry run periodically (e.g. quarterly or on major scripts/ additions) since the false-positive exclusion set (numeric-literal / ALL_CAPS-constant comparisons) was tuned against a single point-in-time 690-file scan and new count-reader/absolute-threshold code could reintroduce false positives as the codebase grows', owner: 'TBD', priority: 'low' },
      { item: 'When writing a future custom ESLint rule with pragma-comment suppression, default to anchoring the comment lookup on the nearest enclosing STATEMENT (not the flagged sub-expression) from the start, based on the walk-up fix required here', owner: 'protocol/EXEC', priority: 'low' }
    ],
    key_learnings: [
      'A "ban this pattern" custom AST lint rule needs its false-positive exclusion set derived from a full-repo dry run against the REAL codebase, not just the motivating examples -- the initial general count-comparison match in no-count-delta-gate-assertion.js flagged 9 false positives (existence checks like `failed > 0`, absolute-cap checks like `< MIN_FAILURES_FOR_PATTERN`) that were exactly the COUNT-READER/ABSOLUTE-THRESHOLD classes the audit doc had already named as out-of-scope. The fix (exclude relational comparisons against a numeric literal or an ALL_CAPS constant identifier) took the false-positive count from 9 to 0 across 690 scanned files -- a class-guard rule is only trustworthy as a BLOCKING CI gate once it has been proven against the actual repo, not just unit-test fixtures.',
      'Pragma-suppression comment lookups in custom ESLint rules must walk up to the nearest enclosing STATEMENT before checking for a preceding comment, not check immediately before the specific flagged AST node -- a comment placed above a `while` statement does not directly precede a BinaryExpression nested inside the loop\'s condition (the immediately-preceding token is `&&`, not the comment), so a naive "check the token right before this node" pragma detector silently fails to honor legitimate suppressions on nested conditions.',
      'Shaping a new shared primitive (computeIdentityRegression) as a deliberate drop-in SUPERSET of an already-merged, independently-prototyped inline implementation (QF-20260701-833\'s conversion for compare-to-main-snapshot.mjs, commit 6f1c74a81c) rather than building a second competing identity-diff implementation is the right sequencing when a QF and an SD converge on the same fix shape -- it lets the QF\'s proven-in-production logic and the SD\'s reusable module consolidate later with zero behavior change, instead of the codebase accumulating two subtly different identity-diff comparators.',
      'A class-guard SD (lint rule + blocking CI workflow) can ship fully and correctly WITHOUT converting every known instance of the anti-pattern it targets -- this SD prevents new count-delta gate assertions from entering the codebase while deliberately deferring the two instances that motivated it (red-merge-detector.mjs, compare-to-main-snapshot.mjs) to a named follow-up, because converting live production gates carries its own regression risk that shouldn\'t block the guardrail from landing. The guardrail and the cleanup are separable deliverables.',
      'Since npm run lint is never invoked by any CI workflow in this repo, a genuinely blocking lint guard for a new anti-pattern rule requires its OWN dedicated GitHub Actions workflow (not just adding the rule to .eslintrc and assuming it runs) -- mirrored exactly from the sibling class-guard SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001\'s posture, confirming this is now the established pattern for shipping a lint-based class-guard in this repo.'
    ],
    quality_score: 90,
    status: 'PUBLISHED',
    generated_by: 'MANUAL',
    conducted_date: new Date().toISOString().slice(0, 10),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['VALIDATION', 'REGRESSION'],
    related_files: [
      'lib/gates/identity-diff-gate.cjs',
      'scripts/hooks/compare-test-baseline.cjs',
      'scripts/hooks/capture-baseline-test-state.cjs',
      'eslint-rules/no-count-delta-gate-assertion.js',
      'scripts/lint/count-delta-gate-lint.mjs',
      '.github/workflows/count-delta-gate-lint.yml',
      'docs/reference/infrastructure-hardening-patterns.md',
      'tests/unit/gates/identity-diff-gate.test.js',
      'tests/unit/hooks/compare-test-baseline-identity.test.js',
      'tests/unit/eslint-rules/no-count-delta-gate-assertion.test.js'
    ],
    related_commits: ['533baef941'],
    business_value_delivered: 'Stops gates from false-blocking PRs and false-filing QFs on unrelated count-drift noise (flaky tests, CI-secret rotation, shared-DB drift) by converting raw failure-COUNT delta assertions to identity-set diffs that only flag genuinely new failing identities. Directly targets the exact class of defect that false-blocked PR #5330 via compare-to-main-snapshot.mjs BASELINE_REGRESSION, and installs a permanent, CI-enforced lint guard (0 violations across 690 files) so the anti-pattern cannot silently re-enter the codebase going forward, mirroring the shipped sibling class-guard SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001.',
    on_schedule: true,
    within_scope: true,
    objectives_met: true,
    metadata: {
      sd_key: SD_KEY,
      target_application: 'EHG_Engineer',
      sd_type: 'infrastructure',
      commit_sha: '533baef941',
      branch: 'feat/SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001',
      worktree_path: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001',
      sibling_sd: 'SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001',
      related_qf: 'QF-20260701-833 (independently prototyped identity-diff conversion for compare-to-main-snapshot.mjs; merged to main as commit 6f1c74a81c; computeIdentityRegression built as a drop-in superset)',
      false_block_evidence: 'scripts/compare-to-main-snapshot.mjs BASELINE_REGRESSION false-blocked PR #5330 on unrelated count-drift noise',
      test_results: {
        new_tests: 29,
        test_files: [
          'identity-diff-gate.test.js',
          'compare-test-baseline-identity.test.js',
          'no-count-delta-gate-assertion.test.js'
        ],
        lint_scan: '0 violations across 690 scanned files (initial general match had 9 false positives, fixed by excluding relational comparisons against a numeric literal or ALL_CAPS constant identifier)'
      },
      sub_agent_verdicts: {
        LEAD_VALIDATION: { verdict: 'CONDITIONAL_PASS', confidence: 0.88, notes: 'Confirmed no duplicate comparator existed pre-build; confirmed compare-test-baseline.cjs not already covered by any other in-flight branch; REQUIRED name-anchoring correction (not general count-comparison match) and REQUIRED computeIdentityRegression be shaped as a drop-in superset of QF-833\'s signature -- both incorporated before EXEC started.' },
        EXEC_VALIDATION: { verdict: 'PASS', confidence: 0.95, notes: 'All 7 FRs traced to file:line; confirmed red-merge-detector.mjs and compare-to-main-snapshot.mjs genuinely untouched (deliberately deferred); confirmed the lint rule is truly name-anchored; confirmed 0 violations across 690 scanned files; confirmed no duplicate comparator introduced.' },
        REGRESSION: { verdict: 'PASS', confidence: null, notes: 'Confirmed backward-compatible return shapes on both modified hooks; confirmed the test-output-parser.js change is comment-only; confirmed no package.json/workflow-name collisions; noted one non-blocking transitional observation -- a stale pre-SD baseline lacking failing_ids falls back to count-only comparison, self-resolving once a fresh baseline is captured.' }
      },
      known_gap: 'The two known count-delta instances that motivated this SD (scripts/ci/red-merge-detector.mjs, scripts/compare-to-main-snapshot.mjs) remain unconverted, deliberately deferred with a named follow-up in docs/reference/infrastructure-hardening-patterns.md -- the class-guard (lint rule + CI workflow) prevents new instances but does not retroactively fix the two known offenders.'
    }
  };

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(row)
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at')
    .single();
  if (error) { console.error('INS_ERR:', error); process.exit(1); }
  console.log('INSERTED retro:', JSON.stringify(data, null, 2));
})();
