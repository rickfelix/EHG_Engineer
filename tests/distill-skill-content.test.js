/**
 * Content invariants for the /distill skill — locks the AUTO-PROCEED audit
 * shipped by SD-LEO-INFRA-AUTO-PROCEED-AUDIT-001.
 *
 * Distill.md has 11 AskUserQuestion uses across two shapes:
 *  - Workflow-boundary menus (REMOVED — these violated AUTO-PROCEED):
 *      * Inter-item brainstorm decision (~line 616)
 *      * Step 5 next-steps after live pipeline (~line 691)
 *      * Dry-run "ready to persist?" (~line 711)
 *  - Legitimate operator-input menus (PRESERVED — chairman judgment):
 *      * B1 chairman-intent in Phase 2 (Build now/Build later/Research/Reference)
 *      * Cherry-pick brainstorm-items multiSelect
 *
 * Detection strategy: workflow-boundary menus had a `question:` YAML or
 * `"question":` JSON shape inside the section. Free-text prose mentions of
 * "AskUserQuestion" are intentionally allowed — they document why menus
 * were removed and prevent silent re-introduction.
 *
 * If you intentionally need to restore a removed menu, file a new SD that
 * updates this test.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const distillPath = resolve(repoRoot, '.claude/commands/distill.md');

let distill;
let lines;

beforeAll(() => {
  distill = readFileSync(distillPath, 'utf8');
  lines = distill.split('\n');
});

function sectionByHeading(headingRegex, maxLines = 60) {
  const startIdx = lines.findIndex((l) => headingRegex.test(l));
  if (startIdx === -1) return '';
  return lines.slice(startIdx, startIdx + maxLines).join('\n');
}

describe('distill.md — workflow-boundary menus removed (negative-space)', () => {
  it('inter-item brainstorm-loop section contains no menu invocation', () => {
    const section = sectionByHeading(/Inter-item progression|Inter-item decision/i, 40);
    expect(section.length, 'inter-item section not found').toBeGreaterThan(0);
    const menuShape = section.match(/(?:^\s*question\s*:|"question"\s*:)/gm) || [];
    expect(
      menuShape.length,
      'inter-item brainstorm-loop must not present a menu — under AUTO-PROCEED the loop default-continues. Verbal interrupt handles cancellation. See SD-LEO-INFRA-AUTO-PROCEED-AUDIT-001.'
    ).toBe(0);
  });

  it('Step 5 live-run section contains no menu invocation', () => {
    const section = sectionByHeading(/Step 5: Next steps/i, 50);
    expect(section.length, 'Step 5 section not found').toBeGreaterThan(0);
    const menuShape = section.match(/(?:^\s*question\s*:|"question"\s*:)/gm) || [];
    expect(
      menuShape.length,
      'Step 5 live-run must route deterministically on roadmap state, not present a menu. See SD-LEO-INFRA-AUTO-PROCEED-AUDIT-001.'
    ).toBe(0);
  });

  it('dry-run completion section contains no menu invocation', () => {
    const startIdx = lines.findIndex((l) => /\[DRY RUN COMPLETE\]/.test(l));
    expect(startIdx, 'dry-run completion marker not found').toBeGreaterThan(-1);
    const section = lines.slice(Math.max(0, startIdx - 5), startIdx + 20).join('\n');
    const menuShape = section.match(/(?:^\s*question\s*:|"question"\s*:)/gm) || [];
    expect(
      menuShape.length,
      'dry-run completion must log results + instruct re-run, not present a menu. See SD-LEO-INFRA-AUTO-PROCEED-AUDIT-001.'
    ).toBe(0);
  });
});

describe('distill.md — legitimate operator-input menus preserved (positive)', () => {
  it('B1 chairman-intent menu marker present (Build now / Build later / Research / Reference)', () => {
    expect(
      distill,
      'B1 chairman-intent menu must remain — chairman strategic judgment cannot be deterministic.'
    ).toMatch(/Build now \(brainstorm\)/);
    expect(
      distill,
      'B1 menu must list all 4 action options.'
    ).toMatch(/Build later \(add to wave\)/);
  });

  it('Cherry-pick brainstorm-items selection menu present (multiSelect for operator choice)', () => {
    expect(
      distill,
      'Cherry-pick selection must remain — operator chooses subset of items to brainstorm.'
    ).toMatch(/Cherry-Pick Brainstorm Items/);
    expect(
      distill,
      'Cherry-pick must use multiSelect:true since operators select a subset.'
    ).toMatch(/multiSelect.*true/);
  });

  it('pause/resume state-file mechanism intact (distill-loop-state.json per-iteration write)', () => {
    expect(
      distill,
      'distill-loop-state.json save mechanism must remain intact — resume across sessions depends on it.'
    ).toMatch(/distill-loop-state\.json/);
    expect(
      distill,
      'Per-iteration state-write block must remain (lines after each item completes).'
    ).toMatch(/state\.completed_items\.push/);
  });
});

describe('distill.md — AskUserQuestion total count baseline', () => {
  it('total AskUserQuestion mentions stay within 8-12 range (8 legitimate + up to 4 prose markers)', () => {
    const matches = distill.match(/AskUserQuestion/g) || [];
    expect(
      matches.length,
      `AskUserQuestion mention count is ${matches.length}; expected 8-12. Sudden drop suggests legitimate menus removed; sudden rise suggests new menus added without SD review. See SD-LEO-INFRA-AUTO-PROCEED-AUDIT-001.`
    ).toBeGreaterThanOrEqual(8);
    expect(matches.length).toBeLessThanOrEqual(12);
  });
});
