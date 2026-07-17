/**
 * Unit tests — SD-LEO-FIX-SOLOMON-MULTI-PART-001
 * lib/coordinator/multi-part-reply.cjs
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parsePartMarker, groupMultiPartAdvisories, reassembleGroupBody } = require('../../../lib/coordinator/multi-part-reply.cjs');

describe('parsePartMarker', () => {
  it('returns null for a subject with no N/M pattern', () => {
    expect(parsePartMarker('[SOLOMON_ORACLE] [oracle] SHAPE VERDICT (ref your relay fc0c082f)')).toBeNull();
  });

  it('extracts {prefix, index, total} from a bracket-tagged multi-part subject', () => {
    const marker = parsePartMarker('[SOLOMON_ORACLE] [oracle] COMMISSION VERDICT 1/2 — roadmap-anchored retro as scheduled Adam duty');
    expect(marker).toEqual({ prefix: 'commission verdict', index: 1, total: 2 });
  });

  it('extracts the same prefix from the sibling part-2 subject despite diverging trailing text', () => {
    const marker = parsePartMarker('[SOLOMON_ORACLE] [oracle] COMMISSION VERDICT 2/2 — CLEAN-CORRELATION DELIVERY (part 2 of my answer)');
    expect(marker).toEqual({ prefix: 'commission verdict', index: 2, total: 2 });
  });

  it('returns null for a garbage index/total (index > total)', () => {
    expect(parsePartMarker('VERDICT 3/2')).toBeNull();
  });

  it('handles a subject with no bracket tags at all', () => {
    expect(parsePartMarker('COMMISSION VERDICT 1/2 plain')).toEqual({ prefix: 'commission verdict', index: 1, total: 2 });
  });
});

describe('groupMultiPartAdvisories', () => {
  const base = { target_session: 'coord-1', sender_session: 'solomon-1' };

  it('groups two parts sharing (target_session, sender_session, prefix, total), ordered by index even when arriving out of order', () => {
    const rows = [
      { ...base, id: 'row-2', subject: 'COMMISSION VERDICT 2/2 — CLEAN-CORRELATION DELIVERY', body: 'second half', created_at: '2026-07-17T13:16:12Z' },
      { ...base, id: 'row-1', subject: 'COMMISSION VERDICT 1/2 — roadmap-anchored retro', body: 'first half', created_at: '2026-07-17T13:15:12Z' },
    ];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups).toHaveLength(1);
    const [g] = groups;
    expect(g.isMultiPart).toBe(true);
    expect(g.isComplete).toBe(true);
    expect(g.total).toBe(2);
    expect(g.rows.map((r) => r.id)).toEqual(['row-1', 'row-2']); // ordered by index, not created_at
    expect(g.memberIds).toEqual(['row-1', 'row-2']);
    expect(g.id).toBe('row-2'); // anchored on the LAST part
    expect(g.body).toBe('first half\n\nsecond half');
  });

  it('never merges rows sharing a subject prefix but a different target_session', () => {
    const rows = [
      { id: 'a', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 1/2', body: 'a' },
      { id: 'b', target_session: 'coord-2', sender_session: 'solomon-1', subject: 'VERDICT 2/2', body: 'b' },
    ];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.isMultiPart || g.rows.length === 1)).toBe(true);
  });

  it('never merges rows sharing a subject prefix but a different sender_session', () => {
    const rows = [
      { id: 'a', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 1/2', body: 'a' },
      { id: 'b', target_session: 'coord-1', sender_session: 'solomon-2', subject: 'VERDICT 2/2', body: 'b' },
    ];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups).toHaveLength(2);
  });

  it('marks a group isComplete=false when fewer than "total" distinct indices have arrived, tracking which indices ARE present', () => {
    const rows = [{ ...base, id: 'row-1', subject: 'VERDICT 1/3', body: 'only part' }];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups[0].isComplete).toBe(false);
    expect(groups[0].total).toBe(3);
    expect(groups[0].memberIds).toEqual(['row-1']);
    expect(groups[0].presentIndices).toEqual([1]); // caller can diff against 1..total to name missing parts
  });

  it('passes a marker-less row through as its own singleton group', () => {
    const rows = [{ ...base, id: 'row-1', subject: 'SHAPE VERDICT (no marker)', body: 'plain reply' }];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'row-1', memberIds: ['row-1'], isMultiPart: false, isComplete: true, total: 1, body: 'plain reply' });
  });

  it('reads body from payload.body when the body column is absent', () => {
    const rows = [{ ...base, id: 'row-1', subject: 'PLAIN', payload: { body: 'from payload' } }];
    const groups = groupMultiPartAdvisories(rows);
    expect(groups[0].body).toBe('from payload');
  });

  it('handles an empty input array', () => {
    expect(groupMultiPartAdvisories([])).toEqual([]);
  });
});

describe('reassembleGroupBody', () => {
  it('joins parts in the given order, dropping blanks', () => {
    const rows = [{ body: 'first' }, { body: '' }, { body: 'second' }];
    expect(reassembleGroupBody(rows)).toBe('first\n\nsecond');
  });
});
