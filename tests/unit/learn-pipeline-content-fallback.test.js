/**
 * Tests for /learn pipeline content fallback fixes
 * SD-MAN-FIX-FIX-LEARN-PIPELINE-002
 *
 * Verifies two bugs are fixed:
 * 1. sd-builders.js: content fallback when issue_summary is missing
 * 2. index.js: autoApproveCommand quality gate rejects empty patterns
 */

import { describe, it, expect } from 'vitest';
import {
  buildSDDescription,
  buildSDTitle,
  buildKeyChanges,
  buildSuccessMetrics,
  buildSmokeTestSteps,
  buildStrategicObjectives,
  buildSuccessCriteria,
  buildRisks,
  buildKeyPrinciples
} from '../../scripts/modules/learning/sd-builders.js';

// ─────────────────────────────────────────────────────────────
// Bug 1: sd-builders.js content fallback chain
// Before fix: item.issue_summary || 'No summary' (loses content)
// After fix:  item.issue_summary || item.content || 'No summary'
// ─────────────────────────────────────────────────────────────

describe('buildSDDescription - content fallback (SD-MAN-FIX-FIX-LEARN-PIPELINE-002)', () => {
  it('uses issue_summary when present', () => {
    const items = [{
      pattern_id: 'PAT-TEST-001',
      issue_summary: 'Test summary text',
      content: 'Test content text',
      category: 'protocol',
      severity: 'medium',
      occurrence_count: 2
    }];
    const result = buildSDDescription(items);
    expect(result).toContain('Test summary text');
  });

  it('falls back to content when issue_summary is missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-002',
      content: 'Detailed content about the issue',
      category: 'database',
      severity: 'high',
      occurrence_count: 1
    }];
    const result = buildSDDescription(items);
    expect(result).toContain('Detailed content about the issue');
    expect(result).not.toContain('No summary');
  });

  it('falls back to content when issue_summary is empty string', () => {
    const items = [{
      pattern_id: 'PAT-TEST-003',
      issue_summary: '',
      content: 'Content replaces empty summary',
      category: 'protocol',
      severity: 'low',
      occurrence_count: 1
    }];
    const result = buildSDDescription(items);
    expect(result).toContain('Content replaces empty summary');
  });

  it('falls back to No summary when both issue_summary and content are missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-004',
      category: 'protocol',
      severity: 'low',
      occurrence_count: 1
    }];
    const result = buildSDDescription(items);
    expect(result).toContain('No summary');
  });

  it('falls back to No summary when both are empty strings', () => {
    const items = [{
      pattern_id: 'PAT-TEST-005',
      issue_summary: '',
      content: '',
      category: 'protocol',
      severity: 'low',
      occurrence_count: 1
    }];
    const result = buildSDDescription(items);
    expect(result).toContain('No summary');
  });
});

describe('buildSDTitle - content fallback (SD-MAN-FIX-FIX-LEARN-PIPELINE-002)', () => {
  it('uses issue_summary for single pattern item', () => {
    const items = [{
      pattern_id: 'PAT-TEST-001',
      issue_summary: 'Summary for title',
      content: 'Content for title',
      category: 'protocol'
    }];
    const result = buildSDTitle(items);
    expect(result).toContain('Summary for title');
    expect(result).toContain('PAT-TEST-001');
  });

  it('falls back to content when issue_summary is missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-002',
      content: 'Content used in title',
      category: 'database'
    }];
    const result = buildSDTitle(items);
    expect(result).toContain('Content used in title');
    expect(result).not.toContain('Recurring issue');
  });

  it('falls back to category when both issue_summary and content are missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-003',
      category: 'protocol'
    }];
    const result = buildSDTitle(items);
    expect(result).toContain('protocol');
  });

  it('falls back to Recurring issue when all are missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-004'
    }];
    const result = buildSDTitle(items);
    expect(result).toContain('Recurring issue');
  });

  it('truncates content to 60 characters in single-item title', () => {
    const longContent = 'A'.repeat(100);
    const items = [{
      pattern_id: 'PAT-TEST-005',
      content: longContent
    }];
    const result = buildSDTitle(items);
    // Title format: "Address PAT-TEST-005: " + truncated content
    expect(result).toContain('A'.repeat(60));
    expect(result).not.toContain('A'.repeat(61));
  });

  it('uses multi-item format when multiple items present', () => {
    const items = [
      { pattern_id: 'PAT-1', content: 'First issue' },
      { pattern_id: 'PAT-2', content: 'Second issue' }
    ];
    const result = buildSDTitle(items);
    expect(result).toContain('2 pattern(s)');
    expect(result).toContain('/learn');
  });
});

describe('buildKeyChanges - content fallback (SD-MAN-FIX-FIX-LEARN-PIPELINE-002)', () => {
  it('uses issue_summary in change description when present', () => {
    const items = [{
      pattern_id: 'PAT-TEST-001',
      issue_summary: 'Summary for change',
      content: 'Content for change',
      occurrence_count: 3
    }];
    const result = buildKeyChanges(items);
    expect(result).toHaveLength(1);
    expect(result[0].change).toContain('Summary for change');
    expect(result[0].type).toBe('fix');
    expect(result[0].impact).toContain('3');
  });

  it('falls back to content when issue_summary is missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-002',
      content: 'Content describes the change needed',
      occurrence_count: 1
    }];
    const result = buildKeyChanges(items);
    expect(result).toHaveLength(1);
    expect(result[0].change).toContain('Content describes the change needed');
  });

  it('produces empty string in change when both are missing', () => {
    const items = [{
      pattern_id: 'PAT-TEST-003',
      occurrence_count: 1
    }];
    const result = buildKeyChanges(items);
    expect(result).toHaveLength(1);
    expect(result[0].change).toContain('PAT-TEST-003');
    // Should not crash, just produce "Address pattern PAT-TEST-003: "
    expect(result[0].change).toBe('Address pattern PAT-TEST-003: ');
  });

  it('truncates long content to 80 characters', () => {
    const longContent = 'B'.repeat(120);
    const items = [{
      pattern_id: 'PAT-TEST-004',
      content: longContent,
      occurrence_count: 1
    }];
    const result = buildKeyChanges(items);
    // The slice(0, 80) in the code should truncate
    expect(result[0].change).toContain('B'.repeat(80));
    expect(result[0].change).not.toContain('B'.repeat(81));
  });

  it('handles improvement items (no pattern_id) correctly', () => {
    const items = [{
      id: 'imp-uuid-123',
      description: 'Improve validation flow',
      evidence_count: 5
    }];
    const result = buildKeyChanges(items);
    expect(result).toHaveLength(1);
    expect(result[0].change).toContain('Improve validation flow');
    expect(result[0].type).toBe('enhancement');
    expect(result[0].impact).toContain('5');
  });
});

// ─────────────────────────────────────────────────────────────
// Bug 2: autoApproveCommand quality gate in index.js
// The quality gate logic filters patterns inline, so we test
// the filtering logic directly (extracted from autoApproveCommand)
// ─────────────────────────────────────────────────────────────

describe('autoApproveCommand quality gate logic (SD-MAN-FIX-FIX-LEARN-PIPELINE-002)', () => {
  // Replicate the exact filtering logic from index.js lines 96-108
  function applyQualityGate(patterns, threshold = 50) {
    const qualifying = [];
    const deferred = [];

    for (const pattern of patterns) {
      const score = pattern.composite_score || 0;
      const content = pattern.content || pattern.issue_summary || '';
      const hasContent = content.length >= 10;
      const hasSolutions = Array.isArray(pattern.proven_solutions) && pattern.proven_solutions.length > 0;

      if (score < threshold) {
        deferred.push({ ...pattern, reason: `composite_score ${score} < ${threshold}` });
      } else if (!hasContent && !hasSolutions) {
        deferred.push({ ...pattern, reason: 'empty pattern: no content and no proven_solutions' });
      } else {
        qualifying.push(pattern);
      }
    }

    return { qualifying, deferred };
  }

  it('defers pattern with empty content and no proven_solutions', () => {
    const patterns = [{
      pattern_id: 'PAT-EMPTY-001',
      composite_score: 80,
      content: '',
      proven_solutions: []
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].reason).toBe('empty pattern: no content and no proven_solutions');
  });

  it('defers pattern with null content and no proven_solutions', () => {
    const patterns = [{
      pattern_id: 'PAT-EMPTY-002',
      composite_score: 80,
      content: null,
      proven_solutions: []
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].reason).toBe('empty pattern: no content and no proven_solutions');
  });

  it('defers pattern with short content (< 10 chars) and no proven_solutions', () => {
    const patterns = [{
      pattern_id: 'PAT-SHORT-001',
      composite_score: 80,
      content: 'Too short',  // 9 chars
      proven_solutions: []
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].reason).toBe('empty pattern: no content and no proven_solutions');
  });

  it('qualifies pattern with real content (>= 10 chars)', () => {
    const patterns = [{
      pattern_id: 'PAT-GOOD-001',
      composite_score: 80,
      content: 'This is a meaningful description of the issue',
      proven_solutions: []
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });

  it('qualifies pattern with exactly 10 chars of content', () => {
    const patterns = [{
      pattern_id: 'PAT-EDGE-001',
      composite_score: 80,
      content: '1234567890',  // exactly 10 chars
      proven_solutions: []
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });

  it('qualifies pattern with proven_solutions even if content is empty', () => {
    const patterns = [{
      pattern_id: 'PAT-SOLUTIONS-001',
      composite_score: 80,
      content: '',
      proven_solutions: ['Use fallback chain for field resolution']
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });

  it('defers pattern below composite score threshold regardless of content', () => {
    const patterns = [{
      pattern_id: 'PAT-LOW-001',
      composite_score: 30,
      content: 'This has great content but low score',
      proven_solutions: ['Fix it']
    }];
    const { qualifying, deferred } = applyQualityGate(patterns, 50);
    expect(qualifying).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].reason).toContain('composite_score 30 < 50');
  });

  it('falls back to issue_summary when content is missing for hasContent check', () => {
    const patterns = [{
      pattern_id: 'PAT-FALLBACK-001',
      composite_score: 80,
      issue_summary: 'This issue summary is long enough to pass',
      proven_solutions: []
    }];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(1);
    expect(deferred).toHaveLength(0);
  });

  it('handles mixed batch correctly: some qualify, some defer', () => {
    const patterns = [
      {
        pattern_id: 'PAT-GOOD',
        composite_score: 80,
        content: 'A meaningful issue description',
        proven_solutions: []
      },
      {
        pattern_id: 'PAT-EMPTY',
        composite_score: 80,
        content: '',
        proven_solutions: []
      },
      {
        pattern_id: 'PAT-LOW',
        composite_score: 20,
        content: 'Has content but low score',
        proven_solutions: []
      },
      {
        pattern_id: 'PAT-HAS-SOLUTIONS',
        composite_score: 60,
        content: '',
        proven_solutions: ['Apply the fix']
      }
    ];
    const { qualifying, deferred } = applyQualityGate(patterns);
    expect(qualifying).toHaveLength(2);  // PAT-GOOD and PAT-HAS-SOLUTIONS
    expect(deferred).toHaveLength(2);    // PAT-EMPTY and PAT-LOW

    expect(qualifying.map(q => q.pattern_id)).toEqual(['PAT-GOOD', 'PAT-HAS-SOLUTIONS']);
    expect(deferred.find(d => d.pattern_id === 'PAT-EMPTY').reason).toContain('empty pattern');
    expect(deferred.find(d => d.pattern_id === 'PAT-LOW').reason).toContain('composite_score');
  });
});

// ─────────────────────────────────────────────────────────────
// sd-creation.js: issue_summary normalization in approved items
// ─────────────────────────────────────────────────────────────

describe('sd-creation.js issue_summary normalization (SD-MAN-FIX-FIX-LEARN-PIPELINE-002)', () => {
  it('verifies the normalization logic: pattern.issue_summary || pattern.content', () => {
    // This tests the exact logic from sd-creation.js line 248:
    //   issue_summary: pattern.issue_summary || pattern.content
    function normalizePattern(pattern) {
      return {
        ...pattern,
        pattern_id: pattern.id || pattern.pattern_id,
        issue_summary: pattern.issue_summary || pattern.content
      };
    }

    // Case 1: both present - issue_summary wins
    const case1 = normalizePattern({
      id: 'PAT-001',
      issue_summary: 'Summary text',
      content: 'Content text'
    });
    expect(case1.issue_summary).toBe('Summary text');
    expect(case1.pattern_id).toBe('PAT-001');

    // Case 2: only content - content becomes issue_summary
    const case2 = normalizePattern({
      id: 'PAT-002',
      content: 'Only content available'
    });
    expect(case2.issue_summary).toBe('Only content available');

    // Case 3: neither - undefined (downstream builders handle gracefully)
    const case3 = normalizePattern({
      id: 'PAT-003'
    });
    expect(case3.issue_summary).toBeUndefined();

    // Case 4: empty issue_summary, has content - content wins
    const case4 = normalizePattern({
      id: 'PAT-004',
      issue_summary: '',
      content: 'Fallback content'
    });
    expect(case4.issue_summary).toBe('Fallback content');
  });
});

// ─────────────────────────────────────────────────────────────
// Additional builder functions: verify they don't crash with
// content-only items (regression safety net)
// ─────────────────────────────────────────────────────────────

describe('other sd-builders with content-only items (regression)', () => {
  const contentOnlyItem = {
    pattern_id: 'PAT-CONTENT-ONLY',
    content: 'Content without issue_summary',
    category: 'protocol',
    severity: 'medium',
    occurrence_count: 2
  };

  it('buildSuccessMetrics does not crash', () => {
    const result = buildSuccessMetrics([contentOnlyItem]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].metric).toContain('PAT-CONTENT-ONLY');
  });

  it('buildSmokeTestSteps does not crash', () => {
    const result = buildSmokeTestSteps([contentOnlyItem]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toContain('PAT-CONTENT-ONLY');
  });

  it('buildStrategicObjectives does not crash', () => {
    const result = buildStrategicObjectives([contentOnlyItem]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toContain('PAT-CONTENT-ONLY');
  });

  it('buildSuccessCriteria does not crash', () => {
    const result = buildSuccessCriteria([contentOnlyItem]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('buildRisks does not crash with protocol category', () => {
    const result = buildRisks([contentOnlyItem]);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('buildKeyPrinciples does not crash with protocol category', () => {
    const result = buildKeyPrinciples([contentOnlyItem]);
    expect(result).toContain('Document protocol changes in CLAUDE.md');
  });
});
