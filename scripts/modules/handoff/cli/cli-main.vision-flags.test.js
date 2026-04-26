// SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001
// Tests for applyVisionKeyOverrides — handoff.js argv → env-var pass-through.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyVisionKeyOverrides } from './cli-main.js';

describe('applyVisionKeyOverrides', () => {
  let originalVisionEnv;
  let originalArchEnv;

  beforeEach(() => {
    originalVisionEnv = process.env.LEO_VISION_KEY_OVERRIDE;
    originalArchEnv = process.env.LEO_ARCH_KEY_OVERRIDE;
    delete process.env.LEO_VISION_KEY_OVERRIDE;
    delete process.env.LEO_ARCH_KEY_OVERRIDE;
  });

  afterEach(() => {
    if (originalVisionEnv === undefined) delete process.env.LEO_VISION_KEY_OVERRIDE;
    else process.env.LEO_VISION_KEY_OVERRIDE = originalVisionEnv;
    if (originalArchEnv === undefined) delete process.env.LEO_ARCH_KEY_OVERRIDE;
    else process.env.LEO_ARCH_KEY_OVERRIDE = originalArchEnv;
  });

  it('returns nulls and sets no env vars when flags absent', () => {
    const result = applyVisionKeyOverrides(['precheck', 'LEAD-TO-PLAN', 'SD-X-001']);
    expect(result).toEqual({ visionKey: null, archKey: null });
    expect(process.env.LEO_VISION_KEY_OVERRIDE).toBeUndefined();
    expect(process.env.LEO_ARCH_KEY_OVERRIDE).toBeUndefined();
  });

  it('parses --vision-key and sets env var', () => {
    const args = ['precheck', 'LEAD-TO-PLAN', 'SD-X-001', '--vision-key', 'VISION-EHG-L2-001'];
    const result = applyVisionKeyOverrides(args);
    expect(result.visionKey).toBe('VISION-EHG-L2-001');
    expect(process.env.LEO_VISION_KEY_OVERRIDE).toBe('VISION-EHG-L2-001');
  });

  it('parses --arch-key and sets env var', () => {
    const args = ['execute', 'LEAD-TO-PLAN', 'SD-X-001', '--arch-key', 'ARCH-EHG-L2-001'];
    const result = applyVisionKeyOverrides(args);
    expect(result.archKey).toBe('ARCH-EHG-L2-001');
    expect(process.env.LEO_ARCH_KEY_OVERRIDE).toBe('ARCH-EHG-L2-001');
  });

  it('parses both flags together', () => {
    const args = [
      'execute', 'LEAD-TO-PLAN', 'SD-X-001',
      '--vision-key', 'VISION-EHG-L2-001',
      '--arch-key', 'ARCH-EHG-L2-001'
    ];
    const result = applyVisionKeyOverrides(args);
    expect(result).toEqual({ visionKey: 'VISION-EHG-L2-001', archKey: 'ARCH-EHG-L2-001' });
    expect(process.env.LEO_VISION_KEY_OVERRIDE).toBe('VISION-EHG-L2-001');
    expect(process.env.LEO_ARCH_KEY_OVERRIDE).toBe('ARCH-EHG-L2-001');
  });

  it('coexists with --bypass-validation and --bypass-reason', () => {
    const args = [
      'execute', 'LEAD-TO-PLAN', 'SD-X-001',
      '--bypass-validation',
      '--bypass-reason', 'Some reason at least twenty chars',
      '--vision-key', 'VISION-EHG-L2-001'
    ];
    const result = applyVisionKeyOverrides(args);
    expect(result.visionKey).toBe('VISION-EHG-L2-001');
    // The bypass-reason value should NOT leak into vision-key.
    expect(process.env.LEO_VISION_KEY_OVERRIDE).toBe('VISION-EHG-L2-001');
  });

  it('returns null for flag at end without value', () => {
    // --vision-key with no following value — should not crash, returns null.
    const args = ['execute', 'LEAD-TO-PLAN', 'SD-X-001', '--vision-key'];
    const result = applyVisionKeyOverrides(args);
    expect(result.visionKey).toBeNull();
    expect(process.env.LEO_VISION_KEY_OVERRIDE).toBeUndefined();
  });

  it('does not mutate args array', () => {
    const args = ['execute', 'LEAD-TO-PLAN', 'SD-X-001', '--vision-key', 'VISION-EHG-L2-001'];
    const before = [...args];
    applyVisionKeyOverrides(args);
    expect(args).toEqual(before);
  });
});
