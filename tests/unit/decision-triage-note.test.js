/**
 * Triage-rationale tests — SD-LEO-INFRA-CHAIRMAN-DECISION-DELIVERY-001.
 * PURE: synthetic decision rows + injected `now`, zero live DB. Proves triageNote surfaces the view's
 * already-computed age-escalation / blocking rationale, and that renderItem appends it WITHOUT disturbing
 * the trailing `[ref(s) decision_type:id]` handle the chairman-decisions CLI depends on (TR-2).
 */
import { describe, it, expect } from 'vitest';
import { triageNote, renderItem, renderDecisionLines, refTag, buildDecisionItems } from '../../lib/chairman/decision-layman.mjs';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

const row = (over = {}) => ({
  id: over.id || 'd1',
  decision_type: over.decision_type || 'flag_review',
  title: over.title || 'A flagged issue',
  priority: over.priority || 'high',
  effective_priority: over.effective_priority || over.priority || 'high',
  age_escalated: over.age_escalated || false,
  blocking: over.blocking || false,
  created_at: over.created_at || daysAgo(1),
  ...over,
});

describe('triageNote — surfaces the view rationale', () => {
  it('age_escalated row → a plain "moved up — waiting ..." reason', () => {
    const note = triageNote(row({ age_escalated: true, created_at: daysAgo(9) }), NOW);
    expect(note).toMatch(/moved up — waiting/i);
    expect(note.startsWith('(') && note.endsWith(')')).toBe(true);
  });

  it('blocking NON-gate row → notes it is blocking', () => {
    const note = triageNote(row({ decision_type: 'chairman_approval', blocking: true }), NOW);
    expect(note).toMatch(/blocking a venture/i);
  });

  it('both escalated AND blocking → combined', () => {
    const note = triageNote(row({ decision_type: 'chairman_approval', age_escalated: true, created_at: daysAgo(4), blocking: true }), NOW);
    expect(note).toMatch(/moved up/i);
    expect(note).toMatch(/blocking/i);
  });

  it('neither escalated nor blocking → empty string (no spurious note)', () => {
    expect(triageNote(row({ age_escalated: false, blocking: false }), NOW)).toBe('');
  });

  it('gate_decision blocking → does NOT add a redundant blocking note (renderItemBase states it inline)', () => {
    // gate_decision item: blocking is shown inline by the base renderer, so triageNote suppresses it.
    const note = triageNote({ type: 'gate_decision', kind: 'single', rows: [row({ decision_type: 'gate_decision', blocking: true })] }, NOW);
    expect(note).toBe('');
  });

  it('gate_decision that is ALSO age-escalated still gets the escalation reason (only blocking is suppressed)', () => {
    const note = triageNote({ type: 'gate_decision', kind: 'single', rows: [row({ decision_type: 'gate_decision', blocking: true, age_escalated: true, created_at: daysAgo(5) })] }, NOW);
    expect(note).toMatch(/moved up/i);
    expect(note).not.toMatch(/blocking a venture/i);
  });

  it('fail-safe: missing/garbage input never throws → empty', () => {
    expect(triageNote(null, NOW)).toBe('');
    expect(triageNote({ rows: [{}] }, NOW)).toBe('');
    expect(() => triageNote(undefined, NOW)).not.toThrow();
  });

  it('grouped rows: counts multiple blocking members', () => {
    const note = triageNote({ type: 'chairman_approval', kind: 'group', rows: [row({ blocking: true }), row({ id: 'd2', blocking: true })] }, NOW);
    expect(note).toMatch(/2 blocking a venture/i);
  });
});

describe('renderItem — appends the rationale, preserves the ref contract (TR-2)', () => {
  it('the rendered line still ENDS WITH the exact ref token (CLI handle preserved)', () => {
    const item = { type: 'flag_review', kind: 'single', rows: [row({ age_escalated: true, created_at: daysAgo(9) })] };
    const line = renderItem(item, NOW);
    const ref = refTag(item.rows);
    expect(line.endsWith(ref)).toBe(true);     // ref stays trailing, byte-identical
    expect(line).toMatch(/moved up — waiting/i); // rationale present, before the ref
    expect(line.indexOf('moved up')).toBeLessThan(line.indexOf(ref));
  });

  it('a non-elevated line is unchanged (no note injected, ref still trailing)', () => {
    const item = { type: 'flag_review', kind: 'single', rows: [row()] };
    const line = renderItem(item, NOW);
    expect(line.endsWith(refTag(item.rows))).toBe(true);
    expect(line).not.toMatch(/moved up|blocking a venture/i);
  });
});

describe('renderDecisionLines — count + grouping preserved', () => {
  it('the decision COUNT is unchanged by the rationale (every underlying row still counted)', () => {
    const rows = [
      row({ id: 'a', decision_type: 'chairman_approval', age_escalated: true, created_at: daysAgo(8) }),
      row({ id: 'b', decision_type: 'chairman_approval' }),
      row({ id: 'c', decision_type: 'flag_review', blocking: true }),
    ];
    const out = renderDecisionLines(rows, NOW);
    expect(out.count).toBe(3);                 // grouping collapses lines but count reflects all rows
    // every line still carries resolvable ref token(s)
    expect(out.lines.every((l) => /\[refs? /.test(l))).toBe(true);
  });
});
