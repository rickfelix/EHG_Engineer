/**
 * SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 — the four-bucket worker-engagement classifier.
 *
 * WHAT THIS PINS: the corrections PLAN-phase sub-agent review found in the original draft design
 * — a naive last_tool_at-only ZOMBIE threshold, TAIL sourced from a claim mechanism that cannot
 * see released claims, and a "0 drift" success metric that was mathematically unsatisfiable under
 * two different narrowing predicates. Each defect has a dedicated negative test below so a future
 * regression back toward the original (wrong) design fails loudly here first.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyEngagementBuckets,
  classifySessionBucket,
  isEngagementBasePopulationMember,
  engagementGaugeOn,
  ENGAGEMENT_POPULATION_EXTENT,
  ENGAGEMENT_LIVE_WINDOW_MS,
} from '../../scripts/lib/engagement-buckets.mjs';

const NOW = 1_700_000_000_000; // fixed clock

// heartbeat_at defaults FRESH — classifyEngagementBuckets applies its own liveness window
// (ENGAGEMENT_LIVE_WINDOW_MS) ahead of isEngagementBasePopulationMember; tests exercising
// classifyEngagementBuckets need a live default unless specifically testing staleness.
// classifySessionBucket/isEngagementBasePopulationMember are called directly in several tests
// below (bypassing that gate entirely), so heartbeat_at is irrelevant there — harmless either way.
const session = (over = {}) => ({
  session_id: 'sess-default',
  metadata: {},
  status: 'idle',
  loop_state: null,
  heartbeat_at: new Date(NOW - 30_000).toISOString(),
  last_tool_at: new Date(NOW - 60_000).toISOString(),
  released_reason: null,
  released_at: null,
  sd_key: null,
  ...over,
});

describe('isEngagementBasePopulationMember — the single dedicated base-population predicate (TR-1)', () => {
  it('excludes the coordinator by session_id', () => {
    expect(isEngagementBasePopulationMember(session({ session_id: 'coord' }), 'coord')).toBe(false);
  });

  it('excludes metadata.role==="adam"', () => {
    expect(isEngagementBasePopulationMember(session({ metadata: { role: 'adam' } }), 'coord')).toBe(false);
  });

  it('excludes metadata.is_coordinator in both boolean and stringified-JSON form', () => {
    expect(isEngagementBasePopulationMember(session({ metadata: { is_coordinator: true } }), 'other')).toBe(false);
    expect(isEngagementBasePopulationMember(session({ metadata: { is_coordinator: 'true' } }), 'other')).toBe(false);
  });

  it('excludes metadata.non_fleet', () => {
    expect(isEngagementBasePopulationMember(session({ metadata: { non_fleet: true } }), 'coord')).toBe(false);
  });

  it('excludes fixture-id sessions', () => {
    expect(isEngagementBasePopulationMember(session({ session_id: 'test-fixture-001' }), 'coord')).toBe(false);
  });

  it('INCLUDES a session with no active claim (everClaimed-style gating must NOT apply here — TR-1)', () => {
    // isFleetWorker would exclude this (no sd_key, no claimed_at, no worktree_path). This
    // predicate must not, or TAIL is starved exactly as the original draft design was.
    expect(isEngagementBasePopulationMember(session({ sd_key: null }), 'coord')).toBe(true);
  });

  it('INCLUDES a quarantined/parked session (quarantine/park exclusion must NOT apply here — TR-1)', () => {
    // isDispatchableFleetMember would exclude this. This predicate must not, or ZOMBIE is
    // starved exactly as the original draft design was — a confirmed wedge IS a ZOMBIE.
    expect(isEngagementBasePopulationMember(session({ metadata: { quarantined_at: new Date().toISOString() } }), 'coord')).toBe(true);
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(isEngagementBasePopulationMember(session({ metadata: { parked_until: future } }), 'coord')).toBe(true);
  });

  it('fails toward "member" on garbage input (never hides a real worker from the census)', () => {
    expect(isEngagementBasePopulationMember(null, 'coord')).toBe(false); // explicit null guard, not garbage-tolerant
    expect(isEngagementBasePopulationMember(undefined, 'coord')).toBe(false);
  });
});

describe('classifySessionBucket — precedence and the two corrected defects', () => {
  it('ENGAGED takes precedence over everything when isClaimed is true', () => {
    const s = session({ released_reason: 'completed', released_at: new Date(NOW - 60_000).toISOString() });
    expect(classifySessionBucket(s, { isClaimed: () => true, nowMs: NOW })).toBe('ENGAGED');
  });

  it('TAIL: a session released inside the grace window with a completion reason', () => {
    const s = session({ released_reason: 'completed', released_at: new Date(NOW - 60_000).toISOString() });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('TAIL');
  });

  it('TAIL boundary: past the grace window classifies IDLE, not TAIL', () => {
    const graceMs = 10 * 60 * 1000;
    const s = session({ released_reason: 'completed', released_at: new Date(NOW - graceMs - 1000).toISOString() });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('IDLE');
  });

  it('a non-completion release reason (e.g. manual unclaim) never yields TAIL', () => {
    const s = session({ released_reason: 'manual_unclaim', released_at: new Date(NOW - 60_000).toISOString() });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).not.toBe('TAIL');
  });

  it('CORRECTED DEFECT #1 (ZOMBIE calibration): loop_state="awaiting_tick" past a naive 10-minute mark, but with no recorded wake deadline, must classify IDLE — never ZOMBIE', () => {
    // This is the exact case the original draft design (bare 10min last_tool_at threshold) would
    // have misclassified. isKnownWedged fails open on the parked arm absent a recorded deadline.
    const s = session({
      loop_state: 'awaiting_tick',
      last_tool_at: new Date(NOW - 15 * 60_000).toISOString(), // 15 min > naive 10min, well within the real 120min default
    });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('IDLE');
  });

  it('a parked session whose recorded wake deadline has genuinely passed IS ZOMBIE', () => {
    const s = session({
      loop_state: 'awaiting_tick',
      last_tool_at: new Date(NOW - 3 * 60 * 60_000).toISOString(),
      metadata: { expected_wake_at: new Date(NOW - 60 * 60_000).toISOString() },
    });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('ZOMBIE');
  });

  it('loop_state="active" and tool-silent past the calibrated cut point IS ZOMBIE', () => {
    const s = session({ loop_state: 'active', last_tool_at: new Date(NOW - 3 * 60 * 60_000).toISOString() });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('ZOMBIE');
  });

  it('CORRECTED DEFECT (NULL last_tool_at): must classify UNKNOWN, never ZOMBIE, even with loop_state="active"', () => {
    const s = session({ loop_state: 'active', last_tool_at: null });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('UNKNOWN');
  });

  it('a live, unclaimed, tool-active session is IDLE', () => {
    const s = session({ loop_state: 'active', last_tool_at: new Date(NOW - 60_000).toISOString() });
    expect(classifySessionBucket(s, { isClaimed: () => false, nowMs: NOW })).toBe('IDLE');
  });

  it('never throws on a malformed session (fail-soft to UNKNOWN)', () => {
    expect(classifySessionBucket({}, { isClaimed: () => { throw new Error('boom'); }, nowMs: NOW })).toBe('UNKNOWN');
  });
});

describe('classifyEngagementBuckets — population accounting and the closed TR-1 gap', () => {
  it('every base-population member lands in exactly one bucket, summing to the population', () => {
    const sessions = [
      session({ session_id: 'a', sd_key: 'SD-X' }), // ENGAGED
      session({ session_id: 'b', released_reason: 'completed', released_at: new Date(NOW - 60_000).toISOString() }), // TAIL
      session({ session_id: 'c', loop_state: 'active', last_tool_at: new Date(NOW - 3 * 60 * 60_000).toISOString() }), // ZOMBIE
      session({ session_id: 'd' }), // IDLE
      session({ session_id: 'e', last_tool_at: null }), // UNKNOWN
      session({ session_id: 'coord', metadata: { is_coordinator: true } }), // excluded
    ];
    const result = classifyEngagementBuckets(sessions, {
      coordinatorId: 'coord', now: NOW, isClaimed: (s) => !!s.sd_key,
    });
    expect(result.population).toBe(5);
    expect(result.engaged + result.tail + result.zombie + result.idle + result.unknown).toBe(result.population);
    expect(result).toMatchObject({ engaged: 1, tail: 1, zombie: 1, idle: 1, unknown: 1 });
    expect(result.populationExtent).toBe(ENGAGEMENT_POPULATION_EXTENT);
  });

  it('LIVENESS WINDOW (TR-1/DEF-2 fix): a stale-heartbeat session is excluded from the population entirely, not counted in any bucket', () => {
    const sessions = [
      session({ session_id: 'fresh', sd_key: 'SD-X' }),
      session({ session_id: 'stale', heartbeat_at: new Date(NOW - ENGAGEMENT_LIVE_WINDOW_MS - 60_000).toISOString() }),
    ];
    const result = classifyEngagementBuckets(sessions, { coordinatorId: 'coord', now: NOW, isClaimed: (s) => !!s.sd_key });
    expect(result.population).toBe(1); // 'stale' excluded entirely — not IDLE, not UNKNOWN, not counted anywhere
    expect(result.engaged).toBe(1);
  });

  it('a session with no heartbeat_at at all is excluded (fails toward "not live", not "member")', () => {
    const sessions = [session({ session_id: 'a', sd_key: 'SD-X' }), session({ session_id: 'no-hb', heartbeat_at: null })];
    const result = classifyEngagementBuckets(sessions, { coordinatorId: 'coord', now: NOW, isClaimed: () => false });
    expect(result.population).toBe(1);
  });

  it('WEDGE EXEMPTION (round-2 fix): a HARD-wedged session — heartbeat itself stale, not just tool-silent — still classifies ZOMBIE, not EXCLUDED', () => {
    // Round-1 EXEC-phase TESTING review measured this as a real regression: the liveness filter,
    // applied as a blanket pre-filter, silently dropped exactly this case from the census — the
    // same class of starvation FR-1 was written to eliminate, relocated to a new mechanism.
    // isKnownWedged has its own staleness authority (last_tool_at/loop_state) independent of
    // heartbeat_at and must be checked BEFORE a session is excluded on heartbeat age alone.
    const hardWedged = session({
      session_id: 'hard-wedge',
      heartbeat_at: new Date(NOW - 20 * 60_000).toISOString(), // 20min stale — past ENGAGEMENT_LIVE_WINDOW_MS (15min)
      loop_state: 'active',
      last_tool_at: new Date(NOW - 3 * 60 * 60_000).toISOString(), // 3h tool-silent
    });
    const result = classifyEngagementBuckets([hardWedged], { coordinatorId: 'coord', now: NOW, isClaimed: () => false });
    expect(result.population).toBe(1);
    expect(result.zombie).toBe(1);
  });

  it('a genuinely stale, NOT-wedged session (heartbeat AND last_tool_at both stale, but loop_state does not indicate active/awaiting_tick) is EXCLUDED, not ZOMBIE', () => {
    const trulyGone = session({
      session_id: 'gone',
      heartbeat_at: new Date(NOW - 20 * 60_000).toISOString(),
      loop_state: null, // isKnownWedged requires 'active' or 'awaiting_tick' — neither, so never wedged
      last_tool_at: new Date(NOW - 3 * 60 * 60_000).toISOString(),
    });
    const result = classifyEngagementBuckets([trulyGone], { coordinatorId: 'coord', now: NOW, isClaimed: () => false });
    expect(result.population).toBe(0); // excluded from the census entirely
    expect(result.zombie).toBe(0);
  });

  it('CLOSES THE MEASURED 29% GAP (TR-1/TS-10, DEF-2/DEF-3 fix): two callers feeding DIFFERENT raw row sets — one heartbeat-filtered like the forecaster\'s own query, one unfiltered like KPI-1\'s select(\'*\') — agree exactly once the classifier\'s own liveness window applies', () => {
    const liveA = session({ session_id: 'a', sd_key: 'SD-X' });
    const liveB = session({ session_id: 'b', metadata: { quarantined_at: new Date().toISOString() }, loop_state: 'active', last_tool_at: new Date(NOW - 3 * 60 * 60_000).toISOString() });
    const liveC = session({ session_id: 'c' });
    // A row that a NARROWER host query (the forecaster's own .gte('heartbeat_at', ...)) would never
    // even fetch, but that KPI-1's unbounded select('*').limit(1000) genuinely would hand the
    // classifier — this is the exact shape of the measured 29-row disagreement.
    const staleD = session({ session_id: 'd', heartbeat_at: new Date(NOW - 3 * 60 * 60_000).toISOString() });

    // "forecaster side" — its own query already excludes staleD; claim signal from a
    // claimsBySession-style map.
    const claimsBySession = { a: [{ sd_key: 'SD-X' }] };
    const forecasterSide = classifyEngagementBuckets([liveA, liveB, liveC], {
      coordinatorId: 'coord', now: NOW, isClaimed: (s) => !!claimsBySession[s.session_id],
    });
    // "KPI-1 side" — its own query hands the classifier the SAME live rows PLUS the stale one its
    // unbounded select doesn't filter out; claim signal from !!s.sd_key directly.
    const kpi1Side = classifyEngagementBuckets([liveA, liveB, liveC, staleD], {
      coordinatorId: 'coord', now: NOW, isClaimed: (s) => !!s.sd_key,
    });
    expect(kpi1Side.population).toBe(forecasterSide.population); // staleD did NOT inflate KPI-1's count
    expect(kpi1Side).toMatchObject({
      engaged: forecasterSide.engaged, tail: forecasterSide.tail,
      zombie: forecasterSide.zombie, idle: forecasterSide.idle, unknown: forecasterSide.unknown,
    });
    // And specifically: the quarantined session (b) must be counted (ZOMBIE), not silently dropped —
    // this is the exact case that starved under isDispatchableFleetMember in the original draft.
    expect(forecasterSide.zombie).toBe(1);
  });

  it('a nullish sessions argument degrades gracefully to a 0-population result, not an error', () => {
    // (sessions || []) already handles this — null/undefined input is a valid "no sessions read
    // yet" state, distinct from a genuine internal fault (next test).
    const result = classifyEngagementBuckets(null, { coordinatorId: 'coord', now: NOW, isClaimed: () => true });
    expect(result.unmeasured).toBeUndefined();
    expect(result.population).toBe(0);
  });

  it('never throws on a genuinely malformed sessions argument — degrades to an unmeasured result (FR-4)', () => {
    // A non-nullish value with no .filter method (unlike null/undefined, which the || [] guard
    // already handles) exercises the outer try/catch's true purpose.
    const result = classifyEngagementBuckets(42, { coordinatorId: 'coord', now: NOW, isClaimed: () => true });
    expect(result.unmeasured).toBe(true);
    expect(typeof result.error).toBe('string');
  });

  it('never throws when isClaimed itself throws on every session', () => {
    const sessions = [session({ session_id: 'a' }), session({ session_id: 'b' })];
    const result = classifyEngagementBuckets(sessions, {
      coordinatorId: 'coord', now: NOW, isClaimed: () => { throw new Error('claim lookup failed'); },
    });
    expect(result.unmeasured).toBeUndefined(); // per-session catch handles this, not the outer one
    expect(result.unknown).toBe(2);
  });
});

describe('engagementGaugeOn — the FR-6 rollout flag (default ON, disableable)', () => {
  it('defaults to true when unset', () => {
    const prev = process.env.ENGAGEMENT_GAUGE_ENABLED;
    delete process.env.ENGAGEMENT_GAUGE_ENABLED;
    expect(engagementGaugeOn()).toBe(true);
    if (prev !== undefined) process.env.ENGAGEMENT_GAUGE_ENABLED = prev;
  });

  it('is disableable via "false" or "0"', () => {
    const prev = process.env.ENGAGEMENT_GAUGE_ENABLED;
    process.env.ENGAGEMENT_GAUGE_ENABLED = 'false';
    expect(engagementGaugeOn()).toBe(false);
    process.env.ENGAGEMENT_GAUGE_ENABLED = '0';
    expect(engagementGaugeOn()).toBe(false);
    if (prev === undefined) delete process.env.ENGAGEMENT_GAUGE_ENABLED;
    else process.env.ENGAGEMENT_GAUGE_ENABLED = prev;
  });
});
