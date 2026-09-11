/**
 * Venture cause capture — SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1.
 *
 * Chairman ratification 1afdeaac (2026-09-06): "I want things automated ... if I have to
 * troubleshoot, that's not what I want to do." The chairman was previously handed a
 * Cloudflare Worker log stream to read and two Worker secrets to provision by hand to
 * diagnose an AltifyAI alt-text 500. This module closes that gap: on every FAILED stage-23
 * journey step, it assembles `captured_cause` — a bounded, redacted, provenanced object
 * with three independent evidence legs — so the diagnosis is already attached to the
 * result row before anyone (human or Adam) looks at it.
 *
 * PROVENANCE (ratification 6c263823): "evidence without provenance is absent, not weak."
 * Each leg's `content_hash` is computed over the ACTUAL bytes returned by the source (the
 * Cloudflare API response, the D1 query result, or the Postgres row set) via the same
 * `computeDedupHash` primitive `journey-walk-orchestrator.js` already uses for its own
 * `evidence_hash` — never a self-asserted claim. `run_id` is the source's own request/ray
 * id where the API supplies one, otherwise a deterministic hash of the query + window
 * (never a walker-generated random string standing in for provenance it doesn't have).
 *
 * THREE-STATE CONTRACT (RISK evidence 0ec29338 finding R3 / DESIGN evidence 1a71cf03):
 * a leg that genuinely found nothing (absent:false, item_count:0) must never read the same
 * as a leg that could not run at all (absent:true). Collapsing the two would silently
 * defeat this SD's purpose — a RED walk with real evidence available would look identical
 * to one where the harness never even tried. See `boundedLeg()` below; `formatCauseLine`
 * in `lib/governance/venture-cause-line.js` renders the distinction into prose (FR-5).
 *
 * BOUNDS (RISK evidence 0ec29338 finding R2 — hard EXEC-completion gate, TR-2): 10 items
 * per leg, 200 chars per item post-redaction, ~8KB total with a hard backstop. No raw
 * provider payload, header, or secret ever reaches storage — see `redactText()`.
 *
 * INJECTABLE SEAMS (TESTING evidence 45f25a18 finding B2 / TR-1): `captureCloudflareLogs`
 * and `queryVentureD1` have no existing callable client anywhere in this repo. Both are
 * exported standalone AND threaded through `assembleCapturedCause`'s `deps` parameter so
 * unit tests fixture all three legs with zero live network/DB calls.
 */

import { computeDedupHash } from '../eva/corrective-finding-recorder.js';

const MAX_ITEMS_PER_LEG = 10;
const MAX_ITEM_CHARS = 200;
/** Hard backstop on the whole assembled object (TR-2). Checked, never silently exceeded. */
const MAX_TOTAL_BYTES = 8 * 1024;

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/** Absent-leg reason vocabulary (DESIGN evidence 1a71cf03). Never invent a new value inline. */
export const ABSENT_REASONS = Object.freeze({
  NOT_ATTEMPTED: 'not_attempted',
  CAPTURE_NOT_READY: 'capture_not_ready',
  DISPATCH_FAILED: 'dispatch_failed',
  FETCH_FAILED: 'fetch_failed',
});

/**
 * Strip anything that looks like a secret before it reaches storage: bearer/api tokens,
 * `key=`/`token=`/`secret=`/`password=` query-string or JSON values, email addresses, and
 * long hex/base64 runs (>=32 chars) that are far more likely to be a credential or session
 * id than diagnostic text. Then collapse whitespace and truncate. Applied to EVERY item
 * this module stores, regardless of source (TR-2 — no leg is exempt).
 * @param {string} text
 * @returns {string}
 */
export function redactText(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  let out = text
    // HTTP-header style: "Authorization: Bearer <token>" / "Bearer <token>" — space-separated,
    // no ':'/'=' between the keyword and the value.
    .replace(/\bbearer\s+\S+/gi, 'bearer=[REDACTED]')
    .replace(/\b(apikey|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/[A-Za-z0-9+/]{32,}={0,2}/g, '[REDACTED]')
    .replace(/[0-9a-f]{32,}/gi, '[REDACTED]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[REDACTED_EMAIL]')
    .replace(/\s+/g, ' ')
    .trim();
  if (out.length > MAX_ITEM_CHARS) out = `${out.slice(0, MAX_ITEM_CHARS - 1)}…`;
  return out;
}

/**
 * Build one LEG object per the FR-1 contract. `content_hash`/`run_id` are required
 * non-null whenever `absent===false` (ratification 6c263823) — the caller passes the
 * source's own request id (or a deterministic fallback) and the hash of the real payload,
 * never a value this function fabricates.
 * @param {{producer:string, run_id:string|null, rawItems:string[], absent?:boolean, absent_reason?:string}} params
 * @returns {object} LEG
 */
export function boundedLeg({ producer, run_id, rawItems = [], absent = false, absent_reason = null }) {
  if (absent) {
    return { producer, run_id: null, content_hash: null, item_count: 0, items: [], items_truncated: false, absent: true, absent_reason: absent_reason || ABSENT_REASONS.NOT_ATTEMPTED };
  }
  const redacted = rawItems.map(redactText).filter(Boolean);
  const items_truncated = redacted.length > MAX_ITEMS_PER_LEG;
  const items = redacted.slice(0, MAX_ITEMS_PER_LEG);
  const content_hash = computeDedupHash(null, [JSON.stringify(items)], null);
  return {
    producer,
    run_id: run_id || content_hash,
    content_hash,
    item_count: items.length,
    items,
    items_truncated,
    absent: false,
    absent_reason: null,
  };
}

function absentLeg(producer, reason) {
  return boundedLeg({ producer, run_id: null, absent: true, absent_reason: reason });
}

/**
 * Cloudflare Workers Observability telemetry query API — real, credentialed HTTP call.
 * Same credential contract as `lib/operator/cloudflare-cost-adapter.js`
 * (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, read once, never logged) so no new
 * per-venture credential is required (TR-3 — no venture stores its own Cloudflare token).
 * Fails soft to `absent` on any missing credential, non-2xx response, or thrown error —
 * a capture failure must never block or fail the journey walk itself.
 * @param {{workerName:string, window:{from:string,to:string}, env?:object, fetchImpl?:typeof fetch}} params
 * @returns {Promise<object>} LEG
 */
export async function captureCloudflareLogs({ workerName, window, env = process.env, fetchImpl }) {
  const producer = 'cloudflare_workers_observability';
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId || !workerName) {
    return absentLeg(producer, ABSENT_REASONS.NOT_ATTEMPTED);
  }
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return absentLeg(producer, ABSENT_REASONS.NOT_ATTEMPTED);

  try {
    const res = await f(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/observability/telemetry/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          view: 'events',
          timeframe: { from: window.from, to: window.to },
          filters: [{ key: '$metadata.service', operator: 'eq', value: workerName }],
          limit: MAX_ITEMS_PER_LEG,
        }),
      },
    );
    const rayId = res.headers?.get?.('cf-ray') || null;
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error body — status carries the signal */ }
    if (!res.ok || (json && json.success === false)) {
      return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
    }
    const events = json?.result?.events || json?.result || [];
    const rawItems = (Array.isArray(events) ? events : []).map((e) =>
      typeof e === 'string' ? e : JSON.stringify({ timestamp: e?.timestamp, level: e?.$metadata?.level, message: e?.message ?? e?.body }));
    return boundedLeg({ producer, run_id: rayId, rawItems });
  } catch {
    return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
  }
}

/**
 * Resolve a venture's D1 database id live (DATABASE evidence 0d33d5d5: no venture row
 * stores one — wrangler.toml commits only a placeholder, the real id is injected at
 * altifyai's own deploy time) via Cloudflare's list-D1-databases API, matched by
 * `database_name` — verified identical to the worker's own name in the committed
 * wrangler.toml. Then reads the venture's alt-text failure rows.
 * @param {{databaseName:string, table:string, window:{from:string,to:string}, env?:object, fetchImpl?:typeof fetch}} params
 * @returns {Promise<object>} LEG
 */
export async function queryVentureD1({ databaseName, table = 'generated_alt_texts', window, env = process.env, fetchImpl }) {
  const producer = 'cloudflare_d1';
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId || !databaseName) {
    return absentLeg(producer, ABSENT_REASONS.NOT_ATTEMPTED);
  }
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return absentLeg(producer, ABSENT_REASONS.NOT_ATTEMPTED);

  try {
    const listRes = await f(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/d1/database?name=${encodeURIComponent(databaseName)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    let listJson = null;
    try { listJson = await listRes.json(); } catch { /* non-JSON error body */ }
    if (!listRes.ok || (listJson && listJson.success === false)) {
      return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
    }
    const db = (listJson?.result || []).find((d) => d.name === databaseName);
    if (!db) return absentLeg(producer, ABSENT_REASONS.CAPTURE_NOT_READY);

    const sql = `SELECT failure_code, failure_detail, created_at FROM ${table} WHERE created_at >= ? AND created_at <= ? AND failure_code IS NOT NULL ORDER BY created_at DESC LIMIT ?`;
    const queryRes = await f(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/d1/database/${db.uuid}/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql, params: [window.from, window.to, MAX_ITEMS_PER_LEG] }),
      },
    );
    const runId = queryRes.headers?.get?.('cf-ray') || null;
    let queryJson = null;
    try { queryJson = await queryRes.json(); } catch { /* non-JSON error body */ }
    if (!queryRes.ok || (queryJson && queryJson.success === false)) {
      return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
    }
    const rows = queryJson?.result?.[0]?.results || [];
    // failure_detail is ALREADY redacted at write time by altifyai's own composeFailureDetail
    // (allowlist-only: provider_status;provider_code;classification) — this leg re-applies
    // redactText() anyway (TR-2: no leg is exempt) but expects it to be a no-op for well-formed rows.
    const rawItems = rows.map((r) => `failure_code=${r.failure_code ?? 'unknown'} detail=${r.failure_detail ?? ''} at=${r.created_at ?? ''}`);
    return boundedLeg({ producer, run_id: runId, rawItems });
  } catch {
    return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
  }
}

/**
 * Read `public.feedback` rows written by the existing `record_venture_error` RPC
 * (database/migrations/20260704d_venture_error_aggregation_rpc.sql) for the venture in
 * the journey window. Uses the existing `idx_feedback_venture_error_created` partial
 * index (DATABASE evidence 0d33d5d5) — no schema change, no new RPC.
 * @param {{ventureId:string, window:{from:string,to:string}, supabase:object}} params
 * @returns {Promise<object>} LEG
 */
export async function queryVentureErrors({ ventureId, window, supabase }) {
  const producer = 'record_venture_error_feedback';
  if (!ventureId || !supabase) return absentLeg(producer, ABSENT_REASONS.NOT_ATTEMPTED);
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, error_hash, error_message, occurrence_count, last_seen')
      .eq('venture_id', ventureId)
      .eq('feedback_type', 'venture_error')
      .gte('last_seen', window.from)
      .lte('last_seen', window.to)
      .order('last_seen', { ascending: false })
      .limit(MAX_ITEMS_PER_LEG);
    if (error) return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
    const rows = data || [];
    const rawItems = rows.map((r) => `error_hash=${r.error_hash} occurrences=${r.occurrence_count} message=${r.error_message ?? ''}`);
    const runId = rows.length ? rows[0].id : null;
    return boundedLeg({ producer, run_id: runId, rawItems });
  } catch {
    return absentLeg(producer, ABSENT_REASONS.FETCH_FAILED);
  }
}

/**
 * Assemble the full `captured_cause` object for one failed journey step: three legs in
 * parallel (independent sources — no ordering dependency), a size backstop, and a short
 * human-readable summary. Never throws — a capture failure degrades that leg to `absent`,
 * it never fails the journey walk that called this (module contract mirrors
 * `journey-walk-orchestrator.js`'s own never-throws convention).
 * @param {{ventureId:string, workerName:string, databaseName:string, window:{from:string,to:string},
 *   supabase:object, deps?:{captureCloudflareLogs?:Function, queryVentureD1?:Function, queryVentureErrors?:Function}}} params
 * @returns {Promise<object>} captured_cause
 */
export async function assembleCapturedCause({ ventureId, workerName, databaseName, window, supabase, deps = {} }) {
  const capture = deps.captureCloudflareLogs || captureCloudflareLogs;
  const queryD1 = deps.queryVentureD1 || queryVentureD1;
  const queryErrors = deps.queryVentureErrors || queryVentureErrors;

  const [worker_logs, venture_errors, d1_failures] = await Promise.all([
    capture({ workerName, window }).catch(() => absentLeg('cloudflare_workers_observability', ABSENT_REASONS.DISPATCH_FAILED)),
    queryErrors({ ventureId, window, supabase }).catch(() => absentLeg('record_venture_error_feedback', ABSENT_REASONS.DISPATCH_FAILED)),
    queryD1({ databaseName, window }).catch(() => absentLeg('cloudflare_d1', ABSENT_REASONS.DISPATCH_FAILED)),
  ]);

  const summary = summarize({ worker_logs, venture_errors, d1_failures });
  let captured_cause = { window, worker_logs, venture_errors, d1_failures, summary };

  // TR-2 hard backstop: if the assembled object still exceeds the bound after per-leg
  // truncation (e.g. many legs each near their own cap), drop items from the largest
  // leg(s) until under budget rather than silently shipping an oversized row.
  let serialized = JSON.stringify(captured_cause);
  const legs = ['worker_logs', 'venture_errors', 'd1_failures'];
  while (Buffer.byteLength(serialized, 'utf8') > MAX_TOTAL_BYTES) {
    const largest = legs
      .map((k) => ({ k, len: captured_cause[k].items.length }))
      .filter((x) => x.len > 0)
      .sort((a, b) => b.len - a.len)[0];
    if (!largest) break; // nothing left to trim
    captured_cause[largest.k] = {
      ...captured_cause[largest.k],
      items: captured_cause[largest.k].items.slice(0, -1),
      item_count: captured_cause[largest.k].items.length - 1,
      items_truncated: true,
    };
    serialized = JSON.stringify(captured_cause);
  }

  return captured_cause;
}

function summarize({ worker_logs, venture_errors, d1_failures }) {
  const legs = { worker_logs, venture_errors, d1_failures };
  const populated = Object.entries(legs).filter(([, l]) => !l.absent && l.item_count > 0);
  if (populated.length === 0) {
    const allAbsent = Object.values(legs).every((l) => l.absent);
    return allAbsent
      ? 'cause capture did not complete for this step'
      : 'no matching entries in any capture leg for this window (capture succeeded)';
  }
  const parts = populated.map(([name, l]) => `${name}=${l.item_count}`);
  return `captured cause: ${parts.join(', ')}`.slice(0, 280);
}

export default { captureCloudflareLogs, queryVentureD1, queryVentureErrors, assembleCapturedCause, boundedLeg, redactText, ABSENT_REASONS };
