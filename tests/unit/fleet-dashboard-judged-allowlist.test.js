/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-4 / TS-6 — the accuracy denominator is an allow-list.
 *
 * THE TRAP THIS REMOVES. The denominator was `decision !== 'pending'` while the numerator uses a
 * positive allow-list. Those two are not symmetric: any NEW decision value lands in the denominator
 * automatically and can never reach the numerator, so adding one mechanically drives accuracy down
 * with no change in the world.
 *
 * This SD nearly walked into it. The original design put judgment-expiry on `decision`; simulated on
 * live data that would have moved 566 rows and dropped accuracy 16% -> 6%. The design was reversed
 * (expiry has its own column), which removed the current victim — but not the trap. This pins the
 * trap shut for whoever adds the next value.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'scripts/fleet-dashboard.cjs'), 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('FR-4 — accuracy denominator admits only JUDGED decisions', () => {
  it('is a positive allow-list, not a negation of pending', () => {
    // Asserted on comment-stripped source: the prose above legitimately quotes the old expression,
    // and an assertion that cannot tell documentation from code eventually punishes documentation
    // (a mistake I made twice earlier in this SD).
    expect(code).toMatch(/JUDGED_DECISIONS\s*=\s*\[/);
    expect(code).toMatch(/JUDGED_DECISIONS\.includes\(r\.decision\)/);
    expect(code, 'the negation is back').not.toMatch(/r\.decision\s*!==\s*'pending'/);
  });

  it('the allow-list is exactly the complement of pending under the current CHECK — behaviour-preserving', () => {
    // If this drifts from the CHECK constraint, the change stopped being a refactor and started
    // silently altering a published number.
    const m = code.match(/JUDGED_DECISIONS\s*=\s*\[([^\]]*)\]/);
    expect(m).toBeTruthy();
    const listed = m[1].split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
    // decision CHECK: pending|accepted|rejected|partial|deferred
    expect(listed).toEqual(['accepted', 'deferred', 'partial', 'rejected']);
  });

  it('the numerator remains a positive allow-list too — symmetry is the point', () => {
    // The defect was ASYMMETRY between the two halves. If the numerator ever became a negation, the
    // same class of bug returns from the other side.
    expect(code).toMatch(/shipped_clean/);
    expect(code, 'numerator turned into a negation').not.toMatch(/outcome\s*!==\s*'unknown'/);
  });

  it('judgment-expiry is NOT a decision value anywhere in the dashboard', () => {
    // The reversal, pinned at the consumer. If expiry ever migrates back onto `decision`, the
    // denominator inflation returns even with the allow-list, because the allow-list would then
    // have to choose — and either choice is wrong (in: accuracy drops; out: the row vanishes).
    expect(code).not.toContain('expired_unjudged');
  });
});
