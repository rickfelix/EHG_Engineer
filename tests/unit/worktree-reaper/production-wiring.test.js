/**
 * F2 (TESTING, EXEC-TO-PLAN) — the guards must be WIRED, not merely correct.
 *
 * TESTING mutated `scripts/worktree-reaper.mjs` three ways and every mutant SURVIVED:
 * replacing decideRemoval with the old claim-guard veto, passing a hard-coded
 * `treeResidency:{blocked:false}`, and stubbing isReapEligibleMarkerValid to `{valid:true}`.
 * Each unwires an FR from production entirely, and CI stayed green — because every test
 * drove the extracted functions directly and nothing asserted the call sites.
 *
 * PRD FR-1b AC-4 asks for exercise "through the reaper's real removal loop". That loop is
 * inline in main() and needs a live Supabase, so it is split here by what each half can
 * honestly prove:
 *
 *   FR-3  -> BEHAVIOURAL. classifyWorktree is exported, so its use of the marker validator
 *            is driven for real against a temp tree. This kills the stub-it-to-valid mutant
 *            on behaviour, not on source text.
 *
 *   FR-1b, FR-2 -> SOURCE ASSERTION, and labelled as such. These pin a FACT (the call
 *            exists at the site) rather than a BEHAVIOUR, which is a weaker guarantee —
 *            see PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001. It is the right tool for "is this
 *            wired", and the wrong tool for "does this work"; the behaviour is covered by
 *            removal-decision.test.js and tree-residency-guard.test.js. Stated plainly so
 *            nobody mistakes this for end-to-end coverage.
 */
import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../../lib/worktree-reaper/detectors.js', () => ({
  isNested: vi.fn(() => ({ matched: false })),
  isZombieOnMain: vi.fn(() => ({ matched: false })),
  hasOrphanSD: vi.fn(() => ({ matched: false })),
  isPatchEquivalentToMain: vi.fn(async () => ({ matched: false, reason: 'skipped', evidence: {} })),
  isIdle: vi.fn(() => ({ matched: false })),
}));

import { classifyWorktree } from '../../../scripts/worktree-reaper.mjs';
import { writeReapEligibleMarker } from '../../../lib/worktree-reaper/reap-eligible-marker.js';

const ctx = () => ({
  repoRoot: '/repo',
  claimMap: new Map(),
  sdMap: new Set(),
  qfMap: new Set(),
  activeSdSet: new Set(),
  activeQfSet: new Set(),
  idleThresholdMs: 7 * 24 * 60 * 60 * 1000,
});

let dir;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-')); });
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

/** Write a marker and force its age, bypassing the writer's own clock. */
function marker({ hoursAgo, sd_key }) {
  writeReapEligibleMarker(dir, { sd_key });
  const p = path.join(dir, '.reap-eligible.json');
  const payload = JSON.parse(fs.readFileSync(p, 'utf8'));
  payload.marked_at = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
}

describe('FR-3 is wired into classifyWorktree (behavioural)', () => {
  test('a STALE foreign marker does not make the tree reap-eligible', async () => {
    marker({ hoursAgo: 5.5, sd_key: 'SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001' });
    const wt = { path: dir, branch: 'feat/SD-OTHER-001' };
    const { categories, reasons } = await classifyWorktree(wt, ctx());
    expect(categories).not.toContain('reap-eligible');
    expect(reasons['reap-eligible-expired']).toBeDefined();
  });

  test('OPPOSITE POLARITY: a fresh MATCHING marker still does', async () => {
    // Without this, stubbing the validator to always-INVALID would also pass above.
    marker({ hoursAgo: 0.1, sd_key: 'SD-OTHER-001' });
    const wt = { path: dir, branch: 'feat/SD-OTHER-001' };
    const { categories } = await classifyWorktree(wt, ctx());
    expect(categories).toContain('reap-eligible');
  });
});

describe('FR-1b and FR-2 are wired into the removal loop (source assertion)', () => {
  // Weaker than behavioural, and deliberately so — see the header. This exists because
  // three production-unwiring mutants survived a fully green suite.
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'worktree-reaper.mjs'),
    'utf8',
  );

  test('the removal gate calls decideRemoval with all three guard results', () => {
    expect(src).toMatch(/decideRemoval\(\s*\{[^}]*claimGuard[^}]*treeResidency[^}]*heartbeatResidency[^}]*\}\s*\)/s);
    expect(src).toMatch(/if\s*\(\s*!decision\.remove\s*\)/);
  });

  test('tree residency is actually computed for the candidate, not passed a constant', () => {
    expect(src).toMatch(/treeResidencyBlocksRemoval\(\s*wtPath/);
    // A hard-coded literal would unwire FR-2 while leaving the decideRemoval call intact.
    expect(src).not.toMatch(/treeResidency:\s*\{\s*blocked:\s*(false|true)\s*\}/);
  });

  test('the OLD standalone claim-guard veto is gone from the removal loop', () => {
    // Its return is what made work_key_unresolvable an absolute veto and would silently
    // re-strand every unresolvable basename.
    expect(src).not.toMatch(/if\s*\(\s*claimGuard\.blocked\s*\)\s*\{/);
  });

  test('marker validation is called at the classification site', () => {
    expect(src).toMatch(/isReapEligibleMarkerValid\(\s*wt\.path/);
    expect(src).not.toMatch(/isReapEligibleMarkerValid[^\n]*=>\s*\(\{\s*valid:\s*true/);
  });
});
