/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1) — the hold-time WRITE half of the reconcile-on-
 * verdict release lane. A TESTING sub-agent (evidence 9cc5057d) found this side had zero coverage:
 * deleting the entire chairman_held_sends insert at chairman-sms-gate/index.js left every existing
 * suite green, because the RELEASE side (chairman-held-send-release.test.js) only exercises a
 * held row it constructs by hand. This file closes that gap: it asserts the insert actually fires,
 * with consult_correlation_id joined to the SAME correlationId the consult seam produced, and
 * options already shaped as a string[] (the exact contract releaseHeldSend depends on).
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS, resolveChairmanUserId } from '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

const passEval = vi.fn().mockResolvedValue({ verdict: 'pass', authorityClass: 'sms' });
const zoneStub = vi.fn().mockResolvedValue({ zone: 'America/New_York' });

/** Minimal fake supporting only what the hold-persist insert needs: .from('chairman_held_sends').insert(). */
function makeFakeSupabaseForHold({ insertError = null } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table !== 'chairman_held_sends') throw new Error(`unexpected table: ${table}`);
      return {
        insert(row) {
          inserted.push(row);
          return Promise.resolve(insertError ? { data: null, error: { message: insertError } } : { data: [{ id: 'held-row-1' }], error: null });
        },
      };
    },
    rpc: vi.fn(async () => ({ data: 'u-resolved', error: null })),
  };
}

describe('chairman-sms-gate hold persistence (SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 FR-1)', () => {
  it('a hold-and-surface outcome inserts a chairman_held_sends row carrying the SAME correlationId the consult seam produced', async () => {
    const supabase = makeFakeSupabaseForHold();
    const sender = { send: vi.fn() };
    const runPreSendConsultLane = vi.fn().mockResolvedValue({ action: 'hold-and-surface', correlationId: 'corr-hold-xyz', reason: 'solomon-consult-async::chairman-hold-pending-reconcile' });

    const r = await sendChairmanSMS(
      { type: 'decision', body: 'Approve the deploy?', options: [{ label: 'A' }, { label: 'B' }], decisionId: 'dec-hold-1', subject: '[TEST]' },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane, supabase },
    );

    expect(r).toMatchObject({ sent: false, held: true, reason: 'pre_send_consult_hold' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(supabase.inserted).toHaveLength(1);
    const row = supabase.inserted[0];
    expect(row.consult_correlation_id).toBe('corr-hold-xyz');
    expect(row.decision_id).toBe('dec-hold-1');
    // isDecision sends run through composeDecisionSmsBody() BEFORE the consult gate (line 352),
    // which folds the labeled options into the transmitted body -- this is the SAME body the
    // chairman would eventually receive on release, not the raw pre-composition text.
    expect(row.body).toContain('Approve the deploy?');
    expect(row.body).toContain('A');
    expect(row.body).toContain('B');
    // options must already be a string[] -- chairman_held_sends.options is CHECK-enforced as a
    // JSON array (jsonb_typeof(options) = 'array'), never an object.
    expect(Array.isArray(row.options)).toBe(true);
    expect(row.options).toEqual(['A', 'B']);
    expect(row.chairman_user_id).toBe('u-resolved');
    expect(row.hold_reason).toBe('solomon-consult-async::chairman-hold-pending-reconcile');
  });

  it('a hold with NO correlationId (genuine hard timeout, not a pending envelope) still persists with consult_correlation_id=null -- surfaced later via v_chairman_held_sends_unreconcilable, never silently dropped', async () => {
    const supabase = makeFakeSupabaseForHold();
    const sender = { send: vi.fn() };
    const runPreSendConsultLane = vi.fn().mockResolvedValue({ action: 'hold-and-surface', reason: 'solomon-consult-timeout::chairman-hold-and-surface' });

    await sendChairmanSMS(
      { type: 'decision', body: 'Approve X?', decisionId: 'dec-hold-2' },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane, supabase },
    );

    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0].consult_correlation_id).toBeNull();
  });

  it('a persistence failure (insert error) does NOT change the hold outcome -- the send stays correctly held either way, only logged loudly', async () => {
    const supabase = makeFakeSupabaseForHold({ insertError: 'chairman_held_sends insert boom' });
    const sender = { send: vi.fn() };
    const silentConsole = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
    const runPreSendConsultLane = vi.fn().mockResolvedValue({ action: 'hold-and-surface', correlationId: 'corr-1' });

    const r = await sendChairmanSMS(
      { type: 'decision', body: 'Approve X?' },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane, supabase, console: silentConsole },
    );

    expect(r).toMatchObject({ sent: false, held: true, reason: 'pre_send_consult_hold' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(silentConsole.error).toHaveBeenCalledWith(expect.stringContaining('FAILED to persist held send'));
  });

  it('an unresolvable chairman identity at hold time (resolver throws) does NOT change the hold outcome -- best-effort persistence, never blocks the hold', async () => {
    const supabase = makeFakeSupabaseForHold();
    supabase.rpc = vi.fn(async () => ({ data: null, error: { message: 'no auth.users row matches' } }));
    const sender = { send: vi.fn() };
    const silentConsole = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
    const runPreSendConsultLane = vi.fn().mockResolvedValue({ action: 'hold-and-surface', correlationId: 'corr-1' });

    const r = await sendChairmanSMS(
      { type: 'decision', body: 'Approve X?' },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane, supabase, console: silentConsole },
    );

    expect(r).toMatchObject({ sent: false, held: true, reason: 'pre_send_consult_hold' });
    expect(supabase.inserted).toHaveLength(0);
    expect(silentConsole.error).toHaveBeenCalledWith(expect.stringContaining('FAILED to persist held send'));
  });
});

describe('resolveChairmanUserId (SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 FR-3, exported unit)', () => {
  it('honors an explicit message.chairmanUserId as an override, skipping the RPC entirely', async () => {
    const supabase = { rpc: vi.fn() };
    const id = await resolveChairmanUserId(supabase, { chairmanUserId: 'u-explicit' });
    expect(id).toBe('u-explicit');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('resolves via the RPC when no explicit id is supplied', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: 'u-rpc', error: null })) };
    const id = await resolveChairmanUserId(supabase, {});
    expect(id).toBe('u-rpc');
    expect(supabase.rpc).toHaveBeenCalledWith('fn_resolve_chairman_user_id');
  });

  it('throws (fail loud) when the RPC errors', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: 'no match' } })) };
    await expect(resolveChairmanUserId(supabase, {})).rejects.toThrow(/fn_resolve_chairman_user_id RPC failed/);
  });

  it('throws (fail loud) when the RPC returns no data at all', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    await expect(resolveChairmanUserId(supabase, {})).rejects.toThrow(/unresolvable/);
  });
});
