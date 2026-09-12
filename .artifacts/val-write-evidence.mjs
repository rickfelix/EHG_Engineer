import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-PRE-COMMIT-SECRET-001';
const SD_UUID = '5cb177fc-6627-44b5-9bfe-0ebc531fbb29';

const { data: subAgent } = await sb.from('leo_sub_agents').select('*').eq('code','VALIDATION').maybeSingle();
const { data: sd } = await sb.from('strategic_directives_v2').select('target_application').eq('id', SD_UUID).maybeSingle();

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID, targetApplication: sd?.target_application, subAgentCode: 'VALIDATION',
  probeExistsRelative: '.husky/pre-commit', supabase: sb,
});

const results = {
  verdict: 'PASS',
  confidence_score: 95,
  execution_time_ms: 0,
  summary: 'LEAD-phase VALIDATION: no duplicate SD/QF; defect empirically confirmed LIVE on current main; proposed both-parents intersection validated in a throwaway merge repo (suppresses the false positive AND still blocks a genuinely new secret). Two scope corrections raised.',
  findings: {
    duplicate_check: 'NO DUPLICATE. Server-side ilike over 6228 SDs / 2216 QFs (an initial client-side scan was capped at PostgREST 1000 rows and was re-run server-side). QF-20260911-880 is the escalation SOURCE (status=escalated, escalated_to=5cb177fc = this SD) - correctly not a duplicate. Adjacent-but-distinct prior work in the SAME Stage 1 block, all must be PRESERVED: QF-20260708-650 (apa-calibration-fixtures base64 allowlist), SD-LEO-FIX-STRIP-DEAD-DB-CREDENTIAL-LITERALS-001 (added-lines-only filter). Same defect CLASS at a different site: QF-20260511-192 (cancelled) merge-commit diff basis in countLocBySplit.',
    defect_still_live: 'CONFIRMED LIVE. .husky/pre-commit line ~274 builds STAGED_CONTENT from `git diff --cached --diff-filter=ACM -U0` with zero MERGE_HEAD handling (grep for MERGE_HEAD in the hook returns nothing). git log -20 on the file shows no commit touching the diff basis. Empirical repro: merging main into a feature branch makes main pre-existing AKIA fixture line appear as +added and MATCH the AKIA pattern.',
    fix_validated: 'Intersection of added-lines vs HEAD and vs MERGE_HEAD yields EMPTY for main pre-existing line (false positive suppressed) and still yields the line for a secret genuinely introduced in the merge (correctly blocks). No blind spot introduced.',
    scope_correction_1_blocking: 'SD scope says "when .git/MERGE_HEAD exists". In a worktree .git is a FILE (gitdir: pointer), so MERGE_HEAD lives at .git/worktrees/<wt>/MERGE_HEAD and a literal `.git/MERGE_HEAD` test is ALWAYS FALSE. Worktrees are this repo documented ship path - the exact environment the fix targets - so the literal wording is dead-by-construction. Must use `git rev-parse --git-path MERGE_HEAD` (verified: resolves correctly in BOTH worktree and main tree). No existing rev-parse --git-path precedent in the repo.',
    scope_correction_2_minor: 'SD scope says the regression test goes under tests/unit/hooks/. That directory holds Node hook-script tests (capture-session-id, stop-loop, post-tool). The established convention for .husky BASH hook tests is tests/unit/husky/ - pre-commit-nonempty-index-guard.test.js (QF-20260906-295) and pre-commit-marker-count.test.js. Recommend tests/unit/husky/.',
    incidental_out_of_scope: '.husky/pre-commit lines 718-719 read `.git/COMMIT_EDITMSG` with the same literal-.git-path bug class - false in every worktree, so COMMIT_MSG is silently empty there. Pre-existing and SEPARATE from this SD; flagged, not scoped.',
    test_pattern_to_reuse: 'tests/unit/husky/pre-commit-nonempty-index-guard.test.js - vitest + spawnSync bash, bashAvailable() guard with describe.skip fallback, mkdtempSync throwaway git repo, pins the guard SHELL PATTERN in isolation rather than executing the 900-line hook. Sibling: tests/unit/husky/pre-commit-marker-count.test.js.',
  },
  recommendations: [
    'BLOCKING before PLAN: replace `.git/MERGE_HEAD` with `git rev-parse --git-path MERGE_HEAD` in the SD scope and key_changes, else the fix is inert in worktrees.',
    'Retarget the regression test to tests/unit/husky/ per established bash-hook convention.',
    'Preserve all four existing Stage 1 exclusions (hook self-exclusion, .githooks, apa-fixture base64 allowlist, added-lines-only filter).',
    'Test must assert BOTH halves: merge commit not blocked on a parent-carried line, AND a genuinely new secret still blocked.',
  ],
  metadata: { phase: 'LEAD', gate: 'GATE_1_LEAD_PRE_APPROVAL', session_id: process.env.CLAUDE_SESSION_ID || '81425e08-c5b5-4fde-bafc-f0b9d5e9c349' },
};

applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });
const stored = await storeSubAgentResults('VALIDATION', SD_UUID, subAgent, results, { sdKey: SD_KEY });
console.log('STORED id:', stored?.id, '| verdict:', stored?.verdict ?? results.verdict, '| repo_path:', results.metadata.repo_path, '| resolved:', results.metadata.repo_resolved, '| probe:', results.metadata.probe_exists);
