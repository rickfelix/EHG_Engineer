/**
 * Unit Tests for Vision QA Finding Router
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001
 *
 * Tests: classifyFinding, generateIssueSignature, routing logic,
 * deduplication, a11y routing, performance routing.
 *
 * Note: Tests for routeFindings() and registerSkipEntry() require
 * database mocking and are covered in integration tests.
 */

import {
  classifyFinding,
  generateIssueSignature,
  MAX_QUICKFIX_CYCLES,
  CRITICAL_CONFIDENCE_THRESHOLD
} from '../../../lib/testing/vision-qa-finding-router.js';

// ============================================================================
// TEST GROUP 1: classifyFinding - routing rules
// ============================================================================
describe('classifyFinding()', () => {
  it('should route critical + high-confidence to quickfix', () => {
    const result = classifyFinding({
      severity: 'critical',
      confidence: 0.90
    });
    expect(result.route).toBe('quickfix');
    expect(result.reason).toContain('critical severity');
    expect(result.reason).toContain('0.9');
  });

  it('should route critical + exactly threshold confidence to quickfix', () => {
    const result = classifyFinding({
      severity: 'critical',
      confidence: CRITICAL_CONFIDENCE_THRESHOLD
    });
    expect(result.route).toBe('quickfix');
  });

  it('should route critical + low-confidence to debt', () => {
    const result = classifyFinding({
      severity: 'critical',
      confidence: 0.50
    });
    expect(result.route).toBe('debt');
    expect(result.reason).toContain('low confidence');
  });

  it('should route critical + below-threshold confidence to debt', () => {
    const result = classifyFinding({
      severity: 'critical',
      confidence: 0.84
    });
    expect(result.route).toBe('debt');
  });

  it('should route high severity to debt', () => {
    const result = classifyFinding({
      severity: 'high',
      confidence: 0.95
    });
    expect(result.route).toBe('debt');
    expect(result.reason).toContain('non-critical');
  });

  it('should route medium severity to debt', () => {
    const result = classifyFinding({
      severity: 'medium',
      confidence: 0.95
    });
    expect(result.route).toBe('debt');
  });

  it('should route low severity to debt', () => {
    const result = classifyFinding({
      severity: 'low',
      confidence: 1.0
    });
    expect(result.route).toBe('debt');
  });

  it('should handle missing severity as non-critical (debt)', () => {
    const result = classifyFinding({ confidence: 0.95 });
    expect(result.route).toBe('debt');
  });

  it('should handle missing confidence as 0 (debt for critical)', () => {
    const result = classifyFinding({ severity: 'critical' });
    expect(result.route).toBe('debt');
  });

  it('should be case-insensitive for severity', () => {
    const result = classifyFinding({
      severity: 'CRITICAL',
      confidence: 0.90
    });
    expect(result.route).toBe('quickfix');
  });
});

// ============================================================================
// TEST GROUP 2: generateIssueSignature - determinism
// ============================================================================
describe('generateIssueSignature()', () => {
  it('should return a hex string', () => {
    const sig = generateIssueSignature({
      category: 'bug',
      description: 'Button not visible'
    });
    expect(typeof sig).toBe('string');
    expect(sig).toMatch(/^[a-f0-9]+$/);
  });

  it('should return 16-character hash', () => {
    const sig = generateIssueSignature({
      category: 'bug',
      description: 'Test issue'
    });
    expect(sig.length).toBe(16);
  });

  it('should produce same signature for same input', () => {
    const finding = { category: 'bug', description: 'Login button missing' };
    const sig1 = generateIssueSignature(finding);
    const sig2 = generateIssueSignature(finding);
    expect(sig1).toBe(sig2);
  });

  it('should produce different signatures for different descriptions', () => {
    const sig1 = generateIssueSignature({ category: 'bug', description: 'Issue A' });
    const sig2 = generateIssueSignature({ category: 'bug', description: 'Issue B' });
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different categories', () => {
    const sig1 = generateIssueSignature({ category: 'bug', description: 'Same issue' });
    const sig2 = generateIssueSignature({ category: 'a11y', description: 'Same issue' });
    expect(sig1).not.toBe(sig2);
  });

  it('should be case-insensitive for description', () => {
    const sig1 = generateIssueSignature({ category: 'bug', description: 'Hello World' });
    const sig2 = generateIssueSignature({ category: 'bug', description: 'hello world' });
    expect(sig1).toBe(sig2);
  });

  it('should trim whitespace from description', () => {
    const sig1 = generateIssueSignature({ category: 'bug', description: 'test' });
    const sig2 = generateIssueSignature({ category: 'bug', description: '  test  ' });
    expect(sig1).toBe(sig2);
  });

  it('should handle missing fields gracefully', () => {
    const sig = generateIssueSignature({});
    expect(typeof sig).toBe('string');
    expect(sig.length).toBe(16);
  });

  it('should default category to "bug" when missing', () => {
    const sig1 = generateIssueSignature({ description: 'test' });
    const sig2 = generateIssueSignature({ category: 'bug', description: 'test' });
    expect(sig1).toBe(sig2);
  });
});

// ============================================================================
// TEST GROUP 3: Constants
// ============================================================================
describe('Constants', () => {
  it('should export MAX_QUICKFIX_CYCLES as 2', () => {
    expect(MAX_QUICKFIX_CYCLES).toBe(2);
  });

  it('should export CRITICAL_CONFIDENCE_THRESHOLD as 0.85', () => {
    expect(CRITICAL_CONFIDENCE_THRESHOLD).toBe(0.85);
  });
});

// ============================================================================
// TEST GROUP 4: Routing boundary conditions
// ============================================================================
describe('classifyFinding() - boundary conditions', () => {
  it('should route to quickfix at exactly 0.85 confidence for critical', () => {
    const result = classifyFinding({ severity: 'critical', confidence: 0.85 });
    expect(result.route).toBe('quickfix');
  });

  it('should route to debt at 0.8499 confidence for critical', () => {
    const result = classifyFinding({ severity: 'critical', confidence: 0.8499 });
    expect(result.route).toBe('debt');
  });

  it('should route to quickfix at confidence 1.0 for critical', () => {
    const result = classifyFinding({ severity: 'critical', confidence: 1.0 });
    expect(result.route).toBe('quickfix');
  });

  it('should route to debt at confidence 0 for critical', () => {
    const result = classifyFinding({ severity: 'critical', confidence: 0 });
    expect(result.route).toBe('debt');
  });
});
