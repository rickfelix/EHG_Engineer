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
const { contractReadVerdict, singleReadFit, FULL_COVERAGE_PCT, SINGLE_READ_SAFE_BYTES, SINGLE_READ_TOKEN_CAP } = require_('../../../lib/protocol/contract-read-coverage.cjs');

describe('contractReadVerdict — the inversion, both halves', () => {
  it('THE DILIGENT READER: paginated full coverage reports FULLY READ', () => {
    // Exactly what the old code punished: the final page carries a limit, so lastReadWasPartial
    // was true and the reader who did the work was recorded incomplete.
    const status = {
      readCount: 3,
      lastReadWasPartial: true, // the old signal, now correctly ignored
      ranges: [
        { offset: 1, limit: 200 },
        { offset: 201, limit: 200 },
        { offset: 401, limit: 21 },
      ],
    };
    const v = contractReadVerdict(status, 421);
    expect(v.read).toBe(true);
    expect(v.fully_read).toBe(true);
    expect(v.basis).toBe('union_ranges');

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

  it('delivered evidence OUTRANKS ranges when both are present', () => {
    // A file can have historical paginated ranges AND a recent truncated read. The truncated read is
    // the more recent fact about what this session actually has in hand.
    const status = {
      readCount: 4,
      ranges: [{ offset: 1, limit: 421 }],
      lastDelivered: { startLine: 1, numLines: 100, totalLines: 421, coveredWholeFile: false },
    };
    const v = contractReadVerdict(status, 421);
    expect(v.fully_read).toBe(false);
    expect(v.basis).toBe('delivered_lines');

    // MUTATION: check ranges before lastDelivered -> stale full coverage wins, fully_read true, fails.
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
  it('the token cap is the REAL harness limit, not a derived proxy', () => {
    expect(SINGLE_READ_TOKEN_CAP).toBe(25000);
  });

  it('the surviving byte constant is sound at the 1.0 B/token FLOOR, not at a sampled ratio', () => {
    // It is now only the no-tokenizer fallback, so it must hold even for input that encodes at one
    // token per byte. Anything above 25,000 is unsound at that floor.
    expect(SINGLE_READ_SAFE_BYTES).toBeLessThanOrEqual(SINGLE_READ_TOKEN_CAP * 1.0);

    // MUTATION: restore 32,000 (the "1.32 B/token" derivation) -> unsound at the floor, fails.
  });

  it('MEASURES the real contracts, and disagrees with the byte proxy on Solomon', () => {
    // The load-bearing regression. Byte-wise Solomon looks 2.7x over; token-wise it fits.
    const root = process.cwd();
    const sol = singleReadFit(root, 'CLAUDE_SOLOMON.md');
    const coord = singleReadFit(root, 'CLAUDE_COORDINATOR.md');

    expect(sol.basis).toBe('measured_tokens');
    expect(sol.bytes).toBeGreaterThan(SINGLE_READ_SAFE_BYTES); // the proxy would have disarmed it
    expect(sol.tokens).toBeLessThan(SINGLE_READ_TOKEN_CAP);
    expect(sol.fits).toBe(true);                               // ...but it genuinely fits

    expect(coord.fits).toBe(true);
    expect(coord.tokens).toBeLessThan(SINGLE_READ_TOKEN_CAP);
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
