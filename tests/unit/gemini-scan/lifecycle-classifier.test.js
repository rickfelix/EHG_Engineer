import { describe, test, expect } from 'vitest';
import { classifyLifecycle, isGa } from '../../../lib/gemini-scan/lifecycle-classifier.js';

describe('classifyLifecycle', () => {
  test.each([
    ['gemini-2.5-flash', 'GA'],
    ['gemini-2.5-pro', 'GA'],
    ['gemini-3.7-flash', 'GA'],
    ['gemini-3.0-flash-preview', 'preview'],
    ['gemini-3.0-flash-exp', 'experimental'],
    ['gemini-experimental-1206', 'experimental'],
    ['gemini-thinking-2.0', 'preview'],
  ])('%s -> %s', (id, expected) => {
    expect(classifyLifecycle(id)).toBe(expected);
  });

  test('unrecognized/ambiguous id defaults to preview (default-refuse, not default-allow)', () => {
    expect(classifyLifecycle('totally-unknown-model-xyz')).toBe('preview');
  });

  test('isGa mirrors classifyLifecycle', () => {
    expect(isGa('gemini-2.5-flash')).toBe(true);
    expect(isGa('gemini-3.0-flash-preview')).toBe(false);
  });
});
