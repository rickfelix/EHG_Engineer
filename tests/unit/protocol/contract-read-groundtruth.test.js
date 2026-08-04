/**
 * The contract-read model against MEASURED HARNESS OUTPUT.
 * SD-LEO-INFRA-CONTRACT-READ-COVERAGE-001.
 *
 * *** THIS SUITE EXISTS BECAUSE THE OLD ONE CHECKED THE MODEL AGAINST ANOTHER CONSTANT. ***
 * Every calibration assertion in the previous suite compared two numbers that both came from the
 * same belief — the ratio against itself, the budget against the cap — so the model could be wrong
 * by 43-61% with the suite fully green. Nothing compared a prediction to what the Read tool
 * actually did. That is the only comparison that can fail for the right reason.
 *
 * No DB, no network, no file I/O against live contracts, no env gate, no skipIf. The fixture is
 * frozen JSON, so this cannot skip and cannot drift.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  singleReadFit, HARNESS_BYTES_PER_TOKEN, SINGLE_READ_TOKEN_CAP, SINGLE_READ_TOKEN_BUDGET,
} = require_('../../../lib/protocol/contract-read-coverage.cjs');

const GT = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'protocol', 'contract-read-groundtruth.json'), 'utf8'));
const TOL = GT.tolerance;

/** The shipped model, isolated from file I/O so the fixture drives it directly. */
const predict = (bytes) => Math.round(bytes / HARNESS_BYTES_PER_TOKEN);
/** The RETIRED model, reconstructed from its recorded overshoot. Used only as the control. */
const retiredPredict = (row) => Math.round(row.harness_tokens * (1 + GT.retired_model_overshoot_pct[row.name] / 100));

describe('the bytes model against measured harness output', () => {
  it('has ground truth to check against — a zero-row sweep would pass vacuously', () => {
    expect(GT.calibration_set.length).toBeGreaterThanOrEqual(6);
    expect(GT.verdict_set.length).toBeGreaterThanOrEqual(7);
  });

  it.each(GT.calibration_set)('$name: prediction is within tolerance of what the harness reported', (row) => {
    const p = predict(row.bytes);
    const relPct = Math.abs(p - row.harness_tokens) / row.harness_tokens * 100;
    const absTok = Math.abs(p - row.harness_tokens);
    // BOTH bounds. A relative-only bound lets a large file drift thousands of tokens; an
    // absolute-only bound is meaningless on a small one.
    expect(relPct).toBeLessThanOrEqual(TOL.relative_pct);
    expect(absTok).toBeLessThanOrEqual(TOL.absolute_tokens);
  });

  it('the worst case across the whole set is inside tolerance, not just each case separately', () => {
    const worstRel = Math.max(...GT.calibration_set.map((r) => Math.abs(predict(r.bytes) - r.harness_tokens) / r.harness_tokens * 100));
    expect(worstRel).toBeLessThanOrEqual(TOL.relative_pct);
    // And it is genuinely close to the bar rather than trivially inside it — a tolerance ten times
    // the observed error would pass anything.
    expect(worstRel).toBeGreaterThan(TOL.relative_pct / 4);
  });

  /**
   * *** THE TWO-SIDED CONTROL. A tolerance that both models pass proves nothing about either. ***
   * This is the assertion the original suite never had: it did not merely fail to catch the 1.85
   * model, it had no way to express what catching it would look like.
   */
  it('the RETIRED 1.85 model FAILS this same tolerance — the bar discriminates', () => {
    const failures = GT.calibration_set.filter((row) => {
      const p = retiredPredict(row);
      return Math.abs(p - row.harness_tokens) / row.harness_tokens * 100 > TOL.relative_pct;
    });
    // Not "at least one" — every single calibration point must reject the retired model.
    expect(failures.length).toBe(GT.calibration_set.length);
  });

  it('the tolerance is nowhere near the threshold at which it stops discriminating', () => {
    // Recorded so a future widening cannot happen by accident: at the theatre threshold the retired
    // model passes this suite, and at the leakage point individual defective files start slipping.
    expect(TOL.relative_pct).toBeLessThan(TOL.leakage_begins_pct);
    expect(TOL.relative_pct).toBeLessThan(TOL.theatre_threshold_pct);
    expect(TOL.relative_pct).toBeGreaterThanOrEqual(TOL.measured_max_error_pct);
  });
});

describe('verdicts against measured reads — positives and negatives inseparable', () => {
  /**
   * ONE TABLE, `expected_fits` as a column. Positives and negatives cannot be separated by a future
   * edit: deleting the held negative means deleting rows from the same array the positives live in,
   * and the guard below notices.
   */
  it.each(GT.verdict_set)('$name: verdict matches the read that actually happened', (row) => {
    const fits = predict(row.bytes) <= SINGLE_READ_TOKEN_BUDGET;
    expect(fits).toBe(row.expected_fits);
  });

  it('the table still contains a held negative AND a near-miss one', () => {
    const negatives = GT.verdict_set.filter((r) => r.expected_fits === false);
    expect(negatives.length).toBeGreaterThan(0);

    // A near-miss is what discriminates. The other negatives are 48-61% over cap and any model that
    // is not catastrophically wrong catches them, so a suite carrying only those is much weaker
    // than its row count suggests.
    const nearMiss = negatives.filter((r) => r.harness_tokens < SINGLE_READ_TOKEN_CAP * 1.15);
    expect(nearMiss.length).toBeGreaterThan(0);
  });

  it('the decisive refutation case fits — this is the false-fail the SD exists to remove', () => {
    const row = GT.verdict_set.find((r) => r.name === 'CLAUDE_SOLOMON.md@fixture-59080');
    expect(predict(row.bytes)).toBeLessThanOrEqual(SINGLE_READ_TOKEN_BUDGET);

    // AND it would NOT have fitted under the old 22,500 budget, whatever the predictor said. This is
    // the pin on the finding that reshaped the SD: retiring the constant alone could not fix it.
    expect(row.harness_tokens).toBeGreaterThan(22500);
  });

  it('every clean-reading contract fits, and every truncating one does not', () => {
    for (const row of GT.verdict_set) {
      const fits = predict(row.bytes) <= SINGLE_READ_TOKEN_BUDGET;
      expect(fits).toBe(row.read_outcome === 'clean');
    }
  });
});

describe('the resolution limit is real and is stated rather than hidden', () => {
  /**
   * Some clean readers sit within the model's own error band of the cap, so their verdicts are
   * inside the noise. This suite states that instead of presenting them as demonstrations of
   * accuracy — the same overstatement as the module comment claiming "every verdict decided by a
   * wide margin", which was false for the files it covered.
   *
   * *** THE COUNT HERE WAS WRONG WHEN THIS TEST WAS WRITTEN, AND THE TEST IS WHAT CAUGHT IT. ***
   * Review reported "LEAD 664 (2.7%), SOLOMON 1,103 (4.4%), PLAN 1,847 (7.4%) — all inside the
   * +-6.8% band", and that phrasing travelled unchecked into the PRD and into a module comment.
   * 7.4% is not inside 6.8%. The real split is TWO inside (SOLOMON, LEAD) and TWO outside (PLAN,
   * ADAM). Asserted by computation rather than by the quoted figure, so the arithmetic has to hold
   * rather than merely being restated.
   */
  it('records which verdicts are decided within the error band', () => {
    const band = TOL.measured_max_error_pct / 100;
    const clean = GT.verdict_set.filter((r) => r.read_outcome === 'clean');
    const headroom = (r) => (SINGLE_READ_TOKEN_CAP - r.harness_tokens) / SINGLE_READ_TOKEN_CAP;
    const insideNoise = clean.filter((r) => headroom(r) < band);

    expect(clean.length).toBe(4);
    expect(insideNoise.length).toBe(2);
    expect(insideNoise.map((r) => r.name).sort()).toEqual(
      ['CLAUDE_LEAD.md@24336', 'CLAUDE_SOLOMON.md@fixture-59080']
    );

    // And the two decided with real margin are genuinely outside it, not marginally so by rounding.
    for (const r of clean.filter((x) => !insideNoise.includes(x))) {
      expect(headroom(r)).toBeGreaterThan(band);
    }
  });
});

describe('the fixture cannot silently rot', () => {
  it('every calibration row carries both halves a bytes model needs', () => {
    for (const row of GT.calibration_set) {
      expect(row.bytes).toBeGreaterThan(0);
      expect(row.harness_tokens).toBeGreaterThan(0);
      expect(['notice', 'differential']).toContain(row.source);
    }
  });

  it('the corrected numerator is recorded, not the one two files disagreed on', () => {
    const row = GT.verdict_set.find((r) => r.name === 'CLAUDE_SOLOMON.md@371-pre-split');
    expect(row.harness_tokens).toBe(26138);
    expect(row.notice_string).toContain('26138');
    expect(row.notice_string).not.toContain('26142');
  });

  it('predictions are made from FROZEN bytes, never from a file on disk', () => {
    // The whole point of the fixture. If this suite ever reads a live contract, a green run stops
    // meaning the instrument is right and starts meaning the file happened not to have drifted.
    const src = readFileSync(import.meta.filename, 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/singleReadFit\(\s*process\.cwd\(\)/);
    expect(code).not.toMatch(/CLAUDE_\w+\.md'\s*\)/);
  });
});
