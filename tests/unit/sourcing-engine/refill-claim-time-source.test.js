/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-D (FR-1) — unit tests for the pure claim-time
 * source-integrity helper evaluateClaimTimeRefillSource.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateClaimTimeRefillSource,
  REFILL_CLAIM_SOURCE_REASONS,
} from '../../../lib/sourcing-engine/refill-candidate-validity.js';

const SD_KEY = 'SD-REFILL-00ABCD12';

/** A still-valid promoted source: links back to SD_KEY, on a real lane, real title/provenance. */
const validSource = () => ({
  promoted_to_sd_key: SD_KEY,
  lane: 'build',
  title: 'Coordinator morning-trigger detection',
  source_id: '5d194c35-1307-44e0-8bf7-14d38ece03c0',
});

describe('evaluateClaimTimeRefillSource', () => {
  it('returns valid for a still-linked, non-declined, non-fixture source', () => {
    expect(evaluateClaimTimeRefillSource(validSource(), SD_KEY)).toEqual({ valid: true, reason: null });
  });

  it('source_missing for null / non-object / array', () => {
    expect(evaluateClaimTimeRefillSource(null, SD_KEY).reason).toBe(REFILL_CLAIM_SOURCE_REASONS.SOURCE_MISSING);
    expect(evaluateClaimTimeRefillSource(undefined, SD_KEY).reason).toBe(REFILL_CLAIM_SOURCE_REASONS.SOURCE_MISSING);
    expect(evaluateClaimTimeRefillSource('nope', SD_KEY).reason).toBe(REFILL_CLAIM_SOURCE_REASONS.SOURCE_MISSING);
    expect(evaluateClaimTimeRefillSource([], SD_KEY).reason).toBe(REFILL_CLAIM_SOURCE_REASONS.SOURCE_MISSING);
  });

  it('source_unlinked when promoted_to_sd_key is null/empty', () => {
    const s = { ...validSource(), promoted_to_sd_key: null };
    expect(evaluateClaimTimeRefillSource(s, SD_KEY)).toEqual({ valid: false, reason: REFILL_CLAIM_SOURCE_REASONS.SOURCE_UNLINKED });
    expect(evaluateClaimTimeRefillSource({ ...validSource(), promoted_to_sd_key: '' }, SD_KEY).reason)
      .toBe(REFILL_CLAIM_SOURCE_REASONS.SOURCE_UNLINKED);
  });

  it('source_unlinked when the link points to a DIFFERENT SD (re-pointed)', () => {
    const s = { ...validSource(), promoted_to_sd_key: 'SD-REFILL-99ZZZZ99' };
    expect(evaluateClaimTimeRefillSource(s, SD_KEY).reason).toBe(REFILL_CLAIM_SOURCE_REASONS.SOURCE_UNLINKED);
  });

  it('declined_lane when the source lane was routed to decline after promotion', () => {
    expect(evaluateClaimTimeRefillSource({ ...validSource(), lane: 'decline' }, SD_KEY).reason)
      .toBe(REFILL_CLAIM_SOURCE_REASONS.DECLINED_LANE);
    // case/space-insensitive
    expect(evaluateClaimTimeRefillSource({ ...validSource(), lane: '  DECLINE ' }, SD_KEY).reason)
      .toBe(REFILL_CLAIM_SOURCE_REASONS.DECLINED_LANE);
  });

  it('test_fixture when the source title or source_id is a TEST/DEMO fixture', () => {
    expect(evaluateClaimTimeRefillSource({ ...validSource(), title: 'TEST harness probe' }, SD_KEY).reason)
      .toBe(REFILL_CLAIM_SOURCE_REASONS.TEST_FIXTURE);
    expect(evaluateClaimTimeRefillSource({ ...validSource(), source_id: 'SD-DEMO-001' }, SD_KEY).reason)
      .toBe(REFILL_CLAIM_SOURCE_REASONS.TEST_FIXTURE);
  });

  it('EXCLUDED AXES: an already-promoted, non-pending source that is otherwise valid stays VALID', () => {
    // The raw -A predicate would short-circuit on already_promoted / not_staged; the claim-time helper
    // deliberately does NOT — these are the expected post-promotion state. No item_disposition field is
    // even consulted here.
    const s = { ...validSource(), item_disposition: 'promoted' };
    expect(evaluateClaimTimeRefillSource(s, SD_KEY)).toEqual({ valid: true, reason: null });
    // reasons surfaced are never the pre-promotion lifecycle ones
    expect(evaluateClaimTimeRefillSource(s, SD_KEY).reason).not.toBe('already_promoted');
    expect(evaluateClaimTimeRefillSource(s, SD_KEY).reason).not.toBe('not_staged');
  });

  it('is total — never throws on odd input', () => {
    expect(() => evaluateClaimTimeRefillSource({}, SD_KEY)).not.toThrow();
    expect(() => evaluateClaimTimeRefillSource({ lane: 42 }, SD_KEY)).not.toThrow();
    expect(() => evaluateClaimTimeRefillSource(validSource(), undefined)).not.toThrow();
  });
});
