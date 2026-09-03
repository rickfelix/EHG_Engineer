import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { buildTestExecution } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agents/testing/test-execution-record.js';

const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A';
const SD_ID = '00b8482a-de45-4f70-82c3-4fead8f71ee9';
const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A';

// Provenance: hash of the RUNNER-WRITTEN vitest json results file (not hand-authored prose).
const artifactPath = `${WT}/.artifacts/testing-schema-truth-001A.json`;
const buf = fs.readFileSync(artifactPath);
const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
const runnerJson = JSON.parse(buf);
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  phase: 'PLAN',
  summary:
    'Unit lane verified by direct execution: 6/6 pass in tests/unit/client-factory-schema-drift-throw.test.js, '
    + 'plus 6 regression files (50 passed / 9 skipped) importing the factory — no regressions. '
    + 'E2E/user-story coverage correctly NOT APPLICABLE (backend library behavior, sd_type=bugfix, no UI surface); '
    + 'the prior BLOCKED row 58c64637 applied boilerplate E2E criteria that do not fit this SD shape. '
    + 'CONDITIONAL because SD success criterion #1 (the missing-RELATION head+count silent shape) is '
    + 'NOT satisfied by the shipped wrap, proven empirically.',
  critical_issues: [],
  warnings: [
    {
      severity: 'HIGH',
      issue:
        'SD success criterion #1 is unmet BY CONSTRUCTION. withSchemaDriftDetection keys on error.code in '
        + '{PGRST205, 42703}. A head+count probe against a MISSING relation returns {data:null, count:null, '
        + 'error:null, status:204} — there is no error to throw on, so the wrap passes it through as success. '
        + 'Empirically confirmed by direct probe against lib/supabase-client-schema-drift.cjs. '
        + "The codebase's own lib/db/safe-query.mjs:15-21 documents this as 'THE SECOND SUB-SHAPE, WHICH A "
        + "THROW-ON-ERROR WRAPPER ALONE WOULD MISS'. The 6 tests stub an error OBJECT for PGRST205, i.e. the "
        + 'NON-silent shape, so the suite does not cover the case criterion #1 calls "the genuinely silent one" '
        + 'and "the assertion the earlier version of this child was missing".',
      recommendation:
        'EXEC must add a count===null discriminant (safeCount-style) at the factory seam, plus a unit assertion '
        + 'stubbing {data:null,count:null,error:null} for a missing relation vs {count:N} for a real one.',
    },
    {
      severity: 'MEDIUM',
      issue:
        'lib/supabase-client.cjs (~97 importers) is correctly wired — withSchemaDriftDetection applied at both '
        + 'lines 125 and 140 — but has ZERO test coverage. All 6 tests import the ESM lib/supabase-client.js. '
        + 'VAL-A-2 named two-representation drift as the specific failure mode; it is guarded by code but not by '
        + 'a regression test, so a future edit can silently unwire the CJS half.',
      recommendation: 'Add a CJS-path parity test asserting throw behavior via require("lib/supabase-client.cjs").',
    },
    {
      severity: 'MEDIUM',
      issue:
        'SD success criteria #3 (safeQuery/safeCount adoption off its ~3-of-~3000 baseline, before/after counts '
        + 'recorded on the row) and #4 (swallowed-query-error-lint.mjs moved to enforce + widened SCAN_PREFIXES '
        + 'with measured finding count) are entirely unaddressed. Legitimate EXEC-phase work, not a PLAN blocker, '
        + 'but they must not be lost — the SD cannot complete on the 6 unit tests alone.',
      recommendation: 'Carry criteria #3 and #4 into EXEC scope explicitly with the measured counts recorded.',
    },
    {
      severity: 'LOW',
      issue:
        'SD success criterion #2 states the 42703 column control "already passes against an unchanged factory, so '
        + 'it is a regression guard only and must never be presented as evidence the corrective works". The '
        + 'handoff framing led with that control as primary evidence.',
      recommendation: 'Present the relation-absence discriminant, not 42703, as the corrective evidence.',
    },
  ],
  conditions: [
    {
      action:
        'EXEC: satisfy SD success criterion #1 — detect the missing-RELATION head+count shape (error null, '
        + 'count null, 204) via a count===null discriminant; a throw-on-error-code wrapper cannot see it.',
      priority: 'high',
      blocking: true,
    },
    {
      action: 'EXEC: add a lib/supabase-client.cjs parity test so the two factory representations cannot silently drift apart.',
      priority: 'medium',
      blocking: false,
    },
    {
      action: 'EXEC: address SD success criteria #3 (safeQuery adoption before/after counts) and #4 (lint enforce + widened scope).',
      priority: 'medium',
      blocking: false,
    },
  ],
  recommendations: [
    'Do not treat this SD as code-complete: the shipped wrap addresses the noisy half of the class, not the silent half named by its own criterion #1.',
  ],
  justification:
    'CONDITIONAL_PASS at PLAN-TO-EXEC: the test lane that exists is real, non-blind and fully green (6/6 targeted '
    + '+ 50 passed/9 skipped across 6 regression files, all executed by this agent, not asserted). All four factual '
    + 'claims in the handoff were independently verified: the shared drift module is consumed by BOTH '
    + 'lib/supabase-client.js and lib/supabase-client.cjs; the 6 unit tests are stub-based with a genuine '
    + 'negative-proof and a 42501 non-interference control; and all four opt-out call sites do branch on the drift '
    + 'codes for legitimate degrade behavior. E2E/user-story coverage is correctly waived — this is a backend '
    + 'library-behavior corrective with no UI surface, and the SD success criteria specify unit control probes. '
    + 'The verdict is CONDITIONAL rather than PASS because SD success criterion #1 — the missing-RELATION case, '
    + 'which the criterion itself calls "the genuinely silent one" — is unmet by construction and was proven so '
    + 'empirically, not inferred. Not BLOCKED, because that gap is EXEC-phase work and the planning artifact is sound.',
  detailed_analysis: {
    commands_executed: [
      'npx vitest run --project unit tests/unit/client-factory-schema-drift-throw.test.js  -> 6 passed / 0 failed',
      'npx vitest run --project unit <6 regression files importing the factory>            -> 50 passed / 9 skipped / 0 failed',
      'node <probe> requiring lib/supabase-client-schema-drift.cjs with a head+count stub  -> RESOLVED, no throw',
    ],
    empirical_criterion1_probe: {
      input: '{ data: null, count: null, error: null, status: 204 }  (missing relation, head+count)',
      observed: 'promise RESOLVED — wrap did not throw; caller sees a success',
      real_table_contrast: '{ data: null, count: 1155, error: null, status: 206 }',
      conclusion: 'discriminant remains count===null vs count===N; the wrap added nothing for this shape',
    },
    claims_verified: {
      'claim_1_both_factories_wrapped': 'TRUE — supabase-client.js:15,78,113 and supabase-client.cjs:10,125,140',
      'claim_2_six_unit_tests_pass': 'TRUE — 6/6, includes negative-proof and 42501 non-interference',
      'claim_3_four_optout_call_sites': 'TRUE — all four branch on PGRST205/42703/42P01/PGRST204 for degrade-not-throw',
      'claim_4_no_regressions': 'TRUE for the sample re-run here (6 files, 0 failures)',
    },
    e2e_applicability: 'NOT APPLICABLE — backend library seam, sd_type=bugfix, no UI/user journey; not blocked on it.',
  },
  metadata: {
    measured: true,
    // Shape mirrors the runner-written artifact EXACTLY (6 targeted tests). The broader
    // regression sample is recorded separately below rather than inflated into these counts,
    // so artifact_sha stays honest about the file it hashes.
    test_execution: buildTestExecution({
      executed: runnerJson.numTotalTests,
      passed: runnerJson.numPassedTests,
      failed: runnerJson.numFailedTests,
      skipped: 0,
      artifactSha: contentHash,
      runner: 'vitest@4.1.4 --project unit --reporter=json',
      artifactPath: '.artifacts/testing-schema-truth-001A.json',
      source: 'fresh',
    }),
    regression_run: {
      note: 'separate run, not covered by artifact_sha above',
      files: 6,
      tests_passed: 50,
      tests_skipped: 9,
      tests_failed: 0,
    },
    evidence_provenance: {
      producer: 'vitest v4.1.4 --reporter=json (runner-written, not hand-authored)',
      artifact_path: '.artifacts/testing-schema-truth-001A.json',
      content_sha256: contentHash,
      run_commit_sha: headSha,
      num_total_tests: runnerJson.numTotalTests,
      num_passed_tests: runnerJson.numPassedTests,
      num_failed_tests: runnerJson.numFailedTests,
      runner_success: runnerJson.success,
    },
    supersedes_row: '58c64637-ddc0-4f14-8065-e1ade372f2a3',
    supersede_reason: 'prior row applied boilerplate E2E/user-story criteria to a backend library SD with no UI surface; also had phase=null',
    e2e_applicable: false,
    unit_tests_passed: true,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'tests/unit/client-factory-schema-drift-throw.test.js',
  supabase,
});
console.log('resolution:', JSON.stringify(resolution));

applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', SD_ID, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
