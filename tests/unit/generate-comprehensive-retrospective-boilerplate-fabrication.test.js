/**
 * QF-20260822-453 — generate-comprehensive-retrospective.js padded thin content with fixed
 * BOILERPLATE_ACHIEVEMENTS/LEARNINGS/ACTIONS string arrays (same fabrication class as
 * QF-20260821-118's generate-retrospective.js fix): the identical filler text was inserted
 * verbatim into every under-quota retrospective regardless of the SD. Now filler is derived
 * from real per-SD context (sub-agent verdicts, PRD stats, handoff pattern counts, SD
 * metadata), and generation refuses to proceed when there is zero real signal anywhere.
 *
 * The script's `main()` runs unconditionally at import time (no import.meta.url guard,
 * reads process.argv[2]) so it cannot be safely imported in a test -- static-source-pin
 * pattern, per tests/unit/sd-start-human-action-gate.test.js and
 * tests/unit/generate-comprehensive-retrospective-subagent-source.test.js.
 *
 * Source-pin regions are end-anchored on a stable token, never a fixed char-count slice
 * (reference_source_pin_tests_end_anchor_never_fixed_char_slice) — a fixed-offset window
 * silently misses content when an unrelated comment grows above the pinned line.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '..', '..', 'scripts/generate-comprehensive-retrospective.js'), 'utf8');

function region(startToken, endToken) {
  const startIdx = src.indexOf(startToken);
  expect(startIdx, `start token not found: ${startToken}`).toBeGreaterThan(-1);
  const endIdx = src.indexOf(endToken, startIdx);
  expect(endIdx, `end token not found after start: ${endToken}`).toBeGreaterThan(startIdx);
  return src.slice(startIdx, endIdx);
}

describe('QF-20260822-453: no fixed boilerplate string arrays survive in the source', () => {
  it('never declares BOILERPLATE_ACHIEVEMENTS / BOILERPLATE_LEARNINGS / BOILERPLATE_ACTIONS', () => {
    expect(src).not.toMatch(/BOILERPLATE_ACHIEVEMENTS/);
    expect(src).not.toMatch(/BOILERPLATE_LEARNINGS/);
    expect(src).not.toMatch(/BOILERPLATE_ACTIONS/);
  });
});

describe('QF-20260822-453: achievement filler is derived from real per-SD context', () => {
  const block = region('const achievementFiller = () =>', 'const learningFiller = () =>');

  it('cites sub-agent verdicts, PRD stats, handoff pattern count, and SD metadata', () => {
    expect(block).toMatch(/subAgentAnalysis\.consulted/);
    expect(block).toMatch(/prdAnalysis\.acceptance_criteria/);
    expect(block).toMatch(/handoffInsights\.patterns\.length/);
    expect(block).toMatch(/sd\.sd_key/);
  });

  it('is invoked as a function (not a static array) when filling the gap', () => {
    expect(block).toMatch(/achievementFiller\(\)\.slice\(0, fillerNeeded\)/);
  });
});

describe('QF-20260822-453: learning filler is derived from real per-SD context', () => {
  const block = region('const learningFiller = () =>', 'const actionFiller = () =>');

  it('cites quality score, real handoff counts, PRD complexity, and sub-agent count', () => {
    expect(block).toMatch(/qualityScore/);
    expect(block).toMatch(/handoffInsights\.achievements\.length/);
    expect(block).toMatch(/prdAnalysis\.complexity_score/);
    expect(block).toMatch(/subAgentAnalysis\.consulted/);
  });

  it('is invoked as a function (not a static array) when filling the gap', () => {
    expect(block).toMatch(/learningFiller\(\)\.slice\(0, fillerNeeded\)/);
  });
});

describe('QF-20260822-453: action filler is derived from real per-SD context', () => {
  const block = region('const actionFiller = () =>', 'const successPatterns =');

  it('cites handoff pattern count, sub-agent verdicts, and PRD acceptance criteria', () => {
    expect(block).toMatch(/handoffInsights\.patterns\.length/);
    expect(block).toMatch(/subAgentAnalysis\.consulted/);
    expect(block).toMatch(/prdAnalysis\.acceptance_criteria/);
  });

  it('is invoked as a function (not a static array) when filling the gap', () => {
    expect(block).toMatch(/actionFiller\(\)\.slice\(0, fillerNeeded\)/);
  });
});

describe('QF-20260822-453: refuses to fabricate a retrospective with zero real signal', () => {
  const block = region('const hasRealSignal =', '// Aggregate captured learning signals');

  it('checks all four real sources: handoffs, PRD, sub-agents', () => {
    expect(block).toMatch(/handoffInsights\.achievements\.length > 0/);
    expect(block).toMatch(/handoffInsights\.learnings\.length > 0/);
    expect(block).toMatch(/handoffInsights\.actions\.length > 0/);
    expect(block).toMatch(/prdAnalysis !== null/);
    expect(block).toMatch(/subAgentAnalysis\.consulted > 0/);
  });

  it('throws instead of proceeding when hasRealSignal is false', () => {
    expect(block).toMatch(/if \(!hasRealSignal\)\s*\{\s*throw new Error/);
  });
});
