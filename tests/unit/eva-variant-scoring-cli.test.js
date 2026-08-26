// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-7, TS-8, TS-9, TS-10)
import { describe, it, expect } from 'vitest';
import { renderScoringState } from '../../scripts/eva/variant-scoring-cli.mjs';

describe('renderScoringState (FR-7)', () => {
  it('TS-8: populated render path shows posteriorMean/selectionReason resolvable to the creative_asset', () => {
    const result = {
      status: 'selected',
      candidateCount: 2,
      selection: { variantId: 'var1', creativeAssetId: 'ca1', posteriorMean: 0.2030, selectionReason: 'thompson_sampling' },
    };
    const lines = renderScoringState(result, 'v1').join('\n');
    expect(lines).toMatch(/var1/);
    expect(lines).toMatch(/ca1/);
    expect(lines).toMatch(/0\.2030/);
    expect(lines).toMatch(/thompson_sampling/);
  });

  it('TS-9/TS-10: all 4 named states render distinctly and each contains its own token', () => {
    const cases = {
      query_error: { status: 'query_error', error: 'connection refused' },
      no_bridged_rows: { status: 'no_bridged_rows' },
      gate_excluded: { status: 'gate_excluded', reason: 'product_review_not_approved' },
      // D2 fix: fed the ACTUAL status the bridge emits ('no_outcome_data'), not a
      // hand-constructed 'no_writer_yet' the bridge never produces -- proves the translation
      // this test seam owns, rather than testing a status nothing upstream ever sends.
      no_writer_yet: { status: 'no_outcome_data', candidateCount: 2 },
    };

    const renders = {};
    for (const [token, result] of Object.entries(cases)) {
      const text = renderScoringState(result, 'v1').join('\n');
      // each render literally contains its own named state token
      expect(text).toMatch(new RegExp(`\\[${token}\\]`));
      renders[token] = text;
    }

    // pairwise distinctness -- a bare string-inequality check plus the token-containment above
    const tokens = Object.keys(renders);
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        expect(renders[tokens[i]]).not.toBe(renders[tokens[j]]);
      }
    }
  });

  it('error state is never confused with the confirmed-empty no_bridged_rows state', () => {
    const errorText = renderScoringState({ status: 'query_error', error: 'timeout' }, 'v1').join('\n');
    const emptyText = renderScoringState({ status: 'no_bridged_rows' }, 'v1').join('\n');
    expect(errorText).toMatch(/ERROR/);
    expect(emptyText).not.toMatch(/ERROR/);
  });
});
