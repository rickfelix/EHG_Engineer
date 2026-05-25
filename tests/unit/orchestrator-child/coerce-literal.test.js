/**
 * SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001 — FR-1: literal coercion of mutation values.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { coerceLiteral } = require(path.resolve(__dirname, '../../../scripts/hooks/lib/coerce-literal.cjs'));

describe('coerceLiteral (FR-1 / AC-1, AC-2)', () => {
  it('coerces boolean literals', () => {
    expect(coerceLiteral('true')).toBe(true);
    expect(coerceLiteral('false')).toBe(false);
    expect(coerceLiteral('  true  ')).toBe(true);
  });
  it('coerces numeric literals', () => {
    expect(coerceLiteral('5')).toBe(5);
    expect(coerceLiteral('-3')).toBe(-3);
    expect(coerceLiteral('2.5')).toBe(2.5);
  });
  it('coerces quoted strings to their inner text (single/double/backtick)', () => {
    expect(coerceLiteral("'active'")).toBe('active');
    expect(coerceLiteral('"draft"')).toBe('draft');
    expect(coerceLiteral('`x`')).toBe('x');
    expect(coerceLiteral("'a, b: c'")).toBe('a, b: c'); // commas/colons inside a string survive
  });
  it("returns the 'unknown' placeholder for non-literals (variables, expressions, arrays, objects)", () => {
    expect(coerceLiteral('someVar')).toBe('unknown');
    expect(coerceLiteral('new Date()')).toBe('unknown');
    expect(coerceLiteral('[1, 2]')).toBe('unknown');
    expect(coerceLiteral('{ a: 1 }')).toBe('unknown');
    expect(coerceLiteral('sessionId')).toBe('unknown');
    expect(coerceLiteral('')).toBe('unknown');
    expect(coerceLiteral(null)).toBe('unknown');
  });
});
