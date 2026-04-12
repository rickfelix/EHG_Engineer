import { describe, it, expect } from 'vitest';
import { mapBrandTokensToDesignSystem } from '../../lib/eva/bridge/stitch-design-system.js';

describe('mapBrandTokensToDesignSystem', () => {
  describe('color mapping', () => {
    it('maps hex color strings to customColors', () => {
      const result = mapBrandTokensToDesignSystem({
        colors: ['#2563eb', '#10b981', '#f59e0b'],
      });
      expect(result.customColors).toHaveLength(3);
      expect(result.customColors[0]).toEqual({ name: 'primary', hex: '#2563eb' });
      expect(result.customColors[1]).toEqual({ name: 'secondary', hex: '#10b981' });
      expect(result.customColors[2]).toEqual({ name: 'accent', hex: '#f59e0b' });
    });

    it('handles single color', () => {
      const result = mapBrandTokensToDesignSystem({ colors: ['#ff0000'] });
      expect(result.customColors).toHaveLength(1);
      expect(result.customColors[0]).toEqual({ name: 'primary', hex: '#ff0000' });
    });

    it('filters invalid hex values', () => {
      const result = mapBrandTokensToDesignSystem({ colors: ['not-a-color', '#abc'] });
      expect(result.customColors).toHaveLength(1);
      expect(result.customColors[0].hex).toBe('#abc');
    });

    it('uses default when no colors provided', () => {
      const result = mapBrandTokensToDesignSystem({ fonts: ['Inter'] });
      expect(result.customColors).toHaveLength(1);
      expect(result.customColors[0].name).toBe('primary');
    });

    it('handles object-shaped colors (legacy format)', () => {
      const result = mapBrandTokensToDesignSystem({
        colors: [{ hex: '#2563eb' }, { value: '#10b981' }],
      });
      expect(result.customColors).toHaveLength(2);
      expect(result.customColors[0].hex).toBe('#2563eb');
      expect(result.customColors[1].hex).toBe('#10b981');
    });
  });

  describe('font mapping', () => {
    it('maps font strings to heading/body', () => {
      const result = mapBrandTokensToDesignSystem({
        fonts: ['Playfair Display', 'Inter'],
      });
      expect(result.theme.fonts.heading).toBe('Playfair Display');
      expect(result.theme.fonts.body).toBe('Inter');
    });

    it('uses single font for both heading and body', () => {
      const result = mapBrandTokensToDesignSystem({ fonts: ['Roboto'] });
      expect(result.theme.fonts.heading).toBe('Roboto');
      expect(result.theme.fonts.body).toBe('Roboto');
    });

    it('defaults to Inter when no fonts provided', () => {
      const result = mapBrandTokensToDesignSystem({ colors: ['#000'] });
      expect(result.theme.fonts.heading).toBe('Inter');
      expect(result.theme.fonts.body).toBe('Inter');
    });
  });

  describe('color mode inference', () => {
    it('infers dark mode from personality', () => {
      const result = mapBrandTokensToDesignSystem({ personality: 'dark and moody' });
      expect(result.theme.colorMode).toBe('dark');
    });

    it('defaults to light mode', () => {
      const result = mapBrandTokensToDesignSystem({ personality: 'professional' });
      expect(result.theme.colorMode).toBe('light');
    });
  });

  describe('roundness inference', () => {
    it('infers none for corporate personality', () => {
      const result = mapBrandTokensToDesignSystem({ personality: 'corporate formal' });
      expect(result.theme.roundness).toBe('none');
    });

    it('infers full for playful personality', () => {
      const result = mapBrandTokensToDesignSystem({ personality: 'playful and friendly' });
      expect(result.theme.roundness).toBe('full');
    });

    it('defaults to medium', () => {
      const result = mapBrandTokensToDesignSystem({ personality: 'balanced' });
      expect(result.theme.roundness).toBe('medium');
    });
  });

  describe('edge cases', () => {
    it('handles null input', () => {
      const result = mapBrandTokensToDesignSystem(null);
      expect(result.theme).toBeDefined();
      expect(result.customColors).toBeDefined();
    });

    it('handles undefined input', () => {
      const result = mapBrandTokensToDesignSystem(undefined);
      expect(result.theme.colorMode).toBe('light');
    });

    it('handles empty object', () => {
      const result = mapBrandTokensToDesignSystem({});
      expect(result.theme.fonts.heading).toBe('Inter');
      expect(result.customColors.length).toBeGreaterThan(0);
    });

    it('returns complete structure with all fields', () => {
      const result = mapBrandTokensToDesignSystem({
        colors: ['#2563eb', '#10b981'],
        fonts: ['Playfair Display', 'Inter'],
        personality: 'elegant',
      });
      expect(result).toHaveProperty('theme.colorMode');
      expect(result).toHaveProperty('theme.fonts.heading');
      expect(result).toHaveProperty('theme.fonts.body');
      expect(result).toHaveProperty('theme.roundness');
      expect(result).toHaveProperty('customColors');
    });
  });
});
