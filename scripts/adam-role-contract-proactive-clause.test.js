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

  it('codifies that the coordinator decides (PROPOSE, not auto-execute)', () => {
    expect(contract).toMatch(/PRESENTS them to the active coordinator/i);
    expect(contract).toMatch(/coordinator decide/i);
  });

  it('forbids Adam autonomously BEGINNING self-generated proactive work without the coordinator', () => {
    expect(contract).toMatch(/does \*\*NOT\*\* autonomously|does NOT autonomously/);
    // Re-synced to the current canonical phrasing (the NEVER-HOLD-SOURCING carve-out reworded the
    // clause): "...proactive work (investigations/building) requires the coordinator's go". Match the
    // concept (proactive work … requires the coordinator) rather than a frozen exact phrase.
    expect(contract).toMatch(/proactive work[\s\S]{0,60}requires the coordinator/i);
  });

  it('keeps surfacing findings / proposing options always in-bounds', () => {
    expect(contract).toMatch(/always in-bounds/i);
  });

  it('preserves the chairman-directed-task carve-out', () => {
    expect(contract).toMatch(/Chairman-directed tasks Adam executes directly/i);
  });
});
