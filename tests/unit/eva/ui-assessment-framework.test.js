/**
 * Tests for ui-assessment-framework.js
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-C
 */
import { describe, it, expect } from 'vitest';
import { assessUI } from '../../../lib/eva/bridge/ui-assessment-framework.js';

describe('ui-assessment-framework', () => {
  it('returns zero score for empty file list', () => {
    const result = assessUI([]);
    expect(result.score).toBe(0);
    expect(result.findings[0].status).toBe('missing');
  });

  it('returns zero score for null input', () => {
    const result = assessUI(null);
    expect(result.score).toBe(0);
  });

  it('detects a complete React app', () => {
    const files = [
      'src/pages/index.tsx',
      'src/components/Header.tsx',
      'src/components/NavBar.tsx',
      'src/components/LoginForm.tsx',
      'tailwind.config.js',
      'src/styles/globals.css',
      'public/images/logo.png',
      'public/favicon.ico',
    ];
    const result = assessUI(files);
    expect(result.score).toBe(100);
    expect(result.categories.landingPage.present).toBe(true);
    expect(result.categories.navigation.present).toBe(true);
    expect(result.categories.forms.present).toBe(true);
    expect(result.categories.responsive.present).toBe(true);
    expect(result.categories.assets.present).toBe(true);
  });

  it('detects partial app missing forms', () => {
    const files = [
      'src/pages/index.tsx',
      'src/components/Header.tsx',
      'tailwind.config.js',
      'public/logo.svg',
    ];
    const result = assessUI(files);
    expect(result.categories.forms.present).toBe(false);
    expect(result.score).toBe(80); // 25 + 20 + 0 + 15 + 20
  });

  it('detects landing page from app/page pattern', () => {
    const files = ['app/page.tsx'];
    const result = assessUI(files);
    expect(result.categories.landingPage.present).toBe(true);
  });

  it('generates human-readable findings', () => {
    const files = ['src/pages/index.tsx'];
    const result = assessUI(files);
    const landingFinding = result.findings.find(f => f.category === 'Landing Page');
    expect(landingFinding.status).toBe('present');
    expect(landingFinding.message).toContain('1 file(s)');

    const navFinding = result.findings.find(f => f.category === 'Navigation & Routing');
    expect(navFinding.status).toBe('missing');
  });

  it('provides summary text', () => {
    const files = ['src/pages/index.tsx', 'src/components/Header.tsx', 'tailwind.config.js', 'public/logo.svg', 'src/components/Form.tsx'];
    const result = assessUI(files);
    expect(result.summary).toContain('UI Assessment');
    expect(result.summary).toContain('/100');
  });

  it('limits sample files to 3', () => {
    const files = Array.from({ length: 10 }, (_, i) => `public/images/img${i}.png`);
    const result = assessUI(files);
    expect(result.categories.assets.sampleFiles.length).toBeLessThanOrEqual(3);
  });
});
