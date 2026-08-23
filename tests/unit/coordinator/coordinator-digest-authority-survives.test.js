/**
 * The Coordinator DIGEST must carry the Coordinator's BOUNDARIES, not just its DUTIES.
 * SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 (FR-6) — regression guard, mirroring
 * tests/unit/adam/adam-digest-authority-survives.test.js.
 *
 * THE DEFECT THIS GUARDS AGAINST: generateCoordinatorDigest maps ONLY to
 * coordinator_role_contract, so any content moved OUT of that section_type (to
 * coordinator_manual/coordinator_provenance) would be structurally absent from the digest,
 * not truncated -- the exact class of bug that silently gutted CLAUDE_ADAM_DIGEST.md
 * 18,903 -> 4,727 bytes during SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 ("nothing failed,
 * the file still looked like a contract"). This test pins that the never-do boundaries
 * (FR-5) and the loop-registry governance rule (FR-2) -- both NEW coordinator_role_contract
 * rows, so still IN the digest's mapped section_type -- actually survive formatSectionCompact.
 *
 * SCOPE, STATED HONESTLY: this asserts the digest carries these clauses TODAY. It does not
 * assert every future coordinator_role_contract addition will survive automatically -- that
 * depends on formatSectionCompact's own authority-selection behavior, which this test would
 * catch regressing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIGEST = path.join(ROOT, 'CLAUDE_COORDINATOR_DIGEST.md');

const digest = fs.readFileSync(DIGEST, 'utf8');

const AUTHORITY = [
  ['never apply a production migration yourself', /never apply a production migration/i],
  ['never dispatch an orchestrator PARENT', /never dispatch an orchestrator PARENT/i],
  ['DOC-001 never-create-SDs boundary', /DOC-001/],
  ['loop-registry governance rule', /loop changes land in the registry, never ad hoc/i],
];

describe('CLAUDE_COORDINATOR_DIGEST.md retains binding boundaries (authority selection, FR-6)', () => {
  it.each(AUTHORITY)('carries the %s clause', (_label, probe) => {
    expect(digest).toMatch(probe);
  });

  it('CONTROL: these probes are not trivially satisfied by any markdown file', () => {
    const decoy = '# Coordinator\n\nThe coordinator manages the fleet, dispatches work, and\n'
      + 'watches gauges. See the full contract for details.\n';
    const matched = AUTHORITY.filter(([, probe]) => probe.test(decoy));
    expect(matched.map(([label]) => label)).toEqual([]);
  });

  it('is a real compression, not a copy of the contract', () => {
    const contract = fs.readFileSync(path.join(ROOT, 'CLAUDE_COORDINATOR.md'), 'utf8');
    expect(digest.length).toBeLessThan(contract.length * 0.8);
  });
});
