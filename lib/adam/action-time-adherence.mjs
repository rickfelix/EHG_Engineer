/**
 * action-time-adherence.mjs — SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 (FR-2).
 *
 * Runs the CARDINAL Adam adherence probes at ACTION-TIME (per-tick / pre-advisory-send), not only
 * in the 6h retrospective audit, and records a DB-validated verdict to adam_adherence_ledger —
 * but ONLY on a verdict transition (dedupe-on-change), so steady-state PASS ticks write nothing.
 *
 * Cardinal safety contract (per VALIDATION): flag-gated (default-OFF), FAIL-OPEN, WARN-only —
 * this MUST NEVER block Adam's tick or an advisory send. Any error degrades to a no-op + warn.
 */
import { randomUUID } from 'node:crypto';
import { runCardinalProbes, decideLedgerWrites } from './adherence-probes.js';

/** Is the action-time check enabled? Default-OFF; mirror the COORD_ADAM_ACTION_ACK_V1 flag style. */
export function isActionTimeAdherenceEnabled(env = process.env) {
  return String(env?.ADAM_ACTION_TIME_ADHERENCE_V1 ?? '').trim().toLowerCase() === 'on';
}

/**
 * PURE — fetch the latest verdict-by-probe map from a list of recent ledger rows (newest first).
 * Used to dedupe-on-change. Returns { probe: verdict } from the most recent row per probe.
 * @param {Array<{probe:string, verdict:string, created_at?:string}>} rows
 */
export function latestVerdictsByProbe(rows = []) {
  const out = {};
  for (const r of rows || []) {
    if (r && r.probe && !(r.probe in out)) out[r.probe] = r.verdict;
  }
  return out;
}

/**
 * IO — run the cardinal probes over resolved facts and record ONLY changed verdicts. Fail-open:
 * returns a result summary and NEVER throws (any error → { ok:false, recorded:0, warn }).
 *
 * @param {object} deps
 * @param {object} deps.supabase - service-role client (from()/select()/insert())
 * @param {object} deps.facts - resolved cardinal-probe facts (claimableBelt, idleWorkers, sourceableBacklogCount, advisoryBody, adamAuthoredBuildsInWindow)
 * @param {function} [deps.recordAdherence] - the canonical ledger writer (supabase, runId, bar) — injectable for tests
 * @param {boolean} [deps.enabled] - override the flag (defaults to isActionTimeAdherenceEnabled())
 * @param {function} [deps.warn] - warn sink (default console.warn)
 * @returns {Promise<{ok:boolean, recorded:number, bars:Array, warn?:string}>}
 */
export async function recordActionTimeAdherence({ supabase, facts = {}, recordAdherence, enabled, warn = console.warn } = {}) {
  try {
    if (!(enabled ?? isActionTimeAdherenceEnabled())) return { ok: true, recorded: 0, bars: [], skipped: 'flag-off' };
    if (!supabase || typeof supabase.from !== 'function' || typeof recordAdherence !== 'function') {
      warn?.('[adam-action-time-adherence] missing supabase/recordAdherence — skipping (fail-open)');
      return { ok: false, recorded: 0, bars: [], warn: 'missing deps' };
    }
    const bars = runCardinalProbes(facts);

    // Read recent ledger rows to dedupe on verdict change.
    let prev = {};
    try {
      const { data } = await supabase
        .from('adam_adherence_ledger')
        .select('probe, verdict, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      prev = latestVerdictsByProbe(data || []);
    } catch (e) {
      warn?.(`[adam-action-time-adherence] ledger read failed (fail-open, recording all): ${e?.message ?? e}`);
    }

    const toWrite = decideLedgerWrites(prev, bars);
    if (toWrite.length === 0) return { ok: true, recorded: 0, bars };

    const runId = randomUUID();
    let recorded = 0;
    for (const bar of toWrite) {
      try { await recordAdherence(supabase, runId, bar); recorded += 1; }
      catch (e) { warn?.(`[adam-action-time-adherence] ledger write failed for ${bar.probe} (fail-open): ${e?.message ?? e}`); }
    }
    // WARN-only surfacing of any action-time FAIL (never blocks).
    const fails = bars.filter((b) => b.verdict === 'fail');
    if (fails.length) warn?.(`[adam-action-time-adherence] WARN: ${fails.length} cardinal adherence FAIL(s): ${fails.map((f) => f.probe).join(', ')}`);
    return { ok: true, recorded, bars };
  } catch (e) {
    // Cardinal fail-open: NEVER let an adherence check break the tick / send.
    warn?.(`[adam-action-time-adherence] aborted (fail-open): ${e?.message ?? e}`);
    return { ok: false, recorded: 0, bars: [], warn: String(e?.message ?? e) };
  }
}
