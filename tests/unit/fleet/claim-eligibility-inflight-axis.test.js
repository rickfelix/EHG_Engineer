/**
 * FR-3 / FR-6 — the in-flight axis in lib/fleet/claim-eligibility.cjs.
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B.
 *
 * No existing test exercises fitnessAxes/isSdExecutableHere THROUGH the axis table
 * (tests/unit/claim-eligibility.test.js has no reference to them; they are covered standalone in
 * tests/unit/fleet/sd-executable-here.test.js). So a new axis gets ZERO coverage by association
 * and needs its own file.
 *
 * FIXTURE-KEY TRAP: rows keyed SD-TEST-* / DEMO-* short-circuit on the EARLIER test_fixture_key
 * axis (claim-eligibility.cjs:49) and never reach this one — such a corpus would pass trivially
 * without exercising anything. Every key below is deliberately a realistic SD-LEO-* key.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require_('../../../lib/fleet/claim-eligibility.cjs');
const { collectInflightSnapshot } = require_('../../../lib/fleet/inflight-git-state.cjs');

const okGh = (heads) => () => ({ stdout: JSON.stringify(heads.map((h) => ({ headRefName: h }))), stderr: '', code: 0, spawnError: null });
const okGit = (branches) => () => ({ stdout: branches.map((b) => `abc\trefs/heads/${b}`).join('\n'), stderr: '', code: 0, spawnError: null });
const unauthGh = () => () => ({ stdout: '', stderr: 'gh auth login', code: 4, spawnError: null });

const IN_FLIGHT_SD = 'SD-LEO-INFRA-ALREADY-BUILDING-001';
const FREE_SD = 'SD-LEO-INFRA-NOT-STARTED-002';

/** Minimal claimable row — no other axis should fire on it. */
const row = (sd_key) => ({ sd_key, id: sd_key, status: 'draft', current_phase: 'LEAD' });

/** PR-based snapshot — the authoritative signal and the shipped default. */
const snapshotWithPr = (branches) =>
  collectInflightSnapshot({ runGh: okGh(branches), runGit: okGit(['main']), repo: 'o/r' });

describe('FR-3 — an SD with an open PR is withheld from dispatch', () => {
  it('returns an open-PR reason when a PR head matches the SD branch', () => {
    const ctx = { inflight_git_state: snapshotWithPr([`feat/${IN_FLIGHT_SD}`]) };
    expect(classifyDispatchIneligibility(row(IN_FLIGHT_SD), ctx)).toBe('inflight_open_pr');
  });

  it('a bare remote branch does NOT withhold by default, but does when opted in', () => {
    // Measured: 6 of 24 draft/in_progress SDs are branch-only. Withholding on those would starve
    // ~25% of the belt on refs this repo never prunes.
    const off = collectInflightSnapshot({ runGh: okGh([]), runGit: okGit([`feat/${IN_FLIGHT_SD}`]), repo: 'o/r' });
    expect(classifyDispatchIneligibility(row(IN_FLIGHT_SD), { inflight_git_state: off })).toBeNull();

    const on = collectInflightSnapshot({ runGh: okGh([]), runGit: okGit([`feat/${IN_FLIGHT_SD}`]), repo: 'o/r', includeBranchOnly: true });
    expect(classifyDispatchIneligibility(row(IN_FLIGHT_SD), { inflight_git_state: on })).toBe('inflight_remote_branch');
  });

  it('AC-4 regression: an SD with no branch and no PR stays claimable', () => {
    const ctx = { inflight_git_state: snapshotWithPr([`feat/${IN_FLIGHT_SD}`]) };
    expect(classifyDispatchIneligibility(row(FREE_SD), ctx)).toBeNull();
  });
});

describe('FR-6 — the axis is a byte-identical no-op without its ctx field', () => {
  // belt-depth.cjs:60, coordinator-backlog-rank.mjs:97 and stale-session-sweep.cjs:2641 all
  // classify with NO ctx. If this axis assumed its field existed, it would change their answers.
  const corpus = [row(IN_FLIGHT_SD), row(FREE_SD), row('SD-LEO-INFRA-THIRD-003')];

  it('no ctx at all: identical to before the axis existed', () => {
    for (const r of corpus) {
      expect(classifyDispatchIneligibility(r, undefined)).toBeNull();
      expect(classifyDispatchIneligibility(r, null)).toBeNull();
    }
  });

  it('ctx present but without inflight_git_state: still a no-op', () => {
    for (const r of corpus) {
      expect(classifyDispatchIneligibility(r, { session_model: 'opus' })).toBeNull();
    }
  });
});

describe('AC-3 — an UNAVAILABLE snapshot never blocks dispatch', () => {
  it('unauthenticated gh leaves every row claimable', () => {
    const snap = collectInflightSnapshot({ runGh: unauthGh(), runGit: okGit([`feat/${IN_FLIGHT_SD}`]), repo: 'o/r' });
    expect(snap.status).toBe('UNAVAILABLE');
    // Even the row that IS in flight stays claimable — we could not tell, so we do not block.
    expect(classifyDispatchIneligibility(row(IN_FLIGHT_SD), { inflight_git_state: snap })).toBeNull();
  });

  it('a malformed snapshot object does not throw or block', () => {
    expect(classifyDispatchIneligibility(row(IN_FLIGHT_SD), { inflight_git_state: { status: 'OK' } })).toBeNull();
    expect(classifyDispatchIneligibility(row(IN_FLIGHT_SD), { inflight_git_state: 'garbage' })).toBeNull();
  });
});
