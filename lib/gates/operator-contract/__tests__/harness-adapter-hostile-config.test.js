/**
 * SEC — the CWD is a trust sink, because git reads the TARGET repo's .git/config first.
 * SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002 (SECURITY row 4a1d302b)
 *
 * Argv-safety was never the only sink at this call. SECURITY demonstrated it: a fixture repo
 * with `diff.external` set in its OWN config EXECUTED that command when collectSdDiff ran
 * against it, and the spawned child INHERITED process.env with SUPABASE_SERVICE_ROLE_KEY
 * present. The same run reported a CLEAN read of a file it never read — the identical
 * silent-blinding class as the pathspec finding, reached through config instead of argv.
 *
 * The sink is inherited. This SD made it REACHABLE by introducing the first data-flow into
 * appPath (the read-back CLI passes a path out of the database), so the guard belongs here.
 *
 * TWO-SIDED BY CONSTRUCTION, and that is the whole point: the ARM proves a raw git invocation
 * in the same repo really does run the configured command, so the FIX assertion cannot pass
 * vacuously against a repo where the vector was never live.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectSdDiff } from '../harness-adapter.js';

const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };
const dirs = [];
afterEach(() => { while (dirs.length) rm(dirs.pop()); });

/** A repo whose OWN config sets diff.external to a command that writes a marker file. */
function makeTextconvRepo() {
  // GAP-2 (VALIDATION row 419fe764): --no-ext-diff closes diff.external and
  // diff.<drv>.command. It does NOT close TEXTCONV, which is a separate switch. VALIDATION
  // demonstrated BOTH failure modes against the shipped code through this door: the command
  // executed, AND the read came back empty — a clean report of a file never read. One vector
  // closed, a sibling left open, is the shape that makes a guard feel finished.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-textconv-'));
  dirs.push(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['branch', '-f', 'basebranch']);

  const marker = path.join(dir, 'TEXTCONV_EXECUTED.txt');
  const script = path.join(dir, 'tc.cjs');
  fs.writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.stdout.write('');\n`);
  const node = process.execPath.replace(/\\/g, '/');
  git(dir, ['config', 'diff.evil.textconv', `"${node}" "${script.replace(/\\/g, '/')}"`]);
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.sql diff=evil\n');
  fs.writeFileSync(path.join(dir, 'payload.sql'), 'CREATE TABLE widgets (id uuid);\n');
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'add payload']);
  return { dir, marker };
}

function makeHostileRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-hostile-'));
  dirs.push(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['branch', '-f', 'basebranch']);
  fs.writeFileSync(path.join(dir, 'payload.sql'), 'CREATE TABLE widgets (id uuid);\n');
  git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', 'add payload']);

  // The vector: an external diff driver configured in the TARGET repo. `git hash-object` is a
  // real, harmless git subcommand that WRITES A LOOSE OBJECT into the repo — an observable
  // side effect, so the marker is proof of execution without running anything destructive.
  const marker = path.join(dir, 'EXECUTED.txt');
  const node = process.execPath.replace(/\\/g, '/');
  const script = path.join(dir, 'driver.cjs');
  fs.writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');\n`);
  git(dir, ['config', 'diff.external', `"${node}" "${script.replace(/\\/g, '/')}"`]);
  return { dir, marker };
}

describe('SEC — a hostile diff.external in the TARGET repo must not execute', () => {
  it('THE ARM: a raw git diff in that repo DOES run the configured driver', () => {
    // Without this, the fix assertion below could pass against a repo where nothing was ever
    // armed — a guard proven only against an inert fixture proves nothing.
    const { dir, marker } = makeHostileRepo();
    try {
      execFileSync('git', ['diff', 'basebranch...HEAD', '--', 'payload.sql'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { /* the driver produces no diff output; execution is what matters */ }
    expect(fs.existsSync(marker), 'the vector is not armed — this fixture proves nothing').toBe(true);
  });

  it('THE FIX: collectSdDiff creates NO marker', () => {
    const { dir, marker } = makeHostileRepo();
    collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(fs.existsSync(marker), 'the configured driver EXECUTED through collectSdDiff').toBe(false);
  });

  it('THE FIX, other side: it still READS the file — not blinded into a clean empty answer', () => {
    // The failure mode that matters most. My first attempt at this guard (`-c diff.external=`)
    // suppressed execution AND every content read, reporting a clean read of a file it never
    // read — the exact silent-blinding class the guard exists to prevent. Without this
    // assertion, that regression passes as a security fix.
    const { dir } = makeHostileRepo();
    const { migrations, createdTables, unreadable } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(migrations.map((m) => m.path)).toContain('payload.sql');
    expect(migrations[0].sql).toContain('CREATE TABLE');
    expect(createdTables).toContain('widgets');
    expect(unreadable).toEqual([]);
  });
});

describe('GAP-2 — the TEXTCONV sibling door, closed the same way', () => {
  it('THE ARM: a raw git diff DOES run the configured textconv', () => {
    const { dir, marker } = makeTextconvRepo();
    try {
      execFileSync('git', ['diff', 'basebranch...HEAD', '--', 'payload.sql'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { /* execution is what matters, not output */ }
    expect(fs.existsSync(marker), 'the textconv vector is not armed — this fixture proves nothing').toBe(true);
  });

  it('THE FIX: collectSdDiff creates NO marker', () => {
    const { dir, marker } = makeTextconvRepo();
    collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(fs.existsSync(marker), 'the configured textconv EXECUTED through collectSdDiff').toBe(false);
  });

  it('THE FIX, other side: the migration is STILL READ — textconv blinded it to empty', () => {
    // VALIDATION measured sqlLen:0 and createdTables:[] against the shipped code here. Without
    // this assertion, a guard that merely suppresses execution still ships the blinding.
    const { dir } = makeTextconvRepo();
    const { migrations, createdTables } = collectSdDiff({ appPath: dir, baseRef: 'basebranch' });
    expect(migrations[0].sql).toContain('CREATE TABLE');
    expect(createdTables).toContain('widgets');
  });
});
