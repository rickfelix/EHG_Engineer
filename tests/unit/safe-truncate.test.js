/**
 * Tests for lib/utils/safe-truncate.js
 * SD-LEO-FIX-FIX-UNICODE-SURROGATE-001
 */
import { describe, it, expect } from 'vitest';
import { safeTruncate } from '../../lib/utils/safe-truncate.js';

describe('safeTruncate', () => {
  it('returns short strings unchanged', () => {
    expect(safeTruncate('hello', 10)).toBe('hello');
  });

  it('returns exact-length strings unchanged', () => {
    expect(safeTruncate('12345', 5)).toBe('12345');
  });

  it('truncates ASCII strings at maxLength', () => {
    expect(safeTruncate('hello world', 5)).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(safeTruncate(null, 10)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(safeTruncate(undefined, 10)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(safeTruncate('', 10)).toBe('');
  });

  it('does not split a surrogate pair at the boundary', () => {
    // U+1F600 (grinning face) = \uD83D\uDE00 in UTF-16
    const emoji = '\uD83D\uDE00'; // 2 code units
    const str = 'ab' + emoji + 'cd'; // 6 code units: a b D83D DE00 c d
    // maxLength=3 would land on the high surrogate — must back off to 2
    expect(safeTruncate(str, 3)).toBe('ab');
  });

  it('keeps an intact surrogate pair when boundary is after the low surrogate', () => {
    const emoji = '\uD83D\uDE00';
    const str = 'ab' + emoji + 'cd'; // 6 code units
    // maxLength=4 includes both surrogates
    expect(safeTruncate(str, 4)).toBe('ab' + emoji);
  });

  it('handles multiple emoji correctly', () => {
    const str = '\uD83D\uDE00\uD83D\uDE01\uD83D\uDE02'; // 3 emoji, 6 code units
    expect(safeTruncate(str, 3)).toBe('\uD83D\uDE00'); // backs off from splitting 2nd emoji
    expect(safeTruncate(str, 4)).toBe('\uD83D\uDE00\uD83D\uDE01');
  });

  it('handles CJK BMP characters normally (no surrogates)', () => {
    const str = '\u4F60\u597D\u4E16\u754C'; // 你好世界
    expect(safeTruncate(str, 2)).toBe('\u4F60\u597D');
  });

  it('handles emoji at end of string', () => {
    const str = 'test\uD83D\uDE00';
    expect(safeTruncate(str, 5)).toBe('test'); // backs off from splitting emoji
    expect(safeTruncate(str, 6)).toBe('test\uD83D\uDE00'); // full string
  });

  it('handles all-surrogate string', () => {
    const str = '\uD83D\uDE00\uD83D\uDE01';
    expect(safeTruncate(str, 1)).toBe(''); // high surrogate at pos 0, backs off to 0
    expect(safeTruncate(str, 2)).toBe('\uD83D\uDE00');
  });
});
