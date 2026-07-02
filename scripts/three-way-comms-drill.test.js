/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-E / FR-5 — three-way comms verification drill.
 *
 * Unit-tests the PURE assembly + negative-path decisions against an in-process
 * session_coordination double (no live sessions, no real DB writes). Drives the REAL
 * primitives (insertCoordinationRow / getThreadByTopicId / resolvePeerTarget /
 * buildRelayConfirmPayload / decideRelayDrops) exactly as the CLI does.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  runDrill, makeMemoryDb, resolveLane, buildDrillRow, checkMisroute, checkUnconfirmedRelay,
  compareReports, ORDERED_PAIRS, DRILL_SELF_SESSION,
} from './three-way-comms-drill.mjs';

const require = createRequire(import.meta.url);
const { decideRelayDrops } = require('../lib/coordinator/relay-drop-gauge.cjs');

const AS_RE = /^(adam->solomon|solomon->adam)$/;

describe('resolveLane — canonical three-way lanes', () => {
  it('adam<->coordinator and coordinator<->solomon are always DIRECT', () => {
    expect(resolveLane('adam', 'coordinator', false)).toBe('direct');
    expect(resolveLane('coordinator', 'adam', false)).toBe('direct');
    expect(resolveLane('coordinator', 'solomon', false)).toBe('direct');
    expect(resolveLane('solomon', 'coordinator', true)).toBe('direct');
  });
  it('adam<->solomon is RELAY when ADAM_SOLOMON_TWOWAY_V1 is off, DIRECT when on', () => {
    expect(resolveLane('adam', 'solomon', false)).toBe('relay');
    expect(resolveLane('solomon', 'adam', false)).toBe('relay');
    expect(resolveLane('adam', 'solomon', true)).toBe('direct');
    expect(resolveLane('solomon', 'adam', true)).toBe('direct');
  });
});

describe('buildDrillRow — isolation tagging (kind=comms_drill, self-loop both ends)', () => {
  it('tags a non-directive/non-relay kind and a self-loop session on both ends', () => {
    const row = buildDrillRow('adam', 'coordinator', 'corr-1', 'direct');
    expect(row.payload.kind).toBe('comms_drill');
    expect(row.payload.drill).toBe(true);
    expect(row.sender_session).toBe(DRILL_SELF_SESSION);
    expect(row.target_session).toBe(DRILL_SELF_SESSION);
    expect(row.message_type).not.toBe('WORK_ASSIGNMENT');
  });
});

describe('runDrill — deterministic self-loop no-gaps proof', () => {
  it('all 6 ordered pairs deliver+confirm; thread groups by topic in order (twoway OFF)', async () => {
    const db = makeMemoryDb(DRILL_SELF_SESSION);
    const report = await runDrill({ db, twoway: false, now: 1730000000000, topic: 't-off' });
    expect(report.pairs).toHaveLength(ORDERED_PAIRS.length);
    expect(report.pairs.every((p) => p.delivered && p.recipient_confirmed)).toBe(true);
    // adam<->solomon is the RELAY lane when twoway is off; the other four legs are DIRECT.
    const relayLegs = report.pairs.filter((p) => AS_RE.test(p.pair));
    expect(relayLegs.every((p) => p.lane === 'relay')).toBe(true);
    expect(report.pairs.filter((p) => !AS_RE.test(p.pair)).every((p) => p.lane === 'direct')).toBe(true);
    // topic group-by: all six rows present + ordered.
    expect(report.thread_group_by.row_count).toBe(ORDERED_PAIRS.length);
    expect(report.thread_group_by.ordered_ok).toBe(true);
    // negative checks
    expect(report.negative_checks.misroute_refused.ok).toBe(true);
    expect(report.negative_checks.misroute_refused.code).toMatch(/DISPATCH_TARGET_(INVALID|UNKNOWN)/);
    expect(report.negative_checks.unconfirmed_relay_flagged.ok).toBe(true);
    expect(report.negative_checks.unconfirmed_relay_flagged.action).toBe('flag');
    expect(report.no_gaps).toBe(true);
  });

  it('twoway ON makes adam<->solomon DIRECT and stays no-gaps', async () => {
    const db = makeMemoryDb(DRILL_SELF_SESSION);
    const report = await runDrill({ db, twoway: true, now: 1730000000000, topic: 't-on' });
    const asLegs = report.pairs.filter((p) => AS_RE.test(p.pair));
    expect(asLegs).toHaveLength(2);
    expect(asLegs.every((p) => p.lane === 'direct')).toBe(true);
    expect(report.no_gaps).toBe(true);
  });
});

describe('checkMisroute — dispatch choke-point refusal (in-memory, zero rows written)', () => {
  it('the guard THROWS DISPATCH_TARGET_INVALID for a non-UUID target', async () => {
    const db = makeMemoryDb(DRILL_SELF_SESSION);
    const r = await checkMisroute(db, 'topic-x');
    expect(r.ok).toBe(true);
    expect(r.code).toBe('DISPATCH_TARGET_INVALID');
    expect(db._rows).toHaveLength(0); // nothing inserted — it refused before the write
  });
});

describe('checkUnconfirmedRelay — FR-3 drop gauge unconfirmed-relay flag', () => {
  it('flags an aged inbound relay_request with no matching confirm', () => {
    const r = checkUnconfirmedRelay(1730000000000, 15 * 60 * 1000);
    expect(r.ok).toBe(true);
    expect(r.action).toBe('flag');
  });
  it('decideRelayDrops leaves a fresh request PENDING within the window (guard against over-flagging)', () => {
    const now = 1730000000000;
    const inbound = [{ id: 'x', created_at: new Date(now - 1000).toISOString(), payload: { kind: 'relay_request', correlation_id: 'c' } }];
    expect(decideRelayDrops(inbound, [], { now, windowMs: 15 * 60 * 1000 })[0].action).toBe('pending');
  });
});

describe('compareReports — baseline vs rerun comparison', () => {
  it('reports MATCH when the assertions are unchanged across runs', async () => {
    const base = await runDrill({ db: makeMemoryDb(DRILL_SELF_SESSION), topic: 'b', now: 1730000000000 });
    const rerun = await runDrill({ db: makeMemoryDb(DRILL_SELF_SESSION), topic: 'r', now: 1730000000000 });
    const cmp = compareReports(rerun, base);
    expect(cmp.status).toBe('match');
    expect(cmp.regressions).toHaveLength(0);
  });
  it('flags a REGRESSION when a pair stops delivering', async () => {
    const base = await runDrill({ db: makeMemoryDb(DRILL_SELF_SESSION), topic: 'b2', now: 1730000000000 });
    const regressed = JSON.parse(JSON.stringify(base));
    regressed.pairs[0].delivered = false;
    regressed.no_gaps = false;
    const cmp = compareReports(regressed, base);
    expect(cmp.status).toBe('regression');
    expect(cmp.regressions.join(' ')).toMatch(/delivered regressed|no_gaps/);
  });
  it('returns no_baseline when no baseline is supplied', () => {
    expect(compareReports({ pairs: [] }, null).status).toBe('no_baseline');
  });
});
