/**
 * Coordinator pending-question timer / default-proceed (FR-001..FR-004).
 *
 * SD-LEO-INFRA-COORDINATOR-PENDING-QUESTION-001
 *
 * The fleet coordinator escalates rare genuinely-human questions to the operator
 * as durable feedback rows (category='operator_question', status='new'), surfaced
 * in the 15-min executive email (see scripts/coordinator-escalate-question.mjs +
 * scripts/coordinator-email-summary.mjs). When the operator is away those questions
 * either scroll out of the email or the coordinator hangs waiting.
 *
 * This module adds a TIMER on that EXISTING operator-question path:
 *   FR-001  a NON-CRITICAL, unanswered question older than the timeout
 *           auto-proceeds on the coordinator's recommended option (idempotent).
 *   FR-002  every still-open question is re-surfaced each tick (so it cannot
 *           scroll away) — the existing email path already renders status='new'
 *           rows; this module just classifies them so the tick can report them.
 *   FR-003  a CRITICAL-category question NEVER auto-proceeds — hard-wait until the
 *           operator answers. Ambiguity (missing/unknown category, no recommended
 *           option) ALSO defaults to hard-wait — fail-safe, never auto-act.
 *
 * CommonJS (.cjs) so scripts/stale-session-sweep.cjs (a .cjs coordinator tick) can
 * require() it. The CORE is a pure, dependency-injected function (decidePending
 * Questions) that does ZERO IO; the tick wiring (planAndApplyPendingQuestions)
 * performs the DB reads/writes and is FAIL-OPEN + flag-gated.
 *
 * @module lib/coordinator/pending-question-timer
 */

'use strict';

// ── Critical-category source ────────────────────────────────────────────────
// Reuse the canonical EVA-Constitution OATH-3 mandatory-escalation list rather
// than re-declaring it. four-oaths-enforcement.js is ESM; mirror the same five
// strings here (the single authoritative list) and add the LAW-1 / OATH-2
// venture-kill / strategy-pivot and data-loss / security / irreversible /
// outward-facing classes the prompt calls out. Kept as a frozen Set + a keyword
// list so an exact category match OR a keyword in a free-text category both
// classify as critical.
//
// NOTE: a require() of the ESM four-oaths module from this .cjs file is not
// possible; CRITICAL_CATEGORIES is the by-value mirror of
// OATHS_CONFIG.escalationIntegrity.escalationCategories and is pinned to it by a
// test (decidePendingQuestions critical set) so the two cannot drift.
const CRITICAL_CATEGORIES = Object.freeze(new Set([
  // EVA Constitution OATH-3 escalationCategories (four-oaths-enforcement.js)
  'budget_exceed',
  'strategy_change',
  'external_commitment',
  'security_concern',
  'conflicting_directive',
  // LAW-1 / OATH-2 venture-kill + strategy-pivot
  'venture_kill',
  'strategy_pivot',
  // data-loss / security / irreversible / outward-facing / sensitive-deploy
  'data_loss',
  'security',
  'irreversible',
  'outward_facing',
  'sensitive_deploy',
]));

// Free-text fallbacks: if a question's category is a human phrase rather than one
// of the canonical keys, a substring match on any of these marks it critical.
const CRITICAL_KEYWORDS = Object.freeze([
  'budget', 'spend', 'strategy', 'pivot', 'external', 'commitment',
  'security', 'credential', 'auth', 'conflicting', 'conflict',
  'venture kill', 'venture-kill', 'kill venture', 'cancel venture',
  'data loss', 'data-loss', 'delete', 'drop table', 'irreversible',
  'outward', 'customer-facing', 'production deploy', 'prod deploy', 'sensitive',
]);

/** Default timeout: 8 min ≈ 2-3 coordinator cron cycles (FR-001). */
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;

/** Env flag gating the auto-proceed WRITE behavior (default OFF). */
function autoProceedEnabled(env) {
  env = env || process.env;
  return String(env.COORD_QUESTION_AUTO_PROCEED_V1 ?? 'false').toLowerCase() !== 'false';
}

/** Resolve the timeout (ms) from env, falling back to DEFAULT_TIMEOUT_MS. */
function resolveTimeoutMs(env) {
  env = env || process.env;
  const min = Number(env.COORD_QUESTION_TIMEOUT_MIN);
  return Number.isFinite(min) && min > 0 ? min * 60 * 1000 : DEFAULT_TIMEOUT_MS;
}

/**
 * Default critical-category classifier. Pure. Returns true when the question must
 * hard-wait for a human (never auto-proceed). A question is critical when its
 * declared category is one of CRITICAL_CATEGORIES, or its category/text contains a
 * CRITICAL_KEYWORD. Used by decidePendingQuestions when no classifier is injected.
 *
 * @param {object} q - question row (metadata.question_category / category / description / title)
 * @returns {boolean}
 */
function isCriticalQuestion(q) {
  if (!q) return false;
  const meta = q.metadata || {};
  const cat = String(meta.question_category || meta.category || q.category || '')
    .trim().toLowerCase();
  if (cat && CRITICAL_CATEGORIES.has(cat)) return true;
  const haystack = (cat + ' ' + String(q.description || q.title || '')).toLowerCase();
  if (CRITICAL_KEYWORDS.some((kw) => haystack.includes(kw))) return true;
  // Venture-kill phrased loosely ("should we kill this venture?") — both tokens present.
  if (haystack.includes('venture') && /\bkill|cancel|shut down|shutdown|terminate\b/.test(haystack)) return true;
  return false;
}

/**
 * Extract the coordinator's recommended option from a question row, if any.
 * The escalate path stores it under metadata.recommended_option (preferred) or
 * metadata.recommendation. Returns null when none is present.
 * @param {object} q
 * @returns {string|null}
 */
function recommendedOption(q) {
  const meta = (q && q.metadata) || {};
  const rec = meta.recommended_option ?? meta.recommendation ?? null;
  if (rec == null) return null;
  const s = String(rec).trim();
  return s.length ? s : null;
}

/** Parse a timestamp to epoch-ms; 0 on missing/unparseable. */
function tsMs(ts) {
  if (!ts) return 0;
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(String(ts));
  const n = new Date(hasTZ ? ts : ts + 'Z').getTime();
  return Number.isFinite(n) ? n : 0;
}

/** True when the row has already been auto-proceeded or otherwise resolved (idempotency). */
function isAlreadyHandled(q) {
  if (!q) return true;
  const status = String(q.status || '').toLowerCase();
  if (status && status !== 'new' && status !== 'open') return true; // resolved/closed/etc.
  const meta = q.metadata || {};
  return meta.auto_proceeded === true || !!meta.auto_proceeded_at;
}

/**
 * CORE — pure, dependency-injected decision function (FR-001/FR-002/FR-003).
 * Given open question rows + a clock + timeout + a critical-category classifier,
 * returns one decision per question WITHOUT performing any IO.
 *
 * Decision per question (no side effects):
 *   { action: 'auto_proceed', id, recommended_option, reason }   — non-critical, aged, recommended option present, flag on
 *   { action: 'hard_wait',    id, reason }                       — critical OR ambiguous OR no recommendation
 *   { action: 'resurface',    id, reason }                       — still-open but not yet actionable (FR-002 re-surface)
 *   { action: 'skip',         id, reason }                       — already handled / resolved (idempotent)
 *
 * @param {Array<object>} questions - feedback rows (category='operator_question')
 * @param {object} [opts]
 * @param {number} [opts.now] - epoch-ms clock (defaults Date.now())
 * @param {number} [opts.timeoutMs] - age threshold (defaults DEFAULT_TIMEOUT_MS)
 * @param {(q:object)=>boolean} [opts.isCritical] - critical classifier (defaults isCriticalQuestion)
 * @param {boolean} [opts.autoProceedEnabled] - flag gate; false → aged non-critical resurfaces instead of auto_proceed
 * @returns {Array<object>} decisions (one per input question)
 */
function decidePendingQuestions(questions, opts) {
  opts = opts || {};
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const isCritical = typeof opts.isCritical === 'function' ? opts.isCritical : isCriticalQuestion;
  const flagOn = opts.autoProceedEnabled !== false; // core defaults ON; tick passes the real flag

  const out = [];
  for (const q of (questions || [])) {
    const id = q && q.id != null ? q.id : null;

    // Idempotency: never re-process a row already auto-proceeded or resolved.
    if (isAlreadyHandled(q)) {
      out.push({ action: 'skip', id, reason: 'already handled (resolved or auto_proceeded)' });
      continue;
    }

    // FR-003: critical → hard-wait, ALWAYS, regardless of age.
    if (isCritical(q)) {
      out.push({ action: 'hard_wait', id, reason: 'critical category — operator must answer' });
      continue;
    }

    const ageMs = now - tsMs(q.created_at);
    const aged = ageMs >= timeoutMs;

    if (!aged) {
      // FR-002: not yet timed out — keep surfacing it so it does not scroll away.
      out.push({ action: 'resurface', id, reason: 'open and below timeout', age_ms: ageMs });
      continue;
    }

    // Aged + non-critical. FR-001 requires a recommended option to proceed on.
    const rec = recommendedOption(q);
    if (!rec) {
      // Ambiguity (no recommendation to act on) → hard-wait (fail-safe).
      out.push({ action: 'hard_wait', id, reason: 'aged but no recommended option — cannot auto-proceed safely', age_ms: ageMs });
      continue;
    }

    if (!flagOn) {
      // Flag OFF: would auto-proceed, but writes are disabled — keep surfacing.
      out.push({ action: 'resurface', id, reason: 'aged + recommended, but auto-proceed flag OFF', recommended_option: rec, age_ms: ageMs });
      continue;
    }

    out.push({ action: 'auto_proceed', id, recommended_option: rec, reason: 'non-critical and unanswered past timeout', age_ms: ageMs });
  }
  return out;
}

// ── Tick wiring (IO) — FAIL-OPEN, flag-gated ────────────────────────────────

/**
 * Read open operator_question rows (status='new'). READ-ONLY; fail-soft to [].
 * @param {object} supabase
 * @returns {Promise<Array<object>>}
 */
async function loadOpenQuestions(supabase) {
  try {
    const { data } = await supabase
      .from('feedback')
      .select('id, title, description, category, status, created_at, metadata')
      .eq('category', 'operator_question')
      .eq('status', 'new')
      .order('created_at', { ascending: true })
      .limit(50);
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * Apply ONE auto_proceed decision to the DB: mark the feedback row resolved with
 * an auto_proceeded marker + audit note. Idempotent at the DB layer via the
 * .eq('status','new') guard (a row another tick already resolved won't re-update).
 * FAIL-OPEN: never throws.
 * @param {object} supabase
 * @param {object} q - the original question row
 * @param {object} decision - { recommended_option, reason }
 * @param {number} now - epoch-ms
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function applyAutoProceed(supabase, q, decision, now) {
  try {
    const nowIso = new Date(now).toISOString();
    const mergedMeta = Object.assign({}, q.metadata || {}, {
      auto_proceeded: true,
      auto_proceeded_at: nowIso,
      auto_proceeded_option: decision.recommended_option,
      auto_proceeded_reason: decision.reason,
    });
    const note = 'AUTO-PROCEEDED on coordinator recommendation "' +
      decision.recommended_option + '" — ' + decision.reason +
      ' (no operator answer within timeout). ' + nowIso;
    const { error } = await supabase
      .from('feedback')
      .update({
        status: 'resolved',
        resolved_at: nowIso,
        resolution_notes: note,
        metadata: mergedMeta,
      })
      .eq('id', q.id)
      .eq('status', 'new'); // race/idempotency guard: only the still-open row
    if (error) {
      console.warn('   ⚠️  [QUESTION_AUTO_PROCEED_FAILED] id=' + q.id + ': ' + error.message + ' (non-fatal)');
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn('   ⚠️  [QUESTION_AUTO_PROCEED_THREW] id=' + (q && q.id) + ': ' + ((e && e.message) || e) + ' (non-fatal)');
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Tick entry point. Loads open operator questions, runs the pure decision core,
 * and applies auto_proceed writes (flag-gated). Returns a structured summary so
 * the sweep can print visible lines AND re-surface still-open questions (FR-002).
 * FAIL-OPEN end to end; fully inert (zero writes) when the flag is OFF — aged
 * non-critical questions then return as 'resurface' instead of 'auto_proceed'.
 *
 * @param {object} supabase
 * @param {object} [opts] - { env, now }
 * @returns {Promise<{ enabled, decisions, autoProceeded, resurfaced, hardWaited, skipped }>}
 */
async function planAndApplyPendingQuestions(supabase, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const flagOn = autoProceedEnabled(env);

  const questions = await loadOpenQuestions(supabase);

  const decisions = decidePendingQuestions(questions, {
    now,
    timeoutMs: resolveTimeoutMs(env),
    isCritical: isCriticalQuestion,
    autoProceedEnabled: flagOn,
  });

  let autoProceeded = 0;
  const qById = new Map(questions.map((q) => [q.id, q]));
  for (const d of decisions) {
    if (d.action !== 'auto_proceed') continue;
    const q = qById.get(d.id);
    if (!q) continue;
    const res = await applyAutoProceed(supabase, q, d, now);
    if (res.ok) autoProceeded++;
  }

  const resurfaced = decisions.filter((d) => d.action === 'resurface').length;
  const hardWaited = decisions.filter((d) => d.action === 'hard_wait').length;
  const skipped = decisions.filter((d) => d.action === 'skip').length;

  return { enabled: flagOn, decisions, autoProceeded, resurfaced, hardWaited, skipped };
}

module.exports = {
  // pure core + classifiers (unit-testable in isolation)
  decidePendingQuestions,
  isCriticalQuestion,
  recommendedOption,
  isAlreadyHandled,
  autoProceedEnabled,
  resolveTimeoutMs,
  CRITICAL_CATEGORIES,
  CRITICAL_KEYWORDS,
  DEFAULT_TIMEOUT_MS,
  // IO wiring (fail-open, flag-gated)
  loadOpenQuestions,
  applyAutoProceed,
  planAndApplyPendingQuestions,
};
