/**
 * lib/fleet/pid-venue.cjs — first dedicated unit test file for this module.
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-2, TS-5).
 *
 * Prior coverage was indirect only (tests/unit/fleet/pid-blind-venue-abstains.test.js,
 * tests/unit/fleet/pid-liveness-parent-acceptance.test.js), both via an explicit markerDir
 * argument. This file additionally covers the new markerCount-aggregation-across-markerDirs()
 * path (the default, no-explicit-dir case).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { pidVenueCapability } = require('../../../lib/fleet/pid-venue.cjs');

describe('pidVenueCapability — explicit markerDir (existing contract, unchanged)', () => {
  it('capable:false, marker_dir_absent when the explicit directory does not exist', () => {
    const v = pidVenueCapability({ markerDir: '/no/such/dir/xyz' });
    expect(v).toMatchObject({ capable: false, reason: 'marker_dir_absent', markerCount: 0 });
  });
});

describe('pidVenueCapability — aggregation across markerDirsFn() (FR-2, TS-5)', () => {
  const dirs = [];
  function makeDir() {
    const d = mkdtempSync(path.join(tmpdir(), 'pid-venue-'));
    dirs.push(d);
    return d;
  }
  function writeMarker(dir, pid) {
    writeFileSync(path.join(dir, `pid-${pid}.json`), JSON.stringify({ session_id: `s-${pid}`, cc_pid: pid }));
  }
  afterEach(() => {
    while (dirs.length) { try { rmSync(dirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  it('reproduces the measured live near-miss shape: 1 marker in one dir + 0 in another aggregates to capable:true', () => {
    const dirThin = makeDir(); // 0 markers — the worktree shape measured live
    const dirRich = makeDir();
    writeMarker(dirRich, 1111);
    // A single-directory read of dirThin alone would report marker_dir_empty (false capability).
    const thinAlone = pidVenueCapability({ markerDir: dirThin });
    expect(thinAlone).toMatchObject({ capable: false, reason: 'marker_dir_empty' });
    // The aggregated no-arg path must see the population in dirRich too.
    const aggregated = pidVenueCapability({ markerDirsFn: () => [dirThin, dirRich] });
    expect(aggregated).toMatchObject({ capable: true, reason: 'marker_dir_present', markerCount: 1 });
  });

  it('sums markerCount across all directories, not just the first non-empty one', () => {
    const dirA = makeDir();
    const dirB = makeDir();
    writeMarker(dirA, 1);
    writeMarker(dirB, 2);
    writeMarker(dirB, 3);
    const v = pidVenueCapability({ markerDirsFn: () => [dirA, dirB] });
    expect(v.markerCount).toBe(3);
  });

  it('capable:false, marker_dir_absent when every directory in the union is missing', () => {
    const v = pidVenueCapability({ markerDirsFn: () => ['/no/such/a', '/no/such/b'] });
    expect(v).toMatchObject({ capable: false, reason: 'marker_dir_absent', markerCount: 0 });
  });

  it('capable:false, marker_dir_empty when every directory in the union exists but holds zero markers', () => {
    const dirA = makeDir();
    const dirB = makeDir();
    const v = pidVenueCapability({ markerDirsFn: () => [dirA, dirB] });
    expect(v).toMatchObject({ capable: false, reason: 'marker_dir_empty', markerCount: 0 });
  });

  it('an explicit markerDir still overrides markerDirsFn entirely (carve-out preserved)', () => {
    const dirExplicit = makeDir(); // empty
    const dirUnion = makeDir();
    writeMarker(dirUnion, 42);
    const v = pidVenueCapability({ markerDir: dirExplicit, markerDirsFn: () => [dirUnion] });
    expect(v).toMatchObject({ capable: false, reason: 'marker_dir_empty', markerCount: 0 });
  });
});
