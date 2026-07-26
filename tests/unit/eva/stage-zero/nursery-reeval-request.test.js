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

// svc-stage-zero-invoker@ehg.dev — the provisioned non-human enqueue identity (AC-10).
// Pinned here so a change to the production registry has to be made deliberately in two
// places, not slipped in by editing the module alone.
const SERVICE_PRINCIPAL = '27e0e91e-35f7-4617-bbb9-932408db80f1';

describe('buildNurseryReevalRequest — AC-9 attribution guard', () => {
  // The registry was empty until 2026-07-26 and this test asserted toHaveLength(0). The
  // principal is now provisioned, so that assertion is retired — but NOT loosened. What it
  // was protecting (an unregistered caller cannot enqueue) is asserted below and is now
  // strictly harder to satisfy, because the registry holds a real id rather than nothing.
  it('registers exactly one NON-HUMAN principal, and never the chairman', () => {
    expect(REGISTERED_SERVICE_PRINCIPALS).toEqual([SERVICE_PRINCIPAL]);
    expect(REGISTERED_SERVICE_PRINCIPALS).not.toContain(CHAIRMAN_HUMAN_UID);
    // Runtime-append would defeat an allowlist; the registry must stay a reviewable diff.
    expect(Object.isFrozen(REGISTERED_SERVICE_PRINCIPALS)).toBe(true);
  });

  it('still refuses an unregistered caller against the PRODUCTION registry', () => {
    // No deps injected — this exercises the real allowlist, not a test fixture. It passed
    // when the registry was empty (everything was refused) and it must keep passing now
    // that it is populated, which is the stronger of the two states.
    expect(() =>
      buildNurseryReevalRequest({ requestedBy: FAKE_PRINCIPAL, nurseryId: HEADLINE_TRANSFORMER })
    ).toThrow(UnregisteredPrincipalError);
  });

  it('admits the registered principal against the PRODUCTION registry', () => {
    // The other direction, which was unprovable while the registry was empty: the guard
    // must not be a brick. A test that only ever asserts refusal cannot tell a working
    // allowlist from a permanently-closed door.
    const row = buildNurseryReevalRequest({
      requestedBy: SERVICE_PRINCIPAL,
      nurseryId: HEADLINE_TRANSFORMER,
    });
    expect(row.requested_by).toBe(SERVICE_PRINCIPAL);
    expect(row.metadata.nursery_id).toBe(HEADLINE_TRANSFORMER);
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
