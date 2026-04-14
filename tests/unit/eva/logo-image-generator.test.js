/**
 * Tests for logo-image-generator.js
 * SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 */
import { describe, it, expect } from 'vitest';
import { buildLogoPrompt } from '../../../lib/eva/logo-image-generator.js';

describe('logo-image-generator', () => {
  describe('buildLogoPrompt', () => {
    it('builds prompt from full logoSpec', () => {
      const spec = {
        name: 'GuardianCode',
        colors: [{ hex: '#3B82F6' }, { hex: '#10B981' }],
        style: 'modern tech',
      };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).toContain('GuardianCode');
      expect(prompt).toContain('#3B82F6');
      expect(prompt).toContain('modern tech');
      expect(prompt).toContain('professional');
    });

    it('handles null logoSpec with default prompt', () => {
      const prompt = buildLogoPrompt(null);
      expect(prompt).toContain('startup logo');
      expect(prompt).toContain('blue');
    });

    it('handles empty object', () => {
      const prompt = buildLogoPrompt({});
      expect(prompt).toContain('Startup');
    });

    it('sanitizes special characters from name', () => {
      const spec = { name: 'Test<script>alert("xss")</script>' };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).not.toContain('<script>');
      expect(prompt).not.toContain('"xss"');
    });

    it('truncates long names', () => {
      const spec = { name: 'A'.repeat(100) };
      const prompt = buildLogoPrompt(spec);
      expect(prompt.length).toBeLessThan(300);
    });

    it('limits colors to 3', () => {
      const spec = {
        name: 'Test',
        colors: [
          { hex: '#111' }, { hex: '#222' }, { hex: '#333' },
          { hex: '#444' }, { hex: '#555' },
        ],
      };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).toContain('#111');
      expect(prompt).toContain('#333');
      expect(prompt).not.toContain('#444');
    });

    it('uses selectedName when name missing', () => {
      const spec = { selectedName: 'BrandName' };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).toContain('BrandName');
    });

    it('uses primaryColor when colors array missing', () => {
      const spec = { name: 'Test', primaryColor: 'green' };
      const prompt = buildLogoPrompt(spec);
      expect(prompt).toContain('green');
    });

    it('includes icon-only instruction', () => {
      const prompt = buildLogoPrompt({ name: 'Test' });
      expect(prompt).toContain('icon only');
      expect(prompt).toContain('white background');
    });
  });
});
