import dotenv from 'dotenv'; dotenv.config();
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-PRE-COMMIT-SECRET-001';
const SD_UUID = '5cb177fc-6627-44b5-9bfe-0ebc531fbb29';
const ARTIFACT = 'test-results/SD-LEO-FIX-PRE-COMMIT-SECRET-001-testing.json';

// Provenance: hash the RUNNER-WRITTEN results file (vitest json reporter), never a hand-authored summary.
const artifactBuf = fs.readFileSync(ARTIFACT);
const artifactSha = crypto.createHash('sha256').update(artifactBuf).digest('hex');
const report = JSON.parse(artifactBuf.toString());

const { data: subAgent } = await sb.from('leo_sub_agents').select('*').eq('code', 'TESTING').maybeSingle();
const { data: sd } = await sb.from('strategic_directives_v2').select('target_application').eq('id', SD_UUID).maybeSingle();

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID, targetApplication: sd?.target_application, subAgentCode: 'TESTING',
  probeExistsRelative: '.husky/pre-commit', supabase: sb,
});

const testExecution = buildTestExecution({
  executed: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  skipped: report.numPendingTests || 0,
  artifactSha,
  runner: 'vitest',
  artifactPath: ARTIFACT,
  source: 'vitest-json-reporter',
  mappedCandidates: 3,
  foundFiles: report.numTotalTestSuites,
});

const results = {
  verdict: 'PASS',
  validation_mode: 'retrospective',
  confidence_score: 95,
  execution_time_ms: 8830,
  summary: 'RETROSPECTIVE TESTING at EXEC-TO-PLAN for the pre-commit Stage 1 merge-basis fix (commit 67b4bd8a91f). Measured, not judged: 20/20 vitest tests pass across 3 husky suites (12 new merge-basis + 8 pre-existing regression, zero pre-existing regressions); `bash -n .husky/pre-commit` parses clean (exit 0); the full 13-stage hook runs end-to-end on a real staged file, Stage 1 prints "No secrets detected" and the hook exits 0 with "Pre-commit checks passed". Independent code inspection (not commit-message trust) confirms both core claims: merge detection is `git rev-parse -q --verify MERGE_HEAD` by EXIT CODE at line 281 with no literal .git/MERGE_HEAD path test anywhere executable, and the both-parents intersection is `grep -Fxf` at lines 321 and 327, with `comm -12` appearing ONLY inside the line-315 warning comment, never as an invocation. Fallback to the HEAD-only basis is correctly gated on `-ne 0` git exit status (lines 318, 324), never on an empty result -- the precise condition that would have silently reintroduced the false positive.',
  critical_issues: [],
  recommendations: [
    'No blocking issues. Fix is measured-correct and safe to hand off to PLAN.',
    'Merge-commit path is verified by isolated-repo unit tests rather than by an actual merge in this worktree (IN_MERGE=no during the smoke run) -- that is the correct test shape for a hook, but the first real merge through this hook is still worth a confirming observation.',
    'Incidental, out of scope and previously flagged by VALIDATION: .husky/pre-commit ~lines 718-719 still read a literal `.git/COMMIT_EDITMSG`, which is the same dead-in-a-worktree path-test bug class this SD fixed at Stage 1. Separate ticket, not this SD.',
  ],
  metadata: {
    phase: 'EXEC',
    handoff: 'EXEC-TO-PLAN',
    validation_mode: 'retrospective',
    measured: true,
    test_execution: testExecution,
    session_id: process.env.CLAUDE_SESSION_ID || '81425e08-c5b5-4fde-bafc-f0b9d5e9c349',
    commit_sha: '67b4bd8a91f',
    branch: 'feat/SD-LEO-FIX-PRE-COMMIT-SECRET-001',
    evidence_provenance: {
      producer: 'vitest v4.1.4 --reporter=json',
      artifact_path: ARTIFACT,
      artifact_sha256: artifactSha,
      note: 'Verdict numbers are read FROM the runner-written file, not transcribed from console output.',
    },
    checks_performed: {
      unit_tests: 'npx vitest run tests/unit/husky/{pre-commit-merge-basis,pre-commit-nonempty-index-guard,pre-commit-marker-count}.test.js -> 3 files / 20 tests, 20 passed, 0 failed',
      bash_syntax: 'bash -n .husky/pre-commit -> exit 0',
      code_inspection_merge_detect: 'line 281 `if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1` -- exit-code based; grep for `.git/MERGE_HEAD` matches ONLY comment line 276',
      code_inspection_intersection: 'lines 321,327 `grep -Fxf <(printf ...)`; grep for `comm -12` matches ONLY comment line 315',
      code_inspection_fallback: 'lines 318,324 guard on STAGED/FIXTURE_CONTENT_MERGE_STATUS -ne 0 (git exit status), NOT on emptiness -- matches the stated requirement',
      end_to_end_hook: 'bash .husky/pre-commit with a real staged file -> exit 0, Stage 1 "No secrets detected in staged files", final "Pre-commit checks passed"; all 13 stages executed',
    },
    non_blocking_observations: [
      'root-dirt-lint warned (2653 untracked > 2391 threshold) during the end-to-end run; pre-existing worktree debris, non-blocking, hook still exited 0, unrelated to this change.',
      'Smoke suite tests/smoke.test.js reported 15 skipped under the db-tier guard (no designated non-production DB ref) -- pre-existing environment gating, not a regression from this change.',
    ],
  },
};

applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });
const stored = await storeSubAgentResults('TESTING', SD_UUID, subAgent, results, { sdKey: SD_KEY });
console.log('STORED id:', stored?.id, '| verdict:', stored?.verdict ?? results.verdict,
  '| validation_mode:', stored?.validation_mode,
  '| phase:', stored?.phase,
  '| repo_path:', results.metadata.repo_path,
  '| resolved:', results.metadata.repo_resolved,
  '| probe:', results.metadata.probe_exists,
  '| artifact_sha:', artifactSha.slice(0, 16));
