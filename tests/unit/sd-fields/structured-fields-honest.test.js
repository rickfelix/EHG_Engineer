/**
 * SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001 — FR-2 (generator honesty), FR-2a (consumer
 * tolerance), FR-3 (detection).
 *
 * WHY THE NEGATIVE CONTROL IS SYNTHETIC RATHER THAN THE LIVE ROW. The obvious negative control is
 * "run the detector against this SD's own row, which quotes the filler phrase in an honest
 * criterion". I used exactly that during EXEC and it passed — then noticed the LEAD rewrite had
 * changed the wording, so the live row no longer contains the quoting string at all. The control
 * was passing for the wrong reason: not because exact-equality is correct, but because there was
 * nothing to match. A control whose fixture can drift out from under it is not a control. The
 * fixtures below are pinned in this file.
 *
 * Labels: [REGRESSION] would have failed before this SD; [GUARD-RAIL] pins an invariant the fix
 * must not break.
 */
import { describe, it, expect } from 'vitest';
import {
  UNPOPULATED, LEGACY_FILLER,
  isUnpopulated, isLegacyFiller, classifyEntry, isFieldContentless, VALUE_KEY_BY_FIELD,
} from '../../../lib/sd-fields/unpopulated.js';
import { classifySd } from '../../../scripts/detect-boilerplate-sd-fields.mjs';

// A measure that DESCRIBES the defect. This is the discriminator between exact-equality and
// substring matching, and the whole reason the design note exists.
const QUOTING_MEASURE =
  'Read the row back and confirm zero entries whose measure is exactly "See description for details"';

describe('FR-3 detection — exact-equality, never substring', () => {
  it.each(LEGACY_FILLER)('[REGRESSION] flags exact legacy filler: %s', (filler) => {
    expect(classifyEntry({ criterion: 'x', measure: filler }, 'measure')).toBe('legacy_filler');
    expect(isLegacyFiller(filler)).toBe(true);
  });

  it('[REGRESSION] does NOT flag a measure that QUOTES the filler phrase while describing it', () => {
    // Substring matching fails this test; exact-equality passes it. Measured on the real table:
    // substring returned 1,097 vs exact 1,096, and the single false positive was a row of exactly
    // this shape.
    expect(classifyEntry({ criterion: 'x', measure: QUOTING_MEASURE }, 'measure')).toBe('content');
    expect(isLegacyFiller(QUOTING_MEASURE)).toBe(false);
  });

  it('[GUARD-RAIL] a substring detector WOULD have flagged it — proving the distinction is load-bearing', () => {
    // If this ever fails, the fixture stopped exercising the discriminator and the test above
    // became vacuous. Pinning it here means the control cannot silently stop controlling.
    const naiveSubstringHit = LEGACY_FILLER.some((f) => QUOTING_MEASURE.includes(f));
    expect(naiveSubstringHit).toBe(true);
  });

  it('[REGRESSION] handles BOTH element shapes — strings and objects', () => {
    // Default generators emit arrays of STRINGS; autoEnrichStructure coerces them to OBJECTS, so
    // the same logical field exists in the wild in two shapes.
    expect(classifyEntry('See description for details', 'measure')).toBe('legacy_filler');
    expect(classifyEntry({ criterion: 'x', measure: 'See description for details' }, 'measure')).toBe('legacy_filler');
    expect(classifyEntry('a real measurable thing', 'measure')).toBe('content');
    expect(classifyEntry({ criterion: 'x', measure: 'a real measurable thing' }, 'measure')).toBe('content');
  });

  it('[GUARD-RAIL] recognises the new marker distinctly from legacy filler', () => {
    expect(classifyEntry({ criterion: 'x', measure: UNPOPULATED }, 'measure')).toBe('unpopulated');
    expect(isUnpopulated(UNPOPULATED)).toBe(true);
    expect(isLegacyFiller(UNPOPULATED)).toBe(false);
  });

  it('[GUARD-RAIL] empty and absent are not conflated with hollow', () => {
    expect(classifyEntry(null, 'measure')).toBe('empty');
    expect(classifyEntry({ criterion: 'x' }, 'measure')).toBe('empty');
    expect(classifyEntry({ criterion: 'x', measure: '   ' }, 'measure')).toBe('empty');
    // An EMPTY array is not "contentless" — absent and present-but-hollow are different states.
    expect(isFieldContentless([], 'measure')).toBe(false);
    expect(isFieldContentless([{ criterion: 'x', measure: UNPOPULATED }], 'measure')).toBe(true);
    expect(isFieldContentless([{ criterion: 'x', measure: 'real' }], 'measure')).toBe(false);
  });

  it('[GUARD-RAIL] the field->value-key map covers the fields the producers actually write', () => {
    expect(VALUE_KEY_BY_FIELD.success_criteria).toBe('measure');
    expect(VALUE_KEY_BY_FIELD.key_changes).toBe('impact');
  });
});

describe('FR-3 detector — row-level classification (drives the REAL classifySd)', () => {
  it('[REGRESSION] positive control: a row carrying real generator output IS flagged', () => {
    // These are real emissions, not invented fixtures — the shapes validate-sd-fields.js produced
    // at :44/:119/:131 before this SD.
    const row = {
      sd_key: 'SD-FAKE-001',
      success_criteria: [{ criterion: 'Some title', measure: 'Implementation verified and tests passing' }],
      key_changes: [{ change: 'Some title', impact: 'See SD description for details' }],
    };
    const hits = classifySd(row);
    expect(hits.length).toBe(2);
    expect(hits.every((h) => h.verdict === 'legacy_filler')).toBe(true);
  });

  it('[REGRESSION] negative control: an honest row that QUOTES the phrase is NOT flagged', () => {
    const row = {
      sd_key: 'SD-FAKE-002',
      success_criteria: [{ criterion: 'Honest', measure: QUOTING_MEASURE }],
      key_changes: [{ change: 'Real change', impact: 'Breaks nothing; adds a detector' }],
    };
    expect(classifySd(row)).toEqual([]);
  });

  it('[GUARD-RAIL] a clean row produces no hits — the detector is not a blanket flagger', () => {
    expect(classifySd({ sd_key: 'SD-FAKE-003', success_criteria: [{ criterion: 'c', measure: 'm' }] })).toEqual([]);
    expect(classifySd({ sd_key: 'SD-FAKE-004' })).toEqual([]);
    expect(classifySd({ sd_key: 'SD-FAKE-005', success_criteria: [] })).toEqual([]);
  });

  it('[GUARD-RAIL] the new marker is reported separately from legacy filler', () => {
    const hits = classifySd({
      sd_key: 'SD-FAKE-006',
      success_criteria: [{ criterion: 'c', measure: UNPOPULATED }],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].verdict).toBe('unpopulated');
  });
});

describe('FR-4 — the gate named for this defect can now fire on it', () => {
  const load = () => import('../../../scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js');

  it('[REGRESSION] detects value-side filler that the label-side checks scored as CUSTOM', async () => {
    const { validatePlaceholderContent } = await load();
    // Before FR-4 this row passed clean: `change` and `criterion` are real, and nothing inspected
    // `impact` or `measure` where the filler actually lives.
    const r = await validatePlaceholderContent({
      key_changes: [{ change: 'A real change', impact: 'See SD description for details' }],
      success_criteria: [{ criterion: 'A real criterion', measure: 'Implementation verified and tests passing' }],
    });
    expect(r.value_side_filler).toBe(2);
    expect(r.placeholder_free).toBe(false);
    expect(r.warnings.some((w) => /generator FILLER/.test(w))).toBe(true);
  });

  it('[REGRESSION] negative control — a row DESCRIBING the filler phrase is not flagged', async () => {
    const { validatePlaceholderContent } = await load();
    const r = await validatePlaceholderContent({
      success_criteria: [{ criterion: 'Honest', measure: QUOTING_MEASURE }],
    });
    expect(r.value_side_filler).toBe(0);
    expect(r.placeholder_free).toBe(true);
  });

  it('[GUARD-RAIL] clean rows stay clean — the revived gate is not a blanket flagger', async () => {
    const { validatePlaceholderContent } = await load();
    const r = await validatePlaceholderContent({
      key_changes: [{ change: 'Real', impact: 'Breaks nothing' }],
      success_criteria: [{ criterion: 'Real', measure: 'run the suite' }],
    });
    expect(r.value_side_filler).toBe(0);
    expect(r.placeholder_free).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('[GUARD-RAIL] the explicit marker is reported but NOT penalised as filler', async () => {
    // Penalising honest emptiness would push authors back toward filler — the opposite of the point.
    const { validatePlaceholderContent } = await load();
    const r = await validatePlaceholderContent({
      key_changes: [{ change: 'Real', impact: UNPOPULATED }],
    });
    expect(r.value_side_filler).toBe(0);
    expect(r.placeholder_free).toBe(true);
    expect(r.warnings.some((w) => /explicitly UNPOPULATED/.test(w))).toBe(true);
  });

  it('[GUARD-RAIL] pass stays TRUE — the non-blocking contract is deliberately unchanged', async () => {
    // This pins the RESTRAINT, not an oversight. The real verdict moved to `placeholder_free`;
    // flipping `pass` would be an unverified blast radius on 1,442 existing SDs, and this SD
    // already caught one such change in its own FR-2a. If a future SD flips it, this test SHOULD
    // fail — and that failure is the signal to go enumerate consumers first.
    const { validatePlaceholderContent } = await load();
    const r = await validatePlaceholderContent({
      success_criteria: [{ criterion: 'x', measure: 'See description for details' }],
    });
    expect(r.pass).toBe(true);
    expect(r.placeholder_free).toBe(false);
  });
});

describe('FR-2 — the producers no longer stamp plausible filler', () => {
  it('[REGRESSION] the filler constants are gone from validate-sd-fields.js', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('scripts/modules/validate-sd-fields.js', 'utf8');
    // The constants must no longer be WRITTEN. They may still appear in prose/comments, so this
    // asserts on the assignment shapes the producers used.
    expect(src).not.toMatch(/=\s*'See description for details'/);
    expect(src).not.toMatch(/measure:\s*'Implementation verified and tests passing'/);
    expect(src).not.toMatch(/impact:\s*'See SD description for details'/);
    expect(src).toContain('UNPOPULATED');
  });
});
