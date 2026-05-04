import { describe, it, expect } from 'vitest';
import {
  TARGET_APPLICATION_CAPABILITIES,
  TARGET_CAPABILITIES_VERSION,
  getTargetApplicationCapabilities,
} from '../../../../lib/eva/config/target-application-capabilities.js';

describe('target-application-capabilities', () => {
  it('exports a version', () => {
    expect(TARGET_CAPABILITIES_VERSION).toMatch(/^\d{4}\.\d{2}$/);
  });

  it('lists ehg as has_serverless_api=false', () => {
    expect(TARGET_APPLICATION_CAPABILITIES.ehg.has_serverless_api).toBe(false);
  });

  it('lists ehg_engineer as has_serverless_api=true', () => {
    expect(TARGET_APPLICATION_CAPABILITIES.ehg_engineer.has_serverless_api).toBe(true);
  });

  it('returns false for ehg via lookup', () => {
    expect(getTargetApplicationCapabilities('ehg').has_serverless_api).toBe(false);
  });

  it('returns true for EHG_Engineer via lookup (case-insensitive)', () => {
    expect(getTargetApplicationCapabilities('EHG_Engineer').has_serverless_api).toBe(true);
    expect(getTargetApplicationCapabilities('ehg_engineer').has_serverless_api).toBe(true);
    expect(getTargetApplicationCapabilities('EHG Engineer').has_serverless_api).toBe(true);
    expect(getTargetApplicationCapabilities('ehg-engineer').has_serverless_api).toBe(true);
  });

  it('defaults unknown targets to permissive (has_serverless_api=true) to preserve existing emission', () => {
    expect(getTargetApplicationCapabilities('some-new-venture').has_serverless_api).toBe(true);
    expect(getTargetApplicationCapabilities(null).has_serverless_api).toBe(true);
    expect(getTargetApplicationCapabilities(undefined).has_serverless_api).toBe(true);
    expect(getTargetApplicationCapabilities('').has_serverless_api).toBe(true);
  });

  it('returns frozen objects (defensive against mutation)', () => {
    const ehg = getTargetApplicationCapabilities('ehg');
    expect(Object.isFrozen(ehg)).toBe(true);
    expect(Object.isFrozen(TARGET_APPLICATION_CAPABILITIES)).toBe(true);
  });
});
