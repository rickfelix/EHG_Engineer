// Acceptance for the feedback/error-capture-seam golden reference. Behavioral-
// first and PARAMETERIZED over GOLDEN_REF_MODULE from line 1 (the -C fix) so a
// delegate's adapted COPY gets the same calling-enforcement. The load-bearing
// tests are the ones a grep cannot prove: a planted failure must leave a row AND
// a stderr line; a THROWING sink/logger must NOT propagate (the anti-swallow seam
// must not itself swallow); a falsy-but-valid return must NOT be miscaptured; and
// the captureContract must REJECT four broken delegate copies.
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

let captureBoundary;
beforeAll(async () => {
  const mod = await import(pathToFileURL(MODULE_PATH).href);
  captureBoundary = mod.captureBoundary;
});

// Injected harness: an in-memory sink (append + findByHash), a stderr logger, and a
// controllable clock — all injected, never singletons. Counters let tests assert
// exact row/line counts.
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
// copy. Returns the list of contract VIOLATIONS (empty === compliant). It probes only
// OBSERVABLE outcomes (row/line counts, throw, return shape) and shares NO hash helper
// with the reference.
function captureContractViolations(cb) {
  const v = [];
  // capture-on-failure: failing op -> ok:false, exactly 1 row, >=1 stderr, no throw
  {
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
  // healthy-path-silent: success -> no row, no stderr, ok:true
  {
    const h = makeHarness();
    const r = cb(() => 1, DEPS(h));
    if (!(r && r.ok === true)) v.push('success-not-ok-true');
    if (h.rows.length !== 0 || h.lines.length !== 0) v.push('writes-on-healthy-path');
  }
  // dedup-break: identical failure twice (clock advanced) -> must stay 1 row.
  // Guarded: a throw-through copy is already flagged by the first probe.
  {
    const h = makeHarness();
    try {
      cb(() => { throw new Error('dup'); }, DEPS(h));
      h.clock.advance(1000);
      cb(() => { throw new Error('dup'); }, DEPS(h));
      if (h.rows.length > 1) v.push('dedup-break');
    } catch { /* throw-through: flagged elsewhere */ }
  }
  // best-effort: a THROWING sink.append must NOT propagate
  {
    const badSink = { append: () => { throw new Error('sink down'); }, findByHash: () => null };
    let threw = false;
    try { cb(() => { throw new Error('y'); }, { sink: badSink, logger: { error: () => {} }, clock: { now: () => 0 }, category: 'c', source: 's' }); }
    catch { threw = true; }
    if (threw) v.push('sink-throws-propagates');
  }
  return v;
}

// Four+one REAL broken delegate copies (inline implementations the contract rejects).
const SWALLOW = (op) => { try { return { ok: true, value: op() }; } catch (e) { return { ok: false, error: e }; } }; // no row, no stderr
const THROW_THROUGH = (op) => ({ ok: true, value: op() }); // no capture at all
const ALWAYS_WRITE = (op, d) => { d.sink.append({ note: 'always' }); try { return { ok: true, value: op() }; } catch (e) { return { ok: false, error: e }; } };
const DEDUP_BREAK = (op, d) => {
  try { return { ok: true, value: op() }; } catch (e) {
    const sym = e && e.message ? e.message : String(e);
    const hash = `${d.source}:${sym}:${d.clock.now()}`; // volatile now() in the key -> floods
    d.sink.append({ category: d.category, dedup_hash: hash, symptom: sym }); d.logger.error('x');
    return { ok: false, error: e };
  }
};
const SINK_THROWS_PROPAGATES = (op, d) => {
  try { return { ok: true, value: op() }; } catch (e) {
    d.sink.append({ category: d.category, dedup_hash: 'h', symptom: 'x' }); // UNGUARDED -> propagates if sink throws
    d.logger.error('x');
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
    expect(r.error).toBe(err);            // failure return contract
    expect(h.rows).toHaveLength(1);
    expect(h.lines.length).toBeGreaterThanOrEqual(1);
    // full schema, emitted_at sourced from the INJECTED clock
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

  it('NON-ERROR throw: a thrown string/number/null is captured safely with a stable hash (never throws)', () => {
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw 'raw string boom'; }, DEPS(h)); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1);
    const firstHash = h.rows[0].dedup_hash;
    h.clock.advance(5);
    captureBoundary(() => { throw 'raw string boom'; }, DEPS(h)); // identical non-Error -> deduped
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].dedup_hash).toBe(firstHash); // stable across repeats
  });

  it('BEST-EFFORT: a throwing sink.append does NOT propagate (the seam never becomes a swallow footgun)', () => {
    const badSink = { append: () => { throw new Error('sink down'); }, findByHash: () => null };
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, { ...DEPS(h), sink: badSink }); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.lines.length).toBeGreaterThanOrEqual(1); // still not fully silent (fallback stderr)
  });

  it('BEST-EFFORT: a throwing logger does NOT propagate AND the row is still written', () => {
    const badLogger = { error: () => { throw new Error('logger down'); } };
    const h = makeHarness();
    let r;
    expect(() => { r = captureBoundary(() => { throw new Error('boom'); }, { ...DEPS(h), logger: badLogger }); }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(h.rows).toHaveLength(1); // sink write survives a logger failure
  });

  it('DEDUP same-stable, different-volatile: identical failure recurs -> 1 row, second deduped, NO new stderr', () => {
    const h = makeHarness();
    captureBoundary(() => { throw new Error('dup'); }, DEPS(h));
    const linesAfterFirst = h.lines.length;
    h.clock.advance(1000); // volatile emitted_at differs, stable key identical
    const r2 = captureBoundary(() => { throw new Error('dup'); }, DEPS(h));
    expect(h.rows).toHaveLength(1);
    expect(r2.deduped).toBe(true);
    expect(h.lines).toHaveLength(linesAfterFirst); // deduped recurrence is silent (no flood)
  });

  it('DEDUP different-stable: a different symptom is a new row', () => {
    const h = makeHarness();
    captureBoundary(() => { throw new Error('one'); }, DEPS(h));
    captureBoundary(() => { throw new Error('two'); }, DEPS(h));
    expect(h.rows).toHaveLength(2);
  });

  it('HASH excludes volatile (direct): two rows differing only in emitted_at share a byte-identical dedup_hash', () => {
    const h = makeHarness();
    captureBoundary(() => { throw new Error('same'); }, DEPS(h, { category: 'catA' }));
    h.clock.advance(1000);
    captureBoundary(() => { throw new Error('same'); }, DEPS(h, { category: 'catB' })); // diff category -> 2 rows
    expect(h.rows).toHaveLength(2);
    expect(h.rows[0].dedup_hash).toBe(h.rows[1].dedup_hash); // emitted_at differs, hash identical
    expect(h.rows[0].emitted_at).not.toBe(h.rows[1].emitted_at);
  });

  it('UTC-day boundary: the same failure on day D vs D+1 is two rows (per-UTC-day dedup)', () => {
    const h = makeHarness(0); // 1970-01-01
    captureBoundary(() => { throw new Error('cross'); }, DEPS(h));
    h.clock.advance(86400000); // +1 day -> 1970-01-02
    captureBoundary(() => { throw new Error('cross'); }, DEPS(h));
    expect(h.rows).toHaveLength(2);
    expect(h.rows[0].dedup_hash).not.toBe(h.rows[1].dedup_hash);
  });

  it('CATEGORY co-scopes dedup: the same hash inputs under two categories are two rows', () => {
    const h = makeHarness();
    captureBoundary(() => { throw new Error('shared'); }, DEPS(h, { category: 'catA' }));
    captureBoundary(() => { throw new Error('shared'); }, DEPS(h, { category: 'catB' }));
    expect(h.rows).toHaveLength(2);
  });

  it('TYPE is not part of the hash: same symptom/source/day, different type -> deduped', () => {
    const h = makeHarness();
    captureBoundary(() => { throw new Error('sym'); }, DEPS(h, { type: 'error' }));
    captureBoundary(() => { throw new Error('sym'); }, DEPS(h, { type: 'warning' }));
    expect(h.rows).toHaveLength(1); // type excluded from the stable key
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
    const m = CANON.replace('sink.append({ category, type, symptom, source, severity, dedup_hash, emitted_at: clock.now() });', 'void 0;');
    expect(judgeSource(m).failed).toContain('capture_at_boundary');
  });
  it('re-throwing from the boundary catch fails never_throws_best_effort', () => {
    const m = CANON.replace('return capture(err, deps);', 'throw err;');
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('an unguarded logger fails never_throws_best_effort', () => {
    const m = CANON.replace(/try \{ logger\.error\(line\); \} catch \{[^}]*\}/, 'logger.error(line);');
    expect(judgeSource(m).failed).toContain('never_throws_best_effort');
  });
  it('a volatile field in the dedup hash fails dedup_stable_fields_only', () => {
    const m = CANON.replace('`${utcDay}::${symptom}::${source}`', '`${utcDay}::${symptom}::${source}::${emitted_at}`');
    expect(judgeSource(m).failed).toContain('dedup_stable_fields_only');
  });
  it('dropping the category from the dedup lookup fails category_scoped_dedup', () => {
    const m = CANON.replace('sink.findByHash({ category, dedup_hash })', 'sink.findByHash({ dedup_hash })');
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
