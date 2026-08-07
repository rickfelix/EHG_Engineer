/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-5 (TS-7).
 *
 * renderContractParity checked that a LOOP EXISTS for each contract-named duty and had
 * no concept of what that loop WRITES. That is why it reported all-duties-present in
 * the very same run that surfaced a live category mismatch: a presence check cannot see
 * a value disagreement.
 *
 * PROVEN BY REINTRODUCTION, not by assertion. A checker whose defect class is "reports
 * green while wrong" can only be shown fixed by feeding it a real instance of wrongness
 * and watching it correctly redden — which is exactly what the original false
 * all-duties-present report failed to do.
 */

import { describe, it, expect } from 'vitest';
import { parseContractCategoryClaims, categoryParityMismatches, stripComments } from '../../scripts/solomon-startup-check.mjs';

// Shaped like the real contract passages (leo_protocol_sections id=611 L225 / L27).
const CONTRACT = `
**SOLOMON SELF-ADHERENCE DUTY (durable)**: a recurring tick (\`solomon-self-adherence-review.mjs\`, slow cadence) scores the dimensions. On any below-threshold dimension the loop **emits a feedback flag (\`category='solomon_adherence_drift'\`) for Adam to source**.
**Rubric self-score writer (durable)**. \`solomon-self-assessment-writer.cjs\` persists ONE graded feedback row per cycle (\`category='solomon_self_assessment'\`).
Some prose with no script and no category at all.
`;

describe('the contract\'s category claims are extracted', () => {
  it('pairs each script with the category the contract mandates', () => {
    const { claims } = parseContractCategoryClaims(CONTRACT);
    expect(claims).toEqual([
      { script: 'solomon-self-adherence-review.mjs', category: 'solomon_adherence_drift' },
      { script: 'solomon-self-assessment-writer.cjs', category: 'solomon_self_assessment' },
    ]);
  });

  it('abstains rather than guesses when a line is ambiguous', () => {
    // Two categories on one line cannot be paired to one script with confidence.
    // A mis-paired claim would produce a confident FALSE mismatch — worse than abstaining.
    const messy = "`a.mjs` writes (`category='one'`) and also (`category='two'`)";
    const { claims, ambiguous } = parseContractCategoryClaims(messy);
    expect(claims).toEqual([]);
    expect(ambiguous).toHaveLength(1);
  });
});

describe('TS-7: parity catches a category disagreement', () => {
  const goodScripts = {
    'solomon-self-adherence-review.mjs': "const SELF_ADHERENCE_CATEGORY = 'solomon_adherence_drift';",
    'solomon-self-assessment-writer.cjs': "const CATEGORY = 'solomon_self_assessment';",
  };

  it('PASSES when every script writes what the contract mandates', () => {
    const r = categoryParityMismatches(CONTRACT, (s) => goodScripts[s] ?? null);
    expect(r.mismatches).toEqual([]);
    expect(r.checked).toBe(2);
  });

  it('FAILS and names BOTH values when the mismatch is reintroduced', () => {
    // This is the exact pre-fix state: the loop wrote the drifted spelling while the
    // contract mandated the other. The old checker reported parity holding here.
    const drifted = {
      ...goodScripts,
      'solomon-self-adherence-review.mjs': "const SELF_ADHERENCE_CATEGORY = 'solomon_self_adherence';",
    };
    const r = categoryParityMismatches(CONTRACT, (s) => drifted[s] ?? null);
    expect(r.mismatches).toHaveLength(1);
    const m = r.mismatches[0];
    expect(m.script).toBe('solomon-self-adherence-review.mjs');
    expect(m.expected).toBe('solomon_adherence_drift');   // what the contract says
    expect(m.found).toContain('solomon_self_adherence');  // what the code actually does
  });

  it('an unreadable script is reported unverified, NEVER as passing', () => {
    // An unverifiable claim is not a satisfied one — the failure mode this whole SD
    // is about is absence being mistaken for compliance.
    const r = categoryParityMismatches(CONTRACT, () => null);
    expect(r.checked).toBe(0);
    expect(r.mismatches).toEqual([]);        // nothing was compared...
    expect(r.unreadable).toHaveLength(2);    // ...and that is stated, not swallowed
  });
});

describe('documentation cannot vote on whether the code it documents is correct', () => {
  // TWO LIVE FAILURES produced this. First a substring test passed on any MENTION of
  // the category, so a comment satisfied it. Then a tightened `CATEGORY = '...'` match
  // still passed, because it is case-insensitive and a comment reading
  // "mandates category='solomon_adherence_drift'" parsed as an assignment. Both times
  // the checker reported parity holding on a genuinely drifted file — the exact
  // reports-green-while-wrong class this FR exists to remove.
  const DRIFTED_BUT_WELL_DOCUMENTED = `
    // The contract mandates category='solomon_adherence_drift' and this loop was
    // renamed to match it. See SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001.
    const SELF_ADHERENCE_CATEGORY = 'solomon_self_adherence';
  `;

  it('strips comments before reading declarations', () => {
    const code = stripComments(DRIFTED_BUT_WELL_DOCUMENTED);
    expect(code).not.toMatch(/mandates category=/);
    expect(code).toMatch(/SELF_ADHERENCE_CATEGORY = 'solomon_self_adherence'/);
  });

  it('flags a drifted file even when its comments name the correct category', () => {
    const r = categoryParityMismatches(CONTRACT, (s) =>
      s === 'solomon-self-adherence-review.mjs' ? DRIFTED_BUT_WELL_DOCUMENTED : "const CATEGORY = 'solomon_self_assessment';");
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0].found).toEqual(['solomon_self_adherence']);  // the DECLARATION, not the prose
  });

  it('a file with no CATEGORY declaration is unverified, not passing', () => {
    const r = categoryParityMismatches(CONTRACT, () => '// only a comment about category=\'solomon_adherence_drift\'');
    expect(r.checked).toBe(0);
    expect(r.mismatches).toEqual([]);
    expect(r.unreadable.join(' ')).toMatch(/no CATEGORY assignment/);
  });
});

describe('the real contract and the real scripts agree after FR-4', () => {
  it('no mismatch against the live repo', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, '..', '..');
    let md;
    try { md = readFileSync(join(root, 'CLAUDE_SOLOMON.md'), 'utf8'); } catch { return; } // doc optional
    const r = categoryParityMismatches(md, (b) => {
      try { return readFileSync(join(root, 'scripts', b), 'utf8'); } catch { return null; }
    });
    expect(r.mismatches).toEqual([]);
  });
});
