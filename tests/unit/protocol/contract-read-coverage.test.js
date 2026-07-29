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
const { contractReadVerdict, FULL_COVERAGE_PCT, SINGLE_READ_SAFE_BYTES } = require_('../../../lib/protocol/contract-read-coverage.cjs');

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

describe('SINGLE_READ_SAFE_BYTES is derived from a MEASUREMENT, not an assertion', () => {
  /**
   * The original 50,000 was justified by "2 bytes/token is below any real tokenizer's ratio". That
   * claim was FALSE — measured with tiktoken cl100k_base on 50,000-byte samples: random ASCII ~1.32
   * B/token (52% over the 25k cap), base64 ~1.40 (43% over), hex/minified ~1.77 (over). Re-derived
   * as 25,000 tokens x 1.32 = 33,000, set to 32,000 for margin. Pinned here so it cannot drift back
   * to a number justified by assertion.
   */
  it('is bounded by the densest measured tokenization, not by a guessed ratio', () => {
    const WORST_MEASURED_BYTES_PER_TOKEN = 1.32;
    const READ_CAP_TOKENS = 25000;
    expect(SINGLE_READ_SAFE_BYTES).toBeLessThanOrEqual(READ_CAP_TOKENS * WORST_MEASURED_BYTES_PER_TOKEN);

    // MUTATION: raise it back to 50000 -> exceeds 33,000 and fails.
  });

  it('still admits the coordinator contract and still excludes the over-cap ones', () => {
    // The bound is only useful if it lands correctly on the real files it governs.
    expect(25587).toBeLessThanOrEqual(SINGLE_READ_SAFE_BYTES);  // CLAUDE_COORDINATOR.md
    expect(67501).toBeGreaterThan(SINGLE_READ_SAFE_BYTES);      // CLAUDE_SOLOMON.md
    expect(104280).toBeGreaterThan(SINGLE_READ_SAFE_BYTES);     // CLAUDE_ADAM.md
  });
});
