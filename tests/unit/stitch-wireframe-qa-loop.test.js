import { describe, it, expect, vi } from 'vitest';
import { buildImprovedPrompt, runIterativeLoop } from '../../lib/eva/qa/stitch-wireframe-qa-loop.js';

// ---------------------------------------------------------------------------
// buildImprovedPrompt tests
// ---------------------------------------------------------------------------

describe('buildImprovedPrompt', () => {
  it('includes missing elements in improved prompt', () => {
    const result = buildImprovedPrompt('Generate Home screen', {
      missing_elements: ['search bar', 'footer navigation'],
      dimensions: { component_presence: 80, layout_fidelity: 80, navigation_accuracy: 80, screen_purpose_match: 80 },
    });

    expect(result).toContain('search bar');
    expect(result).toContain('footer navigation');
    expect(result).toContain('CRITICAL');
    expect(result).toContain('MISSING');
  });

  it('includes low-scoring dimension feedback', () => {
    const result = buildImprovedPrompt('Generate Home screen', {
      missing_elements: [],
      dimensions: { component_presence: 50, layout_fidelity: 90, navigation_accuracy: 40, screen_purpose_match: 85 },
    });

    expect(result).toContain('UI components');
    expect(result).toContain('50%');
    expect(result).toContain('navigation links');
    expect(result).toContain('40%');
    expect(result).not.toContain('spatial layout'); // 90 is above threshold
  });

  it('returns original prompt when no feedback needed', () => {
    const result = buildImprovedPrompt('Generate Home screen', {
      missing_elements: [],
      dimensions: { component_presence: 80, layout_fidelity: 80, navigation_accuracy: 80, screen_purpose_match: 80 },
    });

    expect(result).toBe('Generate Home screen');
  });
});

// ---------------------------------------------------------------------------
// runIterativeLoop tests
// ---------------------------------------------------------------------------

describe('runIterativeLoop', () => {
  it('skips screens already above threshold', async () => {
    const initialResult = {
      status: 'completed',
      overall_score: 85,
      screens: [
        { screen_name: 'Home', score: 90, dimensions: {}, missing_elements: [] },
        { screen_name: 'About', score: 80, dimensions: {}, missing_elements: [] },
      ],
    };

    const regenerate = vi.fn();
    const result = await runIterativeLoop('v1', 'p1', initialResult, { regenerate });

    expect(regenerate).not.toHaveBeenCalled();
    expect(result.screens[0].iteration_count).toBe(0);
    expect(result.screens[1].iteration_count).toBe(0);
    expect(result.iterations_used).toBe(0);
  });

  it('re-generates screen below threshold and exits on threshold met', async () => {
    const initialResult = {
      status: 'completed',
      overall_score: 50,
      screens: [
        { screen_name: 'Home', score: 50, dimensions: { component_presence: 40, layout_fidelity: 60, navigation_accuracy: 50, screen_purpose_match: 50 }, missing_elements: ['nav bar'] },
      ],
    };

    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reScore = vi.fn().mockResolvedValue({
      screen_name: 'Home',
      score: 80,
      dimensions: { component_presence: 80, layout_fidelity: 80, navigation_accuracy: 80, screen_purpose_match: 80 },
      missing_elements: [],
    });

    const result = await runIterativeLoop('v1', 'p1', initialResult, { regenerate, reScore });

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(reScore).toHaveBeenCalledTimes(1);
    expect(result.screens[0].iteration_count).toBe(1);
    expect(result.screens[0].score).toBe(80);
    expect(result.iterations_used).toBe(1);
  });

  it('caps at 3 iterations even if threshold not met', async () => {
    const initialResult = {
      status: 'completed',
      overall_score: 30,
      screens: [
        { screen_name: 'Home', score: 30, dimensions: { component_presence: 30, layout_fidelity: 30, navigation_accuracy: 30, screen_purpose_match: 30 }, missing_elements: ['everything'] },
      ],
    };

    let callCount = 0;
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reScore = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        screen_name: 'Home',
        score: 30 + (callCount * 10), // 40, 50, 60 — never reaches 70
        dimensions: { component_presence: 50, layout_fidelity: 50, navigation_accuracy: 50, screen_purpose_match: 50 },
        missing_elements: ['still missing'],
      });
    });

    const result = await runIterativeLoop('v1', 'p1', initialResult, { regenerate, reScore });

    expect(regenerate).toHaveBeenCalledTimes(3);
    expect(reScore).toHaveBeenCalledTimes(3);
    expect(result.screens[0].iteration_count).toBe(3);
    expect(result.screens[0].iteration_history).toHaveLength(4); // initial + 3 iterations
    expect(result.iterations_used).toBe(3);
  });

  it('handles regeneration failure gracefully', async () => {
    const initialResult = {
      status: 'completed',
      overall_score: 40,
      screens: [
        { screen_name: 'Home', score: 40, dimensions: {}, missing_elements: [] },
      ],
    };

    const regenerate = vi.fn().mockRejectedValue(new Error('Stitch socket closed'));
    const result = await runIterativeLoop('v1', 'p1', initialResult, { regenerate });

    expect(result.screens[0].iteration_count).toBe(1);
    expect(result.screens[0].iteration_history[1].error).toBe('regeneration_failed');
    expect(result.loop_status).toBe('completed');
  });

  it('persists iteration history with per-iteration scores', async () => {
    const initialResult = {
      status: 'completed',
      overall_score: 50,
      screens: [
        { screen_name: 'Home', score: 50, dimensions: { component_presence: 50, layout_fidelity: 50, navigation_accuracy: 50, screen_purpose_match: 50 }, missing_elements: ['sidebar'] },
      ],
    };

    let callCount = 0;
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reScore = vi.fn().mockImplementation(() => {
      callCount++;
      const score = callCount === 1 ? 65 : 75;
      return Promise.resolve({ screen_name: 'Home', score, dimensions: {}, missing_elements: [] });
    });

    const result = await runIterativeLoop('v1', 'p1', initialResult, { regenerate, reScore });

    const history = result.screens[0].iteration_history;
    expect(history).toHaveLength(3); // initial(50) + iter1(65) + iter2(75)
    expect(history[0]).toEqual({ iteration: 0, score: 50 });
    expect(history[1]).toEqual({ iteration: 1, score: 65 });
    expect(history[2]).toEqual({ iteration: 2, score: 75 });
    expect(result.screens[0].iteration_count).toBe(2);
  });

  it('returns initial result when no screens to iterate', async () => {
    const initialResult = { status: 'completed', overall_score: null, screens: [] };
    const result = await runIterativeLoop('v1', 'p1', initialResult);
    expect(result).toEqual(initialResult);
  });
});
