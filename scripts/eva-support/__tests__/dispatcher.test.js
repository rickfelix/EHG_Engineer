import { describe, it, expect } from 'vitest';
import { getHandler, dispatch, FLOW_HANDLERS } from '../_internal/dispatcher.js';
import { FLOWS } from '../_internal/system-prompt.js';

describe('dispatcher', () => {
  it('has a handler for every declared flow', () => {
    for (const flow of FLOWS) {
      expect(typeof FLOW_HANDLERS[flow]).toBe('function');
    }
  });

  it('getHandler returns the function for a known flow', () => {
    const h = getHandler('research');
    expect(typeof h).toBe('function');
  });

  it('getHandler throws for an unknown flow', () => {
    expect(() => getHandler('not-a-flow')).toThrow(/Unknown flow/);
  });

  it('dispatch routes "draft" to draft.js handler', async () => {
    // Smoke test only — sub-flow handlers themselves are exercised via sub-flow-base tests.
    // Inject a fake Anthropic client through options to avoid real SDK calls.
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: 'drafted prose' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          model: 'claude-opus-4-7',
        }),
      },
    };
    const result = await dispatch('draft', { id: 't-1', content: 'write something' }, { client: fakeClient });
    expect(result.reply).toBe('drafted prose');
    expect(result.decision_log_entry.flow).toBe('draft');
  });
});
