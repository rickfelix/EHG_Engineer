/**
 * Unit tests for the one-tap chairman decision-packet dispatcher.
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-D FR-2.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordPendingDecision = vi.fn();
const sendChairmanSmsQuestion = vi.fn();

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: (...args) => recordPendingDecision(...args),
}));
vi.mock('../../../lib/chairman/sms-bridge.js', () => ({
  sendChairmanSmsQuestion: (...args) => sendChairmanSmsQuestion(...args),
}));

const { notifySwitchOnDecisionPacket } = await import('../../../lib/switch-automation/switchon-decision-packet.js');

function makeSupabaseNoExisting() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
}

beforeEach(() => {
  recordPendingDecision.mockReset().mockResolvedValue({ recorded: true, id: 'dec-1', escalated: true });
  sendChairmanSmsQuestion.mockReset().mockResolvedValue({ sent: false, reason: 'high_consequence' });
});

describe('notifySwitchOnDecisionPacket', () => {
  it('requires supabase, sdKey, and action', async () => {
    expect(await notifySwitchOnDecisionPacket(null, { sdKey: 'X', action: 'Y' })).toEqual({ recorded: false, error: 'supabase client is required' });
    expect(await notifySwitchOnDecisionPacket({}, { action: 'Y' })).toEqual({ recorded: false, error: 'sdKey and action are required' });
  });

  it('TS-4/N1: calls recordPendingDecision with the real 2-arg (supabase, opts) signature', async () => {
    const supabase = makeSupabaseNoExisting();
    await notifySwitchOnDecisionPacket(supabase, { sdKey: 'SD-X', action: 'live-venture-deploy', reasons: ['never-auto'] });

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const [suppliedSupabase, opts] = recordPendingDecision.mock.calls[0];
    expect(suppliedSupabase).toBe(supabase);
    expect(opts.decisionType).toBe('switchon_gate');
    expect(opts.blocking).toBe(true);
    expect(opts.raisedBy).toBe('switchon-gate');
    expect(opts.context).toEqual({ sd_key: 'SD-X', action: 'live-venture-deploy', reasons: ['never-auto'] });
  });

  it('first call for a given (sdKey, action) records exactly once', async () => {
    const supabase = makeSupabaseNoExisting();
    const result = await notifySwitchOnDecisionPacket(supabase, { sdKey: 'SD-X', action: 'live-venture-deploy' });
    expect(result.recorded).toBe(true);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
  });

  it('TS-4: a second SEQUENTIAL call while the first decision is pending is deduped (no new record, no new SMS)', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-dec' }], error: null }),
      }),
    };
    const result = await notifySwitchOnDecisionPacket(supabase, { sdKey: 'SD-X', action: 'live-venture-deploy' });

    expect(result).toEqual({ recorded: false, deduped: true, existingDecisionId: 'existing-dec' });
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(sendChairmanSmsQuestion).not.toHaveBeenCalled();
  });

  it('TS-5: sendChairmanSmsQuestion throwing never blocks the durable console record', async () => {
    sendChairmanSmsQuestion.mockRejectedValue(new Error('twilio down'));
    const supabase = makeSupabaseNoExisting();
    const result = await notifySwitchOnDecisionPacket(supabase, { sdKey: 'SD-X', action: 'live-venture-deploy' });

    expect(result.recorded).toBe(true);
    expect(result.id).toBe('dec-1');
  });

  it('a dedup-read error fails open toward recording (never silently drops a real decision)', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('db down')),
      }),
    };
    const result = await notifySwitchOnDecisionPacket(supabase, { sdKey: 'SD-X', action: 'live-venture-deploy' });
    expect(result.recorded).toBe(true);
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
  });

  it('when recordPendingDecision itself fails, returns recorded:false without throwing and skips SMS', async () => {
    recordPendingDecision.mockResolvedValue({ recorded: false, error: 'title is required' });
    const supabase = makeSupabaseNoExisting();
    const result = await notifySwitchOnDecisionPacket(supabase, { sdKey: 'SD-X', action: 'live-venture-deploy' });

    expect(result).toEqual({ recorded: false, error: 'title is required' });
    expect(sendChairmanSmsQuestion).not.toHaveBeenCalled();
  });
});
