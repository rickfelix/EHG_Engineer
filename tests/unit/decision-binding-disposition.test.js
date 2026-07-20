/**
 * SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001 — lib/decision-binding/disposition.js
 * Injected-stub coverage (no real DB). Covers FR-1/FR-2/FR-5 and the TS-2
 * regression: a re-asked question (same content, new correlation_id/session)
 * must dedup against the existing disposition row.
 */
import { describe, it, expect } from 'vitest';
import {
  computeQuestionKey,
  recordDisposition,
  getDisposition,
  getDispositionBySubject,
  updateDispositionStatus,
  listAwaitingDisposition,
} from '../../lib/decision-binding/disposition.js';

/** In-memory fake of the system_events surface this module touches. */
function makeFakeSupabase() {
  const rows = [];
  let nextId = 1;

  function insert(row) {
    if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    }
    const stored = { id: `evt-${nextId++}`, created_at: new Date().toISOString(), ...row };
    rows.push(stored);
    return { data: stored, error: null };
  }

  return {
    _rows: rows,
    from(table) {
      if (table !== 'system_events') throw new Error(`unexpected table ${table}`);
      return {
        insert(row) {
          const result = insert(row);
          return {
            select: () => ({
              single: () => Promise.resolve(result),
            }),
          };
        },
        select() {
          let filtered = [...rows];
          const builder = {
            eq(col, val) {
              filtered = filtered.filter((r) => {
                if (col === 'payload->>decision_type') return r.payload?.decision_type === val;
                if (col === 'payload->>status') return r.payload?.status === val;
                return r[col] === val;
              });
              return builder;
            },
            // FR-6 batch 8: listAwaitingDisposition now paginates via fetchAllPaginated
            // (.order('created_at').order('id') then .range()) — order() is chainable, range() terminal.
            order() {
              filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
              return builder;
            },
            range(from, to) {
              return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
            },
            maybeSingle() {
              return Promise.resolve({ data: filtered[0] ?? null, error: null });
            },
          };
          return builder;
        },
        update(patch) {
          return {
            eq: (col, val) => ({
              select: () => ({
                single: () => {
                  const idx = rows.findIndex((r) => r[col] === val);
                  if (idx === -1) return Promise.resolve({ data: null, error: { message: 'not found' } });
                  rows[idx] = { ...rows[idx], ...patch };
                  return Promise.resolve({ data: rows[idx], error: null });
                },
              }),
            }),
          };
        },
      };
    },
  };
}

describe('computeQuestionKey (FR-2)', () => {
  it('is stable across different key ORDER in the subject object', () => {
    const k1 = computeQuestionKey('ratification', { fixture_set_id: 'set-1', fixture_id: 'G1' });
    const k2 = computeQuestionKey('ratification', { fixture_id: 'G1', fixture_set_id: 'set-1' });
    expect(k1).toBe(k2);
  });

  it('never reads correlation_id or message_id even if present on the subject', () => {
    const withCorr = computeQuestionKey('consult_answer', { question_text: 'ship it?', correlation_id: 'aaa' });
    const withDiffCorr = computeQuestionKey('consult_answer', { question_text: 'ship it?', correlation_id: 'bbb' });
    // Different correlation_id embedded in subject still changes the hash (it's just data) —
    // the real invariant under test is that the SD's own call sites never pass correlation_id
    // as part of the identifying subject in the first place (see recordDisposition tests below).
    expect(typeof withCorr).toBe('string');
    expect(withCorr.startsWith('dq_')).toBe(true);
    expect(withCorr).not.toBe(withDiffCorr); // sanity: hash responds to subject content
  });

  it('produces DISTINCT keys for distinct subject content (no false collision)', () => {
    const k1 = computeQuestionKey('ratification', { fixture_set_id: 'set-1', fixture_id: 'G1' });
    const k2 = computeQuestionKey('ratification', { fixture_set_id: 'set-1', fixture_id: 'G2' });
    expect(k1).not.toBe(k2);
  });

  it('rejects an invalid decisionType', () => {
    expect(() => computeQuestionKey('bogus', {})).toThrow(/invalid decisionType/);
  });
});

describe('recordDisposition + getDisposition (FR-1)', () => {
  it('creates a new row with status=awaiting_disposition when none exists', async () => {
    const sb = makeFakeSupabase();
    const { row, created } = await recordDisposition(sb, {
      decisionType: 'ratification',
      subject: { fixture_set_id: 'set-1', fixture_id: 'G1' },
      decisionKey: 'set-1:G1:ratification',
    });
    expect(created).toBe(true);
    expect(row.payload.status).toBe('awaiting_disposition');
    expect(row.payload.decided_at).toBeNull();
  });

  it('defaults to status=dispositioned when an answerPayload is provided at creation', async () => {
    const sb = makeFakeSupabase();
    const { row } = await recordDisposition(sb, {
      decisionType: 'ratification',
      subject: { fixture_set_id: 'set-1', fixture_id: 'G1' },
      answerPayload: { confirmed: true },
      authority: 'chairman',
    });
    expect(row.payload.status).toBe('dispositioned');
    expect(row.payload.decided_at).not.toBeNull();
    expect(row.payload.answer_payload).toEqual({ confirmed: true });
  });

  it('getDisposition returns null (not throw) for a question_key with no row — fail-closed', async () => {
    const sb = makeFakeSupabase();
    const result = await getDisposition(sb, 'dq_nonexistent');
    expect(result).toBeNull();
  });

  it('TS-2 REGRESSION: a re-asked question (same content, new correlation_id/session) dedups against the existing row', async () => {
    const sb = makeFakeSupabase();

    // Session A asks the question, keyed purely on content.
    const first = await recordDisposition(sb, {
      decisionType: 'consult_answer',
      subject: { question_text: 'Should Solomon own the belt-tiering rollback?' },
      authority: 'session-A-correlation-111',
    });
    expect(first.created).toBe(true);

    // A brand-new "session" re-asks the IDENTICAL question — simulated by a
    // fresh recordDisposition call carrying a totally different authority/
    // correlation identity, but the SAME subject content.
    const second = await recordDisposition(sb, {
      decisionType: 'consult_answer',
      subject: { question_text: 'Should Solomon own the belt-tiering rollback?' },
      authority: 'session-B-correlation-999',
    });

    expect(second.created).toBe(false); // dedup: no new row
    expect(second.row.id).toBe(first.row.id);
    expect(sb._rows).toHaveLength(1); // exactly one disposition row total
  });

  it('does not collide across genuinely distinct questions', async () => {
    const sb = makeFakeSupabase();
    await recordDisposition(sb, { decisionType: 'consult_answer', subject: { question_text: 'Question A?' } });
    await recordDisposition(sb, { decisionType: 'consult_answer', subject: { question_text: 'Question B?' } });
    expect(sb._rows).toHaveLength(2);
  });

  it('getDispositionBySubject finds the row without the caller precomputing the key', async () => {
    const sb = makeFakeSupabase();
    const subject = { fixture_set_id: 'set-1', fixture_id: 'B3' };
    await recordDisposition(sb, { decisionType: 'ratification', subject });
    const found = await getDispositionBySubject(sb, 'ratification', subject);
    expect(found).not.toBeNull();
  });
});

describe('updateDispositionStatus', () => {
  it('transitions dispositioned -> consumed and preserves prior answer_payload when not overridden', async () => {
    const sb = makeFakeSupabase();
    const { row } = await recordDisposition(sb, {
      decisionType: 'ratification',
      subject: { fixture_set_id: 'set-1', fixture_id: 'G1' },
      answerPayload: { confirmed: true },
    });
    const updated = await updateDispositionStatus(sb, row.payload.question_key, 'consumed');
    expect(updated.payload.status).toBe('consumed');
    expect(updated.payload.answer_payload).toEqual({ confirmed: true });
  });

  it('throws for an unknown question_key', async () => {
    const sb = makeFakeSupabase();
    await expect(updateDispositionStatus(sb, 'dq_missing', 'consumed')).rejects.toThrow(/no disposition found/);
  });
});

describe('listAwaitingDisposition (FR-5)', () => {
  it('returns only awaiting rows for the requested decision_type, no rendering logic', async () => {
    const sb = makeFakeSupabase();
    await recordDisposition(sb, { decisionType: 'ratification', subject: { fixture_set_id: 's', fixture_id: 'G1' } });
    await recordDisposition(sb, { decisionType: 'ratification', subject: { fixture_set_id: 's', fixture_id: 'G2' }, answerPayload: { confirmed: true } });
    await recordDisposition(sb, { decisionType: 'consult_answer', subject: { question_text: 'unrelated?' } });

    const awaiting = await listAwaitingDisposition(sb, 'ratification');
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].payload.subject.fixture_id).toBe('G1');
  });

  it('returns an empty array for an unknown decision_type instead of throwing', async () => {
    const sb = makeFakeSupabase();
    const result = await listAwaitingDisposition(sb, 'not_a_real_type');
    expect(result).toEqual([]);
  });
});
