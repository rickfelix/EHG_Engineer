/**
 * Gate-bar regime — evidence-existence bars on chairman-gate stages.
 * SD-MAN-INFRA-GATE-BAR-REGIME-001 (sitting #1 item 1, GO 2026-06-11T14:49Z).
 *
 * DataDistill's first full lifecycle proved chairman-gate stages can emit
 * passing verdicts on empty criteria and NULL scores (70/70 with no evidence).
 * This module evaluates every chairman-gate verdict against evidence-existence
 * bars and RECORDS the result. OBSERVE-ONLY: bar failures are advisory and
 * never block; flipping GATE_BARS_OBSERVE_ONLY to false is a chairman-gated
 * reviewed change (no-auto-override doctrine, sitting #1 item 2 — automation
 * never creates chairman_decisions rows and never converts a bar verdict into
 * a block).
 */
'use strict';

/** The 9 chairman-gate stages named by the sitting #1 ruling. */
export const CHAIRMAN_GATE_STAGES = Object.freeze(new Set([3, 5, 10, 13, 17, 18, 23, 24, 25]));

/**
 * Single enforcement-mode seam. Bars stay advisory until the calibration
 * cohort produces ground truth; the flip to binding is one reviewed,
 * chairman-gated change at this constant.
 */
export const GATE_BARS_OBSERVE_ONLY = true;

const URL_RE = /https?:\/\/[^\s"'<>)\]}]+/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Extract candidate web-source URLs from a gate row's criteria + notes. */
export function extractWebSources(row) {
  const text = `${JSON.stringify(row?.gate_criteria ?? {})} ${row?.notes ?? ''}`;
  return [...new Set(text.match(URL_RE) || [])];
}

/** Extract candidate artifact references (UUIDs) from gate_criteria values. */
export function extractArtifactRefs(row) {
  const text = JSON.stringify(row?.gate_criteria ?? {});
  return [...new Set((text.match(UUID_RE) || []).map((u) => u.toLowerCase()))];
}

/**
 * PURE: evaluate the evidence-existence bars for one eva_stage_gate_results
 * row. IO (artifact resolution, URL liveness) is injected so unit tests run
 * without DB or network; both checks are best-effort and fail-open to an
 * 'unverified' status — under observe-only a bar can fail loudly but the
 * evaluation itself must never throw on infrastructure trouble.
 *
 * @param {{stage_number:number, gate_type?:string, overall_score?:number|null,
 *          passed?:boolean, gate_criteria?:object|null, notes?:string|null}} row
 * @param {Object} [opts]
 * @param {(ref:string)=>Promise<boolean>} [opts.resolveArtifact] - returns true when the ref exists
 * @param {(url:string)=>Promise<boolean>} [opts.checkUrl] - returns true when the URL is live
 * @returns {Promise<{stage_number:number, gate_type:string|null, advisory:boolean,
 *           in_scope:boolean, all_pass:boolean, bars:Array<{bar:string, pass:boolean|null,
 *           status:'pass'|'fail'|'unverified'|'not_applicable', detail:string}>}>}
 */
export async function evaluateGateBars(row, opts = {}) {
  const stage = Number(row?.stage_number);
  const inScope = CHAIRMAN_GATE_STAGES.has(stage);
  const bars = [];

  if (inScope) {
    const criteria = row?.gate_criteria;
    const criteriaPresent =
      criteria != null && typeof criteria === 'object' && Object.keys(criteria).length > 0;
    bars.push({
      bar: 'criteria_present',
      pass: criteriaPresent,
      status: criteriaPresent ? 'pass' : 'fail',
      detail: criteriaPresent
        ? `${Object.keys(criteria).length} criteria key(s)`
        : 'gate_criteria empty or missing — verdict cites no criteria',
    });

    const scorePresent = Number.isFinite(Number(row?.overall_score)) && row?.overall_score !== null;
    bars.push({
      bar: 'score_present',
      pass: scorePresent,
      status: scorePresent ? 'pass' : 'fail',
      detail: scorePresent ? `overall_score=${row.overall_score}` : 'overall_score is NULL/non-numeric',
    });

    const refs = extractArtifactRefs(row);
    if (refs.length === 0) {
      bars.push({
        bar: 'evidence_resolvable',
        pass: false,
        status: 'fail',
        detail: 'no artifact references (UUIDs) found in gate_criteria',
      });
    } else if (typeof opts.resolveArtifact !== 'function') {
      bars.push({
        bar: 'evidence_resolvable',
        pass: null,
        status: 'unverified',
        detail: `${refs.length} artifact ref(s) found; no resolver injected`,
      });
    } else {
      let resolved = 0;
      let errored = false;
      for (const ref of refs) {
        try {
          if (await opts.resolveArtifact(ref)) resolved += 1;
        } catch {
          errored = true; // fail-open: infrastructure trouble is not evidence absence
        }
      }
      const pass = resolved > 0;
      bars.push({
        bar: 'evidence_resolvable',
        pass: errored && !pass ? null : pass,
        status: errored && !pass ? 'unverified' : pass ? 'pass' : 'fail',
        detail: `${resolved}/${refs.length} artifact ref(s) resolved${errored ? ' (resolver errors — unverified)' : ''}`,
      });
    }

    // S3 kill-gate web-grounding: the market signal must cite a live web source.
    if (stage === 3) {
      const urls = extractWebSources(row);
      if (urls.length === 0) {
        bars.push({
          bar: 's3_web_grounding',
          pass: false,
          status: 'fail',
          detail: 'no web-source URL cited in S3 verdict evidence',
        });
      } else if (typeof opts.checkUrl !== 'function') {
        bars.push({
          bar: 's3_web_grounding',
          pass: null,
          status: 'unverified',
          detail: `${urls.length} URL(s) cited; no liveness checker injected`,
        });
      } else {
        let live = false;
        let errored = false;
        for (const url of urls) {
          try {
            if (await opts.checkUrl(url)) { live = true; break; }
          } catch {
            errored = true; // network failure → unverified, never a hard fail
          }
        }
        bars.push({
          bar: 's3_web_grounding',
          pass: live ? true : errored ? null : false,
          status: live ? 'pass' : errored ? 'unverified' : 'fail',
          detail: live
            ? `live web source cited (${urls.length} URL(s) checked)`
            : errored
              ? 'liveness check failed (network) — recorded unverified'
              : `${urls.length} URL(s) cited but none verified live`,
        });
      }
    }
  }

  return {
    stage_number: stage,
    gate_type: row?.gate_type ?? null,
    advisory: GATE_BARS_OBSERVE_ONLY,
    in_scope: inScope,
    all_pass: inScope ? bars.every((b) => b.status === 'pass') : true,
    bars,
  };
}

/** change_reason marker calibration queries filter on. */
export const GATE_BAR_OBSERVATION_REASON = 'gate_bar_observation (SD-MAN-INFRA-GATE-BAR-REGIME-001, observe-only)';

/**
 * Record a bar evaluation observe-only. Writes a governance_audit_log row
 * (changed_by='gate-bars', change_reason=GATE_BAR_OBSERVATION_REASON,
 * operation='INSERT' — the table's CHECK constraint allows only DML verbs) so
 * calibration analytics can query bar verdicts without a schema change while
 * the regime is advisory. FAIL-SOFT: recording trouble logs and returns null —
 * observation must never break the gate persist path it rides on.
 *
 * Calibration note: consumers MUST filter ventures through
 * isCalibrationEligibleVenture() (lib/eva/gate-enforcement.js) — scaffold-era
 * ventures carry no market lessons (QF-20260611-510). Query recipe:
 *   SELECT new_values FROM governance_audit_log
 *   WHERE changed_by='gate-bars' AND change_reason LIKE 'gate_bar_observation%';
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId:string, gateRowId?:string|null}} ctx
 * @param {Awaited<ReturnType<typeof evaluateGateBars>>} evaluation
 * @returns {Promise<string|null>} audit row id or null
 */
export async function recordGateBarObservation(supabase, ctx, evaluation) {
  if (!evaluation?.in_scope) return null;
  try {
    const { data, error } = await supabase
      .from('governance_audit_log')
      .insert({
        table_name: 'eva_stage_gate_results',
        record_id: ctx?.gateRowId ?? null,
        operation: 'INSERT',
        changed_by: 'gate-bars',
        change_reason: GATE_BAR_OBSERVATION_REASON,
        new_values: {
          venture_id: ctx?.ventureId ?? null,
          stage_number: evaluation.stage_number,
          gate_type: evaluation.gate_type,
          advisory: evaluation.advisory,
          all_pass: evaluation.all_pass,
          bars: evaluation.bars,
        },
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.warn(`[gate-bars] observation record failed (non-blocking): ${err.message}`);
    return null;
  }
}
