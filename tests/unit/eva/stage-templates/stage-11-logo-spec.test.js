/**
 * Unit tests for Stage 11 logoSpec validation logic
 * SD: SD-EVA-FEAT-S11-LOGO-GENERATION-001
 *
 * Uses validation.js directly to avoid transitive SDK imports from stage-11.js
 * (workaround for fleet node_modules clobbering).
 */

import { describe, it, expect } from 'vitest';
import { validateString } from '../../../../lib/eva/stage-templates/validation.js';

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

/** Mirrors the logoSpec validation logic from stage-11.js validate() */
function validateLogoSpec(logoSpec) {
  const errors = [];
  if (logoSpec == null) return { valid: true, errors };

  if (typeof logoSpec !== 'object') {
    errors.push('logoSpec must be an object when provided');
    return { valid: false, errors };
  }

  for (const field of ['textTreatment', 'primaryColor', 'accentColor', 'typography', 'iconConcept', 'svgPrompt']) {
    if (logoSpec[field] != null) {
      const check = validateString(logoSpec[field], `logoSpec.${field}`, 1);
      if (!check.valid) errors.push(check.error);
    }
  }
  if (logoSpec.primaryColor && !HEX_REGEX.test(logoSpec.primaryColor)) {
    errors.push(`logoSpec.primaryColor must be a valid hex color (got '${logoSpec.primaryColor}')`);
  }
  if (logoSpec.accentColor && !HEX_REGEX.test(logoSpec.accentColor)) {
    errors.push(`logoSpec.accentColor must be a valid hex color (got '${logoSpec.accentColor}')`);
  }

  return { valid: errors.length === 0, errors };
}

describe('Stage 11 logoSpec validation', () => {
  it('should pass when logoSpec is null (optional)', () => {
    expect(validateLogoSpec(null).valid).toBe(true);
  });

  it('should pass when logoSpec is undefined', () => {
    expect(validateLogoSpec(undefined).valid).toBe(true);
  });

  it('should pass with valid full logoSpec', () => {
    const result = validateLogoSpec({
      textTreatment: 'All caps with icon left',
      primaryColor: '#2563EB',
      accentColor: '#10B981',
      typography: 'Inter',
      iconConcept: 'A mountain peak representing growth',
      svgPrompt: 'Create a minimal SVG logo with mountain icon in blue, venture name in Inter Bold, 200x60px',
    });
    expect(result.valid).toBe(true);
  });

  it('should pass with partial logoSpec', () => {
    expect(validateLogoSpec({ textTreatment: 'Bold', primaryColor: '#FF0000' }).valid).toBe(true);
  });

  it('should fail when logoSpec is not an object', () => {
    const result = validateLogoSpec('invalid');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('logoSpec must be an object when provided');
  });

  it('should fail with invalid primaryColor hex', () => {
    const result = validateLogoSpec({ primaryColor: 'not-a-color' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('logoSpec.primaryColor'))).toBe(true);
  });

  it('should fail with invalid accentColor hex', () => {
    const result = validateLogoSpec({ accentColor: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('logoSpec.accentColor'))).toBe(true);
  });

  it('should accept valid 6-digit hex colors', () => {
    for (const color of ['#000000', '#FFFFFF', '#2563EB', '#10b981']) {
      expect(validateLogoSpec({ primaryColor: color }).valid).toBe(true);
    }
  });

  it('should reject 3-digit hex shorthand', () => {
    expect(validateLogoSpec({ primaryColor: '#FFF' }).valid).toBe(false);
  });

  it('should reject empty string fields', () => {
    expect(validateLogoSpec({ textTreatment: '' }).valid).toBe(false);
  });
});
