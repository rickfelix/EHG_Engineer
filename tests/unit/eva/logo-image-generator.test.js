/**
 * Tests for logo-image-generator.js
 * SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 */
import { describe, it, expect } from 'vitest';
import { buildLogoPrompt } from '../../../lib/eva/logo-image-generator.js';

describe('logo-image-generator', () => {
  describe('buildLogoPrompt', () => {
    it('builds prompt from full logoSpec', () => {
      const spec = { name: 'GuardianCode', colors: [{ hex: '#3B82F6' }, { hex: '#10B981' }], style: 'modern tech' };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).toContain('GuardianCode');
      expect(prompt).toContain('#3B82F6');
      expect(prompt).toContain('modern tech');
    });

    it('handles null logoSpec with default', () => {
      expect(buildLogoPrompt(null)).toContain('startup logo');
    });

    it('handles empty object', () => {
      expect(buildLogoPrompt({})).toContain('Startup');
    });

    it('sanitizes special characters', () => {
      const prompt = buildLogoPrompt({ name: 'Test<script>xss</script>' });
      expect(prompt).not.toContain('<script>');
    });

    it('truncates long names', () => {
      expect(buildLogoPrompt({ name: 'A'.repeat(100) }).length).toBeLessThan(300);
    });

    it('limits colors to 3', () => {
      const spec = { name: 'T', colors: [{ hex: '#111' }, { hex: '#222' }, { hex: '#333' }, { hex: '#444' }] };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).toContain('#333');
      expect(prompt).not.toContain('#444');
    });

    it('uses selectedName fallback', () => {
      expect(buildLogoPrompt({ selectedName: 'Brand' })).toContain('Brand');
    });

    it('uses primaryColor fallback', () => {
      expect(buildLogoPrompt({ name: 'T', primaryColor: 'green' })).toContain('green');
    });

    it('includes icon-only instruction', () => {
      const prompt = buildLogoPrompt({ name: 'T' });
      expect(prompt).toContain('icon only');
      expect(prompt).toContain('white background');
    });
  });
});
