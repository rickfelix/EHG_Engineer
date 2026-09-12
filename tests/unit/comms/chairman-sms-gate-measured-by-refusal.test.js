/**
 * QF-20260912-901 (FIX SHAPE (a) of QF-20260912-079) — the chairman-sms-gate's consumption of a
 * 'refuse' outcome from the pre-send consult lane. A refusal is neither a hold (nothing was ever
 * cited to release) nor a dispatch — it is a hard rejection naming the unstamped number.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS } from '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

const passEval = vi.fn().mockResolvedValue({ verdict: 'pass', authorityClass: 'sms' });
const zoneStub = vi.fn().mockResolvedValue({ zone: 'America/New_York' });

describe('chairman-sms-gate — measured_by[] provenance refusal', () => {
  it('a refuse outcome never inserts a chairman_held_sends row and never dispatches', async () => {
    const supabase = { from: () => { throw new Error('must never touch chairman_held_sends on refuse'); } };
    const sender = { send: vi.fn() };
    const runPreSendConsultLane = vi.fn().mockResolvedValue({ action: 'refuse', reason: 'unstamped_number', unstampedNumber: '171' });

    const r = await sendChairmanSMS(
      { type: 'decision', body: 'Every one of the 171 ventures reads below go-live.', options: [{ label: 'A' }, { label: 'B' }], decisionId: 'dec-refuse-1', subject: '[TEST]' },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane, supabase },
    );

    expect(r).toMatchObject({ sent: false, held: false, reason: 'unstamped_number_refused', unstampedNumber: '171' });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('threads message.measuredBy through to the consult lane input unchanged', async () => {
    const sender = { send: vi.fn() };
    const runPreSendConsultLane = vi.fn().mockResolvedValue({ action: 'proceed', consequence: 'high' });
    const measuredBy = [{ value: '171', instrument: 'venture-count-query', row_ref: 'ventures', measured_at: '2026-09-12T16:00:00Z' }];

    await sendChairmanSMS(
      { type: 'decision', body: '171 ventures', options: [{ label: 'A' }, { label: 'B' }], decisionId: 'dec-thread-1', subject: '[TEST]', measuredBy },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane },
    );

    expect(runPreSendConsultLane.mock.calls[0][0].measuredBy).toEqual(measuredBy);
  });
});
