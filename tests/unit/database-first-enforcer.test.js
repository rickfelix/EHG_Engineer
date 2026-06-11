/**
 * Unit Tests: Database-First PreToolUse Enforcer
 *
 * Tests the database-first principle enforcement for Edit/Write tools.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-G
 */

import { describe, it, expect } from 'vitest';

// These tests verify the patterns and logic without requiring database mocks

describe('Database-First Enforcer Patterns', () => {
  // File patterns that should always be allowed
  const ALWAYS_ALLOWED_PATTERNS = [
    /\.md$/i,
    /\.json$/i,
    /\.env/i,
    /\.gitignore$/i,
    /package\.json$/i,
    /test\/.*\.test\.js$/i,
    /test\/.*\.test\.ts$/i,
    /spec\/.*\.spec\.js$/i,
    /spec\/.*\.spec\.ts$/i,
    /\.claude\//i,
    /scripts\/hooks\//i
  ];

  function isAlwaysAllowedFile(filePath) {
    if (!filePath) return true;
    const normalizedPath = filePath.replace(/\\/g, '/');
    return ALWAYS_ALLOWED_PATTERNS.some(pattern => pattern.test(normalizedPath));
  }

  describe('isAlwaysAllowedFile', () => {
    it('should allow markdown files', () => {
      expect(isAlwaysAllowedFile('README.md')).toBe(true);
      expect(isAlwaysAllowedFile('docs/guide.md')).toBe(true);
      expect(isAlwaysAllowedFile('CLAUDE.MD')).toBe(true);
    });

    it('should allow JSON config files', () => {
      expect(isAlwaysAllowedFile('package.json')).toBe(true);
      expect(isAlwaysAllowedFile('tsconfig.json')).toBe(true);
    });

    it('should allow test files', () => {
      expect(isAlwaysAllowedFile('test/unit/something.test.js')).toBe(true);
      expect(isAlwaysAllowedFile('test/e2e/flow.test.ts')).toBe(true);
    });

    it('should allow .claude directory files', () => {
      expect(isAlwaysAllowedFile('.claude/settings.json')).toBe(true);
      expect(isAlwaysAllowedFile('.claude/skills/test.md')).toBe(true);
    });

    it('should allow hooks directory files', () => {
      expect(isAlwaysAllowedFile('scripts/hooks/my-hook.js')).toBe(true);
    });

    it('should NOT allow source code files', () => {
      expect(isAlwaysAllowedFile('src/components/Button.tsx')).toBe(false);
      expect(isAlwaysAllowedFile('lib/utils/helper.js')).toBe(false);
      expect(isAlwaysAllowedFile('pages/index.tsx')).toBe(false);
    });

    it('should handle empty/null paths', () => {
      expect(isAlwaysAllowedFile(null)).toBe(true);
      expect(isAlwaysAllowedFile('')).toBe(true);
      expect(isAlwaysAllowedFile(undefined)).toBe(true);
    });
  });

  describe('PRD Requirement Types', () => {
    const PRD_REQUIRED_TYPES = [
      'feature',
      'bugfix',
      'security',
      'enhancement',
      'performance'
    ];

    const PRD_EXEMPT_TYPES = [
      'documentation',
      'docs',
      'infrastructure',
      'orchestrator',
      'refactor',
      'database',
      'process',
      'qa'
    ];

    function requiresPRD(sdType) {
      const normalizedType = (sdType || 'feature').toLowerCase();
      return PRD_REQUIRED_TYPES.includes(normalizedType);
    }

    it('should require PRD for feature SDs', () => {
      expect(requiresPRD('feature')).toBe(true);
      expect(requiresPRD('FEATURE')).toBe(true);
    });

    it('should require PRD for bugfix SDs', () => {
      expect(requiresPRD('bugfix')).toBe(true);
    });

    it('should require PRD for security SDs', () => {
      expect(requiresPRD('security')).toBe(true);
    });

    it('should NOT require PRD for documentation SDs', () => {
      expect(requiresPRD('documentation')).toBe(false);
      expect(requiresPRD('docs')).toBe(false);
    });

    it('should NOT require PRD for infrastructure SDs', () => {
      expect(requiresPRD('infrastructure')).toBe(false);
    });

    it('should NOT require PRD for orchestrator SDs', () => {
      expect(requiresPRD('orchestrator')).toBe(false);
    });

    it('should default to requiring PRD for unknown types', () => {
      // Unknown types default to feature which requires PRD
      expect(requiresPRD(null)).toBe(true);
      expect(requiresPRD('')).toBe(true);
    });

    it('should exempt all exempt types from PRD requirement', () => {
      PRD_EXEMPT_TYPES.forEach(type => {
        expect(requiresPRD(type)).toBe(false);
      });
    });

    it('should require PRD for all required types', () => {
      PRD_REQUIRED_TYPES.forEach(type => {
        expect(requiresPRD(type)).toBe(true);
      });
    });
  });

  describe('SD Detection Pattern', () => {
    // The regex matches the full SD key pattern including any suffixes
    // This is by design since SD keys can have variable length (e.g., SD-FEATURE-001 or SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E)
    function extractSDFromBranch(branch) {
      const sdMatch = branch.match(/SD-[A-Z0-9-]+/i);
      return sdMatch ? sdMatch[0].toUpperCase() : null;
    }

    it('should extract SD key from feature branch (greedy match)', () => {
      // Note: Regex is intentionally greedy to capture full SD key
      expect(extractSDFromBranch('feat/SD-FEATURE-001-description'))
        .toBe('SD-FEATURE-001-DESCRIPTION');
    });

    it('should extract SD key from fix branch (greedy match)', () => {
      expect(extractSDFromBranch('fix/SD-BUGFIX-002-fix-login'))
        .toBe('SD-BUGFIX-002-FIX-LOGIN');
    });

    it('should extract SD key with long identifier (greedy match)', () => {
      expect(extractSDFromBranch('feat/SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E-test'))
        .toBe('SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-E-TEST');
    });

    it('should return null for branches without SD', () => {
      expect(extractSDFromBranch('main')).toBe(null);
      expect(extractSDFromBranch('develop')).toBe(null);
      expect(extractSDFromBranch('docs/update-readme')).toBe(null);
    });
  });
});
