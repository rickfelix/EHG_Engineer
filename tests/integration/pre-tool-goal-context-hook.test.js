import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import handler from '../../.claude/hooks/pre-tool-goal-context.cjs';

const oldEnv = { ...process.env };
beforeEach(() => {
  handler._clearCache?.();
  process.env.CLAUDE_SESSION_ID = 'test-sd-uuid';
  process.env.BRAINSTORM_VOCAB_VERSION = '1.0.0';
});
afterEach(() => { process.env = { ...oldEnv }; });

describe('pre-tool-goal-context hook', () => {
  it('returns additionalContext for state-mutating tools', async () => {
    const r = await handler({ toolName: 'Edit', toolInput: { file_path: 'x' } });
    expect(r.additionalContext).toMatch(/\[\/goal advisory\]/);
  });

  it('skips read-only tools (returns empty)', async () => {
    expect(await handler({ toolName: 'Read', toolInput: { file_path: 'x' } })).toEqual({});
    expect(await handler({ toolName: 'Grep', toolInput: { pattern: 'x' } })).toEqual({});
    expect(await handler({ toolName: 'Glob', toolInput: { pattern: '*.js' } })).toEqual({});
  });

  it('skips when no CLAUDE_SESSION_ID', async () => {
    delete process.env.CLAUDE_SESSION_ID;
    const r = await handler({ toolName: 'Edit', toolInput: { file_path: 'x' } });
    expect(r).toEqual({});
  });

  it('NEVER mutates toolInput', async () => {
    const input = { file_path: 'x', old: 'a', new: 'b' };
    const before = JSON.stringify(input);
    await handler({ toolName: 'Edit', toolInput: input });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('cache hit within 60s returns same context', async () => {
    const r1 = await handler({ toolName: 'Edit', toolInput: { file_path: 'x' } });
    const r2 = await handler({ toolName: 'Edit', toolInput: { file_path: 'x' } });
    expect(r2.additionalContext).toBe(r1.additionalContext);
  });

  it('NEVER throws — returns {} on error', async () => {
    const r = await handler(null);
    expect(r).toEqual({});
  });
});
