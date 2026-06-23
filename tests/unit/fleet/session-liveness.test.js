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
