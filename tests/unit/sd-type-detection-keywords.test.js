/**
 * Unit Tests for SD Type Detection - Extended Infrastructure Keywords
 * SD: SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009
 *
 * Validates that SDs mentioning hooks, state management, internal tooling,
 * and CLI enhancement are classified as infrastructure type.
 */

import { autoDetectSdType, TYPE_PATTERNS } from '../../scripts/modules/handoff/verifiers/lead-to-plan/sd-type-detection.js';
import { detectSDType } from '../../lib/utils/sd-type-detection.js';

// ============================================================================
// TEST GROUP 1: TYPE_PATTERNS infrastructure keywords include new entries
// ============================================================================
describe('TYPE_PATTERNS - infrastructure keywords', () => {
  const infraKeywords = TYPE_PATTERNS.infrastructure.keywords;

  it('should include "hooks" keyword', () => {
    expect(infraKeywords).toContain('hooks');
  });

  it('should include "state management" keyword', () => {
    expect(infraKeywords).toContain('state management');
  });

  it('should include "internal tooling" keyword', () => {
    expect(infraKeywords).toContain('internal tooling');
  });

  it('should include "cli" keyword', () => {
    expect(infraKeywords).toContain('cli');
  });

  it('should include "cli enhancement" keyword', () => {
    expect(infraKeywords).toContain('cli enhancement');
  });

  it('should include "command-line" keyword', () => {
    expect(infraKeywords).toContain('command-line');
  });

  it('should include "developer tool" keyword', () => {
    expect(infraKeywords).toContain('developer tool');
  });

  it('should include "dev tool" keyword', () => {
    expect(infraKeywords).toContain('dev tool');
  });
});

// ============================================================================
// TEST GROUP 2: autoDetectSdType classifies new keywords as infrastructure
// ============================================================================
describe('autoDetectSdType() - new infrastructure keywords', () => {
  it('should classify "hooks" SD as infrastructure', () => {
    const result = autoDetectSdType({
      title: 'Add pre-commit hooks for validation',
      scope: 'hooks infrastructure',
      description: 'Configure hooks for automated quality checks'
    });
    expect(result.type).toBe('infrastructure');
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['hooks']));
  });

  it('should classify "state management" SD as infrastructure', () => {
    const result = autoDetectSdType({
      title: 'Implement state management layer',
      scope: 'state management tooling',
      description: 'Add state management infrastructure for session tracking'
    });
    expect(result.type).toBe('infrastructure');
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['state management']));
  });

  it('should classify "internal tooling" SD as infrastructure', () => {
    const result = autoDetectSdType({
      title: 'Build internal tooling for developers',
      scope: 'internal tooling',
      description: 'Create internal tooling suite for LEO protocol'
    });
    expect(result.type).toBe('infrastructure');
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['internal tooling']));
  });

  it('should classify "CLI enhancement" SD as infrastructure', () => {
    const result = autoDetectSdType({
      title: 'CLI enhancement for developer workflow',
      scope: 'cli enhancement',
      description: 'Improve command-line experience for developers'
    });
    expect(result.type).toBe('infrastructure');
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['cli enhancement']));
  });

  it('should classify "developer tool" SD as infrastructure', () => {
    const result = autoDetectSdType({
      title: 'Create developer tool for debugging',
      scope: 'developer tool',
      description: 'New dev tool for protocol inspection'
    });
    expect(result.type).toBe('infrastructure');
  });
});

// ============================================================================
// TEST GROUP 3: Regression test - AUTO-PROCEED SD misclassification
// ============================================================================
describe('autoDetectSdType() - regression: AUTO-PROCEED SD', () => {
  it('should classify AUTO-PROCEED hooks/state SD as infrastructure, not feature', () => {
    const result = autoDetectSdType({
      title: 'AUTO-PROCEED enhancement with hooks and state management',
      scope: 'Add hooks for auto-proceed state management and CLI enhancement',
      description: 'Implement hooks for managing auto-proceed session state with CLI tooling'
    });
    expect(result.type).toBe('infrastructure');
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should not classify as feature when only infrastructure keywords present', () => {
    const result = autoDetectSdType({
      title: 'Improve internal tooling and CLI for LEO protocol',
      scope: 'internal tooling, cli, hooks',
      description: 'Developer tooling improvements for protocol automation'
    });
    expect(result.type).not.toBe('feature');
  });
});

// ============================================================================
// TEST GROUP 4: detectSDType (lib/utils) - new engineering keywords
// ============================================================================
describe('detectSDType() - new engineering keywords', () => {
  it('should detect "hook" in title as engineering', () => {
    const result = detectSDType({
      title: 'Add hook for pre-commit validation',
      scope: '',
      category: ''
    });
    expect(result.type).toBe('engineering');
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('hook')])
    );
  });

  it('should detect "state management" in title as engineering', () => {
    const result = detectSDType({
      title: 'Implement state management for sessions',
      scope: '',
      category: ''
    });
    expect(result.type).toBe('engineering');
  });

  it('should detect "cli" in title as engineering', () => {
    const result = detectSDType({
      title: 'CLI improvements for developer workflow',
      scope: '',
      category: ''
    });
    expect(result.type).toBe('engineering');
  });

  it('should detect "internal tooling" in title as engineering', () => {
    const result = detectSDType({
      title: 'Build internal tooling for protocol',
      scope: '',
      category: ''
    });
    expect(result.type).toBe('engineering');
  });

  it('should detect "developer tool" in title as engineering', () => {
    const result = detectSDType({
      title: 'Create developer tool for debugging',
      scope: '',
      category: ''
    });
    expect(result.type).toBe('engineering');
  });
});
