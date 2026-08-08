/**
 * FR-1b (CORRECTED) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001. The census/escalation SPLIT.
 *
 * WHY THIS FR CHANGED, recorded because the original wording was a data-loss hazard: the row used
 * to say the >=80% emergency reap "must fire even when the currency check would refuse". Built
 * literally that runs --stage0 --execute FROM A STALE TREE — the exact hazard the refusal exists to
 * prevent, since the reaper's code identity IS that tree's HEAD, so a reap-protection guard present
 * on origin/main but physically absent from the running file ships INERT. That is how the
 * reap-protected marker failed once already. The corrected FR is a SPLIT.
 *
 * WHAT IS ACTUALLY TRUE TODAY (measured, and independently confirmed by PLAN TESTING):
 *   - the NON-DESTRUCTIVE census/watchdog READ already runs on EVERY refusal
 *     (worktree-reaper-tick.cjs:271-297, moved there by QF-20260726-794), and
 *   - the DESTRUCTIVE escalation is already unreachable during a refusal (the catch returns early).
 * gauge-registry.js:397 describing the census as "downstream" is STALE NARRATION of the pre-794
 * state — I believed it once and wrote an FR on it, which is why the correction is spelled out here.
 *
 * SO THESE ARE REGRESSION GUARDS, NOT PROOF OF A FIX. They CANNOT FAIL against today's code. That
 * is stated deliberately: an unlabelled fact-pin reads as behaviour coverage, and this SD has
 * already been bitten by a suite that went green through the regression it guarded.
 *
 * COVERAGE MAP, corrected after PLAN TESTING refuted my first account of it. Each test names the
 * regression it can actually detect, because a test named for a property it CANNOT detect is worse
 * than no test — it reads as coverage:
 *   - TS-3  detects the CENSUS moving back below the early return.        (real discriminating power)
 *   - TS-9  detects ANY reaper execution during a refusal.                (real discriminating power)
 *   - TS-9b detects the ESCALATION being hoisted above the refusal return. (the only test that
 *     covers it BY DESIGN — measured: tick.test.js:329 also reddens under that hoist, but
 *     incidentally, so it would not survive an unrelated refactor of that suite)
 * TS-3 and TS-9 do NOT detect the escalation hoist — in a tmp fixture the >=80% watchdog never
 * triggers, so that branch is unreachable and both pass unchanged. I originally claimed otherwise.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const TICK_PATH = path.join(process.cwd(), 'scripts', 'fleet', 'worktree-reaper-tick.cjs');

let tmpRoot;
const origEnv = { ...process.env };

/** A stand-in reaper that leaves a sentinel IF it is ever executed. */
function writeSentinelReaper(root) {
  const dir = path.join(root, 'scripts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'worktree-reaper.mjs'),
    "import fs from 'node:fs';\nfs.writeFileSync(new URL('../REAPER_RAN.sentinel', import.meta.url), 'ran');\n",
  );
}

/** Reports the tree as 7 commits behind, and refuses to let a self-heal pull go unnoticed. */
const staleRunner = (args) => {
  if (args[0] === 'rev-list') return '7\n';
  if (args[0] === 'pull') throw new Error('pull must never be attempted by the reaper');
  return '';
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-split-'));
  fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
  process.env.WORKTREE_REAPER_ENABLED = 'true';
});
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  process.env = { ...origEnv };
});

describe('FR-1b: the census runs during a refusal; the destructive escalation does not', () => {
  it('TS-3 REGRESSION GUARD (cannot fail today, by design): the census/BACKLOG line is emitted on a refusal', () => {
    // Pins existing post-QF-794 behaviour. If a future edit moves the census back below the early
    // return, the pool becomes invisible for the whole starvation window — which is precisely the
    // condition that went unnoticed for 12 consecutive refusals.
    writeSentinelReaper(tmpRoot);
    const lines = [];
    const { tick } = require_(TICK_PATH);
    const res = tick({
      repoRoot: tmpRoot, cadence: 3, force: true,
      logger: (m) => lines.push(String(m)),
      currencyRunner: staleRunner, currencyEnv: {},
      sourceExists: () => false, sourceRunner: () => { throw new Error('no source tree in this fixture'); },
    });
    expect(res.result).toBe('refused_stale_tree');
    expect(lines.some((l) => /BACKLOG/.test(l))).toBe(true);
    expect(lines.some((l) => /UNREAPED for \d+ consecutive tick/.test(l))).toBe(true);
  });

  it('TS-9 BEHAVIOURAL: a refusal executes NOTHING — no reaper process, destructive or otherwise', async () => {
    // The sentinel is the load-bearing part: it appears only if worktree-reaper.mjs actually ran.
    //
    // CORRECTED AFTER PLAN TESTING REFUTED ME. This comment used to claim that hoisting the
    // --stage0 --execute escalation above the currency early-return would make this test fail.
    // THAT WAS FALSE, and I asserted it without executing it. Under that hoist this test PASSES
    // UNCHANGED: countActiveWorktrees reports ZERO worktrees in a tmp fixture, so watchdog.triggered
    // is false and the escalation line is never reached at all. TS-9 has ZERO discriminating power
    // against the escalation-placement regression.
    //
    // What TS-9 ACTUALLY pins, and all it pins: during a refusal, NO reaper process runs by any
    // path. That is worth pinning. Escalation PLACEMENT is protected only by TS-9b below — which is
    // why TS-9b is structural rather than decorative, and why deleting it would leave the
    // PRD's blocking-finding diff completely uncovered.
    //
    // The general lesson, recorded because it cost a reviewer's time: an unverified caveat is a
    // confident guess wearing humility. Execute the mutation before describing how a test fails.
    writeSentinelReaper(tmpRoot);
    const { tick } = require_(TICK_PATH);
    const res = tick({
      repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {},
      currencyRunner: staleRunner, currencyEnv: {},
      sourceExists: () => false, sourceRunner: () => { throw new Error('no source tree in this fixture'); },
    });
    expect(res.result).toBe('refused_stale_tree');
    expect(res.invoked).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(fs.existsSync(path.join(tmpRoot, 'REAPER_RAN.sentinel'))).toBe(false);
  });

  it('TS-9b SOURCE-ORDER: the destructive escalation sits AFTER the currency refusal returns', () => {
    // HONEST LIMITATION, stated rather than hidden: countActiveWorktrees is not injectable through
    // tick()'s opts (it calls spawnSync directly), and a tmp dir registers ZERO worktrees, so the
    // >=80% watchdog can never be driven over threshold in a fixture. The behavioural test above
    // therefore cannot exercise the escalation branch specifically — it proves only that nothing
    // ran at all. This source-order assertion covers the remaining gap.
    //
    // A structural test is weaker than a behavioural one and is labelled as such. It is not
    // decorative: relocating the escalation above the refusal is a one-line move, and this fails on
    // exactly that move.
    // MATCH THE CODE, NOT THE PROSE. My first version searched for the bare string '--stage0' and
    // failed — because a COMMENT at :185 mentions it, and comments sit above the refusal return.
    // A test that matches narration instead of the statement it means to pin is not a test of the
    // behaviour; it just happened to fail loudly here rather than pass vacuously.
    const src = fs.readFileSync(TICK_PATH, 'utf8');
    const refusalReturn = src.indexOf("result: 'refused_stale_tree'");
    const escalation = src.indexOf("args.push('--stage0')");
    expect(refusalReturn).toBeGreaterThan(-1);
    expect(escalation).toBeGreaterThan(-1);
    // The escalation STATEMENT must appear later in the file than the refusal's early return.
    expect(escalation).toBeGreaterThan(refusalReturn);
  });
});
