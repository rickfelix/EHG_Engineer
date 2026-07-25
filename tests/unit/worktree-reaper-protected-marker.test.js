import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROTECTED_MARKER_FILENAME,
  writeReapProtectedMarker,
  readReapProtectedMarker,
  hasReapProtectedMarker,
} from '../../lib/worktree-reaper/reap-protected-marker.js';

/**
 * QF-20260725-821 — the reaper had NO opt-out.
 *
 * LIVE INCIDENT 2026-07-25T12:20:21Z: .worktrees/cp3-drill-run (branch drill/cp3-live-run) was
 * removed mid-run (verdict=stage2_remove, reason=orphan-sd) while the chairman and Adam were
 * running the CP3 acceptance drill out of it — because its basename did not resolve to an sd_key
 * and it held no DB claim, which is the profile of EVERY operator/drill/ops worktree. The only
 * pre-existing protections were a cursor path pattern and an active DB claim; .reap-eligible.json
 * is opt-IN TO REAPING, not protection.
 */
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reap-protected-')); });
afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

describe('reap-protected marker (QF-20260725-821)', () => {
  it('an unmarked worktree is NOT protected (default stays reapable — no behaviour change)', () => {
    expect(hasReapProtectedMarker(tmp)).toBe(false);
    expect(readReapProtectedMarker(tmp)).toBeNull();
  });

  it('writing the marker protects the worktree, and the payload round-trips', () => {
    const res = writeReapProtectedMarker(tmp, { reason: 'CP3 acceptance drill in flight', protected_by: 'coordinator' });
    expect(res.written).toBe(true);
    expect(res.error).toBeNull();
    expect(hasReapProtectedMarker(tmp)).toBe(true);

    const marker = readReapProtectedMarker(tmp);
    expect(marker.reason).toBe('CP3 acceptance drill in flight');
    expect(marker.protected_by).toBe('coordinator');
    expect(typeof marker.protected_at).toBe('string');
  });

  it('is the OPT-OUT counterpart: its filename is distinct from the opt-in reap-eligible marker', async () => {
    const { MARKER_FILENAME } = await import('../../lib/worktree-reaper/reap-eligible-marker.js');
    expect(PROTECTED_MARKER_FILENAME).toBe('.reap-protected.json');
    expect(PROTECTED_MARKER_FILENAME).not.toBe(MARKER_FILENAME);
  });

  it('a CORRUPT marker STILL protects — fail-safe toward keeping the tree', () => {
    // Deliberate asymmetry: presence decides safety, parseability only decides metadata.
    // Honoring an unparseable marker costs one un-reaped worktree; ignoring it deletes a tree
    // someone is standing in, which is the incident this QF exists to prevent.
    fs.writeFileSync(path.join(tmp, PROTECTED_MARKER_FILENAME), '{ not valid json', 'utf8');
    expect(hasReapProtectedMarker(tmp)).toBe(true);
    expect(readReapProtectedMarker(tmp)).toBeNull();
  });

  it('hasReapProtectedMarker never throws on a nonexistent path', () => {
    expect(() => hasReapProtectedMarker(path.join(tmp, 'does', 'not', 'exist'))).not.toThrow();
    expect(hasReapProtectedMarker(path.join(tmp, 'does', 'not', 'exist'))).toBe(false);
  });
});

describe('QF-20260725-821: the reaper honors the marker at BOTH protection points', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'worktree-reaper.mjs'),
    'utf-8',
  );

  it('imports the protected-marker module', () => {
    expect(src).toMatch(/reap-protected-marker\.js/);
  });

  it('guards selectStage0Reclaim (stage-0 reclaim also destroys the tree)', () => {
    // The cursor convention is honored in two places; a fix that covered only the main loop
    // would still let stage-0 reclaim delete a protected tree.
    const stage0 = src.slice(src.indexOf('export function selectStage0Reclaim'));
    const body = stage0.slice(0, stage0.indexOf('\n}'));
    expect(body).toMatch(/hasReapProtectedMarker/);
  });

  it('emits a keep verdict with reason reap_protected_marker in the classification loop', () => {
    expect(src).toMatch(/reason: 'reap_protected_marker'/);
    expect(src).toMatch(/keep:protected/);
  });

  it('checks the marker BEFORE classification, so a protected tree can never reach stage1/stage2', () => {
    // Order is the whole safety property: the live incident removed the tree at stage 2 via
    // orphan-sd, which is decided from the basename/claim lookup below. Guarding after that
    // would still classify (and could still act) before the protection was consulted.
    const loopStart = src.indexOf('for (const wt of allWorktrees)');
    expect(loopStart).toBeGreaterThan(-1);
    const loop = src.slice(loopStart);
    const guardAt = loop.indexOf('hasReapProtectedMarker');
    const classifyAt = loop.indexOf('const basename = path.basename(wt.path)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(classifyAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(classifyAt);
  });
});
