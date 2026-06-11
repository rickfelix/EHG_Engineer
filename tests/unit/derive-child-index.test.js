import { describe, it, expect } from 'vitest';
import { deriveChildIndex, generateChildKey } from '../../scripts/modules/sd-key-generator.js';

// QF-20260610-473: --child suffix derivation — max-existing-suffix+1 (not count),
// explicit 0 honored, collisions self-heal by bumping to the next free letter.

const P = 'SD-TEST-PARENT-001';

describe('deriveChildIndex (QF-20260610-473)', () => {
  it('no existing children -> index 0 (-A)', () => {
    const r = deriveChildIndex(P, [], null);
    expect(r.index).toBe(0);
    expect(r.bumped).toBe(false);
    expect(generateChildKey(P, r.index)).toBe(`${P}-A`);
  });

  it('non-contiguous: only -B exists -> derives -C (max+1 policy), NOT the old colliding -B', () => {
    const r = deriveChildIndex(P, [`${P}-B`], null);
    expect(r.index).toBe(2); // -C
    expect(generateChildKey(P, r.index)).toBe(`${P}-C`);
    expect(r.takenIndexes).toEqual([1]);
  });

  it('contiguous -A..-C -> derives -D', () => {
    const r = deriveChildIndex(P, [`${P}-A`, `${P}-B`, `${P}-C`], null);
    expect(generateChildKey(P, r.index)).toBe(`${P}-D`);
  });

  it('gapped {-A, -C} -> derives -D (max+1, gaps are not refilled by default)', () => {
    const r = deriveChildIndex(P, [`${P}-A`, `${P}-C`], null);
    expect(generateChildKey(P, r.index)).toBe(`${P}-D`);
  });

  it('explicit 0 is HONORED (the old `index || count` swallowed it)', () => {
    const r = deriveChildIndex(P, [`${P}-B`], 0);
    expect(r.index).toBe(0); // -A is free
    expect(r.bumped).toBe(false);
    expect(generateChildKey(P, r.index)).toBe(`${P}-A`);
  });

  it('explicit index that collides self-heals to the next free letter', () => {
    const r = deriveChildIndex(P, [`${P}-A`, `${P}-B`], 0);
    expect(r.index).toBe(2); // -A,-B taken -> -C
    expect(r.bumped).toBe(true);
  });

  it('derived collision chain self-heals across consecutive taken letters', () => {
    // taken {-A,-B,-C}: derived = 3 (-D, free); explicit 1 bumps over -B,-C to -D
    const r = deriveChildIndex(P, [`${P}-A`, `${P}-B`, `${P}-C`], 1);
    expect(generateChildKey(P, r.index)).toBe(`${P}-D`);
    expect(r.bumped).toBe(true);
  });

  it('ignores non-child keys (grandchildren, other parents, malformed)', () => {
    const keys = [`${P}-A1`, 'SD-OTHER-001-A', `${P}-AB`, `${P}-a`, null, 42];
    const r = deriveChildIndex(P, keys, null);
    expect(r.index).toBe(0);
    expect(r.takenIndexes).toEqual([]);
  });
});
