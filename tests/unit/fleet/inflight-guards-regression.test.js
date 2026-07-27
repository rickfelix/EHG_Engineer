/**
 * Regression pins for the four guards added to satisfy review — SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B.
 *
 * TESTING (aacc101d) mutated each of these and the whole suite stayed green at its 3-failure
 * floor, i.e. all four worked but nothing pinned them. It quoted this SD's own thesis back:
 * "a guard that silently never fires is worse than no guard". Guards added to CLOSE a review
 * deserve the same standard as the feature they protect, otherwise the next refactor removes them
 * and every existing test still passes.
 *
 * Each test below is written so the named mutation makes it FAIL:
 *   1. remove the VITEST no-network guard        -> "skips probing under VITEST"
 *   2. remove the empty-list short-circuit        -> "empty list never probes"
 *   3. delete the forApp cross-repo guard         -> "cross-repo rows are not withheld"
 *   4. collapse per-app grouping to a constant    -> "one probe PER target app"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  filterOutInFlight, collectInflightSnapshot, _resetSnapshotCache,
} = require_('../../../lib/fleet/inflight-git-state.cjs');
const {
  classifyDispatchIneligibility, classifyAllDispatchIneligibility,
} = require_('../../../lib/fleet/claim-eligibility.cjs');
const { withheldFilteredQfs } = require_('../../../lib/checkin/steps/critical-qf-jump.cjs');

const okGh = (heads) => () => ({ stdout: JSON.stringify(heads.map((h) => ({ headRefName: h }))), stderr: '', code: 0, spawnError: null });
const okGit = (b) => () => ({ stdout: b.map((x) => `abc\trefs/heads/${x}`).join('\n'), stderr: '', code: 0, spawnError: null });

beforeEach(() => _resetSnapshotCache());

describe('GUARD 1 — no live network from the unit tier', () => {
  it('skips probing entirely when no seam is injected (VITEST is set here)', () => {
    // If this guard is removed, filterOutInFlight falls through to the DEFAULT runners and makes
    // a real gh/git call — which is how a pre-existing unit test silently acquired an 869ms
    // dependency on live GitHub state.
    expect(process.env.VITEST).toBeTruthy(); // pin the premise, don't assume it
    const items = [{ id: 'QF-20260726-425' }];
    const t0 = Date.now();
    const { kept, withheld, snapshotStatus } = filterOutInFlight(items, (i) => i.id, { repo: 'o/r' });
    const elapsed = Date.now() - t0;
    expect(snapshotStatus).toBe('UNAVAILABLE'); // did not probe
    expect(withheld).toHaveLength(0);           // and therefore withheld nothing (fail-open)
    expect(kept).toHaveLength(1);
    expect(elapsed).toBeLessThan(150);          // a real gh call measured 394-1042ms
  });

  it('an injected seam still probes — the guard is not a blanket disable', () => {
    const runGh = vi.fn(okGh(['qf/QF-20260726-425']));
    const { withheld } = filterOutInFlight(
      [{ id: 'QF-20260726-425' }], (i) => i.id, { repo: 'o/r', runGh, runGit: okGit([]) },
    );
    expect(runGh).toHaveBeenCalledTimes(1);
    expect(withheld).toHaveLength(1);
  });
});

describe('GUARD 2 — an empty candidate list never probes', () => {
  it('short-circuits before touching the runners', () => {
    // filterOutInFlight probed BEFORE iterating, so an empty list still cost a round trip.
    const runGh = vi.fn(okGh([]));
    const runGit = vi.fn(okGit([]));
    const r = filterOutInFlight([], (i) => i.id, { repo: 'o/r', runGh, runGit });
    expect(runGh).not.toHaveBeenCalled();
    expect(runGit).not.toHaveBeenCalled();
    expect(r.snapshotStatus).toBe('SKIPPED_EMPTY');
  });
});

describe('GUARD 3 — forApp prevents a cross-repo false withhold', () => {
  const SD = 'SD-LEO-INFRA-SOMETHING-001';
  const snap = () => collectInflightSnapshot({
    runGh: okGh([`feat/${SD}`]), runGit: okGit([]), repo: 'o/engineer', forApp: 'EHG_Engineer',
  });

  it('withholds a row from the SAME target app', () => {
    const row = { sd_key: SD, id: SD, target_application: 'EHG_Engineer' };
    expect(classifyDispatchIneligibility(row, { inflight_git_state: snap() })).toBe('inflight_open_pr');
  });

  it('does NOT withhold an identically-named row from a DIFFERENT target app', () => {
    // MUST use the ALL-MATCH variant, not classifyDispatchIneligibility.
    //
    // A cross-repo row also trips the PRE-EXISTING repo-match fitness axis
    // (unfit_repo_mismatch), which is correct and unrelated — and because the single-reason
    // classifier returns the FIRST match, that axis MASKS mine. I first wrote this against
    // classifyDispatchIneligibility with `not.toMatch(/^inflight_/)` and it passed happily with
    // the forApp guard DELETED: the earlier axis answered before mine ever ran, so the assertion
    // was unfalsifiable for the exact mutation it existed to catch.
    //
    // classifyAllDispatchIneligibility collects EVERY matching axis, so no earlier axis can hide
    // this one. Deleting the forApp check now surfaces inflight_open_pr in the list and fails.
    const row = { sd_key: SD, id: SD, target_application: 'apexniche-ai' };
    const all = classifyAllDispatchIneligibility(row, { inflight_git_state: snap() });
    const reasons = Array.isArray(all) ? all.map((r) => (typeof r === 'string' ? r : r?.reason)) : [all];
    expect(reasons.some((r) => typeof r === 'string' && r.startsWith('inflight_'))).toBe(false);
  });

  it('control: the SAME row from the matching app DOES surface an inflight reason', () => {
    // Proves the all-match instrument can see this axis at all — without this, the assertion
    // above could pass because the axis is unreachable rather than because the guard works.
    const row = { sd_key: SD, id: SD, target_application: 'EHG_Engineer' };
    const all = classifyAllDispatchIneligibility(row, { inflight_git_state: snap() });
    const reasons = Array.isArray(all) ? all.map((r) => (typeof r === 'string' ? r : r?.reason)) : [all];
    expect(reasons.some((r) => typeof r === 'string' && r.startsWith('inflight_'))).toBe(true);
  });

  it('a snapshot with no forApp still applies (back-compat, no silent disable)', () => {
    const legacy = collectInflightSnapshot({ runGh: okGh([`feat/${SD}`]), runGit: okGit([]), repo: 'o/r' });
    const row = { sd_key: SD, id: SD, target_application: 'EHG_Engineer' };
    expect(classifyDispatchIneligibility(row, { inflight_git_state: legacy })).toBe('inflight_open_pr');
  });
});

describe('GUARD 4 — per-target-app grouping issues one probe per repo', () => {
  it('a mixed-target batch probes each app separately, with its own --repo', async () => {
    // Collapsing this to a single repo probes the wrong repository for every row after the first
    // and returns a false CLEAR — the FR-7 failure mode.
    const seenRepos = [];
    const runGh = (args) => {
      const i = args.indexOf('--repo');
      seenRepos.push(i === -1 ? null : args[i + 1]);
      return okGh([])();
    };
    const items = [
      { id: 'QF-1', target_application: 'EHG_Engineer' },
      { id: 'QF-2', target_application: 'EHG' },
      { id: 'QF-3', target_application: 'EHG_Engineer' },
    ];
    await withheldFilteredQfs(items, { inflightProbe: { runGh, runGit: okGit([]) } });
    // Two distinct apps -> two probes, not one, and not three (grouped, not per-item).
    expect(seenRepos).toHaveLength(2);
    expect(new Set(seenRepos).size).toBe(2);
  });

  it('a single-app batch still issues exactly one probe', async () => {
    const seen = [];
    const runGh = (args) => { seen.push(args); return okGh([])(); };
    await withheldFilteredQfs(
      [{ id: 'QF-1', target_application: 'EHG_Engineer' }, { id: 'QF-2', target_application: 'EHG_Engineer' }],
      { inflightProbe: { runGh, runGit: okGit([]) } },
    );
    expect(seen).toHaveLength(1);
  });
});
