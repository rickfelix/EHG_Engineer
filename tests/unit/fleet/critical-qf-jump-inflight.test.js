/**
 * FR-3 lane wiring — lib/checkin/steps/critical-qf-jump.cjs.
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B.
 *
 * This is THE lane that mis-dispatched QF-20260726-425 while PR #6540 was open on
 * qf/QF-20260726-425. Its existing DB guard (.is('pr_url', null).is('commit_sha', null)) is
 * blind in the measured shape: 23/30 (77%) of non-terminal QFs have BOTH columns NULL while a
 * real PR is open.
 *
 * NOT authored in tests/unit/worker-checkin-critical-qf-priority-jump.test.js — that file is
 * QUARANTINED and excluded from the vitest unit project, so assertions added there run nowhere.
 *
 * NEGATIVE-CONTROL NOTE: every fixture below sets pr_url AND commit_sha to null. That is the
 * shape the lane's own column guard cannot catch, so a withhold here is attributable to the new
 * git probe and to nothing else. A fixture with pr_url populated would be excluded by the
 * pre-existing guard and would prove nothing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { withheldFilteredQfs } = require_('../../../lib/checkin/steps/critical-qf-jump.cjs');
const { _resetSnapshotCache } = require_('../../../lib/fleet/inflight-git-state.cjs');

const okGh = (heads) => () => ({ stdout: JSON.stringify(heads.map((h) => ({ headRefName: h }))), stderr: '', code: 0, spawnError: null });
const okGit = (branches) => () => ({ stdout: branches.map((b) => `abc\trefs/heads/${b}`).join('\n'), stderr: '', code: 0, spawnError: null });
const unauthGh = () => () => ({ stdout: '', stderr: 'gh auth login', code: 4, spawnError: null });

const IN_FLIGHT_QF = 'QF-20260726-425';
const FREE_QF = 'QF-20260726-999';

/** Both columns NULL — the shape the existing guard is blind to. */
const qf = (id) => ({ id, pr_url: null, commit_sha: null, status: 'open', severity: 'critical', target_application: 'EHG_Engineer' });

beforeEach(() => _resetSnapshotCache());

describe('FR-3 / AC-1 / AC-2 — the incident lane withholds in-flight quick-fixes', () => {
  it('withholds a QF whose branch has an open PR, with pr_url and commit_sha both NULL', async () => {
    const ctx = { inflightProbe: { runGh: okGh([`qf/${IN_FLIGHT_QF}`]), runGit: okGit(['main']), repo: 'o/r' } };
    const kept = await withheldFilteredQfs([qf(IN_FLIGHT_QF), qf(FREE_QF)], ctx);
    expect(kept.map((q) => q.id)).toEqual([FREE_QF]);
  });

  it('withholds a QF with a pushed branch and NO open PR', async () => {
    const ctx = { inflightProbe: { runGh: okGh([]), runGit: okGit([`qf/${IN_FLIGHT_QF}`]), repo: 'o/r' } };
    const kept = await withheldFilteredQfs([qf(IN_FLIGHT_QF), qf(FREE_QF)], ctx);
    expect(kept.map((q) => q.id)).toEqual([FREE_QF]);
  });

  it('AC-4 regression: a QF with no branch and no PR stays claimable', async () => {
    const ctx = { inflightProbe: { runGh: okGh(['feat/other']), runGit: okGit(['main']), repo: 'o/r' } };
    const kept = await withheldFilteredQfs([qf(FREE_QF)], ctx);
    expect(kept.map((q) => q.id)).toEqual([FREE_QF]);
  });
});

describe('AC-3 — the lane never starves dispatch when the probe cannot run', () => {
  it('unauthenticated gh withholds NOTHING (all candidates survive)', async () => {
    const ctx = { inflightProbe: { runGh: unauthGh(), runGit: okGit(['main']), repo: 'o/r' } };
    const kept = await withheldFilteredQfs([qf(IN_FLIGHT_QF), qf(FREE_QF)], ctx);
    // Inverting the fail direction here (the wip-detector convention) would empty the belt
    // fleet-wide under a gh outage — strictly worse than the bug being fixed.
    expect(kept.map((q) => q.id)).toEqual([IN_FLIGHT_QF, FREE_QF]);
  });

  it('a throwing probe withholds NOTHING', async () => {
    const boom = () => { throw new Error('spawn exploded'); };
    const ctx = { inflightProbe: { runGh: boom, runGit: boom, repo: 'o/r' } };
    const kept = await withheldFilteredQfs([qf(IN_FLIGHT_QF)], ctx);
    expect(kept.map((q) => q.id)).toEqual([IN_FLIGHT_QF]);
  });

  it('an empty or non-array candidate list is handled without throwing', async () => {
    expect(await withheldFilteredQfs([], {})).toEqual([]);
    expect(await withheldFilteredQfs(null, {})).toEqual([]);
  });
});

describe('SR-4 — a withhold is announced, and UNAVAILABLE is worded differently', () => {
  it('logs the withheld id and its reason', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { inflightProbe: { runGh: okGh([`qf/${IN_FLIGHT_QF}`]), runGit: okGit([]), repo: 'o/r' } };
    await withheldFilteredQfs([qf(IN_FLIGHT_QF)], ctx);
    const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain(IN_FLIGHT_QF);
    expect(out).toContain('inflight_open_pr');
    spy.mockRestore();
  });

  it('an UNAVAILABLE probe is logged distinguishably from a clean pass', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { inflightProbe: { runGh: unauthGh(), runGit: okGit([]), repo: 'o/r' } };
    await withheldFilteredQfs([qf(FREE_QF)], ctx);
    const out = spy.mock.calls.map((c) => String(c[0])).join('\n');
    // Without this, a permanently broken probe reads as "nothing is ever in flight".
    expect(out).toContain('UNAVAILABLE');
    spy.mockRestore();
  });
});
