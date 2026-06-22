/**
 * QF-20260621-393 (chairman flag #6, flag_review:63843f8e): the Gate-0 pre-commit
 * SD-key EXTRACTION (.husky/pre-commit "SD_ID=$(... grep -oE ...)") must capture
 * alnum-terminal keys WHOLE. Auto-refill mints SD-REFILL-<8 alnum> (no trailing
 * -digits); the old pattern's mandatory '-[0-9]+' segment truncated them
 * (SD-REFILL-00XUUGXQ -> 'SD-REFILL-00'), so validate-sd-commit.js couldn't find
 * the key -> false 'not found' -> the WHOLE SD-REFILL belt was forced onto
 * LEO_ALLOW_NO_VERIFY on every commit.
 *
 * This test reads the LIVE regex out of .husky/pre-commit (so a revert fails it)
 * and pins that BOTH a digit-terminal key and an alnum-terminal key extract whole,
 * while lowercase prose and a single-segment "SD-FOO" do not over-match. The ERE
 * pattern grep uses is also a valid JS RegExp, so we exercise the exact shipped string.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOOK = readFileSync(resolve(process.cwd(), '.husky/pre-commit'), 'utf8');

// Pull the regex literal out of the `SD_ID=$(... grep -oE '<REGEX>' ...)` extraction line.
function extractHookRegex() {
  const line = HOOK.split('\n').find(l => l.includes('SD_ID=') && l.includes('grep -oE'));
  expect(line, 'SD_ID extraction line with grep -oE not found in .husky/pre-commit').toBeTruthy();
  const m = line.match(/grep -oE '([^']+)'/);
  expect(m, 'could not parse the grep -oE regex literal').toBeTruthy();
  return m[1];
}

// Mirror `grep -oE | head -1`: first (leftmost-longest-ish) match. JS RegExp without
// the longest-match guarantee is fine here since our pattern is greedy and anchored on SD-.
function firstMatch(input, ere) {
  const re = new RegExp(ere, 'g'); // ERE pattern is JS-compatible
  const m = re.exec(input);
  return m ? m[0] : null;
}

describe('QF-20260621-393: Gate-0 SD-key extraction captures alnum-terminal keys whole', () => {
  const ere = extractHookRegex();

  it('extracts an alnum-terminal SD-REFILL key WHOLE (the regression)', () => {
    expect(firstMatch('SD-REFILL-00XUUGXQ', ere)).toBe('SD-REFILL-00XUUGXQ');
    expect(firstMatch('SD-REFILL-007PVF5E', ere)).toBe('SD-REFILL-007PVF5E');
    expect(firstMatch('SD-REFILL-00ED3P4B', ere)).toBe('SD-REFILL-00ED3P4B');
  });

  it('still extracts a digit-terminal key whole (no regression for the existing family)', () => {
    expect(firstMatch('SD-LEO-FEAT-CLAIM-PATH-RESPECTED-001', ere)).toBe('SD-LEO-FEAT-CLAIM-PATH-RESPECTED-001');
    expect(firstMatch('SD-FEATURE-001', ere)).toBe('SD-FEATURE-001');
  });

  it('still captures the -B child suffix whole', () => {
    expect(firstMatch('SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-B', ere)).toBe('SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-B');
  });

  it('extracts a key embedded in a branch name', () => {
    expect(firstMatch('feat/SD-REFILL-00TH22DQ', ere)).toBe('SD-REFILL-00TH22DQ');
  });

  it('does NOT over-match lowercase prose or a bare single-segment SD-FOO', () => {
    expect(firstMatch('fixing the SD-based approach here', ere)).toBe(null);
    expect(firstMatch('SD-REFILL needs work', ere)).toBe(null); // single segment after SD- -> not a key
  });

  it('the mandatory trailing -[0-9]+ truncator is gone from the extraction pattern', () => {
    // Guard against a revert to the old `...-[0-9]+(-[A-Z])?` shape that truncated alnum keys.
    expect(ere.endsWith('-[0-9]+(-[A-Z])?')).toBe(false);
  });
});
