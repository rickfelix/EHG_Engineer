#!/usr/bin/env node
/**
 * Venture telemetry daily PULL — SD-LEO-INFRA-VENTURE-TELEMETRY-PULL-001-C (Layer 2 consumer).
 *
 * ONE-WAY by construction: the only outbound call is an HTTP GET of each active venture's
 * authenticated /v1/metrics; the only DB write is a service-role write into EHG's OWN
 * public.venture_telemetry table. EHG never opens or writes a venture database.
 *
 * FAIL SOFT per venture: a missing endpoint/key, non-200, bad JSON, or unsupported
 * contract_version skips that venture (records ingest_status + note) WITHOUT overwriting a
 * prior good rollup's metrics, and never aborts the run. The job exits 0 so one venture's
 * outage cannot block the others or the daily schedule.
 *
 * D5: the per-venture read key is resolved from applications.metrics_api_key_ref, which holds
 * the NAME of an env var / secret — never the raw key.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

/** Accept any contract whose MAJOR version matches the producer's; fail soft on others. */
export const EXPECTED_CONTRACT_MAJOR = '1';

export function isContractCompatible(version) {
  return typeof version === 'string' && version.split('.')[0] === EXPECTED_CONTRACT_MAJOR;
}

/** Ingest-metadata subset — what we write on EVERY outcome (never clobbers metric columns). */
function ingestMeta(app, { ingest_status, ingest_note = null, httpStatus = null, sourceUrl = null }, now) {
  return {
    application_id: app.id,
    venture_id: app.venture_id ?? null,
    source_url: sourceUrl,
    http_status: httpStatus,
    ingest_status,
    ingest_note,
    pulled_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

/** Full upsert row for a SUCCESSFUL pull (metric columns + metadata). Pure. */
export function buildOkRow(app, payload, { httpStatus, sourceUrl }, now = new Date()) {
  return {
    ...ingestMeta(app, { ingest_status: 'ok', httpStatus, sourceUrl }, now),
    contract_version: payload.contract_version ?? null,
    window_days: payload.window_days ?? null,
    since: payload.since ?? null,
    generated_at: payload.generated_at ?? null,
    total: payload.total ?? 0,
    by_verdict: payload.by_verdict ?? {},
    by_mode: payload.by_mode ?? {},
    by_model: payload.by_model ?? {},
    avg_confidence: payload.avg_confidence ?? null,
    dry_run_count: payload.dry_run_count ?? null,
    raw_payload: payload,
  };
}

/**
 * Pull one venture's /v1/metrics. Pure w.r.t. injected deps (fetchFn, env, now) — performs
 * NO database access (one-way: HTTP GET only). NEVER throws. Returns:
 *   { outcome: 'ok',   okRow, log }                     -> caller upserts the full row
 *   { outcome: <fail>, meta, log }                      -> caller updates metadata only
 */
export async function pullVenture(app, { fetchFn, env = process.env, now = new Date() } = {}) {
  const f = fetchFn ?? fetch;
  const baseUrl = app.metrics_base_url;
  const keyRef = app.metrics_api_key_ref;
  const sourceUrl = baseUrl ? `${String(baseUrl).replace(/\/+$/, '')}/v1/metrics` : null;

  const fail = (ingest_status, ingest_note, httpStatus = null) => ({
    outcome: ingest_status,
    meta: ingestMeta(app, { ingest_status, ingest_note, httpStatus, sourceUrl }, now),
    log: { venture: app.name, status: ingest_status, note: ingest_note },
  });

  if (!baseUrl) return fail('skipped', 'no metrics_base_url configured');
  const apiKey = keyRef ? env?.[keyRef] : undefined;
  if (!apiKey) return fail('skipped', `api key ref '${keyRef ?? '(none)'}' not resolvable from env`);

  let res;
  try {
    res = await f(sourceUrl, { method: 'GET', headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } });
  } catch (err) {
    return fail('error', `fetch threw: ${err?.message || err}`);
  }
  const httpStatus = res.status;
  if (!res.ok) return fail('error', `HTTP ${httpStatus}`, httpStatus);

  let payload;
  try { payload = await res.json(); } catch (err) { return fail('error', `invalid JSON: ${err?.message || err}`, httpStatus); }

  if (!isContractCompatible(payload?.contract_version)) {
    return fail('version_mismatch', `unsupported contract_version '${payload?.contract_version ?? '(missing)'}' (expected major ${EXPECTED_CONTRACT_MAJOR})`, httpStatus);
  }
  return {
    outcome: 'ok',
    okRow: buildOkRow(app, payload, { httpStatus, sourceUrl }, now),
    log: { venture: app.name, status: 'ok', total: payload.total },
  };
}

function jlog(obj) { process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n'); }

/** Persist one pull result. ok -> full upsert; failure -> update metadata only (preserve a
 *  prior good rollup), inserting a metadata marker only when no row exists yet. */
export async function persistResult(supabase, app, result) {
  if (result.outcome === 'ok') {
    const { error } = await supabase.from('venture_telemetry').upsert(result.okRow, { onConflict: 'application_id' });
    return { error };
  }
  const { data: updated, error: updErr } = await supabase
    .from('venture_telemetry').update(result.meta).eq('application_id', app.id).select('id');
  if (updErr) return { error: updErr };
  if (!updated || updated.length === 0) {
    const { error: insErr } = await supabase.from('venture_telemetry').insert(result.meta);
    return { error: insErr };
  }
  return { error: null };
}

export async function main({ supabase, env = process.env, fetchFn, now = new Date() } = {}) {
  const { data: ventures, error } = await supabase
    .from('applications')
    .select('id, name, venture_id, status, kind, metrics_base_url, metrics_api_key_ref')
    .eq('kind', 'venture')
    .eq('status', 'active');
  if (error) { jlog({ action: 'list_ventures', status: 'error', error: error.message }); throw new Error(`list ventures failed: ${error.message}`); }

  const summary = { total: ventures?.length || 0, ok: 0, skipped: 0, version_mismatch: 0, error: 0 };
  for (const app of ventures || []) {
    const result = await pullVenture(app, { fetchFn, env, now });
    summary[result.outcome] = (summary[result.outcome] ?? 0) + 1;
    const { error: persistErr } = await persistResult(supabase, app, result);
    jlog({ action: 'pull', ...result.log, persist_error: persistErr?.message ?? null });
  }
  jlog({ action: 'summary', ...summary });
  return summary;
}

// CLI entry — skipped when imported by tests.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(url, key);
  main({ supabase })
    .then((s) => { jlog({ action: 'done', ...s }); process.exit(0); })
    .catch((err) => { console.error('[venture-telemetry-pull] fatal:', err); process.exit(1); });
}
