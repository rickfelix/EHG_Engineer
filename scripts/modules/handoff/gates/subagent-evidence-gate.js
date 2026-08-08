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
 * QF-20260807-283 — PUBLISH THE CONTRACT, don't patch the Nth rediscovery.
 *
 * The old remediation said "invoke the missing sub-agent(s) via Task tool", which points at work
 * THIS GATE CANNOT SEE: a Task-tool sub-agent does NOT write sub_agent_execution_results by
 * itself. A worker who obeys that hint produces nothing the gate can read, re-runs, and is blocked
 * identically — the hint actively costs a round trip. Measured, not theoretical: one seat burned
 * two failed handoffs and a blocked tick rediscovering the real writers while precedent rows
 * written the correct way already sat in the table, and a second seat had independently used the
 * same writer hours earlier. Independent rediscoveries of one contract measure its
 * DISCOVERABILITY, so the fix is to publish it at the moment of need rather than patch site N+1.
 *
 * Both writers are named WITH their applicability, because choosing the wrong one — not ignorance
 * that a writer exists — is the actual failure mode. Single representation: every remediation
 * string below interpolates THIS constant, so the contract cannot drift between sites.
 */
export const EVIDENCE_WRITER_CONTRACT =
  'Evidence must reach sub_agent_execution_results — a Task-tool sub-agent alone does NOT write it. '
  + 'Two canonical writers: (1) REGISTERED codes — `node scripts/execute-subagent.js --code <CODE> --sd-id <SD>`; '
  + '(2) Task-tool runs and read-only built-ins — persist via `storeSubAgentResults` from '
  + "lib/sub-agent-executor/results-storage.js with source='manual' "
  + '(metadata.repo_path canonical + metadata.executed_from_cwd; there are no top-level repo_path/local_path columns).';

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
//   ERROR           — added after checking the CHECK constraint rather than the data. The
//                     valid_verdict domain (database/migrations/20260130_fix_sub_agent_verdict_
//                     constraint.sql:13-22) is PASS/FAIL/BLOCKED/CONDITIONAL_PASS/WARNING/
//                     MANUAL_REQUIRED/PENDING/ERROR. ERROR has zero rows today, so measuring the
//                     TABLE could not surface it — only reading the constraint could. Left
//                     unclassified it fell through to `unknown`, which this gate ACCEPTS: a verdict
//                     whose migration comment reads "When execution errors occur" would have been
//                     accepted with a warning. That is the exact defect this SD exists to fix,
//                     surviving inside its own fix. THE POPULATION IS NOT THE DOMAIN — a value with
//                     no rows yet is still a value the writer is allowed to emit.
const REJECT_VERDICTS = new Set(['FAIL', 'BLOCKED', 'PENDING', 'MANUAL_REQUIRED', 'ERROR']);

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
/**
 * QF-20260804-569 — verdicts that mean THE CHECK NEVER RAN, as distinct from ran-and-rejected.
 *
 * ERROR is written when the executor CRASHES (e.g. `--code EXPLORE` dies with "Failed to load
 * sub-agent EXPLORE from database" and still writes a row). PENDING is written when a run never
 * finished. Neither is a verdict about the SD — they are the absence of one.
 *
 * They used to sit in REJECT_VERDICTS alongside FAIL, which made them subject to
 * SUBAGENT_VERDICT_MODE — advisory by default. So a crashed run bought the same passage as a real
 * one: "a row exists" was being read as "the check ran". Measured on two separate SDs.
 *
 * This is a PREDICATE change, not a policy change. It does not make the gate stricter about real
 * verdicts — FAIL/BLOCKED/MANUAL_REQUIRED keep exactly their current advisory-or-block behaviour.
 * It stops a crash from counting as evidence at all.
 */
const NON_EVIDENCE_VERDICTS = new Set(['ERROR', 'PENDING']);

export function classifyVerdict(verdict) {
  if (verdict === null || verdict === undefined) return 'unknown';
  const v = String(verdict).trim().toUpperCase();
  if (v === '') return 'unknown';
  if (ACCEPT_VERDICTS.has(v)) return 'accept';
  // Checked BEFORE reject: both sets list ERROR/PENDING today, and this ordering is what makes
  // them non-evidence rather than a rejection. Do not reorder.
  if (NON_EVIDENCE_VERDICTS.has(v)) return 'nonevidence';
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
  // QF-20260804-569: agents whose latest row proves the check DID NOT RUN (crash / never
  // finished). Tracked separately from `failing` because a rejection is a verdict and these are
  // the absence of one — and separately from `missing` because these are NOT the FR-2 race window
  // (a row exists; the agent is not mid-write). They block unconditionally, ignoring
  // SUBAGENT_VERDICT_MODE, since there is no verdict for that mode to be lenient about.
  const nonEvidence = [];
  for (const r of required) {
    const row = latestByCode.get(norm(r));
    if (!row) continue;
    const klass = classifyVerdict(row.verdict);
    if (klass === 'nonevidence') nonEvidence.push({ agent: r, verdict: row.verdict, created_at: row.created_at });
    else if (klass === 'reject') failing.push({ agent: r, verdict: row.verdict, created_at: row.created_at });
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

    // QF-20260804-569: a crashed or never-finished run is NOT evidence. Checked before the
    // verdict-mode branch below, and deliberately not routed through it — SUBAGENT_VERDICT_MODE
    // decides how lenient to be about a VERDICT, and there is no verdict here.
    if (nonEvidence.length > 0) {
      const ne = nonEvidence.map(f => `${f.agent}=${f.verdict}`).join(', ');
      const head = `SUBAGENT_EVIDENCE_NOT_RUN: ${ne} — the run crashed or never finished, so no check was performed. A row existing is not the check having run.`;

      // SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001: THE QF-20260804-926 SAFETY VALVE IS RETIRED
      // BECAUSE ITS OWN STATED PRECONDITION IS NOW MET.
      //
      // QF-20260804-569 made non-evidence block unconditionally. QF-20260804-926 softened it back to
      // honour SUBAGENT_VERDICT_MODE, and said exactly why, quoting required-subagents.js:49-56:
      //
      //   "PRECONDITION FOR PROMOTING SUBAGENT_VERDICT_MODE=block: the residual ~10% ... is 100%
      //    attributable to the unregistered-EXPLORE CLI path leaving a tombstone as the last row.
      //    Resolve that first ... Until then the gate's advisory default keeps this cost at zero."
      //
      // That is precisely what this SD resolved, and in the order the precondition implies:
      //   - scripts/record-explore-evidence.js gives Explore a sanctioned producer, so a seat is no
      //     longer restricted to a CLI path that cannot succeed. THAT was the whole reason blocking
      //     here was unfair: no action available to the worker produced a passing row. Now one does.
      //   - execute-subagent --code EXPLORE now REFUSES before the leo_sub_agents lookup and writes
      //     NO row, so this branch can no longer be reached by the crash that used to populate it.
      //
      // AND THE SOFTENING WAS WORSE THAN A LENIENCY, which is what justifies retiring it rather than
      // waiting for the global flag. Measured: with no row at all the gate BLOCKS here in both modes
      // (:556 below, not mode-gated), but with an ERROR tombstone as the newest row it PASSED at
      // score 100. So RUNNING THE BROKEN CLI CONVERTED A BLOCK INTO A PASS — the crash was the key.
      // A worker who never invoked it was stopped; one who invoked it and let it crash was let
      // through. That is not a safety valve, it is a laundering path, and it is closed here.
      //
      // SCOPE, deliberately narrow: this changes ONLY the non-evidence class. The rejecting-verdict
      // branch below still honours SUBAGENT_VERDICT_MODE, resolveSubagentVerdictMode is untouched,
      // and the global advisory->block flip (measured at 32/313 SDs) remains a separate decision.
      // ERROR was always documented as a DISTINCT class from a rejection — "there is no verdict for
      // that mode to be lenient about" (:397-401) — so only that class stops being negotiable.
      //
      // Blast radius, measured rather than inherited: 8 of 314 SDs hold an ERROR-newest Explore row
      // (2.5%, not the ~10% this comment block used to assert), and SEVEN of those eight are already
      // completed. Each is remediable with the new writer.
      console.log(`   ❌ ${head}`);
      return buildFailResult({
        score: 0,
        max_score: 100,
        issues: [head],
        details: { reason: 'SUBAGENT_EVIDENCE_NOT_RUN', non_evidence: nonEvidence, ...verdictDetails },
        // SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001 corrected the second half of this text. It used
        // to say an unexecutable agent code was "a REQUIREMENT defect, not a worker error — the
        // required-agent list is naming something no CLI path can satisfy". That was true when
        // written and is now FALSE for the case it was written about: Explore has a sanctioned
        // producer. Leaving it would send a worker to file a defect instead of running the writer —
        // a remediation that was accurate once and quietly stopped being so.
        remediation: `Re-run ${nonEvidence.map(f => f.agent).join(', ')} for SD ${sdKey} until it writes a real verdict. If the agent is a read-only Claude Code BUILT-IN (Explore), it has no CLI producer BY DESIGN — use the Task tool, or record the run with scripts/record-explore-evidence.js. If some OTHER code cannot be executed at all, that is a REQUIREMENT defect rather than a worker error: the required-agent list is naming something no path can satisfy.`
      });
    }

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
  // SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001: nonEvidence is carried for the SAME reason failing
  // is, and omitting it reproduced the defect one level down. In a MIXED state — one agent absent,
  // another holding a crash row — absence decides the verdict, but details.non_evidence was
  // undefined, so prerequisite-preflight's non-evidence branch had nothing to read and reported
  // only the missing agent. The tombstone stayed invisible behind the absence diagnosis: the same
  // "wrong diagnosis, right block" shape the preflight edit exists to prevent, mirrored.
  const sharedDetails = {
    required,
    present: [...present],
    missing,
    failing,
    non_evidence: nonEvidence,
    phase_started_at: phaseStartedAt.toISOString()
  };

  if (isWithinRaceWindow(phaseStartedAt, RACE_WINDOW_SECONDS)) {
    console.log(`   ⏳ WAIT: evidence row(s) not yet written (within ${RACE_WINDOW_SECONDS}s race window): ${missing.join(', ')}`);
    return buildWaitResult({
      score: 0,
      max_score: 100,
      wait_reason: `Sub-agent evidence not yet written for ${missing.join(', ')} (phase started <${RACE_WINDOW_SECONDS}s ago; agent may be mid-write)`,
      details: { reason: 'SUBAGENT_EVIDENCE_WRITE_LAG', race_window_seconds: RACE_WINDOW_SECONDS, ...sharedDetails },
      remediation: `Re-check shortly; the required sub-agent(s) (${missing.join(', ')}) may still be writing to sub_agent_execution_results. If still missing after the race window: ${EVIDENCE_WRITER_CONTRACT}`
    });
  }

  console.log(`   ❌ SUBAGENT_EVIDENCE_MISSING: ${missing.join(', ')}`);
  return buildFailResult({
    score: 0,
    max_score: 100,
    issues: [`SUBAGENT_EVIDENCE_MISSING: ${missing.join(', ')}`],
    details: { reason: 'SUBAGENT_EVIDENCE_MISSING', ...sharedDetails },
    remediation: `Produce evidence for ${missing.join(', ')} on SD ${sdKey}, then re-run the ${handoffType} handoff. ${EVIDENCE_WRITER_CONTRACT} Emergency bypass: LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 (audit-logged).`
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
      'Produce evidence for the missing sub-agent(s) on this SD, then re-run the handoff. ' +
      EVIDENCE_WRITER_CONTRACT +
      ' Emergency bypass: LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 (logs audit_log warning).'
  };
}

// Internal helpers exported for test access
export const _internals = {
  resolveCurrentPhaseStartedAt,
  killSwitchActive,
  ACCEPT_VERDICTS,
  REJECT_VERDICTS
};
