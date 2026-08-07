/**
 * MANUAL companion — governance-gap guard.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 — FR-1 / FR-2.
 *
 * The companion holds the HOW (field shapes, step sequences). It holds no obligations of its own.
 * Nothing currently LOADS this file, so a rule that exists only here is not governed at all — it
 * has been demoted from contract to advisory with a forwarding address nobody follows.
 *
 * That is not hypothetical: extracting row 604 wholesale would have demoted four rules, including
 * the chairman-directed DECOMPOSE-WEAKEST-LAYER classify-before-sourcing rule, which read as
 * "missing from the contract" precisely because it lived in the how-to row.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'docs/protocol/adam-contract-review-2026-07-29');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');

const MANUAL = read('CLAUDE_ADAM_MANUAL.DRAFT-2026-07-29.md');
const CONTRACT = read('CLAUDE_ADAM.CORRECTED-2026-07-29.md');

// Distinctive markers for each rule that lives in the manual's prose. Deliberately TIGHT: a loose
// probe (a bare /classify/) matched an unrelated "additive classifier" and returned PRESENT,
// nearly burying a real governance gap.
const RULES_IN_MANUAL = [
  ['DECOMPOSE-WEAKEST-LAYER', /weakest.layer/i],
  ['no hand-insert into strategic_directives_v2', /hand-insert/i],
  ['ENF-SD-CREATE-SKILL blocks direct calls', /ENF-SD-CREATE-SKILL/],
];

describe('CLAUDE_ADAM_MANUAL companion', () => {
  it('declares that the contract governs any rule it restates', () => {
    expect(MANUAL).toMatch(/PRECEDENCE/);
    expect(MANUAL).toMatch(/GOVERNS/);
    expect(MANUAL).toMatch(/Every OBLIGATION lives in `CLAUDE_ADAM\.md`/);
  });

  it('GOVERNANCE GAP: every rule restated here is also in the contract', () => {
    // The load-bearing assertion. A rule here but not there is governed by nothing.
    const orphaned = RULES_IN_MANUAL.filter(([, probe]) => probe.test(MANUAL) && !probe.test(CONTRACT));
    expect(orphaned.map(([name]) => name)).toEqual([]);
  });

  it('CONTROL: the gap check can actually fail', () => {
    // Without this, the assertion above passes trivially when the probes match nothing at all —
    // "no orphaned rules" and "no rules examined" are the same empty array.
    const present = RULES_IN_MANUAL.filter(([, probe]) => probe.test(MANUAL));
    expect(present.length).toBe(RULES_IN_MANUAL.length);
  });

  it('is the HOW, and stays readable in one call', () => {
    expect(MANUAL).toMatch(/Adam Operating Manual/);
    expect(MANUAL.length / 2.507).toBeLessThan(25000);
  });
});
