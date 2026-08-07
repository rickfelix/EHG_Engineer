/**
 * QF-20260801-998 — three defects found AFTER SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-C
 * merged (PR #6719). Each one is a guard that stopped guarding, or never started.
 *
 * The unifying lesson: closing the walk-up removed a bug that had been ACCIDENTALLY
 * providing protection. `.worktrees/_archive` was never safe to delete; it was merely
 * reported dirty because the walk-up attributed the parent's dirt to it. Protection by
 * a bug is not protection, and removing the bug exposes everything that leaned on it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isReapable,
  REAP_REASONS,
  WORKTREE_CONTAINER_DIRS,
} from '../../../lib/worktree-reapability.js';
import { WORKTREE_QUOTA_HELPERS } from '../../../lib/worktree-quota.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

describe('FIX 1 — container dirs under .worktrees/ are never reapable', () => {
  let root;
  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qf998-')));
  });
  afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('_archive is refused, and the refusal does NOT depend on git saying anything', () => {
    const archive = path.join(root, '_archive');
    fs.mkdirSync(archive);
    fs.writeFileSync(path.join(archive, 'old-worktree-contents.txt'), 'forty of these\n');

    // A runner that would otherwise report the dir spotlessly clean and reapable. The
    // guard must win anyway: it is a structural fact about the path, not an observation.
    const cleanRunner = () => ({ code: 0, stdout: '', stderr: '' });
    const r = isReapable(archive, { liveOwner: false, gitRunner: cleanRunner });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.CONTAINER_DIR);
  });

  it('every container name is refused — not just the one that was found on disk', () => {
    for (const name of WORKTREE_CONTAINER_DIRS) {
      const d = path.join(root, name);
      fs.mkdirSync(d, { recursive: true });
      const r = isReapable(d, { liveOwner: false, gitRunner: () => ({ code: 0, stdout: '', stderr: '' }) });
      expect(r.reason, `container "${name}" must be refused`).toBe(REAP_REASONS.CONTAINER_DIR);
    }
  });

  it('OPPOSITE POLARITY: an ordinary orphan is still reapable — the guard is narrow', () => {
    const ordinary = path.join(root, 'SD-SOME-ORDINARY-ORPHAN-001');
    fs.mkdirSync(ordinary, { recursive: true });
    const r = isReapable(ordinary, { liveOwner: false, gitRunner: () => ({ code: 0, stdout: '', stderr: '' }) });
    expect(r.reapable).toBe(true);
    expect(r.reason).toBe(REAP_REASONS.ORPHAN_CLEAN);
  });

  it('ONE definition, not two — quota re-exports rather than redefining', () => {
    // Two copies would drift the moment either was edited, and only one of them guards
    // deletion. Identity, not deep-equality: a duplicated literal passes toEqual.
    expect(WORKTREE_QUOTA_HELPERS).toBe(WORKTREE_CONTAINER_DIRS);
  });
});

describe('FIX 2 — a path alias must not defeat the ownership probe', () => {
  let root;
  beforeAll(() => { root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'qf998-alias-'))); });
  afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('a DIRTY worktree reached through an alias is still protected', () => {
    // The real directory owns its git state and is genuinely dirty.
    const real = path.join(root, 'real-worktree');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, '.git'), 'gitdir: /somewhere\n');

    // The alias: a second path that resolves to the SAME directory. git answers with the
    // REAL path, while path.resolve leaves the alias spelling intact — which is exactly
    // how a genuinely-owned tree came to read as a walk-up and got licensed for deletion.
    const alias = path.join(root, 'alias-worktree');
    let aliased = false;
    try { fs.symlinkSync(real, alias, 'junction'); aliased = fs.existsSync(alias); } catch { aliased = false; }
    if (!aliased) return; // unprivileged CI cannot create links; FIX 1/3 still cover the QF

    const runner = (args) => {
      if (args[0] === 'status') return { code: 0, stdout: ' M inflight.js\n', stderr: '' };
      if (args[0] === 'rev-parse') return { code: 0, stdout: real, stderr: '' }; // git returns the REAL path
      return { code: 0, stdout: '', stderr: '' };
    };

    const r = isReapable(alias, { liveOwner: false, gitRunner: runner });
    expect(r.reapable).toBe(false);
    expect(r.reason).toBe(REAP_REASONS.DIRTY_TREE);
  });

  it('OPPOSITE POLARITY: realpathing does not resurrect the walk-up it was meant to catch', () => {
    const orphan = path.join(root, 'genuine-orphan');
    fs.mkdirSync(orphan, { recursive: true });
    const runner = (args) => {
      if (args[0] === 'status') return { code: 0, stdout: ' M parent.js\n?? junk.txt\n', stderr: '' };
      if (args[0] === 'rev-parse') return { code: 0, stdout: root, stderr: '' }; // the ANCESTOR
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = isReapable(orphan, { liveOwner: false, gitRunner: runner });
    expect(r.reapable).toBe(true);
    expect(r.reason).toBe(REAP_REASONS.ORPHAN_CLEAN);
  });
});

describe('FIX 3 — the stranded-worker detector is actually WIRED', () => {
  // SD-...-001-C unit-tested detectStrandedWorker thoroughly and shipped it importing
  // nowhere, so DUTY-8b never ran. Behaviour tests prove a detector BEHAVES; only the
  // call site proves it is ASKED. This asserts the call site, by name, in the consumer.
  const audit = readFileSync(path.join(REPO, 'scripts/coordinator-charter-audit.mjs'), 'utf8');

  it('is imported by the charter audit', () => {
    expect(audit).toMatch(/detectStrandedWorker,?\s*\n?\s*\}?\s*from '\.\.\/lib\/coordinator\/charter-audit-detectors\.mjs'|detectStrandedWorker/);
    const importBlock = audit.slice(0, audit.indexOf("from '../lib/coordinator/charter-audit-detectors.mjs'"));
    expect(importBlock).toContain('detectStrandedWorker');
  });

  it('is INVOKED, not merely imported — an unused import is still dead code', () => {
    expect(audit).toMatch(/stranded:\s*detectStrandedWorker\(/);
  });

  it('is invoked with a real fs probe and the live worker set', () => {
    const call = audit.slice(audit.indexOf('stranded: detectStrandedWorker('));
    expect(call.slice(0, 600)).toContain('liveSessions: liveWorkers');
    expect(call.slice(0, 600)).toContain('probeWorktree');
    expect(call.slice(0, 600)).toMatch(/existsSync/);
  });

  it('its finding reaches the operator — a detector nobody prints is nobody informed', () => {
    expect(audit).toMatch(/DUTY-8b[^\n]*D\.stranded\.detail/);
  });
});
