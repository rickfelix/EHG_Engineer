/**
 * SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001 — the roadmap promotion step maps title + refuses a
 * title-less mint. Two-sided on the pure helper (titled -> row / unusable -> skip), plus a
 * source-text wiring pin proving BOTH roadmap-generate.js call sites call it (the pure-helper test
 * is blind to a half-wired extraction; the producer fns are unexported + the file self-invokes
 * main(), so an execution-level wiring test is not achievable — the pin is the precedent-backed
 * bound, cf. tests/unit/roadmap/plan-of-record-remainder-grep-guard.test.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildWaveItemRow } from '../../../lib/roadmap/wave-item-row.js';
import { isUsableTitle } from '../../../lib/sourcing-engine/resolve-source-title.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('buildWaveItemRow — map title, refuse a title-less mint', () => {
  it('TS-1: a usable title maps to a titled insert row', () => {
    const out = buildWaveItemRow({ id: 'src-1', source_type: 'todoist', title: 'A real task title' }, 'wave-9');
    expect(out).toEqual({ row: { wave_id: 'wave-9', source_type: 'todoist', source_id: 'src-1', title: 'A real task title' } });
  });

  it('TS-1b: a title with surrounding whitespace is trimmed onto the row', () => {
    const out = buildWaveItemRow({ id: 'src-2', source_type: 'youtube', title: '  Trim me  ' }, 'wave-9');
    expect(out.row.title).toBe('Trim me');
  });

  it('TS-2: the full isUsableTitle rejection set is SKIPPED, not minted title-less, never thrown', () => {
    // Parity: these are exactly what the shared isUsableTitle rejects (empty / whitespace /
    // (untitled) / non-string). A re-implementation that missed (untitled) or the numeric case
    // would let the producer and the backfill disagree on "usable".
    const unusable = ['', '   ', null, undefined, '(untitled)', '  (untitled)  ', 123, {}];
    for (const title of unusable) {
      // guard: the shared predicate agrees these are all unusable (locks parity)
      expect(isUsableTitle(title), `isUsableTitle should reject ${JSON.stringify(title)}`).toBe(false);
      const out = buildWaveItemRow({ id: 'src-x', source_type: 'todoist', title }, 'wave-9');
      expect(out.skip, `title ${JSON.stringify(title)} must skip`).toBe(true);
      expect(out.reason).toBeTruthy();
      expect(out.row).toBeUndefined();
    }
  });

  it('TS-2b: a missing/non-object item skips with a reason (never throws)', () => {
    expect(buildWaveItemRow(null, 'w').skip).toBe(true);
    expect(buildWaveItemRow(undefined, 'w').reason).toBeTruthy();
  });

  it('TS-3: createWaves-style mapping keeps only usable rows and collects the skips', () => {
    const items = [
      { id: 'a', source_type: 'todoist', title: 'Good one' },
      { id: 'b', source_type: 'youtube', title: '' },          // skip
      { id: 'c', source_type: 'todoist', title: '(untitled)' }, // skip
      { id: 'd', source_type: 'youtube', title: 'Also good' },
    ];
    const rows = [];
    const skips = [];
    for (const item of items) {
      const built = buildWaveItemRow(item, 'wave-1');
      if (built.skip) { skips.push(built.source_id); continue; }
      rows.push(built.row);
    }
    expect(rows.map(r => r.source_id)).toEqual(['a', 'd']);
    expect(skips).toEqual(['b', 'c']);
    expect(rows.every(r => isUsableTitle(r.title))).toBe(true);
  });

  it('TS-7: a backfilled/mapped row is visible to the title-keyed dedup axis (was invisible while title-less)', () => {
    const out = buildWaveItemRow({ id: 'e', source_type: 'todoist', title: 'Dedup me' }, 'wave-1');
    // The dedup axis keys on a usable title; a title-less row (skip) never reaches it.
    expect(isUsableTitle(out.row.title)).toBe(true);
  });
});

describe('TS-8: wiring pin — both roadmap-generate.js promotion sites call buildWaveItemRow', () => {
  const src = readFileSync(path.join(ROOT, 'scripts', 'roadmap-generate.js'), 'utf8');
  it('imports the helper and references it at least twice (createWaves + runIncremental)', () => {
    expect(src).toContain("from '../lib/roadmap/wave-item-row.js'");
    const refs = (src.match(/buildWaveItemRow\(/g) || []).length;
    expect(refs, 'both the full-mode and incremental-mode inserts must call buildWaveItemRow').toBeGreaterThanOrEqual(2);
  });
  it('neither insert mints the old title-less {wave_id, source_type, source_id}-only shape', () => {
    // The pre-fix shape had source_id: immediately followed by a closing of the object with no title.
    // After the fix, the insert payload comes from built.row (which always carries title).
    expect(src).not.toMatch(/source_id:\s*item\.id,\s*\}\s*\)\s*;/);
  });
});
