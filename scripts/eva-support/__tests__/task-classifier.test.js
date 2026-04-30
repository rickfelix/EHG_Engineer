import { describe, it, expect, vi } from 'vitest';
import { classify, classifyHeuristic } from '../task-classifier.js';
import { FLOWS } from '../_internal/system-prompt.js';

function fakeClient(reply) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: reply }],
        usage: { input_tokens: 10, output_tokens: 1 },
        model: 'claude-opus-4-7',
      }),
    },
  };
}

describe('classifyHeuristic', () => {
  it('returns one of FLOWS for any non-empty input', () => {
    const f = classifyHeuristic({ content: 'Should I use Postgres or Mongo?', description: '' });
    expect(FLOWS).toContain(f);
  });

  it('routes "investigate" to research', () => {
    const f = classifyHeuristic({ content: 'investigate webhook drops', description: '' });
    expect(f).toBe('research');
  });

  it('routes "draft an email" to draft', () => {
    const f = classifyHeuristic({ content: 'draft email to vendor', description: '' });
    expect(f).toBe('draft');
  });

  it('routes "plan the checklist" to action_prep', () => {
    const f = classifyHeuristic({ content: 'plan the prep checklist', description: '' });
    expect(f).toBe('action_prep');
  });

  it('routes "phone call" to pure_human', () => {
    const f = classifyHeuristic({ content: 'call the supplier', description: '' });
    expect(f).toBe('pure_human');
  });

  it('routes "configure tool" to platform', () => {
    const f = classifyHeuristic({ content: 'configure the tool', description: '' });
    expect(f).toBe('platform');
  });

  it('falls back to research for empty input', () => {
    expect(classifyHeuristic({ content: '', description: '' })).toBe('research');
  });

  it('handles null/undefined fields', () => {
    expect(classifyHeuristic({})).toBe('research');
  });
});

describe('classify (via SDK mock)', () => {
  it('returns the SDK reply when it is a valid flow name', async () => {
    const client = fakeClient('decision');
    const f = await classify({ content: 'A or B?' }, { client });
    expect(f).toBe('decision');
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it('strips whitespace and punctuation from the SDK reply', async () => {
    const client = fakeClient('  draft.\n');
    const f = await classify({ content: 'write something' }, { client });
    expect(f).toBe('draft');
  });

  it('falls back to heuristic when SDK returns invalid output', async () => {
    const client = fakeClient('not-a-flow');
    const f = await classify({ content: 'investigate the bug' }, { client });
    expect(FLOWS).toContain(f);
  });

  it('falls back to heuristic when SDK throws', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('network error')),
      },
    };
    const f = await classify({ content: 'investigate' }, { client });
    expect(f).toBe('research');
  });

  it('forces heuristic when useHeuristic=true (no SDK call)', async () => {
    const client = fakeClient('decision');
    const f = await classify({ content: 'investigate something' }, { client, useHeuristic: true });
    expect(f).toBe('research');
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('throws on non-object subtask', async () => {
    await expect(classify(null)).rejects.toThrow(/subtask/);
  });

  it('returns one of FLOWS for empty subtask (heuristic fallback path)', async () => {
    const client = fakeClient('');
    const f = await classify({ content: '', description: '' }, { client });
    expect(FLOWS).toContain(f);
  });
});
