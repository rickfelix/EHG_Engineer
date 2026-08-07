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
    // Was /Self-assessment rubric/ as an adjacent pair. SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001
    // retitled the section "6. Self-assessment - rubric, loop, adherence", so the two words are no
    // longer adjacent while the rubric itself is fully intact. Match the section, not the wording.
    expect(contract).toMatch(/Self-assessment[\s\S]{0,30}rubric/i);
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

  it('lands the CURRENT role model (governance & oversight + the Adam/EVA persona split)', () => {
    // *** THIS ASSERTION WAS SUPERSEDED BY A LATER CHAIRMAN DIRECTIVE, NOT BY THIS SD. ***
    // It used to require /coordinator'?s assistant/ — the 2026-06-08 role-model correction. The
    // chairman RETIRED that framing himself: 2026-07-16 "you need to provide governance and
    // oversight over the coordinator", reaffirmed 2026-07-17 with the assistant wording explicitly
    // removed ("You can help, but you are in governance and oversight"). Continuing to assert it
    // would force the contract to restate a framing its own author revoked — a guard holding the
    // line against the person it answers to.
    //
    // The role model is still guarded, against what governs NOW:
    expect(contract).toMatch(/governance and oversight/i);          // the 2026-07-16/17 directive
    expect(contract).toMatch(/HARNESS-side/i);                      // Adam's half of the split
    expect(contract).toMatch(/chief-of-staff/i);                    // EVA's half (venture-side)
    // And the retired framing must STAY retired — re-adding it would reintroduce the contradiction
    // the chairman removed, so this is a negative assertion rather than a deletion of coverage.
    expect(contract).not.toMatch(/Adam = the coordinator'?s assistant/i);
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
