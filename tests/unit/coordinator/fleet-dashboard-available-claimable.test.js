/**
 * QF-20260704-051 — the AVAILABLE FOR CLAIM headline previously counted SDs from a naive
 * status-only query, diverging from coordinator-backlog-rank.mjs's canonical claimable-leaf
 * predicate (a live specimen showed dashboard=15 vs true claimable=0). loadData() now sources
 * unclaimedStandalone from computeClaimableLeaves() instead, so its length is the TRUE
 * claimable depth. printAvailable no longer relies on a query-level LIMIT to keep the display
 * readable — these tests pin the display-cap behavior added in its place.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printAvailable } = require('../../../scripts/fleet-dashboard.cjs');

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

const sd = (i) => ({ sd_key: `SD-LEO-INFRA-ITEM-${i}`, title: `Item ${i}`, priority: 'medium' });

describe('printAvailable — headline count vs display cap (QF-20260704-051)', () => {
  it('headline count equals the TRUE unclaimedStandalone depth even beyond the display cap', () => {
    const unclaimedStandalone = Array.from({ length: 20 }, (_, i) => sd(i));
    printAvailable({ unclaimedChildren: [], unclaimedStandalone });
    expect(output()).toContain('AVAILABLE FOR CLAIM (20)');
  });

  it('prints only the first 15 rows and an "…and N more" summary when the true depth exceeds the cap', () => {
    const unclaimedStandalone = Array.from({ length: 20 }, (_, i) => sd(i));
    printAvailable({ unclaimedChildren: [], unclaimedStandalone });
    const out = output();
    expect(out).toContain('Item 14'); // 15th row (0-indexed 14) still shown
    expect(out).not.toContain('Item 15'); // 16th row is beyond the cap
    expect(out).toContain('… and 5 more');
  });

  it('prints every row with no "more" summary when depth is at or under the cap', () => {
    const unclaimedStandalone = Array.from({ length: 3 }, (_, i) => sd(i));
    printAvailable({ unclaimedChildren: [], unclaimedStandalone });
    const out = output();
    expect(out).toContain('Item 2');
    expect(out).not.toContain('more');
  });

  it('zero claimable renders the empty-queue message, not a stale cached count', () => {
    printAvailable({ unclaimedChildren: [], unclaimedStandalone: [] });
    const out = output();
    expect(out).toContain('AVAILABLE FOR CLAIM (0)');
    expect(out).toContain('all SDs claimed or completed');
  });
});
