/**
 * SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-001 (FR-5 / activation test).
 *
 * The coordinator role contract is generated from a governed leo_protocol_sections row
 * (section_type=coordinator_role_contract) into CLAUDE_COORDINATOR.md — mirroring the Adam pattern.
 * This pure test asserts the wiring: the section-file-mapping routes CLAUDE_COORDINATOR.md to the
 * coordinator_role_contract section, and generateCoordinator() composes ONLY that section into a file
 * with the canonical header + the do-not-hand-edit footer citing the section_type. No DB / no IO.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCoordinator } from '../../scripts/modules/claude-md-generator/file-generators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPING = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/section-file-mapping.json'), 'utf8'));
const DIGEST_MAPPING = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../scripts/section-file-mapping-digest.json'), 'utf8'));

describe('section-file-mapping — CLAUDE_COORDINATOR.md routes to the governed section', () => {
  it('maps CLAUDE_COORDINATOR.md -> [coordinator_role_contract]', () => {
    expect(MAPPING['CLAUDE_COORDINATOR.md']).toBeTruthy();
    expect(MAPPING['CLAUDE_COORDINATOR.md'].sections).toEqual(['coordinator_role_contract']);
  });
  it('maps CLAUDE_COORDINATOR_DIGEST.md -> [coordinator_role_contract]', () => {
    expect(DIGEST_MAPPING['CLAUDE_COORDINATOR_DIGEST.md']).toBeTruthy();
    expect(DIGEST_MAPPING['CLAUDE_COORDINATOR_DIGEST.md'].sections).toEqual(['coordinator_role_contract']);
  });
});

describe('generateCoordinator — composes only the mapped section, with header + DB-source footer', () => {
  const CHARTER_BODY = 'CHARTER_BODY_MARKER — the six standing SRE duties, conveyor-belt loading, the quiet-tick protocol.';
  const ADAM_BODY = 'ADAM_BODY_MARKER — must NOT leak into the coordinator file.';
  const mockData = {
    protocol: {
      version: '4.4.1',
      sections: [
        { section_type: 'coordinator_role_contract', title: 'Coordinator Role Contract — Fleet Supervisor / SRE Session', content: CHARTER_BODY },
        { section_type: 'adam_role_contract', title: 'Adam Role Contract', content: ADAM_BODY },
      ],
    },
  };

  it('emits the canonical header, the charter body, and the do-not-hand-edit footer citing section_type', () => {
    const out = generateCoordinator(mockData, MAPPING);
    expect(out).toContain('# CLAUDE_COORDINATOR.md - Coordinator Role Contract');
    expect(out).toContain(CHARTER_BODY);
    expect(out).toContain('section_type=coordinator_role_contract');
    expect(out).toContain('Do not hand-edit');
  });

  it('pulls ONLY the coordinator_role_contract section (does not leak other sections)', () => {
    const out = generateCoordinator(mockData, MAPPING);
    expect(out).not.toContain(ADAM_BODY);
  });

  it('emits nothing-but-scaffolding when the section is absent (mapping-driven, not hard-coded text)', () => {
    const empty = { protocol: { version: '4.4.1', sections: [{ section_type: 'adam_role_contract', title: 'Adam', content: ADAM_BODY }] } };
    const out = generateCoordinator(empty, MAPPING);
    expect(out).toContain('# CLAUDE_COORDINATOR.md - Coordinator Role Contract'); // header always present
    expect(out).not.toContain(CHARTER_BODY); // no coordinator section -> no charter body
    expect(out).not.toContain(ADAM_BODY);    // never leaks the unmapped section
  });
});
