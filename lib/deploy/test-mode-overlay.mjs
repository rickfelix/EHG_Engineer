/**
 * Test-mode config overlay generator (FR-1, SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C).
 *
 * Generates a preview instance's effective config from production config plus
 * the 7-row divergence enumeration — ALWAYS generated, never hand-edited, so
 * it stays in lockstep with production config drift. DATABASE_URL is an
 * opaque placeholder here; the real ephemeral URL is injected by Child B's
 * preview(sha, fixture) primitive at deploy time (TR-2 — out of this
 * module's scope).
 *
 * @module lib/deploy/test-mode-overlay
 */

import { TEST_MODE_OVERLAY_VALUES, ALWAYS_APPLIED_KEYS, OPTIONAL_DECLARED_KEY } from './test-mode-divergence-keys.mjs';

/**
 * @param {Record<string, unknown>} prodConfig production config to overlay
 * @param {{thirdPartyProxyDeclared?: boolean}} [opts]
 * @returns {Record<string, unknown>} a new config object — prodConfig plus the enumerated divergences
 */
export function generateTestModeOverlay(prodConfig, opts = {}) {
  const overlay = { ...prodConfig };
  for (const key of ALWAYS_APPLIED_KEYS) {
    overlay[key] = TEST_MODE_OVERLAY_VALUES[key];
  }
  if (opts.thirdPartyProxyDeclared === true) {
    overlay[OPTIONAL_DECLARED_KEY] = TEST_MODE_OVERLAY_VALUES[OPTIONAL_DECLARED_KEY];
  }
  return overlay;
}
