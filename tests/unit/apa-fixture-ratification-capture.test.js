/**
 * SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001 FR-3 — apa-fixture-ratification-capture.mjs
 */
import { describe, it, expect } from 'vitest';
import { captureRatifications } from '../../scripts/apa-fixture-ratification-capture.mjs';

function makeFakeSupabase() {
  const rows = [];
  let nextId = 1;
  return {
    _rows: rows,
    from(table) {
      if (table !== 'system_events') throw new Error(`unexpected table ${table}`);
      return {
        insert(row) {
          return {
            select: () => ({
              single: () => {
                if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
                  return Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
                }
                const stored = { id: `evt-${nextId++}`, created_at: new Date().toISOString(), ...row };
                rows.push(stored);
                return Promise.resolve({ data: stored, error: null });
              },
            }),
          };
        },
        select() {
          let filtered = [...rows];
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
    },
  };
}

describe('captureRatifications (FR-3)', () => {
  it('records a dispositioned row per confirmed and per flagged fixture', async () => {
    const sb = makeFakeSupabase();
    const results = await captureRatifications(sb, {
      fixtureSet: 'apa-calibration-2026-07-08',
      confirmed: ['G1', 'G2'],
      flagged: ['G3'],
      authority: 'chairman',
    });
    expect(results).toHaveLength(3);
    expect(sb._rows).toHaveLength(3);
    const g3 = sb._rows.find((r) => r.payload.subject.fixture_id === 'G3');
    expect(g3.payload.answer_payload).toEqual({ confirmed: false, flagged: true });
    const g1 = sb._rows.find((r) => r.payload.subject.fixture_id === 'G1');
    expect(g1.payload.answer_payload).toEqual({ confirmed: true, flagged: false });
    expect(g1.payload.status).toBe('dispositioned');
  });

  it('is idempotent: re-running with the same fixture-set + fixture_id dedups instead of duplicating', async () => {
    const sb = makeFakeSupabase();
    await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: ['G1'], flagged: [], authority: 'chairman' });
    const second = await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: ['G1'], flagged: [], authority: 'chairman' });
    expect(sb._rows).toHaveLength(1);
    expect(second[0].created).toBe(false);
  });

  it('keys distinct fixture-sets independently (no cross-set collision)', async () => {
    const sb = makeFakeSupabase();
    await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: ['G1'], flagged: [], authority: 'a' });
    await captureRatifications(sb, { fixtureSet: 'set-2', confirmed: ['G1'], flagged: [], authority: 'a' });
    expect(sb._rows).toHaveLength(2);
  });

  it('reports the ACTUAL stored verdict (not the caller-intended one) when a re-run contradicts a prior disposition', async () => {
    const sb = makeFakeSupabase();
    await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: [], flagged: ['G3'], authority: 'chairman' });
    // Chairman changes his mind: G3 is now re-run as confirmed. recordDisposition never
    // overwrites, so the stored row is still the ORIGINAL flagged decision.
    const second = await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: ['G3'], flagged: [], authority: 'chairman' });
    expect(sb._rows).toHaveLength(1); // no duplicate row
    expect(second[0].verdict).toBe('flagged'); // reports the TRUE stored verdict, not "confirmed"
    expect(second[0].contradicted).toBe(true);
  });

  it('does not flag contradicted when the re-run verdict matches the stored one', async () => {
    const sb = makeFakeSupabase();
    await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: ['G1'], flagged: [], authority: 'chairman' });
    const second = await captureRatifications(sb, { fixtureSet: 'set-1', confirmed: ['G1'], flagged: [], authority: 'chairman' });
    expect(second[0].verdict).toBe('confirmed');
    expect(second[0].contradicted).toBe(false);
  });
});
