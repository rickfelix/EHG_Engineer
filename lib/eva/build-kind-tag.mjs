/**
 * build-kind-tag — SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b).
 *
 * Derives a `build_kind: 'real'|'simulated'` fact from the SHIPPED real-build
 * discriminator (`lib/governance/real-build-discriminator.mjs isRealBuildStarted`)
 * and merges it ADDITIVELY into a stage_executions.metadata jsonb blob. This is
 * the emit-at-source tag SD-0a's audit chose `stage_executions.metadata` as the
 * canonical, additive home for.
 *
 * Two pure helpers, zero I/O:
 *   deriveBuildKind(venture) — 'real' | 'simulated' | null (FAIL-SOFT)
 *   mergeBuildKind(meta, kind) — additive, idempotent merge into a metadata object
 *
 * FAIL-SOFT is the governing invariant: a null/undefined venture or a throwing
 * discriminator NEVER throws here — it returns null (emit untagged) so a
 * derivation error can never block or fail a stage. The consumer
 * (lib/eva/stage-execution-worker.js) keeps its existing non-fatal wrapping.
 *
 * @module lib/eva/build-kind-tag
 */

import { isRealBuildStarted } from '../governance/real-build-discriminator.mjs';

/**
 * Derive the real-vs-simulated build_kind tag for a venture. Pure, fail-soft.
 *
 * build_kind = isRealBuildStarted(venture) ? 'real' : 'simulated'.
 * Returns null (emit UNTAGGED) when the venture is null/undefined or the
 * discriminator throws — a derivation error must never surface to the caller.
 *
 * @param {{deployment_url?:string|null, repo_url?:string|null, workflow_started_at?:string|null, launch_mode?:string|null}|null|undefined} venture
 * @returns {'real'|'simulated'|null}
 */
export function deriveBuildKind(venture) {
  if (venture === null || venture === undefined) return null;
  try {
    return isRealBuildStarted(venture) ? 'real' : 'simulated';
  } catch {
    // FAIL-SOFT: any discriminator error → untagged, never throw.
    return null;
  }
}

/**
 * Additively merge a build_kind tag into a stage_executions metadata object.
 * ADDITIVE + IDEMPOTENT: spreads any existing metadata (preserving every other
 * key), then sets `build_kind`. When `buildKind` is null/undefined the existing
 * metadata is returned UNCHANGED (tag omitted — never a `build_kind: null` key).
 * Re-merging the same kind is a no-op for the tag.
 *
 * @param {object|null|undefined} existingMetadata - current metadata jsonb (may be null)
 * @param {'real'|'simulated'|null|undefined} buildKind
 * @returns {object} a NEW metadata object (never mutates the input)
 */
export function mergeBuildKind(existingMetadata, buildKind) {
  const base =
    existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
      ? existingMetadata
      : {};
  if (buildKind === null || buildKind === undefined) {
    // Additive-omit: never introduce a null build_kind key; leave metadata as-is.
    return { ...base };
  }
  return { ...base, build_kind: buildKind };
}
