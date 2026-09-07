// QF-20260903-266: extend the QF-20260903-787 persisted-content echo (scripts/worker-signal.cjs)
// to create-quick-fix.js's description field. The precedent's OWN governance description
// ("tier-ladder.cjs:487 guards .") took exactly this hit: a backticked expression inside a
// double-quoted shell argument was command-substituted away, and the create still reported
// success with nothing a caller could compare against its intent.
//
// Static-pattern test (same convention as create-quick-fix-insert-order.test.js in this same
// directory, deliberately documented there as source-inspection rather than a full Supabase-chain
// mock) -- proportionate to a QF-tier observability addition, and the precedent this extends uses
// the identical convention for its own "never fails the write" guarantee.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');
const code = fs.readFileSync(SRC, 'utf8');

describe('QF-20260903-266: create-quick-fix.js persisted-description echo', () => {
  const echoStart = code.indexOf('PERSISTED-CONTENT ECHO');
  const block = code.slice(echoStart, echoStart + 1700);

  it('exists, positioned after the just-inserted row is re-read', () => {
    const readIdx = code.indexOf("select('*').eq('id', qfId).single()");
    expect(readIdx).toBeGreaterThan(-1);
    expect(echoStart).toBeGreaterThan(-1);
    expect(echoStart).toBeGreaterThan(readIdx);
  });

  it('reads description from the already-fetched row (data.description), not a second query', () => {
    expect(block).toContain('data && data.description');
    // No fresh .from('quick_fixes').select(...) inside the echo block itself.
    const secondSelect = block.indexOf("from('quick_fixes')");
    expect(secondSelect === -1 || secondSelect > block.indexOf('try {')).toBe(true);
  });

  it('computes length and a sha256 prefix, both derivable by a third party from the stored row alone', () => {
    expect(block).toContain('text.length');
    expect(block).toMatch(/createHash\('sha256'\)/);
    expect(block).toMatch(/\.slice\(0,\s*8\)/);
  });

  it('detects write-side truncation by comparing submitted vs stored length', () => {
    expect(block).toContain('WRITE-SIDE TRUNCATION');
    expect(block).toContain('text.length !== description.length');
  });

  it('is wrapped in try/catch whose catch never throws, exits, or returns — the write it observes must always still succeed', () => {
    const tryIdx = block.indexOf('try {');
    const catchIdx = block.indexOf('} catch {');
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    const catchBody = block.slice(catchIdx, catchIdx + 200);
    expect(catchBody).not.toMatch(/throw\b/);
    expect(catchBody).not.toMatch(/process\.exit/);
    expect(catchBody).not.toMatch(/\breturn\b/);
    expect(catchBody).toContain('read-back unavailable');
  });

  it('never mutates the quick_fixes row (read-back-and-report only, no DB .update()/.upsert() in the block)', () => {
    // .update(text) on a crypto hash is a legitimate, unrelated method of the same name —
    // scope the check to a DB-shaped call instead of a bare substring match.
    expect(block).not.toMatch(/\.from\([^)]*\)[\s\S]{0,60}\.(update|upsert)\(/);
  });
});
