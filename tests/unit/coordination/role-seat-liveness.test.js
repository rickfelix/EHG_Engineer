// QF-20260905-201 — role-seat dead-process retire path for the Adam and Solomon singleton guards.
// Hermetic: the process probe and hostname are injected; no live DB, no real process table.
//
// Live specimen (measured 2026-09-05 08:31:43Z, EHG_Engineer root): Adam seat 1b847de2 closed by
// the chairman at ~08:28:15Z; successor process started 08:28:42Z; register REFUSED at 08:29:34Z
// because heartbeat_at (08:28:15Z) was inside the 10-minute window, while pid 57172 was already
// absent from the process table (Get-Process -Id 57172 -> nothing).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isSeatProcessDead } = require('../../../lib/coordinator/role-seat-liveness.cjs');
const adam = require('../../../lib/coordinator/adam-identity.cjs');
const solomon = require('../../../lib/coordinator/solomon-identity.cjs');

const HOST = 'Legion-Laptop';
const NOW = Date.parse('2026-09-05T08:31:43.299Z');
const SPECIMEN = {
  session_id: '1b847de2-bea2-4ed1-bfdd-c467a46a83bf',
  status: 'active',
  hostname: HOST,
  pid: 57172,
  heartbeat_at: '2026-09-05T08:28:15.796+00:00',
  last_tool_at: '2026-09-05T08:28:15.576+00:00',
  metadata: { role: 'adam', non_fleet: true, cc_pid: '57172', cc_parent_pid: '57172' },
};
const gone = () => 'ESRCH';
const alive = () => 'ALIVE';

describe('isSeatProcessDead (sound in the dead direction only)', () => {
  it('same host + pid bound to cc_pid + ESRCH => provably dead', () => {
    expect(isSeatProcessDead(SPECIMEN, { hostname: HOST, probe: gone })).toBe(true);
  });
  it('hostname compare is case-insensitive', () => {
    expect(isSeatProcessDead(SPECIMEN, { hostname: 'legion-laptop', probe: gone })).toBe(true);
  });
  it('a live process is never dead', () => {
    expect(isSeatProcessDead(SPECIMEN, { hostname: HOST, probe: alive })).toBe(false);
  });
  it('EPERM / any non-ESRCH probe result is "cannot say", not dead', () => {
    expect(isSeatProcessDead(SPECIMEN, { hostname: HOST, probe: () => 'UNKNOWN' })).toBe(false);
    expect(isSeatProcessDead(SPECIMEN, { hostname: HOST, probe: () => { throw new Error('boom'); } })).toBe(false);
  });
  it('a different host cannot be probed => false even when the probe says ESRCH', () => {
    expect(isSeatProcessDead(SPECIMEN, { hostname: 'other-box', probe: gone })).toBe(false);
    expect(isSeatProcessDead({ ...SPECIMEN, hostname: undefined }, { hostname: HOST, probe: gone })).toBe(false);
  });
  it('pid must be the Claude Code process (== metadata.cc_pid), never an unbound or child pid', () => {
    expect(isSeatProcessDead({ ...SPECIMEN, metadata: {} }, { hostname: HOST, probe: gone })).toBe(false);
    expect(isSeatProcessDead({ ...SPECIMEN, metadata: { cc_pid: '999' } }, { hostname: HOST, probe: gone })).toBe(false);
    expect(isSeatProcessDead({ ...SPECIMEN, metadata: { cc_parent_pid: 57172 } }, { hostname: HOST, probe: gone })).toBe(true);
  });
  it('garbage pid / row => false', () => {
    expect(isSeatProcessDead({ ...SPECIMEN, pid: null }, { hostname: HOST, probe: gone })).toBe(false);
    expect(isSeatProcessDead({ ...SPECIMEN, pid: -5 }, { hostname: HOST, probe: gone })).toBe(false);
    expect(isSeatProcessDead(null, { hostname: HOST, probe: gone })).toBe(false);
  });
  it('never calls the probe when the input guards fail (no host-touching side effects)', () => {
    let calls = 0;
    isSeatProcessDead({ ...SPECIMEN, hostname: 'elsewhere' }, { hostname: HOST, probe: () => { calls += 1; return 'ESRCH'; } });
    expect(calls).toBe(0);
  });
});

describe('decideSingleAdamGuard with a dead-process prior (QF-20260905-201)', () => {
  const self = 'd1140357-03ab-4aca-8658-c374e1701efa';
  const dead = (row) => isSeatProcessDead(row, { hostname: HOST, probe: gone });
  const live = (row) => isSeatProcessDead(row, { hostname: HOST, probe: alive });

  it('live specimen: heartbeat-fresh but process gone => RETIRE (was: refuse for 10 min)', () => {
    const d = adam.decideSingleAdamGuard({ priorAdams: [SPECIMEN], selfSessionId: self, nowMs: NOW, isProcessDead: dead });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retire).toEqual([SPECIMEN.session_id]);
    expect(d.retireDeadProcess).toEqual([SPECIMEN.session_id]);
    expect(d.retireHeartbeatStale).toEqual([]);
    expect(d.retireToolStuck).toEqual([]);
    expect(d.freshPriors).toEqual([]);
  });
  it('same specimen with a LIVE process => REFUSE unchanged (existence never proves anything, so heartbeat rules)', () => {
    const d = adam.decideSingleAdamGuard({ priorAdams: [SPECIMEN], selfSessionId: self, nowMs: NOW, isProcessDead: live });
    expect(d.action).toBe('refuse');
    expect(d.retireDeadProcess).toEqual([]);
    expect(d.freshPriors).toEqual([SPECIMEN.session_id]);
  });
  it('default (no predicate injected) is the pre-QF behaviour: refuse', () => {
    const d = adam.decideSingleAdamGuard({ priorAdams: [SPECIMEN], selfSessionId: self, nowMs: NOW });
    expect(d.action).toBe('refuse');
    expect(d.retireDeadProcess).toEqual([]);
  });
  it('a throwing predicate is treated as "cannot say" (fail-closed toward refuse)', () => {
    const d = adam.decideSingleAdamGuard({ priorAdams: [SPECIMEN], selfSessionId: self, nowMs: NOW, isProcessDead: () => { throw new Error('probe broke'); } });
    expect(d.action).toBe('refuse');
  });
  it('a dead-process prior never leaks into the heartbeat-stale or tool-stuck buckets', () => {
    const staleToo = { ...SPECIMEN, session_id: 'old', heartbeat_at: '2026-09-05T06:00:00Z', pid: 111, metadata: { cc_pid: 111 } };
    const d = adam.decideSingleAdamGuard({ priorAdams: [SPECIMEN, staleToo], selfSessionId: self, nowMs: NOW, isProcessDead: dead });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retireDeadProcess.sort()).toEqual([SPECIMEN.session_id, 'old'].sort());
    expect(d.retireHeartbeatStale).toEqual([]);
    expect(d.retire.length).toBe(2);
  });
  it('a genuinely fresh prior on ANOTHER host still dominates (dead-process is host-local proof only)', () => {
    const remote = { ...SPECIMEN, session_id: 'remote', hostname: 'other-box' };
    const d = adam.decideSingleAdamGuard({ priorAdams: [SPECIMEN, remote], selfSessionId: self, nowMs: NOW, isProcessDead: dead });
    expect(d.action).toBe('refuse');
    expect(d.freshPriors).toEqual(['remote']);
  });
});

describe('decideSingleSolomonGuard mirrors the dead-process path', () => {
  const self = 'new-solomon';
  const dead = (row) => isSeatProcessDead(row, { hostname: HOST, probe: gone });
  const spec = { ...SPECIMEN, session_id: 'old-solomon', metadata: { role: 'solomon', cc_pid: 57172 } };
  it('heartbeat-fresh but process gone => RETIRE', () => {
    const d = solomon.decideSingleSolomonGuard({ priorSolomons: [spec], selfSessionId: self, nowMs: NOW, isProcessDead: dead });
    expect(d.action).toBe('retire_stale_then_register');
    expect(d.retireDeadProcess).toEqual(['old-solomon']);
    expect(d.retireToolStuck).toEqual([]);
  });
  it('default (no predicate) => refuse, unchanged', () => {
    const d = solomon.decideSingleSolomonGuard({ priorSolomons: [spec], selfSessionId: self, nowMs: NOW });
    expect(d.action).toBe('refuse');
    expect(d.retireDeadProcess).toEqual([]);
  });
});
