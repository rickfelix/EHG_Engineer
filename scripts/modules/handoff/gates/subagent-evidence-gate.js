/**
 * Sub-Agent Evidence Gate (SD-LEO-INFRA-OPUS-MODULE-SUB-001)
 *
 * DB-enforced blocking gate that queries `sub_agent_execution_results` for fresh
 * rows matching the required set per handoff type. Closes the enforcement gap
 * left by SD-LEO-FIX-PLAN-OPUS-HARNESS-001 which updated protocol text (Module A2)
 * but shipped no gate code.
 *
 * Distinct from `executors/exec-to-plan/gates/subagent-enforcement-validation.js`:
 *   - This gate: keyed on handoffType, required:true (blocking), freshness-aware
 *   - That gate: keyed on sd_type, required:false (advisory), no freshness
 *
 * Emergency bypass: set LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 (writes audit_log warning).
 *
 * SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001 (FR-2): when no evidence row exists yet
 * AND the phase started within RACE_WINDOW_SECONDS (the agent may be mid-write),
 * return a WAIT verdict instead of FAIL so the orchestrator re-checks later
 * without burning retry budget. Outside the window → FAIL (unchanged).
 *
 * SD-FDBK-FIX-GATE-SUBAGENT-EVIDENCE-001: the gate used to select `verdict` and
 * then DISCARD it — presence of a row satisfied the gate regardless of outcome,
 * so a sub-agent that crashed and wrote an error row (verdict=FAIL) counted
 * exactly like a genuine PASS. The gate now (a) reduces evidence to the LATEST
 * row per agent and (b) compares that row's verdict against an explicit policy.
 * Rollout is warn-first via SUBAGENT_VERDICT_MODE (see resolveSubagentVerdictMode).
 */
import { buildWaitResult, buildFailResult, isWithinRaceWindow } from '../../../../lib/handoff/wait-verdict.js';
import { REQUIRED_SUBAGENTS } from '../required-subagents.js';

/**
 * Race window (seconds) during which a missing evidence row is treated as a
 * transient write-lag (WAIT) rather than a real absence (FAIL).
 */
const RACE_WINDOW_SECONDS = 30;

/**
 * Verdicts that SATISFY a required sub-agent.
 * Sized against the live population, not a recent sample (n=27,694 rows,
 * whole table, measured 2026-07-31). CONDITIONAL_PASS is a pass with caveats —
 * it is 1,107 rows table-wide and 217/570 of VALIDATION's last 30 days, so
 * rejecting it would blank out the single most-required agent. WARNING is an
 * agent that ran to completion and reported non-blocking concerns.
 */
const ACCEPT_VERDICTS = new Set(['PASS', 'CONDITIONAL_PASS', 'WARNING']);

/**
 * Verdicts that DO NOT satisfy a required sub-agent.
 *   FAIL            — the agent ran and rejected, or crashed and wrote an error row.
 *   BLOCKED         — the agent could not reach a verdict. NOT a pass.
 *   PENDING         — the run never finished (2,330 rows table-wide, 2,265 of them
 *                     VISION_FIDELITY LLM timeouts; zero among the required set).
 *   MANUAL_REQUIRED — "a human must still act". Absent from the original policy
 *                     brief; found by measuring the table (92 rows, all STORIES/
 *                     DOCMON, zero among the required set). Explicitly classified
 *                     rather than left to fall through to `unknown`, because
 *                     "manual action outstanding" is the opposite of validated.
 */
const REJECT_VERDICTS = new Set(['FAIL', 'BLOCKED', 'PENDING', 'MANUAL_REQUIRED']);

/**
 * Classify one verdict value into accept / reject / unknown.
 *
 * NULL, empty, and unrecognised strings resolve to `unknown`, which the gate
 * ACCEPTS while emitting a warning. Rationale: measured 0 NULL and 0 empty
 * verdicts across all 27,694 rows, so this branch protects against a FUTURE
 * writer emitting an unmodelled value — and on that path a fail-open warning is
 * strictly better than a manufactured block, matching how the sibling
 * invocation-path gate fails open on infra surprises. An unknown verdict is
 * deliberately NOT silent: it warns in both modes so a new value gets noticed
 * and classified rather than quietly re-hollowing the gate.
 *
 * @param {string|null|undefined} verdict
 * @returns {'accept'|'reject'|'unknown'}
 */
export function classifyVerdict(verdict) {
  if (verdict === null || verdict === undefined) return 'unknown';
  const v = String(verdict).trim().toUpperCase();
  if (v === '') return 'unknown';
  if (ACCEPT_VERDICTS.has(v)) return 'accept';
  if (REJECT_VERDICTS.has(v)) return 'reject';
  return 'unknown';
}

/**
 * Warn-first rollout resolver, mirroring resolveInvocationMode in
 * executors/lead-final-approval/gates/invocation-path-gate.js.
 *
 * Default ADVISORY: a rejecting verdict is surfaced as a WARNING and the gate
 * still passes. SUBAGENT_VERDICT_MODE=block promotes it to a hard failure.
 * The default must stay advisory — this gate has been presence-only since it
 * shipped, so a blocking default would retroactively fail in-flight SDs whose
 * evidence was collected under the old contract. See the promotion precondition
 * documented in ../required-subagents.js before flipping this.
 *
 * @param {object} [env]
 * @returns {'advisory'|'block'}
 */
export function resolveSubagentVerdictMode(env = process.env) {
  return (env && env.SUBAGENT_VERDICT_MODE) === 'block' ? 'block' : 'advisory';
}

/**
 * Required sub-agents per handoff type.
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-C (FR-3): the mapping now lives in the
 * shared SSOT module so the gate and the phase-subagent-orchestrator can never
 * drift. Re-exported here so /claim, /leo settings, and existing importers keep
 * working unchanged.
 */
export { REQUIRED_SUBAGENTS };

/**
 * Parse a DB timestamp string treating naive (no-TZ) values as UTC.
 * strategic_directives_v2.created_at and sd_phase_handoffs.accepted_at are
 * stored as timestamp-without-time-zone in some environments; PostgREST returns
 * them as naive strings, and `new Date(...)` parses naive strings as LOCAL —
 * inflating freshness anchors by the local UTC offset and rejecting valid
 * evidence rows. Append 'Z' when no TZ marker is present so JS treats it as UTC.
 */
function parseAsUTC(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(ts);
  return new Date(hasTZ ? ts : ts + 'Z');
}

/**
 * Resolve the current-phase start timestamp for freshness comparison.
 * Order:
 *   1) sd_phase_handoffs.accepted_at for most recent accepted handoff INTO current phase
 *   2) strategic_directives_v2.created_at (fallback for LEAD-TO-PLAN at SD birth)
 *
 * Cached on ctx._phaseStartedAt per precheck run.
 *
 * @param {Object} ctx - Handoff ctx {sd, handoffType, supabase, sdId}
 * @param {Object} supabase - Supabase client (when ctx.supabase absent)
 * @returns {Promise<Date>} Phase start timestamp
 */
async function resolveCurrentPhaseStartedAt(ctx, supabase) {
  if (ctx._phaseStartedAt instanceof Date) return ctx._phaseStartedAt;
  if (typeof ctx._phaseStartedAt === 'string') {
    ctx._phaseStartedAt = parseAsUTC(ctx._phaseStartedAt);
    return ctx._phaseStartedAt;
  }

  const db = supabase || ctx.supabase;
  const sdUuid = ctx.sd?.id || ctx.sdId;
  const handoffType = ctx.handoffType;
  if (!db || !sdUuid || !handoffType) {
    // No way to resolve; treat as epoch so any evidence row passes freshness
    ctx._phaseStartedAt = new Date(0);
    return ctx._phaseStartedAt;
  }

  // currentPhase = the destination of the most recent completed handoff
  // For LEAD-TO-PLAN, current phase IS still LEAD (that's the SD's state);
  // for PLAN-TO-EXEC, current phase is PLAN (just entered via LEAD-TO-PLAN).
  const toPhaseMap = {
    'LEAD-TO-PLAN': 'LEAD',
    'PLAN-TO-EXEC': 'PLAN',
    'EXEC-TO-PLAN': 'EXEC',
    'PLAN-TO-LEAD': 'PLAN',
    'LEAD-FINAL-APPROVAL': 'LEAD'
  };
  const currentPhase = toPhaseMap[handoffType] || 'LEAD';

  // Try most recent accepted handoff INTO the current phase
  try {
    const { data } = await db
      .from('sd_phase_handoffs')
      .select('accepted_at')
      .eq('sd_id', sdUuid)
      .eq('to_phase', currentPhase)
      .eq('status', 'accepted')
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].accepted_at) {
      ctx._phaseStartedAt = parseAsUTC(data[0].accepted_at);
      return ctx._phaseStartedAt;
    }
  } catch (_) {
    // fall through to SD created_at fallback
  }

  // LEAD fallback: SD creation timestamp
  try {
    const { data } = await db
      .from('strategic_directives_v2')
      .select('created_at')
      .eq('id', sdUuid)
      .single();
    if (data?.created_at) {
      ctx._phaseStartedAt = parseAsUTC(data.created_at);
      return ctx._phaseStartedAt;
    }
  } catch (_) { /* noop */ }

  // Last-resort fallback
  ctx._phaseStartedAt = new Date(0);
  return ctx._phaseStartedAt;
}

/**
 * Check the emergency kill-switch env var.
 * @returns {boolean}
 */
function killSwitchActive() {
  const v = process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE;
  return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}

/**
 * Write a non-blocking audit_log row documenting the bypass.
 */
async function writeKillSwitchAudit(db, sdUuid, handoffType) {
  if (!db) return;
  // QF-20260509-AUDIT-LOG-SHAPE: prior shape used `action: 'gate_bypass'` —
  // audit_log has NO `action` column, so the insert silently failed
  // (caught + warned). Canonical shape is event_type + entity_type +
  // entity_id + severity + metadata + created_by. Closes feedback 327716da.
  try {
    await db.from('audit_log').insert({
      event_type: 'gate_bypass',
      entity_type: 'strategic_directive',
      entity_id: sdUuid,
      severity: 'warning',
      metadata: {
        gate: 'GATE_SUBAGENT_EVIDENCE',
        sd_id: sdUuid,
        handoff_type: handoffType,
        reason: 'LEO_DISABLE_SUBAGENT_EVIDENCE_GATE env var set'
      },
      created_by: 'subagent-evidence-gate'
    });
  } catch (e) {
    // Non-blocking: auditability is secondary to correctness
    console.warn(`   ⚠️  audit_log insert suppressed: ${e?.message || e}`);
  }
}

/**
 * Validate that fresh sub-agent evidence exists for the required set.
 *
 * @param {Object} ctx - Handoff ctx {sd, handoffType, supabase, sdId}
 * @param {Object} supabase - Supabase client (when not on ctx)
 * @returns {Promise<Object>} Gate result
 */
export async function validateSubagentEvidence(ctx, supabase) {
  const db = supabase || ctx.supabase;
  const sdUuid = ctx.sd?.id || ctx.sdId;
  const sdKey = ctx.sd?.sd_key || sdUuid;
  const handoffType = ctx.handoffType;

  console.log('\n🔍 GATE: Sub-Agent Evidence (DB-enforced)');
  console.log(`   Handoff: ${handoffType || 'unknown'} | SD: ${sdKey || 'unknown'}`);
  console.log('-'.repeat(50));

  const required = REQUIRED_SUBAGENTS[handoffType] || [];

  // Empty required set → pass
  if (required.length === 0) {
    console.log(`   ℹ️  No required sub-agents for ${handoffType} — gate passes`);
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: { required: [], missing: [] }
    };
  }

  // Kill-switch
  if (killSwitchActive()) {
    console.log('   ⚠️  LEO_DISABLE_SUBAGENT_EVIDENCE_GATE active — bypassing');
    await writeKillSwitchAudit(db, sdUuid, handoffType);
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: ['SUBAGENT_EVIDENCE_GATE BYPASSED via LEO_DISABLE_SUBAGENT_EVIDENCE_GATE'],
      details: { bypassed: true, required, reason: 'env_var' }
    };
  }

  if (!db || !sdUuid) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['Supabase client or SD UUID unavailable'],
      warnings: [],
      details: { reason: 'MISSING_CONTEXT' },
      remediation: 'Ensure handoff precheck passes supabase client and SD UUID in ctx.'
    };
  }

  const phaseStartedAt = await resolveCurrentPhaseStartedAt(ctx, db);
  console.log(`   Phase-start: ${phaseStartedAt.toISOString()}`);
  console.log(`   Required agents: ${required.join(', ')}`);

  // Query evidence
  let rows;
  try {
    const { data, error } = await db
      .from('sub_agent_execution_results')
      .select('sub_agent_code, created_at, verdict')
      .eq('sd_id', sdUuid)
      .gte('created_at', phaseStartedAt.toISOString());
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: [`sub_agent_execution_results query failed: ${e?.message || e}`],
      warnings: [],
      details: { reason: 'DB_ERROR' },
      remediation: 'Verify Supabase connectivity; re-run handoff precheck.'
    };
  }

  // Compare (case-insensitive) — required may be "VALIDATION" while rows write "validation-agent"
  // Match by normalized prefix: uppercase and strip "-agent"
  const norm = s => String(s || '').toUpperCase().replace(/-AGENT$/, '').replace(/-+/g, '_');

  // Group by NORMALIZED sub_agent_code, keep MAX(created_at) — what the old
  // comment claimed but the old code never did (it flattened every row into a
  // presence Set). Under presence-only that was harmless; under verdict-checking
  // it is load-bearing, because an agent that FAILED then SUCCEEDED (or the
  // reverse) is otherwise ambiguous. Latest-wins also gives "re-run after fixing"
  // the correct semantics for free.
  //
  // Grouping on the NORMALIZED key (not the raw code) is deliberate: the presence
  // check has always treated 'Explore'/'EXPLORE' and 'TESTING'/'testing-agent' as
  // the same agent, so the verdict check must collapse them the same way. Grouping
  // raw would let a stale variant's verdict survive alongside the current one.
  //
  // parseAsUTC (not string compare) because created_at arrives in mixed shapes —
  // naive, '+00:00', and varying fractional-second precision all coexist in this table.
  const present = new Set();
  const latestByCode = new Map();
  for (const r of rows) {
    if (!r?.sub_agent_code) continue;
    present.add(r.sub_agent_code);
    const key = norm(r.sub_agent_code);
    const prev = latestByCode.get(key);
    // An unparseable created_at yields NaN, and every NaN comparison is false —
    // which would silently pin the group to whichever row happened to arrive
    // first. Coerce to 0 so such a row can only ever LOSE to a real timestamp.
    const parsed = parseAsUTC(r.created_at)?.getTime();
    const t = Number.isFinite(parsed) ? parsed : 0;
    if (!prev || t >= prev._t) latestByCode.set(key, { ...r, _t: t });
  }

  const missing = required.filter(r => !latestByCode.has(norm(r)));

  // SD-FDBK-FIX-GATE-SUBAGENT-EVIDENCE-001: agents that DID write evidence, but
  // whose latest row is a rejecting verdict. Kept separate from `missing` so the
  // FR-2 race-window WAIT below stays keyed on true absence only — a row that
  // exists and says FAIL is not "the agent may still be mid-write".
  const failing = [];
  const unknownVerdicts = [];
  for (const r of required) {
    const row = latestByCode.get(norm(r));
    if (!row) continue;
    const klass = classifyVerdict(row.verdict);
    if (klass === 'reject') failing.push({ agent: r, verdict: row.verdict, created_at: row.created_at });
    else if (klass === 'unknown') unknownVerdicts.push({ agent: r, verdict: row.verdict });
  }

  if (missing.length === 0) {
    // Every required agent wrote a row. Presence used to end the check here;
    // now the LATEST row's verdict decides. SUBAGENT_VERDICT_MODE governs whether
    // a rejecting verdict warns (advisory, default) or fails (block).
    const mode = resolveSubagentVerdictMode();
    const verdictDetails = {
      required,
      present: [...present],
      missing: [],
      verdict_mode: mode,
      latest_verdicts: required.map(r => ({ agent: r, verdict: latestByCode.get(norm(r))?.verdict ?? null })),
      failing,
      unknown_verdicts: unknownVerdicts,
      phase_started_at: phaseStartedAt.toISOString()
    };

    // Unknown verdicts never block (see classifyVerdict) but must never be silent.
    const unknownWarnings = unknownVerdicts.map(
      u => `SUBAGENT_VERDICT_UNKNOWN: ${u.agent} latest evidence carries unrecognised verdict ${JSON.stringify(u.verdict)} — accepted (fail-open), but classify it in ACCEPT_VERDICTS/REJECT_VERDICTS.`
    );
    for (const u of unknownVerdicts) console.log(`   ❔ ${u.agent}: unrecognised verdict ${JSON.stringify(u.verdict)} — accepted with warning`);

    if (failing.length === 0) {
      console.log(`   ✅ All required sub-agents have fresh PASSING evidence (${required.length}/${required.length})`);
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: unknownWarnings,
        details: verdictDetails
      };
    }

    const summary = failing.map(f => `${f.agent}=${f.verdict}`).join(', ');
    const headline = `SUBAGENT_EVIDENCE_BAD_VERDICT: latest evidence for ${summary} does not indicate a pass`;
    const remediation = `Re-run the sub-agent(s) (${failing.map(f => f.agent).join(', ')}) for SD ${sdKey} and let them write a fresh passing row — the gate reads the LATEST row per agent, so a successful re-run supersedes the failed one. Accepted verdicts: ${[...ACCEPT_VERDICTS].join('/')}.`;
    console.log(`   ${mode === 'block' ? '❌' : '⚠️ '} ${headline} (mode: ${mode})`);

    if (mode === 'block') {
      return buildFailResult({
        score: 0,
        max_score: 100,
        issues: [headline],
        details: { reason: 'SUBAGENT_EVIDENCE_BAD_VERDICT', ...verdictDetails },
        remediation
      });
    }

    // advisory (default): warn, do not fail — a gate that has been presence-only
    // since it shipped must not start blocking in-flight SDs without an opt-in.
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [
        `[ADVISORY] ${headline}. ${remediation}`,
        'Enforcement is opt-in: set SUBAGENT_VERDICT_MODE=block to FAIL on non-passing sub-agent evidence.',
        ...unknownWarnings
      ],
      details: verdictDetails
    };
  }

  // FR-2: race-window WAIT. If the phase started within RACE_WINDOW_SECONDS the
  // required agent(s) may still be writing their row(s) — return WAIT (not FAIL)
  // so retry budget is preserved and the orchestrator re-checks later. The
  // phase-start anchor is derived from the prior handoff's accepted_at (RISK-1:
  // there is NO invoked_at column). A missing/epoch anchor is far in the past,
  // so isWithinRaceWindow returns false → FAIL (safe default).
  // `failing` is carried here too: when some agents are absent AND others wrote a
  // rejecting row, absence still decides the verdict (unchanged behavior), but the
  // bad verdicts must remain visible in details rather than being dropped.
  const sharedDetails = {
    required,
    present: [...present],
    missing,
    failing,
    phase_started_at: phaseStartedAt.toISOString()
  };

  if (isWithinRaceWindow(phaseStartedAt, RACE_WINDOW_SECONDS)) {
    console.log(`   ⏳ WAIT: evidence row(s) not yet written (within ${RACE_WINDOW_SECONDS}s race window): ${missing.join(', ')}`);
    return buildWaitResult({
      score: 0,
      max_score: 100,
      wait_reason: `Sub-agent evidence not yet written for ${missing.join(', ')} (phase started <${RACE_WINDOW_SECONDS}s ago; agent may be mid-write)`,
      details: { reason: 'SUBAGENT_EVIDENCE_WRITE_LAG', race_window_seconds: RACE_WINDOW_SECONDS, ...sharedDetails },
      remediation: `Re-check shortly; the required sub-agent(s) (${missing.join(', ')}) may still be writing to sub_agent_execution_results. If still missing after the race window, invoke them via the Task tool.`
    });
  }

  console.log(`   ❌ SUBAGENT_EVIDENCE_MISSING: ${missing.join(', ')}`);
  return buildFailResult({
    score: 0,
    max_score: 100,
    issues: [`SUBAGENT_EVIDENCE_MISSING: ${missing.join(', ')}`],
    details: { reason: 'SUBAGENT_EVIDENCE_MISSING', ...sharedDetails },
    remediation: `Invoke the missing sub-agent(s) via Task tool for SD ${sdKey} before re-running the ${handoffType} handoff, OR set LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 as an emergency bypass.`
  });
}

/**
 * Factory: create the gate definition for registration in a handoff executor.
 *
 * @param {Object} supabase
 * @returns {Object}
 */
export function createSubagentEvidenceGate(supabase) {
  return {
    name: 'GATE_SUBAGENT_EVIDENCE',
    validator: async (ctx) => validateSubagentEvidence(ctx, supabase),
    required: true,
    remediation:
      'Invoke the missing sub-agent(s) via Task tool for this SD before re-running the handoff. ' +
      'Emergency bypass: LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 (logs audit_log warning).'
  };
}

// Internal helpers exported for test access
export const _internals = {
  resolveCurrentPhaseStartedAt,
  killSwitchActive,
  ACCEPT_VERDICTS,
  REJECT_VERDICTS
};
