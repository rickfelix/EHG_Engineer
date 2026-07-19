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
 * Velocity-based forecast date range (optimistic +20% / expected / pessimistic -20%,
 * mirroring the confidence-tiering pattern in scripts/sd-burnrate.js), computed directly
 * from strategic_directives_v2.completion_date over a lookback window — independent of
 * sd_execution_baselines and independent of the unrelated VDR build-gauge forecast in
 * lib/vision/build-completion-forecast.mjs (that module forecasts portfolio infra-build
 * completion, a different metric than roadmap-wave item completion).
 */
async function computeForecastRange(supabase, { velocityLookbackDays, remainingCount }) {
  const cutoffIso = new Date(Date.now() - velocityLookbackDays * DAY_MS).toISOString();
  const { data: recentlyCompleted, error } = await supabase
    .from('strategic_directives_v2')
    .select('completion_date')
    .eq('status', 'completed')
    .gte('completion_date', cutoffIso);
  if (error) throw new Error(`roadmap-status-doc: velocity query failed: ${error.message}`);

  const completedCount = (recentlyCompleted || []).length;
  const velocityPerDay = completedCount / velocityLookbackDays;

  if (!(velocityPerDay > 0) || !(remainingCount > 0)) {
    return {
      confidence: 'insufficient_data',
      optimistic_date: null,
      expected_date: null,
      pessimistic_date: null,
      velocity_per_day: Math.round(velocityPerDay * 100) / 100,
      remaining_count: remainingCount,
    };
  }

  return {
    confidence: completedCount >= 5 ? 'high' : completedCount >= 2 ? 'medium' : 'low',
    optimistic_date: dateFromDays(remainingCount / (velocityPerDay * 1.2)),
    expected_date: dateFromDays(remainingCount / velocityPerDay),
    pessimistic_date: dateFromDays(remainingCount / (velocityPerDay * 0.8)),
    velocity_per_day: Math.round(velocityPerDay * 100) / 100,
    remaining_count: remainingCount,
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
        .from('v_plan_of_record_remainder')
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
      velocityLookbackDays,
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
      lines.push('  Forecast: insufficient data');
    } else {
      lines.push(`  Forecast (${forecast.confidence} confidence): ${forecast.optimistic_date} — ${forecast.expected_date} — ${forecast.pessimistic_date}`);
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
