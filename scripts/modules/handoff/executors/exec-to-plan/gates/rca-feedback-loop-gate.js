/**
 * RCA_FEEDBACK_LOOP_GATE — Pocock /diagnose Phase-1 discipline enforcement.
 *
 * SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G.
 *
 * Reads sub_agent_execution_results WHERE sub_agent_code='RCA' for the
 * current SD + phase window, validates each row's metadata for
 * feedback_loop OR no_seam_exists (XOR), and acts per enforcement mode.
 *
 * NOT modifying existing rca-gate.js (which queries root_cause_analyses
 * — that A1 writer-consumer asymmetry is deferred to a separate harness SD).
 *
 * Modes (read from app_config key='rca.feedback_loop.enforcement_mode'):
 *   advisory (default) — log telemetry, always PASS the gate.
 *   blocking            — BLOCK_* outcomes return FAIL with remediation.
 *   disabled            — no-op (return PASS without iterating rows).
 *
 * Phase-2 cutover: UPDATE app_config SET value='"blocking"' ... — no redeploy.
 */

import { validateRcaPayload, suggestedDeepeningFrom, OUTCOMES } from '../../../../pocock/rca-feedback-loop.js';

const GATE_NAME = 'RCA_FEEDBACK_LOOP_GATE';
const CONFIG_KEY = 'rca.feedback_loop.enforcement_mode';

export async function readEnforcementMode(supabase) {
  if (!supabase) return 'advisory';
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle();
  if (error || !data || data.value == null) return 'advisory';
  let v = data.value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { /* keep string */ } }
  if (typeof v !== 'string') return 'advisory';
  const lower = v.toLowerCase();
  return ['advisory', 'blocking', 'disabled'].includes(lower) ? lower : 'advisory';
}

async function writeTelemetry(supabase, sdId, phase, outcome, mode, payloadShape, rcaRowCount) {
  if (!supabase) return;
  try {
    await supabase.from('sub_agent_execution_results').insert({
      sd_id: sdId,
      sub_agent_code: GATE_NAME,
      source: 'gate',
      phase,
      verdict: outcome.startsWith('BLOCK_') && mode === 'blocking' ? 'FAIL' : 'PASS',
      metadata: { outcome, enforcement_mode: mode, payload_shape: payloadShape, rca_row_count: rcaRowCount }
    });
  } catch { /* telemetry best-effort; do not throw from gate */ }
}

async function writePreventionFinding(supabase, rcaRow, sdKey, mode) {
  if (mode !== 'blocking') return { written: false, reason: 'advisory-mode-skip' };
  const rationale = typeof rcaRow.metadata?.no_seam_exists === 'object' && rcaRow.metadata.no_seam_exists !== null
    ? rcaRow.metadata.no_seam_exists.rationale
    : rcaRow.metadata?.no_seam_exists;
  if (typeof rationale !== 'string') return { written: false, reason: 'no-rationale' };
  try {
    const { error } = await supabase
      .from('architectural_prevention_findings')
      .upsert({
        source_rca_id: rcaRow.id,
        source_sd_key: sdKey,
        finding: rationale,
        suggested_deepening: suggestedDeepeningFrom(rationale),
        metadata: { rca_payload: rcaRow.metadata, phase_at_write: rcaRow.phase, enforcement_mode: mode }
      }, { onConflict: 'source_rca_id,source_sd_key' });
    if (error) return { written: false, reason: error.message };
    return { written: true };
  } catch (e) {
    return { written: false, reason: e.message };
  }
}

export function createRcaFeedbackLoopGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      const sdId = ctx?.sd_id ?? ctx?.sdId;
      const sdKey = ctx?.sd_key ?? ctx?.sdKey;
      const phase = ctx?.phase ?? 'unknown';
      const phaseStartAt = ctx?.phase_started_at ?? ctx?.phaseStartedAt;
      const mode = await readEnforcementMode(supabase);

      if (mode === 'disabled') {
        return { passed: true, score: 100, issues: [], details: { mode, skipped: true } };
      }

      if (!supabase || !sdId) {
        return { passed: true, score: 100, issues: [], details: { mode, skipped: 'no-supabase-or-sdid' } };
      }

      let query = supabase
        .from('sub_agent_execution_results')
        .select('id,phase,metadata,created_at,sub_agent_code')
        .eq('sd_id', sdId)
        .eq('sub_agent_code', 'RCA');
      if (phaseStartAt) query = query.gt('created_at', phaseStartAt);
      const { data: rows, error } = await query;
      if (error) {
        return { passed: true, score: 100, issues: [`telemetry-read-error: ${error.message}`], details: { mode, error: error.message } };
      }

      const rcaRows = rows || [];
      if (rcaRows.length === 0) {
        await writeTelemetry(supabase, sdId, phase, 'PASS_NO_RCA_ROWS', mode, 'empty', 0);
        return { passed: true, score: 100, issues: [], details: { mode, rca_row_count: 0 } };
      }

      const evaluations = [];
      let anyBlock = false;
      for (const r of rcaRows) {
        const result = validateRcaPayload(r.metadata || {});
        evaluations.push({ rca_id: r.id, outcome: result.outcome, errors: result.errors });
        if (result.outcome === OUTCOMES.PASS_NO_SEAM_EXISTS) {
          await writePreventionFinding(supabase, r, sdKey, mode);
        }
        if (!result.pass) anyBlock = true;
      }

      const passInMode = mode === 'advisory' ? true : !anyBlock;
      const outcomeSummary = evaluations.map(e => e.outcome).join(',');
      await writeTelemetry(supabase, sdId, phase, outcomeSummary, mode, evaluations[0]?.outcome ?? 'mixed', rcaRows.length);

      const issues = passInMode
        ? []
        : evaluations.filter(e => e.outcome.startsWith('BLOCK_')).map(e => `${e.rca_id}: ${e.outcome} — ${e.errors.join('; ')}`);

      return {
        passed: passInMode,
        score: passInMode ? 100 : 50,
        issues,
        details: { mode, rca_row_count: rcaRows.length, evaluations }
      };
    }
  };
}

export { GATE_NAME };
