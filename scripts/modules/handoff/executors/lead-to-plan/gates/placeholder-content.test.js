/**
 * Tests for Placeholder Content Detection Gate
 * SD-LEO-INFRA-PROTOCOL-FILE-STATE-001
 */

import { describe, it, expect } from 'vitest';
import {
  isPlaceholderText,
  analyzePlaceholderContent,
  validatePlaceholderContent
} from './placeholder-content.js';

describe('isPlaceholderText', () => {
  it('should detect strategic_objectives placeholders', () => {
    expect(isPlaceholderText('Implement Cool Feature as specified in the SD scope')).toBe(true);
    expect(isPlaceholderText('Maintain backward compatibility with existing functionality')).toBe(true);
    expect(isPlaceholderText('Deliver user-facing value with clear acceptance criteria')).toBe(true);
    expect(isPlaceholderText('Address root cause to prevent recurrence')).toBe(true);
    expect(isPlaceholderText('Improve code quality without changing external behavior')).toBe(true);
    expect(isPlaceholderText('Eliminate identified security vulnerabilities')).toBe(true);
  });

  it('should detect key_changes placeholders', () => {
    expect(isPlaceholderText('Implement core changes for: My Feature')).toBe(true);
    expect(isPlaceholderText('Add UI components or API endpoints as required')).toBe(true);
    expect(isPlaceholderText('Add tests for new functionality')).toBe(true);
    expect(isPlaceholderText('Update documentation for new feature')).toBe(true);
    expect(isPlaceholderText('Fix identified defect and add regression test')).toBe(true);
    expect(isPlaceholderText('Update infrastructure components')).toBe(true);
  });

  it('should detect success_criteria placeholders', () => {
    expect(isPlaceholderText('All implementation items from scope are complete')).toBe(true);
    expect(isPlaceholderText('Code passes lint and type checks')).toBe(true);
    expect(isPlaceholderText('PR reviewed and approved')).toBe(true);
    expect(isPlaceholderText('Root cause addressed, not just symptoms')).toBe(true);
    expect(isPlaceholderText('Feature accessible to target users')).toBe(true);
  });

  it('should NOT flag real content', () => {
    expect(isPlaceholderText('Prevent protocol file corruption from interrupted writes')).toBe(false);
    expect(isPlaceholderText('Add lib/utils/atomic-write.js with writeFileAtomic() function')).toBe(false);
    expect(isPlaceholderText('Protocol file generation uses write-to-temp-then-rename pattern')).toBe(false);
    expect(isPlaceholderText('Zero regressions in existing test suite')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isPlaceholderText('')).toBe(false);
    expect(isPlaceholderText(null)).toBe(false);
    expect(isPlaceholderText(undefined)).toBe(false);
    expect(isPlaceholderText(42)).toBe(false);
  });

  it('should handle whitespace-padded text', () => {
    expect(isPlaceholderText('  Maintain backward compatibility with existing functionality  ')).toBe(true);
  });
});

describe('analyzePlaceholderContent', () => {
  it('should count placeholders in string array', () => {
    const items = [
      'Implement Cool Feature as specified in the SD scope',
      'Maintain backward compatibility with existing functionality',
      'Prevent protocol file corruption from interrupted writes'
    ];
    const result = analyzePlaceholderContent(items);
    expect(result.total).toBe(3);
    expect(result.placeholders).toBe(2);
    expect(result.percentage).toBe(67);
  });

  it('should handle object arrays with textKey', () => {
    const items = [
      { change: 'Implement core changes for: My Feature', type: 'feature' },
      { change: 'Add lib/utils/atomic-write.js', type: 'feature' }
    ];
    const result = analyzePlaceholderContent(items, 'change');
    expect(result.total).toBe(2);
    expect(result.placeholders).toBe(1);
    expect(result.percentage).toBe(50);
  });

  it('should return zeros for empty array', () => {
    const result = analyzePlaceholderContent([]);
    expect(result).toEqual({ total: 0, placeholders: 0, percentage: 0 });
  });

  it('should return zeros for null/undefined', () => {
    expect(analyzePlaceholderContent(null)).toEqual({ total: 0, placeholders: 0, percentage: 0 });
    expect(analyzePlaceholderContent(undefined)).toEqual({ total: 0, placeholders: 0, percentage: 0 });
  });

  it('should handle 100% placeholder content', () => {
    const items = [
      'All implementation items from scope are complete',
      'Code passes lint and type checks',
      'PR reviewed and approved'
    ];
    const result = analyzePlaceholderContent(items);
    expect(result.total).toBe(3);
    expect(result.placeholders).toBe(3);
    expect(result.percentage).toBe(100);
  });

  it('should handle 0% placeholder content', () => {
    const items = [
      'Custom requirement A',
      'Custom requirement B'
    ];
    const result = analyzePlaceholderContent(items);
    expect(result.placeholders).toBe(0);
    expect(result.percentage).toBe(0);
  });
});

describe('validatePlaceholderContent', () => {
  it('should always pass (warning-only gate)', async () => {
    const sd = {
      strategic_objectives: ['Implement X as specified in the SD scope'],
      key_changes: [{ change: 'Implement core changes for: X' }],
      success_criteria: ['All implementation items from scope are complete'],
      description: 'Short'
    };
    const result = await validatePlaceholderContent(sd);
    expect(result.pass).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should return no warnings for real content', async () => {
    const sd = {
      strategic_objectives: [
        'Prevent protocol file corruption from interrupted writes',
        'Detect and warn when SDs are created with only default placeholder content'
      ],
      key_changes: [
        { change: 'Add lib/utils/atomic-write.js with writeFileAtomic() function' },
        { change: 'Update claude-md-generator/index.js to use atomic writes' }
      ],
      success_criteria: [
        'Protocol file generation uses write-to-temp-then-rename pattern',
        'Atomic write utility exists in lib/utils/ with tests'
      ],
      description: 'Two infrastructure improvements to LEO Protocol tooling for file resilience and content quality.'
    };
    const result = await validatePlaceholderContent(sd);
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('should warn on short description', async () => {
    const sd = {
      strategic_objectives: ['Custom objective'],
      key_changes: [],
      success_criteria: [],
      description: 'Fix bug'
    };
    const result = await validatePlaceholderContent(sd);
    expect(result.pass).toBe(true);
    expect(result.warnings.some(w => w.includes('very short'))).toBe(true);
  });

  it('should handle empty SD gracefully', async () => {
    const sd = {};
    const result = await validatePlaceholderContent(sd);
    expect(result.pass).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('should reduce score for placeholder content', async () => {
    const sd = {
      strategic_objectives: [
        'Implement Feature X as specified in the SD scope',
        'Maintain backward compatibility with existing functionality'
      ],
      key_changes: [],
      success_criteria: ['All implementation items from scope are complete', 'Code passes lint and type checks'],
      description: 'A real description that has enough length to pass the check.'
    };
    const result = await validatePlaceholderContent(sd);
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });
});
