// SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001 — verify the chairman's "proactivity is PROPOSE, not
// auto-execute" clause is present in the generated Adam Role Contract (CLAUDE_ADAM.md), which is
// generated from leo_protocol_sections id=601 (section_type=adam_role_contract). Guards against a
// regen from a DB that lost the clause, or a hand-edit that drops it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADAM_MD = path.resolve(__dirname, '..', 'CLAUDE_ADAM.md');

describe('Adam Role Contract — proactivity-is-propose clause', () => {
  const contract = fs.readFileSync(ADAM_MD, 'utf8');

  it('contains the canonical clause heading', () => {
    expect(contract).toContain('Proactivity is PROPOSE, not auto-execute');
  });

  // RE-SYNCED A THIRD TIME, by SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001, which rewrote the contract
  // from 42,190 tokens to ~11,400 so it fits in one Read. That is a REWRITE, not an edit: no clause
  // survives verbatim, so every assertion below now matches the OBLIGATION rather than the prose.
  //
  // THE COST IS WORTH NAMING. This file has now been re-synced on three separate legitimate contract
  // changes without ever catching a real regression — a source-pin on generated prose fails on every
  // rewording and passes on every reworded-but-gutted clause, so it is loudest exactly when it is
  // least informative. Assert the rule, never the sentence.

  it('codifies that the coordinator decides (PROPOSE, not auto-execute)', () => {
    // Was: /PRESENTS them to the active coordinator/. The shortening dropped "to the active
    // coordinator" as redundant with the clause that immediately follows it.
    expect(contract).toMatch(/PRESENTS them/i);
    expect(contract).toMatch(/lets the coordinator decide|coordinator decide/i);
  });

  it('forbids Adam autonomously BEGINNING self-generated proactive work without the coordinator', () => {
    expect(contract).toMatch(/does \*\*NOT\*\* autonomously|does NOT autonomously/);
    // Was: /proactive work … requires the coordinator/. Now stated in the negative — "without the
    // coordinator's go" — so match either polarity.
    expect(contract).toMatch(/proactive work[\s\S]{0,80}(requires the coordinator|without the coordinator)/i);
  });

  it('keeps surfacing findings / proposing options in-bounds', () => {
    // Was: /always in-bounds/, an AFFIRMATIVE list of what is permitted. The rewrite replaced it with
    // the EXHAUSTIVE negative — "Only claiming/worktreeing/driving/dispatching requires a go" — which
    // is logically STRONGER: an affirmative example list leaves everything unlisted ambiguous, while a
    // closed list of what needs permission makes everything else in-bounds by construction.
    expect(contract).toMatch(/always in-bounds|only[\s\S]{0,60}requires a go/i);
    // Sourcing specifically must stay exempt — that carve-out is what NEVER-HOLD-SOURCING rests on.
    expect(contract).toMatch(/Sourcing\/filing DRAFT SDs is EXEMPT|sourcing[\s\S]{0,40}EXEMPT/i);
  });

  it('preserves the chairman-directed-task carve-out', () => {
    expect(contract).toMatch(/Chairman-directed tasks Adam executes directly/i);
  });
});
