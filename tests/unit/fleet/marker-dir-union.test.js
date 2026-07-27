/**
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 — markers are per-checkout, processes are per-host.
 *
 * FOUND BY RUNNING THE THING, not by reading it. With FR-1/FR-3a already green, the sweep was
 * invoked from this SD's own worktree to confirm the shipped venue actually rendered verdicts.
 * It printed:
 *
 *     [sweep] PID venue OK (...\.worktrees\SD-...\.claude\session-identity).
 *             Examined 9 row(s); 0 resolved to a live PID.
 *
 * Nine live seats, none resolvable, and the venue check calling itself HEALTHY. The cause is that
 * scripts/hooks/capture-session-id.cjs:497 (writer) and lib/fleet/cc-pid-liveness.cjs (reader)
 * both derive the marker directory from their own __dirname, so every checkout keeps a separate
 * marker set — while the thing described, an OS process, is host-wide.
 * MEASURED: main repo 12 markers, this worktree 1 (a synthetic test fixture), other worktrees 0-2.
 *
 * WHY IT MATTERS: unresolvable + very-stale is exactly the shape stale-session-sweep.cjs turns
 * into DEAD and then releases. Any sweep or watcher invoked from a worktree was one stale
 * heartbeat away from falsely reaping every live seat on the host.
 *
 * AFTER the union fix, the identical command from the identical directory reports
 * "Examined 9 row(s); 9 resolved to a live PID".
 *
 * The fix is STRICTLY UPGRADE-ONLY — adding directories can only resolve MORE pids, never fewer —
 * so it cannot manufacture a false death. Same direction of change as C2, and safe under the
 * one-directional liveness contract for the same reason.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const { markerDirs, mainWorktreeMarkerDir, MARKER_DIR } = require('../../../lib/fleet/cc-pid-liveness.cjs');
const { resolveCcPidFromTerminalId } = require('../../../lib/fleet/resolve-cc-pid.cjs');

let tmpRoot;
let dirA;
let dirB;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-union-'));
  dirA = path.join(tmpRoot, 'a');
  dirB = path.join(tmpRoot, 'b');
  fs.mkdirSync(dirA);
  fs.mkdirSync(dirB);
  fs.writeFileSync(path.join(dirA, 'pid-111.json'), JSON.stringify({ cc_pid: 111, session_id: 'in-a' }));
  fs.writeFileSync(path.join(dirB, 'pid-222.json'), JSON.stringify({ cc_pid: 222, session_id: 'in-b' }));
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('marker directory resolution spans the host, not just this checkout', () => {
  it('markerDirs() includes the local checkout dir', () => {
    expect(markerDirs()).toContain(MARKER_DIR);
  });

  it('markerDirs() is deduped — in the MAIN checkout there is exactly one dir', () => {
    const dirs = markerDirs();
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it('mainWorktreeMarkerDir() resolves to a session-identity path and never throws', () => {
    // It must degrade to the local directory rather than throwing: this runs inside a liveness
    // read, and an exception there would turn "cannot resolve" into a crash mid-sweep.
    const d = mainWorktreeMarkerDir();
    expect(d).toMatch(/session-identity$/);
  });

  it('from a LINKED worktree it points at the MAIN worktree, not the local one', () => {
    // The discriminator is real and checked against this checkout's actual state: a linked
    // worktree's .git is a FILE ("gitdir: ..."), the main worktree's is a DIRECTORY.
    const localRoot = path.resolve(MARKER_DIR, '../..');
    const gitPath = path.join(localRoot, '.git');
    const isLinkedWorktree = fs.existsSync(gitPath) && fs.statSync(gitPath).isFile();
    if (isLinkedWorktree) {
      expect(mainWorktreeMarkerDir()).not.toBe(MARKER_DIR);
      expect(markerDirs().length).toBe(2);
    } else {
      expect(mainWorktreeMarkerDir()).toBe(MARKER_DIR);
    }
  });
});

describe('the resolver honours an explicit dir but otherwise scans them all', () => {
  it('an explicit markerDir pins the scan to exactly that directory', () => {
    // Hermetic tests depend on this: passing a fixture dir must NOT silently also read the host's
    // real markers, or a fixture assertion could pass for the wrong reason.
    expect(resolveCcPidFromTerminalId('in-a', 'in-a', dirA)).toBe(111);
    expect(resolveCcPidFromTerminalId('in-b', 'in-b', dirA)).toBeNull();
  });

  it('an unresolvable session still returns null, not a wrong pid', () => {
    expect(resolveCcPidFromTerminalId('nobody', 'nobody', dirA)).toBeNull();
  });

  it('the win-cc-{port}-{pid} form never touches a directory at all', () => {
    // Format 1 short-circuits before any scan, so a blind venue cannot affect it.
    expect(resolveCcPidFromTerminalId('win-cc-1234-9876', null, dirB)).toBe(9876);
  });
});
