/**
 * QF-20260830-628 — writer-side upsert fix for lib/chairman/ratification-capture-detector.mjs.
 * Bug: persistRow was a bare insert; a re-evaluation of the same corpus item every sweep cycle
 * appended a new feedback row instead of bumping occurrence_count/last_seen on the existing one
 * (~13.7k accumulated rows across ratification_capture_candidate + ratification_capture_miss).
 */
import { describe, it, expect } from 'vitest';
import { detectCaptureMisses } from '../../../lib/chairman/ratification-capture-detector.mjs';

function makeFakeSupabase({ sessionCoordination = [], chairmanDecisions = [] } = {}) {
  const feedbackRows = [];
  let nextId = 1;
  return {
    _feedbackRows: feedbackRows,
    from(table) {
      if (table === 'session_coordination') {
        return {
          select: () => ({
            in: () => ({
              gte: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: sessionCoordination, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: chairmanDecisions, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'feedback') {
        return {
          select() {
            const filters = {};
            const builder = {
              eq(col, val) {
                filters[col] = val;
                return builder;
              },
              limit() {
                return builder;
              },
              maybeSingle() {
                const match = feedbackRows.find(
                  (r) => r.source_id === filters.source_id && r.category === filters.category
                );
                return Promise.resolve({ data: match || null, error: null });
              },
            };
            return builder;
          },
          insert(row) {
            const stored = { id: `fb-${nextId++}`, ...row };
            feedbackRows.push(stored);
            return Promise.resolve({ error: null });
          },
          update(patch) {
            return {
              eq(col, val) {
                const target = feedbackRows.find((r) => r[col] === val);
                if (target) Object.assign(target, patch);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const CANDIDATE_ITEM = {
  id: 'msg-1',
  payload: { kind: 'adam_advisory' },
  subject: 'The chairman ruled on this',
  body: 'no named target here',
  created_at: '2026-08-30T00:00:00Z',
};

describe('ratification-capture-detector writer upsert (QF-20260830-628)', () => {
  it('two-sided: same message evaluated twice yields ONE row with occurrence_count=2, a new message still inserts', async () => {
    const sb = makeFakeSupabase({ sessionCoordination: [CANDIDATE_ITEM] });

    const first = await detectCaptureMisses(sb, 24);
    expect(first.candidates).toHaveLength(1);
    expect(sb._feedbackRows).toHaveLength(1);
    expect(sb._feedbackRows[0].occurrence_count).toBe(1);

    // Same message, re-evaluated on the next sweep cycle (unchanged corpus).
    const second = await detectCaptureMisses(sb, 24);
    expect(second.candidates).toHaveLength(1);
    expect(sb._feedbackRows).toHaveLength(1); // no new row appended
    expect(sb._feedbackRows[0].occurrence_count).toBe(2);
    expect(sb._feedbackRows[0].last_seen).toBeTruthy();

    // A genuinely new message still inserts as its own row.
    const newItem = { ...CANDIDATE_ITEM, id: 'msg-2' };
    const sb2 = makeFakeSupabase({ sessionCoordination: [CANDIDATE_ITEM, newItem] });
    // Seed sb2 with the already-persisted msg-1 row to simulate accumulated state.
    sb2._feedbackRows.push({ ...sb._feedbackRows[0] });
    await detectCaptureMisses(sb2, 24);
    expect(sb2._feedbackRows).toHaveLength(2);
    const ids = sb2._feedbackRows.map((r) => r.source_id);
    expect(ids).toContain('adam_advisory:msg-1');
    expect(ids).toContain('adam_advisory:msg-2');
  });

  it('regression: one full cycle on an unchanged population adds zero net rows', async () => {
    const sb = makeFakeSupabase({ sessionCoordination: [CANDIDATE_ITEM] });
    await detectCaptureMisses(sb, 24);
    const countAfterFirst = sb._feedbackRows.length;
    await detectCaptureMisses(sb, 24);
    await detectCaptureMisses(sb, 24);
    expect(sb._feedbackRows.length).toBe(countAfterFirst);
  });
});
