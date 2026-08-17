/**
 * QF-20260816-269 — CLAUDE_PLAN.md's "## Testing Tier Strategy (Updated)" heading rendered
 * with zero body: leo_protocol_sections id=259's `content` started with its own leading
 * "## Testing Requirements - Dual Test Execution (SD-ARCH-EHG-007 Updated)" H2, which does
 * not text-match the row's `title` (formatSection() in
 * scripts/modules/claude-md-generator/section-formatters.js only strips a leading heading
 * from content when it exactly matches the title), so the generator emitted the auto-title
 * heading immediately followed by the content's own heading — a reader landing on
 * "Testing Tier Strategy" found nothing until the next H2.
 *
 * Fix: stripped the redundant duplicate heading from the DB row's content (DB is the source
 * of truth; CLAUDE_PLAN.md is regenerated, not hand-edited). Runs against the on-disk
 * artifact produced by `node scripts/generate-claude-md-from-db.js`, matching the sibling
 * opus47-alignment.test.js convention.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..', '..');

const HEADING = '## Testing Tier Strategy (Updated)';

/**
 * True when `heading` is followed only by blank lines before the next H2 —
 * i.e. the heading has zero body. Mirrors the QF's own test criterion.
 */
function isEmptyHeading(fileContent, heading) {
  const idx = fileContent.indexOf(heading);
  if (idx === -1) throw new Error(`heading not found: ${heading}`);
  const after = fileContent.slice(idx + heading.length);
  const nextNonBlank = after.split(/\r?\n/).find((line) => line.trim() !== '');
  return typeof nextNonBlank === 'string' && nextNonBlank.startsWith('## ');
}

describe('QF-20260816-269 — Testing Tier Strategy (Updated) heading has a body', () => {
  let claudePlan;

  beforeAll(() => {
    claudePlan = readFileSync(resolve(repoRoot, 'CLAUDE_PLAN.md'), 'utf8');
  });

  it('heading exists exactly once', () => {
    const occurrences = claudePlan.split(HEADING).length - 1;
    expect(occurrences).toBe(1);
  });

  it('is not immediately followed by another H2 (no empty heading)', () => {
    expect(isEmptyHeading(claudePlan, HEADING)).toBe(false);
  });

  it('is immediately followed by real body prose', () => {
    const idx = claudePlan.indexOf(HEADING);
    const after = claudePlan.slice(idx + HEADING.length, idx + HEADING.length + 120);
    expect(after).toContain('**Philosophy**');
    expect(after).not.toContain('## Testing Requirements - Dual Test Execution');
  });

  it('helper detects a genuinely empty heading (sanity check)', () => {
    const fixture = '## Empty One\n\n\n## Next Heading\n\nbody\n';
    expect(isEmptyHeading(fixture, '## Empty One')).toBe(true);
    expect(isEmptyHeading(fixture, '## Next Heading')).toBe(false);
  });
});
