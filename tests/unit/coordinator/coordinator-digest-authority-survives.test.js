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
 *
 * A POST-SHIP /heal pass caught a SECOND instance of the exact defect this test file exists
 * to guard against: row 605 ("Coordinator standing responsibilities", ~18.6k chars) exceeded
 * generateCoordinatorDigest's own 3,000-char default (never overridden, unlike Adam's 16,000)
 * and was silently authority-elided -- duties 4-6 and the Adam-governance clause were absent
 * from the digest a context-pressured session actually loads. Fixed by overriding to 20,000
 * (the measured saturation point) in digest-generators.js, mirroring generateAdamDigest's own
 * fix. The 3 probes below (duty 5, duty 6, Adam-governance heading) pin that fix.
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
  ['duty 5 capacity forecasting', /Capacity forecasting \+ predictive belt refill/i],
  ['duty 6 backlog prioritization', /Backlog prioritization \+ dispatch ordering/i],
  ['Adam GOVERNANCE & OVERSIGHT clause', /Adam GOVERNANCE & OVERSIGHT over the Coordinator/i],
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

  it('is a real compression, not a byte-identical copy of the contract', () => {
    // Measured, not a round number (same discipline as generateAdamDigest's own budget comment):
    // row 605 ("Coordinator standing responsibilities") is ~73% of the whole contract's content,
    // and its 6 duties are almost entirely AUTHORITY_MARKERS-bearing ("never"/"must"/"NOT" appear
    // in nearly every duty, not just a minority of prohibition clauses the way Adam's contract is
    // shaped). Probed empirically: keeping duty 5 + duty 6 (dropped at the old 3,000 default, the
    // defect this file exists to catch) requires an 18,000-char budget, and the elided output at
    // that budget is BYTE-IDENTICAL to full saturation (20,000) -- there is no smaller budget that
    // both retains every duty and compresses further. A 0.8 ratio (Adam's own threshold) is
    // unreachable here without silently dropping a duty back out, which is the regression this
    // whole test file guards against. 0.98 still rules out an accidental full-copy bug (e.g. this
    // generator regressing to render the raw section with no elision call at all) while accepting
    // that THIS role's content is denser than Adam's and has less compressible prose to begin with.
    const contract = fs.readFileSync(path.join(ROOT, 'CLAUDE_COORDINATOR.md'), 'utf8');
    expect(digest.length).toBeLessThan(contract.length * 0.98);
  });
});
