/**
 * SD-LEO-INFRA-OPEN-COMMITMENTS-RECONCILED-001 / FR-3 — commitment-writer hook.
 */
import { describe, it, expect, vi } from 'vitest';
import { detectCommitment, writeCommitmentIfDeclared } from '../../../lib/coordinator/commitment-writer.cjs';

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
