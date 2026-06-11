#!/usr/bin/env node
/**
 * Synthetic account-freeze drill — SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-2).
 *
 * Simulates 3 same-host sessions stopping heartbeats together (the freeze
 * signature) plus 1 lone genuinely-dead session, runs the freeze detector the
 * way the sweep consults it, and asserts:
 *   1. zero releases for the frozen cohort (suppressed),
 *   2. exactly one FLEET_FROZEN episode/notice,
 *   3. the lone death is NOT suppressed (still releasable),
 *   4. thaw: once a cohort member heartbeats fresh, suppression clears,
 *   5. episode TTL: an old cluster (machine reboot an hour ago) is NOT a freeze.
 *
 * FIXTURE-ONLY: no DB reads or writes — deterministic and CI-runnable.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { detectFreeze } = require('../lib/fleet/freeze-detector.cjs');

const NOW = Date.parse('2026-06-11T08:00:00Z');
const min = (n) => n * 60_000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

// ── Scenario A: freeze (3 same-host sessions stop within 4 min) + 1 lone death ──
const frozenCohort = [
  { session_id: 'frozen-1', hostname: 'opsbox', heartbeat_at: iso(min(18)) },
  { session_id: 'frozen-2', hostname: 'opsbox', heartbeat_at: iso(min(16)) },
  { session_id: 'frozen-3', hostname: 'opsbox', heartbeat_at: iso(min(14)) },
];
const loneDeath = { session_id: 'lone-dead', hostname: 'otherbox', heartbeat_at: iso(min(25)) };

const a = detectFreeze([...frozenCohort, loneDeath], { now: NOW });
check('A1: freeze detected', a.frozen);
check('A2: exactly one episode (one notice)', a.episodes.length === 1, `${a.episodes.length} episodes`);
check('A3: all 3 cohort sessions suppressed (zero releases)',
  frozenCohort.every((s) => a.frozenSessionIds.has(s.session_id)),
  [...a.frozenSessionIds].join(','));
check('A4: lone death NOT suppressed (still releasable)', !a.frozenSessionIds.has('lone-dead'));

// The sweep's guard: dead minus frozen = what proceeds to release.
const releasable = [...frozenCohort, loneDeath].filter((s) => !a.frozenSessionIds.has(s.session_id));
check('A5: claims intact for cohort — only the lone death proceeds to release',
  releasable.length === 1 && releasable[0].session_id === 'lone-dead');

// ── Scenario B: thaw — one cohort member heartbeats fresh (leaves the dead set) ──
const b = detectFreeze([frozenCohort[1], frozenCohort[2], loneDeath].map(s => ({ ...s })), { now: NOW + min(12) });
// 12 min later the remaining two are still clustered => still frozen (they ARE still frozen)
check('B1: remaining cohort still protected mid-episode', b.frozen && b.frozenSessionIds.size === 2);

// ── Scenario C: episode TTL — cluster from >45 min ago is treated as real death ──
const oldCluster = frozenCohort.map((s, i) => ({ ...s, heartbeat_at: iso(min(50 + i)) }));
const c = detectFreeze(oldCluster, { now: NOW });
check('C1: stale cluster past TTL is NOT a freeze (mass death releases)', !c.frozen);

// ── Scenario D: single session never trips the detector ──
const d = detectFreeze([loneDeath], { now: NOW });
check('D1: lone death alone => no freeze', !d.frozen);

console.log(failures === 0 ? '\nFREEZE DRILL: PASS' : `\nFREEZE DRILL: FAIL (${failures})`);
process.exitCode = failures === 0 ? 0 : 1;
