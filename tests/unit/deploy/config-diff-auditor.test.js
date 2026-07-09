/**
 * lib/deploy/config-diff-auditor unit tests
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-C
 */

import { describe, it, expect } from 'vitest';
import { auditConfigDiff } from '../../../lib/deploy/config-diff-auditor.mjs';
import { generateTestModeOverlay } from '../../../lib/deploy/test-mode-overlay.mjs';

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

describe('TS-3: auditor happy path', () => {
  it('preview built by the overlay generator produces zero findings', () => {
    const previewConfig = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: true });
    const findings = auditConfigDiff(prodConfig, previewConfig);
    expect(findings).toEqual([]);
  });
});

describe('TS-4: auditor flags a single out-of-budget divergence', () => {
  it('produces exactly one TEST_MODE_DIVERGENCE finding naming the offending key', () => {
    const previewConfig = { ...generateTestModeOverlay(prodConfig), REGION: 'us-west-2' };
    const findings = auditConfigDiff(prodConfig, previewConfig);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ type: 'TEST_MODE_DIVERGENCE', key: 'REGION', prodValue: 'us-east-1', previewValue: 'us-west-2', severity: 'HIGH' });
  });
});

describe('TS-5: auditor flags each of multiple out-of-budget divergences independently', () => {
  it('produces exactly 3 findings, one per offending key', () => {
    const previewConfig = {
      ...generateTestModeOverlay(prodConfig),
      REGION: 'us-west-2',
      APP_NAME: 'renamed',
      NEW_UNBUDGETED_KEY: 'surprise',
    };
    const findings = auditConfigDiff(prodConfig, previewConfig);
    expect(findings).toHaveLength(3);
    const keys = findings.map((f) => f.key).sort();
    expect(keys).toEqual(['APP_NAME', 'NEW_UNBUDGETED_KEY', 'REGION']);
  });
});

describe('TS-8: auditor never flags the 7 enumerated keys, even adversarially', () => {
  it('produces zero findings when only the enumerated keys differ', () => {
    const previewConfig = generateTestModeOverlay(prodConfig, { thirdPartyProxyDeclared: true });
    const findings = auditConfigDiff(prodConfig, previewConfig);
    expect(findings.some((f) => f.key === 'THIRD_PARTY_PROXY')).toBe(false);
    expect(findings).toEqual([]);
  });

  it('never flags an enumerated key even with an arbitrary adversarial value', () => {
    const previewConfig = { ...prodConfig, EMAIL_TRANSPORT: 'something-totally-different' };
    const findings = auditConfigDiff(prodConfig, previewConfig);
    expect(findings.some((f) => f.key === 'EMAIL_TRANSPORT')).toBe(false);
  });
});

describe('secret masking (FR-2 AC3)', () => {
  it('masks values for keys matching SECRET/KEY/TOKEN', () => {
    const prod = { ...prodConfig, API_SECRET: 'sk_live_abc123' };
    const preview = { ...prod, API_SECRET: 'sk_live_xyz789' };
    const findings = auditConfigDiff(prod, preview);
    const finding = findings.find((f) => f.key === 'API_SECRET');
    expect(finding.prodValue).toBe('***MASKED***');
    expect(finding.previewValue).toBe('***MASKED***');
  });
});

describe('FR-5: structured findings, no throw on well-formed input', () => {
  it('always returns an array, empty when nothing diverges', () => {
    expect(Array.isArray(auditConfigDiff(prodConfig, { ...prodConfig }))).toBe(true);
  });

  it('propagates caller-supplied detectedAt without computing wall-clock time', () => {
    const previewConfig = { ...prodConfig, REGION: 'eu-west-1' };
    const findings = auditConfigDiff(prodConfig, previewConfig, { now: '2026-07-09T00:00:00Z' });
    expect(findings[0].detectedAt).toBe('2026-07-09T00:00:00Z');
  });
});
