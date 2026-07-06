// Unit tests for the FR-3 mechanical transform (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001).
// Proves the transform is a VERBATIM wrap of the audit rubric text, not a semantic rewrite
// (TR-3 / TS-5) -- and that it excludes non-build prompts (e.g. Prompt 1 creation, Prompt 5
// Feedback page) which are not part of the BUILD_PROMPT_IDS allowlist.
import { describe, it, expect } from 'vitest';
import { buildDesignInstructionBlock, BUILD_PROMPT_IDS } from '../../../../lib/eva/bridge/design-input-instructions.js';

const PROMPTS = [
  { id: 1, label: 'Prompt 1', summary: 'Landing Page Creation', text: 'Create the landing page...' },
  { id: 2, label: 'Prompt 2', summary: 'Text & typography audit', text: 'You are a senior typography reviewer. Evaluate...' },
  { id: 3, label: 'Prompt 3', summary: 'Layout audit', text: 'You are a senior layout reviewer. Evaluate the grid...' },
  { id: 4, label: 'Prompt 4', summary: 'Build-quality audit', text: 'You are a senior QA reviewer. Verify build quality...' },
  { id: 5, label: 'Prompt 5', summary: 'Feedback page', text: 'Every venture ships a Feedback page...' },
];

describe('buildDesignInstructionBlock — mechanical, verbatim wrap (TR-3)', () => {
  it('BUILD_PROMPT_IDS is exactly [2, 3, 4]', () => {
    expect(BUILD_PROMPT_IDS).toEqual([2, 3, 4]);
  });

  it('TS-5: includes the VERBATIM text of Prompts 2/3/4', () => {
    const block = buildDesignInstructionBlock(PROMPTS);
    expect(block).toContain('You are a senior typography reviewer. Evaluate...');
    expect(block).toContain('You are a senior layout reviewer. Evaluate the grid...');
    expect(block).toContain('You are a senior QA reviewer. Verify build quality...');
  });

  it('excludes Prompt 1 (creation) and Prompt 5 (Feedback page) -- not part of the audit set', () => {
    const block = buildDesignInstructionBlock(PROMPTS);
    expect(block).not.toContain('Create the landing page...');
    expect(block).not.toContain('Every venture ships a Feedback page...');
  });

  it('frames each prompt as a pre-finish verification item, not a rewritten directive', () => {
    const block = buildDesignInstructionBlock(PROMPTS);
    expect(block).toMatch(/Before finishing, verify your output against/);
  });

  it('returns empty string for an empty/missing prompt list (no throw)', () => {
    expect(buildDesignInstructionBlock([])).toBe('');
    expect(buildDesignInstructionBlock(null)).toBe('');
    expect(buildDesignInstructionBlock(undefined)).toBe('');
  });

  it('round-trips deterministically -- same input produces the same output (no LLM/random)', () => {
    expect(buildDesignInstructionBlock(PROMPTS)).toBe(buildDesignInstructionBlock(PROMPTS));
  });
});

// TR-4/TS-6 (SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001, VALIDATION's highest-priority risk): FR-4
// must extend the shipped design-fidelity-observe.js harness, never build a second gate
// mechanism. Static source check: exactly ONE actual call site to recordWitnessEvent(...) exists
// within lib/eva/bridge/ (TESTING sub-agent independently confirmed only one gate_witness_events
// table writer exists repo-wide -- lib/eva/record-witness-event.js -- with two callers funneling
// into it, this file plus the already-shipped observe-gate-witness.js) -- the unit-test behavioral
// proof lives in design-fidelity-observe.test.js ("reuses the SAME witness recorder"); this is the
// structural, source-level backstop.
describe('TR-4 regression: single write path to gate_witness_events (no parallel gate)', () => {
  it('exactly one recordWitnessEvent(...) call site exists in lib/eva/bridge/', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const bridgeDir = path.resolve(__dirname, '../../../../lib/eva/bridge');
    const files = fs.readdirSync(bridgeDir).filter((f) => f.endsWith('.js'));
    let callSites = 0;
    for (const f of files) {
      const src = fs.readFileSync(path.join(bridgeDir, f), 'utf8');
      const matches = src.match(/(?<!\.)\brecordWitnessEvent\(/g); // actual calls, not destructuring/JSDoc
      if (matches) callSites += matches.length;
    }
    expect(callSites).toBe(1);
  });
});
