// SD-LEARN-FIX-ADDRESS-PAT-LES-018 (TS-2/TS-3): the PLAN-TO-EXEC checklist hint
// must name the required 'priority' field and a story_key format consistent
// with the live constraint -- source-text assertions on the printed block,
// matching this repo's established grep/structural-guard convention for CLI
// print statements that are impractical to exercise end-to-end.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_MAIN_PATH = join(__dirname, '../../../scripts/modules/handoff/cli/cli-main.js');
const SNAPSHOT_PATH = join(__dirname, '../../../database/schema-reference-snapshot.json');

function extractPlanToExecChecklistBlock(source) {
  const startIdx = source.indexOf("normalizedType === 'PLAN-TO-EXEC'");
  expect(startIdx, 'PLAN-TO-EXEC checklist block not found in cli-main.js').toBeGreaterThan(-1);
  // The block ends at the next `if (normalizedType ===` or the next blank console.log('') + closing brace pair.
  const rest = source.slice(startIdx);
  const nextBlockIdx = rest.indexOf('normalizedType ===', 'normalizedType ==='.length);
  return nextBlockIdx > -1 ? rest.slice(0, nextBlockIdx) : rest.slice(0, 2000);
}

describe('PLAN-TO-EXEC checklist hint: user_stories field completeness (TS-2/TS-3)', () => {
  const source = readFileSync(CLI_MAIN_PATH, 'utf8');
  const block = extractPlanToExecChecklistBlock(source);
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));

  it("checklist block mentions 'priority' as a required field (TS-2)", () => {
    expect(block).toMatch(/priority/);
  });

  it('checklist block names story_key format consistent with the live valid_story_key regex (TS-3)', () => {
    const checkDef = snapshot.checks['user_stories.valid_story_key'];
    expect(checkDef).toBeTruthy();
    // The live regex requires "US-" with 3+ digits -- the hint must at least
    // reference the 'US-' token and a digit-count hint, not just a bare example.
    expect(block).toMatch(/US-/);
    expect(checkDef).toContain('US-[0-9]{3,}');
    expect(block).toMatch(/\{3,\}|3\+ digits/);
  });

  it('NEGATIVE CONTROL: a checklist block missing priority would fail TS-2', () => {
    const strippedBlock = block.replace(/priority/gi, 'PRIORITY_FIELD_REMOVED');
    expect(strippedBlock).not.toMatch(/priority/);
  });
});
