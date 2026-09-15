// SD-LEARN-FIX-ADDRESS-PAT-LES-018 (TS-1): the new user_stories constraint doc
// section stays in sync with the LIVE schema snapshot, never a stale copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(__dirname, '../../../docs/reference/database-agent-patterns.md');
const SNAPSHOT_PATH = join(__dirname, '../../../database/schema-reference-snapshot.json');

function extractStoryKeyRegex(checkDef) {
  const m = /~\s*'([^']+)'/.exec(checkDef);
  return m ? new RegExp(m[1].replace(/^\^/, '^').replace(/\$$/, '$')) : null;
}

function extractPriorityEnum(checkDef) {
  return [...checkDef.matchAll(/'([a-z]+)'::character varying/g)].map((m) => m[1]);
}

describe('user_stories constraint documentation (TS-1)', () => {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));

  it('doc contains the new user_stories Table Constraints section', () => {
    expect(doc).toContain('### user_stories Table Constraints');
  });

  it("doc's example story_key satisfies the LIVE valid_story_key constraint", () => {
    const checkDef = snapshot.checks['user_stories.valid_story_key'];
    expect(checkDef, 'live constraint must exist').toBeTruthy();
    const regex = extractStoryKeyRegex(checkDef);
    expect(regex).toBeTruthy();

    const exampleMatch = /story_key:\s*'([^']+)'/.exec(doc);
    expect(exampleMatch, 'doc must contain a story_key: \'...\' example').toBeTruthy();
    expect(regex.test(exampleMatch[1])).toBe(true);
  });

  it("doc's example priority satisfies the LIVE user_stories_priority_check constraint", () => {
    const checkDef = snapshot.checks['user_stories.user_stories_priority_check'];
    expect(checkDef, 'live constraint must exist').toBeTruthy();
    const validValues = extractPriorityEnum(checkDef);
    expect(validValues.length).toBeGreaterThan(0);

    const exampleMatch = /priority:\s*'([^']+)'/.exec(doc);
    expect(exampleMatch, 'doc must contain a priority: \'...\' example').toBeTruthy();
    expect(validValues).toContain(exampleMatch[1]);
  });

  it('doc names all 5 valid priority values, not a subset', () => {
    const checkDef = snapshot.checks['user_stories.user_stories_priority_check'];
    const validValues = extractPriorityEnum(checkDef);
    for (const value of validValues) {
      expect(doc).toContain(value);
    }
  });
});
