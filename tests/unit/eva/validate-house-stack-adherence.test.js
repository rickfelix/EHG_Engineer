/**
 * Tests for lib/eva/utils/validate-house-stack-adherence.js
 * SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
 */
import { describe, it, expect } from 'vitest';
import {
  validateHouseStackAdherence,
  HouseStackDeviationError,
} from '../../../lib/eva/utils/validate-house-stack-adherence.js';
import {
  EHG_HOUSE_TECH_STACK,
  EHG_HOUSE_AUTH_STRATEGY,
} from '../../../lib/eva/config/house-tech-stack.js';

function buildMatchingArchitecture() {
  return {
    layers: {
      presentation: { technology: EHG_HOUSE_TECH_STACK.presentation.technology },
      api: { technology: EHG_HOUSE_TECH_STACK.api.technology },
      business_logic: { technology: EHG_HOUSE_TECH_STACK.business_logic.technology },
      data: { technology: EHG_HOUSE_TECH_STACK.data.technology },
      infrastructure: { technology: EHG_HOUSE_TECH_STACK.infrastructure.technology },
    },
    security: { authStrategy: EHG_HOUSE_AUTH_STRATEGY.technology },
  };
}

describe('validateHouseStackAdherence', () => {
  it('TS-1: matching house stack passes with no errors or warnings', () => {
    const result = validateHouseStackAdherence(buildMatchingArchitecture());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('TS-2: deviating layer without override fails with descriptive error', () => {
    const arch = buildMatchingArchitecture();
    arch.layers.infrastructure.technology = 'AWS';
    const result = validateHouseStackAdherence(arch, { allowOverride: false });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]).toMatch(/infrastructure/);
    expect(result.errors[0]).toMatch(/AWS/);
    expect(result.errors[0]).toMatch(/no override_reason provided/);
  });

  it('TS-3: deviating layer with allowOverride passes with warning', () => {
    const arch = buildMatchingArchitecture();
    arch.layers.infrastructure.technology = 'AWS GovCloud';
    const result = validateHouseStackAdherence(arch, { allowOverride: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toMatch(/infrastructure/);
    expect(result.warnings[0]).toMatch(/override permitted/);
  });

  it('TS-4: belt-and-suspenders — validator catches deviation independent of prompt', () => {
    // Hand-crafted fixture simulating an LLM that ignored the SYSTEM_PROMPT constraint
    const fixture = {
      layers: {
        presentation: { technology: EHG_HOUSE_TECH_STACK.presentation.technology },
        api: { technology: 'GraphQL' }, // deviates
        business_logic: { technology: EHG_HOUSE_TECH_STACK.business_logic.technology },
        data: { technology: EHG_HOUSE_TECH_STACK.data.technology },
        infrastructure: { technology: EHG_HOUSE_TECH_STACK.infrastructure.technology },
      },
      security: { authStrategy: EHG_HOUSE_AUTH_STRATEGY.technology },
    };
    const result = validateHouseStackAdherence(fixture, { allowOverride: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('layer api'))).toBe(true);
  });

  it('rejects deviating security.authStrategy without override', () => {
    const arch = buildMatchingArchitecture();
    arch.security.authStrategy = 'JWT';
    const result = validateHouseStackAdherence(arch, { allowOverride: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('authStrategy'))).toBe(true);
  });

  it('handles missing layer.technology field as deviation', () => {
    const arch = buildMatchingArchitecture();
    delete arch.layers.data.technology;
    const result = validateHouseStackAdherence(arch);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('layer data'))).toBe(true);
  });

  it('rejects null/non-object input', () => {
    const result = validateHouseStackAdherence(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/null or not an object/);
  });
});

describe('HouseStackDeviationError', () => {
  it('has correct name and code for routing', () => {
    const err = new HouseStackDeviationError('test', ['layer x: ...']);
    expect(err.name).toBe('HouseStackDeviationError');
    expect(err.code).toBe('HOUSE_STACK_DEVIATION');
    expect(err.errors).toEqual(['layer x: ...']);
    expect(err instanceof Error).toBe(true);
  });
});
