// SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001 / FR-4 — the regression guard.
//
// CLAUDE_LEAD.md and CLAUDE_PLAN.md were shipped back under the Read tool's 25k single-call cap.
// Nothing prevented them creeping back over, and the creep is SILENT: a no-offset Read returns a
// truncated page and reports success, and the protocol read gate derives read-to-EOF from whether
// the CALLER passed a limit rather than from delivered content (feedback 39c3d27d). So the only
// place a regression can be caught loudly is generation time.
//
// These tests exercise the check directly rather than through generate(), which makes 13+ live
// Supabase calls — that unreachability is why the pre-existing budget logic had no test at all.

import { describe, it, expect } from 'vitest';
import {
  assertSingleReadFit,
  SINGLE_READ_TOKEN_CAP,
  HARNESS_BYTES_PER_TOKEN,
  MUST_FIT_SINGLE_READ,
} from '../../scripts/modules/claude-md-generator/index.js';

// Sized in BYTES so the fixtures say what they mean; the check converts.
const bytesFor = (tokens) => Math.ceil(tokens * HARNESS_BYTES_PER_TOKEN);

describe('FR-4: single-read cap enforcement', () => {
  it('THROWS when a must-fit file exceeds the cap', () => {
    expect(() => assertSingleReadFit([
      { name: 'CLAUDE_LEAD.md', bytes: bytesFor(27000) },
    ])).toThrow(/SINGLE_READ_CAP_EXCEEDED/);
  });

  it('names the file and the overage, not just that something failed', () => {
    // A guard that says only "budget exceeded" sends the next person to re-measure by hand.
    try {
      assertSingleReadFit([{ name: 'CLAUDE_PLAN.md', bytes: bytesFor(30000) }]);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toMatch(/CLAUDE_PLAN\.md/);
      expect(e.message).toMatch(/5000 over 25000/);
      expect(e.message).toMatch(/truncates and reports success/);
    }
  });

  it('CONTROL: does NOT throw when must-fit files are under the cap', () => {
    // Without this the throw-tests would also pass against a function that threw unconditionally.
    const over = assertSingleReadFit([
      { name: 'CLAUDE_LEAD.md', bytes: bytesFor(24000) },
      { name: 'CLAUDE_PLAN.md', bytes: bytesFor(22800) },
    ]);
    expect(over).toEqual([]);
  });

  it('WARNS but does NOT throw for an over-cap file no SD owns yet', () => {
    // CLAUDE_CORE.md is ~39,750 tokens TODAY and its fix is a different SD. Throwing here would
    // fail the first regeneration after this ships and block the entire family for a defect nobody
    // has been given the chance to fix. The distinction between guard and blockade is the point.
    const warnings = [];
    const over = assertSingleReadFit(
      [{ name: 'CLAUDE_CORE.md', bytes: bytesFor(39750) }],
      { onWarn: (m) => warnings.push(m) },
    );
    expect(over).toHaveLength(1);
    expect(over[0].enforced).toBe(false);
    expect(warnings.join('\n')).toMatch(/CLAUDE_CORE\.md/);
    expect(warnings.join('\n')).toMatch(/truncates SILENTLY/);
  });

  it('enforces exactly the files a shipped SD has made fit', () => {
    // If this list grows without an SD behind it, the guard becomes a blockade. Pinned so that
    // adding a name is a deliberate act with a test diff attached.
    expect(MUST_FIT_SINGLE_READ).toEqual(['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md']);
  });

  it('uses the MEASURED bytes-per-token, not a borrowed or estimated one', () => {
    // Both tempting shortcuts are wrong here and in OPPOSITE directions, so a wrong constant does
    // not merely blur the answer, it flips it:
    //   chars/4 (estimateTokens) runs ~40% LOW  -> the guard never fires, silently useless.
    //   contractTokenCount runs 43-61% HIGH     -> the guard fires forever, even on a fixed file.
    // 2.4177 is from the harness's own truncation notice on this file family.
    expect(HARNESS_BYTES_PER_TOKEN).toBeCloseTo(2.4177, 4);
    expect(SINGLE_READ_TOKEN_CAP).toBe(25000);

    const bytes = 58425; // CLAUDE_LEAD.md as shipped
    expect(Math.round(bytes / HARNESS_BYTES_PER_TOKEN)).toBeLessThan(SINGLE_READ_TOKEN_CAP);
    expect(Math.round(bytes / 4)).toBeLessThan(SINGLE_READ_TOKEN_CAP); // chars/4 agrees here...
    // ...but chars/4 also passes the file that ACTUALLY truncated, which is the whole problem:
    expect(Math.round(92184 / 4)).toBeLessThan(SINGLE_READ_TOKEN_CAP);
    expect(Math.round(92184 / HARNESS_BYTES_PER_TOKEN)).toBeGreaterThan(SINGLE_READ_TOKEN_CAP);
  });

  it('tolerates missing or zero byte counts rather than crashing generation', () => {
    expect(() => assertSingleReadFit([{ name: 'X.md' }, { name: 'Y.md', bytes: 0 }])).not.toThrow();
    expect(() => assertSingleReadFit([])).not.toThrow();
    expect(() => assertSingleReadFit(undefined)).not.toThrow();
  });
});
