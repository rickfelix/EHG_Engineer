// QF-20260902-185: create-quick-fix.js's random 3-digit daily id suffix has no
// collision retry, so on a busy day (34+ QF-<date>-* rows already minted, ~3.4%+
// mint failure chance) a fresh mint can land on a taken suffix and fail on
// quick_fixes_pkey (23505), forcing a manual re-run. Fix: redraw and retry the
// insert, bounded (MAX_ID_ATTEMPTS=5), logging each collision; a non-23505 error
// still fails immediately (never masks an unrelated insert failure as a retry).
//
// Static-pattern test (same convention as create-quick-fix-insert-order.test.js
// for this exact script — a unit-level execution would need to mock the full
// Supabase chain + worktree manager + routing decision + feedback pre-claim).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');
const code = fs.readFileSync(SRC, 'utf8');

describe('QF-20260902-185: create-quick-fix.js retries the id mint on a bounded PK collision', () => {
  it('generates the id INSIDE the insert-attempt loop, not once beforehand (each attempt redraws)', () => {
    // The old single `const qfId = generateQuickFixId();` before the insert (no retry)
    // must be gone — the call site must live inside the loop body.
    const loopIdx = code.indexOf('MAX_ID_ATTEMPTS');
    const genCallIdx = code.indexOf('qfId = generateQuickFixId();');
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    expect(genCallIdx).toBeGreaterThan(loopIdx);
  });

  it('bounds the retry (a finite MAX_ID_ATTEMPTS, not an unbounded loop)', () => {
    expect(code).toMatch(/MAX_ID_ATTEMPTS\s*=\s*\d+/);
    expect(code).toMatch(/attempt\s*<=\s*MAX_ID_ATTEMPTS/);
  });

  it('only retries on the unique-violation code (23505) -- any other error fails immediately', () => {
    const retryGuardRe = /if\s*\(\s*insertErr\.code\s*!==\s*'23505'\s*\)\s*break;/;
    expect(code).toMatch(retryGuardRe);
  });

  it('stops retrying on success (break as soon as insertErr is falsy)', () => {
    expect(code).toMatch(/if\s*\(\s*!insertErr\s*\)\s*break;/);
  });

  it('logs each collision loudly before redrawing (never a silent retry)', () => {
    expect(code).toMatch(/ID_COLLISION/);
    expect(code).toMatch(/console\.warn\(`⚠️\s*\[ID_COLLISION\][\s\S]{0,80}redrawing/);
  });

  it('still fails loud (exit 1) when every attempt is exhausted', () => {
    const failIdx = code.indexOf("console.log('❌ Failed to create quick-fix record:', insertErr.message);");
    const exitIdx = code.indexOf('process.exit(1);', failIdx);
    expect(failIdx).toBeGreaterThan(0);
    expect(exitIdx).toBeGreaterThan(failIdx);
  });

  it('does NOT change the id format (non-goal: still QF-YYYYMMDD-NNN via generateQuickFixId)', () => {
    expect(code).toMatch(/function generateQuickFixId\(\)/);
    expect(code).toMatch(/`QF-\$\{year\}\$\{month\}\$\{day\}-\$\{random\}`/);
  });
});
