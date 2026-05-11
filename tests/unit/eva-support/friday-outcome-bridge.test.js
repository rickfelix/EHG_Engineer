/**
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-5, FR-3, FR-6, TEST-7, US-006
 *
 * Unit tests for lib/eva-support/friday-outcome-bridge.js — surfacePending CAS,
 * writeOutcome happy path / bad input, renderPushbackMarkdown.
 */

import { describe, it, expect, vi } from 'vitest';
import { surfacePending, writeOutcome, renderPushbackMarkdown } from '../../../lib/eva-support/friday-outcome-bridge.js';

function fakeClient({ readRows, readError, updateRows, updateError, insertResult, insertError } = {}) {
  const c = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve({ data: readRows ?? null, error: readError ?? null })),
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: insertResult ?? null, error: insertError ?? null }),
  };
  // For update().in().is().select(): provide a separate await target.
  // Chain ends with .select() which resolves.
  c._afterUpdate = vi.fn().mockImplementation(() => Promise.resolve({ data: updateRows ?? null, error: updateError ?? null }));
  c.select = vi.fn().mockImplementation(function (...args) {
    if (c.update.mock.calls.length > 0 && c.in.mock.calls.length > 0) {
      // We're in the post-update chain; return the await result.
      return c._afterUpdate();
    }
    return c;
  });
  return c;
}

describe('surfacePending', () => {
  it('returns surfaced rows that the CAS update successfully claimed', async () => {
    const rows = [
      { outcome_id: 'a', agenda_item_ref: 'item-1', outcome: 'accepted', chairman_feedback: null, meeting_date: '2026-05-09', created_at: '2026-05-09T10:00:00Z' },
      { outcome_id: 'b', agenda_item_ref: 'item-2', outcome: 'deferred', chairman_feedback: 'next week', meeting_date: '2026-05-09', created_at: '2026-05-09T10:01:00Z' },
    ];
    const client = fakeClient({ readRows: rows, updateRows: [{ outcome_id: 'a' }, { outcome_id: 'b' }] });
    const result = await surfacePending({ client });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.outcome_id)).toEqual(['a', 'b']);
  });

  it('returns empty array on read error (fail-soft)', async () => {
    const client = fakeClient({ readError: { code: '42501', message: 'permission denied' } });
    const result = await surfacePending({ client });
    expect(result).toEqual([]);
  });

  it('returns empty array on schema-cache miss', async () => {
    const client = fakeClient({ readError: { code: 'PGRST205', message: 'Could not find the table' } });
    const result = await surfacePending({ client });
    expect(result).toEqual([]);
  });

  it('returns empty when no unconsumed rows exist', async () => {
    const client = fakeClient({ readRows: [] });
    const result = await surfacePending({ client });
    expect(result).toEqual([]);
  });

  it('filters out rows that lost the CAS race (parallel-safety)', async () => {
    const rows = [
      { outcome_id: 'a', agenda_item_ref: 'item-1', outcome: 'accepted', meeting_date: '2026-05-09' },
      { outcome_id: 'b', agenda_item_ref: 'item-2', outcome: 'deferred', meeting_date: '2026-05-09' },
    ];
    // Only 'a' was claimed by this caller; 'b' was claimed by another session.
    const client = fakeClient({ readRows: rows, updateRows: [{ outcome_id: 'a' }] });
    const result = await surfacePending({ client });
    expect(result).toHaveLength(1);
    expect(result[0].outcome_id).toBe('a');
  });
});

describe('writeOutcome', () => {
  it('writes an outcome row on valid input', async () => {
    const client = fakeClient({ insertResult: { outcome_id: 'new-uuid-1' } });
    const result = await writeOutcome({ agendaItemRef: 'recommendation #1', outcome: 'accepted', meetingDate: '2026-05-09', client });
    expect(result.written).toBe(true);
    expect(result.outcome_id).toBe('new-uuid-1');
  });

  it('rejects invalid outcome enum', async () => {
    const client = fakeClient({});
    const result = await writeOutcome({ agendaItemRef: 'x', outcome: 'invalid-outcome', client });
    expect(result.written).toBe(false);
    expect(result.error.code).toBe('BAD_OUTCOME');
  });

  it('rejects missing agendaItemRef', async () => {
    const client = fakeClient({});
    const result = await writeOutcome({ outcome: 'accepted', client });
    expect(result.written).toBe(false);
    expect(result.error.code).toBe('BAD_INPUT');
  });

  it('fail-soft on schema-cache miss', async () => {
    const client = fakeClient({ insertError: { code: 'PGRST205', message: 'Could not find the table' } });
    const result = await writeOutcome({ agendaItemRef: 'x', outcome: 'accepted', client });
    expect(result.written).toBe(false);
  });
});

describe('renderPushbackMarkdown', () => {
  it('returns empty string for zero rows (silent skip)', () => {
    expect(renderPushbackMarkdown([])).toBe('');
    expect(renderPushbackMarkdown(null)).toBe('');
  });

  it('renders each outcome as a bullet with feedback inlined when present', () => {
    const md = renderPushbackMarkdown([
      { outcome: 'accepted', meeting_date: '2026-05-09', agenda_item_ref: 'item-1', chairman_feedback: 'go for it' },
      { outcome: 'rejected', meeting_date: '2026-05-09', agenda_item_ref: 'item-2', chairman_feedback: null },
    ]);
    expect(md).toContain('## Friday meeting outcomes');
    expect(md).toContain('**ACCEPTED** (2026-05-09): item-1 — go for it');
    expect(md).toContain('**REJECTED** (2026-05-09): item-2');
    expect(md).not.toMatch(/item-2 — null/);
  });
});
