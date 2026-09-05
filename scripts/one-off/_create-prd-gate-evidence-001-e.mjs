#!/usr/bin/env node
/**
 * One-off: create the PRD for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E via contentOverride
 * (generate-first pattern, SD-FDBK-INFRA-ADD-PRD-DATABASE-001), grounded in direct Explore
 * research (evidence row 65ef3a4d-bf4a-4c44-971f-2f2e77061151) rather than LLM generation.
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
    'established for repo_path/executed_from_cwd, with no schema migration required.',
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
    },
  ],
  acceptance_criteria: [
    'Every sub_agent_execution_results row written by either of the two known writers after this SD carries an explicit metadata.session_id key (a real session id or explicit null, never omitted)',
    'No new database migration is required -- session_id lives in the existing metadata jsonb column, following the repo_path/executed_from_cwd precedent (CLAUDE.md prologue rule 11)',
    'All existing tests in both writers\' test suites continue passing unmodified',
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
    'following the existing repo_path/executed_from_cwd metadata-based provenance precedent.',
  implementation_approach:
    'Two small, symmetric edits: add `session_id: process.env.CLAUDE_SESSION_ID || null` to each ' +
    'writer\'s existing metadata object literal, in the post-caller-spread position for ' +
    'results-storage.js (matching the established anti-clobber pattern already used for ' +
    'original_verdict/evaluated_commit_sha) and alongside attribution_source for ' +
    'task-subagent-recorder.cjs (which has no caller-spread to guard against). Add unit tests to ' +
    'each writer\'s existing test suite covering the set/unset-env-var cases and, for the ' +
    'results-storage.js path, the anti-clobber property.',
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
      expected: 'An empty string is falsy in JS, so `process.env.CLAUDE_SESSION_ID || null` correctly normalizes it to explicit null on both writers -- not stored as an empty string, which would be a different, ambiguous sentinel than "no session".',
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
  ],
  out_of_scope: [
    {
      item: "The SD title's second half -- \"key the verdict cache on execution id plus gate code version\" -- is deliberately EXCLUDED from this PRD.",
      reason:
        'Genuinely ambiguous between two unrelated mechanisms: (1) scripts/modules/handoff/gate-verdict-cache.js, ' +
        'the only thing literally called a verdict "cache" in this codebase, but a pure performance optimization ' +
        'for HANDOFF GATES with zero connection to sub-agent evidence provenance and no execution-id concept in ' +
        'its domain at all; (2) scripts/modules/handoff/gates/subagent-evidence-gate.js, the actual reader of ' +
        'sub_agent_execution_results verdicts (on-thesis for this workstream) but with no literal "cache" concept ' +
        'or code-version stamp today. Guessing wrong risks either a large, blast-radius rewrite of an unrelated ' +
        'mechanism (candidate 1) or under-scoping a real staleness gap (candidate 2). Signaled to the coordinator ' +
        '(prd-ambiguous, signal bc247e78) for clarification rather than guessed at. Recommend a PRD amendment or ' +
        'separate child once clarified.',
    },
  ],
};

async function main() {
  await addPRDToDatabase(SD_KEY, 'W5 child E PRD: unconditional session_id stamping on both sub-agent-evidence writers', content);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
