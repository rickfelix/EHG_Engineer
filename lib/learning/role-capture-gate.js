/**
 * SD-LEO-INFRA-FORCE-ROLE-SESSIONS-001 (FR-1) — FORCED ROLE CAPTURE, AS A WINDOWED OBLIGATION.
 *
 * THE ASK (chairman, 2026-07-27): workers cannot move on without a retrospective — it is FORCED,
 * so diligence needs no thought. Do the same for Adam, Solomon and the coordinator.
 *
 * WHY THIS IS NOT A TURN-END GATE. The obvious reading of "force it like workers" is a Stop-hook /
 * wind-down guard. That is structurally blind to how role sessions actually die: measured
 * 2026-08-02, FOUR seats were wedged mid-iteration carrying loop_state=active with a stale
 * last_tool_at (one a role seat at 386m) while both legitimately-parked seats read awaiting_tick.
 * A wedged session never reaches turn-end, so such a guard has nothing to hook — it would pass its
 * tests on clean exits and capture nothing from the observed death mode. The obligation is
 * therefore evaluated at each role's RECURRING OPERATING CHOKE (see FR-3 wirings).
 *
 * WHY WINDOWED, NOT PER-TICK. A gate demanding a learning every tick trains the role to emit
 * filler and rebuilds the alert fatigue QF-20260725-638 removed. A role satisfies the gate by
 * having EITHER a real capture OR an explicit no-capture marker recorded within its current
 * window; it is never asked to produce content on every traversal.
 *
 * *** THE LOAD-BEARING DESIGN CONSTRAINT — THE TWO WRITE PATHS ARE STRUCTURALLY SEPARATE ***
 * recordForcedCapture() scores its text with scoreLessonQuality(). recordNoCaptureMarker() NEVER
 * calls the scorer, on any code path. This is not stylistic. MEASURED 2026-08-05 against the live
 * guard: all four plausible honest no-capture phrasings scored 0, every one failing "no concrete
 * referent (file path / table / error / SD-QF key / pattern_id)" — because an absence-of-signal
 * declaration cannot name a referent by construction. Routing the marker through the scorer would
 * reject the very artifact this gate must accept, exactly when a role legitimately has nothing to
 * report. Do not unify these two paths.
 *
 * WHY THIS WRITES DIRECTLY TO issue_patterns AND NOT VIA lib/learning/role-learning-promoter.js.
 * That promoter is the prerequisite SD's promotion path for OPPORTUNISTIC role reviews, and this
 * SD's own acceptance text names it — but it is an UNINVOKED INSTRUMENT: re-measured 2026-08-05, a
 * repo-wide search finds only its own file and its own test, and issue_patterns holds ZERO rows
 * with metadata->>emission_type='role_review' against 669 eligible feedback rows. Making the
 * FORCED lane depend on it would make end-to-end landing contingent on separately reviving dead
 * code. Its dormancy is a real gap, it is not this SD's gap, and it is named in the PRD's
 * metadata.named_deferral rather than silently widened in or silently dropped.
 *
 * COLUMN SHAPE IS COPIED FROM THAT PROMOTER, INCLUDING ITS HARD-WON CONSTRAINT: source stays
 * 'retrospective' (already admitted by the /learn noise filter) because issue_patterns_source_check
 * is a CHECK enum — a new value such as 'role_capture' would FAIL THE WRITE OUTRIGHT. Origin rides
 * on metadata.emission_type instead.
 *
 * NOTHING HERE THROWS. A capture gate that can kill the role tick it rides on is worse than the
 * gap it closes (AC-6).
 */
import { scoreLessonQuality } from '../eva/lesson-quality-guard.js';

export const ROLES = Object.freeze(['adam', 'coordinator', 'solomon']);

/**
 * Per-role window length, in seconds.
 *
 * adam / coordinator: 1800 — measured from periodic_process_registry, where role_session:adam,
 * role_session:coordinator and role_session:solomon all carry expected_interval_seconds=1800 with
 * liveness_source=claude_sessions_heartbeat.
 *
 * solomon: 43200 (12h) — DELIBERATELY DIFFERENT. Solomon has no quiet tick; his documented
 * recurring choke is the self-adherence review on a 12-hour cadence. A 30-minute window evaluated
 * by a 12-hour choke could never be satisfied — the gate would report REQUIRED forever and teach
 * the seat to ignore it. A window shorter than the choke that evaluates it is not a stricter gate,
 * it is a broken one.
 *
 * Code constants, not env vars, and deliberately so: a window settable to 0 makes the gate
 * unsatisfiable, and one settable to a year disables the obligation without leaving a trace.
 */
export const ROLE_CAPTURE_WINDOWS = Object.freeze({
  adam: 1800,
  coordinator: 1800,
  solomon: 43200,
});

/** Distinct from the promoter's 'role_review' and the traversal emitter's 'traversal_reflection', so all classes stay independently queryable. */
export const EMISSION_CAPTURE = 'role_forced_capture';
export const EMISSION_MARKER = 'role_no_capture_marker';

/** Proven-accepted values — see the header note on the source CHECK enum. */
const SOURCE = 'retrospective';
const CATEGORY = 'process';

export const GATE_STATE = Object.freeze({
  SATISFIED: 'SATISFIED',
  REQUIRED: 'REQUIRED',
  STORE_ERROR: 'STORE_ERROR',
});

const RECENT_LESSON_LOOKBACK = 5;

export function isKnownRole(role) {
  return ROLES.includes(String(role || '').toLowerCase());
}

export function windowSecondsFor(role) {
  return ROLE_CAPTURE_WINDOWS[String(role || '').toLowerCase()] ?? null;
}

/** Rolling window start for `role` at `now`. */
export function windowStartFor(role, now = new Date()) {
  const secs = windowSecondsFor(role);
  return secs == null ? null : new Date(now.getTime() - secs * 1000);
}

/**
 * Find the newest artifact of ONE emission type inside the role's window.
 * Deliberately an EXACT-match query per type rather than one broad fetch classified in memory:
 * a broad fetch would need a row cap, and a capped fetch measures the cap, not the population.
 */
async function findInWindow(supabase, role, emissionType, windowStart) {
  const { data, error } = await supabase
    .from('issue_patterns')
    .select('pattern_id, created_at')
    .eq('metadata->>role', role)
    .eq('metadata->>emission_type', emissionType)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

/**
 * Evaluate the capture obligation for one role's current window.
 *
 * A real capture takes precedence over a marker, so a window containing both reports kind=capture
 * — the honest reading, and it keeps the capture-vs-marker ratio meaningful.
 *
 * @returns {Promise<{role:string, state:string, kind:string|null, windowSeconds:number|null,
 *   windowStart:string|null, artifactAt:string|null, ageSeconds:number|null, error?:string}>}
 */
export async function evaluateRoleCaptureGate({ supabase, role, now = new Date() } = {}) {
  const normalized = String(role || '').toLowerCase();
  const base = { role: normalized, kind: null, windowSeconds: windowSecondsFor(normalized), windowStart: null, artifactAt: null, ageSeconds: null };

  if (!isKnownRole(normalized)) {
    return { ...base, state: GATE_STATE.STORE_ERROR, error: `unknown role: ${role}` };
  }
  if (!supabase) return { ...base, state: GATE_STATE.STORE_ERROR, error: 'no supabase client' };

  const windowStart = windowStartFor(normalized, now);
  base.windowStart = windowStart.toISOString();

  try {
    for (const [kind, emission] of [['capture', EMISSION_CAPTURE], ['no_capture_marker', EMISSION_MARKER]]) {
      const hit = await findInWindow(supabase, normalized, emission, windowStart);
      if (hit) {
        return {
          ...base,
          state: GATE_STATE.SATISFIED,
          kind,
          artifactAt: hit.created_at,
          ageSeconds: Math.max(0, Math.round((now.getTime() - Date.parse(hit.created_at)) / 1000)),
        };
      }
    }
    return { ...base, state: GATE_STATE.REQUIRED };
  } catch (err) {
    // A store failure is NOT a satisfied window and NOT a crash — it is its own visible class.
    return { ...base, state: GATE_STATE.STORE_ERROR, error: err.message };
  }
}

/** Recent forced captures for this role, for the scorer's distinctness check. Fail-soft: on error the guard simply sees no history. */
async function fetchRecentCaptures(supabase, role, logger) {
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('issue_summary')
      .eq('metadata->>role', role)
      .eq('metadata->>emission_type', EMISSION_CAPTURE)
      .order('created_at', { ascending: false })
      .limit(RECENT_LESSON_LOOKBACK);
    if (error) { logger.warn(`[RoleCaptureGate] recent-capture lookup failed: ${error.message}`); return []; }
    return (data || []).map((r) => r.issue_summary).filter(Boolean);
  } catch (e) {
    logger.warn(`[RoleCaptureGate] recent-capture lookup threw: ${e.message}`);
    return [];
  }
}

function patternIdFor(role, now) {
  return `PAT-RCG-${role.toUpperCase().slice(0, 4)}-${now.getTime().toString(36).toUpperCase()}`;
}

/** Shared WRITE. Sharing the insert is fine; sharing the SCORER is what must never happen. */
async function insertArtifact({ supabase, role, emissionType, summary, now, extraMetadata = {} }) {
  const patternId = patternIdFor(role, now);
  const { error } = await supabase.from('issue_patterns').insert({
    pattern_id: patternId,
    category: CATEGORY,
    severity: 'low',
    issue_summary: summary,
    occurrence_count: 1,
    status: 'active',
    source: SOURCE,
    metadata: {
      emission_type: emissionType,
      role,
      window_start: windowStartFor(role, now).toISOString(),
      window_seconds: windowSecondsFor(role),
      recorded_at: now.toISOString(),
      ...extraMetadata,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, patternId };
}

/**
 * Record a REAL learning. This is the scored path.
 *
 * @returns {Promise<{recorded:boolean, patternId?:string, reasons?:string[], error?:string}>}
 */
export async function recordForcedCapture({ supabase, role, text, now = new Date(), logger = console } = {}) {
  const normalized = String(role || '').toLowerCase();
  if (!isKnownRole(normalized)) return { recorded: false, error: `unknown role: ${role}` };
  if (!supabase) return { recorded: false, error: 'no supabase client' };

  const lessonText = String(text || '').trim();
  if (!lessonText) return { recorded: false, reasons: ['empty capture text'] };

  try {
    const recentLessons = await fetchRecentCaptures(supabase, normalized, logger);
    const { score, reasons } = scoreLessonQuality(lessonText, { recentLessons });
    if (score === 0) return { recorded: false, reasons };

    const res = await insertArtifact({ supabase, role: normalized, emissionType: EMISSION_CAPTURE, summary: lessonText, now });
    return res.ok ? { recorded: true, patternId: res.patternId } : { recorded: false, error: res.error };
  } catch (err) {
    return { recorded: false, error: err.message };
  }
}

/**
 * Record an EXPLICIT "nothing to capture this period" marker.
 *
 * *** THIS FUNCTION MUST NEVER CALL scoreLessonQuality — SEE THE FILE HEADER. ***
 * An honest absence declaration has no concrete referent by construction and scores 0 every time
 * (measured, 4/4). It is accepted here BY CONSTRUCTION, and stays distinguishable from a real
 * capture in the record via metadata.emission_type.
 *
 * @returns {Promise<{recorded:boolean, patternId?:string, emissionType?:string, error?:string}>}
 */
export async function recordNoCaptureMarker({ supabase, role, note = '', now = new Date() } = {}) {
  const normalized = String(role || '').toLowerCase();
  if (!isKnownRole(normalized)) return { recorded: false, error: `unknown role: ${role}` };
  if (!supabase) return { recorded: false, error: 'no supabase client' };

  const reason = String(note || '').trim() || 'nothing to capture this period';
  const summary = `NOTHING TO CAPTURE (${normalized}): ${reason}`;

  try {
    const res = await insertArtifact({
      supabase, role: normalized, emissionType: EMISSION_MARKER, summary, now,
      extraMetadata: { declared_reason: reason },
    });
    return res.ok
      ? { recorded: true, patternId: res.patternId, emissionType: EMISSION_MARKER }
      : { recorded: false, error: res.error };
  } catch (err) {
    return { recorded: false, error: err.message };
  }
}

export default {
  ROLES, ROLE_CAPTURE_WINDOWS, EMISSION_CAPTURE, EMISSION_MARKER, GATE_STATE,
  isKnownRole, windowSecondsFor, windowStartFor,
  evaluateRoleCaptureGate, recordForcedCapture, recordNoCaptureMarker,
};
