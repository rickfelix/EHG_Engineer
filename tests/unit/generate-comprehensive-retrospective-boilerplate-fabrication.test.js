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

describe('SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-144: whatNeedsImprovement filler is derived from real per-SD context', () => {
  // The sibling QF-20260822-453 never touched whatNeedsImprovement, which is why its 3 old
  // universal literal strings kept getting re-detected by /learn as "recurring patterns"
  // (PAT-LES-1e4dde82cf3e, PAT-LES-835b015f7a0f) long after -453 shipped -- the strings were
  // byte-identical filler across dozens of retrospectives, not a real repeated codebase gap.
  const block = region('const challengeFiller = () =>', 'const whatNeedsImprovement =');

  it('never re-introduces the old universal literal strings', () => {
    expect(src).not.toMatch(/Documentation could be enhanced with more visual diagrams/);
    expect(src).not.toMatch(/Testing coverage could be expanded to include edge cases/);
    expect(src).not.toMatch(/Performance benchmarks could be added for future comparison/);
  });

  it('cites sub-agent verdicts, PRD stats, handoff pattern count, and SD key', () => {
    expect(block).toMatch(/subAgentAnalysis\.consulted/);
    expect(block).toMatch(/prdAnalysis\.test_scenarios/);
    expect(block).toMatch(/handoffInsights\.patterns\.length/);
    expect(block).toMatch(/sd\.sd_key/);
  });

  it('always returns exactly 3 entries (keeps the >=3-item trigger threshold satisfied)', () => {
    // Count top-level array-literal commas via depth tracking (backticks, (), [], {} all
    // nest correctly) -- more robust than a fixed-shape regex against the entry text itself.
    const openIdx = block.indexOf('=> [') + 3;
    const closeIdx = block.indexOf('\n  ];', openIdx);
    expect(closeIdx, 'closing "];" not found for challengeFiller').toBeGreaterThan(openIdx);
    const inner = block.slice(openIdx + 1, closeIdx);
    let depth = 0;
    let inBacktick = false;
    let topLevelCommas = 0;
    for (const ch of inner) {
      if (ch === '`') inBacktick = !inBacktick;
      if (inBacktick) continue;
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ',' && depth === 0) topLevelCommas++;
    }
    expect(topLevelCommas).toBe(2); // 3 entries = 2 separating commas
  });

  it('is invoked as a function (not a static array) when filling the gap', () => {
    expect(src).toMatch(/\.\.\.challengeFiller\(\)/);
  });

  it('is a plain string array (not wrapped in {text, is_boilerplate} objects, unlike whatWentWell/keyLearnings) -- the DB trigger reads it positionally', () => {
    const wniBlock = region('const whatNeedsImprovement =', 'Ensure at least 5 learnings');
    expect(wniBlock).not.toMatch(/is_boilerplate/);
  });

  it('never uses dismissive phrasing the DB trigger penalizes (ILIKE %no significant% / %nothing%, see 20251016_fix_quality_validation_trigger_conditional.sql)', () => {
    expect(block.toLowerCase()).not.toMatch(/no significant/);
    expect(block.toLowerCase()).not.toMatch(/nothing/);
  });
});

describe('QF-20260822-453: achievement filler is derived from real per-SD context', () => {
  // Tightened to end at 'const challengeFiller = () =>' (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-144):
  // the old end-anchor 'const learningFiller = () =>' also swallowed the whatNeedsImprovement/
  // challengeFiller block inserted between them. Must still include the whatWentWell if/else
  // block below the declaration, where achievementFiller() is actually invoked.
  const block = region('const achievementFiller = () =>', 'const challengeFiller = () =>');

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
