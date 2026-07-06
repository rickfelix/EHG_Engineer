// Acceptance for the deviation-record-writer golden reference. Behavioral-first
// and PARAMETERIZED over GOLDEN_REF_MODULE from line 1 (the -C fix) so a
// delegate's adapted COPY gets the same calling-enforcement. The load-bearing
// tests are the ones a grep cannot prove: a WRONG-REFERENT deviation must NOT
// cover a drop (the -D self-mask killer), a thin reason must NOT cover, and the
// reconcile CONTRACT itself is proven to have TEETH — an always-empty or
// existence-not-referent copy is REJECTED by the same checker a delegate runs.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeSource, buildLocks } from '../../../golden-references/deviation-record-writer/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const abs = (p, d) => (p ? (isAbsolute(p) ? p : join(REPO_ROOT, p)) : d);
const CANON_PATH = join(REPO_ROOT, 'golden-references', 'deviation-record-writer', 'deviation-writer.mjs');
const MODULE_PATH = abs(process.env.GOLDEN_REF_MODULE, CANON_PATH);
const SRC_PATH = abs(process.env.GOLDEN_REF_SRC, MODULE_PATH);
const SRC = readFileSync(SRC_PATH, 'utf8');

let recordDeviation, reconcile, makeSink, qualifies;
beforeAll(async () => {
  const mod = await import(pathToFileURL(MODULE_PATH).href);
  recordDeviation = mod.recordDeviation;
  reconcile = mod.reconcile;
  makeSink = mod.makeSink;
  qualifies = mod.qualifies;
});

const QUALIFYING = 'deferred because the upstream API is unavailable until Q3'; // SENSIBLE: causal marker + >=6 words + >=15 chars

// A PORTABLE reconcile-contract checker: the exact teeth a delegate runs against
// their own copy. Returns the list of contract VIOLATIONS (empty === compliant).
// This is what makes "enforcement reaches copies" tangible — we prove below that
// it PASSES the canonical reconcile and REJECTS broken variants.
function reconcileContractViolations(reconcileFn) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const v = [];
  // silent shrink must be caught (guards vacuous/always-empty reconcile)
  if (!eq(reconcileFn(['A', 'B'], ['A'], []).undocumented, ['B'])) v.push('silent-shrink-not-caught');
  // documented declared-descope with a qualifying reason must PASS
  const doc = [{ artifactRef: 'B', why: QUALIFYING, weight: 'declared-descope' }];
  if (reconcileFn(['A', 'B'], ['A'], doc).undocumented.length !== 0) v.push('documented-not-covered');
  // WRONG-REFERENT must NOT cover (the -D killer: referent binding, not existence)
  const wrong = [{ artifactRef: 'C', why: QUALIFYING, weight: 'declared-descope' }];
  if (!eq(reconcileFn(['A', 'B'], ['A'], wrong).undocumented, ['B'])) v.push('wrong-referent-covered');
  // thin (too-short) reason must NOT cover
  const thin = [{ artifactRef: 'B', why: 'nope', weight: 'minor' }];
  if (!eq(reconcileFn(['A', 'B'], ['A'], thin).undocumented, ['B'])) v.push('thin-reason-covered');
  // TOKEN-STUFFING: a length-passing but causal-less reason must NOT cover
  const stuffed = [{ artifactRef: 'B', why: 'many performance and scalability issues remain', weight: 'minor' }];
  if (!eq(reconcileFn(['A', 'B'], ['A'], stuffed).undocumented, ['B'])) v.push('token-stuffing-covered');
  // delivered items are SUBTRACTED even with no deviations
  if (reconcileFn(['A', 'B'], ['A', 'B'], []).undocumented.length !== 0) v.push('delivered-not-subtracted');
  return v;
}

describe('behavioral contract (the real enforcement — runs against the ADAPTED copy too)', () => {
  it('round-trip + field fidelity: a documented declared-descope covers the drop, all 5 fields preserved', () => {
    const sink = makeSink();
    const rec = recordDeviation(sink, { artifactRef: 'B', what: 'B feature', instead: 'stub only', why: QUALIFYING, weight: 'declared-descope' });
    expect(rec).toEqual({ artifactRef: 'B', what: 'B feature', instead: 'stub only', why: QUALIFYING, weight: 'declared-descope' });
    const all = sink.readAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(rec);                                  // field fidelity through the sink
    const r = reconcile(['A', 'B'], ['A'], all);
    expect(r.undocumented).toEqual([]);                           // documented -> covered (exact set)
    expect(r.covered).toEqual(['B']);
  });

  it('injected-sink isolation: two independent sinks do not share state', () => {
    const sinkA = makeSink();
    const sinkB = makeSink();
    recordDeviation(sinkA, { artifactRef: 'B', why: QUALIFYING, weight: 'minor' });
    expect(sinkA.readAll()).toHaveLength(1);
    expect(sinkB.readAll()).toEqual([]);                          // sink is injected, never a singleton
  });

  it('SILENT-SHRINK MISS: a drop with NO record is surfaced (exact set)', () => {
    expect(reconcile(['A', 'B'], ['A'], []).undocumented).toEqual(['B']);
  });

  it('WRONG-REFERENT (the -D killer): a record naming a DIFFERENT item does NOT cover', () => {
    const sink = makeSink();
    recordDeviation(sink, { artifactRef: 'C', why: QUALIFYING, weight: 'declared-descope' }); // C, not B
    expect(reconcile(['A', 'B'], ['A'], sink.readAll()).undocumented).toEqual(['B']);
  });

  it('THIN-REASON: a non-empty but thin why records but does NOT cover', () => {
    const sink = makeSink();
    recordDeviation(sink, { artifactRef: 'B', why: 'too short', weight: 'minor' }); // records (non-empty)
    expect(sink.readAll()).toHaveLength(1);
    expect(qualifies('too short')).toBe(false);
    expect(reconcile(['A', 'B'], ['A'], sink.readAll()).undocumented).toEqual(['B']); // but does not cover
  });

  it('TOKEN-STUFFING: a long but causal-less reason records but does NOT cover (sense-making, not length)', () => {
    const sink = makeSink();
    const stuffed = 'many performance and scalability issues remain'; // >=15 chars, 6 words, NO causal marker
    recordDeviation(sink, { artifactRef: 'B', why: stuffed, weight: 'minor' }); // records (non-empty)
    expect(sink.readAll()).toHaveLength(1);
    expect(qualifies(stuffed)).toBe(false);                                     // but not sensible
    expect(reconcile(['A', 'B'], ['A'], sink.readAll()).undocumented).toEqual(['B']);
  });

  it('GENERIC-ONLY: a bare restatement above the length floor does NOT cover', () => {
    const sink = makeSink();
    const generic = 'decided to build it differently'; // matches GENERIC_ONLY, >=15 chars
    recordDeviation(sink, { artifactRef: 'B', why: generic, weight: 'minor' });
    expect(qualifies(generic)).toBe(false);
    expect(reconcile(['A', 'B'], ['A'], sink.readAll()).undocumented).toEqual(['B']);
  });

  it('DELIVERED-ONLY: delivery alone (no deviations) empties the gap set', () => {
    expect(reconcile(['A', 'B'], ['A', 'B'], []).undocumented).toEqual([]);
  });

  it('MULTI-DEVIATION EXISTENTIAL: one qualifying record among thin ones covers (∃, not ∀)', () => {
    const sink = makeSink();
    recordDeviation(sink, { artifactRef: 'B', why: 'nope', weight: 'minor' });      // thin
    recordDeviation(sink, { artifactRef: 'B', why: QUALIFYING, weight: 'declared-descope' }); // qualifying
    expect(reconcile(['A', 'B'], ['A'], sink.readAll()).undocumented).toEqual([]);
  });

  it('STRICT-REFERENT BOUNDARY: a whitespace/case variant does NOT fuzzily cover', () => {
    const sink = makeSink();
    recordDeviation(sink, { artifactRef: ' B ', why: QUALIFYING, weight: 'minor' }); // ' B ' !== 'B'
    expect(reconcile(['A', 'B'], ['A'], sink.readAll()).undocumented).toEqual(['B']);
  });

  it('ALL FOUR WEIGHTS accepted (estate-exact taxonomy)', () => {
    for (const weight of ['minor', 'moderate', 'critical', 'declared-descope']) {
      const rec = recordDeviation(makeSink(), { artifactRef: 'X', why: QUALIFYING, weight });
      expect(rec.weight).toBe(weight);
    }
  });

  it('UNRECOGNIZED WEIGHT throws', () => {
    expect(() => recordDeviation(makeSink(), { artifactRef: 'X', why: QUALIFYING, weight: 'blocker' })).toThrow(/weight/);
  });

  it('MISSING artifactRef throws (referent is mandatory)', () => {
    expect(() => recordDeviation(makeSink(), { why: QUALIFYING, weight: 'minor' })).toThrow(/artifactRef/);
  });

  it('EMPTY/whitespace why throws (narrative absence rejected at write time)', () => {
    expect(() => recordDeviation(makeSink(), { artifactRef: 'X', why: '   ', weight: 'minor' })).toThrow(/why/);
  });
});

describe('the reconcile CONTRACT has TEETH (proves enforcement reaches a delegate copy)', () => {
  it('the canonical reconcile passes the portable contract checker', () => {
    expect(reconcileContractViolations(reconcile)).toEqual([]);
  });

  it('NEGATIVE-COPY: an always-empty reconcile is REJECTED (silent shrink slips)', () => {
    const brokenEmpty = () => ({ undocumented: [], covered: [] });
    expect(reconcileContractViolations(brokenEmpty)).toContain('silent-shrink-not-caught');
  });

  it('NEGATIVE-COPY: an existence-not-referent reconcile is REJECTED (the -D hole)', () => {
    const brokenExistence = (expected, delivered, deviations) => {
      const dset = new Set(delivered);
      // covers a gap if ANY deviation exists at all — ignores artifactRef binding
      const anyDeviation = (deviations || []).length > 0;
      const undocumented = expected.filter((e) => !dset.has(e) && !anyDeviation);
      return { undocumented, covered: [] };
    };
    expect(reconcileContractViolations(brokenExistence)).toContain('wrong-referent-covered');
  });

  it('NEGATIVE-COPY: a reason-blind reconcile (covers on mere presence) is REJECTED', () => {
    const brokenReasonBlind = (expected, delivered, deviations) => {
      const dset = new Set(delivered);
      const undocumented = expected.filter(
        (e) => !dset.has(e) && !(deviations || []).some((d) => d && d.artifactRef === e) // no qualifies() gate
      );
      return { undocumented, covered: [] };
    };
    expect(reconcileContractViolations(brokenReasonBlind)).toContain('thin-reason-covered');
  });

  it('NEGATIVE-COPY: a LENGTH-ONLY qualifies (no sense-making) is REJECTED — token-stuffing slips', () => {
    // This is exactly the naive/original implementation (length floor only). The
    // contract catches it: a long causal-less reason greens a silent shrink.
    const lengthOnly = (expected, delivered, deviations) => {
      const dset = new Set(delivered);
      const qLen = (why) => typeof why === 'string' && why.trim().length >= 15;
      const undocumented = expected.filter(
        (e) => !dset.has(e) && !(deviations || []).some((d) => d && d.artifactRef === e && qLen(d.why))
      );
      return { undocumented, covered: [] };
    };
    expect(reconcileContractViolations(lengthOnly)).toContain('token-stuffing-covered');
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

  it('dropping the sink write fails write_at_divergence_referent_bound', () => {
    const m = CANON.replace('sink.append(record);', '/* no write */');
    expect(judgeSource(m).failed).toContain('write_at_divergence_referent_bound');
  });

  it('removing the weight guard fails structured_required_trio', () => {
    const m = CANON.replace('!WEIGHTS.includes(weight)', 'false');
    expect(judgeSource(m).failed).toContain('structured_required_trio');
  });

  it('shrinking the weight taxonomy fails closed_weight_allowlist', () => {
    const m = CANON.replace(/Object\.freeze\(\['minor', 'moderate', 'critical', 'declared-descope'\]\)/, "Object.freeze(['declared-descope'])");
    expect(judgeSource(m).failed).toContain('closed_weight_allowlist');
  });

  it('a length-only qualifies() (no causal sense-making) fails qualifying_reason_gate', () => {
    const m = CANON.replace('if (!CAUSAL_MARKERS.test(text)) return false;', '');
    expect(judgeSource(m).failed).toContain('qualifying_reason_gate');
  });

  it('existence-not-referent coverage fails reconcile_referent_set_difference', () => {
    const m = CANON.replace('d && d.artifactRef === e && qualifies(d.why)', 'd && qualifies(d.why)');
    expect(judgeSource(m).failed).toContain('reconcile_referent_set_difference');
  });

  it('a module-level singleton ledger fails injected_sink', () => {
    const m = CANON.replace('const WEIGHTS =', 'const records = [];\nconst WEIGHTS =');
    expect(judgeSource(m).failed).toContain('injected_sink');
  });

  it('a repo-relative import fails builtins_only_import', () => {
    const m = "import { x } from '../../lib/eva/deviation-ledger.js';\n" + CANON;
    expect(judgeSource(m).failed).toContain('builtins_only_import');
  });
});
