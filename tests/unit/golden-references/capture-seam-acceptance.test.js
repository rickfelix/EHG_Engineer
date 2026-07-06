// Acceptance for the feedback/error-capture-seam golden reference. Behavioral-
// first and PARAMETERIZED over GOLDEN_REF_MODULE from line 1 (the -C fix) so a
// delegate's adapted COPY gets the same calling-enforcement. The load-bearing
// tests are the ones a grep cannot prove: a planted failure must leave a row AND
// a stderr line; a HOSTILE thrown value (null-proto, throwing getter) or a bad
// clock must NOT make the seam throw (the -F adversarial lesson: "never throws"
// is absolute); a THROWING sink/logger must not propagate; a falsy-but-valid
// return must not be miscaptured; and the captureContract must REJECT broken copies.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeSource, buildLocks } from '../../../golden-references/feedback-error-capture-seam/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const abs = (p, d) => (p ? (isAbsolute(p) ? p : join(REPO_ROOT, p)) : d);
const CANON_PATH = join(REPO_ROOT, 'golden-references', 'feedback-error-capture-seam', 'capture-seam.mjs');
const MODULE_PATH = abs(process.env.GOLDEN_REF_MODULE, CANON_PATH);
const SRC_PATH = abs(process.env.GOLDEN_REF_SRC, MODULE_PATH);
const SRC = readFileSync(SRC_PATH, 'utf8');

let captureBoundary, captureBoundaryAsync;
beforeAll(async () => {
  const mod = await import(pathToFileURL(MODULE_PATH).href);
  captureBoundary = mod.captureBoundary;
  captureBoundaryAsync = mod.captureBoundaryAsync;
});

// Injected harness: an in-memory sink (append + findByHash), a stderr logger, and a
// controllable clock — all injected, never singletons.
function makeHarness(startMs = 0) {
  const rows = [];
  const sink = {
    append: (e) => rows.push(e),
    findByHash: ({ category, dedup_hash }) => rows.find((r) => r.category === category && r.dedup_hash === dedup_hash),
  };
  const lines = [];
  const logger = { error: (l) => lines.push(l) };
  let t = startMs;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  return { sink, logger, clock, rows, lines };
}
const DEPS = (h, over = {}) => ({ sink: h.sink, logger: h.logger, clock: h.clock, category: 'harness_backlog', type: 'error', source: 'demo', ...over });

// A PORTABLE capture-contract checker — the teeth a delegate runs against their own
// copy. Returns contract VIOLATIONS (empty === compliant). Probes only OBSERVABLE
// outcomes (row/line counts, throw, return shape); shares NO hash helper.
function captureContractViolations(cb) {
  const v = [];
  { // capture-on-failure: failing op -> ok:false, exactly 1 row, >=1 stderr, no throw
    const h = makeHarness();
    let threw = false, r;
    try { r = cb(() => { throw new Error('x'); }, DEPS(h)); } catch { threw = true; }
    if (threw) v.push('throws-through');
    else {
      if (!(r && r.ok === false)) v.push('failure-not-ok-false');
      if (h.rows.length !== 1) v.push('no-row-on-failure');
      if (h.lines.length < 1) v.push('silent-on-failure');
    }
  }
  { // throw-safety: a HOSTILE thrown value must NOT make the seam throw (F1 class)
    const h = makeHarness();
    let threw = false;
    try { cb(() => { throw Object.create(null); }, DEPS(h)); } catch { threw = true; }
    if (threw) v.push('throws-on-hostile-input');
  }
  { // null-deps: a hostile NULL deps bag + a throwing op must NOT make the seam throw (the re-verify blocker)
    let threw = false;
    try { cb(() => { throw new Error('n'); }, null); } catch { threw = true; }
    if (threw) v.push('throws-on-null-deps');
  }
  { // hostile-deps: a deps whose property access throws (throwing getter / Proxy) must NOT make the seam throw
    let threw = false;
    try { cb(() => { throw new Error('n'); }, new Proxy({}, { get() { throw new Error('trap'); } })); } catch { threw = true; }
    if (threw) v.push('throws-on-hostile-deps');
  }
  { // healthy-path-silent: success -> no row, no stderr, ok:true
    const h = makeHarness();
    const r = cb(() => 1, DEPS(h));
    if (!(r && r.ok === true)) v.push('success-not-ok-true');
    if (h.rows.length !== 0 || h.lines.length !== 0) v.push('writes-on-healthy-path');
  }
  { // dedup-break: identical failure twice (clock advanced) -> must stay 1 row
    const h = makeHarness();
    try {
      cb(() => { throw new Error('dup'); }, DEPS(h));
      h.clock.advance(1000);
      cb(() => { throw new Error('dup'); }, DEPS(h));
      if (h.rows.length > 1) v.push('dedup-break');
    } catch { /* throw-through: flagged elsewhere */ }
  }
  { // best-effort: a THROWING sink.append must NOT propagate
    const badSink = { append: () => { throw new Error('sink down'); }, findByHash: () => null };
    let threw = false;
    try { cb(() => { throw new Error('y'); }, { sink: badSink, logger: { error: () => {} }, clock: { now: () => 0 }, category: 'c', source: 's' }); }
    catch { threw = true; }
    if (threw) v.push('sink-throws-propagates');
  }
  return v;
}

// REAL broken delegate copies (inline implementations the contract rejects).
const SWALLOW = (op) => { try { return { ok: true, value: op() }; } catch (e) { return { ok: false, error: e }; } };
const THROW_THROUGH = (op) => ({ ok: true, value: op() });
const ALWAYS_WRITE = (op, d) => { d.sink.append({ note: 'always' }); try { return { ok: true, value: op() }; } catch (e) { return { ok: false, error: e }; } };
const DEDUP_BREAK = (op, d) => {
  try { return { ok: true, value: op() }; } catch (e) {
    const sym = e && e.message ? e.message : String(e);
    d.sink.append({ category: d.category, dedup_hash: `${d.source}:${sym}:${d.clock.now()}`, symptom: sym }); d.logger.error('x');
    return { ok: false, error: e };
  }
};
const SINK_THROWS_PROPAGATES = (op, d) => {
  try { return { ok: true, value: op() }; } catch (e) {
    d.sink.append({ category: d.category, dedup_hash: 'h', symptom: 'x' }); d.logger.error('x'); // UNGUARDED
    return { ok: false, error: e };
  }
};
const NULL_DEPS_UNSAFE = (op, d) => { // no `d = d || {}` coercion -> derefs a null deps bag
  try { return { ok: true, value: op() }; } catch (e) {
    d.sink.append({ symptom: String(e && e.message) }); d.logger.error('x');
    return { ok: false, error: e };
  }
};

describe('behavioral contract (the real enforcement — runs against the ADAPTED copy too)', () => {
  it('capture-on-failure: a planted throw yields ok:false + exactly 1 row + >=1 stderr, and does NOT throw', () => {
    const h = makeHarness(1000);
    const err = new Error('boom');
    let r;
    expect(() => { r = captureBoundary(() => { throw err; }, DEPS(h)); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.error).toBe(err);
    expect(h.rows).toHaveLength(1);
    expect(h.lines.length).toBeGreaterThanOrEqual(1);
    expect(h.rows[0]).toMatchObject({ category: 'harness_backlog', type: 'error', symptom: 'boom', source: 'demo', severity: 'medium' });
    expect(h.rows[0].dedup_hash).toEqual(expect.any(String));
    expect(h.rows[0].emitted_at).toBe(1000);
  });

  it('healthy-path-silent: a success writes NO row and NO stderr, returns ok:true + value', () => {
    const h = makeHarness();
    const r = captureBoundary(() => 42, DEPS(h));
    expect(r).toEqual({ ok: true, value: 42 });
    expect(h.rows).toHaveLength(0);
    expect(h.lines).toHaveLength(0);
  });

  it('FALSY-BUT-VALID return: 0 / empty / false / null are successes, not failures (throw-vs-return)', () => {
    for (const falsy of [0, '', false, null]) {
      const h = makeHarness();
      const r = captureBoundary(() => falsy, DEPS(h));
      expect(r.ok).toBe(true);
      expect(r.value).toBe(falsy);
      expect(h.rows).toHaveLength(0);
      expect(h.lines).toHaveLength(0);
    }
  });

  it('NEVER-THROWS on a null-proto throw (String(err) would throw): captured, no propagation', () => {
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw Object.create(null); }, DEPS(h)); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1); // still captured
  });

  it('NEVER-THROWS on a throwing message getter: captured, no propagation', () => {
    const h = makeHarness();
    let r;
    const hostile = { get message() { throw new Error('getter'); } };
    expect(() => { r = captureBoundary(() => { throw hostile; }, DEPS(h)); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1);
  });

  it('NEVER-THROWS on a NaN / hostile clock (Date(NaN).toISOString() would throw): captured with an epoch-fallback day', () => {
    const h = makeHarness();
    let r;
    const badClock = { now: () => NaN };
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, { ...DEPS(h), clock: badClock }); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].emitted_at).toBe(0); // safe fallback
  });

  it('NEVER-THROWS on a throwing clock: captured, no propagation', () => {
    const h = makeHarness();
    const throwingClock = { now: () => { throw new Error('clock down'); } };
    expect(() => captureBoundary(() => { throw new Error('boom'); }, { ...DEPS(h), clock: throwingClock })).not.toThrow();
  });

  it('NEVER-THROWS when deps are omitted (the deps-asymmetry footgun): a failure returns ok:false', () => {
    let r;
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }); }).not.toThrow();
    expect(r.ok).toBe(false);
  });

  it('NEVER-THROWS when deps is explicitly NULL (the null-deps hole: `= {}` only defaults undefined): returns ok:false', () => {
    let r;
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, null); }).not.toThrow();
    expect(r.ok).toBe(false);
  });

  it('NEVER-THROWS on a deps whose `logger` getter throws (the guard-catch deref hole): returns ok:false', () => {
    let r;
    const hostileDeps = { get logger() { throw new Error('logger-getter'); } };
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, hostileDeps); }).not.toThrow();
    expect(r.ok).toBe(false);
  });

  it('NEVER-THROWS on a deps Proxy that throws on every get: returns ok:false', () => {
    let r;
    const proxyDeps = new Proxy({}, { get() { throw new Error('proxy-trap'); } });
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, proxyDeps); }).not.toThrow();
    expect(r.ok).toBe(false);
  });

  it('NON-ERROR throw: a thrown string is captured safely with a stable hash (never throws)', () => {
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw 'raw string boom'; }, DEPS(h)); }).not.toThrow();
    expect(r.ok).toBe(false);
    const firstHash = h.rows[0].dedup_hash;
    h.clock.advance(5);
    captureBoundary(() => { throw 'raw string boom'; }, DEPS(h));
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].dedup_hash).toBe(firstHash);
  });

  it('NO OVER-DEDUP: two DISTINCT object throws (no .message) are two rows, not one', () => {
    const h = makeHarness();
    captureBoundary(() => { throw { code: 'E1', detail: 'disk full' }; }, DEPS(h));
    captureBoundary(() => { throw { code: 'E2', detail: 'network down' }; }, DEPS(h));
    expect(h.rows).toHaveLength(2); // bare String() would collapse both to "[object Object]"
  });

  it('NO OVER-DEDUP (non-serializable): two DISTINCT BigInt-bearing throws (JSON.stringify throws) are two rows', () => {
    const h = makeHarness();
    captureBoundary(() => { throw { code: 1n, detail: 'disk' }; }, DEPS(h)); // BigInt -> JSON path throws -> value fallback
    captureBoundary(() => { throw { code: 2n, detail: 'net' }; }, DEPS(h));
    expect(h.rows).toHaveLength(2); // the ctor+keys fallback must include VALUES, not just key names
  });

  it('BEST-EFFORT: a throwing sink.append does NOT propagate; a fallback stderr is still emitted', () => {
    const badSink = { append: () => { throw new Error('sink down'); }, findByHash: () => null };
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, { ...DEPS(h), sink: badSink }); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('BEST-EFFORT: a throwing logger does NOT propagate AND the row is still written', () => {
    const badLogger = { error: () => { throw new Error('logger down'); } };
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, { ...DEPS(h), logger: badLogger }); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1);
  });

  it('DEDUP same-stable, different-volatile: identical failure recurs -> 1 row, second deduped, NO new stderr', () => {
    const h = makeHarness();
    captureBoundary(() => { throw new Error('dup'); }, DEPS(h));
    const linesAfterFirst = h.lines.length;
    h.clock.advance(1000);
    const r2 = captureBoundary(() => { throw new Error('dup'); }, DEPS(h));
    expect(h.rows).toHaveLength(1);
    expect(r2.deduped).toBe(true);
    expect(h.lines).toHaveLength(linesAfterFirst);
  });

  it('DEDUP different-stable / HASH excludes volatile / UTC-day boundary / CATEGORY co-scope / TYPE excluded', () => {
    // different symptom -> new row
    let h = makeHarness();
    captureBoundary(() => { throw new Error('one'); }, DEPS(h));
    captureBoundary(() => { throw new Error('two'); }, DEPS(h));
    expect(h.rows).toHaveLength(2);
    // two rows differing only in emitted_at share a byte-identical hash (diff category -> 2 rows)
    h = makeHarness();
    captureBoundary(() => { throw new Error('same'); }, DEPS(h, { category: 'catA' }));
    h.clock.advance(1000);
    captureBoundary(() => { throw new Error('same'); }, DEPS(h, { category: 'catB' }));
    expect(h.rows[0].dedup_hash).toBe(h.rows[1].dedup_hash);
    expect(h.rows[0].emitted_at).not.toBe(h.rows[1].emitted_at);
    // UTC-day boundary -> two rows
    h = makeHarness(0);
    captureBoundary(() => { throw new Error('cross'); }, DEPS(h));
    h.clock.advance(86400000);
    captureBoundary(() => { throw new Error('cross'); }, DEPS(h));
    expect(h.rows).toHaveLength(2);
    // category co-scopes dedup -> two rows
    h = makeHarness();
    captureBoundary(() => { throw new Error('shared'); }, DEPS(h, { category: 'catA' }));
    captureBoundary(() => { throw new Error('shared'); }, DEPS(h, { category: 'catB' }));
    expect(h.rows).toHaveLength(2);
    // type is NOT part of the hash -> deduped
    h = makeHarness();
    captureBoundary(() => { throw new Error('sym'); }, DEPS(h, { type: 'error' }));
    captureBoundary(() => { throw new Error('sym'); }, DEPS(h, { type: 'warning' }));
    expect(h.rows).toHaveLength(1);
  });
});

describe('async variant (captureBoundaryAsync — the estate sink is async)', () => {
  it('a rejected async op is a CAPTURED failure (row + stderr), not a swallow', async () => {
    const h = makeHarness();
    const r = await captureBoundaryAsync(async () => { throw new Error('async boom'); }, DEPS(h));
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1);
    expect(h.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('an async success is silent and returns the resolved value', async () => {
    const h = makeHarness();
    const r = await captureBoundaryAsync(async () => 7, DEPS(h));
    expect(r).toEqual({ ok: true, value: 7 });
    expect(h.rows).toHaveLength(0);
  });

  it('awaits an ASYNC sink so its write failure is caught (never rejects)', async () => {
    const asyncBadSink = { append: async () => { throw new Error('db down'); }, findByHash: async () => null };
    const h = makeHarness();
    let r;
    await expect((async () => { r = await captureBoundaryAsync(async () => { throw new Error('boom'); }, { ...DEPS(h), sink: asyncBadSink }); })()).resolves.not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.lines.length).toBeGreaterThanOrEqual(1);
  });

  it('KNOWN LIMITATION: sync captureBoundary does NOT catch an async rejection (use the async variant)', () => {
    const h = makeHarness();
    const r = captureBoundary(() => Promise.reject(new Error('x')), DEPS(h));
    expect(r.ok).toBe(true);                 // sync seam sees a returned (rejected) promise as success
    expect(r.value).toBeInstanceOf(Promise);
    r.value.catch(() => {});                 // swallow the rejection so it is not an unhandled rejection here
    expect(h.rows).toHaveLength(0);          // documented in the module header + guide
  });

  it('NEVER-REJECTS when deps is explicitly NULL: an async rejection returns ok:false', async () => {
    let r;
    await expect((async () => { r = await captureBoundaryAsync(async () => { throw new Error('boom'); }, null); })()).resolves.not.toThrow();
    expect(r.ok).toBe(false);
  });

  it('async teeth: a SWALLOW-async copy is OBSERVABLY broken (no row despite a rejection)', async () => {
    const swallowAsync = async (op) => { try { return { ok: true, value: await op() }; } catch (e) { return { ok: false, error: e }; } };
    const h = makeHarness();
    const r = await swallowAsync(async () => { throw new Error('x'); });
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(0);          // a delegate can observe the async swallow — the async path IS checkable
  });
});

describe('the capture CONTRACT has TEETH (proves enforcement reaches a delegate copy)', () => {
  it('the canonical seam passes the portable contract checker', () => {
    expect(captureContractViolations(captureBoundary)).toEqual([]);
  });
  it('NEGATIVE-COPY: a SWALLOW copy (silent on failure) is REJECTED', () => {
    expect(captureContractViolations(SWALLOW)).toEqual(expect.arrayContaining(['no-row-on-failure', 'silent-on-failure']));
  });
  it('NEGATIVE-COPY: a THROW-THROUGH copy (re-throws) is REJECTED', () => {
    expect(captureContractViolations(THROW_THROUGH)).toContain('throws-through');
  });
  it('NEGATIVE-COPY: an ALWAYS-WRITE copy (writes on the healthy path) is REJECTED', () => {
    expect(captureContractViolations(ALWAYS_WRITE)).toContain('writes-on-healthy-path');
  });
  it('NEGATIVE-COPY: a DEDUP-BREAK copy (volatile field in the hash) is REJECTED', () => {
    expect(captureContractViolations(DEDUP_BREAK)).toContain('dedup-break');
  });
  it('NEGATIVE-COPY: a SINK-THROWS-PROPAGATES copy (unguarded sink) is REJECTED', () => {
    expect(captureContractViolations(SINK_THROWS_PROPAGATES)).toContain('sink-throws-propagates');
  });
  it('NEGATIVE-COPY: a NULL-DEPS-UNSAFE copy (derefs a null deps bag) is REJECTED', () => {
    expect(captureContractViolations(NULL_DEPS_UNSAFE)).toContain('throws-on-null-deps');
  });
  it('NEGATIVE-COPY: a NOT-HARDENED copy (throws on a hostile input) is REJECTED', () => {
    const notHardened = (op, d) => {
      try { return { ok: true, value: op() }; } catch (e) {
        const sym = String(e && e.message ? e.message : e); // bare String -> throws on null-proto
        d.sink.append({ category: d.category, dedup_hash: sym, symptom: sym }); d.logger.error('x');
        return { ok: false, error: e };
      }
    };
    expect(captureContractViolations(notHardened)).toContain('throws-on-hostile-input');
  });
});

describe('textual locks pass on the source', () => {
  const LOCKS = buildLocks();
  for (const name of Object.keys(LOCKS)) {
    it(`lock: ${name}`, () => {
      expect(LOCKS[name](SRC), `lock '${name}' must hold`).toBe(true);
    });
  }
  it('judgeSource aggregates to ok', () => {
    expect(judgeSource(SRC)).toEqual({ ok: true, failed: [] });
  });
});

describe('doctrine mutations fail named checks (miss direction)', () => {
  const CANON = readFileSync(CANON_PATH, 'utf8');

  it('routing the failure to a bare return (no sink append) fails capture_at_boundary', () => {
    const m = CANON.replace('return guard(err, deps, () => record(err, deps));', 'return { ok: false, error: err, deduped: false };');
    expect(judgeSource(m).failed).toContain('capture_at_boundary');
  });
  it('re-throwing from the boundary catch fails never_throws_best_effort', () => {
    const m = CANON.replace('return guard(err, deps, () => record(err, deps));', 'throw err;');
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('removing the deps null-coercion fails never_throws_best_effort', () => {
    const m = CANON.replace('deps = deps || {};', 'deps = deps;'); // first occurrence = captureBoundary
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('an unguarded deps.logger read in the guard catch fails never_throws_best_effort', () => {
    const m = CANON.replace(/safeLog\(safeGet\(deps, 'logger'\)/g, 'safeLog(deps.logger');
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('an unguarded logger fails never_throws_best_effort', () => {
    const m = CANON.replace(/try \{ logger\.error\(line\); \} catch \{[^}]*\}/, 'logger.error(line);');
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('an unguarded invalid-time (no Number.isFinite) fails never_throws_best_effort', () => {
    // The behavioral null-proto / hostile-input tests carry SYMPTOM throw-safety (a
    // textual lock is a weak proxy — the -F lesson); the lock reliably catches the
    // structural clock guard, whose removal makes Date(NaN).toISOString() throw.
    const m = CANON.replace('Number.isFinite(d.getTime())', 'true');
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('a volatile field in the dedup hash fails dedup_stable_fields_only', () => {
    const m = CANON.replace('`${utcDay}::${symptom}::${String(source)}`', '`${utcDay}::${symptom}::${String(source)}::${emitted_at}`');
    expect(judgeSource(m).failed).toContain('dedup_stable_fields_only');
  });
  it('dropping the category from the dedup lookup fails category_scoped_dedup', () => {
    const m = CANON.replace('sink.findByHash({ category, dedup_hash: entry.dedup_hash })', 'sink.findByHash({ dedup_hash: entry.dedup_hash })');
    expect(judgeSource(m).failed).toContain('category_scoped_dedup');
  });
  it('writing on the success path fails healthy_path_silent', () => {
    const m = CANON.replace('return { ok: true, value };', "deps.logger.error('leak'); return { ok: true, value };");
    expect(judgeSource(m).failed).toContain('healthy_path_silent');
  });
  it('a module-level singleton dep fails injected_deps', () => {
    const m = CANON.replace('import { createHash }', 'const sink = {};\nimport { createHash }');
    expect(judgeSource(m).failed).toContain('injected_deps');
  });
  it('a repo-relative import fails builtins_only_import', () => {
    const m = "import { x } from '../../lib/governance/emit-feedback.js';\n" + CANON;
    expect(judgeSource(m).failed).toContain('builtins_only_import');
  });
});
