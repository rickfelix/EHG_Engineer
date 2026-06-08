// SD-LEO-INFRA-CANONICALIZE-TRI-PARTY-001 — guard the tri-party self-assessment rubric + the
// NON-OPTIONAL grade→action→verify loop + the role-model correction in the generated Adam Role
// Contract (CLAUDE_ADAM.md, generated from leo_protocol_sections id=601) and the coordinator's
// parallel rubric+loop in .claude/commands/coordinator.md. Catches a regen from a DB that lost
// the clauses, or a hand-edit that drops them.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADAM_MD = path.resolve(__dirname, '..', 'CLAUDE_ADAM.md');
const COORD_MD = path.resolve(__dirname, '..', '.claude', 'commands', 'coordinator.md');

describe('Adam Role Contract — tri-party rubric + grade→action→verify loop', () => {
  const contract = fs.readFileSync(ADAM_MD, 'utf8');

  it('contains the self-assessment rubric (shared tri-party shape)', () => {
    expect(contract).toMatch(/Self-assessment rubric/i);
    // the shared per-dimension shape
    expect(contract).toMatch(/observable signal/i);
    expect(contract).toMatch(/red-flag/i);
  });

  it('contains the NON-OPTIONAL grade→action→verify loop, prescriptive', () => {
    expect(contract).toMatch(/Grade → action → verify loop/);
    expect(contract).toMatch(/NON-OPTIONAL/);
    // the forcing function — the SD centerpiece
    expect(contract).toMatch(/No below-threshold dimension may close with zero committed action/i);
    // verify-next-cycle + escalate
    expect(contract).toMatch(/prior_action_outcomes/);
    expect(contract).toMatch(/ESCALATE/i);
  });

  it('documents the common score schema fields', () => {
    expect(contract).toMatch(/committed_actions/);
    expect(contract).toMatch(/prior_action_outcomes/);
  });

  it('lands the role-model correction (Adam = coordinator assistant, NOT chief-of-staff)', () => {
    expect(contract).toMatch(/chief-of-staff/i);
    expect(contract).toMatch(/coordinator'?s assistant/i);
    // the value chain
    expect(contract).toMatch(/diagnose\/brainstorm/i);
  });
});

describe('coordinator.md — parallel rubric + loop', () => {
  const coord = fs.readFileSync(COORD_MD, 'utf8');

  it('contains the coordinator self-review rubric section', () => {
    expect(coord).toMatch(/Coordinator self-review rubric/i);
    expect(coord).toMatch(/observable signal/i);
  });

  it('contains the same NON-OPTIONAL grade→action→verify loop', () => {
    expect(coord).toMatch(/Grade → action → verify loop/);
    expect(coord).toMatch(/No below-threshold dimension may close with zero committed action/i);
    expect(coord).toMatch(/committed_actions/);
  });
});
