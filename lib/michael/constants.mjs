// lib/michael/constants.mjs — chairman identifiers resolved from env at CALL time, never hard-coded in
// a feeder. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-2).
//
// Import-time pure: nothing reads process.env until a resolver is called, so the unit tier can pass an
// explicit env and a feeder can be imported with no env at all. A missing required constant is a named
// refusal ({ ok:false, refusal:'CONSTANT_MISSING', variable }) the feeder maps to exit 2, never a throw.

/** Registry: variable -> { required, default, parse } */
export const MICHAEL_CONSTANTS = Object.freeze({
  MICHAEL_EXELON_CALENDAR_ID: Object.freeze({ required: true }),
  MICHAEL_TASKS_DRIVE_FOLDER_ID: Object.freeze({ required: true }),
  MICHAEL_DAILY_CHECKIN_TASK_ID: Object.freeze({ required: true }),
  // Same value as lib/integrations/todoist/chairman-notify.js DEFAULT_PROJECT_ID (the EHG chairman project).
  MICHAEL_EHG_CHAIRMAN_PROJECT_ID: Object.freeze({ required: false, default: '6grHWpvVM8QXrj5W' }),
  // Hard max: the ceiling is the RISK-2 volume bound, so an env typo can never make it unbounded.
  MICHAEL_GMAIL_MODIFY_CEILING: Object.freeze({ required: false, default: 60, parse: 'positiveInt', max: 500 }),
});
export const CEILING_HARD_MAX = 500;

function parseValue(name, raw, spec) {
  if (spec.parse === 'positiveInt') {
    // Decimal digits only: '1e308' and '0x40' are refused, not silently parsed (adversarial review of PR 8366).
    const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || (spec.max !== undefined && n > spec.max)) return { ok: false, refusal: 'CONSTANT_INVALID', variable: name, message: `${name} must be a positive integer${spec.max !== undefined ? ` at most ${spec.max}` : ''} (got ${JSON.stringify(raw)})` };
    return { ok: true, value: n };
  }
  return { ok: true, value: String(raw) };
}

/**
 * Resolve one constant. Returns { ok:true, value, source:'env'|'default' } or
 * { ok:false, refusal:'CONSTANT_MISSING'|'CONSTANT_INVALID'|'CONSTANT_UNKNOWN', variable, message }.
 */
export function resolveConstant(name, env = process.env) {
  const spec = Object.hasOwn(MICHAEL_CONSTANTS, name) ? MICHAEL_CONSTANTS[name] : null;
  if (!spec) return { ok: false, refusal: 'CONSTANT_UNKNOWN', variable: name, message: `${name} is not a Michael constant` };
  const raw = env && env[name] !== undefined ? String(env[name]).trim() : '';
  if (raw !== '') {
    const p = parseValue(name, raw, spec);
    return p.ok ? { ok: true, value: p.value, source: 'env' } : p;
  }
  if (spec.default !== undefined) return { ok: true, value: spec.default, source: 'default' };
  return { ok: false, refusal: 'CONSTANT_MISSING', variable: name, message: `${name} is not set on this host (add it to the host .env)` };
}

/** Resolve several constants at once; the first refusal wins. Returns { ok:true, values } or the refusal. */
export function resolveConstants(names, env = process.env) {
  const values = {};
  for (const n of names) {
    const r = resolveConstant(n, env);
    if (!r.ok) return r;
    values[n] = r.value;
  }
  return { ok: true, values };
}

export function gmailModifyCeiling(env = process.env) {
  return resolveConstant('MICHAEL_GMAIL_MODIFY_CEILING', env);
}
