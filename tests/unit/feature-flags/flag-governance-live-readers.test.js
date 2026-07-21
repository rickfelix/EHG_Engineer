// QF-20260721-951 — flag-governance digest must check LIVE READERS before recommending KILL.
// A disabled-aging flag that still has live code readers is load-bearing → KEEP, not KILL.
// (The false-KILL of COORD_DETECTORS_V2 + SURFACE_INERT_WORKER_V1 fenced an SD; this closes the class.)
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFlag, computeStaleFlags } from '../../../lib/feature-flags/governance-review.js';
import { buildLiveReaderIndex, stripComments } from '../../../lib/feature-flags/flag-reader-scan.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NOW = Date.parse('2026-07-21T00:00:00Z');

// A flag old enough (created long ago) + disabled/off + no expiry/rollout → the "disabled-aging" KILL path.
function disabledAgingFlag(key) {
  return {
    flag_key: key, lifecycle_state: 'disabled', is_enabled: false,
    created_at: '2020-01-01T00:00:00Z', last_reviewed_at: '2020-01-02T00:00:00Z',
    expiry_at: null, rolled_out_at: null,
  };
}

describe('classifyFlag KILL→KEEP downgrade when a flag has live readers', () => {
  it('disabled-aging flag with NO live readers → kill (unchanged behavior)', () => {
    const c = classifyFlag(disabledAgingFlag('DEAD_FLAG_X'), NOW, { hasLiveReaders: () => false });
    expect(c.reasons).toContain('disabled-aging');
    expect(c.recommendation).toBe('kill');
  });

  it('disabled-aging flag WITH live readers → keep (load-bearing)', () => {
    const c = classifyFlag(disabledAgingFlag('LOAD_BEARING_FLAG'), NOW, { hasLiveReaders: (k) => k === 'LOAD_BEARING_FLAG' });
    expect(c.recommendation).toBe('keep');
    expect(c.reasons.join(' ')).toMatch(/load-bearing/);
  });

  it('no hasLiveReaders predicate injected → preserves legacy KILL (fail-safe: never crashes)', () => {
    const c = classifyFlag(disabledAgingFlag('DEAD_FLAG_Y'), NOW, {});
    expect(c.recommendation).toBe('kill');
  });

  it('computeStaleFlags threads hasLiveReaders through per flag', () => {
    const r = computeStaleFlags(
      [disabledAgingFlag('KEEPER'), disabledAgingFlag('KILLER')],
      NOW,
      { hasLiveReaders: (k) => k === 'KEEPER' },
    );
    const keep = r.stale.find((s) => s.flag_key === 'KEEPER');
    const kill = r.stale.find((s) => s.flag_key === 'KILLER');
    expect(keep.recommendation).toBe('keep');
    expect(kill.recommendation).toBe('kill');
    expect(r.byRecommendation.keep).toBe(1);
    expect(r.byRecommendation.kill).toBe(1);
  });
});

describe('buildLiveReaderIndex — real-repo ACCEPTANCE (the two flags that caused the fence)', () => {
  it('COORD_DETECTORS_V2 + SURFACE_INERT_WORKER_V1 have live readers; a nonexistent flag does not', () => {
    const has = buildLiveReaderIndex(REPO_ROOT, ['COORD_DETECTORS_V2', 'SURFACE_INERT_WORKER_V1', 'NONEXISTENT_FLAG_QF951_ZZZ']);
    expect(has('COORD_DETECTORS_V2')).toBe(true);
    expect(has('SURFACE_INERT_WORKER_V1')).toBe(true);
    expect(has('NONEXISTENT_FLAG_QF951_ZZZ')).toBe(false);
  }, 30000);
});

describe('buildLiveReaderIndex — reader DISCRIMINATION (Charlie grep 9c0ee842, encoded)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flagscan-'));
  afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('counts real runtime code, but NOT comments / *.test.* / backfill scripts', () => {
    fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib', 'live.js'), 'export const on = () => Boolean(process.env.FLAG_REAL_951);');
    fs.writeFileSync(path.join(tmp, 'lib', 'commented.js'), '// FLAG_COMMENT_951 was removed; no longer read\nexport const x = 1;\n');
    fs.writeFileSync(path.join(tmp, 'lib', 'thing.test.js'), 'expect(process.env.FLAG_TESTONLY_951).toBeTruthy();');
    fs.writeFileSync(path.join(tmp, 'scripts', 'backfill-flags.mjs'), "const seed = { flag_key: 'FLAG_BACKFILL_951' };");

    const has = buildLiveReaderIndex(tmp, ['FLAG_REAL_951', 'FLAG_COMMENT_951', 'FLAG_TESTONLY_951', 'FLAG_BACKFILL_951']);
    expect(has('FLAG_REAL_951')).toBe(true);   // real runtime read → live reader
    expect(has('FLAG_COMMENT_951')).toBe(false); // comment-only → not a reader (fail-safe still KEEPs elsewhere)
    expect(has('FLAG_TESTONLY_951')).toBe(false); // *.test.* excluded
    expect(has('FLAG_BACKFILL_951')).toBe(false); // one-time backfill script excluded
  });

  it('stripComments drops // and /* */ mentions but leaves code (and URLs) intact', () => {
    expect(stripComments('const a = 1; // FLAG_IN_COMMENT').includes('FLAG_IN_COMMENT')).toBe(false);
    expect(stripComments('/* FLAG_BLOCK */ const b = 2;').includes('FLAG_BLOCK')).toBe(false);
    expect(stripComments('const u = "https://x.example/FLAG_URL";').includes('FLAG_URL')).toBe(true);
  });
});
