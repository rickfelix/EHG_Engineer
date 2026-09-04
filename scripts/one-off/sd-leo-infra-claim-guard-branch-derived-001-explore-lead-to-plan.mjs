#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 — Explore breadth search at LEAD-TO-PLAN.
 *
 * Read-only pass over branch-to-key parsers, reuse-marker precedent, resolveSessionClaimedSdKey,
 * and existing ENFORCEMENT-4/shouldBlockWorktreeEdit test coverage. Finds a real gap in the SD's
 * premise: the "same branch-to-key rule the claim and PR paths use" does not exist as a single
 * function -- at least five independent branch-to-key parsers coexist with different rules
 * (scripts/lib/branch-key-extractor.js's own JSDoc claims a four-site consolidation that never
 * happened). validation-agent's independent pass (same LEAD-TO-PLAN gate) went further and found
 * the specific hazard: two of those parsers (lib/worktree-reaper/detectors.js:40,
 * scripts/safe-worktree-remove.mjs:46) return the branch remainder INCLUDING any trailing slug
 * (not a clean key), which would make shouldBlockWorktreeEdit's truthy-mismatch check false-block
 * on slug-carrying branches if adopted -- a real "relocate the defect, not remove it" risk for PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 85,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Read-only breadth pass answering: (1) where the SD\'s cited "same branch-to-key rule the claim and PR paths use" actually lives, (2) whether a reuse-marker-file convention already exists, (3) resolveSessionClaimedSdKey\'s shape, (4) existing ENFORCEMENT-4/shouldBlockWorktreeEdit test coverage to extend. FINDING 1 (the SD premise gap): no single function is used by both "claim" and "PR" paths. scripts/lib/branch-key-extractor.js:40 extractKey() is the best-documented candidate (its JSDoc claims consolidating 4 prior inline sites: plan-to-exec/gates/branch-enforcement.js, claim-health/triangulate.js, handoff/cli/cli-main.js, scope/scope-gate.js) but that consolidation never happened -- none of those four import it; each still has its own independent inline regex. extractKey()\'s only real consumers today are PR/CI-tracking scripts (scripts/ci/resolve-pr-bypass-sd.mjs, scripts/backfill-pr-tracking.js, scripts/audit-orphan-prs.mjs), not any confirmed "claim path". At least 4 more independent parsers coexist: lib/git/branch-owner.js:117 resolveBranchOwner (DB-disambiguated, deliberately not pure-regex, excludes qf); scripts/gh-merge-safe.mjs:50 (SD-only, mirrors .claude/commands/ship.md:742\'s sed pattern, explicitly skips QF branches one line earlier); lib/ship/qf-detector.mjs:20/26/40 (QF-only); scripts/sd-start.js:1745 (ad-hoc, no prefix requirement). PLAN must either explicitly designate one function as the new shared source of truth (extractKey() is the most defensible: regex-only, no DB round-trip needed inside a PreToolUse hook, already unit-tested, supported shapes literally match the SD\'s feat/<KEY>, qf/<KEY>, fix/<KEY> examples) or pick a different one and justify it -- the SD text as written assumes a function that does not exist. FINDING 2: zero hits for "reuse marker"/"slot-free"/".reuse"/"wip/reclaim" outside this session\'s own preserve-stage.js (a different, push-based mechanism). No marker-FILE convention exists yet. Closest prior art for FR-2 to mirror (not reuse directly): lib/worktree-reaper/reap-eligible-marker.js:17-39 writeReapEligibleMarker(wtPath, fields) -- writes .reap-eligible.json at the tree root, best-effort try/catch, JSON shape {sd_key, merged_pr, marked_by_session, marked_at}. FINDING 3: resolveSessionClaimedSdKey defined at scripts/hooks/pre-tool-enforce.cjs:242-283 (hoisted top-level fn, not exported -- called directly at line 1015 in the same file), queries strategic_directives_v2 via raw REST fetch filtered by claiming_session_id=eq.<sessionId>, order=is_working_on.desc,updated_at.desc&limit=1, select=sd_key; returns row.sd_key (bare string) or null on missing creds/no claim/timeout/error (1.5s race timeout at line 274); session-scoped SD-only (QF claims are the separate sessionHoldsQuickFixClaim at line 292, tri-state). Format-compatible with a bare uppercase branch-derived key for direct === comparison, PROVIDED the DB sd_key column is consistently uppercase -- worth a spot-check in PLAN/EXEC rather than an assumption. FINDING 4: four existing test files exercise ENFORCEMENT-4/shouldBlockWorktreeEdit and should be extended, not duplicated: tests/unit/worktree-claim-decision-qf087.test.js (pure-function QF-vs-SD tri-state), tests/unit/claim/guard-order-and-mismatch-fr7-fr8.test.js (source-slice assertion on resolveSessionClaimedSdKey\'s body), tests/unit/claim/test-seams-fr9.test.js (spawns the real hook via execFileSync with JSON stdin, asserts exit codes -- the pattern to extend for branch-derivation allow/block specimens), scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js (static source-string pins on the ENFORCEMENT-4 slice -- WILL break once FR-1 rewrites that block, flagged separately by validation-agent as unbudgeted LOC). None of the four currently exercise WORKTREE_PATH_RE or any branch-derivation logic -- FR-4 is genuinely new coverage.',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'HIGH',
      issue: 'SD premise error: "the same branch-to-key rule the claim and PR paths use" does not exist as a single reusable function',
      evidence: 'At least 5 independent branch-to-key parsers coexist with different rules (branch-key-extractor.js, branch-owner.js, gh-merge-safe.mjs inline regex, qf-detector.mjs, sd-start.js ad-hoc match). branch-key-extractor.js\'s own JSDoc claims consolidating 4 prior sites; none of those 4 actually import it. No confirmed "claim path" consumer of extractKey() was found.',
      location: 'scripts/lib/branch-key-extractor.js:40 (best candidate); scripts/modules/handoff/executors/plan-to-exec/gates/branch-enforcement.js:30, scripts/modules/claim-health/triangulate.js:223, scripts/modules/handoff/cli/cli-main.js:705, scripts/modules/scope/scope-gate.js:33 (the 4 still-independent sites)',
    },
    {
      id: 'EXP-2',
      severity: 'LOW',
      issue: 'No existing reuse-marker-file convention; FR-2 needs to design one from scratch',
      evidence: 'Zero hits for "reuse marker"/"slot-free"/".reuse" outside this session\'s own PRESERVE-stage work (a different push-based mechanism, not a marker file). Closest shape-precedent found: lib/worktree-reaper/reap-eligible-marker.js.',
      location: 'lib/worktree-reaper/reap-eligible-marker.js:17-39',
    },
  ],
  recommendations: [
    'PLAN: independently confirmed by validation-agent\'s parallel pass -- designate worktree-claim-decision.cjs (already CJS, already the pure-predicate home, already unit-tested) as the home for a new deriveWorktreeKey({branch, marker, path}) function, rather than reaching for extractKey() or the reaper\'s keyFromBranch copies (which return slug-carrying remainders, not clean keys -- a real false-block relocation risk per validation-agent\'s C1 finding).',
    'PLAN: mirror lib/worktree-reaper/reap-eligible-marker.js\'s filename/best-effort-write/JSON-shape convention for FR-2\'s new reuse marker rather than inventing conventions from scratch.',
    'PLAN/EXEC: spot-check that strategic_directives_v2.sd_key is consistently uppercase in the DB before relying on a bare === comparison between a branch-derived key and resolveSessionClaimedSdKey\'s return value.',
    'EXEC: extend tests/unit/claim/test-seams-fr9.test.js\'s execFileSync-driven pattern for the new branch-derivation allow/block specimens (FR-4a/b), rather than adding a fifth new test file; budget LOC to update scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js\'s static source-string pins, which FR-1\'s rewrite of ENFORCEMENT-4 will break.',
  ],
  detailed_analysis: {
    searched_identifiers: ['extractKey', 'resolveBranchOwner', 'keyFromBranch', 'deriveWorkKeyFromBranch', 'resolveSessionClaimedSdKey', 'shouldBlockWorktreeEdit', 'reuse marker', 'slot-free', 'reap-eligible-marker'],
    searched_paths: ['scripts/lib/branch-key-extractor.js', 'lib/git/branch-owner.js', 'scripts/gh-merge-safe.mjs', 'lib/ship/qf-detector.mjs', 'scripts/sd-start.js', 'scripts/hooks/pre-tool-enforce.cjs', 'scripts/hooks/worktree-claim-decision.cjs', 'lib/worktree-reaper/reap-eligible-marker.js', 'tests/unit/claim/', 'tests/unit/worktree-claim-decision-qf087.test.js', 'scripts/hooks/__tests__/pre-tool-enforce-clmmulti-002.test.js'],
    cross_check: 'Findings independently corroborated by validation-agent\'s parallel LEAD-TO-PLAN pass (sub_agent_execution_results id 2c68e858-4630-47e3-8b1f-76d3b873500a), which went further and identified the specific two-parser false-block-relocation hazard (C1) this pass flagged only as a premise gap.',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-20260903-451',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/sd-leo-infra-claim-guard-branch-derived-001-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
