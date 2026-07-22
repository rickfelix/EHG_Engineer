/**
 * roadmap-status-doc — SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-A (FR-1 of the parent
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001 PRD).
 *
 * Pure data/content generator for the 5:45 AM chairman daily-review automation.
 * buildRoadmapStatusDoc() produces the roadmap-status CONTENT — plan-of-record data
 * (per-wave item counts, calibrated probability, overall %, forecast date range) plus
 * a "what moved yesterday / plan for today" narrative — as a delivery-mechanism-agnostic
 * {title, sections[], plainTextBody} object. Children B (SMS text), C (Drive Doc), D
 * (MMS-Gantt) consume this; no Twilio/Drive/MMS code lives here.
 *
 * Fail-soft per section (parent PRD FR-1 acceptance criterion): a missing/failed data
 * source degrades a section to a labelled unavailable state, this function never throws.
 */
import { resolveCanonicalRoadmap } from '../../roadmap/canonical-roadmap.js';
import { readForecastBasis } from './forecast-basis-reader.js';

const DAY_MS = 24 * 3_600_000;
// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: narrowed from ['approved','active','completed']
// to approved-only, matching v_plan_of_record_remainder's scope. Deliberate, chairman-visible
// behavior change (see PLAN-TO-LEAD handoff notes) -- active/completed waves are no longer
// "remaining" plan-of-record by definition.
const RATIFIED_WAVE_STATUSES = ['approved'];
const DEFAULT_SINCE_HOURS = 24;
const DEFAULT_VELOCITY_LOOKBACK_DAYS = 14;

function dateFromDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.ceil(days));
  return d.toISOString().split('T')[0];
}

function formatProbability(p) {
  return typeof p === 'number' ? `${Math.round(p * 100)}%` : 'n/a';
}

/**
 * gantt_rule_LEGC dominant-dispatch-class picker (FR-1). Fail-closed: current_state's
 * fenced_set is unstructured free text (not keyed to individual roadmap waves/items), so
 * this SD does NOT attempt per-item fence matching against it — that would require fuzzy
 * substring matching against prose, which testing-agent flagged as fragile (a false-negative
 * match silently produces a fabricated dispatchable date).
 *
 * QF-20260722-717 FENCED-DOMINANT: gated >= dispatchable no longer forecloses a calibrated
 * ETA (previously returned null here, cascading to a silent insufficient_data indistinguishable
 * from a genuinely missing/corrupt basis — the chairman could not tell "queue is fenced" from
 * "the forecast is broken"). It still resolves to the open_queue class model — the only
 * dispatch class this SD models — but the caller tags the result fenced_dominant so the
 * rendered forecast is honest that it reflects dispatchable-only capacity while chairman-gated
 * items currently dominate the belt, rather than silently omitting a date.
 */
function pickDominantDispatchClass(currentState) {
  const dispatchable = Number(currentState.dispatchable_qf) || 0;
  const gated = Number(currentState.chairman_gated_held) || 0;
  // gated > 0 is required, not just gated >= dispatchable -- an idle 0/0 belt has nothing
  // gated at all and must not be reported as "gated items dominate" (adversarial-verify finding).
  return { dispatchClass: 'open_queue', fencedDominant: gated > 0 && gated >= dispatchable };
}

/** QF-20260722-717 FAIL-LOUD SCHEMA GUARD (Solomon RCA ac8948dc): a basis re-stamp that
 * drops current_state.dispatchable_qf/chairman_gated_held previously coerced to 0 via the
 * `|| 0` above, producing the SAME silent insufficient_data as a genuinely balanced/fenced
 * queue — a schema regression must never be indistinguishable from a legitimate state. Checks
 * for a finite number, not just non-null: a corrupted (wrong-type) value must fail the same
 * way a missing one does, not silently coerce to 0 via `Number(x) || 0` (adversarial-verify
 * finding). */
function invalidCurrentStateFields(currentState) {
  const invalid = [];
  if (!Number.isFinite(currentState?.dispatchable_qf)) invalid.push('dispatchable_qf');
  if (!Number.isFinite(currentState?.chairman_gated_held)) invalid.push('chairman_gated_held');
  return invalid;
}

/** A calibration input is usable only if finite, non-negative, and (when paired with a
 * p90) the p90 is not below the median — an inverted/corrupted basis must not compute a
 * date (adversarial-review finding, PR #6387; TR-3 fail-closed). */
function isUsableCalibrationInput(median, p90) {
  if (!Number.isFinite(median) || median < 0) return false;
  if (p90 !== undefined && (!Number.isFinite(p90) || p90 < median)) return false;
  return true;
}

/**
 * Solomon-calibrated forecast (FR-1, replaces the raw single-velocity date-fiat). Reads the
 * live forecast_basis (read_contract_corr e38531c6) via forecast-basis-reader.js and applies
 * gantt_rule_LEGC: date = queue_wait[dispatch_class] + work_time[tier], using the class's own
 * median/p90 spread for optimistic/pessimistic bounds (calibrated variance, not an arbitrary
 * +-20%). Fail-closed (TR-3): when the basis is unavailable/degraded, or the calibrated
 * inputs are missing/non-finite, or the dispatch class cannot be confidently resolved, this
 * returns confidence='insufficient_data' with NO dates — never falls back to the discredited
 * flat-velocity math, and never fabricates a date under uncertainty.
 *
 * Scope note (documented per PLAN/EXEC-phase judgment call): roadmap_waves/wave_items carry
 * no structured per-item "is this fenced" flag. When fleet capacity is partially gated
 * (current_state.chairman_gated_held > 0), that is surfaced as an explicit gating_note
 * alongside the calibrated dates rather than silently omitted or used to suppress a date for
 * a specific wave this SD cannot identify as fenced.
 */
async function computeForecastRange(supabase, { remainingCount }) {
  const basis = await readForecastBasis(supabase);
  if (basis.confidence !== 'live' || !basis.forecast_basis) {
    return {
      confidence: 'insufficient_data',
      degraded_reason: 'no_data',
      degraded_detail: null,
      optimistic_date: null,
      expected_date: null,
      pessimistic_date: null,
      remaining_count: remainingCount,
      basis_confidence: basis.confidence,
    };
  }

  const { forecast_basis: fb, current_state: currentState } = basis;

  // QF-20260722-717 FAIL-LOUD SCHEMA GUARD: name the missing/invalid field(s) instead of
  // letting pickDominantDispatchClass's `|| 0` coercion silently produce the same
  // insufficient_data a genuinely balanced/fenced queue would (the Solomon-RCA'd regression
  // this QF closes).
  const invalidFields = invalidCurrentStateFields(currentState);
  if (invalidFields.length > 0) {
    return {
      confidence: 'insufficient_data',
      degraded_reason: 'schema_incomplete',
      degraded_detail: `current_state missing/invalid: ${invalidFields.join(', ')}`,
      optimistic_date: null,
      expected_date: null,
      pessimistic_date: null,
      remaining_count: remainingCount,
      basis_confidence: basis.confidence,
    };
  }

  const { dispatchClass, fencedDominant } = pickDominantDispatchClass(currentState);
  const classModel = fb.dispatch_class_model?.[dispatchClass];
  const workTimeModel = fb.work_time_model_started_to_completed?.sd_tier;

  const queueMedian = classModel?.queue_wait_median_hrs;
  const queueP90 = classModel?.queue_wait_p90_hrs;
  const workMedian = workTimeModel?.median_hrs;
  const workP90 = workTimeModel?.p90_hrs;

  // A resolved dispatch class whose model is missing a numeric queue_wait_median_hrs -- or a
  // basis missing the work-time model entirely -- is the same schema-regression class as a
  // missing current_state field: name it, don't fold it into the generic no_data below.
  if (!classModel || !Number.isFinite(queueMedian)) {
    return {
      confidence: 'insufficient_data',
      degraded_reason: 'schema_incomplete',
      degraded_detail: `dispatch_class_model.${dispatchClass}.queue_wait_median_hrs missing/non-numeric`,
      optimistic_date: null,
      expected_date: null,
      pessimistic_date: null,
      remaining_count: remainingCount,
      basis_confidence: basis.confidence,
    };
  }
  if (!workTimeModel || !Number.isFinite(workMedian)) {
    return {
      confidence: 'insufficient_data',
      degraded_reason: 'schema_incomplete',
      degraded_detail: 'work_time_model_started_to_completed.sd_tier.median_hrs missing/non-numeric',
      optimistic_date: null,
      expected_date: null,
      pessimistic_date: null,
      remaining_count: remainingCount,
      basis_confidence: basis.confidence,
    };
  }

  const queueUsable = isUsableCalibrationInput(queueMedian, Number.isFinite(queueP90) ? queueP90 : undefined);
  const workUsable = isUsableCalibrationInput(workMedian, Number.isFinite(workP90) ? workP90 : undefined);

  if (!queueUsable || !workUsable || !(remainingCount > 0)) {
    return {
      confidence: 'insufficient_data',
      degraded_reason: 'no_data',
      degraded_detail: null,
      optimistic_date: null,
      expected_date: null,
      pessimistic_date: null,
      remaining_count: remainingCount,
      basis_confidence: basis.confidence,
    };
  }

  const optimisticHrs = queueMedian + workMedian;
  const pessimisticHrs = (Number.isFinite(queueP90) ? queueP90 : queueMedian) + (Number.isFinite(workP90) ? workP90 : workMedian);
  const expectedHrs = (optimisticHrs + pessimisticHrs) / 2;

  const gatedCount = Number(currentState?.chairman_gated_held) || 0;
  // QF-20260722-717 FENCED-DOMINANT: when gated items legitimately dominate the belt, the
  // gating note says so explicitly instead of the generic "assumes capacity holds" framing --
  // this IS the dispatchable-only ETA, not a caveat on an open-queue one.
  const gatingNote = fencedDominant
    ? `Forecast reflects DISPATCHABLE-ONLY capacity — ${gatedCount} chairman-gated item(s) currently dominate the belt (${currentState.fenced_set || 'see forecast basis'})`
    : gatedCount > 0
      ? `${gatedCount} fleet item(s) currently gated-on-chairman-action (${currentState.fenced_set || 'see forecast basis'}) — dates below assume current dispatchable capacity holds`
      : null;

  return {
    confidence: 'calibrated',
    optimistic_date: dateFromDays(optimisticHrs / 24),
    expected_date: dateFromDays(expectedHrs / 24),
    pessimistic_date: dateFromDays(pessimisticHrs / 24),
    remaining_count: remainingCount,
    dispatch_class: dispatchClass,
    fenced_dominant: fencedDominant,
    gating_note: gatingNote,
  };
}

async function buildPlanOfRecordSection(supabase, { velocityLookbackDays }) {
  try {
    const roadmap = await resolveCanonicalRoadmap(supabase);
    if (!roadmap) {
      return {
        id: 'plan_of_record',
        heading: 'Plan of Record',
        available: false,
        text: '  (unavailable: no canonical roadmap found)',
        data: null,
      };
    }

    const { data: waves, error: wavesErr } = await supabase
      .from('roadmap_waves')
      .select('id, title, sequence_rank, status, progress_pct, confidence_score')
      .eq('roadmap_id', roadmap.id)
      .in('status', RATIFIED_WAVE_STATUSES)
      .order('sequence_rank', { ascending: true });
    if (wavesErr) throw new Error(`roadmap_waves query failed: ${wavesErr.message}`);

    const waves_ = waves || [];
    const waveIds = waves_.map((w) => w.id);

    let items = [];
    if (waveIds.length > 0) {
      // SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: repointed from roadmap_wave_items to
      // v_plan_of_record_remainder (approved-wave-only, stamped remainder_state).
      const { data: itemsData, error: itemsErr } = await supabase
        .from('v_plan_of_record_remainder') // schema-lint-disable-line: pre-existing view reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
        .select('id, wave_id, item_disposition, promoted_to_sd_key, remainder_state')
        .in('wave_id', waveIds);
      if (itemsErr) throw new Error(`v_plan_of_record_remainder query failed: ${itemsErr.message}`);
      items = itemsData || [];
    }

    const countsByWave = new Map();
    for (const item of items) {
      // void items (dropped, or promoted to a since-cancelled SD -- the W5 incident class) are
      // dead scope: excluded from both the total and the promoted count, not just the promoted
      // side, so they can no longer inflate "remaining" work in the chairman's forecast.
      if (item.remainder_state === 'void') continue;
      const entry = countsByWave.get(item.wave_id) || { total: 0, promoted: 0 };
      entry.total += 1;
      if (item.remainder_state === 'satisfied_elsewhere') entry.promoted += 1;
      countsByWave.set(item.wave_id, entry);
    }

    const waveSummary = waves_.map((w) => ({
      wave_id: w.id,
      title: w.title,
      status: w.status,
      progress_pct: w.progress_pct,
      calibrated_probability: w.confidence_score,
      item_counts: countsByWave.get(w.id) || { total: 0, promoted: 0 },
    }));

    const totalItems = waveSummary.reduce((sum, w) => sum + w.item_counts.total, 0);
    const totalPromoted = waveSummary.reduce((sum, w) => sum + w.item_counts.promoted, 0);
    const overallPct = totalItems > 0 ? Math.round((totalPromoted / totalItems) * 1000) / 10 : null;

    const forecast = await computeForecastRange(supabase, {
      remainingCount: totalItems - totalPromoted,
    });

    const data = {
      available: true,
      roadmap_id: roadmap.id,
      roadmap_title: roadmap.title || null,
      waves: waveSummary,
      overall_pct: overallPct,
      forecast,
    };

    const lines = [];
    lines.push(`  Roadmap: ${data.roadmap_title || data.roadmap_id}`);
    lines.push(`  Overall: ${data.overall_pct != null ? `${data.overall_pct}%` : 'n/a'}`);
    for (const w of data.waves) {
      lines.push(
        `  - ${w.title}: ${w.item_counts.promoted}/${w.item_counts.total} items ` +
        `(probability ${formatProbability(w.calibrated_probability)}, progress ${w.progress_pct ?? 'n/a'}%)`
      );
    }
    if (forecast.confidence === 'insufficient_data') {
      // QF-20260722-717: name WHY (no_data / schema_incomplete / degraded_detail) instead of
      // a uniform "insufficient data" that hid a schema regression from Solomon/chairman alike.
      const reason = forecast.degraded_reason || 'no_data';
      const detail = forecast.degraded_detail ? ` — ${forecast.degraded_detail}` : '';
      lines.push(`  Forecast: insufficient data [${reason}]${detail}`);
    } else {
      lines.push(`  Forecast (${forecast.confidence}): ${forecast.optimistic_date} — ${forecast.expected_date} — ${forecast.pessimistic_date}`);
      if (forecast.gating_note) lines.push(`  Note: ${forecast.gating_note}`);
    }

    return { id: 'plan_of_record', heading: 'Plan of Record', available: true, text: lines.join('\n'), data };
  } catch (e) {
    return {
      id: 'plan_of_record',
      heading: 'Plan of Record',
      available: false,
      text: `  (data unavailable: ${e.message})`,
      data: null,
    };
  }
}

async function buildNarrativeSection(supabase, { sinceIso }) {
  try {
    const [completedRes, inFlightRes] = await Promise.all([
      supabase
        .from('strategic_directives_v2')
        .select('sd_key, title, completion_date, target_application')
        .eq('status', 'completed')
        .gte('completion_date', sinceIso)
        .order('completion_date', { ascending: false }),
      supabase
        .from('strategic_directives_v2')
        .select('sd_key, title, status, current_phase, target_application, updated_at')
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false }),
    ]);

    if (completedRes.error) throw new Error(`completed-since query failed: ${completedRes.error.message}`);
    if (inFlightRes.error) throw new Error(`in-flight query failed: ${inFlightRes.error.message}`);

    const data = {
      since_iso: sinceIso,
      completed_since: (completedRes.data || []).map((sd) => ({
        sd_key: sd.sd_key,
        title: sd.title,
        completed_at: sd.completion_date,
        target_application: sd.target_application,
      })),
      in_flight: (inFlightRes.data || []).map((sd) => ({
        sd_key: sd.sd_key,
        title: sd.title,
        current_phase: sd.current_phase,
        target_application: sd.target_application,
        updated_at: sd.updated_at,
      })),
    };

    const lines = [];
    lines.push(`  Completed since ${sinceIso}:`);
    if (data.completed_since.length === 0) {
      lines.push('    Nothing completed in this window.');
    } else {
      for (const sd of data.completed_since) lines.push(`    DONE: ${sd.sd_key} — ${sd.title}`);
    }
    lines.push('  In flight:');
    if (data.in_flight.length === 0) {
      lines.push('    Nothing currently in flight.');
    } else {
      for (const sd of data.in_flight) lines.push(`    ${sd.sd_key} (${sd.current_phase || 'unknown phase'}) — ${sd.title}`);
    }

    return { id: 'narrative', heading: 'What Moved Yesterday / Plan For Today', available: true, text: lines.join('\n'), data };
  } catch (e) {
    return {
      id: 'narrative',
      heading: 'What Moved Yesterday / Plan For Today',
      available: false,
      text: `  (data unavailable: ${e.message})`,
      data: null,
    };
  }
}

/**
 * @param {object} supabase injected service-role Supabase client (RLS silently returns
 *   zero rows under anon/authenticated — always use service-role)
 * @param {{sinceIso?: string, velocityLookbackDays?: number}} [opts]
 * @returns {Promise<{title:string, sections:object[], plainTextBody:string, generated_at:string}>}
 */
export async function buildRoadmapStatusDoc(supabase, opts = {}) {
  const sinceIso = opts.sinceIso || new Date(Date.now() - DEFAULT_SINCE_HOURS * 3_600_000).toISOString();
  const velocityLookbackDays = opts.velocityLookbackDays ?? DEFAULT_VELOCITY_LOOKBACK_DAYS;

  const [planOfRecord, narrative] = await Promise.all([
    buildPlanOfRecordSection(supabase, { velocityLookbackDays }),
    buildNarrativeSection(supabase, { sinceIso }),
  ]);

  const sections = [planOfRecord, narrative];
  const generatedAt = new Date().toISOString();
  const title = `Daily Review — ${generatedAt.slice(0, 10)}`;
  const plainTextBody = [
    title,
    '',
    ...sections.flatMap((s) => [s.heading.toUpperCase(), s.text, '']),
  ].join('\n').trimEnd();

  return { title, sections, plainTextBody, generated_at: generatedAt };
}

export default { buildRoadmapStatusDoc };
