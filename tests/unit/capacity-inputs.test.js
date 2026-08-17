/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the shared capacity derivation, EXECUTED.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
 * The TESTING sub-agent measured that gatherCapacityInputs had ZERO behavioural tests: every
 * reference to it in the suite was a source-text regex or a file-path repoint. Nothing ran it.
 *
 * That is the wrong place for a blind spot, because this module's ENTIRE PURPOSE is to be the one
 * derivation two schedules share — the capacity forecast (every 10 min) and the drive-report sweep
 * (daily). If it drifts, the two ends disagree about belt depth and the verdict ladder behind
 * drive_score leg4 stops meaning one thing. A shared derivation with no execution test is exactly
 * the exposure this SD already found one level down, where a writer and its caller shared a
 * vocabulary and were never introduced.
 *
 * WHAT IT PINS: the counts, and specifically the EXCLUSIONS — a row that should not be belt must
 * not inflate claimableCount, because over-reporting capacity suppresses the deficit that triggers
 * the coordinator's Adam sourcing reach-out. Silent over-count is the fail-open direction here.
 *
 * WHAT IT DOES NOT PIN, stated rather than implied: the live SQL. The client is a fake, so this
 * proves the derivation over a given result set, not that PostgREST returns that set.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gatherCapacityInputs, BELT_BUFFER, normPhase, etaMinForClaim } from '../../scripts/lib/capacity-inputs.mjs';
import { computeBeltVerdict } from '../../lib/drive-loop/belt-verdict.js';
import { classifyEngagementBuckets } from '../../scripts/lib/engagement-buckets.mjs';

/**
 * A fake Supabase whose builders satisfy fetchAllPaginated (fresh builder per page, .range applied
 * by the caller) and the row-fetch path countAutoStartableQuickFixes uses (SD-LEO-INFRA-QF-SUPPLY-
 * PREDICATE-AUTO-START-001 FR-4: was the head-count path countClaimableQuickFixes used — that
 * builder only ever needed to answer a bare {count}, never a row; countAutoStartableQuickFixes
 * fetches rows and runs isAutoStartableQF over them in JS, so quick_fixes now needs the SAME
 * row-capable builder claude_sessions/strategic_directives_v2 already use, not a narrower one).
 */
function fakeClient({ sessions = [], sds = [], qfCount = 0 } = {}) {
  const table = (rows) => {
    const b = {
      _rows: rows,
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      is() { return b; },
      not() { return b; },
      gte() { return b; },
      order() { return b; },
      limit(n) { return Promise.resolve({ data: b._rows.slice(0, n), error: null }); },
      range(from, to) { return Promise.resolve({ data: b._rows.slice(from, to + 1), error: null }); },
      then(res) { return Promise.resolve({ data: b._rows, error: null }).then(res); },
    };
    return b;
  };
  // Fresh, open, unambiguously isAutoStartableQF-eligible rows — qfCount stays the test-facing
  // knob ("N open QFs on the belt"), it just now has to carry the fields the row-level predicate
  // reads (created_at above all: a missing one reads as unparseable age and excludes the row).
  const qfs = Array.from({ length: qfCount }, (_, i) => ({
    id: `qf-fake-${i}`,
    status: 'open',
    pr_url: null,
    commit_sha: null,
    created_at: new Date().toISOString(),
    routing_tier: null,
    title: 'Fix a typo in a comment',
    // Deliberately free of TIER3_RISK_RE's keywords (auth/schema/migration/etc.) — a description
    // merely ASSERTING their absence would itself contain the words and self-exclude the row.
    description: 'No behavioral change.',
    not_before: null,
    factory_lane: false,
    owner: null,
    release_condition: null,
  }));
  return {
    from(name) {
      if (name === 'claude_sessions') return table(sessions);
      if (name === 'strategic_directives_v2') return table(sds);
      if (name === 'quick_fixes') return table(qfs);
      return table([]);
    },
  };
}

const liveSession = (over = {}) => ({
  session_id: '11111111-1111-1111-1111-111111111111',
  terminal_id: 't1',
  sd_key: null,
  heartbeat_at: new Date().toISOString(),
  process_alive_at: new Date().toISOString(),
  loop_state: 'active',
  expected_silence_until: null,
  metadata: { callsign: 'Alpha' },
  status: 'active',
  released_reason: null,
  released_at: null,
  ...over,
});

const claimableSd = (over = {}) => ({
  sd_key: 'SD-LEO-INFRA-REAL-WORK-001',
  title: 'A real strategic directive with a genuine body of work described here',
  description: 'A substantive description that is not a bare shell stub of any kind whatsoever.',
  status: 'draft',
  sd_type: 'infrastructure',
  current_phase: 'LEAD',
  progress_percentage: 0,
  claiming_session_id: null,
  dependencies: null,
  metadata: {},
  target_application: 'EHG_Engineer',
  ...over,
});

describe('SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 TS-9: select-list contract for the engagement gauge', () => {
  it('the live claude_sessions select genuinely includes last_tool_at (source-text pin)', () => {
    // EXEC-phase TESTING review (DEF-4) measured: deleting last_tool_at from the select would leave
    // every unit test green (fixtures supply it by construction via the fake client, which returns
    // full rows regardless of the select string) while ZOMBIE goes permanently unmeasurable in
    // production — the exact fail-open trap genuine-worker.mjs's FREEZE_TERM_COLUMNS documents by
    // name. A behavioral test cannot pin this (the fake client is select-column-blind by design);
    // this asserts the literal query text instead, the same way a schema-contract test would.
    const src = readFileSync(fileURLToPath(new URL('../../scripts/lib/capacity-inputs.mjs', import.meta.url)), 'utf8');
    const selectMatch = src.match(/\.from\('claude_sessions'\)[\s\S]*?\.select\('([^']+)'\)/);
    expect(selectMatch, 'claude_sessions select() call not found in capacity-inputs.mjs').toBeTruthy();
    const columns = selectMatch[1].split(',').map((c) => c.trim());
    expect(columns).toContain('last_tool_at');
    expect(columns).toContain('loop_state'); // the pairing isKnownWedged requires — both or neither is blind
  });

  it('classifyEngagementBuckets over gatherCapacityInputs\' OWN returned rows yields a non-UNKNOWN ZOMBIE verdict for a genuinely stale session (closes the fail-open gap end to end)', async () => {
    const now = Date.now();
    const staleWedged = liveSession({
      session_id: 'wedged-1', sd_key: null, loop_state: 'active',
      last_tool_at: new Date(now - 3 * 60 * 60_000).toISOString(),
      heartbeat_at: new Date(now - 60_000).toISOString(),
    });
    const out = await gatherCapacityInputs(fakeClient({ sessions: [staleWedged], sds: [], qfCount: 0 }), { now });
    // If the select ever regresses to omit last_tool_at, `workers` (the fake client returns full
    // fixture rows regardless of select-string, but engagement uses the RAW `sessions` array which
    // is genuinely shaped by what the select claims to fetch in production) would classify this
    // session UNKNOWN instead of ZOMBIE. This test pins the end-to-end behavior; the previous test
    // pins the query contract that makes it true in production.
    expect(out.engagement.unmeasured).not.toBe(true);
    expect(out.engagement.zombie).toBe(1);
  });
});

describe('gatherCapacityInputs — the counts the verdict ladder consumes', () => {
  it('[CONTROL] the fake client actually feeds the derivation — a clean read returns real counts', async () => {
    // Without this, every exclusion assertion below could pass because the reader silently got
    // nothing. A test that cannot tell "excluded" from "read zero rows" measures neither.
    const out = await gatherCapacityInputs(fakeClient({
      sessions: [liveSession()],
      sds: [claimableSd(), claimableSd({ sd_key: 'SD-LEO-INFRA-REAL-WORK-002' })],
      qfCount: 3,
    }), { now: Date.now() });

    expect(out.claimableCount, 'both eligible SDs must reach the belt').toBe(2);
    expect(out.openQfCount).toBe(3);
    expect(out.idleNow, 'an unclaimed live worker is idle demand').toBe(1);
  });

  it('an SD held for human action does NOT inflate the belt', async () => {
    // The fail-open direction: over-reporting capacity suppresses the deficit that triggers the
    // Adam sourcing reach-out, so a worker starves while the gauge reads healthy.
    // The field is metadata.requires_human_action (claim-eligibility.cjs:202). I first wrote
    // `human_action_required` — which is the RETURNED REASON STRING, not the input field — and the
    // test failed loudly instead of passing while asserting nothing. Worth keeping the note: the
    // reason and the flag are near-homophones, and guessing the input from the output would have
    // produced a green test over a held SD that still inflated the belt.
    const out = await gatherCapacityInputs(fakeClient({
      sds: [claimableSd(), claimableSd({ sd_key: 'SD-X-002', metadata: { requires_human_action: true } })],
    }));
    expect(out.claimableCount).toBe(1);
    expect(out.ineligibleExcludes).toBeGreaterThan(0);
  });

  it('a CLAIMED SD is demand, not supply', async () => {
    const sess = liveSession();
    const out = await gatherCapacityInputs(fakeClient({
      sessions: [sess],
      sds: [claimableSd({ claiming_session_id: sess.session_id, progress_percentage: 10, current_phase: 'EXEC' })],
    }));
    expect(out.claimableCount, 'a claimed SD is not claimable').toBe(0);
    expect(out.building, 'its holder is building, not idle').toBe(1);
    expect(out.idleNow).toBe(0);
  });

  it('a near-done claim counts as freeing-soon — that is forecast demand, not current demand', async () => {
    const sess = liveSession();
    const out = await gatherCapacityInputs(fakeClient({
      sessions: [sess],
      sds: [claimableSd({ claiming_session_id: sess.session_id, progress_percentage: 95, current_phase: 'EXEC' })],
    }));
    expect(out.freeingSoon).toBe(1);
    expect(out.idleNow, 'freeing-soon is NOT idle-now — conflating them double-counts demand').toBe(0);
  });

  it('feeds computeBeltVerdict a shape it accepts, on every path', async () => {
    // The actual integration claim: whatever this returns must be directly consumable by the ladder
    // both callers run. A missing or non-finite count makes computeBeltVerdict throw by design.
    const out = await gatherCapacityInputs(fakeClient({ sessions: [liveSession()], sds: [claimableSd()], qfCount: 1 }));
    const verdict = computeBeltVerdict({
      idleNow: out.idleNow,
      freeingSoon: out.freeingSoon,
      claimableCount: out.claimableCount,
      openQfCount: out.openQfCount,
      buffer: BELT_BUFFER,
    });
    expect(['DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS']).toContain(verdict.verdict);
    expect(verdict.beltDepth).toBe(out.claimableCount + out.openQfCount);
  });

  it('an EMPTY belt with an idle worker is DEFICIT-URGENT, not a quiet SURPLUS', async () => {
    // The branch that matters operationally, driven from a real gather rather than hand-fed numbers.
    const out = await gatherCapacityInputs(fakeClient({ sessions: [liveSession()], sds: [], qfCount: 0 }));
    const verdict = computeBeltVerdict({ ...out, buffer: BELT_BUFFER });
    expect(verdict.verdict).toBe('DEFICIT-URGENT');
  });

  it('a QF gauge failure degrades to a 0 QF contribution rather than aborting the forecast', async () => {
    // Preserved fail-open, asserted so the move cannot have quietly changed it. The shared gauge is
    // fail-LOUD by contract; this ONE call site has always softened it, and that stays visible here.
    const client = fakeClient({ sds: [claimableSd()] });
    const orig = client.from.bind(client);
    client.from = (n) => (n === 'quick_fixes' ? { select() { throw new Error('gauge down'); } } : orig(n));
    const out = await gatherCapacityInputs(client);
    expect(out.openQfCount).toBe(0);
    expect(out.claimableCount, 'the SD arm must still be measured').toBe(1);
  });

  // QF-20260816-435: unlike the QF gauge above, the sessions and SD reads previously had the SAME
  // `.catch(() => [])` softening — but they feed the deficit computation directly, so a read
  // failure silently became "read cleanly, zero workers/zero belt", manufacturing a real DEFICIT
  // verdict indistinguishable from a genuine one. These two now assert the opposite of the QF-gauge
  // test above: a sessions or SD read failure must propagate out of gatherCapacityInputs so the
  // caller (scoreCapacityLeg) can convert it to leg4 unavailable() instead of scoring/persisting.
  it('a claude_sessions read failure propagates — never silently reads as zero live workers', async () => {
    const client = fakeClient({ sds: [claimableSd()] });
    const orig = client.from.bind(client);
    client.from = (n) => (n === 'claude_sessions' ? { select() { throw new Error('sessions read failed'); } } : orig(n));
    await expect(gatherCapacityInputs(client)).rejects.toThrow('sessions read failed');
  });

  it('a strategic_directives_v2 read failure propagates — never silently reads as zero belt depth', async () => {
    const client = fakeClient({ sessions: [liveSession()] });
    const orig = client.from.bind(client);
    client.from = (n) => (n === 'strategic_directives_v2' ? { select() { throw new Error('sds read failed'); } } : orig(n));
    await expect(gatherCapacityInputs(client)).rejects.toThrow('sds read failed');
  });
});

describe('the ETA helpers moved intact', () => {
  it('normPhase still buckets the phase spellings the forecaster relies on', () => {
    expect(normPhase('EXEC_IMPLEMENTATION')).toBe('EXEC');
    expect(normPhase('PLAN_VERIFICATION')).toBe('PLAN');
    expect(normPhase('LEAD_FINAL_APPROVAL')).toBe('FINAL');
    expect(normPhase(null)).toBe('LEAD');
  });

  it('etaMinForClaim keeps its floor — a claim is never "0 minutes to free"', () => {
    expect(etaMinForClaim(100, 'EXEC')).toBeGreaterThanOrEqual(2);
    expect(etaMinForClaim(0, 'EXEC')).toBeGreaterThan(etaMinForClaim(90, 'EXEC'));
  });
});
