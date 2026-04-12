/**
 * Unit tests for mobile QA assertions in stitch-vision-qa.js
 * SD-DUALPLAT-MOBILE-WEB-ORCH-001-B
 *
 * Covers:
 * - checkTouchTargets: happy path, violations, no elements, API error
 * - checkBottomNavigation: detected, not detected, API error
 * - checkHorizontalScroll: no overflow, overflow detected, API error
 * - scoreMobileAssertions: runs all 3 in parallel
 */

import { describe, it, expect, vi } from 'vitest';

const {
  checkTouchTargets,
  checkBottomNavigation,
  checkHorizontalScroll,
  scoreMobileAssertions,
} = await import('../../../../lib/eva/qa/stitch-vision-qa.js');

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function makeClient(responseJson) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(responseJson) }],
        usage: { input_tokens: 1500, output_tokens: 400 },
      }),
    },
  };
}

function makeErrorClient(errorMsg) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(new Error(errorMsg)),
    },
  };
}

const FAKE_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';

// -------------------------------------------------------------------------
// checkTouchTargets
// -------------------------------------------------------------------------

describe('checkTouchTargets', () => {
  it('returns score and violations for non-compliant elements', async () => {
    const client = makeClient({
      elements: [
        { name: 'Submit button', estimated_width_px: 80, estimated_height_px: 48, compliant: true },
        { name: 'Small icon', estimated_width_px: 24, estimated_height_px: 24, compliant: false },
      ],
      total_interactive: 2,
      total_compliant: 1,
      score: 50,
    });

    const result = await checkTouchTargets(client, 'screen-1', FAKE_BASE64);
    expect(result.score).toBe(50);
    expect(result.total_interactive).toBe(2);
    expect(result.total_compliant).toBe(1);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].name).toBe('Small icon');
  });

  it('returns score 100 when no interactive elements found', async () => {
    const client = makeClient({
      elements: [],
      total_interactive: 0,
      total_compliant: 0,
      score: 100,
    });

    const result = await checkTouchTargets(client, 'screen-1', FAKE_BASE64);
    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  it('handles API error gracefully', async () => {
    const client = makeErrorClient('API timeout');
    const result = await checkTouchTargets(client, 'screen-1', FAKE_BASE64);
    expect(result.score).toBeNull();
    expect(result.status).toBe('error');
    expect(result.error).toContain('API timeout');
  });
});

// -------------------------------------------------------------------------
// checkBottomNavigation
// -------------------------------------------------------------------------

describe('checkBottomNavigation', () => {
  it('detects bottom navigation bar', async () => {
    const client = makeClient({
      detected: true,
      confidence: 0.95,
      description: 'Tab bar with Home, Search, Profile icons at bottom',
    });

    const result = await checkBottomNavigation(client, 'screen-1', FAKE_BASE64);
    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.description).toContain('Tab bar');
  });

  it('reports absence of bottom nav', async () => {
    const client = makeClient({
      detected: false,
      confidence: 0.9,
      description: 'No navigation bar found at the bottom of the screen',
    });

    const result = await checkBottomNavigation(client, 'screen-1', FAKE_BASE64);
    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0.9);
  });

  it('handles API error gracefully', async () => {
    const client = makeErrorClient('Network error');
    const result = await checkBottomNavigation(client, 'screen-1', FAKE_BASE64);
    expect(result.detected).toBeNull();
    expect(result.status).toBe('vision_api_unavailable');
  });
});

// -------------------------------------------------------------------------
// checkHorizontalScroll
// -------------------------------------------------------------------------

describe('checkHorizontalScroll', () => {
  it('returns score 100 when no overflow', async () => {
    const client = makeClient({
      overflow_detected: false,
      score: 100,
      overflow_elements: [],
      findings: ['All content fits within viewport width'],
    });

    const result = await checkHorizontalScroll(client, 'screen-1', FAKE_BASE64);
    expect(result.score).toBe(100);
    expect(result.overflow_detected).toBe(false);
    expect(result.overflow_elements).toHaveLength(0);
  });

  it('detects horizontal overflow', async () => {
    const client = makeClient({
      overflow_detected: true,
      score: 40,
      overflow_elements: ['Wide data table extends beyond viewport'],
      findings: ['Table element causes horizontal scroll'],
    });

    const result = await checkHorizontalScroll(client, 'screen-1', FAKE_BASE64);
    expect(result.score).toBe(40);
    expect(result.overflow_detected).toBe(true);
    expect(result.overflow_elements).toHaveLength(1);
  });

  it('handles API error gracefully', async () => {
    const client = makeErrorClient('Rate limited');
    const result = await checkHorizontalScroll(client, 'screen-1', FAKE_BASE64);
    expect(result.score).toBeNull();
    expect(result.status).toBe('error');
  });
});

// -------------------------------------------------------------------------
// scoreMobileAssertions
// -------------------------------------------------------------------------

describe('scoreMobileAssertions', () => {
  it('runs all three assertions and returns combined result', async () => {
    let callCount = 0;
    const client = {
      messages: {
        create: vi.fn().mockImplementation(({ max_tokens }) => {
          callCount++;
          let json;
          if (max_tokens === 2048) {
            // Touch targets prompt
            json = { elements: [], total_interactive: 0, total_compliant: 0, score: 100 };
          } else if (max_tokens === 512) {
            // Bottom nav prompt
            json = { detected: true, confidence: 0.9, description: 'Tab bar found' };
          } else {
            // Horizontal scroll prompt
            json = { overflow_detected: false, score: 100, overflow_elements: [], findings: [] };
          }
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify(json) }],
            usage: { input_tokens: 1500, output_tokens: 400 },
          });
        }),
      },
    };

    const result = await scoreMobileAssertions(client, 'screen-1', FAKE_BASE64);
    expect(result.platform).toBe('MOBILE');
    expect(result.touch_target_compliance.score).toBe(100);
    expect(result.bottom_nav_detected).toBe(true);
    expect(result.horizontal_scroll_score.score).toBe(100);
    expect(client.messages.create).toHaveBeenCalledTimes(3);
  });
});
