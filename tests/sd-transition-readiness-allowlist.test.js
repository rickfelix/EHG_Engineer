// Static-pin regression test for L:sdTransitionReadiness validator allowlist
// (FR-4 of SD-FDBK-ENH-PAT-LEO-INFRA-001)
//
// Pins the consumer end of the trigger/validator pair against drift.
// If a future SD removes 'in_progress' from the allowlist, this test fails CI
// loudly and prevents PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 from
// re-emerging in a 22nd-witness form.
//
// No DB connection needed (fs.readFileSync only). Always runs in CI.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const VALIDATOR_PATH = resolve(
  process.cwd(),
  'scripts/modules/handoff/validation/validator-registry/gates/additional-validators.js'
);

describe('FR-4: L:sdTransitionReadiness validator allowlist static-pin', () => {
  const src = readFileSync(VALIDATOR_PATH, 'utf8');

  it('validator file exists and is non-empty', () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it('contains sdTransitionReadiness validator registration', () => {
    expect(src).toMatch(/registry\.register\(\s*['"]sdTransitionReadiness['"]/);
  });

  it('validStatuses allowlist literal includes in_progress (consumer end pin)', () => {
    const m = src.match(/validStatuses\s*=\s*\[([^\]]+)\]/);
    expect(m, 'validStatuses array literal not found').not.toBeNull();
    const allowlist = m[1];
    expect(allowlist, "validStatuses must include 'in_progress' so the trigger output is accepted").toMatch(/['"]in_progress['"]/);
  });

  it('validStatuses allowlist literal includes approved (forward-compat anchor)', () => {
    const m = src.match(/validStatuses\s*=\s*\[([^\]]+)\]/);
    const allowlist = m[1];
    expect(allowlist, "validStatuses must include 'approved' (forward-compat hook for richer post-LEAD-eval semantics)").toMatch(/['"]approved['"]/);
  });

  it('validStatuses allowlist literal includes draft and planning (sentinel)', () => {
    const m = src.match(/validStatuses\s*=\s*\[([^\]]+)\]/);
    const allowlist = m[1];
    expect(allowlist).toMatch(/['"]draft['"]/);
    expect(allowlist).toMatch(/['"]planning['"]/);
  });

  it("validStatuses allowlist excludes 'active' (writer/consumer asymmetry would re-emerge if added)", () => {
    // 'active' is in DB CHECK but NOT in validator allowlist by design.
    // If a future SD adds 'active' to the allowlist, the trigger could revert
    // to writing 'active' and we'd lose the static-pin guard.
    const m = src.match(/validStatuses\s*=\s*\[([^\]]+)\]/);
    const allowlist = m[1];
    expect(allowlist, "validStatuses must NOT include 'active' (would re-introduce the writer/consumer asymmetry vector)").not.toMatch(/['"]active['"]/);
  });

  it('validStatuses literal has exactly 4 members (sentinel against accidental expansion)', () => {
    const m = src.match(/validStatuses\s*=\s*\[([^\]]+)\]/);
    const members = m[1]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
    // Members at time of SD-FDBK-ENH-PAT-LEO-INFRA-001: ['approved','planning','in_progress','draft']
    expect(members.sort()).toEqual(['approved', 'draft', 'in_progress', 'planning']);
  });
});
