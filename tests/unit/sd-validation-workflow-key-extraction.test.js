/**
 * QF-20260701-088: the "Validate SD Phase" GitHub Action's SD_ID extraction
 * (.github/workflows/sd-validation.yml "SD_ID=$(... grep -oE ...)") must capture a
 * multi-segment SD key WHOLE, not stop at the first 1-2 hyphenated segments. The old
 * two-alternative pattern (`SD-[A-Z]+-[A-Z0-9]+-[0-9]+|SD-[A-Z]+-[0-9]+`) required a
 * digit-terminal key with EXACTLY 1-2 segments before the number, so a real
 * multi-segment key like SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A never matched
 * at its true start — grep instead matched the coincidentally-embedded shorter
 * "SD-RANKED-001" substring further into the string, causing a false DB-lookup-404 on
 * PR #5323/#5325.
 *
 * This test reads the LIVE regex out of the workflow file (so a revert fails it) and
 * pins that a real multi-segment key extracts WHOLE, mirroring
 * tests/unit/gate0-sd-key-extraction.test.js's approach for the sibling .husky/pre-commit
 * extraction site (QF-20260621-393), which already proved this exact pattern shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW = readFileSync(resolve(process.cwd(), '.github/workflows/sd-validation.yml'), 'utf8');

function extractWorkflowRegex() {
  const line = WORKFLOW.split('\n').find((l) => l.includes('SD_ID=') && l.includes('grep -oE'));
  expect(line, 'SD_ID extraction line with grep -oE not found in sd-validation.yml').toBeTruthy();
  const m = line.match(/grep -oE '([^']+)'/);
  expect(m, 'could not parse the grep -oE regex literal').toBeTruthy();
  return m[1];
}

function firstMatch(input, ere) {
  const re = new RegExp(ere, 'g'); // ERE pattern is JS-compatible for this shape
  const m = re.exec(input);
  return m ? m[0] : null;
}

describe('QF-20260701-088: sd-validation.yml SD_ID extraction captures multi-segment keys whole', () => {
  const ere = extractWorkflowRegex();

  it('extracts the exact regressed multi-segment key WHOLE, not an embedded substring', () => {
    const input = 'fix(SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A): title feat/SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A';
    expect(firstMatch(input, ere)).toBe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-A');
    expect(firstMatch(input, ere)).not.toBe('SD-RANKED-001'); // the regression
  });

  it('still extracts a short 2-segment digit-terminal key', () => {
    expect(firstMatch('fix(SD-XXX-001): title feat/SD-XXX-001', ere)).toBe('SD-XXX-001');
  });

  it('still captures a child-letter suffix whole', () => {
    expect(firstMatch('feat/SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-B', ere)).toBe('SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-B');
  });

  it('also extracts an alnum-terminal SD-REFILL key whole (same fix family as QF-20260621-393)', () => {
    expect(firstMatch('feat/SD-REFILL-00XUUGXQ', ere)).toBe('SD-REFILL-00XUUGXQ');
  });

  it('does NOT over-match a bare single-segment "SD-FOO" (no key present)', () => {
    expect(firstMatch('SD-REFILL needs work', ere)).toBe(null);
    expect(firstMatch('docs: unrelated title, no key here', ere)).toBe(null);
  });
});
