/**
 * Unit Tests for Persona Config Provider
 * SD-LEO-ENH-TARGET-APPLICATION-AWARE-001
 *
 * Tests: normalization, DB-config lookup, fallback behavior,
 * error codes, SD-type overrides, validation.
 */

import {
  normalizePersona,
  getPersonaConfig,
  isForbiddenForApp,
  validatePersonaForApp,
  getForbiddenPersonasSync,
  invalidateCache,
  PERSONA_ERRORS
} from '../../lib/persona-config-provider.js';

// ============================================================================
// TEST GROUP 1: normalizePersona()
// ============================================================================
describe('normalizePersona()', () => {
  it('should handle camelCase', () => {
    expect(normalizePersona('soloEntrepreneur')).toBe('solo_entrepreneur');
  });

  it('should handle PascalCase', () => {
    expect(normalizePersona('SoloEntrepreneur')).toBe('solo_entrepreneur');
  });

  it('should handle spaces', () => {
    expect(normalizePersona('Solo Entrepreneur')).toBe('solo_entrepreneur');
  });

  it('should handle hyphens', () => {
    expect(normalizePersona('solo-entrepreneur')).toBe('solo_entrepreneur');
  });

  it('should handle already-normalized snake_case', () => {
    expect(normalizePersona('solo_entrepreneur')).toBe('solo_entrepreneur');
  });

  it('should handle uppercase', () => {
    expect(normalizePersona('DEVELOPER')).toBe('developer');
  });

  it('should handle mixed formats with extra whitespace', () => {
    expect(normalizePersona('  Solo Entrepreneur  ')).toBe('solo_entrepreneur');
  });

  it('should handle single word', () => {
    expect(normalizePersona('developer')).toBe('developer');
    expect(normalizePersona('Developer')).toBe('developer');
  });

  it('should handle empty/null/undefined', () => {
    expect(normalizePersona('')).toBe('');
    expect(normalizePersona(null)).toBe('');
    expect(normalizePersona(undefined)).toBe('');
  });

  it('should collapse multiple underscores', () => {
    expect(normalizePersona('solo__entrepreneur')).toBe('solo_entrepreneur');
  });

  it('should handle multi-word camelCase', () => {
    expect(normalizePersona('chiefFinancialOfficer')).toBe('chief_financial_officer');
  });
});

// ============================================================================
// TEST GROUP 2: PERSONA_ERRORS
// ============================================================================
describe('PERSONA_ERRORS', () => {
  it('should define PERSONA_NOT_ALLOWED_FOR_APP', () => {
    expect(PERSONA_ERRORS.PERSONA_NOT_ALLOWED_FOR_APP).toBe('PERSONA_NOT_ALLOWED_FOR_APP');
  });

  it('should define PERSONA_TEMPLATE_NOT_FOUND', () => {
    expect(PERSONA_ERRORS.PERSONA_TEMPLATE_NOT_FOUND).toBe('PERSONA_TEMPLATE_NOT_FOUND');
  });

  it('should define PERSONA_CONFIG_FALLBACK_USED', () => {
    expect(PERSONA_ERRORS.PERSONA_CONFIG_FALLBACK_USED).toBe('PERSONA_CONFIG_FALLBACK_USED');
  });
});

// ============================================================================
// TEST GROUP 3: getPersonaConfig() - fallback behavior
// ============================================================================
describe('getPersonaConfig()', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('should return EHG config from fallback when DB unavailable', async () => {
    // With no DB env vars, should use fallback
    const config = await getPersonaConfig('EHG');
    expect(config).toBeDefined();
    expect(config.target_application).toBe('EHG');
    expect(config.mandatory_personas).toContain('chairman');
    expect(config.mandatory_personas).toContain('solo_entrepreneur');
    expect(config.forbidden_personas).toContain('developer');
    expect(config.forbidden_personas).toContain('dba');
  });

  it('should return EHG_Engineer config with null forbidden_personas', async () => {
    const config = await getPersonaConfig('EHG_Engineer');
    expect(config).toBeDefined();
    expect(config.target_application).toBe('EHG_Engineer');
    expect(config.forbidden_personas).toBeNull();
  });

  it('should return _default config for unknown app', async () => {
    const config = await getPersonaConfig('UnknownApp');
    expect(config).toBeDefined();
    expect(config.target_application).toBe('_default');
    expect(config.forbidden_personas).toContain('developer');
  });

  it('should have sd_type_overrides for _default', async () => {
    const config = await getPersonaConfig('_default');
    expect(config.sd_type_overrides).toBeDefined();
    expect(config.sd_type_overrides.infrastructure).toEqual({ allow_technical: true });
    expect(config.sd_type_overrides.documentation).toEqual({ allow_technical: true });
  });
});

// ============================================================================
// TEST GROUP 4: isForbiddenForApp()
// ============================================================================
describe('isForbiddenForApp()', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('should block developer persona for EHG', async () => {
    const result = await isForbiddenForApp('developer', 'EHG');
    expect(result).toBe(true);
  });

  it('should block dba persona for EHG', async () => {
    const result = await isForbiddenForApp('dba', 'EHG');
    expect(result).toBe(true);
  });

  it('should allow developer persona for EHG_Engineer', async () => {
    const result = await isForbiddenForApp('developer', 'EHG_Engineer');
    expect(result).toBe(false);
  });

  it('should allow founder persona for EHG', async () => {
    const result = await isForbiddenForApp('founder', 'EHG');
    expect(result).toBe(false);
  });

  it('should allow technical personas for infrastructure SD type', async () => {
    const result = await isForbiddenForApp('developer', 'EHG', 'infrastructure');
    expect(result).toBe(false);
  });

  it('should block technical personas for feature SD type on EHG', async () => {
    const result = await isForbiddenForApp('developer', 'EHG', 'feature');
    expect(result).toBe(true);
  });

  it('should handle normalized input (PascalCase)', async () => {
    const result = await isForbiddenForApp('DevOps', 'EHG');
    expect(result).toBe(true);
  });

  it('should handle normalized input (with extra spaces)', async () => {
    const result = await isForbiddenForApp('  developer  ', 'EHG');
    expect(result).toBe(true);
  });
});

// ============================================================================
// TEST GROUP 5: getForbiddenPersonasSync()
// ============================================================================
describe('getForbiddenPersonasSync()', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('should return forbidden list for _default', () => {
    const list = getForbiddenPersonasSync('_default');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list).toContain('developer');
  });

  it('should return empty array for EHG_Engineer (null forbidden_personas)', () => {
    const list = getForbiddenPersonasSync('EHG_Engineer');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });

  it('should return empty array when SD type allows technical', () => {
    const list = getForbiddenPersonasSync('_default', 'infrastructure');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });

  it('should return full list for feature SD type', () => {
    const list = getForbiddenPersonasSync('_default', 'feature');
    expect(list.length).toBeGreaterThan(0);
    expect(list).toContain('developer');
  });
});

// ============================================================================
// TEST GROUP 6: validatePersonaForApp()
// ============================================================================
describe('validatePersonaForApp()', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('should return valid for allowed persona', async () => {
    const result = await validatePersonaForApp('founder', 'EHG');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('founder');
  });

  it('should return invalid with error code for forbidden persona', async () => {
    const result = await validatePersonaForApp('developer', 'EHG');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(PERSONA_ERRORS.PERSONA_NOT_ALLOWED_FOR_APP);
    expect(result.error).toContain('developer');
    expect(result.error).toContain('EHG');
  });

  it('should normalize PascalCase persona before checking', async () => {
    const result = await validatePersonaForApp('SoloEntrepreneur', 'EHG');
    expect(result.normalized).toBe('solo_entrepreneur');
    expect(result.valid).toBe(true);
  });

  it('should return error for empty persona', async () => {
    const result = await validatePersonaForApp('', 'EHG');
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(PERSONA_ERRORS.PERSONA_TEMPLATE_NOT_FOUND);
  });

  it('should allow all personas for EHG_Engineer', async () => {
    const result = await validatePersonaForApp('developer', 'EHG_Engineer');
    expect(result.valid).toBe(true);
  });

  it('should respect SD type overrides', async () => {
    const result = await validatePersonaForApp('developer', 'EHG', 'infrastructure');
    expect(result.valid).toBe(true);
  });

  it('should include SD type in error message when provided', async () => {
    const result = await validatePersonaForApp('developer', 'EHG', 'feature');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('feature');
  });
});

// ============================================================================
// TEST GROUP 7: Cache invalidation
// ============================================================================
describe('invalidateCache()', () => {
  it('should clear cache without errors', () => {
    expect(() => invalidateCache()).not.toThrow();
  });

  it('should force re-fetch on next getPersonaConfig call', async () => {
    // Get config (populates cache/fallback)
    await getPersonaConfig('EHG');
    // Invalidate
    invalidateCache();
    // Should still work (falls back to hardcoded)
    const config = await getPersonaConfig('EHG');
    expect(config.target_application).toBe('EHG');
  });
});
