/**
 * QF-20260913-791: a rule the contract itself ranks ABOVE ALL OTHER DUTIES (RULE #0 — reply
 * delivery) was evicted from CLAUDE_ADAM_DIGEST.md while its HEADING survived, because the
 * authority-selection marker set is a vocabulary test and RULE #0's body is plain narrative prose
 * with no marker words. A heading advertising a rule with none of its body is worse than dropping
 * the rule outright: a reader who greps for it finds it present and reads nothing.
 *
 * Run against the LIVE section content (extracted from CLAUDE_ADAM.md as committed), not a
 * synthetic fixture, so this tracks real drift rather than a frozen snapshot of the defect.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatSectionCompact, generateAdamDigest } from '../../../scripts/modules/claude-md-generator/digest-generators.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contract = fs.readFileSync(path.join(ROOT, 'CLAUDE_ADAM.md'), 'utf8');

const TITLE = 'Adam Role Contract — Chairman-Attached Advisory/Analysis Session';
const startMarker = `## ${TITLE}\n\n`;
const start = contract.indexOf(startMarker);
const afterStart = start + startMarker.length;
const end = contract.indexOf('\n\n---\n\n*Generated from database', afterStart);
const liveContent = contract.slice(afterStart, end);

const section = { section_type: 'adam_role_contract', title: TITLE, content: liveContent };

describe('digest authority selection seats a rank-marked rule whole (QF-20260913-791)', () => {
  it('sanity: the live contract still carries the rank-marked RULE #0 block', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(afterStart);
    expect(liveContent).toMatch(/ABOVE ALL OTHER DUTIES/i);
    expect(liveContent).toMatch(/PRINTED REPLY IS THE TERMINAL ACT/i);
  });

  it('never seats the RULE #0 heading without its body, under a budget far below what ordinary marker-based seating needs', () => {
    // 3,000 chars is a fraction of AUTHORITY_SELECT_MIN_CHARS' saturation point for this contract
    // (>9,000, production uses 16,000) but comfortably fits RULE #0's own ~2.1k-char block — the
    // old code kept the heading (cheap, seated via backfill/opening lines) while the body lost
    // out to budget pressure from unrelated marker-bearing lines earlier in the document.
    const compact = formatSectionCompact(section, { maxChars: 3000 });
    const headingIdx = compact.search(/## RULE #0/i);
    expect(headingIdx).toBeGreaterThan(-1);
    const nextHeadingIdx = compact.indexOf('\n## ', headingIdx + 1);
    const block = nextHeadingIdx > -1 ? compact.slice(headingIdx, nextHeadingIdx) : compact.slice(headingIdx);
    expect(block).toMatch(/PRINTED REPLY IS THE TERMINAL ACT/i);
  });

  it('drops a seated heading entirely rather than keep it without any body (impossibly tiny budget)', () => {
    const compact = formatSectionCompact(section, { maxChars: 200 });
    const headingIdx = compact.search(/## RULE #0/i);
    if (headingIdx > -1) {
      const nextHeadingIdx = compact.indexOf('\n## ', headingIdx + 1);
      const block = nextHeadingIdx > -1 ? compact.slice(headingIdx, nextHeadingIdx) : compact.slice(headingIdx);
      const bodyLines = block.split('\n').slice(1);
      const bodyOnly = bodyLines.join('\n').replace(/[…\s]/g, '');
      expect(bodyOnly.length).toBeGreaterThan(0);
    }
  });

  it('the full CLAUDE_ADAM_DIGEST.md generator carries RULE #0 heading and body together', () => {
    const fileMapping = { 'CLAUDE_ADAM_DIGEST.md': { sections: ['adam_role_contract'] } };
    const data = { protocol: { version: 'test', sections: [section] } };
    const metadata = { gitCommit: 'test', dbSnapshotHash: 'test', contentHash: 'test', generatedAt: 'test' };

    const digest = generateAdamDigest(data, fileMapping, metadata);
    expect(digest).toMatch(/ABOVE ALL OTHER DUTIES/i);
    expect(digest).toMatch(/PRINTED REPLY IS THE TERMINAL ACT/i);
  });
});
