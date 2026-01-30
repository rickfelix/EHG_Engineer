/**
 * Unit Tests: Selector Drift Recovery
 *
 * Tests for SD-LEO-ENH-UAT-DOM-CAPTURE-001
 *
 * @module tests/unit/uat/selector-drift-recovery.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recoverFromDrift,
  calculateDriftScore,
  logDriftRecovery
} from '../../../lib/uat/selector-drift-recovery.js';

// ============================================================================
// calculateDriftScore TESTS
// ============================================================================
describe('calculateDriftScore', () => {
  it('should return 0 for identical elements', () => {
    const original = {
      tag_name: 'button',
      text_content: 'Submit',
      bounding_box: { x: 100, y: 200, width: 80, height: 32 },
      attributes: { 'data-testid': 'submit-btn', class: 'btn-primary' }
    };

    const current = { ...original };

    const score = calculateDriftScore(original, current);
    expect(score).toBe(0);
  });

  it('should return high score for completely different elements', () => {
    const original = {
      tag_name: 'button',
      text_content: 'Submit',
      bounding_box: { x: 100, y: 200, width: 80, height: 32 },
      attributes: { 'data-testid': 'submit-btn' }
    };

    const current = {
      tag_name: 'div',
      text_content: 'Header',
      bounding_box: { x: 0, y: 0, width: 1920, height: 60 },
      attributes: { class: 'header' }
    };

    const score = calculateDriftScore(original, current);
    expect(score).toBeGreaterThan(0.5);
  });

  it('should penalize position drift', () => {
    const original = {
      tag_name: 'button',
      text_content: 'Submit',
      bounding_box: { x: 100, y: 200, width: 80, height: 32 },
      attributes: {}
    };

    const movedSlightly = {
      tag_name: 'button',
      text_content: 'Submit',
      bounding_box: { x: 110, y: 205, width: 80, height: 32 },
      attributes: {}
    };

    const movedFar = {
      tag_name: 'button',
      text_content: 'Submit',
      bounding_box: { x: 500, y: 800, width: 80, height: 32 },
      attributes: {}
    };

    const slightScore = calculateDriftScore(original, movedSlightly);
    const farScore = calculateDriftScore(original, movedFar);

    expect(slightScore).toBeLessThan(farScore);
    expect(slightScore).toBeLessThan(0.2);
  });

  it('should penalize text content changes', () => {
    const original = {
      tag_name: 'button',
      text_content: 'Submit Form',
      attributes: {}
    };

    const similarText = {
      tag_name: 'button',
      text_content: 'Submit',
      attributes: {}
    };

    const differentText = {
      tag_name: 'button',
      text_content: 'Cancel',
      attributes: {}
    };

    const similarScore = calculateDriftScore(original, similarText);
    const differentScore = calculateDriftScore(original, differentText);

    expect(similarScore).toBeLessThan(differentScore);
  });
});

// ============================================================================
// recoverFromDrift TESTS
// ============================================================================
describe('recoverFromDrift', () => {
  let mockPage;

  beforeEach(() => {
    mockPage = {
      locator: vi.fn(),
      evaluate: vi.fn()
    };
  });

  it('should recover using alternative selector', async () => {
    const countMock = vi.fn()
      .mockResolvedValueOnce(1); // First alternative works

    mockPage.locator.mockReturnValue({
      count: countMock,
      all: vi.fn().mockResolvedValue([])
    });

    const domCapture = {
      primary_selector: '[data-testid="old-id"]',
      alternative_selectors: ['#fallback-id', '.btn-class'],
      tag_name: 'button',
      text_content: 'Submit'
    };

    const result = await recoverFromDrift(mockPage, domCapture);

    expect(result.recovered).toBe(true);
    expect(result.strategy).toBe('alternative_selector');
    expect(result.confidence).toBe(0.8);
    expect(result.new_selector).toBe('#fallback-id');
  });

  it('should try testid pattern matching', async () => {
    const allMock = vi.fn().mockResolvedValue([
      { getAttribute: vi.fn().mockResolvedValue('submit-button-new') }
    ]);

    mockPage.locator.mockReturnValue({
      count: vi.fn().mockResolvedValue(0),
      all: allMock
    });

    const domCapture = {
      primary_selector: '[data-testid="submit-button-v1"]',
      alternative_selectors: [],
      tag_name: 'button',
      attributes: { 'data-testid': 'submit-button-v1' }
    };

    const result = await recoverFromDrift(mockPage, domCapture);

    // Should find partial match
    expect(result.alternatives_tried).toBeGreaterThan(0);
  });

  it('should return not recovered when all strategies fail', async () => {
    mockPage.locator.mockReturnValue({
      count: vi.fn().mockResolvedValue(0),
      all: vi.fn().mockResolvedValue([])
    });
    mockPage.evaluate.mockResolvedValue(null);

    const domCapture = {
      primary_selector: '[data-testid="completely-removed"]',
      alternative_selectors: [],
      tag_name: 'button',
      text_content: 'Nonexistent',
      attributes: {}
    };

    const result = await recoverFromDrift(mockPage, domCapture);

    expect(result.recovered).toBe(false);
    expect(result.new_selector).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.message).toContain('Manual intervention required');
  });
});

// ============================================================================
// logDriftRecovery TESTS
// ============================================================================
describe('logDriftRecovery', () => {
  it('should log successful recovery', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = {
      recovered: true,
      original_selector: '[data-testid="old"]',
      new_selector: '#fallback',
      confidence: 0.8,
      strategy: 'alternative_selector'
    };

    logDriftRecovery(result);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('alternative_selector'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('80%'));

    consoleSpy.mockRestore();
  });

  it('should log failed recovery', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = {
      recovered: false,
      original_selector: '[data-testid="removed"]',
      alternatives_tried: 5
    };

    logDriftRecovery(result);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('5 strategies'));

    consoleSpy.mockRestore();
  });
});
