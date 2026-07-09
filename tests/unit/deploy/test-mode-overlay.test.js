/**
 * lib/deploy/test-mode-overlay unit tests
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C
 */

import { describe, it, expect } from 'vitest';
import { generateTestModeOverlay } from '../../../lib/deploy/test-mode-overlay.mjs';
import { ALL_ENUMERATED_KEYS } from '../../../lib/deploy/test-mode-divergence-keys.mjs';

const prodConfig = {
  EMAIL_TRANSPORT: 'sendgrid',
  PAYMENTS_MODE: 'live',
  CLOCK_SOURCE: 'system',
  DATABASE_URL: 'postgres://prod',
  SEED_HOOKS: 'disabled',
  TELEMETRY_SINK: 'production',
  APP_NAME: 'marketlens',
  REGION: 'us-east-1',
};

describe('TS-1: overlay generator happy path', () => {
  it('produces exactly the 7 enumerated keys changed, all other keys byte-identical', () => {
    const overlay = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: true });
    expect(overlay.EMAIL_TRANSPORT).toBe('capture');
    expect(overlay.PAYMENTS_MODE).toBe('test');
    expect(overlay.CLOCK_SOURCE).toBe('injected');
    expect(overlay.DATABASE_URL).toBe('<ephemeral>');
    expect(overlay.SEED_HOOKS).toBe('enabled');
    expect(overlay.TELEMETRY_SINK).toBe('test');
    expect(overlay.THIRD_PARTY_PROXY).toBe('record-replay');
    expect(overlay.APP_NAME).toBe(prodConfig.APP_NAME);
    expect(overlay.REGION).toBe(prodConfig.REGION);
  });

  it('is deterministic across repeated calls with the same inputs', () => {
    const a = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: true });
    const b = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: true });
    expect(a).toEqual(b);
  });
});

describe('TS-2: THIRD_PARTY_PROXY is optional / per-venture declared', () => {
  it('omits THIRD_PARTY_PROXY when not declared', () => {
    const overlay = generateTestModeOverlay(prodConfig);
    expect('THIRD_PARTY_PROXY' in overlay).toBe(false);
  });

  it('omits THIRD_PARTY_PROXY when explicitly declared false', () => {
    const overlay = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: false });
    expect('THIRD_PARTY_PROXY' in overlay).toBe(false);
  });

  it('includes THIRD_PARTY_PROXY only when declared true', () => {
    const overlay = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: true });
    expect(overlay.THIRD_PARTY_PROXY).toBe('record-replay');
  });
});

describe('shared allowlist', () => {
  it('exports all 7 enumerated keys', () => {
    expect(ALL_ENUMERATED_KEYS).toHaveLength(7);
  });
});
