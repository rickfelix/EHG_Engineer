import { describe, it, expect } from 'vitest';
import {
  buildNurseryReevalRequest,
  UnregisteredPrincipalError,
  REGISTERED_SERVICE_PRINCIPALS,
  NURSERY_REEVAL_PATH,
  NURSERY_REEVAL_STRATEGY,
} from '../../../../lib/eva/stage-zero/nursery-reeval-request.js';

// The FR-5 target, named by UUID because five nursery rows tie at score 90.
const HEADLINE_TRANSFORMER = '3d95f7ea-7d6e-4ffd-ba14-2d915b65fda1';

// rickfelix2000@gmail.com — the chairman's own auth.users row, and the ONLY id that has
// ever appeared in stage_zero_requests.requested_by. Pinned here as the concrete thing
// AC-9 forbids, not as a denylist the module consults.
const CHAIRMAN_HUMAN_UID = '69c8aa7a-7661-48ed-9779-746fa6290873';

const FAKE_PRINCIPAL = '00000000-0000-4000-8000-00000000dead';
const withPrincipal = { registeredPrincipals: [FAKE_PRINCIPAL] };

describe('buildNurseryReevalRequest — AC-9 attribution guard', () => {
  it('refuses every request while the production registry is empty', () => {
    // Not an incidental assertion: the empty registry IS the current state, and this test
    // is what makes "FR-5 has no honest author yet" fail loudly instead of silently
    // defaulting to whatever uid a caller happens to pass.
    expect(REGISTERED_SERVICE_PRINCIPALS).toHaveLength(0);
    expect(() =>
      buildNurseryReevalRequest({ requestedBy: FAKE_PRINCIPAL, nurseryId: HEADLINE_TRANSFORMER })
    ).toThrow(UnregisteredPrincipalError);
  });

  it('refuses the chairman human account even when other principals are registered', () => {
    expect(() =>
      buildNurseryReevalRequest(
        { requestedBy: CHAIRMAN_HUMAN_UID, nurseryId: HEADLINE_TRANSFORMER },
        withPrincipal
      )
    ).toThrow(UnregisteredPrincipalError);
  });

  it('refuses a missing requested_by rather than emitting a null-attributed row', () => {
    expect(() => buildNurseryReevalRequest({ nurseryId: HEADLINE_TRANSFORMER }, withPrincipal))
      .toThrow(UnregisteredPrincipalError);
  });

  it('is an allowlist, not a denylist — an unknown uuid is refused, not admitted', () => {
    // A denylist would admit this; the direction of the check is the point.
    expect(() =>
      buildNurseryReevalRequest(
        { requestedBy: '11111111-2222-4333-8444-555555555555', nurseryId: HEADLINE_TRANSFORMER },
        withPrincipal
      )
    ).toThrow(UnregisteredPrincipalError);
  });
});

describe('buildNurseryReevalRequest — dispatch shape', () => {
  const build = (over = {}) =>
    buildNurseryReevalRequest(
      { requestedBy: FAKE_PRINCIPAL, nurseryId: HEADLINE_TRANSFORMER, ...over },
      withPrincipal
    );

  it('writes BOTH path and strategy as own properties', () => {
    // The failure mode here is OMISSION, not a wrong value: the queue processor defaults
    // metadata.path to 'blueprint_browse' (:206) and metadata.strategy to 'trend_scanner'
    // (:232), so an omitted key produces a request that completes successfully down the
    // wrong path and witnesses nothing. Assert presence, then value.
    const { metadata } = build();
    expect(Object.hasOwn(metadata, 'path')).toBe(true);
    expect(Object.hasOwn(metadata, 'strategy')).toBe(true);
    expect(metadata.path).toBe(NURSERY_REEVAL_PATH);
    expect(metadata.strategy).toBe(NURSERY_REEVAL_STRATEGY);
  });

  it('pins the literals the processor dispatches on', () => {
    expect(NURSERY_REEVAL_PATH).toBe('discovery_mode');
    expect(NURSERY_REEVAL_STRATEGY).toBe('nursery_reeval');
    // Neither may silently become the processor's default.
    expect(NURSERY_REEVAL_PATH).not.toBe('blueprint_browse');
    expect(NURSERY_REEVAL_STRATEGY).not.toBe('trend_scanner');
  });

  it('satisfies must_reference_blueprint_venture_or_path via metadata.path', () => {
    // The CHECK admits a row with no blueprint_id and no venture_id only when
    // metadata->>'path' is non-null.
    const row = build();
    expect(row.blueprint_id).toBeUndefined();
    expect(row.venture_id).toBeUndefined();
    expect(row.metadata.path).not.toBeNull();
  });

  it('carries the target nursery id and defaults candidate_count to 1', () => {
    const { metadata } = build();
    expect(metadata.nursery_id).toBe(HEADLINE_TRANSFORMER);
    // FR-5 promotes ONE named row; a larger slate would make the witness ambiguous.
    expect(metadata.candidate_count).toBe(1);
  });

  it('uses candidate_count snake_case, the casing the dedup key reads first', () => {
    const { metadata } = build({ candidateCount: 3 });
    expect(metadata.candidate_count).toBe(3);
  });

  it('rejects a nurseryId that is absent or not a UUID', () => {
    expect(() => build({ nurseryId: undefined })).toThrow(/must be a UUID/);
    expect(() => build({ nurseryId: 'Headline Transformer' })).toThrow(/must be a UUID/);
  });
});
