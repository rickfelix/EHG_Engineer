/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-016, FR-3.
 *
 * PAT-LES-2116dd961204 claimed add-prd-to-database.js creates PRDs in status='draft' by
 * default. LEAD-phase investigation refuted this: the only status='draft'/'planning' insert
 * site is createPRDEntry() (scripts/prd/prd-creator.js:145), which is dead code -- never
 * called from scripts/prd/index.js or scripts/add-prd-to-database.js, only defined,
 * re-exported for backward compatibility, and named in a deprecation comment.
 *
 * Static guard, source-text based (mocking-independent): if a future edit ever wires
 * createPRDEntry back into a live call path, silently reintroducing the exact gap this
 * pattern described, this test fails immediately instead of the gap resurfacing silently
 * and being rediscovered months later by another /learn pass.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function readSource(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

/**
 * Count real invocations of `createPRDEntry(` in a source string, excluding:
 *  - the function's own declaration (`function createPRDEntry(` / `export function createPRDEntry(`)
 *  - re-export statements (`export { createPRDEntry ... }` never appends a paren, so it is
 *    already excluded by requiring a literal `(` right after the name)
 *  - line comments (`//`) and block comments (`/* *\/`) mentioning it
 *
 * KNOWN LIMITATION (adversarial /ship review finding, accepted as a deliberate simplicity
 * tradeoff, not a defect): this is a source-text guard, not an AST-based one. It cannot detect
 * an aliased import (`import { createPRDEntry as cpe } from ...; cpe(...)`) or an indirect
 * reference (`const fn = createPRDEntry; fn(...)`). A realistic re-wiring of this function
 * almost certainly uses the plain `createPRDEntry(...)` call syntax this guard does catch;
 * closing the aliasing gap would require a full AST parser, which is disproportionate for a
 * lightweight regression pin on a single deprecated function.
 */
function countLiveCalls(src) {
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = noBlockComments.split('\n');
  let count = 0;
  for (const line of lines) {
    const codePart = line.split('//')[0];
    if (!/createPRDEntry\s*\(/.test(codePart)) continue;
    if (/function\s+createPRDEntry\s*\(/.test(codePart)) continue; // declaration, not a call
    count++;
  }
  return count;
}

describe('countLiveCalls (guard internals)', () => {
  it('does not false-positive on a block comment mentioning createPRDEntry(', () => {
    const src = '/* see createPRDEntry(x) for the deprecated shape */\nconst x = 1;';
    expect(countLiveCalls(src)).toBe(0);
  });

  it('does not false-positive on a line comment mentioning createPRDEntry(', () => {
    const src = '// createPRDEntry(x) is deprecated\nconst x = 1;';
    expect(countLiveCalls(src)).toBe(0);
  });

  it('detects a genuine live call', () => {
    const src = 'const result = createPRDEntry(supabase, id);';
    expect(countLiveCalls(src)).toBe(1);
  });

  it('does not count the function declaration itself', () => {
    const src = 'export async function createPRDEntry(supabase, prdId) { return 1; }';
    expect(countLiveCalls(src)).toBe(0);
  });
});

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-016: createPRDEntry (status=planning) has no live caller', () => {
  it('scripts/prd/index.js never calls createPRDEntry(', () => {
    const src = readSource('scripts/prd/index.js');
    expect(countLiveCalls(src)).toBe(0);
  });

  it('scripts/add-prd-to-database.js never calls createPRDEntry(', () => {
    const src = readSource('scripts/add-prd-to-database.js');
    expect(countLiveCalls(src)).toBe(0);
  });

  it('scripts/prd/index.js documents the deprecation (regression-pin on the comment itself)', () => {
    const src = readSource('scripts/prd/index.js');
    expect(src).toMatch(/createPRDEntry[\s\S]{0,80}deprecated/i);
  });

  it('createPRDEntry is still defined and exported (guarding against accidental deletion, not just accidental re-wiring)', () => {
    const src = readSource('scripts/prd/prd-creator.js');
    expect(src).toMatch(/export\s+async\s+function\s+createPRDEntry\s*\(/);
  });
});
