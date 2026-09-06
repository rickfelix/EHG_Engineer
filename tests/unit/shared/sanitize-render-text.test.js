/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 (adversarial post-merge review,
 * PR #8356, finding CRITICAL). See lib/shared/sanitize-render-text.cjs's own docblock for the
 * full threat model: the prior per-file `[\x00-\x1f\x7f]` strip did not cover Unicode
 * line/paragraph separators or bidi control chars, letting a crafted metadata value forge a
 * second "- Hold:" line under a `/^- Hold:/gm` match without ever using a literal `\n`.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { sanitizeRenderText } = require('../../../lib/shared/sanitize-render-text.cjs');

describe('sanitizeRenderText', () => {
  it('strips ASCII C0 control chars and DEL', () => {
    expect(sanitizeRenderText('a\x00b\x1fc\x7fd')).toBe('a b c d');
  });

  it('strips a literal newline (pre-existing behavior, preserved)', () => {
    expect(sanitizeRenderText('line one\nline two')).toBe('line one line two');
  });

  it('strips the control bytes out of an ANSI escape sequence (ESC/BEL), matching the pre-existing SEC-1 contract', () => {
    // The ESC (\x1b) and BEL (\x07) control bytes are stripped; the remaining printable escape-code
    // text ("[31m", "[2K") is not itself a control char and is left as inert prose, same as SEC-1.
    const out = sanitizeRenderText('legit\x1b[31m\x1b[2K\x07 tail');
    expect(out).not.toMatch(/\x1b|\x07/);
    expect(out).toContain('legit');
    expect(out).toContain('tail');
  });

  it('strips U+0085 NEL', () => {
    const input = 'a' + String.fromCodePoint(0x85) + 'b';
    expect(sanitizeRenderText(input)).toBe('a b');
  });

  it('strips U+2028 LINE SEPARATOR (the CRITICAL finding)', () => {
    const input = '49656c8c' + String.fromCodePoint(0x2028) + '- Hold: FORGED';
    const out = sanitizeRenderText(input);
    expect(out).not.toContain(String.fromCodePoint(0x2028));
    expect((`prefix: ${out}`.match(/^- Hold:/gm) || []).length).toBe(0);
  });

  it('strips U+2029 PARAGRAPH SEPARATOR', () => {
    const input = 'a' + String.fromCodePoint(0x2029) + 'b';
    expect(sanitizeRenderText(input)).toBe('a b');
  });

  it('strips bidi marks and embedding/override/isolate controls', () => {
    const codepoints = [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
    for (const cp of codepoints) {
      const input = 'a' + String.fromCodePoint(cp) + 'b';
      expect(sanitizeRenderText(input)).toBe('a b');
    }
  });

  it('leaves ordinary Unicode text (non-control) untouched', () => {
    expect(sanitizeRenderText('café — naïve résumé 日本語')).toBe('café — naïve résumé 日本語');
  });

  it('trims surrounding whitespace after stripping', () => {
    expect(sanitizeRenderText('  \x00 padded \x1f  ')).toBe('padded');
  });

  it('returns null for a non-string input', () => {
    expect(sanitizeRenderText(123)).toBeNull();
    expect(sanitizeRenderText(null)).toBeNull();
    expect(sanitizeRenderText(undefined)).toBeNull();
    expect(sanitizeRenderText({})).toBeNull();
  });

  it('returns null for a string that is empty or all-stripped', () => {
    expect(sanitizeRenderText('')).toBeNull();
    expect(sanitizeRenderText('\x00\x1f\x7f')).toBeNull();
  });
});
