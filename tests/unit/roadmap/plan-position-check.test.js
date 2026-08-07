// SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-5) — the standing check.
//
// TWO-SIDED, as the SD requires: it must FAIL on a deliberately orphaned item and PASS on the
// corrected population. But the scenario that earns its place is TS-7, which is NOT in the SD:
// measured live there are ZERO orphans today, so an orphan-only check passes now and would keep
// passing if the linkage source vanished entirely — "0 orphans" while reading nothing. That is the
// unreadable zero this SD exists to remove, rebuilt inside the instrument meant to detect it.
import { describe, it, expect } from 'vitest';
import { evaluate, VERDICT } from '../../../lib/roadmap/plan-position-check.js';

const item = (over = {}) => ({ is_orphaned: false, child_sd_key: 'SD-X', ...over });
const wave = (over = {}) => ({ sequence_rank: 1, title: 'W', status: 'approved', time_horizon: 'now', item_count: 5, ...over });

describe('FR-5: two-sided on orphans', () => {
  it('PASSES on a healthy population', () => {
    const r = evaluate({ items: [item(), item()], waves: [wave()] });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.population).toBe(2);
  });

  it('FAILS at the FIRST orphan, not at a threshold', () => {
    const r = evaluate({ items: [item(), item(), item({ is_orphaned: true })], waves: [wave()] });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.orphans).toBe(1);
    expect(r.because).toMatch(/does not exist/);
  });
});

// THE SCENARIO THAT KEEPS THIS INSTRUMENT HONEST.
describe('FR-5: the false-zero guard', () => {
  it('an EMPTY population is UNREADABLE, never PASS', () => {
    const r = evaluate({ items: [], waves: [wave()] });
    expect(r.verdict).toBe(VERDICT.UNREADABLE);
    expect(r.verdict).not.toBe(VERDICT.PASS);
    expect(r.because).toMatch(/nothing was read/);
    expect(r.orphans).toBeNull();   // NOT 0 — an unknown must never render as a zero
  });

  it('distinguishes no-orphans-because-linked from no-orphans-because-unread', () => {
    expect(evaluate({ items: [item()], waves: [wave()] }).verdict).toBe(VERDICT.PASS);
    expect(evaluate({ items: [], waves: [wave()] }).verdict).toBe(VERDICT.UNREADABLE);
  });

  it('treats missing/garbage input as unreadable rather than clean', () => {
    expect(evaluate().verdict).toBe(VERDICT.UNREADABLE);
    expect(evaluate({ items: null, waves: null }).verdict).toBe(VERDICT.UNREADABLE);
  });
});

describe('FR-5: the gated carve-out is structural, not a title match', () => {
  // The real defect: Wave 0 is approved, current, and holds nothing.
  it('FAILS an approved wave at horizon=now holding zero items', () => {
    const r = evaluate({ items: [item()], waves: [wave({ sequence_rank: 0, item_count: 0 })] });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.emptyCurrentWaves).toBe(1);
    expect(r.offendingWaves[0].sequence_rank).toBe(0);
  });

  // The legitimate state the SD's unconditional wording would have forbidden.
  it('PASSES a GATED wave at horizon=next holding zero items', () => {
    const r = evaluate({
      items: [item()],
      waves: [wave({ sequence_rank: 3, title: 'Wave 3 (GATED): First revenue push', time_horizon: 'next', item_count: 0 })],
    });
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('PASSES a later-horizon wave holding zero items', () => {
    expect(evaluate({ items: [item()], waves: [wave({ time_horizon: 'later', item_count: 0 })] }).verdict).toBe(VERDICT.PASS);
  });

  // The carve-out must not depend on the word GATED appearing anywhere — it exists only in one
  // wave's title, with no structured key, so a title match would break on a rename.
  it('does not read the title at all — a current wave named GATED still fails', () => {
    const r = evaluate({
      items: [item()],
      waves: [wave({ sequence_rank: 9, title: 'Wave 9 (GATED): still current', time_horizon: 'now', item_count: 0 })],
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });
});

describe('FR-5: reports both defect kinds together', () => {
  it('names orphans AND empty current waves in one verdict', () => {
    const r = evaluate({
      items: [item(), item({ is_orphaned: true })],
      waves: [wave({ sequence_rank: 0, item_count: 0 }), wave({ sequence_rank: 1, item_count: 3 })],
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.orphans).toBe(1);
    expect(r.emptyCurrentWaves).toBe(1);
    expect(r.because).toMatch(/does not exist/);
    expect(r.because).toMatch(/horizon=now/);
  });
});
