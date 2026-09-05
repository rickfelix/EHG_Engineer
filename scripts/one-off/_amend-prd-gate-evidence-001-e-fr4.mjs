#!/usr/bin/env node
/**
 * One-off: amend the PRD for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E with FR-4, following the
 * coordinator's ruling on signal bc247e78 (recorded in the SD's metadata.coordinator_prd_ruling
 * and appended to the SD's description/scope by Adam, fence_notice 808f336e). The PRD's original
 * out_of_scope note excluding "the verdict cache" is now resolved and replaced by FR-4.
 */
import { addPRDToDatabase } from '../prd/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E';

const content = {
  executive_summary:
    'The two writers into sub_agent_execution_results (lib/sub-agent-executor/results-storage.js\'s ' +
    'storeSubAgentResults() and scripts/hooks/task-subagent-recorder.cjs\'s hook-based insert) both ' +
    'read process.env.CLAUDE_SESSION_ID today but never persist it onto the evidence row -- the ' +
    'parent workstream\'s own measured finding that session_id "HAS NO COLUMN" is closed here by ' +
    'stamping it into the existing metadata jsonb column, following the exact precedent already ' +
    'established for repo_path/executed_from_cwd, with no schema migration required. FR-4 (added ' +
    'by coordinator ruling on signal bc247e78, basis ratification 6c263823) extends ' +
    'scripts/modules/handoff/gate-verdict-cache.js\'s reuse key from input_hash alone to ' +
    'input_hash + execution id + gate code_version, for every registered gate, closing the gap ' +
    'where a PASS/FAIL computed by one handoff.js execution could be silently presented as gate ' +
    'evidence for a different one.',
  functional_requirements: [
    {
      id: 'FR-1',
      title: 'Stamp session_id unconditionally into metadata on the canonical results-storage.js writer',
      priority: 'critical',
      description:
        "lib/sub-agent-executor/results-storage.js's storeSubAgentResults() builds its metadata object " +
        'at lines 568-633. original_verdict and evaluated_commit_sha are deliberately set AFTER the ' +
        '...safeMetadata spread (613, 632) specifically so a caller cannot clobber the writer\'s own ' +
        'audit fields (SD-LEO-INFRA-WRITER-SUB-AGENT-001 / FR-3a rationale, documented at 591-599). Add ' +
        'session_id in that same post-spread position: `session_id: process.env.CLAUDE_SESSION_ID || null` ' +
        '-- always present as an explicit key (never omitted), matching the existing sentinel-value ' +
        'convention this same file already uses for verdict (570-577: "a MISSING key is indistinguishable ' +
        'from a row written by one of the other paths ... The sentinel makes it a queryable fact rather ' +
        'than an inference from silence").',
      acceptance_criteria: [
        'metadata.session_id is present (never an omitted key) on every row storeSubAgentResults() writes',
        'When CLAUDE_SESSION_ID is set, metadata.session_id equals it exactly',
        'When CLAUDE_SESSION_ID is unset, metadata.session_id is explicitly null, not omitted',
        'A caller supplying results.metadata.session_id cannot override the value this writer observed (post-spread placement, mirroring original_verdict/evaluated_commit_sha)',
      ],
      status: 'delivered',
    },
    {
      id: 'FR-2',
      title: 'Stamp session_id unconditionally into metadata on the task-subagent-recorder.cjs hook writer',
      priority: 'critical',
      description:
        "scripts/hooks/task-subagent-recorder.cjs's processHookInput() builds its record.metadata object " +
        'at lines 418-424 (tool_call_id, recorded_by, recorded_at, attribution_source). It is a SEPARATE ' +
        'writer into the same table (source: \'task_hook\') from FR-1\'s target, and currently reads ' +
        'process.env.CLAUDE_SESSION_ID at line 224 (inside getActiveSD()) only to resolve sd_id via a ' +
        'claim-lookup query -- the session id value itself is never persisted. Add ' +
        '`session_id: process.env.CLAUDE_SESSION_ID || null` alongside attribution_source in that same ' +
        'metadata object. "Unconditionally" (per the SD title) means BOTH writers, not just the more ' +
        'commonly-used one -- stamping only FR-1\'s path would leave the stamp path-partial, the exact ' +
        'defect class the parent workstream\'s own thesis is about (one path fixed, the other silently missed).',
      acceptance_criteria: [
        'metadata.session_id is present (never an omitted key) on every row processHookInput()/insertRecord() writes',
        'When CLAUDE_SESSION_ID is set, metadata.session_id equals it exactly',
        'When CLAUDE_SESSION_ID is unset, metadata.session_id is explicitly null, not omitted',
      ],
      status: 'delivered',
    },
    {
      id: 'FR-3',
      title: 'Regression tests for both stamping sites',
      priority: 'high',
      description:
        'Add unit tests for both writers asserting the FR-1/FR-2 behavior, including the anti-clobber ' +
        'property for the results-storage.js path (a caller-supplied results.metadata.session_id must ' +
        'not survive) and the always-a-key (never omitted) property for both paths.',
      acceptance_criteria: [
        'A test constructs a call to storeSubAgentResults() with CLAUDE_SESSION_ID set and asserts metadata.session_id matches',
        'A test constructs the same call with CLAUDE_SESSION_ID unset and asserts metadata.session_id is explicitly null',
        'A test asserts a caller-supplied results.metadata.session_id is overridden by the writer\'s own observed value',
        'A test constructs a task-subagent-recorder.cjs record build with CLAUDE_SESSION_ID set/unset and asserts the same two properties',
      ],
      status: 'delivered',
    },
    {
      id: 'FR-4',
      title: 'Extend the gate-verdict cache key to execution id plus gate code_version, for every registered gate',
      priority: 'critical',
      description:
        'Coordinator ruling on signal bc247e78 (basis: parent CAPA plan text and ratification 6c263823 -- ' +
        '"a reused cached verdict is gate evidence and must carry its run identifier"), recorded in the ' +
        'SD\'s metadata.coordinator_prd_ruling: "the verdict cache" is scripts/modules/handoff/' +
        'gate-verdict-cache.js (the handoff-gate performance cache), extended from today\'s ' +
        'input_hash-only PASS-reuse key (code_version checked for FAIL_REPLAY_GATES only) to ' +
        'input_hash + execution_id + code_version for ALL registered gates, on both the PASS-reuse and ' +
        'FAIL-REPLAY paths. An execution id is minted once per handoff.js execute() invocation ' +
        '(BaseExecutor.js) and threaded through validationContext._verdictCache.executionId; a fresh ' +
        'evaluation stamps it onto gateResult.execution_id (ValidationOrchestrator.js) alongside the ' +
        'existing input_hash/code_version stamps. In-process retry-loop reuse (BaseExecutor attempt ' +
        '0..N within one execute() call) is unaffected, since every attempt shares the same minted id; ' +
        'cross-execution reuse (loadPriorGateResults, reusing a row from an earlier, separate handoff.js ' +
        'invocation -- the pattern the module\'s original "177 rejections in 4 days" motivation actually ' +
        'measured) now requires a fresh evaluation, since a new invocation always mints a new id. A cached ' +
        'row with no execution_id (pre-this-SD schema) is treated as a miss, never a permissive default. ' +
        'GATE_RESULTS_VERSION_HASHED is bumped 2->3 so pre-this-SD persisted rows are excluded from ' +
        'consideration by loadPriorGateResults, and GATE_CODE_VERSION gains an entry for each of the ' +
        'three previously-unversioned pure gates (GATE_SD_METRICS_SUFFICIENCY, GATE_SD_QUALITY, ' +
        'GATE_PLACEHOLDER_CONTENT_DETECTION), each starting at version 1.',
      acceptance_criteria: [
        'probeVerdictCache() requires prior.execution_id to equal cacheCfg.executionId for BOTH pass_reuse and fail_replay, for every registered gate',
        'A cached row with no execution_id never hits, regardless of a matching input_hash',
        'probeVerdictCache() requires prior.code_version to equal GATE_CODE_VERSION[gate] for pass_reuse too (previously fail_replay only), for every registered gate that has a code_version entry',
        'GATE_CODE_VERSION carries an entry for all four currently-registered gates',
        'In-process retry-loop reuse (same execution id across BaseExecutor attempts 0..N) still hits, matching the pre-FR-4 contract',
        'A second, separate handoff.js execute() invocation (a different minted execution id) against the same declared inputs re-runs the gate rather than reusing a prior verdict',
        'GATE_RESULTS_VERSION_HASHED is bumped so pre-FR-4 persisted gate_results rows are excluded from loadPriorGateResults consideration',
      ],
      status: 'delivered',
    },
  ],
  acceptance_criteria: [
    'Every sub_agent_execution_results row written by either of the two known writers after this SD carries an explicit metadata.session_id key (a real session id or explicit null, never omitted)',
    'No new database migration is required -- session_id lives in the existing metadata jsonb column, following the repo_path/executed_from_cwd precedent (CLAUDE.md prologue rule 11)',
    'gate-verdict-cache.js reuse (PASS or FAIL-REPLAY) requires a matching execution id and code_version, for every registered gate, per the coordinator\'s ruling on signal bc247e78',
    'All existing tests in the touched writers\' and gate-verdict-cache\'s test suites continue passing (rewritten where FR-4 changes their fixtures\' required shape, never silently weakened)',
  ],
  system_architecture:
    'Two independent writers persist rows to sub_agent_execution_results today: (1) the canonical ' +
    'lib/sub-agent-executor/results-storage.js storeSubAgentResults() path used by lib/sub-agents/* ' +
    'and scripts/execute-subagent.js --code invocations; (2) the PostToolUse-hook-based ' +
    'scripts/hooks/task-subagent-recorder.cjs processHookInput() path (source=\'task_hook\'), used ' +
    'when a Task-tool sub-agent invocation is observed directly. Both already read ' +
    'process.env.CLAUDE_SESSION_ID for unrelated purposes (a heartbeat ping in path 1, an SD ' +
    'claim-lookup in path 2) but neither persists it. This SD adds an explicit `session_id` key to ' +
    'the metadata jsonb object each writer already constructs -- no schema/migration change, ' +
    'following the existing repo_path/executed_from_cwd metadata-based provenance precedent. ' +
    'Separately, FR-4 extends scripts/modules/handoff/gate-verdict-cache.js -- a pure, in-memory ' +
    'decision function (probeVerdictCache) consulted by ValidationOrchestrator.js per gate and armed ' +
    'by BaseExecutor.js once per handoff.js execute() call -- with an execution-id dimension threaded ' +
    'through validationContext._verdictCache.executionId, requiring both PASS-reuse and FAIL-REPLAY to ' +
    'match the current execution\'s own id in addition to the existing input_hash and (now universal) ' +
    'code_version checks.',
  implementation_approach:
    'Two small, symmetric session_id edits: add `session_id: process.env.CLAUDE_SESSION_ID || null` to ' +
    'each writer\'s existing metadata object literal, in the post-caller-spread position for ' +
    'results-storage.js (matching the established anti-clobber pattern already used for ' +
    'original_verdict/evaluated_commit_sha) and alongside attribution_source for ' +
    'task-subagent-recorder.cjs (which has no caller-spread to guard against). Unit tests added to ' +
    'each writer\'s existing test suite covering the set/unset-env-var cases and, for the ' +
    'results-storage.js path, the anti-clobber property. FR-4: mint crypto.randomUUID() once in ' +
    'BaseExecutor.js\'s existing gate-verdict-cache setup block, stamp it onto validationContext.' +
    '_verdictCache.executionId; stamp gateResult.execution_id in ValidationOrchestrator.js alongside ' +
    'the existing input_hash/code_version stamps on a freshly-evaluated gate; extend probeVerdictCache() ' +
    'in gate-verdict-cache.js with an execution-id equality check (miss if either side is absent) applied ' +
    'before both the pass_reuse and fail_replay branches, and extend the code_version check (already ' +
    'present for fail_replay) to also gate pass_reuse; add GATE_CODE_VERSION entries for the three ' +
    'previously-unversioned pure gates; bump GATE_RESULTS_VERSION_HASHED so older persisted rows are ' +
    'excluded. The existing gate-verdict-cache.test.js suite is rewritten (not silently weakened) to ' +
    'thread a consistent execution id through every "should still hit" fixture and add new fixtures for ' +
    'the mismatched-execution-id and missing-execution-id miss cases.',
  test_scenarios: [
    {
      scenario: 'storeSubAgentResults() with CLAUDE_SESSION_ID set',
      expected: 'The stored row\'s metadata.session_id exactly equals the env var value',
    },
    {
      scenario: 'storeSubAgentResults() with CLAUDE_SESSION_ID unset',
      expected: 'The stored row\'s metadata.session_id is explicitly null, not an omitted key',
    },
    {
      scenario: 'storeSubAgentResults() called with a caller-supplied results.metadata.session_id',
      expected: 'The stored row\'s metadata.session_id reflects this writer\'s own process.env.CLAUDE_SESSION_ID observation, not the caller-supplied value (anti-clobber, mirrors original_verdict/evaluated_commit_sha)',
    },
    {
      scenario: 'task-subagent-recorder.cjs processHookInput() with CLAUDE_SESSION_ID set/unset',
      expected: 'The built record.metadata.session_id matches the same set/explicit-null contract as the results-storage.js path',
    },
    {
      scenario: 'Edge case: CLAUDE_SESSION_ID set to an empty string rather than unset',
      expected: 'An empty string is falsy in JS, so `process.env.CLAUDE_SESSION_ID || null` correctly normalizes it to explicit null on both writers -- not stored as an empty string, which would be a different, underspecified sentinel than "no session".',
    },
    {
      scenario: 'probeVerdictCache: identical input_hash, matching execution id and code_version',
      expected: 'PASS reuse hits, as before FR-4',
    },
    {
      scenario: 'probeVerdictCache: identical input_hash but a DIFFERENT execution id (a separate handoff.js invocation)',
      expected: 'Miss -- the gate re-runs rather than reusing a verdict from a different execution',
    },
    {
      scenario: 'probeVerdictCache: identical input_hash and execution id but a changed code_version',
      expected: 'Miss on PASS reuse too (previously only enforced for FAIL-REPLAY) -- a fixed/changed verifier must re-run at least once',
    },
    {
      scenario: 'BaseExecutor in-process retry loop (attempts 0..N within one execute() call)',
      expected: 'Reuse still works end-to-end, since every attempt in the loop shares the same minted execution id',
    },
  ],
  risks: [
    {
      risk: 'A third, currently-unknown writer into sub_agent_execution_results could remain unstamped',
      mitigation: 'Explore-phase research (evidence row 65ef3a4d-bf4a-4c44-971f-2f2e77061151) identified exactly two writers into this table via a targeted search; no third writer was found. If one surfaces later it is a follow-up, not a regression of this SD\'s own scope.',
    },
    {
      risk: 'Placing session_id before the caller-spread in results-storage.js (instead of after) would let a malicious/buggy caller overwrite the writer\'s own observed value, defeating the provenance intent',
      mitigation: 'Follow the exact placement precedent already established for original_verdict/evaluated_commit_sha (set AFTER `...safeMetadata`), and pin it with the anti-clobber test in FR-3/test_scenarios.',
    },
    {
      risk: 'Stamping only one of the two writers would leave the fix path-partial, the exact defect class this parent workstream exists to close (its own measured finding: the provenance stamp covers intermediate handoffs but not the one that ends the work)',
      mitigation: 'FR-1 and FR-2 explicitly cover both known writers; acceptance criteria require both, not just the more commonly-invoked one.',
    },
    {
      risk: 'FR-4 forfeits most or all cross-execution PASS-verdict reuse, the original performance motivation for gate-verdict-cache.js ("177 rejections in 4 days each re-ran the ENTIRE pipeline")',
      mitigation: 'MEASURED per the coordinator ruling\'s explicit disclosure requirement: 1342 PASS-reuse hits were recorded via GATE_VERDICT_CACHE coordination_events telemetry across 444 telemetry rows since 2026-06-11. Because a rejected-then-retried handoff is, by definition, two separate handoff.js execute() invocations, close to that full population is cross-execution and is expected to stop hitting under this change. This is the disclosed, accepted cost of the evidence-integrity guarantee ratification 6c263823 requires (a reused verdict must carry its own run\'s identifier) -- in-process retry-loop reuse within a single execute() call is unaffected.',
    },
    {
      risk: 'GATE_RESULTS_VERSION_HASHED bump could be read as a breaking schema change',
      mitigation: 'No migration or column change -- it only changes which persisted sd_phase_handoffs.metadata.gate_results rows loadPriorGateResults() considers eligible for cross-execution reuse consideration, correctly excluding pre-FR-4 rows that lack execution_id/the newly-versioned code_version entries.',
    },
  ],
};

async function main() {
  await addPRDToDatabase(SD_KEY, 'W5 child E PRD: unconditional session_id stamping on both sub-agent-evidence writers, plus gate-verdict-cache execution-id keying (FR-4, coordinator ruling on bc247e78)', content);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
