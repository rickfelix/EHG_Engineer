/**
 * SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 — FR-3 / FR-4 / FR-5, TS-3 and TS-4.
 *
 * *** THE DEFECT WAS AN INVERSION, SO BOTH HALVES MUST BE TESTED. *** Testing only one half passes
 * against the bug: a function that always says "fully read" satisfies the diligent-reader case, and
 * one that always says "not fully read" satisfies the truncated-reader case. Neither is correct.
 *   truncating no-offset read  -> recorded "full"    (must now be NOT fully read)
 *   diligent paginated read    -> recorded "partial" (must now be fully read)
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { contractReadVerdict, singleReadFit, FULL_COVERAGE_PCT, SINGLE_READ_SAFE_BYTES, SINGLE_READ_TOKEN_CAP, SINGLE_READ_TOKEN_BUDGET } = require_('../../../lib/protocol/contract-read-coverage.cjs');

describe('contractReadVerdict — the inversion, both halves', () => {
  it('THE DILIGENT READER: paginated full coverage reports FULLY READ', () => {
    // Exactly what the old code punished: the final page carries a limit, so lastReadWasPartial
    // was true and the reader who did the work was recorded incomplete.
    // THE SHAPE THE REAL TRACKER WRITES. An earlier version of this fixture carried ranges ALONE,
    // a combination production never emits — and that omission is exactly what let SEC-F8 hide for
    // two rounds. deliveredRanges is what proves the pages were actually returned; ranges alone
    // only proves they were asked for (SEC-F18).
    const status = {
      readCount: 3,
      lastReadWasPartial: true, // the old signal, now correctly ignored
      ranges: [
        { offset: 1, limit: 200 },
        { offset: 201, limit: 200 },
        { offset: 401, limit: 21 },
      ],
      deliveredRanges: [
        { offset: 1, limit: 200 },
        { offset: 201, limit: 200 },
        { offset: 401, limit: 21 },
      ],
      lastDelivered: { startLine: 401, numLines: 21, totalLines: 421, coveredWholeFile: false },
    };
    const v = contractReadVerdict(status, 421);
    expect(v.read).toBe(true);
    expect(v.fully_read).toBe(true);
    expect(v.basis).toBe('delivered_ranges');

    // MUTATION: read status.lastReadWasPartial instead of computing coverage -> fully_read false, fails.
  });

  it('THE TRUNCATED READER: a no-arg read that delivered part of the file is NOT fully read', () => {
    // The half that actually lets an unread contract pass. No limit/offset was passed, so the old
    // code recorded "confirmed full" and ranges[] never saw it at all.
    const status = {
      readCount: 1,
      lastReadWasPartial: false, // the old signal said FULL — this is the inversion
      lastDelivered: { startLine: 1, numLines: 166, totalLines: 421, coveredWholeFile: false },
    };
    const v = contractReadVerdict(status, 421);
    expect(v.read).toBe(true);
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('delivered_lines');
    expect(v.coverage_pct).toBe(39);

    // MUTATION: trust lastReadWasPartial -> fully_read true, fails. This is the assertion that
    // proves the lazy-reader false positive is closed, and it is the one the ranges-only fix
    // could NOT have made pass.
  });

  it('COVERAGE IS CUMULATIVE: a later partial read does not erase an earlier full one', () => {
    /**
     * *** THIS ASSERTION WAS INVERTED, AND IT IS WHAT KEPT SEC-F8 ALIVE. *** It used to require
     * fully_read=false here, on the rationale that "the truncated read is the more recent fact about
     * what this session has in hand". That rationale is wrong: reading MORE of a file cannot un-read
     * the part already read. Coverage accumulates over a session; it does not track the last call.
     *
     * Ranking a single-call fact above whole-file coverage to honour that idea is precisely the
     * defect this module was built to remove — the same mistake as `lastReadWasPartial`, which was
     * also a true statement about one call being used to answer a question about the whole file.
     * Both the old test and the code agreed, so the suite was green and the behaviour was backwards.
     */
    // Real tracker shape: an earlier read DELIVERED the whole file, a later one delivered 100 lines.
    // The union of deliveries is still the whole file.
    const status = {
      readCount: 4,
      ranges: [{ offset: 1, limit: 421 }, { offset: 1, limit: 100 }],
      deliveredRanges: [{ offset: 1, limit: 421 }, { offset: 1, limit: 100 }],
      lastDelivered: { startLine: 1, numLines: 100, totalLines: 421, coveredWholeFile: false },
    };
    const v = contractReadVerdict(status, 421);
    expect(v.fully_read).toBe(true);
    expect(v.basis).toBe('delivered_ranges');

    // MUTATION: rank the single-call delivered tier above the union tier (the shipped order) ->
    // fully_read false on basis delivered_lines. Fails. That mutation IS the bug SEC-F8 found.
  });

  it('a genuinely complete delivered read reports FULLY READ', () => {
    const status = { readCount: 1, lastDelivered: { startLine: 1, numLines: 99, totalLines: 99, coveredWholeFile: true } };
    const v = contractReadVerdict(status, 99);
    expect(v.fully_read).toBe(true);
    expect(v.coverage_pct).toBe(100);

    // MUTATION: always return fully_read false -> fails. Without this the suite would pass against
    // a function that can never confirm a read.
  });
});

describe('contractReadVerdict — absence is reported as absence', () => {
  it('a read with NO coverage evidence is NOT promoted to fully read', () => {
    // This is precisely the state the old code reached and answered "full" for.
    const status = { readCount: 1, lastReadWasPartial: false };
    const v = contractReadVerdict(status, 421);
    expect(v.read).toBe(true);
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).toBeNull();
    expect(v.basis).toBe('unknown_coverage');

    // MUTATION: default fully_read to true when evidence is missing -> fails. Inferring coverage
    // from a missing value is the original defect in another costume.
  });

  it('no read at all is neither read nor fully read', () => {
    expect(contractReadVerdict(null, 421)).toMatchObject({ read: false, fully_read: false, basis: 'no_read_recorded' });
    expect(contractReadVerdict({ readCount: 0 }, 421)).toMatchObject({ read: false, fully_read: false });
  });

  it('ranges are ignored when the file line count is unknown', () => {
    // Coverage of an unknown total is not a percentage, and guessing one would be worse than saying
    // so — a fabricated denominator produces a confident wrong answer.
    const v = contractReadVerdict({ readCount: 1, ranges: [{ offset: 1, limit: 100 }] }, null);
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('unknown_coverage');
  });
});

describe('single-read-safe size — the tier a CI failure forced me to add', () => {
  /**
   * My first cut required positive coverage evidence unconditionally. Correct for an over-cap
   * contract, WRONG for a small one: with no lastDelivered and no ranges, a perfectly good single
   * read of a 25KB file reported "partial" forever — a permanent false alarm on every startup, and
   * a warning that always fires gets demoted to noise. That is the failure this SD exists to remove,
   * so trading a false positive for a false negative is not a fix. CI caught it; two tests in
   * tests/unit/adam/ that I had not run locally were asserting the correct behaviour all along.
   */
  const SAFE = 25_000;   // ~CLAUDE_COORDINATOR.md
  const OVER = 104_000;  // ~CLAUDE_ADAM.md

  it('a small contract read without a partial flag IS fully read, with no further evidence', () => {
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, 99, { sizeBytes: SAFE });
    expect(v.fully_read).toBe(true);
    expect(v.basis).toBe('single_read_safe_size');

    // MUTATION: drop the size tier -> falls to unknown_coverage, fully_read false, fails. That was
    // literally my shipped state, and it is why CI went red.
  });

  it('the SAME evidence on an OVER-CAP contract is NOT fully read', () => {
    // The discriminating pair. One assertion alone cannot distinguish "size tier works" from
    // "everything passes" — this is the half that proves the tier is bounded.
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, 421, { sizeBytes: OVER });
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('unknown_coverage');

    // MUTATION: raise the threshold above 104KB, or drop the bound entirely -> the truncated read on
    // CLAUDE_ADAM.md counts as complete again and the original defect returns. Fails.
  });

  it('a small contract whose last read WAS partial still is not waved through', () => {
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: true }, 99, { sizeBytes: SAFE });
    expect(v.basis).not.toBe('single_read_safe_size');

    // MUTATION: drop the lastReadWasPartial check from the size tier -> a deliberately partial read
    // of a small file reports complete. Fails.
  });

  it('an unknown size does not enter the tier', () => {
    // A missing stat must not be read as "small". Absence is not evidence, at every tier.
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, 421, { sizeBytes: null });
    expect(v.fully_read).toBe(false);
  });
});

describe('the 95% bar is exact — rounding must not move it, and a gauge must not round UP', () => {
  /**
   * *** THE FIX FOR THIS SHIPPED WITH A COMMENT INSTEAD OF AN ASSERTION, AND BOTH REVIEWERS CAUGHT
   * IT INDEPENDENTLY. *** The previous commit corrected `Math.round` running BEFORE the threshold
   * comparison — which had quietly moved the bar from 95% to 94.5% — and wrote a paragraph about it.
   * Nothing tested it: restoring the rounding passed all 59 tests. That is the identical gap the
   * margin had one round earlier. A safety mechanism defended only by a comment is undefended, and
   * this SD has now produced that shape twice, so it is worth naming as a pattern rather than an
   * incident: when a fix is subtle enough to need a paragraph, it is subtle enough to need a test.
   */
  const T = 520;
  const overCap = { fits: false, tokens: 27566, bytes: 106286, basis: 'measured_tokens' };
  const withDelivered = (limit) => ({
    readCount: 1, lastReadWasPartial: true,
    deliveredRanges: [{ offset: 1, limit }],
    lastDelivered: { startLine: 1, numLines: limit, totalLines: T, coveredWholeFile: false },
  });

  it('493 of 520 lines (94.81%) is NOT a full read', () => {
    // The exact payload the round-first mutant certifies: 94.8077% rounds to 95, and 95 >= 95.
    // 5.2% of the contract never delivered, reported complete.
    const v = contractReadVerdict(withDelivered(493), T, { singleReadFit: overCap });
    expect(v.fully_read).toBe(false);

    // MUTATION: round before comparing to FULL_COVERAGE_PCT -> fully_read true. Fails.
  });

  it('494 of 520 lines (95.0%) IS a full read', () => {
    // The discriminating half: the bar must still be reachable, or the fix would just be "nothing
    // ever passes" — which no single-sided test could distinguish.
    const v = contractReadVerdict(withDelivered(494), T, { singleReadFit: overCap });
    expect(v.fully_read).toBe(true);
  });

  it('the REPORTED percentage never contradicts the verdict, and never rounds up', () => {
    // At 493/520 a rounding report would print "95%" beside "not fully read" against a 95% bar,
    // inviting the reader to assume the verdict is the broken half. Flooring also means the gauge
    // can never overstate coverage — the failure mode this whole module exists to prevent.
    const near = contractReadVerdict(withDelivered(493), T, { singleReadFit: overCap });
    expect(near.coverage_pct).toBeLessThan(FULL_COVERAGE_PCT);
    expect(near.coverage_pct).toBe(94);

    // MUTATION: report Math.round -> 95, contradicting fully_read:false. Fails.
  });
});

describe('coverage threshold', () => {
  it('partial union coverage below the bar is not a full read', () => {
    const v = contractReadVerdict({ readCount: 1, ranges: [{ offset: 1, limit: 200 }] }, 421);
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).toBeLessThan(FULL_COVERAGE_PCT);
  });

  it('overlapping ranges are unioned, not summed', () => {
    // Summing would report 200% coverage of a 100-line file and pass anything.
    const v = contractReadVerdict({ readCount: 2, ranges: [{ offset: 1, limit: 100 }, { offset: 1, limit: 100 }] }, 200);
    expect(v.coverage_pct).toBe(50);

    // MUTATION: sum the limits instead of unioning -> 100%, fully_read true, fails.
  });
});

describe('size tier DEFERS to contradicting delivered evidence', () => {
  /**
   * *** THIS TIER ORIGINALLY OVERRODE A DIRECT MEASUREMENT WITH A SIZE INFERENCE. ***
   * A 40KB contract whose own lastDelivered recorded 100 of 500 lines returned fully_read=true on
   * basis 'single_read_safe_size'. That is a cheap proxy outranking the real signal — the same
   * defect class this whole module exists to close, reintroduced one tier up by the fix for it.
   * Found in SECURITY review and reproduced on the merged code before the fix.
   */
  it('a small contract with lastDelivered showing partial coverage is NOT fully read', () => {
    const v = contractReadVerdict(
      { readCount: 1, lastReadWasPartial: false, lastDelivered: { numLines: 100, totalLines: 500, coveredWholeFile: false } },
      500,
      { sizeBytes: 30000 }
    );
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('delivered_lines');
    expect(v.coverage_pct).toBe(20);

    // MUTATION THAT MUST BREAK THIS: run the size tier before checking lastDelivered (the shipped
    // state). Returns fully_read true on basis single_read_safe_size.
  });

  it('a small contract with lastDelivered showing FULL coverage is still fully read', () => {
    // The other half — the guard must not turn into "any lastDelivered blocks the tier".
    const v = contractReadVerdict(
      { readCount: 1, lastReadWasPartial: false, lastDelivered: { numLines: 99, totalLines: 99, coveredWholeFile: true } },
      99,
      { sizeBytes: 30000 }
    );
    expect(v.fully_read).toBe(true);
  });
});

describe('the byte proxy is RETIRED — readability is measured in tokens', () => {
  /**
   * *** THIS BLOCK REPLACED ONE THAT ASSERTED A FALSE FACT. *** It previously pinned
   * `expect(67501).toBeGreaterThan(SINGLE_READ_SAFE_BYTES)` — i.e. it required CLAUDE_SOLOMON.md to
   * be over the bound. Solomon's contract is 67,501 BYTES but 15,965 TOKENS: it reads in one call.
   * The test was encoding the proxy's error as a requirement, which is how a wrong bound survives.
   *
   * Two separate mistakes, both the same shape (a sample presented as a bound):
   *   1st: "2 B/token is below any real tokenizer's ratio"  — never measured, false.
   *   2nd: "1.32 B/token is the densest case"               — measured, but a sample MAX, not a max.
   * cl100k_base is byte-level BPE with 256 single-byte fallbacks, so the true floor is 1.0 B/token.
   */
  it('THE MARGIN IS APPLIED, not merely declared', () => {
    /**
     * *** THIS IS THE ONE MUTANT THAT SURVIVED THE WHOLE SUITE. *** Changing singleReadFit to
     * compare against SINGLE_READ_TOKEN_CAP (25,000) instead of SINGLE_READ_TOKEN_BUDGET (22,500)
     * — i.e. DELETING the safety margin — passed every test. Every margin assertion checked the
     * two constants' RELATIONSHIP; none checked that the smaller one is what the comparison uses.
     * The docblock calls the margin load-bearing, and it was the only safety mechanism here with
     * zero behavioural coverage.
     *
     * A contract sized into the band between budget and cap is the only thing that can tell them
     * apart, so build one instead of hoping a real file lands there.
     */
    const osx = require_('os'); const fsx = require_('fs'); const px = require_('path');
    const dir = fsx.mkdtempSync(px.join(osx.tmpdir(), 'ctr-margin-'));
    const file = 'BAND.md';
    const line = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod\n';

    // Grow until the FRAMED measurement lands strictly between budget and cap.
    let body = '';
    for (let i = 0; i < 20000; i++) {
      body += line;
      if (i % 20 !== 0) continue;   // stride 20, not 200: the band is 2,500 wide and a 3,600-token step can leap clean over it
      fsx.writeFileSync(px.join(dir, file), body);
      const t = singleReadFit(dir, file).tokens;
      if (t > SINGLE_READ_TOKEN_BUDGET && t < SINGLE_READ_TOKEN_CAP) break;
      if (t >= SINGLE_READ_TOKEN_CAP) throw new Error(`overshot the band at ${t} tokens`);
    }

    const fit = singleReadFit(dir, file);
    expect(fit.tokens).toBeGreaterThan(SINGLE_READ_TOKEN_BUDGET);
    expect(fit.tokens).toBeLessThan(SINGLE_READ_TOKEN_CAP);
    expect(fit.fits).toBe(false);   // the margin, doing its job

    // MUTATION: compare against SINGLE_READ_TOKEN_CAP instead of the budget -> fits true. Fails.
    // That mutation survived all 58 tests before this one existed.
  });

  it('the surviving byte constant is sound at the 1.0 B/token FLOOR, not at a sampled ratio', () => {
    // It is now only the no-tokenizer fallback, so it must hold even for input that encodes at one
    // token per byte. Anything above 25,000 is unsound at that floor.
    expect(SINGLE_READ_SAFE_BYTES).toBeLessThanOrEqual(SINGLE_READ_TOKEN_CAP * 1.0);

    // MUTATION: restore 32,000 (the "1.32 B/token" derivation) -> unsound at the floor, fails.
  });

  it('MEASURES rather than infers — a file can be over the byte bound and still fit', () => {
    /**
     * *** DELIBERATELY NOT PINNED TO TODAY'S CONTRACT SIZES. *** The first version of this test
     * asserted `sol.bytes > SINGLE_READ_SAFE_BYTES` and `coord.fits === true` against the live
     * files — i.e. it required Solomon's contract to stay over 25 KB and the coordinator's to stay
     * small. Trimming either (both desirable, and one is an active sibling SD) would have failed a
     * test with nothing wrong. That is the same defect as the arming table this SD replaced, just
     * pointed at a different fact.
     *
     * The BEHAVIOUR is what matters: bytes and tokens can disagree, and tokens decide. Built from
     * a synthetic file so it stays true whatever happens to the real contracts.
     */
    const osx = require_('os'); const fsx = require_('fs'); const px = require_('path');
    const dir = fsx.mkdtempSync(px.join(osx.tmpdir(), 'ctr-prose-'));
    // Prose runs ~4.2 bytes/token, so this is far over the byte bound and far under the token one.
    fsx.writeFileSync(px.join(dir, 'P.md'), 'the quick brown fox jumps over the lazy dog\n'.repeat(1200));

    const fit = singleReadFit(dir, 'P.md');
    expect(fit.basis).toBe('measured_tokens');
    expect(fit.bytes).toBeGreaterThan(SINGLE_READ_SAFE_BYTES);  // the byte proxy would disarm it
    expect(fit.tokens).toBeLessThan(SINGLE_READ_TOKEN_BUDGET);
    expect(fit.fits).toBe(true);                                // ...measurement says otherwise

    // MUTATION: compare bytes instead of tokens -> fits false. Fails.
  });

  it('the real contracts are measured by the same rule (reported, not required)', () => {
    // Sanity only, and deliberately asserts nothing about SIZE — just that each real contract is
    // genuinely measured and that fits/tokens agree with each other. Whatever the sibling SD does
    // to CLAUDE_ADAM.md, this keeps passing and the arming table keeps telling the truth.
    const root = process.cwd();
    for (const f of ['CLAUDE_COORDINATOR.md', 'CLAUDE_SOLOMON.md', 'CLAUDE_ADAM.md']) {
      const fit = singleReadFit(root, f);
      expect(fit.basis).toBe('measured_tokens');
      expect(fit.tokens).toBeGreaterThan(0);
      expect(fit.fits).toBe(fit.tokens <= SINGLE_READ_TOKEN_BUDGET);
    }
  });

  it('WITHOUT a tokenizer it degrades to disarmed — never to "fits"', () => {
    // The safe direction. A missing tokenizer must not become a licence to wave contracts through.
    const fit = { fits: null, tokens: null, bytes: null, basis: 'unmeasurable' };
    const v = contractReadVerdict({ readCount: 1, lastReadWasPartial: false }, 99, { singleReadFit: fit });
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('unknown_coverage');

    // MUTATION: treat fits!==false as fitting -> an unmeasurable contract reports complete, fails.
  });
});

describe('SEC-F8 — the diligent reader, on the state shape the REAL tracker writes', () => {
  /**
   * *** THE FOUNDING DEFECT, FOUND AGAIN ONE FIELD OVER, AFTER I HAD DECLARED IT FIXED. ***
   *
   * protocol-file-tracker.cjs writes `lastDelivered` UNCONDITIONALLY — after both the partial and
   * the full branch — so a paginated read carries ranges[] AND a lastDelivered describing only its
   * FINAL PAGE. The old tier order returned on that single-call fact before the union tier could
   * run, so a 100%-covered 3-page read of CLAUDE_ADAM.md reported 23% "not fully read", while the
   * lazy truncated single read reported 32% — BETTER. Exactly the inversion this module exists to
   * remove, in a different field.
   *
   * *** AND THE TEST THAT "PROVED" THE DILIGENT CASE COULD NOT HAVE CAUGHT IT: *** it supplied
   * ranges WITHOUT lastDelivered, a combination the real tracker never emits. A fixture that cannot
   * occur in production is not evidence about production. Every fixture below carries all three
   * fields together, because that is what is actually on disk.
   */
  const TOTAL = 520;
  const overCap = { fits: false, tokens: 27566, bytes: 106286, basis: 'measured_tokens' };

  /** 3 pages covering all 520 lines — ranges, deliveredRanges AND a last-page lastDelivered. */
  const diligent = {
    readCount: 3, lastReadWasPartial: true,
    ranges: [{ offset: 1, limit: 200 }, { offset: 201, limit: 200 }, { offset: 401, limit: 120 }],
    deliveredRanges: [{ offset: 1, limit: 200 }, { offset: 201, limit: 200 }, { offset: 401, limit: 120 }],
    lastDelivered: { startLine: 401, numLines: 120, totalLines: TOTAL, coveredWholeFile: false },
  };

  /** One no-argument read the harness silently truncated at 166 of 520. No ranges — that is the point. */
  const lazy = {
    readCount: 1, lastReadWasPartial: false,
    deliveredRanges: [{ offset: 1, limit: 166 }],
    lastDelivered: { startLine: 1, numLines: 166, totalLines: TOTAL, coveredWholeFile: false },
  };

  it('a paginated FULL read reports fully read', () => {
    const v = contractReadVerdict(diligent, TOTAL, { singleReadFit: overCap });
    expect(v.fully_read).toBe(true);
    expect(v.coverage_pct).toBe(100);
    expect(v.basis).toBe('delivered_ranges');

    // MUTATION: rank the single-call delivered tier above the union tier (the shipped order) ->
    // returns 23% / not fully read. Fails.
  });

  it('a truncated no-arg read still does NOT report fully read', () => {
    // The half that stops the fix from becoming "everything passes".
    const v = contractReadVerdict(lazy, TOTAL, { singleReadFit: overCap });
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).toBe(31);   // 166/520 = 31.92%, FLOORED — a coverage gauge never rounds up
  });

  it('AND THE ORDERING IS RIGHT: the diligent reader outscores the lazy one', () => {
    // The invariant in one line. Stated as a comparison because the defect was never about an
    // absolute number — it was about which of the two came out ahead.
    const d = contractReadVerdict(diligent, TOTAL, { singleReadFit: overCap });
    const l = contractReadVerdict(lazy, TOTAL, { singleReadFit: overCap });
    expect(d.coverage_pct).toBeGreaterThan(l.coverage_pct);
    expect(d.fully_read && !l.fully_read).toBe(true);
  });

  it('partial pagination is still partial — union, not "any ranges means done"', () => {
    const partial = {
      readCount: 1, lastReadWasPartial: true,
      ranges: [{ offset: 1, limit: 100 }],
      deliveredRanges: [{ offset: 1, limit: 100 }],
      lastDelivered: { startLine: 1, numLines: 100, totalLines: TOTAL, coveredWholeFile: false },
    };
    const v = contractReadVerdict(partial, TOTAL, { singleReadFit: overCap });
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).toBe(19);
  });
});

describe('SEC-F12 — a falsy limit means "nothing delivered", never "to end of file"', () => {
  /**
   * *** A REGRESSION I INTRODUCED WHILE FIXING SEC-F8, CAUGHT BEFORE IT SHIPPED. ***
   * unionRangeCoverage does `Number(r.limit) || (totalLines - from + 1)` — a falsy limit means
   * to-EOF. Correct for a REQUESTED range (Read(offset=1) does ask for the rest); exactly backwards
   * for a DELIVERED one, where limit is the measured line count and 0 means nothing came back.
   * So a read that delivered NOTHING unioned to 100% and certified as complete, through the tier I
   * had just promoted to strongest. The tracker guards only on Number.isFinite, and both Number(0)
   * and Number(null) are finite, so this is reachable from the canonical writer.
   */
  const T = 520;
  const overCap = { fits: false, tokens: 27566, bytes: 106286, basis: 'measured_tokens' };

  for (const [label, limit] of [['zero', 0], ['null', null], ['undefined', undefined], ['negative', -5]]) {
    it(`a delivered range with a ${label} limit is not coverage`, () => {
      const v = contractReadVerdict(
        { readCount: 1, deliveredRanges: [{ offset: 1, limit }], lastDelivered: { startLine: 1, numLines: 0, totalLines: T, coveredWholeFile: false } },
        T,
        { singleReadFit: overCap }
      );
      expect(v.fully_read).toBe(false);
      expect(v.coverage_pct).not.toBe(100);

      // MUTATION: drop the positive-limit filter -> unions to 100%, fully_read true. Fails.
    });
  }

  it('SEC-F15: an OPEN-ENDED requested range is not full coverage either', () => {
    // `Read(path, offset=1)` records {offset:1, limit:null}. That is precisely the call the harness
    // can silently truncate, so reading it as coverage-to-EOF is the original defect again.
    const v = contractReadVerdict({ readCount: 1, ranges: [{ offset: 1, limit: null }] }, T, { singleReadFit: overCap });
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('unknown_coverage');
  });
});

describe('SEC-F16 — a REQUEST must never stand in for a MEASUREMENT', () => {
  /**
   * *** THIS BLOCK REPLACED ONE THAT ASSERTED THE FOUNDING DEFECT AS A REQUIREMENT. ***
   *
   * Briefly, this module took the MAX of the two range unions, on the premise that both were lower
   * bounds on what was READ and neither could un-read the other. The premise is false:
   * protocol-file-tracker.cjs pushes `limit: toolInputData.limit` into ranges[] — the caller's
   * ARGUMENT, never reconciled against what came back. ranges[] bounds what was REQUESTED.
   *
   * So the max let a request outrank a measurement, and a no-limit-honoured truncated read reported
   * 100% fully read — this SD's founding defect, restored in full by a fix for a milder complaint.
   * The test that went with it asserted `fully_read: true` from a requested-range union, mutation
   * note and all: the second green test in this SD to encode a false fact as a requirement.
   *
   * The under-report it was trying to fix (deliveredRanges a strict subset when only some calls
   * carried a tool_response) is SAFE — it costs a spurious re-read. The over-report ships an unread
   * contract. For a gate that exists to prove a file was read, those do not trade.
   */
  const T = 520;
  const overCap = { fits: false, tokens: 27566, bytes: 106286, basis: 'measured_tokens' };

  it('a read that REQUESTED the whole file but was truncated is NOT fully read', () => {
    // The load-bearing case. Requested 520, harness delivered 166.
    const v = contractReadVerdict(
      {
        readCount: 1, lastReadWasPartial: true,
        ranges: [{ offset: 1, limit: 520 }],
        deliveredRanges: [{ offset: 1, limit: 166 }],
        lastDelivered: { startLine: 1, numLines: 166, totalLines: T, coveredWholeFile: false },
      },
      T,
      { singleReadFit: overCap }
    );
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).toBe(31);   // 166/520 = 31.92%, FLOORED — a coverage gauge never rounds up
    expect(v.basis).toBe('delivered_ranges');

    // MUTATION: take the max of the two unions -> 100% fully_read on basis union_ranges. Fails.
    // A finite positive requested limit sails through the positive-limit filter, so ONLY the
    // delivered-preferred rule catches this.
  });

  it('pages that requested 200 each but delivered 60 each are NOT fully read', () => {
    const v = contractReadVerdict(
      {
        readCount: 3, lastReadWasPartial: true,
        ranges: [{ offset: 1, limit: 200 }, { offset: 201, limit: 200 }, { offset: 401, limit: 200 }],
        deliveredRanges: [{ offset: 1, limit: 60 }, { offset: 201, limit: 60 }, { offset: 401, limit: 60 }],
        lastDelivered: { startLine: 401, numLines: 60, totalLines: T, coveredWholeFile: false },
      },
      T,
      { singleReadFit: overCap }
    );
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).toBe(34);   // 180/520 = 34.6%, floored
  });

  it('UNDER-reporting is accepted as the safe direction when delivery is partly unrecorded', () => {
    // The mixed-subset case, stated as a deliberate trade rather than left to look like an oversight.
    // Only page 1 carried a tool_response, so delivery is recorded for 200 of 520 even though all
    // three pages were read. 38% is WRONG but SAFE; the correct fix is in the tracker.
    const v = contractReadVerdict(
      {
        readCount: 3, lastReadWasPartial: true,
        ranges: [{ offset: 1, limit: 200 }, { offset: 201, limit: 200 }, { offset: 401, limit: 120 }],
        deliveredRanges: [{ offset: 1, limit: 200 }],
        lastDelivered: { startLine: 1, numLines: 200, totalLines: T, coveredWholeFile: false },
      },
      T,
      { singleReadFit: overCap }
    );
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('delivered_ranges');
  });

  it('SEC-F18: legacy requested-ranges coverage can DISPROVE completeness but never prove it', () => {
    /**
     * `ranges` is an UPPER bound — you cannot read more than you asked for, but you can read less.
     * These three legacy shapes are byte-identical to this code and only the last is a full read:
     *     Read(offset=1, limit=520) truncated at 166   -> union 100%
     *     3 pages requesting 200 each, each truncated  -> union 100%
     *     3 pages genuinely paginated and delivered    -> union 100%
     * So a full-looking requested union reports UNCONFIRMED, not complete.
     */
    const full = contractReadVerdict(
      { readCount: 3, lastReadWasPartial: true, ranges: [{ offset: 1, limit: 200 }, { offset: 201, limit: 200 }, { offset: 401, limit: 120 }] },
      T,
      { singleReadFit: overCap }
    );
    expect(full.coverage_pct).toBe(100);            // the request did span the file...
    expect(full.fully_read).toBe(false);            // ...which is not evidence it was delivered
    expect(full.basis).toBe('requested_ranges_unconfirmed');

    // MUTATION: let the requested union set fully_read -> a truncated legacy read passes. Fails.

    // And the direction it CAN speak to: falling short proves incompleteness.
    const short = contractReadVerdict(
      { readCount: 1, lastReadWasPartial: true, ranges: [{ offset: 1, limit: 100 }] },
      T,
      { singleReadFit: overCap }
    );
    expect(short.fully_read).toBe(false);
    expect(short.basis).toBe('requested_ranges_incomplete');
    expect(short.coverage_pct).toBe(19);
  });

  it('an EMPTY-after-filter delivery record does not fall back to requested ranges', () => {
    // The subtle half: "no usable delivery" must not be treated as "no delivery record", or a
    // zero-delivery read would borrow the request's coverage and pass.
    const v = contractReadVerdict(
      {
        readCount: 1,
        ranges: [{ offset: 1, limit: 520 }],
        deliveredRanges: [{ offset: 1, limit: 0 }],
        lastDelivered: { startLine: 1, numLines: 0, totalLines: T, coveredWholeFile: false },
      },
      T,
      { singleReadFit: overCap }
    );
    expect(v.fully_read).toBe(false);
    expect(v.coverage_pct).not.toBe(100);
  });
});

describe('SEC-F10/F11 — measuring the right artefact, with the right encoder', () => {
  it('a contract mentioning a special-token literal does not silently degrade', () => {
    // cl100k_base `encode` THROWS on <|endoftext|> even inline in prose. That throw would fall
    // through to the byte fallback and flip a 25,587-byte contract from ARMED to disarmed on the
    // strength of a documentation string. encode_ordinary treats it as text.
    const os = require_('os'); const fsx = require_('fs'); const p = require_('path');
    const dir = fsx.mkdtempSync(p.join(os.tmpdir(), 'ctr-special-'));
    fsx.writeFileSync(p.join(dir, 'X.md'), '# doc\nmentions <|endoftext|> inline\n'.repeat(50));

    const fit = singleReadFit(dir, 'X.md');
    expect(fit.basis).toBe('measured_tokens');   // NOT the byte fallback
    expect(fit.tokens).toBeGreaterThan(0);

    // MUTATION: swap encode_ordinary back to encode -> throws, basis becomes
    // conservative_bytes_no_tokenizer, fails.
  });

  it('counts the FRAMED response, not the raw file', () => {
    // Read returns cat -n output; the line numbers and tabs count against the cap. Measuring raw
    // bytes understates the real cost — measuring the wrong artefact is the same error the byte
    // proxy made, one level down.
    const root = process.cwd();
    const framed = singleReadFit(root, 'CLAUDE_COORDINATOR.md').tokens;
    const rawTokens = require_('tiktoken').get_encoding('cl100k_base')
      .encode_ordinary(require_('fs').readFileSync(require_('path').join(root, 'CLAUDE_COORDINATOR.md'), 'utf8')).length;
    expect(framed).toBeGreaterThan(rawTokens);
  });

  it('the budget leaves a real margin under the cap', () => {
    expect(SINGLE_READ_TOKEN_BUDGET).toBeLessThan(SINGLE_READ_TOKEN_CAP);
    expect(SINGLE_READ_TOKEN_BUDGET).toBeGreaterThan(0);

    /**
     * *** THE ASSERTION THAT USED TO LIVE HERE WOULD HAVE BROKEN WHEN THE SIBLING SD SUCCEEDED. ***
     * It required every real contract to sit further from the budget than the margin itself, to
     * show no verdict was decided by the margin. True today — but CLAUDE_ADAM.md is 27,566 tokens
     * and SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 exists to bring it under 22,500. Any landing in
     * 20,000-25,000 arms the role CORRECTLY and would have failed this test, silently imposing a
     * stricter bar than the arming condition itself.
     *
     * That is the mirror of the defect this SD was written to fix. The old arming table could not
     * change when the world changed; this assertion would have broken when the world changed FOR
     * THE BETTER. Both are a fact about today pinned as a requirement forever.
     *
     * The margin's real property — that it is APPLIED — is asserted above against a synthetic
     * contract built into the band, which no contract trim can invalidate.
     */
  });
});

describe('IMPORT PURITY — the fail-open promise depends on this module having no deps', () => {
  /**
   * *** NOTHING PINNED THIS, AND EVERYTHING RESTED ON IT. *** All three consumers
   * (adam-register.cjs, solomon-register.cjs, coordinator-startup-check.mjs) `require` this module
   * at TOP LEVEL, outside any try/catch, and all three promise never to block role activation —
   * coordinator-startup-check.mjs states "Exit code is ALWAYS 0". A throw at import time cannot be
   * caught by the try/catch inside the check functions, so those promises hold ONLY while this
   * module imports nothing that can throw.
   *
   * That invariant has already been broken once: an earlier revision top-level-required
   * sd-key-generator.js for one pure helper and transitively ran dotenv.config() plus a Supabase
   * service-role client factory as import side effects (SECURITY measured process.env going 4 -> 78
   * keys under `env -i`). It was fixed by deferring the require. This test is what stops it
   * regressing silently the next time someone needs "just one helper".
   */
  it('imports nothing beyond node builtins — no supabase, no dotenv, no tokenizer', () => {
    const path = require_('path');
    const modPath = require_.resolve('../../../lib/protocol/contract-read-coverage.cjs');
    // Load in a pristine child so this test's own imports cannot mask a violation.
    const { execFileSync } = require_('child_process');
    const probe = `
      const before = Object.keys(process.env).length;
      require(${JSON.stringify(modPath)});
      const after = Object.keys(process.env).length;
      const bad = Object.keys(require.cache).filter(k => /supabase|dotenv|tiktoken/i.test(k));
      console.log(JSON.stringify({ envDelta: after - before, bad: bad.map(f => require('path').basename(f)) }));
    `;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' }).trim());

    expect(out.envDelta).toBe(0);   // no dotenv side effect
    expect(out.bad).toEqual([]);    // no credential client, and the tokenizer stays LAZY

    // MUTATION: move the tiktoken or unionRangeCoverage require to top level -> `bad` is non-empty
    // and this fails. That is exactly the regression that broke fail-open once already.
    expect(path.basename(modPath)).toBe('contract-read-coverage.cjs');
  });
});

describe('SEC-F2 — a degenerate 0-of-0 delivered record must not certify a full read', () => {
  /**
   * `covered = numLines >= totalLines` is satisfied by `0 >= 0`, so a 0-of-0 record returned
   * fully_read=true through the tier documented as STRONGEST evidence — and
   * protocol-file-tracker.cjs writes exactly that shape. One degenerate harness response would have
   * permanently green-lit the 25,569-token CLAUDE_ADAM.md for the whole session.
   */
  it('0 of 0 delivered lines is NOT a full read of a real file', () => {
    const v = contractReadVerdict(
      { readCount: 1, lastReadWasPartial: false, lastDelivered: { numLines: 0, totalLines: 0, coveredWholeFile: true } },
      520,
      { singleReadFit: { fits: false, tokens: 25569, bytes: 106286, basis: 'measured_tokens' } }
    );
    expect(v.fully_read).toBe(false);
    expect(v.basis).not.toBe('delivered_lines');

    // MUTATION: drop the `totalLines > 0` guard -> 0>=0 certifies it, fails.
  });

  it('a genuine 1-of-1 delivered record still IS a full read', () => {
    // The other half — the guard must reject degenerate records, not all small ones.
    const v = contractReadVerdict(
      { readCount: 1, lastDelivered: { numLines: 1, totalLines: 1, coveredWholeFile: true } },
      1,
      { singleReadFit: { fits: false, tokens: 99999, bytes: 400000, basis: 'measured_tokens' } }
    );
    expect(v.fully_read).toBe(true);
    expect(v.basis).toBe('delivered_lines');
  });
});

describe('SEC-F6 — a bare coveredWholeFile:false contradicts the size tier on its own', () => {
  it('an explicit not-covered flag is not overridden by the fits-in-one-read inference', () => {
    // Previously `deliveredContradicts` required BOTH line fields to be finite, so a delivered
    // record carrying only this flag was overridden by the very inference it denies.
    const v = contractReadVerdict(
      { readCount: 1, lastReadWasPartial: false, lastDelivered: { coveredWholeFile: false } },
      99,
      { singleReadFit: { fits: true, tokens: 6197, bytes: 25587, basis: 'measured_tokens' } }
    );
    expect(v.fully_read).toBe(false);
    expect(v.basis).not.toBe('single_read_safe_size');

    // MUTATION: require both line fields finite again -> the size tier wins, fully_read true, fails.
  });
});
