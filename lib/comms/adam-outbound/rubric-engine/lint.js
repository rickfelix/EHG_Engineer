// @wire-check-exempt: foundation shared library — consumed by SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-C (chairman-SMS gate) and -D (Adam-outbound gate); built first per the orchestrator dependency order, wired when those dependent children land.
/**
 * Deterministic pre-send lint — the FIRST, blocking, ungameable layer of the rubric engine.
 *
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-A.
 *
 * Runs BEFORE any LLM call. Pure and synchronous. Returns itemized findings; the caller
 * (index.js) blocks the send if any finding has blocking=true and NEVER calls the LLM
 * review on a lint failure (that ordering is the structural fix for F3 — a malformed
 * decision must be impossible to send, not merely discouraged by a judgment model).
 */

import { findSecrets } from './secret-patterns.js';

const DEFAULT_MAX_LEN = 1600; // ~10 SMS segments; callers may override via context.maxLength

/**
 * Decide the EFFECTIVE type of a message. Classifier hardening: a message that carries
 * options, or whose body contains an option/question pattern, is treated as a DECISION
 * regardless of a claimed type==='status'. Misclassified-as-status is the dangerous bypass
 * (a decision that skips the decision checks), so detection is one-directional: we only ever
 * UPGRADE toward 'decision', never downgrade.
 * @param {object} message
 * @returns {'decision'|'status'}
 */
export function effectiveType(message = {}) {
  if (message.type === 'decision') return 'decision';
  const body = typeof message.body === 'string' ? message.body : '';
  const hasOptions = Array.isArray(message.options) && message.options.length > 0;
  // Structured options are decisive evidence regardless of the claimed type.
  if (hasOptions) return 'decision';
  // Option markers ("A)", "1.", "- ") near line starts, or an interrogative asking to choose.
  const optionPattern = /(^|\n)\s*(?:[A-Za-z]\)|[A-Za-z]\.|\d\)|\d\.|-)\s+\S/;
  const questionPattern = /\?\s*$|\b(reply|choose|approve|which|should i|yes\/no|y\/n)\b/i;
  // QF-20260719-793: an EXPLICIT type:'status' raises the reclassification bar. Bare single
  // signals ('which'/'reply' in prose, hyphen bullets in a summary) false-blocked 4 live
  // chairman-facing status texts on 2026-07-19. An explicit status still upgrades on STRONG
  // evidence — a trailing question mark, or option-marker lines COMBINED with an interrogative —
  // so a decision dressed as status cannot skip the decision checks (upgrade-only preserved;
  // under-classification stays fail-closed: status sends still pass quiet-hours/rate/secrets).
  if (message.type === 'status') {
    const trailingQuestion = /\?\s*$/.test(body.trim());
    if (trailingQuestion || (optionPattern.test(body) && questionPattern.test(body))) return 'decision';
    return 'status';
  }
  // Undeclared/ambiguous types keep the aggressive single-signal promotion.
  if (optionPattern.test(body) || questionPattern.test(body)) return 'decision';
  return message.type || 'status';
}

/**
 * Return the current hour (0-23) in America/New_York, DST-aware, dependency-free.
 * context.nowHourET (a number) wins when provided (deterministic tests); otherwise derive
 * from context.now (a Date) or, last resort, throw — the engine must never guess quiet-hours.
 * @param {object} context
 * @returns {number}
 */
export function etHour(context = {}) {
  if (Number.isInteger(context.nowHourET)) return context.nowHourET;
  const d = context.now instanceof Date ? context.now : null;
  if (!d) throw new Error('rubric-engine lint: quiet-hours needs context.nowHourET or context.now (Date)');
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
  }).format(d);
  const h = parseInt(hourStr, 10);
  return h === 24 ? 0 : h; // some ICU builds render midnight as 24
}

/** Quiet hours: 22:00–05:59 ET (the 22:00–06:00 window). */
export function inQuietHours(context = {}) {
  const h = etHour(context);
  return h >= 22 || h < 6;
}

/**
 * Run the 9-check deterministic lint.
 * @param {object} message
 * @param {object} context - { maxLength?, nowHourET?/now?, sentInWindow?, rateCap?, allowQuietHours? }
 * @returns {{ findings: Array<{check:string, ok:boolean, blocking:boolean, detail:string}>, blocked: boolean, effectiveType: string }}
 */
export function lint(message = {}, context = {}) {
  const findings = [];
  const body = typeof message.body === 'string' ? message.body : '';
  const type = effectiveType(message);
  const isDecision = type === 'decision';
  const add = (check, ok, blocking, detail) => findings.push({ check, ok, blocking, detail });

  // 1. labeled options (decisions only)
  if (isDecision) {
    const opts = Array.isArray(message.options) ? message.options : [];
    const labeled = opts.length >= 2 && opts.every((o) => o && typeof (o.label ?? o) === 'string' && String(o.label ?? o).trim().length > 0);
    add('labeled_options', labeled, true, labeled ? 'ok' : 'a decision needs >=2 explicitly labeled options');
  }

  // 2. exactly one decision (decisions only)
  if (isDecision) {
    const count = Number.isInteger(message.decisionCount) ? message.decisionCount : 1;
    add('exactly_one_decision', count === 1, true, count === 1 ? 'ok' : `message bundles ${count} decisions; send one decision per message`);
  }

  // 3. explicit reply instruction (decisions only)
  if (isDecision) {
    const ri = typeof message.replyInstruction === 'string' && message.replyInstruction.trim().length > 0;
    add('reply_instruction', ri, true, ri ? 'ok' : 'a decision needs an explicit reply instruction (how to answer)');
  }

  // 4. DETAILS keyword affordance (decisions only)
  if (isDecision) {
    const hasDetails = /\bDETAILS\b/.test(body) || /\bDETAILS\b/.test(String(message.replyInstruction || ''));
    add('details_keyword', hasDetails, true, hasDetails ? 'ok' : 'a decision must offer the DETAILS reply keyword');
  }

  // 5. length bounds (all)
  const maxLen = Number.isInteger(context.maxLength) ? context.maxLength : DEFAULT_MAX_LEN;
  const lenOk = body.trim().length > 0 && body.length <= maxLen;
  add('length', lenOk, true, lenOk ? 'ok' : `body length ${body.length} outside (0, ${maxLen}]`);

  // 6. no secrets (all)
  const secrets = findSecrets(body);
  add('no_secrets', secrets.length === 0, true, secrets.length === 0 ? 'ok' : `secret(s) detected: ${secrets.join(', ')}`);

  // 7. quiet hours (all, unless explicitly allowed e.g. a ratified heartbeat schedule)
  const quiet = inQuietHours(context) && !context.allowQuietHours;
  add('quiet_hours', !quiet, true, quiet ? 'within 22:00-06:00 ET quiet window' : 'ok');

  // 8. rate cap (all, when the caller supplies window state)
  if (Number.isInteger(context.rateCap)) {
    const sent = Number.isInteger(context.sentInWindow) ? context.sentInWindow : 0;
    const under = sent < context.rateCap;
    add('rate_cap', under, true, under ? 'ok' : `rate cap reached (${sent}/${context.rateCap})`);
  }

  // 9. reply IDs (decisions only — correlation for the reconcile/away-bridge layers)
  if (isDecision) {
    const hasId = typeof message.replyId === 'string' && message.replyId.trim().length > 0;
    add('reply_ids', hasId, true, hasId ? 'ok' : 'a decision needs a reply-ID for delivery/answer correlation');
  }

  const blocked = findings.some((f) => f.blocking && !f.ok);
  return { findings, blocked, effectiveType: type };
}
