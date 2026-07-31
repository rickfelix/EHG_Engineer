/**
 * PROVENANCE companion — partial-record honesty guard.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-1 / FR-2.
 *
 * This file is mechanically derived and covers only ~12% of the original's inline provenance.
 * That is fine PROVIDED it says so. The danger of a partial governance record is that absence
 * reads as a finding: "no provenance recorded" gets taken as "this rule has no basis", and from
 * there as "this rule can be dropped". The rules are in force regardless of what is recorded here.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'docs/protocol/adam-contract-review-2026-07-29/CLAUDE_ADAM_PROVENANCE.DRAFT-2026-07-29.md');
const PROV = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

describe('CLAUDE_ADAM_PROVENANCE companion', () => {
  it('disclaims governing force', () => {
    expect(PROV).toMatch(/in force regardless/i);
    expect(PROV).toMatch(/explains; it does not govern/i);
  });

  it('states that it is PARTIAL, and that absence is not a finding', () => {
    expect(PROV).toMatch(/PARTIAL/);
    expect(PROV).toMatch(/never evidence\s*\n?>?\s*that a rule is inactive/i);
    expect(PROV).toMatch(/Do not read a missing entry as/i);
  });

  it('the stated coverage matches what the file actually contains', () => {
    // Without this the disclosure rots: entries get added, the headline percentage stays put, and
    // the file starts overstating or understating its own completeness. A coverage claim that
    // cannot be checked against the content is just a comment.
    const claimed = Number((PROV.match(/only \*\*(\d+)\*\*/) || [])[1]);
    const bullets = (PROV.match(/^- \*\*/gm) || []).length;
    expect(claimed).toBe(bullets);

    const pct = Number((PROV.match(/Coverage is roughly (\d+)%/) || [])[1]);
    expect(pct).toBe(Math.round((100 * bullets) / 81));
  });

  it('CONTROL: it actually carries entries', () => {
    // "Partial and honest" must not decay into "empty but well-labelled".
    expect((PROV.match(/^- \*\*/gm) || []).length).toBeGreaterThan(5);
    expect(PROV).toMatch(/Dated change log/);
  });
});
