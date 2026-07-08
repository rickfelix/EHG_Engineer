/**
 * SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001 FR-4 — consult-answer-bind.mjs
 */
import { describe, it, expect } from 'vitest';
import { bindConsultAnswer } from '../../scripts/consult-answer-bind.mjs';

function makeFakeSupabase({ initialSdMetadata = {}, knownSdKeys = ['SD-TEST-001'] } = {}) {
  const events = [];
  let sdMetadata = { ...initialSdMetadata };
  let nextId = 1;
  return {
    _events: events,
    _sdMetadata: () => sdMetadata,
    from(table) {
      if (table === 'system_events') {
        return {
          insert(row) {
            return {
              select: () => ({
                single: () => {
                  if (events.some((r) => r.idempotency_key === row.idempotency_key)) {
                    return Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
                  }
                  const stored = { id: `evt-${nextId++}`, created_at: new Date().toISOString(), ...row };
                  events.push(stored);
                  return Promise.resolve({ data: stored, error: null });
                },
              }),
            };
          },
          select() {
            let filtered = [...events];
            const builder = {
              eq(col, val) {
                filtered = filtered.filter((r) => r[col] === val);
                return builder;
              },
              maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
            };
            return builder;
          },
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { metadata: sdMetadata }, error: null }),
            }),
          }),
          update: (patch) => ({
            eq: (col, val) => ({
              select: () => {
                if (!knownSdKeys.includes(val)) {
                  return Promise.resolve({ data: [], error: null }); // zero-row-match simulation
                }
                sdMetadata = patch.metadata;
                return Promise.resolve({ data: [{ sd_key: val }], error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('bindConsultAnswer (FR-4)', () => {
  it('records a disposition AND flips the named SD-metadata blocked-state field in one call', async () => {
    const sb = makeFakeSupabase({ initialSdMetadata: { blocked_on_solomon_consult: true, unrelated: 'x' } });
    const result = await bindConsultAnswer(sb, {
      sdKey: 'SD-TEST-001',
      blockedStateKey: 'blocked_on_solomon_consult',
      questionText: 'Should Solomon own the belt-tiering rollback?',
      answer: 'Yes, Solomon owns it.',
      authority: 'solomon',
    });
    expect(result.sdUpdated).toBe(true);
    expect(sb._sdMetadata().blocked_on_solomon_consult).toBe(false);
    expect(sb._sdMetadata().unrelated).toBe('x'); // untouched fields preserved
    expect(sb._sdMetadata().blocked_on_solomon_consult_disposition_question_key).toBe(result.disposition.payload.question_key);
  });

  it('TS-2-style REGRESSION: re-asking the identical question in a fresh call dedups against the same disposition', async () => {
    const sb = makeFakeSupabase({ initialSdMetadata: { blocked_on_x: true } });
    const first = await bindConsultAnswer(sb, {
      sdKey: 'SD-TEST-001', blockedStateKey: 'blocked_on_x',
      questionText: 'Ship it?', answer: 'Yes', authority: 'session-A',
    });
    const second = await bindConsultAnswer(sb, {
      sdKey: 'SD-TEST-001', blockedStateKey: 'blocked_on_x',
      questionText: 'Ship it?', answer: 'Yes (re-delivered)', authority: 'session-B',
    });
    expect(sb._events).toHaveLength(1);
    expect(second.disposition.id).toBe(first.disposition.id);
  });

  it('throws when required args are missing', async () => {
    const sb = makeFakeSupabase();
    await expect(bindConsultAnswer(sb, { sdKey: 'SD-TEST-001' })).rejects.toThrow(/blockedStateKey/);
  });

  it('throws instead of silently succeeding when the metadata update matches 0 rows (stale/mismatched sd_key)', async () => {
    const sb = makeFakeSupabase({ knownSdKeys: [] }); // no SD matches -- simulates a stale sd_key
    await expect(bindConsultAnswer(sb, {
      sdKey: 'SD-DOES-NOT-EXIST-001', blockedStateKey: 'blocked_on_x',
      questionText: 'Ship it?', answer: 'Yes', authority: 'session-A',
    })).rejects.toThrow(/matched 0 rows/);
  });

  it('scopes question_key by (sdKey, blockedStateKey) so two DIFFERENT SDs asking an identically-worded question do NOT collide', async () => {
    const sb = makeFakeSupabase({ knownSdKeys: ['SD-A-001', 'SD-B-001'] });
    const forA = await bindConsultAnswer(sb, {
      sdKey: 'SD-A-001', blockedStateKey: 'blocked_on_x',
      questionText: 'Should we proceed?', answer: 'Yes for A', authority: 'solomon',
    });
    const forB = await bindConsultAnswer(sb, {
      sdKey: 'SD-B-001', blockedStateKey: 'blocked_on_x',
      questionText: 'Should we proceed?', answer: 'Yes for B', authority: 'solomon',
    });
    expect(sb._events).toHaveLength(2); // two DISTINCT disposition rows, not deduped
    expect(forA.disposition.id).not.toBe(forB.disposition.id);
    expect(forA.disposition.payload.answer_payload.answer).toBe('Yes for A');
    expect(forB.disposition.payload.answer_payload.answer).toBe('Yes for B');
  });
});
