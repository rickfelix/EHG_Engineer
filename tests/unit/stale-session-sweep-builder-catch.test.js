/**
 * SD-FDBK-INFRA-FATAL-CRASH-STALE-001 — regression guard for the FATAL builder-.catch() crash.
 *
 * A Supabase PostgREST builder (.insert/.update/.upsert/.delete/.select) is THENABLE but does NOT
 * expose a .catch() method. Calling `.insert(...).catch(...)` therefore throws
 * "TypeError: ...catch is not a function" SYNCHRONOUSLY (when .catch is evaluated), and in
 * stale-session-sweep.cjs that propagated to main().catch -> process.exit(1), aborting the ENTIRE
 * sweep tick on the (intermittent) IDENTITY_SPLIT path. The fix is `.then(() => {}).catch(...)`:
 * .then() returns a real Promise on which .catch() is valid.
 *
 * This guard scans the source so the bug class can't silently reappear anywhere in the file: every
 * `.catch(` must be preceded in its chain by a `.then(` (real Promise) or be `main().catch`. The code
 * comments in this file deliberately avoid the literal "<dot>catch(" token so the scan never false-flags
 * prose (the fix comment says "catch method"/"rejection handler" instead).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../scripts/stale-session-sweep.cjs'), 'utf8');

describe('stale-session-sweep: no Supabase builder .catch() without a preceding .then()', () => {
  it('every .catch() is on a real Promise (.then(...).catch or main().catch), never a raw thenable builder', () => {
    const offenders = [];
    for (const m of SRC.matchAll(/\.catch\s*\(/g)) {
      const idx = m.index;
      const before = SRC.slice(Math.max(0, idx - 60), idx);
      const onRealPromise = /\.then\s*\(/.test(before) || /main\s*\(\s*\)\s*$/.test(before.trimEnd());
      if (!onRealPromise) {
        const lineNo = SRC.slice(0, idx).split('\n').length;
        offenders.push(`line ${lineNo}: ...${before.slice(-40).replace(/\n/g, '\\n')}.catch(`);
      }
    }
    expect(offenders, `builder .catch() without a preceding .then() (FATAL — crashes the sweep tick):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the IDENTITY_COLLISION notification insert uses the .then().catch() fire-and-forget pattern', () => {
    // Anchor on the specific site this SD fixed so a future edit that reverts it is caught explicitly.
    expect(SRC).toMatch(/sender_type:\s*'sweep'[\s\S]{0,400}?\}\)\s*\.then\(\s*\(\)\s*=>\s*\{\}\s*\)\s*\.catch\(/);
  });
});
