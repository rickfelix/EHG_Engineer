// SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 (FR-2) — scripts/tmp + scripts/temp
// scratch roots in sweep-worker-scratch.mjs. Hermetic: spawns the real CLI inside a
// throwaway git repo fixture (the script resolves its root via `git rev-parse`), and
// asserts the three contract points:
//   1. untracked files older than 7d are sweep candidates,
//   2. the 7-day minimum age gate holds even with --older-than-hours 0,
//   3. git-tracked files in those dirs are NEVER candidates (safety invariant).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWEEP = path.resolve(HERE, '../../scripts/maintenance/sweep-worker-scratch.mjs');

let fixture;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function runSweep(args, cwd) {
  return execFileSync(process.execPath, [SWEEP, ...args], { cwd, encoding: 'utf8' });
}

function writeAged(rel, ageDays) {
  const abs = path.join(fixture, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `// fixture ${rel}\n`);
  const t = new Date(Date.now() - ageDays * 86_400_000);
  fs.utimesSync(abs, t, t);
  return abs;
}

beforeAll(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-scratch-fix-'));
  git(['init', '-q'], fixture);
  git(['config', 'user.email', 'fixture@test'], fixture);
  git(['config', 'user.name', 'fixture'], fixture);

  writeAged('scripts/tmp/old-probe.mjs', 8);          // candidate: untracked, > 7d
  writeAged('scripts/tmp/nested/old-deep.sql', 9);    // candidate: recursive walk
  writeAged('scripts/tmp/fresh-probe.mjs', 1);        // protected: under the 7d gate
  const tracked = writeAged('scripts/temp/tracked-old.cjs', 30); // protected: tracked
  git(['add', path.relative(fixture, tracked).replace(/\\/g, '/')], fixture);
  git(['commit', '-q', '-m', 'fixture tracked file'], fixture);
  writeAged('scripts/one-off/old-deliverable.mjs', 30); // protected: excluded dir
});

afterAll(() => {
  try { fs.rmSync(fixture, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('sweep-worker-scratch scripts/tmp + scripts/temp roots', () => {
  it('dry-run plans only untracked >7d files under the scratch roots', () => {
    const out = runSweep(['--verbose'], fixture);
    expect(out).toContain('scripts/tmp/old-probe.mjs');
    expect(out).toContain('scripts/tmp/nested/old-deep.sql');
    expect(out).not.toContain('fresh-probe.mjs');       // 7d gate
    expect(out).not.toContain('tracked-old.cjs');       // tracked invariant
    expect(out).not.toContain('old-deliverable.mjs');   // one-off stays excluded
    expect(out).toContain('dry-run');                   // default is never destructive
    // Nothing deleted by a dry-run.
    expect(fs.existsSync(path.join(fixture, 'scripts/tmp/old-probe.mjs'))).toBe(true);
  });

  it('--older-than-hours 0 cannot lower the 7-day scripts-scratch gate', () => {
    const out = runSweep(['--older-than-hours', '0', '--verbose'], fixture);
    expect(out).toContain('scripts/tmp/old-probe.mjs'); // still old enough
    expect(out).not.toContain('fresh-probe.mjs');       // per-candidate Math.max gate held
  });

  it('--execute removes the aged untracked files and spares everything else', () => {
    runSweep(['--execute'], fixture);
    expect(fs.existsSync(path.join(fixture, 'scripts/tmp/old-probe.mjs'))).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'scripts/tmp/nested/old-deep.sql'))).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'scripts/tmp/fresh-probe.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(fixture, 'scripts/temp/tracked-old.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(fixture, 'scripts/one-off/old-deliverable.mjs'))).toBe(true);
  });
});
