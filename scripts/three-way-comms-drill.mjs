// three-way-comms-drill.mjs — SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-E / FR-5.
//
// GENERALIZES scripts/coordinator-comms-check.mjs's radio-check→evidence pattern from the
// single coordinator<->worker leg to ALL THREE role pairs (Adam / coordinator / Solomon),
// producing a durable, comparable no-gaps EVIDENCE report. It EXTENDS the shipped primitives
// (dispatch.insertCoordinationRow/getThreadByTopicId, relay-queue, relay-drop-gauge,
// peer-target) — no new transport, no migration.
//
// Modes (args):
//   (default)        DETERMINISTIC self-loop. CI-safe + reproducible: drives the REAL primitives
//                    against an in-process session_coordination double using the drill's OWN
//                    session as both ends. Proves every lane CARRIES + CORRELATES + GROUPS-BY-TOPIC
//                    without needing the three roles live and WITHOUT touching real inboxes.
//   --live-observe   Additionally READS live topic threads + live roles from the real DB for a
//                    real snapshot (no injection into role inboxes).
//   --baseline       Persist this run's evidence report as the comparison baseline.
//   --rerun          Compare this run against the persisted baseline (regression detection).
//   --dry-run        Compute + print the report, but persist nothing and touch no real DB.
//   --purge-stale    Sweep orphaned payload.kind='comms_drill' rows from the real DB.
//
// ISOLATION: every injected row carries payload.kind='comms_drill' + drill:true + the per-run
// topic_id — a NON-directive, NON-signal_type, NON-relay_request kind, so worker/adam/solomon
// inbox drains, the friction signal-router, and the relay-drain all IGNORE it. Rows are cleaned
// up at end (delete by topic_id); --purge-stale sweeps any orphans.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { pathToFileURL } from 'node:url';
import { renderCount } from '../lib/db/fetch-all-paginated.mjs';

const require = createRequire(import.meta.url);
const { insertCoordinationRow, getThreadByTopicId } = require('../lib/coordinator/dispatch.cjs');
const { buildRelayRequestPayload, buildRelayConfirmPayload } = require('../lib/coordinator/relay-queue.cjs');
const { decideRelayDrops, resolveWindowMs } = require('../lib/coordinator/relay-drop-gauge.cjs');
const { resolvePeerTarget } = require('../lib/coordinator/peer-target.cjs');
const { PAYLOAD_KINDS, getServiceClient, getReadClient } = require('../lib/fleet/worker-status.cjs');

const SD_ID = 'SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-E';
// A fixed full-UUID self anchor for the deterministic self-loop (both sender + target). Full
// 8-4-4-4-12 so assertValidTarget accepts it; the in-memory double reports it as a live session.
export const DRILL_SELF_SESSION = '0d0d0d0d-0000-4000-8000-00000000d0d0';
export const ROLES = ['adam', 'coordinator', 'solomon'];

// Ordered (directed) role pairs — all 6 legs.
export const ORDERED_PAIRS = [];
for (const a of ROLES) for (const b of ROLES) if (a !== b) ORDERED_PAIRS.push([a, b]);

// Injected fixture resolvers so resolvePeerTarget resolves session-class targets WITHOUT any live
// role or DB — proving the lane-resolution primitive deterministically.
const FIXTURE_RESOLVERS = {
  getActiveAdamId: async () => 'adam-drill',
  getActiveSolomonId: async () => 'solomon-drill',
  getActiveCoordinatorId: async () => 'coordinator-drill',
  resolveAdamReplyTarget: async (_s, o) => ({ target: 'adam-drill', live: true, retargeted: false, originator: o }),
  resolveSolomonReplyTarget: async (_s, o) => ({ target: 'solomon-drill', live: true, retargeted: false, originator: o }),
};

/**
 * Canonical lane per unordered pair. Adam<->coordinator + coordinator<->Solomon are always DIRECT;
 * Adam<->Solomon is DIRECT when ADAM_SOLOMON_TWOWAY_V1 is on, else RELAY-with-confirm via coordinator.
 */
export function resolveLane(a, b, twoway) {
  const key = [a, b].slice().sort().join('|');
  if (key === 'adam|solomon') return twoway ? 'direct' : 'relay';
  return 'direct';
}

/** Build one isolated self-loop drill row (kind=comms_drill so all drains ignore it). */
export function buildDrillRow(from, to, correlationId, lane) {
  return {
    sender_session: DRILL_SELF_SESSION,
    target_session: DRILL_SELF_SESSION,
    sender_type: from,
    message_type: 'INFO',
    subject: `[comms_drill] ${from}->${to} (${lane})`,
    body: 'three-way comms drill ping',
    payload: { kind: 'comms_drill', drill: true, correlation_id: correlationId, from, to, lane },
  };
}

/**
 * In-process session_coordination + claude_sessions double. Serves exactly the query shapes the
 * real primitives issue (assertValidTarget lookup, insert, getThreadByTopicId group-by, topic delete)
 * so the deterministic proof runs the REAL functions with reproducible, isolated state.
 */
export function makeMemoryDb(anchorSession = DRILL_SELF_SESSION) {
  const sc = [];
  let seq = 0;
  const BASE = 1730000000000;
  const jget = (row, col) => col.startsWith('payload->>')
    ? (row.payload && row.payload[col.slice('payload->>'.length)])
    : row[col];
  function scQuery() {
    const filters = [];
    let op = 'select';
    let ordered = false;
    const runFilter = () => sc.filter((r) => filters.every(([c, v]) => String(jget(r, c)) === String(v)));
    const runSorted = () => runFilter().slice().sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
    const api = {
      select() { return api; },
      insert(row) {
        const stored = { ...row, id: `mem-${++seq}`, created_at: new Date(BASE + seq).toISOString() };
        sc.push(stored);
        const p = Promise.resolve({ data: [stored], error: null });
        p.select = () => { const q = Promise.resolve({ data: [stored], error: null }); q.single = () => Promise.resolve({ data: stored, error: null }); return q; };
        return p;
      },
      delete() { op = 'delete'; return api; },
      eq(c, v) { filters.push([c, v]); return api; },
      // FR-6 (count-truncation discipline): getThreadByTopicId now paginates via
      // fetchAllPaginated (.order(created_at).order(id tiebreaker).range(from, to)), so
      // order() is CHAINABLE (sort recorded, created_at primary) and the page resolves at
      // range(); a bare await after order() still resolves sorted via then() below.
      order() { ordered = true; return api; },
      range(from, to) {
        return Promise.resolve({ data: runSorted().slice(from, to + 1), error: null });
      },
      then(res, rej) {
        if (op === 'delete') {
          const matched = runFilter();
          for (const m of matched) { const i = sc.indexOf(m); if (i >= 0) sc.splice(i, 1); }
          return Promise.resolve({ data: matched, error: null }).then(res, rej);
        }
        return Promise.resolve({ data: ordered ? runSorted() : runFilter(), error: null }).then(res, rej);
      },
    };
    return api;
  }
  function csQuery() {
    let sid = null;
    const api = {
      select() { return api; },
      eq(c, v) { if (c === 'session_id') sid = v; return api; },
      limit() { return api; },
      maybeSingle() { return Promise.resolve({ data: sid === anchorSession ? { session_id: anchorSession } : null, error: null }); },
    };
    return api;
  }
  return { from(t) { return t === 'claude_sessions' ? csQuery() : scQuery(); }, _rows: sc };
}

function isNonDecreasing(arr) {
  for (let i = 1; i < arr.length; i++) if (String(arr[i - 1]) > String(arr[i])) return false;
  return true;
}

/**
 * NEGATIVE (a) — MISROUTE: the dispatch choke-point must REFUSE a bogus/dead target. A non-UUID
 * target throws DISPATCH_TARGET_INVALID before any insert (fully in-memory, no row written).
 */
export async function checkMisroute(db, topic) {
  try {
    await insertCoordinationRow(db, {
      sender_session: DRILL_SELF_SESSION, target_session: 'bogus-not-a-uuid', message_type: 'INFO',
      subject: '[comms_drill] misroute', payload: { kind: 'comms_drill', drill: true, topic_id: topic },
    }, { logger: { error() {}, warn() {} } }); // silent: the refusal IS the expected result
    return { ok: false, code: null, note: 'guard did NOT throw — refusal regressed' };
  } catch (e) {
    const code = (e && e.code) || null;
    return { ok: code === 'DISPATCH_TARGET_INVALID' || code === 'DISPATCH_TARGET_UNKNOWN', code };
  }
}

/**
 * NEGATIVE (b) — UNCONFIRMED RELAY: an aged inbound relay_request with NO matching confirm must be
 * FLAGGED by the pure drop-gauge core (fully in-memory, zero real rows).
 */
export function checkUnconfirmedRelay(now, windowMs) {
  const inbound = [{
    id: 'drill-unconfirmed-req',
    created_at: new Date(now - (windowMs + 60000)).toISOString(),
    payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'drill-uncorrelated' },
  }];
  const d = decideRelayDrops(inbound, [], { now, windowMs })[0];
  return { ok: !!d && d.action === 'flag', action: d && d.action, reason: d && d.reason };
}

/** Assemble the machine-readable no-gaps evidence report. */
export function buildReport({ mode, topic, twoway, windowMs, pairs, thread, orderedOk, misroute, unconfirmed, dryRun }) {
  const threadOk = orderedOk && thread.length === ORDERED_PAIRS.length;
  const allPairsOk = pairs.every((p) => p.delivered && p.recipient_confirmed);
  const no_gaps = allPairsOk && threadOk && misroute.ok && unconfirmed.ok;
  return {
    sd: SD_ID,
    fr: 'FR-5',
    artifact: 'three-way-comms-no-gaps-evidence',
    generated_at: new Date().toISOString(),
    mode,
    dry_run: !!dryRun,
    topic_id: topic,
    db: 'memory-double',
    adam_solomon_twoway_v1: twoway,
    drop_gauge_window_ms: windowMs,
    roles: ROLES,
    pairs: pairs.map((p) => ({
      pair: p.pair, lane: p.lane, resolved_kind: p.resolved_kind,
      delivered: p.delivered, recipient_confirmed: p.recipient_confirmed, correlation_id: p.correlation_id,
    })),
    thread_group_by: { topic_id: topic, row_count: thread.length, expected: ORDERED_PAIRS.length, ordered_ok: orderedOk },
    negative_checks: { misroute_refused: misroute, unconfirmed_relay_flagged: unconfirmed },
    standing_guards: {
      insert_lint_db_trigger: 'FR-3 (dep -D) session_coordination insert-lint trigger is ADVISORY (RAISE NOTICE only) — supabase-js does not surface it, so it is NOT asserted at runtime; it stands as a DB-side guard.',
      eslint_rule: 'FR-3 (dep -D) eslint rule flags raw session_coordination inserts that bypass insertCoordinationRow — standing static guard.',
      dispatch_choke_point: 'insertCoordinationRow.assertValidTarget refuses non-UUID/dead targets — asserted live above as negative_checks.misroute_refused.',
    },
    no_gaps,
  };
}

/**
 * CORE drill: for each ordered pair resolve the lane, send one drill message on it (DIRECT: a
 * self-loop insertCoordinationRow sharing the run topic_id; RELAY: a relay_request→relay_confirm
 * correlation match), then assert getThreadByTopicId returns the full ordered conversation, plus
 * the two in-memory negative checks. Pure w.r.t. the injected `db` — no process exit / no file IO.
 */
export async function runDrill({ db, mode = 'deterministic', twoway = false, windowMs = 15 * 60 * 1000, now = Date.now(), topic, dryRun = false } = {}) {
  topic = topic || `comms_drill:${new Date(now).toISOString().replace(/[:.]/g, '-')}:${Math.random().toString(36).slice(2, 8)}`;
  const pairs = [];
  for (const [a, b] of ORDERED_PAIRS) {
    const lane = resolveLane(a, b, twoway);
    const pt = await resolvePeerTarget(db, b, {}, FIXTURE_RESOLVERS); // proves lane target resolution
    const correlationId = `${topic}#${a}->${b}`;
    await insertCoordinationRow(db, buildDrillRow(a, b, correlationId, lane), { topicId: topic });
    let recipientConfirmed = true;
    if (lane === 'relay') {
      const reqP = buildRelayRequestPayload({ relayTo: b, body: 'drill', correlationId });
      const confP = buildRelayConfirmPayload({ correlationId: reqP.correlation_id, requestRowId: 'drill-req', relayedTo: b });
      recipientConfirmed = confP.correlation_id === reqP.correlation_id; // confirm-on-relay correlation
    }
    pairs.push({ pair: `${a}->${b}`, lane, resolved_kind: pt.kind, correlation_id: correlationId, recipient_confirmed: recipientConfirmed });
  }
  const { data: thread } = await getThreadByTopicId(db, topic);
  const rows = thread || [];
  const orderedOk = isNonDecreasing(rows.map((r) => r.created_at));
  const echoes = new Set(rows.map((r) => r.payload && r.payload.correlation_id));
  for (const p of pairs) p.delivered = echoes.has(p.correlation_id); // delivery via correlation echo
  const misroute = await checkMisroute(db, topic);
  const unconfirmed = checkUnconfirmedRelay(now, windowMs);
  return buildReport({ mode, topic, twoway, windowMs, pairs, thread: rows, orderedOk, misroute, unconfirmed, dryRun });
}

/** PURE baseline-vs-rerun comparison: a regression is any baseline-true assertion now false. */
export function compareReports(report, baseline) {
  if (!baseline) return { status: 'no_baseline', regressions: [] };
  const regressions = [];
  const bp = new Map((baseline.pairs || []).map((p) => [p.pair, p]));
  for (const p of report.pairs || []) {
    const b = bp.get(p.pair);
    if (!b) continue;
    if (b.lane !== p.lane) regressions.push(`${p.pair}: lane ${b.lane}->${p.lane}`);
    if (b.delivered && !p.delivered) regressions.push(`${p.pair}: delivered regressed`);
    if (b.recipient_confirmed && !p.recipient_confirmed) regressions.push(`${p.pair}: recipient_confirmed regressed`);
  }
  const bn = baseline.negative_checks || {}, rn = report.negative_checks || {};
  if (bn.misroute_refused && bn.misroute_refused.ok && !(rn.misroute_refused && rn.misroute_refused.ok)) regressions.push('misroute guard regressed');
  if (bn.unconfirmed_relay_flagged && bn.unconfirmed_relay_flagged.ok && !(rn.unconfirmed_relay_flagged && rn.unconfirmed_relay_flagged.ok)) regressions.push('unconfirmed-relay flag regressed');
  if (baseline.no_gaps && !report.no_gaps) regressions.push('no_gaps true->false');
  return { against: baseline.generated_at || null, status: regressions.length ? 'regression' : 'match', regressions };
}

function compareToBaseline(report, file) {
  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { status: 'no_baseline', against: file, regressions: [] }; }
  return compareReports(report, baseline);
}

function summaryLine(r) {
  const pairsLine = r.pairs.map((p) => `${p.pair}[${p.lane}]${p.delivered && p.recipient_confirmed ? 'ok' : 'GAP'}`).join(' ');
  return `[comms-drill] no_gaps=${r.no_gaps} | ${pairsLine} | misroute_refused=${r.negative_checks.misroute_refused.ok} unconfirmed_flagged=${r.negative_checks.unconfirmed_relay_flagged.ok}`
    + (r.comparison ? ` | compare=${r.comparison.status}` : '');
}

/** --live-observe: real-DB READ snapshot (topic threads + live roles). Fail-soft. */
async function tryLiveObserve(now) {
  try {
    const db = getReadClient();
    const since = new Date(now - 24 * 3600 * 1000).toISOString();
    const { data } = await db.from('session_coordination').select('id, sender_type, payload, created_at').gte('created_at', since).limit(500);
    const byTopic = {};
    for (const r of (data || [])) {
      const t = r.payload && r.payload.topic_id;
      if (!t) continue;
      byTopic[t] = byTopic[t] || { topic_id: t, count: 0, roles: new Set(), kinds: new Set() };
      byTopic[t].count++; byTopic[t].roles.add(r.sender_type); byTopic[t].kinds.add(r.payload.kind);
    }
    const liveSince = new Date(now - 15 * 60000).toISOString();
    const { data: sess } = await db.from('claude_sessions').select('session_id, metadata, heartbeat_at').gte('heartbeat_at', liveSince);
    const liveRoles = {};
    for (const s of (sess || [])) { const role = (s.metadata || {}).role; if (role) liveRoles[role] = (liveRoles[role] || 0) + 1; }
    return { threads: Object.values(byTopic).map((t) => ({ topic_id: t.topic_id, count: t.count, roles: [...t.roles], kinds: [...t.kinds] })), live_roles: liveRoles };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

/** --purge-stale: sweep orphaned comms_drill rows from the real DB. Fail-soft. */
async function purgeStaleDrillRows() {
  try {
    const db = getServiceClient();
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: was .select('id') then
    // data.length — a GAUGE (purge count only, ids never used) whose RETURNING representation
    // is capped at 1000 by PostgREST even though the DELETE itself is unbounded. Exact count
    // instead so a large stale backlog is never silently underreported.
    const { count, error } = await db.from('session_coordination').delete({ count: 'exact' }).eq('payload->>kind', 'comms_drill');
    if (error) throw error;
    return { purged: renderCount(count) };
  } catch (e) { return { purged: 0, error: String((e && e.message) || e) }; }
}

async function cleanupTopicRealBestEffort(topic) {
  try { const db = getServiceClient(); await db.from('session_coordination').delete().eq('payload->>topic_id', topic); } catch { /* no-op safety sweep */ }
}

async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  const argVal = (n) => { const p = args.find((a) => a.startsWith(n + '=')); return p ? p.slice(n.length + 1) : null; };
  const mode = has('--live-observe') ? 'live-observe' : 'deterministic';
  const dryRun = has('--dry-run');
  const doBaseline = has('--baseline');
  const doRerun = has('--rerun');
  const purgeStale = has('--purge-stale');
  const baselineFile = argVal('--baseline-file') || process.env.COMMS_DRILL_BASELINE || path.join(process.cwd(), '.comms-drill-baseline.json');

  const now = Date.now();
  // QF-20260705-488: read the SHARED gate (default now ON, off only on explicit 'off') instead of
  // a private regex — the drill previously said RELAY while the real gate routed DIRECT (drift).
  const { isAdamSolomonTwoWayV1Enabled } = await import('../lib/coordinator/resolve.cjs').then(m => m.default || m);
  const twoway = isAdamSolomonTwoWayV1Enabled();
  const windowMs = resolveWindowMs(process.env);
  const topic = `comms_drill:${new Date(now).toISOString().replace(/[:.]/g, '-')}:${Math.random().toString(36).slice(2, 8)}`;

  const db = makeMemoryDb(DRILL_SELF_SESSION);
  const report = await runDrill({ db, mode, twoway, windowMs, now, topic, dryRun });

  if (mode === 'live-observe') report.live_observe = await tryLiveObserve(now);
  if (purgeStale && !dryRun) report.purge_stale = await purgeStaleDrillRows();

  if (!dryRun) {
    await db.from('session_coordination').delete().eq('payload->>topic_id', topic); // cleanup (isolated store)
    await cleanupTopicRealBestEffort(topic); // real-DB safety sweep for this topic
  }
  if (doRerun) report.comparison = compareToBaseline(report, baselineFile);
  if (doBaseline && !dryRun) { fs.writeFileSync(baselineFile, JSON.stringify(report, null, 2)); report.baseline_written = baselineFile; }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  console.error(summaryLine(report));
  const clean = report.no_gaps && (!report.comparison || report.comparison.status !== 'regression');
  process.exitCode = clean ? 0 : 1;
  await shutdown();
}

/**
 * Windows UV_HANDLE_CLOSING avoidance (mirrors scripts/hooks/stop-loop-wakeup-reminder.cjs's
 * proven shutdown): the real-DB modes open undici keep-alive sockets — calling process.exit()
 * while they tear down aborts ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"). Close
 * the sockets and let the event loop drain so the process exits on its own with process.exitCode.
 */
async function shutdown() {
  setTimeout(() => process.exit(process.exitCode || 0), 8000).unref(); // unref'd drain backstop only
  try { await require('undici').getGlobalDispatcher().close(); } catch { /* undici absent/already closed */ }
  // Deliberately NO process.exit() here — returning lets Node exit once the loop drains.
}

if (pathToFileURL(process.argv[1] || '').href === import.meta.url) {
  main().catch((e) => { console.error('[comms-drill] fatal:', e); process.exitCode = 1; shutdown(); });
}
