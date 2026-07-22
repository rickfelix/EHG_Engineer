/**
 * SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b / FR-5).
 *
 * Unit coverage for the real-vs-simulated build_kind tag helpers
 * (lib/eva/build-kind-tag.mjs). Guards the FAIL-SOFT + ADDITIVE + IDEMPOTENT
 * invariants that the stage-execution-worker emission relies on:
 *   - deriveBuildKind: 'simulated' (no real-build signals), 'real' (any signal),
 *     null (null/undefined venture or a throwing discriminator → never throws).
 *   - mergeBuildKind: preserves every existing metadata key (RED vs a clobbering
 *     merge), omits the key when build_kind is null, and is idempotent.
 */
import { describe, it, expect } from 'vitest';
import { deriveBuildKind, mergeBuildKind } from '../../../lib/eva/build-kind-tag.mjs';

describe('deriveBuildKind (FR-1 fail-soft derivation)', () => {
  it("returns 'simulated' when no real-build signals are present", () => {
    expect(
      deriveBuildKind({
        launch_mode: 'simulated',
        deployment_url: null,
        repo_url: null,
        workflow_started_at: null,
      })
    ).toBe('simulated');
  });

  it("returns 'real' when deployment_url is set", () => {
    expect(deriveBuildKind({ launch_mode: 'simulated', deployment_url: 'https://x.app' })).toBe('real');
  });

  it("returns 'real' when launch_mode === 'live'", () => {
    expect(deriveBuildKind({ launch_mode: 'live' })).toBe('real');
  });

  it("returns 'real' when repo_url or workflow_started_at is set", () => {
    expect(deriveBuildKind({ repo_url: 'https://github.com/x/y' })).toBe('real');
    expect(deriveBuildKind({ workflow_started_at: '2026-07-22T00:00:00Z' })).toBe('real');
  });

  it('returns null when venture is null or undefined (fail-soft, emit untagged)', () => {
    expect(deriveBuildKind(null)).toBeNull();
    expect(deriveBuildKind(undefined)).toBeNull();
  });

  it('returns null (never throws) when the venture accessor throws', () => {
    // A getter that throws simulates a discriminator-side error. Fail-soft must
    // swallow it and return null rather than propagate.
    const hostile = {
      get deployment_url() {
        throw new Error('boom');
      },
    };
    expect(() => deriveBuildKind(hostile)).not.toThrow();
    expect(deriveBuildKind(hostile)).toBeNull();
  });
});

describe('mergeBuildKind (FR-2 additive + idempotent merge)', () => {
  it('preserves existing metadata keys while adding build_kind (RED vs a clobbering merge)', () => {
    const existing = { operating_mode: 'BUILD', trace_id: 'abc' };
    const merged = mergeBuildKind(existing, 'simulated');
    expect(merged).toEqual({ operating_mode: 'BUILD', trace_id: 'abc', build_kind: 'simulated' });
    // additive: original untouched, and the two preserved keys survive.
    expect(merged.operating_mode).toBe('BUILD');
    expect(merged.trace_id).toBe('abc');
  });

  it('does not mutate the input metadata object', () => {
    const existing = { operating_mode: 'BUILD' };
    mergeBuildKind(existing, 'real');
    expect(existing).toEqual({ operating_mode: 'BUILD' });
    expect(existing.build_kind).toBeUndefined();
  });

  it('is idempotent — merging the same kind twice yields an equal result', () => {
    const once = mergeBuildKind({ operating_mode: 'BUILD' }, 'simulated');
    const twice = mergeBuildKind(once, 'simulated');
    expect(twice).toEqual(once);
  });

  it('omits build_kind entirely when kind is null/undefined (never a null key)', () => {
    expect(mergeBuildKind({ operating_mode: 'BUILD' }, null)).toEqual({ operating_mode: 'BUILD' });
    expect('build_kind' in mergeBuildKind({ operating_mode: 'BUILD' }, undefined)).toBe(false);
  });

  it('handles null/non-object existing metadata by starting from an empty object', () => {
    expect(mergeBuildKind(null, 'real')).toEqual({ build_kind: 'real' });
    expect(mergeBuildKind(undefined, 'simulated')).toEqual({ build_kind: 'simulated' });
  });
});
