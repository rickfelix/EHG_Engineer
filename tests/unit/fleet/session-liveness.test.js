// SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 (FR-1) — the read-time session-liveness SSOT.
// isSessionAlive reconciles the raw is_alive flag against authoritative signals; it is
// ONE-DIRECTIONAL (only upgrades a parked-alive worker to alive, never downgrades a worker the
// raw flag calls alive — never masks a real death).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  isSessionAlive, hasFreshHeartbeat, hasTickAlive, hasExpectedSilence, hasPidAlive,
} = require('../../../lib/fleet/session-liveness.cjs');

const NOW = 1_000_000_000_000;
const iso = (ms) => new Date(ms).toISOString();

describe('isSessionAlive — read-time liveness SSOT (FR-1)', () => {
  it('raw is_alive===true → alive (one-directional: never downgrades a raw-alive worker)', () => {
    // stale heartbeat, no pid/tick/silence — but raw flag says alive → stays alive
    const r = isSessionAlive({ is_alive: true, heartbeat_age_seconds: 9999 }, { nowMs: NOW });
    expect(r.alive).toBe(true);
    expect(r.reason).toBe('raw_is_alive');
  });

  it('UPGRADES a parked worker the raw flag froze to false: pid-alive → alive', () => {
    const s = { is_alive: false, heartbeat_age_seconds: 9999, terminal_id: 'win-cc-1234-77777' };
    const r = isSessionAlive(s, { nowMs: NOW, aliveCcPids: new Set(['77777']) });
    expect(r.alive).toBe(true);
    expect(r.reason).toBe('pid_alive');
  });

  it('UPGRADES on armed-silence (raw false, stale heartbeat, future expected_silence_until)', () => {
    const s = { is_alive: false, heartbeat_age_seconds: 9999, expected_silence_until: iso(NOW + 10 * 60 * 1000) };
    expect(isSessionAlive(s, { nowMs: NOW }).reason).toBe('armed_silence');
  });

  it('UPGRADES on a fresh process tick', () => {
    const s = { is_alive: false, heartbeat_age_seconds: 9999, process_alive_at: iso(NOW - 10 * 1000) };
    expect(isSessionAlive(s, { nowMs: NOW }).reason).toBe('process_tick');
  });

  it('fresh heartbeat alone → alive', () => {
    expect(isSessionAlive({ heartbeat_age_seconds: 30 }, { nowMs: NOW }).reason).toBe('fresh_heartbeat');
    expect(isSessionAlive({ heartbeat_at: iso(NOW - 60 * 1000) }, { nowMs: NOW }).reason).toBe('fresh_heartbeat');
  });

  it('GENUINELY DEAD (raw false, stale heartbeat, no pid, no tick, no silence) → dead (no real-death masking)', () => {
    const s = {
      is_alive: false, heartbeat_age_seconds: 9999, terminal_id: 'win-cc-1234-55555',
      process_alive_at: iso(NOW - 10 * 60 * 1000), expected_silence_until: iso(NOW - 60 * 1000),
    };
    const r = isSessionAlive(s, { nowMs: NOW, aliveCcPids: new Set(['00000']) }); // pid 55555 NOT alive
    expect(r.alive).toBe(false);
    expect(r.reason).toBe(null);
  });

  it('null/garbage → dead, no throw', () => {
    expect(isSessionAlive(null).alive).toBe(false);
    expect(isSessionAlive(undefined).alive).toBe(false);
  });
});

// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E FR-2: ~24 release-path writers can leave raw is_alive
// stale-true on a row whose status is 'released'/'stale'. The reader now denies that rung for
// those two statuses only -- every other status keeps the prior one-directional behavior.
describe('isSessionAlive — FR-2: deny raw_is_alive for released/stale, keep it for idle/active', () => {
  it('a released row with stale-true is_alive and no other live signal reads DEAD (the e60956f5 specimen)', () => {
    const s = {
      status: 'released', is_alive: true,
      heartbeat_at: new Date(NOW - 8 * 60 * 60 * 1000).toISOString(), // 8h old
      terminal_id: null, process_alive_at: null, expected_silence_until: null,
    };
    const r = isSessionAlive(s, { nowMs: NOW });
    expect(r).toEqual({ alive: false, reason: null });
  });

  it('a stale row with stale-true is_alive and no other live signal reads DEAD', () => {
    const s = { status: 'stale', is_alive: true, heartbeat_age_seconds: 9999 };
    expect(isSessionAlive(s, { nowMs: NOW })).toEqual({ alive: false, reason: null });
  });

  it('an idle row with is_alive:true still reads alive via raw_is_alive — idle is not narrowed', () => {
    const s = { status: 'idle', is_alive: true, heartbeat_age_seconds: 9999 };
    expect(isSessionAlive(s, { nowMs: NOW })).toEqual({ alive: true, reason: 'raw_is_alive' });
  });

  it('an active row with is_alive:true still reads alive via raw_is_alive — unchanged', () => {
    const s = { status: 'active', is_alive: true, heartbeat_age_seconds: 9999 };
    expect(isSessionAlive(s, { nowMs: NOW })).toEqual({ alive: true, reason: 'raw_is_alive' });
  });

  it('a row with no status at all still reads alive via raw_is_alive — the producer-starvation case FR-2 Part B closes at the call-site level, not here', () => {
    // This documents WHY producer-side SELECT parity (Part B) is required alongside the reader
    // change (Part A): the deny-list can only act on a status the caller actually selected.
    const s = { is_alive: true, heartbeat_age_seconds: 9999 };
    expect(isSessionAlive(s, { nowMs: NOW })).toEqual({ alive: true, reason: 'raw_is_alive' });
  });

  it('a released row is still UPGRADED to alive if an authoritative downstream signal fires (fresh heartbeat)', () => {
    // FR-2 only denies the RAW_IS_ALIVE rung; a genuinely fresh signal on a downstream rung must
    // still upgrade correctly, matching a legitimate race (released but a fresh heartbeat lands).
    const s = { status: 'released', is_alive: true, heartbeat_age_seconds: 30 };
    expect(isSessionAlive(s, { nowMs: NOW })).toEqual({ alive: true, reason: 'fresh_heartbeat' });
  });
});

// TS-8 regression: the existing SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 false-negative class (a
// legitimately-alive session) must still read alive via a downstream rung, for every status other
// than released/stale. FR-2 must not reintroduce the 4 documented false-"dead" incidents.
describe('isSessionAlive — TS-8 regression: no new false-negative for a legitimately-alive session', () => {
  it('a PARKED (raw is_alive frozen false by the UNREF churn) but genuinely alive worker still upgrades via PID/tick/silence, for status=active', () => {
    const s = {
      status: 'active', is_alive: false, heartbeat_age_seconds: 9999,
      terminal_id: 'win-cc-1234-88888',
    };
    const r = isSessionAlive(s, { nowMs: NOW, aliveCcPids: new Set(['88888']) });
    expect(r).toEqual({ alive: true, reason: 'pid_alive' });
  });

  it('a PARKED but genuinely alive worker with status=idle also still upgrades correctly', () => {
    const s = { status: 'idle', is_alive: false, heartbeat_age_seconds: 9999, process_alive_at: iso(NOW - 10 * 1000) };
    expect(isSessionAlive(s, { nowMs: NOW })).toEqual({ alive: true, reason: 'process_tick' });
  });
});

// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E — TS-4 END-TO-END: the exact stale-session-sweep.cjs
// holderRows query shape (read from source, not hand-picked), against the e60956f5 specimen. This
// is the acceptance test PLAN-phase testing-agent (bb6a3a1f) required: a hand-built fixture that
// merely SUPPLIES status proves nothing about whether the real call site actually selects it. If a
// future edit drops `status` from that query again, this test fails on the real column list, not a
// stand-in for it.
describe('isSessionAlive — TS-4 end-to-end: the real holderRows query shape closes the incident', () => {
  it('the holderRows SELECT in scripts/stale-session-sweep.cjs includes status, and against that column set the e60956f5 specimen reads dead', () => {
    const { readFileSync } = require('node:fs');
    const path = require('node:path');
    const src = readFileSync(path.join(__dirname, '../../../scripts/stale-session-sweep.cjs'), 'utf8');
    const m = src.match(/holderRows = await fapPaginate\(\(\) => supabase[\s\S]{0,800}?\.select\('([^']+)'\)/);
    expect(m, 'could not locate the holderRows .select(...) in scripts/stale-session-sweep.cjs').toBeTruthy();
    const columns = m[1].split(',').map((c) => c.trim());
    expect(columns).toContain('status');
    expect(columns).toContain('is_alive');

    // Build a row carrying EXACTLY those columns (nothing more, nothing less) shaped as the
    // e60956f5 specimen: released, is_alive stuck true, heartbeat 8h old, no PID, no tick, no
    // armed silence -- the pre-reboot worker that held QF-20260903-020/-722 for 8.6 hours.
    const specimen = {
      session_id: 'e60956f5-specimen', heartbeat_at: new Date(NOW - 8 * 60 * 60 * 1000).toISOString(),
      is_alive: true, status: 'released', terminal_id: null, process_alive_at: null, expected_silence_until: null,
    };
    const row = {};
    for (const col of columns) row[col] = specimen[col] ?? null;

    const r = isSessionAlive(row, { nowMs: NOW });
    expect(r).toEqual({ alive: false, reason: null });
  });
});

describe('authoritative predicates', () => {
  it('hasFreshHeartbeat honors heartbeat_age_seconds and heartbeat_at/last_heartbeat', () => {
    expect(hasFreshHeartbeat({ heartbeat_age_seconds: 100 }, NOW)).toBe(true);
    expect(hasFreshHeartbeat({ heartbeat_age_seconds: 400 }, NOW)).toBe(false);
    expect(hasFreshHeartbeat({ heartbeat_at: iso(NOW - 120 * 1000) }, NOW)).toBe(true);
    expect(hasFreshHeartbeat({ last_heartbeat: iso(NOW - 600 * 1000) }, NOW)).toBe(false);
  });
  it('hasTickAlive within 90s only', () => {
    expect(hasTickAlive({ process_alive_at: iso(NOW - 80 * 1000) }, NOW)).toBe(true);
    expect(hasTickAlive({ process_alive_at: iso(NOW - 100 * 1000) }, NOW)).toBe(false);
    expect(hasTickAlive({}, NOW)).toBe(false);
  });
  it('hasExpectedSilence: future and within 30min only', () => {
    expect(hasExpectedSilence({ expected_silence_until: iso(NOW + 5 * 60 * 1000) }, NOW)).toBe(true);
    expect(hasExpectedSilence({ expected_silence_until: iso(NOW + 40 * 60 * 1000) }, NOW)).toBe(false); // too far out
    expect(hasExpectedSilence({ expected_silence_until: iso(NOW - 1000) }, NOW)).toBe(false); // past
  });
  it('hasPidAlive parses the trailing cc pid from terminal_id', () => {
    expect(hasPidAlive({ terminal_id: 'win-cc-1234-42' }, new Set(['42']))).toBe(true);
    expect(hasPidAlive({ terminal_id: 'win-cc-1234-42' }, new Set(['99']))).toBe(false);
    expect(hasPidAlive({}, new Set(['42']))).toBe(false);
  });
});
