/**
 * Config-diff auditor (FR-2/FR-3/FR-5, SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C).
 *
 * Compares a preview instance's effective config against production and
 * emits a structured TEST_MODE_DIVERGENCE finding for any key differing
 * outside the 7-row enumeration (docs/design/deploy-pipeline-architecture.md
 * §4). Never flags the enumerated keys themselves — they share the same
 * allowlist as the overlay generator, so the two can never drift out of sync.
 *
 * @module lib/deploy/config-diff-auditor
 */

import { ALL_ENUMERATED_KEYS } from './test-mode-divergence-keys.mjs';

const SECRET_KEY_PATTERN = /SECRET|KEY|TOKEN/i;

function maskIfSecret(key, value) {
  return SECRET_KEY_PATTERN.test(key) ? '***MASKED***' : value;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {Record<string, unknown>} prodConfig
 * @param {Record<string, unknown>} previewConfig
 * @param {{now?: string}} [opts] detectedAt is caller-supplied (no wall-clock dependency, TR-1/FR-5)
 * @returns {Array<{type: 'TEST_MODE_DIVERGENCE', key: string, prodValue: unknown, previewValue: unknown, severity: 'HIGH', detectedAt: string|undefined}>}
 */
export function auditConfigDiff(prodConfig, previewConfig, opts = {}) {
  const prod = prodConfig || {};
  const preview = previewConfig || {};
  const allKeys = new Set([...Object.keys(prod), ...Object.keys(preview)]);
  const findings = [];

  for (const key of allKeys) {
    if (ALL_ENUMERATED_KEYS.includes(key)) continue;
    if (valuesEqual(prod[key], preview[key])) continue;
    findings.push({
      type: 'TEST_MODE_DIVERGENCE',
      key,
      prodValue: maskIfSecret(key, prod[key]),
      previewValue: maskIfSecret(key, preview[key]),
      severity: 'HIGH',
      detectedAt: opts.now,
    });
  }

  return findings;
}
