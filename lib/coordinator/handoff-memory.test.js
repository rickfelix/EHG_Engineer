import { describe, it, expect } from 'vitest';
const { normalizeItem, normalizeHandoffMemory, ITEM_KINDS } = require('./handoff-memory.cjs');

describe('handoff-memory.cjs normalizeHandoffMemory (TS-1)', () => {
  it('tolerates null/undefined/garbage input, returns a valid empty-items shape', () => {
    for (const bad of [null, undefined, 'garbage', 42, [], true]) {
      const hm = normalizeHandoffMemory(bad, { nowMs: 1000 });
      expect(Array.isArray(hm.items)).toBe(true);
      expect(hm.items.length).toBe(0);
      expect(typeof hm.captured_at).toBe('string');
      expect(hm.predecessor_session_id).toBeNull();
    }
  });

  it('preserves a well-formed item including session_coordination_row_id (round trip)', () => {
    const input = {
      items: [{ kind: 'reply_owed', correlation_id: 'c1', session_coordination_row_id: 'row-123', counterpart: 'coordinator', summary: 'was about to reply', opened_at: '2026-07-02T10:00:00Z' }],
      predecessor_session_id: 'sess-old',
    };
    const hm = normalizeHandoffMemory(input, { nowMs: 5000 });
    expect(hm.items).toHaveLength(1);
    expect(hm.items[0]).toEqual({
      kind: 'reply_owed',
      correlation_id: 'c1',
      session_coordination_row_id: 'row-123',
      counterpart: 'coordinator',
      summary: 'was about to reply',
      opened_at: '2026-07-02T10:00:00Z',
    });
    expect(hm.predecessor_session_id).toBe('sess-old');
  });

  it('drops items with no usable summary/description', () => {
    const hm = normalizeHandoffMemory({ items: [{ kind: 'consult' }, { summary: '  ' }] });
    expect(hm.items).toHaveLength(0);
  });

  it('defaults an unrecognized kind to reasoning_context', () => {
    const hm = normalizeHandoffMemory({ items: [{ kind: 'not-a-real-kind', summary: 'x' }] });
    expect(hm.items[0].kind).toBe('reasoning_context');
    expect(ITEM_KINDS).toContain('reasoning_context');
  });
});

describe('handoff-memory.cjs normalizeItem', () => {
  it('returns null for non-object input', () => {
    expect(normalizeItem(null)).toBeNull();
    expect(normalizeItem('x')).toBeNull();
  });
});
