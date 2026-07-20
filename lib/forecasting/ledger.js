// Forecast Ledger service — register / resolve / calibration.
// SD-LEO-FEAT-FORECAST-LEDGER-001. The supabase client is INJECTED (deps.supabase) so unit tests
// run fully mocked (no live table). All paths are FAIL-SOFT when the forecast_ledger table is
// absent (chairman-gated migration not yet applied) — mirrors lib/chairman/sms-bridge.js
// drainSmsRelayStaging (supabase-js resolves query errors as {data:null,error}, never throws).
import { brierScore, round3, meanBrier, interpretBrier } from './brier.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: calibration() aggregates Brier over ALL
// resolved forecasts (resolved is terminal — accumulates forever) — a silent 1000-row cap would skew
// the rollup. Paginate; tableAbsent() fail-soft preserved (fetchAllPaginated passes the PostgREST
// message through, which tableAbsent's regex still matches).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const TABLE = 'forecast_ledger';

/** True when a PostgREST error means the table does not exist (migration not applied). */
export function tableAbsent(error) {
  if (!error) return false;
  const code = error.code || '';
  if (code === '42P01' || code === 'PGRST205') return true;
  return /relation .*forecast_ledger.* does not exist|Could not find the table .*forecast_ledger/i.test(error.message || '');
}

/**
 * Register a SEALED forecast (status=open, no Brier yet). Returns {row} on success, or
 * {inert:true} if the table is absent. Throws only on genuine validation / write errors.
 */
export async function register(deps, opts = {}) {
  const sb = deps.supabase;
  const { question, questionClass, p, horizon, resolutionCriteria, model, registeredBy } = opts;
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error('forecast register: p must be a finite number in [0,1]');
  }
  if (!question || !questionClass || !resolutionCriteria) {
    throw new Error('forecast register: question, questionClass and resolutionCriteria are required');
  }
  const { data, error } = await sb.from(TABLE).insert({
    question,
    question_class: questionClass,
    p,
    horizon: horizon || null,
    resolution_criteria: resolutionCriteria,
    model: model || null,
    status: 'open',
    registered_by: registeredBy || null,
  }).select().single();
  if (error) {
    if (tableAbsent(error)) return { inert: true, reason: 'forecast_ledger absent (chairman-gated migration not applied)' };
    throw new Error('forecast register failed: ' + error.message);
  }
  return { row: data };
}

/**
 * Resolve a forecast: stamp resolved_outcome + provenance and compute Brier = round3((p-o)^2).
 * Rejects a re-resolve (belt-and-braces alongside the DB seal trigger). Fail-soft if table absent.
 */
export async function resolve(deps, { id, outcome, resolvedBy } = {}) {
  const sb = deps.supabase;
  if (!id) throw new Error('forecast resolve: id is required');
  const { data: cur, error: readErr } = await sb.from(TABLE).select('*').eq('id', id).single();
  if (readErr) {
    if (tableAbsent(readErr)) return { inert: true };
    throw new Error('forecast resolve read failed: ' + readErr.message);
  }
  if (!cur) throw new Error('forecast resolve: id not found: ' + id);
  if (cur.status === 'resolved') throw new Error('forecast resolve: already resolved: ' + id);
  const brier = round3(brierScore(cur.p, outcome));
  const { data, error } = await sb.from(TABLE).update({
    status: 'resolved',
    resolved_outcome: !!outcome,
    brier_score: brier,
    resolved_by: resolvedBy || null,
    resolved_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw new Error('forecast resolve failed: ' + error.message);
  return { row: data, brier_score: brier };
}

/**
 * Per-domain calibration rollup: Brier by question_class over RESOLVED forecasts. A pure READ —
 * never mutates, never graduates weight (every class stays weight:'advisory'). Fail-soft.
 */
export async function calibration(deps, { questionClass } = {}) {
  const sb = deps.supabase;
  let data;
  try {
    data = await fetchAllPaginated(() => {
      let q = sb.from(TABLE).select('question_class, brier_score').eq('status', 'resolved');
      if (questionClass) q = q.eq('question_class', questionClass);
      return q.order('id', { ascending: true }); // id tiebreaker: stable page boundaries (FR-6)
    });
  } catch (error) {
    if (tableAbsent(error)) return { inert: true, rollup: {} };
    throw new Error('forecast calibration failed: ' + error.message);
  }
  const byClass = {};
  for (const r of (data || [])) {
    if (r.brier_score == null) continue;
    (byClass[r.question_class] = byClass[r.question_class] || []).push(r.brier_score);
  }
  const rollup = {};
  for (const [cls, scores] of Object.entries(byClass)) {
    const mean = meanBrier(scores);
    rollup[cls] = { count: scores.length, mean_brier: mean, interpretation: interpretBrier(mean), weight: 'advisory' };
  }
  return { rollup };
}
