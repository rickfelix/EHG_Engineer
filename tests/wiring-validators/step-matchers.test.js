/**
 * Unit tests for scripts/wiring-validators/lib/step-matchers.js
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (TS-4)
 *
 * Coverage target: >=90% on the matcher module.
 */

import { describe, it, expect } from 'vitest';
import {
  chooseMatcher,
  matchSubstring,
  matchRegex,
  matchStructural,
  matchStep
} from '../../scripts/wiring-validators/lib/step-matchers.js';

describe('chooseMatcher heuristic', () => {
  it('returns SUBSTRING for plain text', () => {
    expect(chooseMatcher('Stdout contains foo')).toBe('SUBSTRING');
  });

  it('returns REGEX for /.../-wrapped strings', () => {
    expect(chooseMatcher('/^success: \\d+$/')).toBe('REGEX');
  });

  it('returns STRUCTURAL for valid JSON object', () => {
    expect(chooseMatcher('{"status":"passed"}')).toBe('STRUCTURAL');
  });

  it('returns STRUCTURAL for valid JSON array', () => {
    expect(chooseMatcher('[1, 2, 3]')).toBe('STRUCTURAL');
  });

  it('falls back to SUBSTRING when JSON-looking text fails to parse', () => {
    expect(chooseMatcher('{not valid json')).toBe('SUBSTRING');
  });

  it('handles non-string input gracefully', () => {
    expect(chooseMatcher(undefined)).toBe('SUBSTRING');
    expect(chooseMatcher(42)).toBe('SUBSTRING');
  });

  it('handles whitespace around delimiters', () => {
    expect(chooseMatcher('  /^foo$/  ')).toBe('REGEX');
    expect(chooseMatcher('  {"a":1}  ')).toBe('STRUCTURAL');
  });

  it('does not pick REGEX for single slash strings', () => {
    expect(chooseMatcher('/')).toBe('SUBSTRING');
    expect(chooseMatcher('//')).toBe('SUBSTRING');
  });
});

describe('matchSubstring', () => {
  it('matches when substring present', () => {
    const r = matchSubstring('foo', 'the value is foo bar');
    expect(r.matched).toBe(true);
    expect(r.method).toBe('SUBSTRING');
  });

  it('fails when substring absent and includes delta', () => {
    const r = matchSubstring('not-actual', 'actual output');
    expect(r.matched).toBe(false);
    expect(r.method).toBe('SUBSTRING');
    expect(r.delta).toContain('not-actual');
    expect(r.delta).toContain('actual output');
  });

  it('handles empty actual', () => {
    const r = matchSubstring('foo', '');
    expect(r.matched).toBe(false);
    expect(r.delta).toContain('(empty)');
  });

  it('handles null actual without throwing', () => {
    const r = matchSubstring('foo', null);
    expect(r.matched).toBe(false);
  });
});

describe('matchRegex', () => {
  it('matches valid regex against actual', () => {
    const r = matchRegex('/success: \\d+/', 'success: 42 done');
    expect(r.matched).toBe(true);
    expect(r.method).toBe('REGEX');
  });

  it('fails when regex does not match and provides delta', () => {
    const r = matchRegex('/^success/', 'failure here');
    expect(r.matched).toBe(false);
    expect(r.method).toBe('REGEX');
    expect(r.delta).toContain('Regex did not match');
  });

  it('falls back to SUBSTRING with warning on invalid regex', () => {
    const r = matchRegex('/[unclosed/', 'some [unclosed text');
    // The fallback substring (after stripping slashes) is "[unclosed"
    expect(r.matched).toBe(true);
    expect(r.method).toBe('SUBSTRING');
    expect(r.warnings).toBeDefined();
    expect(r.warnings[0]).toContain('Invalid regex');
  });

  it('handles null actual without throwing', () => {
    const r = matchRegex('/foo/', null);
    expect(r.matched).toBe(false);
  });
});

describe('matchStructural', () => {
  it('matches identical JSON shapes', () => {
    const r = matchStructural('{"status":"passed"}', '{"status":"passed"}');
    expect(r.matched).toBe(true);
    expect(r.method).toBe('STRUCTURAL');
  });

  it('tolerates extra fields in actual', () => {
    const r = matchStructural(
      '{"status":"passed"}',
      '{"status":"passed","extra":"field","duration_ms":42}'
    );
    expect(r.matched).toBe(true);
  });

  it('tolerates different key order', () => {
    const r = matchStructural(
      '{"a":1,"b":2}',
      '{"b":2,"a":1}'
    );
    expect(r.matched).toBe(true);
  });

  it('fails when expected key missing in actual', () => {
    const r = matchStructural(
      '{"status":"passed","required":true}',
      '{"status":"passed"}'
    );
    expect(r.matched).toBe(false);
    expect(r.delta).toContain('required');
    expect(r.delta).toContain('missing in actual');
  });

  it('fails on primitive value mismatch', () => {
    const r = matchStructural(
      '{"status":"passed"}',
      '{"status":"failed"}'
    );
    expect(r.matched).toBe(false);
    expect(r.delta).toContain('passed');
    expect(r.delta).toContain('failed');
  });

  it('matches nested shapes', () => {
    const r = matchStructural(
      '{"outer":{"inner":42}}',
      '{"outer":{"inner":42,"extra":"ok"},"top_extra":true}'
    );
    expect(r.matched).toBe(true);
  });

  it('matches arrays element-wise', () => {
    const r = matchStructural('[1,2,3]', '[1,2,3]');
    expect(r.matched).toBe(true);
  });

  it('fails on array length mismatch', () => {
    const r = matchStructural('[1,2]', '[1,2,3]');
    expect(r.matched).toBe(false);
    expect(r.delta).toContain('array length');
  });

  it('extracts JSON region from noisy stdout', () => {
    const noisy = 'log line 1\nresult: {"status":"passed"}\nlog line 2';
    const r = matchStructural('{"status":"passed"}', noisy);
    expect(r.matched).toBe(true);
  });

  it('handles strings containing braces correctly', () => {
    const stdout = 'output: {"msg":"hello {world}","ok":true}';
    const r = matchStructural('{"ok":true}', stdout);
    expect(r.matched).toBe(true);
  });

  it('fails gracefully when expected_outcome is invalid JSON', () => {
    const r = matchStructural('{not valid', '{"status":"passed"}');
    expect(r.matched).toBe(false);
    expect(r.delta).toContain('not valid JSON');
  });

  it('fails gracefully when no JSON region in actual', () => {
    const r = matchStructural('{"a":1}', 'just plain text');
    expect(r.matched).toBe(false);
    expect(r.delta).toContain('No JSON region');
  });

  it('matches null values correctly', () => {
    const r = matchStructural('{"value":null}', '{"value":null}');
    expect(r.matched).toBe(true);
  });

  it('detects null vs non-null mismatch', () => {
    const r = matchStructural('{"value":null}', '{"value":42}');
    expect(r.matched).toBe(false);
  });
});

describe('matchStep dispatcher', () => {
  it('dispatches to SUBSTRING for plain text', () => {
    const r = matchStep('foo', 'foobar');
    expect(r.method).toBe('SUBSTRING');
    expect(r.matched).toBe(true);
  });

  it('dispatches to REGEX for /.../ patterns', () => {
    const r = matchStep('/^foo/', 'foobar');
    expect(r.method).toBe('REGEX');
    expect(r.matched).toBe(true);
  });

  it('dispatches to STRUCTURAL for JSON', () => {
    const r = matchStep('{"a":1}', '{"a":1,"b":2}');
    expect(r.method).toBe('STRUCTURAL');
    expect(r.matched).toBe(true);
  });

  it('truncates very long deltas', () => {
    const huge = 'x'.repeat(2000);
    const r = matchStep('foo', huge);
    expect(r.matched).toBe(false);
    expect(r.delta.length).toBeLessThanOrEqual(550); // 500 + truncation marker
    expect(r.delta).toContain('[truncated]');
  });
});
