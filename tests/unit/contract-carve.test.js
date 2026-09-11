/**
 * lib/protocol/contract-carve.mjs — SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 (FR-2/FR-3/FR-4).
 *
 * The carve helper is what both one-off split scripts run their moves through, so its two
 * load-bearing properties are pinned here: (1) a marker header is never touched — a cut starts at
 * `from`, which by convention sits after the header — and (2) applying a landed move again is a
 * no-op (the companion heading is the applied-marker), so a re-run can never double-carve or
 * double-pointer a clause.
 */
import { describe, it, expect } from 'vitest';
import { applyMove, applyMoves, appendToCompanion, headingFor, pointerRef } from '../../lib/protocol/contract-carve.mjs';

const TAG = 'TEST carve';
const HEADER = '- **RULE HEADER (ratification 0123abcd)** — ';
const CLAUSE = `${HEADER}Chairman verbatim: "quoted words". Binding: do the thing. (Ratification 0123abcd.)`;
const CONTENT = `## Section\n\n${CLAUSE}\n- **OTHER (ratification ffffffff)** — untouched line.\n`;

describe('pointerRef', () => {
  it('cites the ratification id(s) when the name carries them, else the name', () => {
    expect(pointerRef('Root-cause directive (b1055808)')).toBe('b1055808');
    expect(pointerRef('Slot-update (63ff6ef2 + 574d44ed)')).toBe('63ff6ef2 + 574d44ed');
    expect(pointerRef('Ceremony (813243f0, c353f95f)')).toBe('813243f0, c353f95f');
    expect(pointerRef('Web research — HOW and the ladder')).toBe('Web research — HOW and the ladder');
  });
});

describe('applyMove', () => {
  const move = { section: 1, name: 'Rule header — verbatim (0123abcd)', key: 'ratification 0123abcd)** —', cuts: [
    { from: 'Chairman verbatim: "quoted words". ', to: 'Binding:' },
  ] };

  it('removes exactly [from, to), keeps the header byte-identical and adds a site pointer before the ceremony tail', () => {
    const r = applyMove(CONTENT, move, { provenance: '', manual: '' }, TAG);
    expect(r.applied).toBe(true);
    expect(r.content).toContain(HEADER);
    expect(r.content).not.toContain('quoted words');
    expect(r.content).toContain('Binding: do the thing. (provenance: PROVENANCE § 0123abcd) (Ratification 0123abcd.)');
    expect(r.content).toContain('- **OTHER (ratification ffffffff)** — untouched line.');
    expect(r.removed.provenance).toEqual(['Chairman verbatim: "quoted words".']);
  });

  it('`to: null` cuts to the end of the line only', () => {
    const r = applyMove(CONTENT, { ...move, cuts: [{ from: 'Chairman verbatim', to: null, with: 'binding half.' }] }, { provenance: '', manual: '' }, TAG);
    expect(r.content).toContain(`${HEADER}binding half. (provenance: PROVENANCE § 0123abcd)`);
    expect(r.content).toContain('- **OTHER (ratification ffffffff)** — untouched line.');
  });

  it('is a no-op once the companion carries the move heading (idempotent by construction)', () => {
    const companions = { provenance: appendToCompanion('', move.name, ['x'], TAG), manual: '' };
    const r = applyMove(CONTENT, move, companions, TAG);
    expect(r.applied).toBe(false);
    expect(r.content).toBe(CONTENT);
  });

  it('places the pointer under a heading key as its own line, never inside the heading', () => {
    const r = applyMove(CONTENT, { section: 1, name: 'Section — elaborations', key: '## Section', cuts: [{ from: 'Chairman verbatim: "quoted words". ', to: 'Binding:' }] }, { provenance: '', manual: '' }, TAG);
    expect(r.content.startsWith('## Section\n\n_(provenance: PROVENANCE § Section — elaborations)_')).toBe(true);
  });

  it('refuses a missing key, a non-unique key and a missing cut anchor', () => {
    expect(() => applyMove(CONTENT, { ...move, key: 'nope' }, { provenance: '', manual: '' }, TAG)).toThrow(/key not found/);
    expect(() => applyMove(CONTENT + CLAUSE, move, { provenance: '', manual: '' }, TAG)).toThrow(/not unique/);
    expect(() => applyMove(CONTENT, { ...move, cuts: [{ from: 'absent text', to: null }] }, { provenance: '', manual: '' }, TAG)).toThrow(/cut anchor not found/);
  });
});

describe('applyMoves', () => {
  it('appends carved text under the move heading and reports applied/skipped', () => {
    const move = { section: 7, name: 'M (0123abcd)', key: 'ratification 0123abcd)** —', cuts: [{ from: 'Chairman verbatim: "quoted words". ', to: 'Binding:' }] };
    const first = applyMoves({ 7: CONTENT }, [move], { provenance: 'P', manual: 'M' }, TAG);
    expect(first.applied).toEqual(['M (0123abcd)']);
    expect(first.companions.provenance).toContain(headingFor('M (0123abcd)', TAG));
    expect(first.companions.provenance).toContain('Chairman verbatim: "quoted words".');
    expect(first.companions.manual).toBe('M');
    const second = applyMoves(first.contents, [move], first.companions, TAG);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['M (0123abcd)']);
    expect(second.contents[7]).toBe(first.contents[7]);
  });
});
