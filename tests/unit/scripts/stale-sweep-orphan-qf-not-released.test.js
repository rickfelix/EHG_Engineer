/**
 * QF-20260609-456: the stale-session-sweep orphan classifier (step 3c) must NOT false-release a
 * LIVE worker building a quick fix. sdStatusMap is built from strategic_directives_v2 only, so a
 * session whose sd_key is a 'QF-...' id is absent from it; without a QF-aware guard it was
 * classified as an orphaned claim and released (SWEEP_ORPHANED_CLAIM, sd_key nulled, worktree torn
 * down) every 5-min sweep — observed live on QF-20260609-547 / -660.
 *
 * The code fix (isHeldQfClaim, built on a quick_fixes existence set + a claim-age grace window) was
 * shipped by SD-LEO-FIX-STALE-SESSION-SWEEP-001 (PR #4466); this is the regression test that was its
 * remaining deliverable. Static source-pins (matching the stale-session-sweep-release-payload.test.js
 * guard convention — the orphan classifier is inline in main(), which is the cron entry point).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.resolve('scripts/stale-session-sweep.cjs'), 'utf8');

describe('QF-20260609-456: orphan classifier does not release live QF builders', () => {
  it('the orphan-claim filter excludes held QF claims (!isHeldQfClaim)', () => {
    // The step-3c orphan classifier must AND-in the QF-held guard, not key off sdStatusMap alone.
    expect(src).toMatch(/orphanedClaims\s*=\s*classified\.filter\(\s*s\s*=>\s*!sdStatusMap\[s\.sd_key\]\s*&&\s*!isHeldQfClaim\(s\)\s*\)/);
  });

  it('isHeldQfClaim treats an EXISTING quick_fix claim as held (not orphaned)', () => {
    expect(src).toMatch(/const isHeldQfClaim\s*=\s*\(s\)\s*=>/);
    // an sd_key that is an existing quick_fix id => held
    expect(src).toMatch(/qfExistsSet\.has\(s\.sd_key\)\)\s*return true/);
    // only QF-shaped sd_keys are considered (SD claims still classify normally)
    expect(src).toMatch(/\/\^QF-\/\.test\(s\.sd_key/);
  });

  it('qfExistsSet is built from the quick_fixes table (the existence source)', () => {
    const idx = src.indexOf('qfExistsSet');
    expect(idx).toBeGreaterThan(0);
    const region = src.slice(idx, idx + 600);
    expect(region).toMatch(/from\(['"`]quick_fixes['"`]\)/);
    expect(region).toMatch(/qfExistsSet\.add\(/);
  });
});
