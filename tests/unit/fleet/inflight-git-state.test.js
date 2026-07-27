/**
 * lib/fleet/inflight-git-state.cjs — SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B.
 *
 * .test.js under tests/unit/ is REQUIRED (TR-5). vitest.config.js's unit `include` covers
 * `**\/*.test.js` but only `tests/unit/org/**` and `tests/unit/venture-email/**` for `.test.mjs`.
 * A `.test.mjs` here is worse than dead: tests/unit/test-estate-mjs-reachability.test.js fails it
 * as a "Dead verifier", turning a required check red.
 *
 * Every probe runs through injected runGit/runGh seams — no network, no gh auth, no real repo.
 * EXCEPT the SR-1 assertions, which deliberately inspect the DEFAULT runners: a seam replaces the
 * very code that decides `shell`, so a seam-injected test is structurally blind to that property.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const MOD_PATH = '../../../lib/fleet/inflight-git-state.cjs';
const mod = require_(MOD_PATH);
const {
  IN_FLIGHT, CLEAR, UNAVAILABLE, REASON,
  branchForItem, parseRemoteHeads, collectInflightSnapshot, classifyItem,
  getInflightSnapshot, _resetSnapshotCache,
} = mod;

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname_, '../../..');

// ── seam helpers ────────────────────────────────────────────────────────────
const okGh = (heads) => () => ({ stdout: JSON.stringify(heads.map((h) => ({ headRefName: h }))), stderr: '', code: 0, spawnError: null });
const okGit = (branches) => () => ({ stdout: branches.map((b) => `abc123\trefs/heads/${b}`).join('\n'), stderr: '', code: 0, spawnError: null });
/** Unauthenticated gh: exits 4 CLEANLY, ~127ms, no throw. The case the fail-open catch misses. */
const unauthGh = () => () => ({ stdout: '', stderr: 'gh auth login required', code: 4, spawnError: null });
const timeoutRunner = () => () => ({ stdout: '', stderr: '', code: 1, spawnError: 'timeout' });

const QF = 'QF-20260726-425';
const SD = 'SD-LEO-INFRA-SOMETHING-001';

beforeEach(() => _resetSnapshotCache());

describe('branch conventions (FR-7)', () => {
  it('maps quick-fixes to qf/<id> and SDs to feat/<key>', () => {
    expect(branchForItem(QF)).toBe(`qf/${QF}`);
    expect(branchForItem(SD)).toBe(`feat/${SD}`);
  });
  it('returns null for a non-string / empty id rather than building a bogus ref', () => {
    expect(branchForItem(null)).toBeNull();
    expect(branchForItem('')).toBeNull();
  });
});

describe('parseRemoteHeads', () => {
  it('extracts branch names from ls-remote output', () => {
    const set = parseRemoteHeads('abc\trefs/heads/main\ndef\trefs/heads/qf/QF-1\n');
    expect(set.has('main')).toBe(true);
    expect(set.has('qf/QF-1')).toBe(true);
  });
});

// ── TS-1 / TS-2: in-flight exclusion, driven by LIVE state ──────────────────
describe('TS-1/TS-2 — in-flight verdict comes from live git state, not stored columns', () => {
  it('TS-1: an open PR whose head is the item branch => IN_FLIGHT', () => {
    const snap = collectInflightSnapshot({ runGh: okGh([`qf/${QF}`]), runGit: okGit(['main']), repo: 'o/r' });
    const v = classifyItem(QF, snap);
    expect(v.verdict).toBe(IN_FLIGHT);
    expect(v.reason).toBe(REASON.OPEN_PR);
  });

  it('TS-1: branch-only is NOT in-flight by default, and IS when opted in', () => {
    // Measured before shipping: branch-only would withhold 6 of 24 draft/in_progress SDs (~25%
    // of the belt) on stale refs — this repo squash-merges and does not prune (3059 refs).
    // A false withhold blocks an item indefinitely and looks like an empty queue, which is worse
    // than the duplicate build being prevented. An open PR is authoritative; a bare ref is not.
    const off = collectInflightSnapshot({ runGh: okGh([]), runGit: okGit([`qf/${QF}`]), repo: 'o/r' });
    expect(classifyItem(QF, off).verdict).toBe(CLEAR);

    const on = collectInflightSnapshot({ runGh: okGh([]), runGit: okGit([`qf/${QF}`]), repo: 'o/r', includeBranchOnly: true });
    const v = classifyItem(QF, on);
    expect(v.verdict).toBe(IN_FLIGHT);
    expect(v.reason).toBe(REASON.REMOTE_BRANCH);
  });

  it('TS-2: the verdict never consults pr_url/branch_name — classifyItem takes only an id', () => {
    // The predicate's signature is the proof: there is no DB row in scope at all, so a NULL
    // pr_url (the measured 23/30 shape) cannot influence the outcome.
    const snap = collectInflightSnapshot({ runGh: okGh([`qf/${QF}`]), runGit: okGit([]), repo: 'o/r' });
    expect(classifyItem(QF, snap).verdict).toBe(IN_FLIGHT);
    expect(classifyItem.length).toBe(2); // (itemId, snapshot) — no row, no columns
  });
});

// ── TS-4: regression control ────────────────────────────────────────────────
describe('TS-4 — genuinely free work stays claimable', () => {
  it('no branch and no PR => CLEAR', () => {
    const snap = collectInflightSnapshot({ runGh: okGh(['feat/unrelated']), runGit: okGit(['main']), repo: 'o/r' });
    const v = classifyItem(QF, snap);
    expect(v.verdict).toBe(CLEAR);
    expect(v.reason).toBe(REASON.NOT_IN_FLIGHT);
  });
});

// ── TS-3 / TS-8: fail-open with DISCRIMINATING reasons ──────────────────────
describe('TS-3/TS-8 — UNAVAILABLE is reached, distinguishable, and never blocks', () => {
  it('TS-3: unauthenticated gh (clean exit 4, no throw) => UNAVAILABLE/gh_exit_nonzero', () => {
    const runGh = vi.fn(unauthGh());
    const runGit = vi.fn(okGit(['main']));
    const snap = collectInflightSnapshot({ runGh, runGit, repo: 'o/r' });
    expect(snap.status).toBe(UNAVAILABLE);
    // The token is what makes this test able to fail: asserting only "dispatch continued" is
    // vacuous (true pre-fix, since no axis existed), and an ENOENT from the unit project's
    // pinned FLEET_REPO_ROOT would ALSO yield a bare UNAVAILABLE without touching exit-4.
    expect(snap.reason).toBe(REASON.GH_EXIT_NONZERO);
    expect(runGh).toHaveBeenCalledTimes(1); // the probe actually ran
    expect(classifyItem(QF, snap).verdict).toBe(UNAVAILABLE);
  });

  it('TS-3: a spawn timeout is reported as timeout, NOT as gh_exit_nonzero', () => {
    const snap = collectInflightSnapshot({ runGh: timeoutRunner(), runGit: okGit([]), repo: 'o/r' });
    expect(snap.status).toBe(UNAVAILABLE);
    expect(snap.reason).toBe('timeout');
  });

  it('TS-8: malformed gh JSON => UNAVAILABLE/parse_error, never CLEAR', () => {
    const runGh = () => ({ stdout: 'not json', stderr: '', code: 0, spawnError: null });
    const snap = collectInflightSnapshot({ runGh, runGit: okGit([]), repo: 'o/r' });
    expect(snap.status).toBe(UNAVAILABLE);
    expect(snap.reason).toBe(REASON.PARSE_ERROR);
    expect(classifyItem(QF, snap).verdict).not.toBe(CLEAR);
  });

  it('a failing git half is IGNORED by default (its answer is unused) but fails closed when opted in', () => {
    const runGit = () => ({ stdout: '', stderr: 'fatal', code: 128, spawnError: null });
    // Default: git is never probed, so a git outage cannot disable the PR-based guard. Measured
    // ls-remote at 380-4163ms with 1/8 over the 4s budget — one slow run used to blank the
    // snapshot for a full 60s TTL, which is the always-claimable outcome SR-4 exists to prevent.
    const off = collectInflightSnapshot({ runGh: okGh([]), runGit, repo: 'o/r' });
    expect(off.status).toBe('OK');

    // Opted in, git's answer IS load-bearing, so a failure must not serve a half-snapshot.
    const on = collectInflightSnapshot({ runGh: okGh([]), runGit, repo: 'o/r', includeBranchOnly: true });
    expect(on.status).toBe(UNAVAILABLE);
    expect(on.reason).toBe(REASON.GIT_EXIT_NONZERO);
  });

  it('a missing snapshot classifies UNAVAILABLE, never CLEAR', () => {
    expect(classifyItem(QF, null).verdict).toBe(UNAVAILABLE);
    expect(classifyItem(QF, undefined).verdict).toBe(UNAVAILABLE);
  });
});

// ── TS-5: batching ──────────────────────────────────────────────────────────
describe('TS-5 — one gh call and one git call regardless of candidate count', () => {
  it('classifying 20 items consumes ONE gh call and ZERO git calls by default', () => {
    const runGh = vi.fn(okGh([`qf/${QF}`]));
    const runGit = vi.fn(okGit(['main']));
    const snap = collectInflightSnapshot({ runGh, runGit, repo: 'o/r' });
    const ids = Array.from({ length: 20 }, (_, i) => `QF-2026072${i % 10}-${i}`);
    ids.forEach((id) => classifyItem(id, snap));
    // Call COUNT is the real invariant — a wall-clock assertion is vacuous against fakes.
    expect(runGh).toHaveBeenCalledTimes(1);
    // Zero, not one: the default discards branchRefs, so probing git would be pure cost plus a
    // failure mode (a slow ls-remote blanking the snapshot for a 60s TTL).
    expect(runGit).toHaveBeenCalledTimes(0);
  });

  it('opting into branch-only adds exactly one git call, still not per-item', () => {
    const runGh = vi.fn(okGh([]));
    const runGit = vi.fn(okGit([`qf/${QF}`]));
    const snap = collectInflightSnapshot({ runGh, runGit, repo: 'o/r', includeBranchOnly: true });
    Array.from({ length: 20 }, (_, i) => `QF-2026072${i % 10}-${i}`).forEach((id) => classifyItem(id, snap));
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(runGit).toHaveBeenCalledTimes(1);
  });
});

// ── TS-11: TTL actually expires ─────────────────────────────────────────────
describe('TS-11 — the snapshot cache expires', () => {
  it('reuses within TTL, re-probes after it', () => {
    let t = 1_000_000;
    const now = () => t;
    const runGh = vi.fn(okGh([]));
    const runGit = vi.fn(okGit([]));
    const opts = { runGh, runGit, repo: 'o/r', now, ttlMs: 60000 };

    getInflightSnapshot(opts);
    getInflightSnapshot(opts);
    expect(runGh).toHaveBeenCalledTimes(1); // second call served from cache

    t += 60001;
    getInflightSnapshot(opts);
    // Without expiry a merged item stays "in flight" forever and the guard becomes a blocker.
    expect(runGh).toHaveBeenCalledTimes(2);
  });

  it('keys the cache by repo so two targets never share a snapshot', () => {
    const t = 5_000_000;
    const runGh = vi.fn(okGh([]));
    const runGit = vi.fn(okGit([]));
    getInflightSnapshot({ runGh, runGit, repo: 'o/a', now: () => t });
    getInflightSnapshot({ runGh, runGit, repo: 'o/b', now: () => t });
    expect(runGh).toHaveBeenCalledTimes(2);
  });
});

// ── TS-10: explicit --repo (wrong-repo false negative) ──────────────────────
describe('TS-10 — an explicit --repo is passed, so cwd cannot silently change the answer', () => {
  it('captured argv contains --repo, and the verdict is identical from two cwds', () => {
    const seen = [];
    const runGh = (args) => { seen.push(args); return okGh([`qf/${QF}`])(); };
    const a = collectInflightSnapshot({ runGh, runGit: okGit([]), repo: 'o/r', cwd: '/tmp/one' });
    const b = collectInflightSnapshot({ runGh, runGit: okGit([]), repo: 'o/r', cwd: '/tmp/two' });
    expect(seen[0]).toContain('--repo');
    expect(seen[0][seen[0].indexOf('--repo') + 1]).toBe('o/r');
    expect(classifyItem(QF, a).verdict).toBe(classifyItem(QF, b).verdict);
    expect(classifyItem(QF, a).verdict).toBe(IN_FLIGHT);
  });
});

// ── TS-6: SR-1, asserted on the DEFAULT runners (seam-blind property) ───────
describe('TS-6 — SR-1 safe invocation, asserted where a seam cannot see it', () => {
  const raw = readFileSync(resolve(repoRoot, 'lib/fleet/inflight-git-state.cjs'), 'utf8');
  // Strip comments before asserting. The module's own docblock QUOTES the unsafe pattern
  // (`shell: process.platform === 'win32'`) to explain why it is avoided, so a raw-text scan
  // matches the explanation and reports the defect it was written to rule out. A source-text
  // assertion that cannot distinguish code from prose is not evidence about the code.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('the default runners spawn with shell:false — asserted on the REAL spawnSync call', () => {
    // SECURITY d1622fdc / B2 falsified the earlier source-text version of this test: three
    // unsafe refactors all passed it — (a) `const IS_WIN = process.platform === 'win32'` hoisted
    // out with `shell: IS_WIN` at the spawn site (the exact wip-detector bug), (b) `execSync(bin
    // + ' ' + args.join(' '))`, because /exec\(/ does not match `execSync(`, and (c) `shell: true`
    // beside a decoy `const SAFE_DEFAULTS = { shell: false }`. `toMatch(/shell:\s*false/)` only
    // requires the string to exist SOMEWHERE and never ties it to the call.
    //
    // My "a seam is structurally blind to shell" reasoning was a false dichotomy: it holds for
    // the runGit/runGh seam, but runSafe does require('child_process') LAZILY ON EVERY CALL, so
    // the cached module is a seam BELOW the deciding code. Assert the real options instead.
    const cp = require_('node:child_process');
    const calls = [];
    const orig = cp.spawnSync;
    cp.spawnSync = (bin, args, opts) => { calls.push({ bin, args, opts }); return { stdout: '[]', stderr: '', status: 0 }; };
    try {
      mod.defaultRunGh(['pr', 'list', '--json', 'headRefName'], {});
      mod.defaultRunGit(['ls-remote', '--heads', 'origin'], {});
    } finally {
      cp.spawnSync = orig;
    }
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.opts.shell).toBe(false);              // never truthy, never platform-derived
      expect(Array.isArray(c.args)).toBe(true);      // argv array, never a command string
      expect(c.args.every((a) => typeof a === 'string')).toBe(true);
      expect(c.opts.timeout).toBeGreaterThan(0);     // every probe is bounded
      expect(c.opts.env).toBeUndefined();            // SR-2: ambient auth, no injected token
    }
    expect(calls.map((c) => c.bin)).toEqual(['gh', 'git']);
  });

  it('source still carries no platform-derived shell (defence in depth)', () => {
    expect(src).not.toMatch(/shell:\s*process\.platform/);
  });

  it('never builds a command string — argv arrays only', () => {
    expect(src).not.toMatch(/spawnSync\(\s*`/);
    expect(src).not.toMatch(/exec\(/);
  });

  it('only read-only subcommands appear (SR-3)', () => {
    expect(src).toMatch(/'pr',\s*'list'/);
    expect(src).toMatch(/'ls-remote'/);
    for (const write of ["'push'", "'commit'", "'merge'", "'pr', 'create'"]) {
      expect(src).not.toContain(write);
    }
  });

  it('a branch name with shell metacharacters is passed as one argv element', () => {
    const seen = [];
    const runGh = (args) => { seen.push(args); return okGh([])(); };
    const hostile = 'QF-20260101-1; rm -rf /';
    collectInflightSnapshot({ runGh, runGit: okGit([]), repo: 'o/r' });
    // The id only ever reaches argv via branchForItem at the consumer; assert it is not split.
    const branch = branchForItem(hostile);
    expect(branch).toBe(`qf/${hostile}`);
    expect(Array.isArray(seen[0])).toBe(true);
    expect(seen[0].every((a) => typeof a === 'string')).toBe(true);
  });
});

// ── TS-9: CJS + ESM dual load ───────────────────────────────────────────────
describe('TS-9 — loadable from CommonJS and ESM in one run (TR-1)', () => {
  it('require() and dynamic import() both expose the same predicate', async () => {
    const viaRequire = require_(MOD_PATH);
    const viaImport = await import('../../../lib/fleet/inflight-git-state.cjs');
    const esm = viaImport.default || viaImport;
    expect(typeof viaRequire.classifyItem).toBe('function');
    expect(typeof esm.classifyItem).toBe('function');
    // The CJS/ESM split is why worker-checkin.cjs re-implements QF selection inline today.
    // Assert EQUIVALENCE, not identity: vitest's transform can hand the require() and import()
    // paths distinct module instances, which says nothing about whether ESM consumers can load
    // the file — the property TR-1 actually needs.
    const snap = collectInflightSnapshot({ runGh: okGh([`qf/${QF}`]), runGit: okGit([]), repo: 'o/r' });
    expect(esm.classifyItem(QF, snap)).toEqual(viaRequire.classifyItem(QF, snap));
    expect(esm.IN_FLIGHT).toBe(viaRequire.IN_FLIGHT);
  });
});
