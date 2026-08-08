/**
 * Canonical reader for "does this SD have sub-agent evidence?"
 * QF-20260804-048.
 *
 * WHY THIS EXISTS. sub_agent_execution_results.sd_id holds a UUID, but every worker reasons in
 * sd_key. So the natural hand-rolled query filters that UUID column with a KEY string — and
 * PostgREST returns EMPTY WITH NO ERROR for the mismatch. The result is, in one worker's words,
 * "a CONSTANT wearing the shape of a measurement": it cannot report anything but zero, and nothing
 * in the response distinguishes "no evidence exists" from "you asked with the wrong value format".
 *
 * MEASURED HARM, two different workers on one night, both acting on the false zero:
 *   - one ran a per-tick blocker re-check that returned empty unconditionally for ~50 minutes and
 *     reported "blocker UNCHANGED" throughout, while a real TESTING/FAIL row sat invisible to it;
 *   - another reported "evidence rows: 0" for seven consecutive cycles (~105 min), concluded the SD
 *     "provably cannot advance", and escalated asking to be re-routed off it. The gate then passed
 *     LEAD-TO-PLAN at 94 with GATE_SUBAGENT_EVIDENCE green — the evidence had been there all along.
 * So it does not merely mislead: it produced a false blocker report, a false escalation, and a
 * request to abandon workable work.
 *
 * THE ROOT IS THAT NO CANONICAL READER EXISTED, so every caller invented one and invented the same
 * bug. This is that reader.
 *
 * DESIGN RULE, and the whole point: **THROW ON AN UNRESOLVABLE INPUT — NEVER RETURN EMPTY.** An
 * empty result must mean "this SD genuinely has no such evidence" and nothing else. A helper that
 * answered "0" for a typo would just relocate the defect behind a friendlier name.
 */

import { createClient } from '@supabase/supabase-js';
// QF-20260807-736: import the GATE ITSELF, not a second statement of its policy. These are pure
// exports — the effectful entry point (validateSubagentEvidence) is deliberately NOT called here,
// because it logs and, under LEO_DISABLE_SUBAGENT_EVIDENCE_GATE, INSERTS a gate_bypass audit_log
// row. Asking "would this pass?" must never emit a record of a bypass that did not happen.
import {
  classifyVerdict,
  REQUIRED_SUBAGENTS,
  _internals as GATE_INTERNALS
} from '../../scripts/modules/handoff/gates/subagent-evidence-gate.js';

/**
 * Verdicts the evidence gate treats as satisfying a requirement.
 *
 * DERIVED FROM THE GATE, never restated. This constant used to be its own frozen list, and that
 * replica had ALREADY DRIFTED: it decided acceptance with `accepted.includes(verdict)`, so an
 * UNRECOGNISED verdict was rejected — while the gate classifies unknown verdicts as ACCEPTED
 * (fail-open with a warning, subagent-evidence-gate.js:430). A worker consulting the helper got a
 * red the gate would have passed. That is the exact silent-drift failure this QF was filed about,
 * present in the code before it was written.
 */
export const ACCEPTED_VERDICTS = Object.freeze([...GATE_INTERNALS.ACCEPT_VERDICTS]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('evidence-status: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Resolve an sd_key OR uuid to the canonical strategic_directives_v2.id.
 *
 * THROWS when the input cannot be resolved. That is deliberate and is the fix: the defect this QF
 * documents is a lookup that answers "nothing here" when it means "I could not ask the question".
 *
 * @param {string} sdKeyOrId
 * @param {{supabase?:object}} [opts]
 * @returns {Promise<string>} the canonical id
 */
export async function resolveSdId(sdKeyOrId, { supabase } = {}) {
  if (typeof sdKeyOrId !== 'string' || !sdKeyOrId.trim()) {
    throw new Error('evidence-status: an sd_key or sd id is required (got ' + JSON.stringify(sdKeyOrId) + ')');
  }
  const input = sdKeyOrId.trim();
  const db = supabase || defaultClient();

  // A UUID may still not exist; confirm rather than assume, so a stale id cannot masquerade as
  // "no evidence" further down.
  const column = UUID_RE.test(input) ? 'id' : 'sd_key';
  const { data, error } = await db
    .from('strategic_directives_v2')
    .select('id')
    .eq(column, input)
    .maybeSingle();

  if (error) throw new Error(`evidence-status: SD lookup failed for ${input}: ${error.message}`);
  if (!data || !data.id) {
    throw new Error(
      `evidence-status: no strategic directive matches ${JSON.stringify(input)} (looked up by ${column}). `
      + 'Refusing to return an empty evidence set for an unresolvable SD — that is the defect this helper exists to prevent.'
    );
  }
  return data.id;
}

/**
 * Evidence rows for an SD, keyed by sub-agent code (latest row per code).
 *
 * Accepts an sd_key OR a uuid and resolves it, so a caller reasoning in keys — which is every
 * caller — cannot silently query a uuid column with a key.
 *
 * @param {string} sdKeyOrId
 * @param {{supabase?:object, phase?:string, sinceMs?:number, nowMs?:number}} [opts]
 * @returns {Promise<{sdId:string, rows:Array, byCode:Object}>}
 */
export async function getEvidence(sdKeyOrId, { supabase, phase, sinceMs, nowMs = Date.now() } = {}) {
  const db = supabase || defaultClient();
  const sdId = await resolveSdId(sdKeyOrId, { supabase: db });

  let q = db
    .from('sub_agent_execution_results')
    .select('id, sub_agent_code, verdict, phase, created_at')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (phase) q = q.eq('phase', phase);
  if (Number.isFinite(sinceMs)) q = q.gte('created_at', new Date(nowMs - sinceMs).toISOString());

  const { data, error } = await q;
  if (error) throw new Error(`evidence-status: evidence query failed for ${sdId}: ${error.message}`);

  const rows = data || [];
  const byCode = {};
  for (const r of rows) {
    // rows are newest-first, so the first sighting of a code is its latest row
    const code = String(r.sub_agent_code || '').toUpperCase();
    if (code && !byCode[code]) byCode[code] = r;
  }
  return { sdId, rows, byCode };
}

/**
 * Does this SD have accepted evidence for every required sub-agent code?
 *
 * @param {string} sdKeyOrId
 * @param {string[]} requiredCodes
 * @param {{supabase?:object, phase?:string, sinceMs?:number, nowMs?:number, acceptedVerdicts?:string[]}} [opts]
 * @returns {Promise<{sdId:string, satisfied:boolean, present:string[], missing:string[], rejected:Array}>}
 */
export async function hasEvidenceFor(sdKeyOrId, requiredCodes, opts = {}) {
  if (!Array.isArray(requiredCodes) || requiredCodes.length === 0) {
    throw new Error('evidence-status: requiredCodes must be a non-empty array — an empty requirement is trivially satisfied and hides the question');
  }
  const accepted = opts.acceptedVerdicts || ACCEPTED_VERDICTS;
  const { sdId, byCode } = await getEvidence(sdKeyOrId, opts);

  const present = [];
  const missing = [];
  const rejected = [];
  for (const raw of requiredCodes) {
    const code = String(raw).toUpperCase();
    const row = byCode[code];
    if (!row) { missing.push(code); continue; }
    // Defer to the GATE's classifier unless the caller pinned an explicit set (back-compat).
    // classifyVerdict folds unknown -> 'unknown', which the gate ACCEPTS fail-open; matching that
    // here is the point of the QF — a helper that is stricter than the gate is still wrong.
    const ok = opts.acceptedVerdicts
      ? accepted.includes(String(row.verdict).toUpperCase())
      : classifyVerdict(row.verdict) === 'accept' || classifyVerdict(row.verdict) === 'unknown';
    if (ok) present.push(code);
    else rejected.push({ code, verdict: row.verdict, id: row.id });
  }
  return { sdId, satisfied: missing.length === 0 && rejected.length === 0, present, missing, rejected };
}

/**
 * ASK THE GATE, not a replica of it: "would GATE_SUBAGENT_EVIDENCE pass for this SD + handoff?"
 *
 * WHY THIS EXISTS. Every other reader answers from a second implementation of gate policy, which
 * agrees with the gate only until one side changes — and the failure is silent in BOTH directions
 * (a confident green that the gate reds, or a red that the gate would have passed).
 *
 * WHY IT DOES NOT CALL validateSubagentEvidence. That is the authority, but it is EFFECTFUL: it
 * logs a gate banner and, when LEO_DISABLE_SUBAGENT_EVIDENCE_GATE is set, INSERTS an audit_log
 * gate_bypass row. Re-running an instrument to display its answer re-runs its side effects, so a
 * worker's "would this pass?" would forge a bypass record. Instead this uses the gate's own
 * REQUIRED_SUBAGENTS and classifyVerdict — the authority's policy, one representation, no writes.
 *
 * NOT MODELLED, deliberately, and callers must not read a pass as a guarantee: the gate also
 * applies phase-freshness (evidence older than the current phase start does not count). This
 * answers the VERDICT question over the rows getEvidence() returns for the given opts.
 *
 * @param {string} sdKeyOrId
 * @param {string} handoffType e.g. 'LEAD-TO-PLAN'
 * @param {{supabase?:object, phase?:string, sinceMs?:number, nowMs?:number}} [opts]
 * @returns {Promise<{sdId:string, handoffType:string, wouldPass:boolean, required:string[], present:string[], missing:string[], rejected:Array}>}
 */
export async function askGate(sdKeyOrId, handoffType, opts = {}) {
  const required = REQUIRED_SUBAGENTS[handoffType];
  if (!Array.isArray(required)) {
    // An unknown handoff type must THROW, never answer "nothing required, you pass" — that is the
    // false-zero this module exists to abolish, wearing a different name.
    throw new Error(
      `evidence-status: unknown handoff type ${JSON.stringify(handoffType)}. Known: ${Object.keys(REQUIRED_SUBAGENTS).join(', ')}`
    );
  }
  if (required.length === 0) {
    return { sdId: await resolveSdId(sdKeyOrId, opts), handoffType, wouldPass: true, required: [], present: [], missing: [], rejected: [] };
  }
  const r = await hasEvidenceFor(sdKeyOrId, required, opts);
  return { sdId: r.sdId, handoffType, wouldPass: r.satisfied, required: [...required], present: r.present, missing: r.missing, rejected: r.rejected };
}
