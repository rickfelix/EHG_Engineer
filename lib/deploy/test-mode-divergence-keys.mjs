/**
 * Shared allowlist of the 7 enumerated test-mode config divergences
 * (docs/design/deploy-pipeline-architecture.md §4, SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C).
 *
 * Single source of truth imported by both test-mode-overlay.mjs (FR-1) and
 * config-diff-auditor.mjs (FR-2/FR-3) so the two can never drift out of sync
 * with each other — the allowlist that generates the overlay IS the allowlist
 * the auditor exempts from findings.
 *
 * @module lib/deploy/test-mode-divergence-keys
 */

export const TEST_MODE_OVERLAY_VALUES = Object.freeze({
  EMAIL_TRANSPORT: 'capture',
  PAYMENTS_MODE: 'test',
  CLOCK_SOURCE: 'injected',
  DATABASE_URL: '<ephemeral>',
  SEED_HOOKS: 'enabled',
  TELEMETRY_SINK: 'test',
  THIRD_PARTY_PROXY: 'record-replay',
});

// THIRD_PARTY_PROXY is optional/per-venture-declared (design §4 row 7) — it is
// excluded from the always-applied set and added conditionally by the overlay
// generator, and excluded from the auditor's mandatory allowlist so its
// absence never itself produces a finding either way.
export const ALWAYS_APPLIED_KEYS = Object.freeze(
  Object.keys(TEST_MODE_OVERLAY_VALUES).filter((key) => key !== 'THIRD_PARTY_PROXY')
);

export const OPTIONAL_DECLARED_KEY = 'THIRD_PARTY_PROXY';

export const ALL_ENUMERATED_KEYS = Object.freeze(Object.keys(TEST_MODE_OVERLAY_VALUES));
