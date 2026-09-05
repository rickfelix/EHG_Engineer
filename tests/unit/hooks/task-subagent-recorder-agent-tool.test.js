/**
 * SD-LEO-INFRA-RESTORE-AGENT-TOOL-001 — restores the Agent-tool sub-agent evidence recorder.
 *
 * The hook has NEVER written a row in its history (0 rows all-time with
 * metadata.recorded_by='task-subagent-recorder.cjs', verified by direct DB query + independent
 * Explore re-verification). Root cause is THREE independent bugs: (1) the Task->Agent tool
 * rename left every matcher/guard naming only 'Task', (2) the payload parser reads
 * tool_result/result and tool_call_id/call_id -- fields that do not exist in the VERIFIED
 * PostToolUse contract (tests/hooks/__tests__/session-id-propagation-canary.test.js:13-16,
 * RCA 2026-05-04: the real fields are tool_response and tool_use_id) -- a bug independent of and
 * predating the rename, and (3) no provenance triple (producer/run-id/content-hash) per
 * ratification 6c263823.
 *
 * These tests exercise the PURE functions the fix touches directly (extractResponseContent,
 * parseVerdict, parseSummary, buildSubAgentRecord) -- no DB/process I/O, matching this file's
 * existing sibling test's injection style.
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { createRequire } from 'module';

// Fail-soft-safe belt-and-suspenders guarantee, mirroring the sibling attribution test: even the
// positive-path guard test below must never reach a live DB. insertRecord()'s existing
// best-effort catch swallows this throw, which is exactly what lets the guard tests run safely.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('unit test must never reach a live supabase client'); },
}));

const require = createRequire(import.meta.url);
const {
  extractResponseContent, parseVerdict, parseSummary, buildSubAgentRecord, generateInvocationId,
  processHookInput,
} = require('../../../scripts/hooks/task-subagent-recorder.cjs');

describe('[TS-1..TS-2] extractResponseContent — defensive tool_response shape handling', () => {
  it('[TS-1] a plain string tool_response passes through unchanged', () => {
    expect(extractResponseContent('VERDICT: PASS\nall good')).toBe('VERDICT: PASS\nall good');
  });

  it('[TS-2] an Anthropic content-array tool_response ({content:[{type:"text",text}]}) extracts the joined text', () => {
    const response = { content: [{ type: 'text', text: 'part one' }, { type: 'text', text: 'VERDICT: FAIL' }] };
    expect(extractResponseContent(response)).toBe('part one\nVERDICT: FAIL');
  });

  it('a flat object (already carrying verdict/summary fields) passes through unchanged', () => {
    const response = { verdict: 'pass', summary: 'ok' };
    expect(extractResponseContent(response)).toBe(response);
  });

  it('[TS-5] an unrecognized shape (e.g. a bare number) passes through unchanged rather than throwing', () => {
    expect(extractResponseContent(42)).toBe(42);
    expect(extractResponseContent(null)).toBeNull();
  });
});

describe('[TS-1/TS-2] parseVerdict + parseSummary against the extracted content', () => {
  it('[TS-1] a string with a VERDICT marker parses to a real verdict, not "unknown"', () => {
    const content = extractResponseContent('some preamble\nVERDICT: PASS\nmore text');
    expect(parseVerdict(content)).toBe('pass');
    expect(parseSummary(content).length).toBeGreaterThan(0);
  });

  it('[TS-2] a content-array shape with a VERDICT marker parses correctly after extraction', () => {
    const content = extractResponseContent({ content: [{ type: 'text', text: 'VERDICT: FAIL — see details' }] });
    expect(parseVerdict(content)).toBe('fail');
  });

  it('[TS-5] a genuinely unparseable shape degrades to unknown/empty, never throws', () => {
    const content = extractResponseContent(42);
    expect(() => parseVerdict(content)).not.toThrow();
    expect(parseVerdict(content)).toBe('unknown');
  });
});

describe('[TS-3] generateInvocationId is tool-name-agnostic (Task and Agent produce comparable ids for equivalent input)', () => {
  it('the id changes with tool_name but the function itself works identically for both', () => {
    const params = { subagent_type: 'TESTING', tool_call_id: 'call-1', tool_input: { subagent_type: 'testing-agent' } };
    const agentId = generateInvocationId({ ...params, tool_name: 'Agent' });
    const taskId = generateInvocationId({ ...params, tool_name: 'Task' });
    expect(typeof agentId).toBe('string');
    expect(typeof taskId).toBe('string');
    expect(agentId).not.toBe(taskId); // tool_name is part of the canonical input, by design
  });
});

describe('[FR-3] buildSubAgentRecord — the ratification-6c263823 provenance triple', () => {
  const baseArgs = {
    sdId: 'SD-TEST-001',
    toolName: 'Agent',
    subagentType: 'TESTING',
    verdict: 'pass',
    summary: 'ok',
    rawOutput: { data: 'ok', truncated: false },
    invocationId: 'inv-123',
    toolCallId: 'tool-use-123',
    attributionSource: 'claim-lookup',
  };

  it('stamps metadata.tool_name (producer) exactly as passed', () => {
    const record = buildSubAgentRecord(baseArgs);
    expect(record.metadata.tool_name).toBe('Agent');
  });

  it('invocation_id (run identifier) is present as the existing top-level field, unchanged', () => {
    const record = buildSubAgentRecord(baseArgs);
    expect(record.invocation_id).toBe('inv-123');
  });

  it('stamps metadata.content_hash as a SHA-256 hex digest of the serialized raw_output', () => {
    const record = buildSubAgentRecord(baseArgs);
    expect(record.metadata.content_hash).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: the same raw_output always hashes to the same value.
    const record2 = buildSubAgentRecord(baseArgs);
    expect(record2.metadata.content_hash).toBe(record.metadata.content_hash);
  });

  it('a different raw_output produces a different content_hash', () => {
    const a = buildSubAgentRecord(baseArgs);
    const b = buildSubAgentRecord({ ...baseArgs, rawOutput: { data: 'different', truncated: false } });
    expect(a.metadata.content_hash).not.toBe(b.metadata.content_hash);
  });

  it('never throws when rawOutput is null/undefined', () => {
    expect(() => buildSubAgentRecord({ ...baseArgs, rawOutput: null })).not.toThrow();
    expect(buildSubAgentRecord({ ...baseArgs, rawOutput: null }).metadata.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the existing metadata fields (recorded_by, session_id, attribution_source, tool_call_id) are unchanged in shape -- purely additive', () => {
    const record = buildSubAgentRecord(baseArgs);
    expect(record.metadata.recorded_by).toBe('task-subagent-recorder.cjs');
    expect(record.metadata.attribution_source).toBe('claim-lookup');
    expect(record.metadata.tool_call_id).toBe('tool-use-123');
    expect(record.source).toBe('task_hook');
  });
});

describe('[TS-3/TS-4] processHookInput — the tool-name guard', () => {
  const savedEnv = { ...process.env };
  let logSpy;
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...savedEnv };
    logSpy.mockRestore();
  });

  it('[TS-4] a non-sub-agent tool (e.g. Bash) is rejected before any log/DB activity', async () => {
    await processHookInput({ tool_name: 'Bash', tool_input: { command: 'ls' } });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('an Agent/Task invocation with no subagent_type is also rejected before any log/DB activity', async () => {
    await processHookInput({ tool_name: 'Agent', tool_input: {}, tool_response: 'VERDICT: PASS' });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('[TS-3] tool_name="Agent" with a real subagent_type PASSES the guard and proceeds to attempt recording (fails soft at the DB boundary, never throws)', async () => {
    await expect(processHookInput({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'testing-agent' },
      tool_response: 'VERDICT: PASS\nall good',
      tool_use_id: 'tool-use-1',
    })).resolves.not.toThrow();
    // Reached the log-bearing part of the function (past the guard) even though the mocked
    // supabase client throws -- best-effort mode logs the DB error and returns instead of raising.
    expect(logSpy).toHaveBeenCalled();
  });

  it('tool_name="Task" (the older harness name) is still accepted, proving the fix is not Agent-only', async () => {
    await expect(processHookInput({
      tool_name: 'Task',
      tool_input: { subagent_type: 'testing-agent' },
      tool_response: 'VERDICT: PASS',
      tool_use_id: 'tool-use-2',
    })).resolves.not.toThrow();
    expect(logSpy).toHaveBeenCalled();
  });
});
