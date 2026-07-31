/**
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-4 — one row supplies the shared section.
 *
 * role_partnership_contract is mapped into BOTH CLAUDE_ADAM.md and CLAUDE_COORDINATOR.md. That is
 * the "included, never copied" property: one governed row feeds two files, so editing it moves both.
 * Writing the same prose into an adam_role_contract row instead produces a CLAUDE_ADAM.md that is
 * byte-identical on landing day and silently diverges the first time the shared row is edited.
 *
 * Review's finding was that NOTHING enforced this — getSectionsByMapping is a membership filter with
 * no exclusivity check, the drift check compares DB-to-file fidelity (so a faithful duplicate is
 * green), and a diff of the two rendered files is green too. These tests cover the guard added for it.
 *
 * The important test in this file is the one that PLANTS a duplicate. A guard that has only ever
 * been observed passing is not known to work — the live rows are clean, so a green run against them
 * proves nothing about whether the check can fail.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findCopiedSharedSections,
  assertSharedSectionsNotCopied,
  generateAdam,
  generateCoordinator,
} from '../../../scripts/modules/claude-md-generator/file-generators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPING = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../scripts/section-file-mapping.json'), 'utf8')
);

// Long enough to clear the distinctive-line floor, and unmistakable in a failure message.
const PARTNERSHIP_LINE =
  'The coordinator and Adam are peers: neither directs the other, and both answer to the Chairman.';
const PARTNERSHIP_BODY = `## Partnership and comms\n\n${PARTNERSHIP_LINE}\n`;

const cleanSections = () => [
  { id: 601, section_type: 'adam_role_contract', title: 'Adam Role Contract', content: '## Role\n\nAdam is the Chairman-attached strategist and sources work for the fleet.\n' },
  { id: 602, section_type: 'adam_self_adherence_loop', title: 'Self-adherence', content: '## Self-adherence\n\nRe-read the rubric before every Chairman-facing response, without exception.\n' },
  { id: 610, section_type: 'role_partnership_contract', title: 'Partnership', content: PARTNERSHIP_BODY },
  { id: 700, section_type: 'coordinator_role_contract', title: 'Coordinator', content: '## Coordinator\n\nThe coordinator supervises the worker fleet and keeps the conveyor belt loaded.\n' },
];

describe('the shared section is mapped into two files (the property being protected)', () => {
  it('role_partnership_contract feeds BOTH CLAUDE_ADAM.md and CLAUDE_COORDINATOR.md', () => {
    expect(MAPPING['CLAUDE_ADAM.md'].sections).toContain('role_partnership_contract');
    expect(MAPPING['CLAUDE_COORDINATOR.md'].sections).toContain('role_partnership_contract');
  });

  it('ONE row supplies it to both — removing that row removes the section from both files', () => {
    // The positive form of "included, never copied": there is a single point of supply, so a single
    // deletion is visible in both outputs. Were the prose copied into adam_role_contract, dropping
    // row 610 would empty the Coordinator file and leave CLAUDE_ADAM.md still carrying the text.
    const data = { protocol: { version: '4.4.1', sections: cleanSections() } };
    expect(generateAdam(data, MAPPING)).toContain(PARTNERSHIP_LINE);
    expect(generateCoordinator(data, MAPPING)).toContain(PARTNERSHIP_LINE);

    const without = { protocol: { version: '4.4.1', sections: cleanSections().filter(s => s.id !== 610) } };
    expect(generateAdam(without, MAPPING)).not.toContain(PARTNERSHIP_LINE);
    expect(generateCoordinator(without, MAPPING)).not.toContain(PARTNERSHIP_LINE);
  });
});

describe('findCopiedSharedSections — the guard', () => {
  it('passes clean rows', () => {
    expect(findCopiedSharedSections(cleanSections(), MAPPING)).toEqual([]);
    expect(() => assertSharedSectionsNotCopied(cleanSections(), MAPPING)).not.toThrow();
  });

  it('CATCHES the partnership prose copied into adam_role_contract', () => {
    // *** FALSIFYING THE CONTROL. *** This is the corruption the SD describes: it renders a
    // byte-identical file today, passes the drift check, and passes a diff of the two outputs.
    const corrupted = cleanSections();
    corrupted[0] = { ...corrupted[0], content: `${corrupted[0].content}\n${PARTNERSHIP_BODY}` };

    const findings = findCopiedSharedSections(corrupted, MAPPING);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      shared_type: 'role_partnership_contract',
      shared_id: 610,
      copied_into_type: 'adam_role_contract',
      copied_into_id: 601,
    });
    expect(findings[0].evidence).toContain('The coordinator and Adam are peers');
  });

  it('refuses to generate, naming both rows so the fix is unambiguous', () => {
    const corrupted = cleanSections();
    corrupted[0] = { ...corrupted[0], content: `${corrupted[0].content}\n${PARTNERSHIP_BODY}` };
    let err;
    try { assertSharedSectionsNotCopied(corrupted, MAPPING); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toContain('SHARED SECTION COPIED INSTEAD OF INCLUDED');
    expect(err.message).toContain('row 610');
    expect(err.message).toContain('row 601');
  });

  it('catches the copy into ANY section, not just the one file it shares a page with', () => {
    // The hazard is duplication of a governed row, wherever it lands — a copy into the self-adherence
    // row drifts exactly as badly and would not be caught by comparing the Adam and Coordinator files.
    const corrupted = cleanSections();
    corrupted[1] = { ...corrupted[1], content: `${corrupted[1].content}\n${PARTNERSHIP_BODY}` };
    const findings = findCopiedSharedSections(corrupted, MAPPING);
    expect(findings).toHaveLength(1);
    expect(findings[0].copied_into_type).toBe('adam_self_adherence_loop');
  });

  it('does not fire on short recurring boilerplate', () => {
    // Headings, rules and "> Why:" lines legitimately repeat across sections. Firing on those would
    // make the guard a permanent false alarm, which is how a check gets demoted to noise and ignored.
    const noisy = cleanSections();
    noisy[2] = { ...noisy[2], content: `## Partnership and comms\n\n---\n> Why: it matters.\n${PARTNERSHIP_LINE}\n` };
    noisy[0] = { ...noisy[0], content: '## Partnership and comms\n\n---\n> Why: it matters.\n' };
    expect(findCopiedSharedSections(noisy, MAPPING)).toEqual([]);
  });

  it('is silent when no section_type is shared by two files', () => {
    const soloMapping = { 'A.md': { sections: ['adam_role_contract'] }, 'B.md': { sections: ['coordinator_role_contract'] } };
    expect(findCopiedSharedSections(cleanSections(), soloMapping)).toEqual([]);
  });
});
