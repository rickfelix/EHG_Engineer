/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-3 — commitment-writer hook.
 */
import { describe, it, expect, vi } from 'vitest';
import { detectCommitment, writeCommitmentIfDeclared, resolveCommitment } from '../../../lib/coordinator/commitment-writer.cjs';

describe('detectCommitment (pure)', () => {
  it('detects a [COMMIT: ...] tag and extracts the subject', () => {
    const row = { body: 'Sure — [COMMIT: ship the FR-4 dashboard change] will do it today.' };
    expect(detectCommitment(row)).toEqual({ subject: 'ship the FR-4 dashboard change', dueBy: null });
  });

  it('extracts an optional due_by when a trailing "by <ISO date>" is present', () => {
    const row = { body: '[COMMIT: reconcile the ledger] by 2026-09-01' };
    expect(detectCommitment(row)).toEqual({ subject: 'reconcile the ledger', dueBy: '2026-09-01' });
  });

  it('returns null for ordinary chatter with no tag', () => {
    expect(detectCommitment({ body: 'sounds good, will look into it' })).toBeNull();
  });

  it('TS-1: a fire-and-forget row (coordinator-reply.cjs shape) is NEVER a commitment, even with a tag present', () => {
    const row = { body: '[COMMIT: this should never fire]', payload: { reply_class: 'fire-and-forget' } };
    expect(detectCommitment(row)).toBeNull();
  });

  it('falls back to payload.body when the top-level body column is absent', () => {
    const row = { payload: { body: '[COMMIT: reply via payload]' } };
    expect(detectCommitment(row)).toEqual({ subject: 'reply via payload', dueBy: null });
  });

  it('returns null for a missing/empty body', () => {
    expect(detectCommitment({})).toBeNull();
    expect(detectCommitment(null)).toBeNull();
  });
});

describe('writeCommitmentIfDeclared (IO, fail-soft)', () => {
  function makeSupabase(insertSpy) {
    return { from: () => ({ insert: insertSpy }) };
  }

  it('TS-5: writes owner_session/counterparty_session/subject/due_by when a commitment is declared', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: [{ id: 'c1' }], error: null });
    const supabase = makeSupabase(insertSpy);
    const row = { sender_session: 'coord-1', target_session: 'worker-1', body: '[COMMIT: do X] by 2026-09-01' };
    await writeCommitmentIfDeclared(supabase, row);
    expect(insertSpy).toHaveBeenCalledWith({
      owner_session: 'coord-1',
      counterparty_session: 'worker-1',
      subject: 'do X',
      due_by: '2026-09-01',
    });
  });

  it('writes nothing when no commitment is declared', async () => {
    const insertSpy = vi.fn();
    const supabase = makeSupabase(insertSpy);
    await writeCommitmentIfDeclared(supabase, { sender_session: 'coord-1', target_session: 'worker-1', body: 'ok thanks' });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('fails soft (never throws) when the insert errors', async () => {
    const insertSpy = vi.fn().mockRejectedValue(new Error('boom'));
    const supabase = makeSupabase(insertSpy);
    const row = { sender_session: 'coord-1', target_session: 'worker-1', body: '[COMMIT: do X]' };
    await expect(writeCommitmentIfDeclared(supabase, row, { warn() {} })).resolves.toBeUndefined();
  });
});

describe('resolveCommitment (FR-5 AC-2: the explicit re-own/drop mechanism)', () => {
  function makeUpdateSupabase({ data = [], error = null } = {}) {
    const chain = {
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      select: vi.fn(async () => ({ data, error })),
    };
    return { from: () => chain, _chain: chain };
  }

  it('updates resolved_at/resolution for an open commitment and returns true', async () => {
    const supabase = makeUpdateSupabase({ data: [{ id: 'c1' }] });
    const result = await resolveCommitment(supabase, 'c1', 're-owned');
    expect(result).toBe(true);
    expect(supabase._chain.update).toHaveBeenCalledWith(expect.objectContaining({ resolution: 're-owned' }));
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('returns false when the commitment is already resolved (0 rows matched)', async () => {
    const supabase = makeUpdateSupabase({ data: [] });
    const result = await resolveCommitment(supabase, 'c1', 'dropped');
    expect(result).toBe(false);
  });

  it('returns false for a missing id or resolution without touching supabase', async () => {
    const supabase = makeUpdateSupabase();
    expect(await resolveCommitment(supabase, null, 'dropped')).toBe(false);
    expect(await resolveCommitment(supabase, 'c1', null)).toBe(false);
    expect(supabase._chain.update).not.toHaveBeenCalled();
  });

  it('fails soft (never throws) when the update errors', async () => {
    const supabase = makeUpdateSupabase({ error: new Error('boom') });
    const result = await resolveCommitment(supabase, 'c1', 'dropped', { warn() {} });
    expect(result).toBe(false);
  });
});
