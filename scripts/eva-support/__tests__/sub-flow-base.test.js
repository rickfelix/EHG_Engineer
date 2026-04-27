import { describe, it, expect, vi } from 'vitest';
import { runSubFlow, extractOverrideReason } from '../_internal/sub-flow-base.js';

function fakeClient(reply) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: reply }],
        usage: { input_tokens: 50, output_tokens: 25 },
        model: 'claude-opus-4-7',
      }),
    },
  };
}

describe('extractOverrideReason', () => {
  it('returns the reason when input starts with "Override: "', () => {
    expect(extractOverrideReason('Override: time-boxed, just pick one')).toBe('time-boxed, just pick one');
  });

  it('returns null when input does not start with the token', () => {
    expect(extractOverrideReason('No really, just pick one')).toBeNull();
  });

  it('returns null when token has no reason', () => {
    expect(extractOverrideReason('Override:')).toBeNull();
    expect(extractOverrideReason('Override:   ')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(extractOverrideReason(null)).toBeNull();
    expect(extractOverrideReason(123)).toBeNull();
  });
});

describe('runSubFlow', () => {
  const subtask = { id: 't-1', content: 'Should I use Postgres or Mongo?', description: '' };

  it('returns reply + decision_log_entry shape', async () => {
    const client = fakeClient('Pick Postgres. Reason X.');
    const result = await runSubFlow({
      flow: 'decision',
      flowGuidance: 'frame tradeoffs',
      subtask,
      client,
    });
    expect(result.reply).toContain('Postgres');
    expect(result.decision_log_entry.task_id).toBe('t-1');
    expect(result.decision_log_entry.flow).toBe('decision');
    expect(result.decision_log_entry.sequence).toBe(1);
    expect(result.decision_log_entry.override_reason).toBeNull();
  });

  it('records override_reason when operatorInput starts with Override:', async () => {
    const client = fakeClient('OK, picking Postgres.');
    const { decision_log_entry } = await runSubFlow({
      flow: 'decision',
      flowGuidance: '',
      subtask,
      operatorInput: 'Override: time-boxed',
      client,
    });
    expect(decision_log_entry.override_reason).toBe('time-boxed');
  });

  it('increments sequence based on history length', async () => {
    const client = fakeClient('reply');
    const history = [
      { sequence: 1, operator_input_summary: 'first', eva_reply_summary: 'r1' },
      { sequence: 2, operator_input_summary: 'second', eva_reply_summary: 'r2' },
    ];
    const { decision_log_entry } = await runSubFlow({
      flow: 'research',
      flowGuidance: '',
      subtask,
      history,
      client,
    });
    expect(decision_log_entry.sequence).toBe(3);
  });

  it('passes history into messages array', async () => {
    const client = fakeClient('reply');
    const history = [
      { operator_input_summary: 'first op', eva_reply_summary: 'first eva' },
    ];
    await runSubFlow({ flow: 'research', flowGuidance: '', subtask, history, client });
    const callArgs = client.messages.create.mock.calls[0][0];
    expect(callArgs.messages.length).toBeGreaterThanOrEqual(3);
    expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'first op' });
    expect(callArgs.messages[1]).toEqual({ role: 'assistant', content: 'first eva' });
  });

  it('throws when subtask.id missing', async () => {
    await expect(
      runSubFlow({ flow: 'research', flowGuidance: '', subtask: { content: 'x' }, client: fakeClient('r') })
    ).rejects.toThrow(/subtask\.id/);
  });

  it('captures token counts from the SDK response', async () => {
    const client = fakeClient('reply');
    const { decision_log_entry } = await runSubFlow({ flow: 'research', flowGuidance: '', subtask, client });
    expect(decision_log_entry.tokens_in).toBe(50);
    expect(decision_log_entry.tokens_out).toBe(25);
    expect(decision_log_entry.model).toBe('claude-opus-4-7');
  });
});
