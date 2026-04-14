/**
 * Tests for prompt-build-analyzer.js
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-D-A
 */
import { describe, it, expect } from 'vitest';
import { analyzePromptVsBuild } from '../../../../lib/eva/bridge/prompt-build-analyzer.js';

describe('prompt-build-analyzer', () => {
  const sampleRepo = {
    files: [
      'src/pages/index.tsx',
      'src/components/Header.tsx',
      'src/components/LoginForm.tsx',
      'src/components/Dashboard.tsx',
      'src/components/VentureList.tsx',
      'src/hooks/useAuth.ts',
      'src/lib/supabase.ts',
      'package.json',
      'tailwind.config.js',
    ],
    structure: {
      totalFiles: 9,
      topLevelDirs: ['src'],
      hasSrc: true,
    },
  };

  describe('analyzePromptVsBuild', () => {
    it('returns empty analysis for null inputs', () => {
      expect(analyzePromptVsBuild(null, null).coveragePercent).toBe(0);
      expect(analyzePromptVsBuild(null, null).summary).toContain('No data');
    });

    it('handles missing sprint items', () => {
      const result = analyzePromptVsBuild({}, sampleRepo);
      expect(result.summary).toContain('No sprint items');
    });

    it('detects implemented items via file matching', () => {
      const sprint = {
        items: [
          { name: 'Login form with authentication', description: 'User login form' },
          { name: 'Dashboard page', description: 'Main dashboard view' },
        ],
      };
      const result = analyzePromptVsBuild(sprint, sampleRepo);

      expect(result.totalItems).toBe(2);
      expect(result.items[0].status).not.toBe('missing');
      expect(result.items[0].evidence.length).toBeGreaterThan(0);
    });

    it('marks items as missing when no repo matches', () => {
      const sprint = {
        items: [
          { name: 'Stripe payment integration', description: 'Process payments via Stripe' },
          { name: 'Email notification system', description: 'Send email alerts' },
        ],
      };
      const result = analyzePromptVsBuild(sprint, sampleRepo);

      expect(result.items.every(i => i.status === 'missing')).toBe(true);
      expect(result.coveragePercent).toBe(0);
    });

    it('calculates weighted coverage correctly', () => {
      const sprint = {
        items: [
          { name: 'Header navigation component', description: 'Top nav bar' },
          { name: 'Stripe checkout flow', description: 'Payment processing' },
        ],
      };
      const result = analyzePromptVsBuild(sprint, sampleRepo);

      // Header should match, Stripe should not
      expect(result.coveragePercent).toBeGreaterThan(0);
      expect(result.coveragePercent).toBeLessThan(100);
    });

    it('handles empty repo gracefully', () => {
      const sprint = { items: [{ name: 'Feature A' }] };
      const emptyRepo = { files: [], structure: {} };
      const result = analyzePromptVsBuild(sprint, emptyRepo);

      expect(result.missing).toBe(1);
      expect(result.coveragePercent).toBe(0);
      expect(result.summary).toContain('Empty repository');
    });

    it('provides evidence file paths', () => {
      const sprint = {
        items: [{ name: 'Supabase client setup', description: 'Configure supabase connection' }],
      };
      const result = analyzePromptVsBuild(sprint, sampleRepo);

      const item = result.items[0];
      if (item.evidence.length > 0) {
        expect(item.evidence[0]).toContain('supabase');
      }
    });

    it('limits evidence to 5 files', () => {
      const manyFiles = {
        files: Array.from({ length: 20 }, (_, i) => `src/components/auth/auth${i}.tsx`),
        structure: { topLevelDirs: ['src'] },
      };
      const sprint = { items: [{ name: 'Auth components', description: 'Authentication auth system' }] };
      const result = analyzePromptVsBuild(sprint, manyFiles);

      expect(result.items[0].evidence.length).toBeLessThanOrEqual(5);
    });

    it('generates human-readable summary', () => {
      const sprint = {
        items: [
          { name: 'Dashboard page', description: 'Main dashboard' },
          { name: 'Unknown feature', description: 'Something non-existent' },
        ],
      };
      const result = analyzePromptVsBuild(sprint, sampleRepo);

      expect(result.summary).toContain('Prompt-vs-Build Coverage');
      expect(result.summary).toContain('%');
      expect(result.summary).toContain('sprint items');
    });

    it('supports sprint_items key format', () => {
      const sprint = {
        sprint_items: [{ title: 'Landing page', description: 'Home page with hero section' }],
      };
      const result = analyzePromptVsBuild(sprint, sampleRepo);
      expect(result.totalItems).toBe(1);
    });

    it('includes keywords in item results', () => {
      const sprint = { items: [{ name: 'Venture list component' }] };
      const result = analyzePromptVsBuild(sprint, sampleRepo);
      expect(result.items[0].keywords).toBeDefined();
      expect(result.items[0].keywords.length).toBeGreaterThan(0);
    });
  });
});
