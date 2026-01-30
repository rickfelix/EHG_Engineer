/**
 * Unit Tests: DOM Capture for UAT Visual Failures
 *
 * Tests for SD-LEO-ENH-UAT-DOM-CAPTURE-001
 *
 * @module tests/unit/uat/dom-capture.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureVisualDefect, verifySelector, shouldCaptureDom } from '../../../lib/uat/dom-capture.js';

// ============================================================================
// shouldCaptureDom TESTS
// ============================================================================
describe('shouldCaptureDom', () => {
  it('should return true for visual failure type', () => {
    expect(shouldCaptureDom('visual')).toBe(true);
    expect(shouldCaptureDom('Visual bug')).toBe(true);
  });

  it('should return false for non-visual failure types', () => {
    expect(shouldCaptureDom('functional')).toBe(false);
    expect(shouldCaptureDom('performance')).toBe(false);
    expect(shouldCaptureDom('console')).toBe(false);
    expect(shouldCaptureDom('Functional bug')).toBe(false);
  });
});

// ============================================================================
// captureVisualDefect TESTS
// ============================================================================
describe('captureVisualDefect', () => {
  let mockPage;
  let mockLocator;

  beforeEach(() => {
    // Mock locator
    mockLocator = {
      evaluate: vi.fn(),
      boundingBox: vi.fn()
    };

    // Mock page
    mockPage = {
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue(mockLocator),
        count: vi.fn().mockResolvedValue(1)
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png'))
    };
  });

  it('should capture element info successfully', async () => {
    mockLocator.evaluate
      .mockResolvedValueOnce({
        elementRef: 'e12abc',
        tagName: 'button',
        textContent: 'Submit',
        attributes: {
          'data-testid': 'submit-btn',
          class: 'btn-primary'
        }
      })
      .mockResolvedValueOnce([
        { selector: '[data-testid="submit-btn"]', strategy: 'data-testid', confidence: 0.95 },
        { selector: '.btn-primary', strategy: 'class', confidence: 0.7 }
      ])
      .mockResolvedValueOnce(null); // componentPath

    mockLocator.boundingBox.mockResolvedValue({
      x: 100,
      y: 200,
      width: 80,
      height: 32
    });

    const result = await captureVisualDefect(mockPage, '[data-testid="submit-btn"]', {
      includeScreenshot: false
    });

    expect(result.success).toBe(true);
    expect(result.element_ref).toBe('e12abc');
    expect(result.primary_selector).toBe('[data-testid="submit-btn"]');
    expect(result.alternative_selectors).toContain('.btn-primary');
    expect(result.bounding_box).toEqual({
      x: 100,
      y: 200,
      width: 80,
      height: 32
    });
    expect(result.tag_name).toBe('button');
    expect(result.text_content).toBe('Submit');
  });

  it('should return failure when element cannot be resolved', async () => {
    const result = await captureVisualDefect(mockPage, null);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not resolve');
    expect(result.element_ref).toBeNull();
  });

  it('should handle string selector input', async () => {
    mockLocator.evaluate
      .mockResolvedValueOnce({
        elementRef: 'e99xyz',
        tagName: 'div',
        textContent: 'Content',
        attributes: { id: 'main' }
      })
      .mockResolvedValueOnce([
        { selector: '#main', strategy: 'id', confidence: 0.9 }
      ])
      .mockResolvedValueOnce(null);

    mockLocator.boundingBox.mockResolvedValue({ x: 0, y: 0, width: 100, height: 100 });

    const result = await captureVisualDefect(mockPage, '#main', {
      includeScreenshot: false
    });

    expect(result.success).toBe(true);
    expect(mockPage.locator).toHaveBeenCalledWith('#main');
  });

  it('should handle object with selector property', async () => {
    mockLocator.evaluate
      .mockResolvedValueOnce({
        elementRef: 'eabc123',
        tagName: 'input',
        textContent: '',
        attributes: { type: 'text', name: 'email' }
      })
      .mockResolvedValueOnce([
        { selector: 'input[name="email"]', strategy: 'name', confidence: 0.8 }
      ])
      .mockResolvedValueOnce(null);

    mockLocator.boundingBox.mockResolvedValue({ x: 50, y: 150, width: 200, height: 40 });

    const result = await captureVisualDefect(mockPage, { selector: 'input[name="email"]' }, {
      includeScreenshot: false
    });

    expect(result.success).toBe(true);
    expect(mockPage.locator).toHaveBeenCalledWith('input[name="email"]');
  });
});

// ============================================================================
// verifySelector TESTS
// ============================================================================
describe('verifySelector', () => {
  let mockPage;

  beforeEach(() => {
    mockPage = {
      locator: vi.fn()
    };
  });

  it('should verify primary selector when found', async () => {
    mockPage.locator.mockReturnValue({
      count: vi.fn().mockResolvedValue(1)
    });

    const domCapture = {
      primary_selector: '[data-testid="submit-btn"]',
      alternative_selectors: ['#submit', '.btn-primary']
    };

    const result = await verifySelector(mockPage, domCapture);

    expect(result.verified).toBe(true);
    expect(result.matchedSelector).toBe('[data-testid="submit-btn"]');
    expect(result.strategy).toBe('primary');
    expect(result.message).toContain('Selector verified');
  });

  it('should try alternative selectors when primary fails', async () => {
    const countMock = vi.fn()
      .mockResolvedValueOnce(0)  // primary fails
      .mockResolvedValueOnce(0)  // first alternative fails
      .mockResolvedValueOnce(1); // second alternative succeeds

    mockPage.locator.mockReturnValue({ count: countMock });

    const domCapture = {
      primary_selector: '[data-testid="old-id"]',
      alternative_selectors: ['#removed', '.btn-primary']
    };

    const result = await verifySelector(mockPage, domCapture);

    expect(result.verified).toBe(true);
    expect(result.matchedSelector).toBe('.btn-primary');
    expect(result.strategy).toBe('fallback');
    expect(result.message).toContain('Fallback selector matched');
  });

  it('should return not verified when no selectors match', async () => {
    mockPage.locator.mockReturnValue({
      count: vi.fn().mockResolvedValue(0)
    });

    const domCapture = {
      primary_selector: '[data-testid="removed"]',
      alternative_selectors: ['#gone', '.deleted']
    };

    const result = await verifySelector(mockPage, domCapture);

    expect(result.verified).toBe(false);
    expect(result.matchedSelector).toBeNull();
    expect(result.strategy).toBe('none');
    expect(result.message).toContain('drift recovery');
  });
});
