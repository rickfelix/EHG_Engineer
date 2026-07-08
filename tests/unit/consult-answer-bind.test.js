/**
 * SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001 FR-4 — consult-answer-bind.mjs
 */
import { describe, it, expect } from 'vitest';
import { bindConsultAnswer } from '../../scripts/consult-answer-bind.mjs';

function makeFakeSupabase({ initialSdMetadata = {} } = {}) {
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
            eq: () => {
              sdMetadata = patch.metadata;
              return Promise.resolve({ error: null });
            },
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
});
