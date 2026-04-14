/**
 * Unit tests for Imagen Logo Renderer
 * SD: SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 */

import { describe, it, expect } from 'vitest';
import { buildPromptVariants, sanitizePrompt } from '../../../lib/eva/bridge/imagen-logo-renderer.js';

describe('imagen-logo-renderer', () => {
  describe('buildPromptVariants', () => {
    it('should return 3 prompts when svgPrompt is provided', () => {
      const spec = {
        textTreatment: 'ACME',
        primaryColor: '#2563EB',
        accentColor: '#10B981',
        typography: 'Inter',
        iconConcept: 'A mountain peak',
        svgPrompt: 'Create a minimal SVG logo with mountain icon',
      };
      const prompts = buildPromptVariants(spec, 'Acme Corp');
      expect(prompts).toHaveLength(3);
      expect(prompts[0]).toContain('mountain icon');
      expect(prompts[1]).toContain('ACME');
      expect(prompts[2]).toContain('ACME');
    });

    it('should return 2 prompts when svgPrompt is missing', () => {
      const spec = { textTreatment: 'TestCo', primaryColor: '#FF0000' };
      const prompts = buildPromptVariants(spec, 'TestCo');
      expect(prompts).toHaveLength(2);
    });

    it('should use ventureName as fallback for textTreatment', () => {
      const spec = { primaryColor: '#000000' };
      const prompts = buildPromptVariants(spec, 'FallbackName');
      expect(prompts[0]).toContain('FallbackName');
    });

    it('should use default colors when not provided', () => {
      const spec = {};
      const prompts = buildPromptVariants(spec, 'Test');
      expect(prompts[0]).toContain('#2563EB');
    });
  });

  describe('sanitizePrompt', () => {
    it('should remove angle brackets and braces', () => {
      expect(sanitizePrompt('a <b> {c}')).toBe('a b c');
    });

    it('should collapse whitespace', () => {
      expect(sanitizePrompt('a   b\n\nc')).toBe('a b c');
    });

    it('should cap length at 1000 chars', () => {
      const long = 'x'.repeat(2000);
      expect(sanitizePrompt(long).length).toBe(1000);
    });

    it('should handle non-string input', () => {
      expect(sanitizePrompt(123)).toBe('123');
      expect(sanitizePrompt(null)).toBe('null');
    });
  });
});
