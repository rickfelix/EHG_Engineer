import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults, getSupabaseClient } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I';
const supabase = await getSupabaseClient();
const { data: subAgent } = await supabase.from('leo_sub_agents').select('*').eq('code', 'VALIDATION').maybeSingle();

const results = {
  verdict: 'PASS',
  confidence_score: 94,
  execution_time_ms: 0,
  summary: 'PLAN-phase VALIDATION re-verification at HEAD 93d49c6d3aa, superseding my CONDITIONAL_PASS row 32b46c18 (pinned to the now-superseded b41994adeda). All 7 findings disposed and INDEPENDENTLY RE-MEASURED BY ME, not accepted on report: V-2 lint now exits 0, V-3 AbortSignal.timeout(5000) present with a real regression test, V-5 JSDoc reordered, V-1 and V-4 disposed by honest PRD amendment (6 texts verified by readback), V-6 and V-7 no-fix with rationale I checked and accept. Test suite re-run after the fixes: 616 files passed, 7856 tests passed (one more than my pre-fix run, matching the single added timeout test), 34 skipped, same 1 pre-existing db-tier-gated failure. The FR-6 AC-1 rescope is honest: I verified the stated blocker directly -- the AltifyAI repo has 11 staged/modified files from a concurrent, unrelated feedback-module session and is 141 commits behind origin/main, so it is genuinely unsafe to write, not a convenience deferral. No condition from my prior row remains open.',
  critical_issues: [],
  warnings: [
    { severity: 'LOW', issue: 'CARRIED FORWARD, NOT A DEFECT IN THIS SD: FR-6 AC-1 (authoring .github/workflows/stack-scan.yml in rickfelix/altifyai) remains genuinely NOT DONE and is now correctly recorded as such in the PRD -- FR-6 AC-1 reads "STATUS AS OF EXEC-TO-PLAN HANDOFF: NOT YET DONE", the FR-6 description carries a POST-MERGE FOLLOW-UP note in the same style already used for the FR-2/FR-4 migration gap, and top-level acceptance_criteria[4] repeats the caveat. Until it lands, readStackScanConclusion returns {available:false, reason:"no_completed_stack_scan_run"} for AltifyAI -- honest, never a false conclusion. I re-confirmed the reader half is complete and correct.', recommendation: 'Ensure the post-merge follow-up is tracked outside this PRD as well, since a PRD that closes with the SD stops being a live worklist. The follow-up needs the AltifyAI repo to be free of the concurrent session first.' },
    { severity: 'LOW', issue: 'CARRIED FORWARD: the migration database/migrations/20260913_venture_screen_disposition_reconciliation.sql remains unapplied to prod (pre-existing, tracked, harness bug signal 2bd7a94e -- isTrackedMigrationPath hardcodes getRepoRoot() to the main checkout, so a branch-only migration cannot be marked applied pre-merge). FR-2 AC-1/AC-2, FR-3 AC-3 live limb and FR-4 AC-2 stay unverifiable against real AltifyAI data until it is applied. Not introduced or worsened by this SD.', recommendation: 'Apply post-merge and re-run the FR-2 reader and FR-4 builder against real AltifyAI data, as the PRD already requires.' }
  ],
  recommendations: [
    'PASS -- clear to proceed to EXEC-TO-PLAN. Every condition I attached to row 32b46c18 is closed, and I re-measured each one rather than accepting the fix report.',
    'The two residuals above (FR-6 AC-1 workflow authoring, migration apply) are both correctly recorded as tracked post-merge follow-ups in the PRD, both are real external blockers rather than unfinished work, and neither can be closed from this worktree.'
  ],
  metadata: {
    phase: 'PLAN',
    sd_key: SD,
    validation_type: 'PLAN_VERIFICATION_gate4_reverify',
    supersedes_row: '32b46c18-7adb-4ef9-a3be-fae29fa16ca5',
    head_sha: '93d49c6d3aa678a1d030ae2634e4b81dab8f535a',
    prior_head_sha: 'b41994adeda',
    working_tree_at_write: 'lib/ and tests/ clean -- no uncommitted delta, so this verdict is pinned to committed bytes',
    finding_disposition: {
      'V-1 FR-6 AC-1 workflow missing': 'DISPOSED by honest rescope, verified. FR-6 AC-1 now reads "STATUS AS OF EXEC-TO-PLAN HANDOFF: NOT YET DONE -- see the FR-6 description POST-MERGE FOLLOW-UP note. This is the one limb of FR-6 that remains open; AC-2/AC-3/AC-6 (the reader) are complete." I INDEPENDENTLY VERIFIED THE STATED BLOCKER rather than accepting it: git status in C:/Users/rickf/Projects/_EHG/altifyai shows 11 staged/modified files (lib/feedback/submit.js, src/routes/feedback.js, src/ui/FeedbackScreen.tsx, 5 test files, src/index.js, src/ui/App.jsx) from a concurrent unrelated feedback-module session, and the repo is 141 commits behind origin/main. Writing there would have overwritten another session in-progress work. The deferral is genuine.',
      'V-2 eva-logger-required-lint CI failure': 'FIXED, verified by execution. node scripts/lint/eva-logger-required-lint.mjs now EXITS 0 (was 1). createLogger counts: chairman-product-review.js 3 (was 0), validate-venture-default-capabilities.js 2 (was 0). Both files now default their injected logger param to a real module-scoped createLogger instance (chairman-product-review.js:32 moduleLogger, used at :307/:489/:546; validate-venture-default-capabilities.js:24, used at :235/:278) instead of console/undefined. Side benefit the lead flagged and I confirmed: recordCapabilityOverride and readCapabilityOverrides previously no-op-ed their warn calls when no logger was passed, and now genuinely log. count-truncation-diff-lint still clean (0 new sites).',
      'V-3 unbounded fetch on the S24 choke-point': 'FIXED, verified by reading the code and the test. GITHUB_API_TIMEOUT_MS = 5000 at stack-scan-reader.js:30 -- matching COMPETITIVE_BASELINE_TIMEOUT_MS in the sibling file, which was the convention I cited. Passed as signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS) at :123. TimeoutError mapped to a DISTINCT reason:"timeout" at :134-136, not folded into the generic fetch-error bucket, so a stall is diagnosable rather than silently indistinguishable from an API error. Regression test at stack-scan-reader.test.js:203-214 asserts opts.signal instanceof AbortSignal AND that a TimeoutError maps to reason "timeout" -- it tests both limbs, not just that a signal was passed.',
      'V-4 five stale PRD acceptance texts': 'FIXED, all verified by direct readback of product_requirements_v2 (updated_at 2026-09-13T18:13:17Z). FR-5 AC-1 now describes the actual design (pricing_terms bound to engine_pricing_model; signup bound via screenId screen-1 gated on the name-plausibility check; core_action deliberately unbound because no venture-independent signal exists). FR-5 AC-3 now states 5 of 6 stops carry real evidence and names core_action placeholder as intended behavior, not a gap. Top-level acceptance_criteria[3] rewritten and explicitly marks the old "zero tour stops with artifactType null" bar as itself wrong. Top-level acceptance_criteria[4] rewritten to describe the new purpose-built reader and carries the FR-6 AC-1 caveat. TS-7 given AND then both now name venture_resources as PRIMARY. risks[3].mitigation now says resolve from venture_resources, never repo_url, with synthetic_actor secondary at most. All five now describe the shipped, better implementation.',
      'V-5 orphaned JSDoc': 'FIXED, verified by reading the file. validateOverrideReason and its doc block now sit ABOVE the validateVentureDefaultCapabilities doc block (:47-59 and :61-68), so each function owns its own JSDoc and neither doc is orphaned.',
      'V-6 renderer omits the three new sections': 'NO-FIX ACCEPTED, rationale independently confirmed. The lead argument is that verdictTable and competitiveBaseline -- both from PRIOR SDs -- are also absent from the human-readable branch of scripts/chairman-product-review-packet.js, making the terse default view an established CLI convention rather than something this SD deviates from. I confirmed this directly against the renderer source: it enumerates only access, guidedTour and surfacesInventory. So this SD three new sections are treated exactly as the two existing optional sections are. FR-4 AC-3 and FR-5 AC-2 remain satisfied via the top-level keys, and the sections persist into chairman_decisions.brief_data. Correct call, not scope creep.',
      'V-7 capability checks run regardless of the flag': 'NO-FIX ACCEPTED. Same finding as PLAN-phase REGRESSION F1, documented (not gated) at the chairman-product-review.js call site in commit 11082aa99d8. The reasoning holds: gating the INFORMATIONAL packet behind the same flag that BLOCKS stage-24 would hide real evidence from the chairman rather than protect anyone. The flag exists for rollout safety on the gating path, and the packet is not a gating path. My original note already recorded this as defensible and advisory-only.'
    },
    test_run_measured_by_me_post_fix: {
      command: 'npx vitest run tests/unit/eva/',
      test_files: '616 passed, 1 failed, 6 skipped (623)',
      tests: '7856 passed, 34 skipped (7890), 0 test-level failures',
      delta_vs_prefix_run: '+1 test, exactly matching the single V-3 timeout regression test added -- no test was removed, weakened or skipped to reach green',
      failing_suite: 'tests/unit/eva/path-integrity-flags-live-defaults.db.test.js -- unchanged, pre-existing on origin/main, untouched by this branch, fails only on the DB_TIER_BLOCKED no_designated_target environment gate'
    },
    altifyai_blocker_reverified: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/altifyai',
      branch_state: 'main, behind origin/main by 141 commits',
      staged_or_modified_files: 11,
      sample: ['lib/feedback/submit.js (A)', 'src/routes/feedback.js (A)', 'src/ui/FeedbackScreen.tsx (A)', 'src/index.js (M)', 'src/ui/App.jsx (M)', 'tests/App.test.jsx (M)'],
      conclusion: 'Concurrent unrelated feedback-module session confirmed present. Deferring the stack-scan.yml write is the correct call, not a convenience deferral.'
    },
    measured_at: new Date().toISOString(),
    measured_by: 'validation sub-agent (Opus 5) -- every disposition above re-measured by execution (lint exit codes, full test re-run, PRD readback, altifyai git status, source reads). Nothing accepted on the fix report alone.'
  }
};

const resolution = await resolveSubAgentRepo({ subAgentCode: 'VALIDATION', sdId: SD, targetApplication: 'EHG_Engineer', supabase });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD, subAgent, results, { phase: 'PLAN', sdKey: SD });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase, 'sd_id=', stored?.sd_id);
