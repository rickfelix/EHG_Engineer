/**
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 -- defaultRunHandoff's HANDOFF_RESULT parsing.
 *
 * TESTING finding (HIGH, EXEC-phase review, evidence a18127d0): the emitter
 * (scripts/modules/handoff/cli/execution-helpers.js) documents the result line as "Emitted LAST
 * so grep/tail can always find it" -- a non-global .match() is FIRST-wins, the opposite
 * guarantee. Concretely dangerous because handoff.js's own D16 sibling-selection mechanism can
 * continue past a failed SD and print a SECOND, unrelated HANDOFF_RESULT line into the same
 * stdout (two live instances observed in this session's own manual runs). A first-wins match
 * could silently attribute a DIFFERENT SD's result to the caller's request.
 */
import { describe, it, expect, vi } from 'vitest';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({ execFile: (...args) => execFileMock(...args) }));
vi.mock('node:util', () => ({ promisify: (fn) => (...args) => fn(...args) }));

const { defaultRunHandoff } = await import('./parent-completion.mjs');

function resolveExecFile(stdout) {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    // promisify-wrapped execFile is called as (cmd, args, opts) and returns a promise in real
    // usage; our promisify mock just forwards args, so simulate the promise-returning shape here.
    return Promise.resolve({ stdout, stderr: '' });
  });
}

describe('defaultRunHandoff', () => {
  it('parses a single, unambiguous HANDOFF_RESULT line correctly', async () => {
    resolveExecFile('...\nHANDOFF_RESULT=PASS SD=SD-ORCH-PARENT-001 SCORE=99 PHASE=LEAD-FINAL-APPROVAL\n');
    const result = await defaultRunHandoff('LEAD-FINAL-APPROVAL', 'SD-ORCH-PARENT-001');
    expect(result.pass).toBe(true);
    expect(result.score).toBe(99);
  });

  it('regression: picks the LAST HANDOFF_RESULT line, not the first, when handoff.js\'s own sibling-selection mechanism prints a second, unrelated result for a DIFFERENT SD into the same stdout', async () => {
    resolveExecFile([
      'HANDOFF_RESULT=FAIL SD=SD-OTHER-SIBLING-001 SCORE=40 PHASE=LEAD-FINAL-APPROVAL REASON=SOME_GATE',
      '...D16 sibling-selection continued...',
      'HANDOFF_RESULT=PASS SD=SD-ORCH-PARENT-001 SCORE=99 PHASE=LEAD-FINAL-APPROVAL',
    ].join('\n'));
    const result = await defaultRunHandoff('LEAD-FINAL-APPROVAL', 'SD-ORCH-PARENT-001');
    expect(result.pass).toBe(true);
    expect(result.score).toBe(99);
  });

  it('never silently accepts a result line naming a DIFFERENT SD than requested -- reports HANDOFF_RESULT_SD_MISMATCH instead', async () => {
    resolveExecFile('HANDOFF_RESULT=PASS SD=SD-COMPLETELY-UNRELATED-001 SCORE=100 PHASE=LEAD-FINAL-APPROVAL\n');
    const result = await defaultRunHandoff('LEAD-FINAL-APPROVAL', 'SD-ORCH-PARENT-001');
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('HANDOFF_RESULT_SD_MISMATCH');
  });

  it('reports UNPARSEABLE_HANDOFF_OUTPUT (never a silent pass) when no result line is found', async () => {
    resolveExecFile('some unrelated output with no result line\n');
    const result = await defaultRunHandoff('LEAD-FINAL-APPROVAL', 'SD-ORCH-PARENT-001');
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('UNPARSEABLE_HANDOFF_OUTPUT');
  });
});
