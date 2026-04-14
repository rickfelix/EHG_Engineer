/**
 * Tests for design-fidelity-scorer.js
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-D-B
 */
import { describe, it, expect } from 'vitest';
import { scoreDesignFidelity } from '../../../../lib/eva/bridge/design-fidelity-scorer.js';

describe('design-fidelity-scorer', () => {
  const fullRepo = {
    files: [
      'src/pages/index.tsx',
      'src/components/Header.tsx',
      'src/components/Hero.tsx',
      'src/components/Layout.tsx',
      'src/app/layout.tsx',
      'tailwind.config.js',
      'src/styles/globals.css',
    ],
    dependencies: {
      dependencies: { tailwindcss: '3.0.0' },
    },
  };

  const stitchData = {
    colorPalette: [
      { hex: '#3B82F6', name: 'primary' },
      { hex: '#10B981', name: 'success' },
    ],
    typography: { fontFamily: 'Inter' },
    components: [
      { name: 'Header' },
      { name: 'Hero' },
      { name: 'Footer' },
    ],
  };

  it('returns null when no Stitch data', () => {
    expect(scoreDesignFidelity(null, fullRepo)).toBeNull();
  });

  it('returns zero score when no repo data', () => {
    const result = scoreDesignFidelity(stitchData, null);
    expect(result.score).toBe(0);
  });

  it('scores a well-matched repo highly', () => {
    const result = scoreDesignFidelity(stitchData, fullRepo);
    expect(result.score).toBeGreaterThan(50);
    expect(result.dimensions.colors).toBeDefined();
    expect(result.dimensions.typography).toBeDefined();
    expect(result.dimensions.components).toBeDefined();
    expect(result.dimensions.layout).toBeDefined();
  });

  it('provides per-dimension evidence', () => {
    const result = scoreDesignFidelity(stitchData, fullRepo);
    const colorDim = result.dimensions.colors;
    expect(colorDim.evidence.length).toBeGreaterThan(0);
    expect(colorDim.label).toBe('Color Palette');
  });

  it('detects missing components', () => {
    const result = scoreDesignFidelity(stitchData, fullRepo);
    const compDim = result.dimensions.components;
    // Header and Hero should match, Footer should not
    expect(compDim.details).toContain('/3');
  });

  it('handles empty repo files', () => {
    const emptyRepo = { files: [], dependencies: {} };
    const result = scoreDesignFidelity(stitchData, emptyRepo);
    expect(result.score).toBeLessThan(20);
  });

  it('generates human-readable summary', () => {
    const result = scoreDesignFidelity(stitchData, fullRepo);
    expect(result.summary).toContain('Design Fidelity');
    expect(result.summary).toContain('/100');
  });

  it('handles Stitch data with no color palette', () => {
    const noColors = { typography: { fontFamily: 'Inter' } };
    const result = scoreDesignFidelity(noColors, fullRepo);
    expect(result.dimensions.colors.score).toBe(0);
    expect(result.dimensions.colors.details).toContain('No design colors');
  });

  it('detects Tailwind as positive signal for colors', () => {
    const result = scoreDesignFidelity(stitchData, fullRepo);
    expect(result.dimensions.colors.score).toBeGreaterThanOrEqual(80);
  });

  it('weights dimensions correctly', () => {
    const result = scoreDesignFidelity(stitchData, fullRepo);
    const totalWeight = Object.values(result.dimensions).reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBe(100);
  });
});
