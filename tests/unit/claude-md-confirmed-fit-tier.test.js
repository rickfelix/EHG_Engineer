// The single-read guard has TWO tiers, and the second one must never be able to wedge regeneration.
//
// THE DEFECT THIS CLOSES (SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-C, FR-1/FR-2). The enforcement gate and
// the exit instrument disagreed by the width of the predictor's error band and nothing said so.
// assertSingleReadFit throws above the raw 25,000 cap; singleReadFit only returns fits:true at or below
// cap - margin = 23,300, because the marginal band is symmetric (Math.abs) and inside it the answer is
// fits:null, i.e. CANNOT TELL. So a file could sit on MUST_FIT_SINGLE_READ, pass the throw, and still
// be a file the instrument could not confirm. CLAUDE_SOLOMON.md did precisely that: recorded at 23,175
// tokens by its own SD, drifted to 24,918, CI green throughout.
//
// WHY THE OBVIOUS REPAIR IS A FLEET OUTAGE, which is what most of this file exists to pin. Lowering the
// existing cap to 23,300 throws immediately on TWO files that are already enforced -- CLAUDE_LEAD.md
// and CLAUDE_SOLOMON.md -- and lib/protocol/regen-on-drift.js wraps the generator call in a try with
// only a finally, so the throw propagates out to exit 1 with no PR and the drift left in place. Every
// seat's encode fails. It has happened before over a 73-token overage. It is also NOT self-healing:
// trimming Adam and Solomon still leaves LEAD over. Hence: hard cap untouched, second tier additive
// and opt-in, empty on landing.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  assertSingleReadFit,
  SINGLE_READ_TOKEN_CAP,
  SINGLE_READ_CONFIRMED_FIT_TOKENS,
  MUST_FIT_SINGLE_READ,
  MUST_CONFIRM_SINGLE_READ_FIT,
  HARNESS_BYTES_PER_TOKEN,
} from '../../scripts/modules/claude-md-generator/index.js';
import readCoverage from '../../lib/protocol/contract-read-coverage.cjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bytesFor = (tokens) => Math.round(tokens * HARNESS_BYTES_PER_TOKEN);

// Real committed sizes, read from disk. This is the arm a synthetic-only test cannot provide: a
// fixture frozen at today's 24,247 keeps passing after CLAUDE_LEAD.md grows past the cap and starts
// wedging, which is the very defect FR-4 indicts elsewhere in this SD.
function realFiles(names) {
  return names
    .filter((n) => existsSync(join(REPO_ROOT, n)))
    .map((n) => ({ name: n, bytes: Buffer.byteLength(readFileSync(join(REPO_ROOT, n), 'utf8'), 'utf8') }));
}

describe('the confirmed-fit threshold is derived from the instrument, not a literal', () => {
  it('equals the read-coverage marginal band lower edge, so the two cannot drift apart', () => {
    // TS-8. If someone re-tunes HARNESS_TOKEN_MAX_ERROR_FRACTION, both move together or this fails.
    expect(SINGLE_READ_CONFIRMED_FIT_TOKENS)
      .toBe(readCoverage.SINGLE_READ_TOKEN_CAP - readCoverage.SINGLE_READ_MARGIN_TOKENS);
  });

  it('is strictly below the hard cap — a stricter tier, not a rename of the same number', () => {
    expect(SINGLE_READ_CONFIRMED_FIT_TOKENS).toBeLessThan(SINGLE_READ_TOKEN_CAP);
  });

  // THE BOUNDARY IS ASSERTED BY CALLING THE FUNCTION AT IT, not by restating the arithmetic.
  //
  // The first version of this test asserted `typeof singleReadFit === 'function'` and a literal
  // `25000 - 25000*0.068`. Both pass while saying nothing about the tier's actual comparison: a
  // mutation of the filter from `>=` to `>` survived the entire suite. That is an assertion layer
  // stating what it never measured -- the exact defect class this SD family exists to close, shipped
  // inside this SD's own tests. Caught by the TESTING sub-agent's mutation sweep (M7).
  it('a file EXACTLY AT the threshold is not a confirmed fit — kills the >= to > mutation', () => {
    const atEdge = [{ name: 'CLAUDE_SOLOMON.md', bytes: bytesFor(SINGLE_READ_CONFIRMED_FIT_TOKENS) }];
    expect(() => assertSingleReadFit(atEdge, { mustConfirmFit: ['CLAUDE_SOLOMON.md'], onWarn: () => {} }))
      .toThrow(/SINGLE_READ_FIT_UNCONFIRMED/);
  });

  it('a file ONE TOKEN BELOW the threshold IS a confirmed fit — pins the other side of the boundary', () => {
    // Without this, widening the comparison to catch everything would also pass.
    const belowEdge = [{ name: 'CLAUDE_SOLOMON.md', bytes: bytesFor(SINGLE_READ_CONFIRMED_FIT_TOKENS - 1) }];
    expect(() => assertSingleReadFit(belowEdge, { mustConfirmFit: ['CLAUDE_SOLOMON.md'], onWarn: () => {} }))
      .not.toThrow();
  });

  it('the hard cap is exclusive at exactly the cap — kills the > to >= mutation on tier 1', () => {
    // Pre-existing gap surfaced by the same sweep (M1): neither suite pinned tokens === cap exactly.
    const atCap = [{ name: 'CLAUDE_LEAD.md', bytes: bytesFor(SINGLE_READ_TOKEN_CAP) }];
    expect(() => assertSingleReadFit(atCap, { onWarn: () => {} })).not.toThrow(/SINGLE_READ_CAP_EXCEEDED/);
  });
});

describe('the hard cap behaves EXACTLY as before — the anti-wedge property', () => {
  it('does not throw on the real committed files at their actual sizes today', () => {
    // TS-3, real-file arm. THE load-bearing assertion: whatever else this SD changes, regeneration
    // must keep working for every seat. CLAUDE_LEAD.md is marginal (fits:null) AND enforced, so a
    // careless tightening breaks this immediately.
    const files = realFiles(['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_SOLOMON.md', 'CLAUDE_ADAM.md', 'CLAUDE_CORE.md', 'CLAUDE_EXEC.md']);
    expect(files.length).toBeGreaterThan(0);
    expect(() => assertSingleReadFit(files, { onWarn: () => {} })).not.toThrow();
  });

  it('a flat tighten of the HARD cap to the confirmed-fit threshold would wedge — documented, not shipped', () => {
    // This is the change a future maintainer will reach for. Pinned as a NEGATIVE so the reason it was
    // rejected survives in executable form rather than only in a comment.
    const files = realFiles(['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_SOLOMON.md']);
    expect(() => assertSingleReadFit(files, { cap: SINGLE_READ_CONFIRMED_FIT_TOKENS, onWarn: () => {} }))
      .toThrow(/SINGLE_READ_CAP_EXCEEDED/);
  });

  it('and that wedge is NOT self-healing: trimming Adam and Solomon still throws on LEAD', () => {
    // The tempting rebuttal is "it clears once we trim". Measured: it does not.
    const lead = realFiles(['CLAUDE_LEAD.md']);
    const trimmed = [...lead, { name: 'CLAUDE_ADAM.md', bytes: bytesFor(20000) }, { name: 'CLAUDE_SOLOMON.md', bytes: bytesFor(20000) }];
    expect(() => assertSingleReadFit(trimmed, { cap: SINGLE_READ_CONFIRMED_FIT_TOKENS, onWarn: () => {} }))
      .toThrow(/CLAUDE_LEAD\.md/);
  });

  it('still throws for an enforced file genuinely over the hard cap', () => {
    const over = [{ name: 'CLAUDE_LEAD.md', bytes: bytesFor(SINGLE_READ_TOKEN_CAP + 500) }];
    expect(() => assertSingleReadFit(over, { onWarn: () => {} })).toThrow(/SINGLE_READ_CAP_EXCEEDED/);
  });

  it('still only WARNS for an unenforced file over the hard cap', () => {
    const warns = [];
    const over = [{ name: 'CLAUDE_ADAM.md', bytes: bytesFor(SINGLE_READ_TOKEN_CAP + 5000) }];
    expect(() => assertSingleReadFit(over, { onWarn: (m) => warns.push(m) })).not.toThrow();
    expect(warns.join('\n')).toMatch(/OVER SINGLE-READ CAP/);
  });
});

describe('the confirmed-fit tier is opt-in and empty on landing', () => {
  it('MUST_CONFIRM_SINGLE_READ_FIT is empty until an SD has actually trimmed a file', () => {
    // Same discipline as MUST_FIT_SINGLE_READ: adding CLAUDE_ADAM.md here BEFORE the carve that shrinks
    // it would throw on the next regeneration. Membership is earned by a landed trim, not by intent.
    expect(MUST_CONFIRM_SINGLE_READ_FIT).toEqual([]);
  });

  it('LEAD and PLAN are NOT in the confirmed-fit list — they are warn-only by design', () => {
    expect(MUST_CONFIRM_SINGLE_READ_FIT).not.toContain('CLAUDE_LEAD.md');
    expect(MUST_CONFIRM_SINGLE_READ_FIT).not.toContain('CLAUDE_PLAN.md');
  });

  it('warns (never throws) for a marginal file nobody has opted in', () => {
    const warns = [];
    const marginal = [{ name: 'CLAUDE_LEAD.md', bytes: bytesFor(24247) }];
    expect(() => assertSingleReadFit(marginal, { onWarn: (m) => warns.push(m) })).not.toThrow();
    expect(warns.join('\n')).toMatch(/NOT CONFIRMED TO FIT/);
  });

  it('THROWS a distinct error once a file has opted in and drifts back into the band', () => {
    // The Solomon regression, made catchable: 23,175 -> 24,918 with CI green is what this prevents.
    const drifted = [{ name: 'CLAUDE_SOLOMON.md', bytes: bytesFor(24918) }];
    expect(() => assertSingleReadFit(drifted, { mustConfirmFit: ['CLAUDE_SOLOMON.md'], onWarn: () => {} }))
      .toThrow(/SINGLE_READ_FIT_UNCONFIRMED/);
  });

  it('a confirmed-fit member comfortably under the threshold passes', () => {
    const ok = [{ name: 'CLAUDE_SOLOMON.md', bytes: bytesFor(20000) }];
    expect(() => assertSingleReadFit(ok, { mustConfirmFit: ['CLAUDE_SOLOMON.md'], onWarn: () => {} })).not.toThrow();
  });

  it('the two tiers are independent: an over-cap enforced file still reports SINGLE_READ_CAP_EXCEEDED', () => {
    // Ordering guard. The hard-cap throw must win, so its message never regresses to the new one.
    const both = [{ name: 'CLAUDE_LEAD.md', bytes: bytesFor(SINGLE_READ_TOKEN_CAP + 1000) }];
    expect(() => assertSingleReadFit(both, { mustConfirmFit: ['CLAUDE_LEAD.md'], onWarn: () => {} }))
      .toThrow(/SINGLE_READ_CAP_EXCEEDED/);
  });

  it('MUST_FIT_SINGLE_READ is untouched by this change', () => {
    expect(MUST_FIT_SINGLE_READ).toEqual(['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_SOLOMON.md']);
  });
});
