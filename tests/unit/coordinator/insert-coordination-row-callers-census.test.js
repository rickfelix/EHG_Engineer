/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-2/FR-3: static/AST-lite guard over the
 * committed caller census (lib/coordinator/insert-coordination-row-callers.cjs).
 *
 * Two things this proves, source-text-verified rather than asserted by prose:
 *  1. Every entry's claimed file:line genuinely contains an insertCoordinationRow( call at (or
 *     within a few lines of) that line -- catches drift if a call site moves/is removed without
 *     updating the census.
 *  2. Every 'migrated'/'fixed-this-sd' entry's file actually calls isDeliveredDispatchError( --
 *     "no entrypoint is exempted silently" (FR-2 AC-2): an entry can only be exempt via an
 *     explicit, named disposition in the committed list, never by simply not appearing anywhere.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const { FR2_CLI_ENTRYPOINTS, FR3_NON_CLI_CALLERS, EXCLUDED_FALSE_POSITIVES } = require_(
  '../../../lib/coordinator/insert-coordination-row-callers.cjs'
);

const REPO_ROOT = resolve(__dirname, '../../..');
const ALL_ENTRIES = [...FR2_CLI_ENTRYPOINTS, ...FR3_NON_CLI_CALLERS];

function readSource(relPath) {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
}

describe('caller census — every entry names a real insertCoordinationRow( call site', () => {
  for (const entry of ALL_ENTRIES) {
    it(`${entry.file}:${entry.line} exists and contains insertCoordinationRow( within +/-3 lines`, () => {
      const lines = readSource(entry.file).split('\n');
      const window = lines.slice(Math.max(0, entry.line - 4), entry.line + 3).join('\n');
      expect(window).toMatch(/insertCoordinationRow\(/);
    });
  }
});

describe('caller census — no entrypoint is exempted silently (FR-2 AC-2 / FR-3 AC-1)', () => {
  for (const entry of FR2_CLI_ENTRYPOINTS) {
    if (entry.disposition === 'migrated') {
      it(`${entry.file} (migrated) calls isDeliveredDispatchError(`, () => {
        expect(readSource(entry.file)).toMatch(/isDeliveredDispatchError\(/);
      });
    } else {
      it(`${entry.file}:${entry.line} carries an explicit, non-empty exemption reason`, () => {
        expect(entry.disposition).toMatch(/^exempt-/);
        expect(typeof entry.note).toBe('string');
        expect(entry.note.length).toBeGreaterThan(20);
      });
    }
  }

  for (const entry of FR3_NON_CLI_CALLERS) {
    if (entry.disposition === 'fixed-this-sd') {
      it(`${entry.file} (fixed-this-sd) calls isDeliveredDispatchError(`, () => {
        expect(readSource(entry.file)).toMatch(/isDeliveredDispatchError\(/);
      });
    } else {
      it(`${entry.file}:${entry.line} carries an explicit, non-empty exemption reason`, () => {
        expect(entry.disposition).toMatch(/^exempt-/);
        expect(typeof entry.note).toBe('string');
        expect(entry.note.length).toBeGreaterThan(20);
      });
    }
  }
});

describe('caller census — completeness bookkeeping', () => {
  it('FR-2 + FR-3 entries total 25 real call sites across 25 distinct durable-caller files (14 FR-2 files + 11 FR-3 files)', () => {
    const fr2Files = new Set(FR2_CLI_ENTRYPOINTS.map((e) => e.file));
    const fr3Files = new Set(FR3_NON_CLI_CALLERS.map((e) => e.file));
    expect(fr2Files.size).toBe(14);
    expect(fr3Files.size).toBe(11);
    // No file appears in both partitions.
    for (const f of fr2Files) expect(fr3Files.has(f)).toBe(false);
  });

  it('every excluded false positive genuinely does NOT call insertCoordinationRow( at its own claimed line (comment-only mention)', () => {
    for (const fp of EXCLUDED_FALSE_POSITIVES) {
      const lines = readSource(fp.file).split('\n');
      // The claimed line itself is prose/a comment, not a call — the ACTUAL write nearby uses a
      // raw supabase insert instead (each has its own eslint-disable-next-line documenting why).
      expect(lines[fp.line - 1]).not.toMatch(/^\s*(await\s+)?insertCoordinationRow\(/);
      expect(typeof fp.reason).toBe('string');
      expect(fp.reason.length).toBeGreaterThan(20);
    }
  });
});
