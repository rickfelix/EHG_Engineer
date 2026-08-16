/**
 * SD-LEO-INFRA-COMPLETION-TIER-SCRIPT-EXIT-001 — completion-tier scripts exit promptly
 * (armCliTeardown) instead of hanging past the harness Bash timeout after real work completes.
 *
 * Technique per script, matched to PLAN-phase testing-agent review (avoids ever spawning a
 * script whose real invocation would mutate real fleet/governance state with no dry-run flag):
 *  - worker-checkin.cjs: source-pin (TS-1) + synthetic mechanism proof (TS-1b). The real file
 *    is never spawned in this suite -- it performs real, irreversible session_coordination /
 *    claim writes with no dry-run flag available.
 *  - post-merge-worktree-cleanup.js: source-pin (TS-2) + synthetic dual-arm proof (TS-2b).
 *  - stale-session-sweep.cjs: source-pin only (TS-3). Promise .then().then() ordering is a
 *    language guarantee once the literal chain shape is confirmed correct -- a live spawn
 *    would run the real, fleet-mutating sweep end-to-end (releases claims, cancels fixtures,
 *    hands back work items), which this suite deliberately avoids.
 *  - capture-completion-flags.js: real spawns for the 2 no-DB reject cases (TS-4, TS-4b, which
 *    both throw BEFORE any Supabase client is created) + a source-pin for the success path
 *    (TS-5).
 *  - TS-6: grep-guard — armCliTeardown usage present only in the 4 target files.
 *
 * TS-2 and TS-5 were ORIGINALLY written as real end-to-end child-process spawns (a nonexistent
 * --sdKey; a valid --sd with --flags '[]'). Both hung to this suite's spawn timeout when run
 * under `vitest run` (pool:'forks') even though the identical spawnSync call completes in well
 * under 1s outside vitest. Root cause: tests/setup.unit.js deliberately overwrites
 * SUPABASE_URL/SERVICE_ROLE_KEY with an unreachable sentinel host for the unit tier (by design
 * -- "a unit tier must never inherit ambient credentials, full stop") and patches
 * globalThis.fetch IN-PROCESS to fail fast against it. spawnSync's child inherits the
 * sentinel env vars but NOT the in-process fetch patch, so it attempts a real connection to the
 * unreachable sentinel host and hits the exact "sentinel host is SLOW to fail DNS resolution on
 * Windows (1.8s-11s per attempt)... compounding into a 40s+ stall" hazard setup.unit.js's own
 * header already documents as a known, previously-fenced-for class (SD-LEO-INFRA-CHECKER-
 * READBACK-WRITE-001, RCA a726dd91) -- just via a spawned subprocess rather than an in-process
 * client, a path that fence does not cover. Explicitly re-injecting real credentials into the
 * spawned child would work around that fence rather than respect its documented intent ("no
 * live network from the unit tier, full stop"), so TS-2/TS-5 were converted to source-pin
 * checks instead of forcing real DB access into a unit-tier test.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const HELPER = path.join(ROOT, 'lib', 'cli-graceful-exit.js').replace(/\\/g, '/');

function runInline(script, timeoutMs = 15000) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: timeoutMs, cwd: ROOT,
  });
  return { ...r, elapsedMs: Date.now() - t0 };
}

function runScript(relPath, args = [], timeoutMs = 15000) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, relPath), ...args], {
    encoding: 'utf8', timeout: timeoutMs, cwd: ROOT,
  });
  return { ...r, elapsedMs: Date.now() - t0 };
}

describe('TS-1: worker-checkin.cjs source-pin', () => {
  it('armCliTeardown is wired within 5 lines after the final JSON-result console.log', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'worker-checkin.cjs'), 'utf8');
    const idx = src.indexOf('console.log(JSON.stringify(result, null, 2));');
    expect(idx).toBeGreaterThan(-1);
    const after = src.slice(idx, idx + 1000);
    expect(after).toMatch(/armCliTeardown/);
    expect(after).toMatch(/await import\(['"]\.\.\/lib\/cli-graceful-exit\.js['"]\)/);
  });
});

describe('TS-1b: worker-checkin.cjs synthetic mechanism proof (real file never spawned)', () => {
  it('the exact call shape exits 0 promptly', () => {
    const r = runInline(`
      const { armCliTeardown } = await import('file://${HELPER}');
      await armCliTeardown(0, { backstopMs: 3000 });
    `);
    expect(r.status).toBe(0);
    expect(r.elapsedMs).toBeLessThan(2500);
  });
});

describe('TS-2 / TS-2b: post-merge-worktree-cleanup.js', () => {
  it('TS-2: source-pin — both the resolve and catch arms of emit() call armCliTeardown(0)', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'modules', 'shipping', 'post-merge-worktree-cleanup.js'), 'utf8');
    const emitIdx = src.indexOf('const emit = (p) =>');
    expect(emitIdx).toBeGreaterThan(-1);
    const emitBody = src.slice(emitIdx, emitIdx + 900);
    const armCalls = emitBody.match(/armCliTeardown\(0,/g) || [];
    expect(armCalls.length).toBe(2); // one per arm, preserving the always-exit-0 contract
  });

  it('TS-2b: synthetic proof both the resolve and reject arms call armCliTeardown(0)', () => {
    const resolveRun = runInline(`
      const { armCliTeardown } = await import('file://${HELPER}');
      await Promise.resolve({ cleaned: false })
        .then(async (result) => { await armCliTeardown(0, { backstopMs: 3000 }); });
    `);
    expect(resolveRun.status).toBe(0);
    expect(resolveRun.elapsedMs).toBeLessThan(2500);

    const rejectRun = runInline(`
      const { armCliTeardown } = await import('file://${HELPER}');
      await Promise.reject(new Error('synthetic'))
        .catch(async (err) => { await armCliTeardown(0, { backstopMs: 3000 }); });
    `);
    expect(rejectRun.status).toBe(0);
    expect(rejectRun.elapsedMs).toBeLessThan(2500);
  });
});

describe('TS-3: stale-session-sweep.cjs source-pin', () => {
  const src = readFileSync(path.join(ROOT, 'scripts', 'stale-session-sweep.cjs'), 'utf8');

  it('armSweepTeardown is chained strictly after stampSweepLiveness, never wrapped fire-and-forget', () => {
    expect(src).toMatch(/main\(\)\.then\(stampSweepLiveness\)\.then\(armSweepTeardown\)/);
  });

  it('stampSweepLiveness and armSweepTeardown are exported for independent testability', () => {
    expect(src).toMatch(/module\.exports\.stampSweepLiveness\s*=\s*stampSweepLiveness/);
    expect(src).toMatch(/module\.exports\.armSweepTeardown\s*=\s*armSweepTeardown/);
  });

  it('armSweepTeardown itself routes through armCliTeardown, never a bare process.exit', () => {
    const idx = src.indexOf('async function armSweepTeardown()');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/armCliTeardown/);
    expect(body).not.toMatch(/process\.exit\(/);
  });
});

describe('TS-4 / TS-4b / TS-5: capture-completion-flags.js', () => {
  it('TS-4: missing --sd exits 1 promptly, zero DB touch', () => {
    const r = runScript('scripts/capture-completion-flags.js', [], 15000);
    expect(r.status).toBe(1);
    expect(r.elapsedMs).toBeLessThan(2500);
  });

  it('TS-4b: malformed --flags JSON rejects and exits 1 promptly, zero DB touch (throws before the Supabase client is created)', () => {
    const r = runScript(
      'scripts/capture-completion-flags.js',
      ['--sd', 'TEST-FIXTURE-completion-tier-exit', '--flags', 'not-json'],
      15000
    );
    expect(r.status).toBe(1);
    expect(r.elapsedMs).toBeLessThan(2500);
  });

  it('TS-5: source-pin — the resolve arm passes through a pre-set process.exitCode instead of forcing 0', () => {
    const src = readFileSync(path.join(ROOT, 'scripts', 'capture-completion-flags.js'), 'utf8');
    expect(src).toMatch(/armCliTeardown\(Number\.isInteger\(process\.exitCode\)\s*\?\s*process\.exitCode\s*:\s*0,/);
  });
});

describe('TS-6: regression guard — armCliTeardown call/import present only in the 4 target files', () => {
  const TARGETS = [
    'scripts/worker-checkin.cjs',
    'scripts/modules/shipping/post-merge-worktree-cleanup.js',
    'scripts/stale-session-sweep.cjs',
    'scripts/capture-completion-flags.js',
  ];
  const EXCLUDED = [
    'scripts/handoff.js',
    'scripts/sd-start.js',
    'scripts/complete-quick-fix.js',
    'scripts/ship-preflight.js',
    'scripts/add-prd-to-database.js',
  ];
  const CALL_OR_IMPORT_SHAPE = /armCliTeardown\(|cli-graceful-exit/;

  for (const rel of TARGETS) {
    it(`${rel} contains an armCliTeardown call/import`, () => {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toMatch(CALL_OR_IMPORT_SHAPE);
    });
  }

  for (const rel of EXCLUDED) {
    it(`${rel} contains no armCliTeardown call/import`, () => {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(CALL_OR_IMPORT_SHAPE);
    });
  }
});

describe('TS-7: teardown-failure isolation (round-2 adversarial review finding)', () => {
  // Round 1 found that if the new armCliTeardown call itself throws, it can fall through to a
  // pre-existing SIBLING handler (chained on the same promise) and either print a second,
  // contradictory JSON blob or mislabel a successful run as failed. The fix wraps each call in
  // its own try/catch. Round 2 found the suite above pins that armCliTeardown/import strings
  // exist, but never verifies the try/catch actually SURROUNDS them, or that the wrapping
  // genuinely prevents propagation -- so a future edit could silently drop the wrapping (
  // reintroducing the round-1 bug) without failing any existing test. These 2 tests close that.
  it('every armCliTeardown( call site in the 4 target files is directly wrapped by its own try { ... } catch, not just present nearby', () => {
    // Direct substring pins (not generic brace-parsing, which is fragile over minified/reformatted
    // code) -- each expected pattern is the actual shipped "try { ... armCliTeardown( ... } catch"
    // shape with no intervening closer between the try and the call. A future edit that keeps
    // armCliTeardown( somewhere in the file but drops or mis-scopes this exact wrapping fails here.
    const worker = readFileSync(path.join(ROOT, 'scripts', 'worker-checkin.cjs'), 'utf8');
    expect(worker).toMatch(/try \{\s*const \{ armCliTeardown \} = await import\([^)]+\);\s*await armCliTeardown\(0, \{ backstopMs: 3000 \}\);\s*\} catch/);

    const sweep = readFileSync(path.join(ROOT, 'scripts', 'stale-session-sweep.cjs'), 'utf8');
    expect(sweep).toMatch(/async function armSweepTeardown\(\) \{\s*try \{\s*const \{ armCliTeardown \} = await import\([^)]+\);\s*await armCliTeardown\(0, \{ backstopMs: 3000 \}\);\s*\} catch/);

    const cleanup = readFileSync(path.join(ROOT, 'scripts', 'modules', 'shipping', 'post-merge-worktree-cleanup.js'), 'utf8');
    const cleanupTryBlocks = cleanup.match(/try \{\s*const \{ armCliTeardown \} = await import\([^)]+\);\s*await armCliTeardown\(0, \{ backstopMs: 3000 \}\);\s*\} catch/g) || [];
    expect(cleanupTryBlocks.length).toBe(2); // one per arm

    const flags = readFileSync(path.join(ROOT, 'scripts', 'capture-completion-flags.js'), 'utf8');
    expect(flags).toMatch(/try \{\s*const \{ armCliTeardown \} = await import\([^)]+\);\s*await armCliTeardown\(Number\.isInteger\(process\.exitCode\) \? process\.exitCode : 0, \{ backstopMs: 3000 \}\);\s*\} catch/);
    expect(flags).toMatch(/try \{\s*const \{ armCliTeardown \} = await import\([^)]+\);\s*await armCliTeardown\(1, \{ backstopMs: 3000 \}\);\s*\} catch/);
  });

  it('synthetic proof: a throwing teardown call, wrapped exactly like the shipped pattern, does not propagate to a sibling .catch()', () => {
    // Mirrors the exact shape shipped in all 4 files: p.then(async () => { ...; try { await
    // teardown(); } catch {} }).catch(siblingHandler). If the try/catch were missing, the
    // throw would reach siblingHandler and this test's own exit code would flip to 1 (a real,
    // conditionally-throwing teardown stand-in is used -- not a mock of armCliTeardown itself).
    const r = runInline(`
      let siblingHandlerRan = false;
      await Promise.resolve('real-result')
        .then(async (result) => {
          try {
            const teardown = async () => { throw new Error('synthetic teardown failure'); };
            await teardown();
          } catch { /* exactly the shipped pattern */ }
        })
        .catch(() => { siblingHandlerRan = true; });
      if (siblingHandlerRan) process.exitCode = 1;
    `);
    expect(r.status).toBe(0);
  });
});
