/**
 * SD-LEO-INFRA-REAPER-GH-SHELL-INJECTION-001 — a branch name must not be a command.
 *
 * WHY THIS TEST IS SHAPED THE WAY IT IS. The obvious test — grep the source for
 * `shell:` — pins a FACT, not a BEHAVIOUR, and this repo has already paid for that:
 * tests/unit/fleet/inflight-git-state.test.js records THREE unsafe refactors that passed a
 * source-grep-only version, including hoisting `const IS_WIN` out and writing
 * `shell: IS_WIN` — the exact shape lib/claim/wip-detector.cjs contained until this SD.
 *
 * A seam-injected fake is equally useless here: it replaces the very code that decides the
 * spawn options, so it can never observe them. Every existing test in detectors.test.js
 * injects runGh and therefore cannot see this defect at all.
 *
 * So these drive the REAL default runners against a REAL child process and assert what
 * actually arrived. `runGh` is exported for exactly this reason.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// Spy on the module the REAL runners spawn through, so the assertions below observe the
// options `runGh` actually passes rather than options a test constructed for itself.
//
// THE FIRST DRAFT OF THIS FILE DID NOT DO THIS AND WAS VACUOUS. It spawned a probe with
// hand-written option objects and asserted argv survived — which proves a fact about Node,
// not a fact about runGh. Re-introducing `shell: process.platform === 'win32'` at the real
// call site left all five tests GREEN (mutation verified applied, +42 bytes). Caught only
// by running the mutation. This is the same correct-but-not-wired failure the sibling SD
// spent a commit fixing; the lesson did not transfer on its own.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

const { spawnSync: spiedSpawnSync } = await import('node:child_process');
const { runGh } = await import('../../../scripts/worktree-reaper.mjs');

// A branch name git itself accepts: check-ref-format forbids space, ~, ^, :, ?, *, [ and
// backslash, but PERMITS & — which is all cmd.exe needs to chain a command.
const HOSTILE_BRANCH = 'feat/x&echo PWNED';

let dir, argvProbe, sentinel;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghinj-'));
  // Stand-in for `gh`: reports the argv it actually received.
  argvProbe = path.join(dir, 'argv-probe.cjs');
  fs.writeFileSync(argvProbe, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  sentinel = path.join(dir, 'PWNED.txt');
});

afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

/** Run the probe through node with the SAME options the fixed runners use. */
const runProbeNoShell = (args) => spawnSync(process.execPath, [argvProbe, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});

/** The OLD options, kept only so the assertions below have something to discriminate against. */
const runProbeWithShell = (args) => spawnSync(process.execPath, [argvProbe, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  shell: process.platform === 'win32',
});

const classificationArgs = (branch) => [
  'pr', 'list', '--search', `head:${branch}`, '--state', 'merged', '--json', 'number,state,mergedAt',
];

describe('argv integrity — a hostile branch arrives as ONE element', () => {
  test('no-shell spawn delivers the branch byte-identically, trailing args intact', () => {
    const args = classificationArgs(HOSTILE_BRANCH);
    const res = runProbeNoShell(args);
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual(args);
  });

  test('ARMING: the same call WITH a shell executes the payload — proving this suite discriminates', () => {
    // If this ever stops holding, the assertion above is no longer evidence of anything.
    if (process.platform !== 'win32') return; // shell:false on POSIX — nothing to contrast
    const stdout = runProbeWithShell(classificationArgs(HOSTILE_BRANCH)).stdout || '';
    // Deliberately NOT JSON.parse'd. The first draft of this test parsed it and threw,
    // which is the finding stated more sharply than the assertion was: with a shell the
    // injected `echo` does not merely REORDER argv, it REPLACES the process output — the
    // probe's JSON never reaches stdout at all. Assert on the raw bytes.
    expect(stdout).toContain('PWNED');
    expect(stdout.trimStart().startsWith('[')).toBe(false);
  });
});

describe('negative canary — absence of EXECUTION, not absence of a string', () => {
  test('a payload that would create a sentinel file does not run', () => {
    const payload = `feat/x&type nul > "${sentinel}"`;
    runProbeNoShell(classificationArgs(payload));
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  test('ARMING: the same payload DOES create the sentinel when a shell is present', () => {
    if (process.platform !== 'win32') return;
    const withShell = path.join(dir, 'SHELL_PROOF.txt');
    runProbeWithShell(classificationArgs(`feat/x&type nul > "${withShell}"`));
    // Proves the canary above is capable of failing — otherwise it asserts nothing.
    expect(fs.existsSync(withShell)).toBe(true);
    try { fs.rmSync(withShell, { force: true }); } catch { /* best effort */ }
  });
});

describe('THE LOAD-BEARING ASSERTION — the real runners spawn without a shell', () => {
  // Everything above demonstrates WHY a shell is dangerous. Only these observe what the
  // production code actually does, which is the only thing a regression can break.

  test('runGh passes NO shell option to spawnSync', () => {
    spiedSpawnSync.mockClear();
    try { runGh(['--version']); } catch { /* spawn failure is irrelevant to the options */ }
    expect(spiedSpawnSync).toHaveBeenCalled();
    const [bin, args, opts] = spiedSpawnSync.mock.calls.at(-1);
    expect(bin).toBe('gh');
    expect(Array.isArray(args)).toBe(true);
    // ABSENCE, not falsiness. `toBeFalsy()` looked equivalent and was not: CI runs on
    // ubuntu, where `shell: process.platform === 'win32'` evaluates to FALSE — so a
    // reinstated platform-conditional flag is falsy there and the assertion passes. TESTING
    // proved it by injecting `shell: process.platform === 'darwin'` at both sites and
    // watching all 8 tests stay green. The only platform CI runs this on was the one
    // platform on which it could not fail.
    //
    // Do NOT "improve" this by stubbing process.platform instead: a hoisted
    // `const IS_WIN` is evaluated at module load, before any stub, which is the exact
    // shape this file's docblock records as having defeated three prior refactors.
    expect(opts).not.toHaveProperty('shell');
  });

  test('runGh forwards a hostile branch as a discrete argv element, not a command string', () => {
    spiedSpawnSync.mockClear();
    const args = classificationArgs(HOSTILE_BRANCH);
    try { runGh(args); } catch { /* ignore */ }
    const [, delivered, opts] = spiedSpawnSync.mock.calls.at(-1);
    expect(delivered).toEqual(args);
    expect(opts).not.toHaveProperty('shell');
  });

  test('wip-detector defaultRunGh also spawns without a shell (the second site)', async () => {
    // ASSERTED BY PATH INJECTION, NOT BY MOCKING. hasOpenPr takes runGh as a required
    // parameter, so driving it through hasOpenPr observes only the runner the test
    // supplied — the seam problem again. And this file is CJS (`require('child_process')`),
    // a different specifier from the reaper's `node:child_process`, so an ESM module mock
    // does not reliably intercept it.
    //
    // So: put a REAL fake `gh` on PATH and let the real runner spawn it. No mocking, no
    // seam — if defaultRunGh ever regains a shell, the payload executes and the argv the
    // fake reports changes. This is the strongest available assertion and it is immune to
    // both failure modes above.
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakegh-'));
    const canary = path.join(binDir, 'WIP_PWNED.txt');
    const report = path.join(binDir, 'argv.json');
    try {
      const js = path.join(binDir, 'gh-impl.cjs');
      fs.writeFileSync(js, `require('fs').writeFileSync(${JSON.stringify(report)}, JSON.stringify(process.argv.slice(2)));\n`);
      if (process.platform === 'win32') {
        fs.writeFileSync(path.join(binDir, 'gh.cmd'), `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
      } else {
        const sh = path.join(binDir, 'gh');
        fs.writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`);
        fs.chmodSync(sh, 0o755);
      }

      const prevPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${prevPath}`;
      try {
        const { defaultRunGh } = await import('../../../lib/claim/wip-detector.cjs');
        const payloadBranch = `feat/x&type nul > "${canary}"`;
        const args = ['pr', 'list', '--state', 'open', '--head', payloadBranch, '--json', 'number'];
        defaultRunGh(args);

        // THE PAYLOAD DID NOT EXECUTE. This is the assertion that matters and it holds on
        // every platform.
        expect(fs.existsSync(canary)).toBe(false);

        if (process.platform === 'win32') {
          // ON WINDOWS THE NON-RESOLUTION *IS* THE PROOF, and this is a sharper
          // discriminator than argv inspection. The fake above is a `.cmd`, and a `.cmd`
          // is reachable ONLY through a shell — libuv appends `.exe`, and Node refuses
          // `.cmd` without a shell post-CVE-2024-27980. So:
          //   shell present -> gh.cmd resolves -> the fake runs -> report written
          //   shell absent  -> gh.cmd unreachable -> no report
          // A missing report therefore proves no shell was used. (It also confirms, at
          // ground truth, the residual documented at both runners: a .cmd/.bat gh shim
          // would ENOENT under shell:false — which is why that residual is written down
          // rather than assumed away.)
          expect(fs.existsSync(report)).toBe(false);

          // ARMING: the same fake IS reachable with a shell, so the check above is
          // capable of failing rather than passing because nothing ever happens.
          spawnSync('gh', args, { encoding: 'utf8', windowsHide: true, shell: true });
          expect(fs.existsSync(report)).toBe(true);
          const delivered = JSON.parse(fs.readFileSync(report, 'utf8'));
          expect(delivered).not.toEqual(args); // and the shell mangled it
        } else {
          // POSIX: the extensionless fake is directly executable, so assert argv integrity.
          expect(fs.existsSync(report)).toBe(true);
          expect(JSON.parse(fs.readFileSync(report, 'utf8'))).toEqual(args);
        }
      } finally {
        process.env.PATH = prevPath;
      }
    } finally {
      try { fs.rmSync(binDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });
});

describe('the fix did not trade an RCE for a silent capability loss', () => {
  test('the REAL default runGh still resolves gh and returns a usable result', () => {
    // The hazard that motivated shell:true was that Windows needs a shell to find gh.
    // That was refuted by measurement; this asserts it rather than assuming it.
    let res;
    try {
      res = runGh(['--version']);
    } catch (e) {
      // ENOENT here is the .cmd-shim residual, not a silent pass. Fail LOUDLY with the cause.
      throw new Error(`default runGh could not spawn gh (${e?.code || e?.message}). If gh is installed as a .cmd/.bat shim on this host, that is the documented residual — it must be handled, not ignored.`);
    }
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/^gh version/);
  });
});
