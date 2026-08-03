/**
 * Results Storage
 * Database storage for sub-agent execution and validation results
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 *
 * SD-LEO-FIX-COLUMN-NAMES-001: Added normalizeConfidence() to handle
 * schema/code mismatch where sub-agents emit `confidence_score` but
 * DB uses `confidence`. The normalization layer accepts both field names.
 */

import { getSupabaseClient } from './supabase-client.js';
// SD-LEO-INFRA-CLAIM-TTL-LONG-SUBAGENT-TICK-001 (FR-1): keep a worker's claim alive across a long
// tick that spawns parallel sub-agent reviews. After each sub-agent's evidence row lands we
// explicitly refresh claude_sessions.heartbeat_at for the owning session (CLAUDE_SESSION_ID), so the
// claim is touched at WORK frequency and never crosses the 900s reap boundary mid-tick. We call the
// same updateHeartbeat the heartbeat manager uses, NOT the withHeartbeat client proxy — that proxy's
// thenable spread drops a supabase-js builder's prototype methods and breaks chained
// .insert().select().single() writes (latent; its tests use own-method fake builders that mask it).
import { updateHeartbeat } from '../session-manager.mjs';
import { USE_TASK_CONTRACTS, RESULT_COMPRESSION_THRESHOLD, PRD_LINKABLE_SUBAGENTS } from './constants.js';
import { createArtifact } from '../artifact-tools.js';
// SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Import normalizeSDId to fix FK constraint violation (PAT-FK-SDKEY-001)
import { normalizeSDId } from '../../scripts/modules/sd-id-normalizer.js';
// SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 (FR-3): shared format-only phase normalizer
import { normalizePhaseToken } from './phase-token.js';

/**
 * SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001 — sentinel recorded in
 * metadata.original_verdict when a sub-agent returns no verdict at all.
 *
 * Exported so tests and audit queries share ONE literal: a query hunting for absent
 * verdicts by hard-coding the string would drift the moment this changed, and the whole
 * point of the sentinel is that absence stays queryable.
 *
 * SD-LEO-INFRA-WRITER-SUB-AGENT-001: the literal now LIVES in lib/sub-agents/verdict-chain.js,
 * which needs it to build chain entries and sits upstream of this writer. Re-exported here rather
 * than redeclared so the "ONE literal" guarantee above survives — importing it from either path
 * yields the same value, and existing importers (tests/unit/subagent-verdict-absent-writer.test.js,
 * tests/unit/subagent-verdict-laundering.test.js) are untouched. A second `const` would have been
 * the same duplication-at-a-distance defect this SD is about.
 */
export { ABSENT_VERDICT } from '../sub-agents/verdict-chain.js';
import { ABSENT_VERDICT, originalVerdictFor } from '../sub-agents/verdict-chain.js';

/**
 * SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001.
 *
 * The schema allows EIGHT verdicts, not five:
 * database/migrations/20260130_fix_sub_agent_verdict_constraint.sql widened valid_verdict
 * to add MANUAL_REQUIRED, PENDING and ERROR, for the reason its own RCA header states —
 * "Code emits MANUAL_REQUIRED and PENDING verdicts, but constraint only allows 5 values".
 * Verified against the live table rather than the file: 93 MANUAL_REQUIRED and 2,330
 * PENDING rows exist. The lossy mappings that used to live here existed only to satisfy a
 * constraint that stopped existing in January, so each of those three is now stored AS
 * ITSELF.
 *
 * WHY THE OLD MAPPING MATTERED. WARNING is an ACCEPTING verdict
 * (subagent-evidence-gate.js:44) and the gate ALREADY classifies MANUAL_REQUIRED and
 * PENDING as REJECT (:68). Rewriting them to WARNING upstream meant classifyVerdict was
 * handed 'accept' and emitted NOTHING — not even the advisory warning. The gate is
 * advisory by default (:108), so this never defeated a block that was running; it
 * PRE-EMPTED the block someone is about to turn on. Flipping SUBAGENT_VERDICT_MODE=block
 * today would catch none of the 141 laundered MANUAL_REQUIRED rows, and the operator
 * would read that silence as a clean gate.
 *
 * Extracted as a pure function so tests can feed its OUTPUT into the gate's real
 * classifyVerdict. Testing the mapping alone would pass while the gate stayed blind —
 * which is the shape of the defect itself, and worth not reproducing inside its own fix.
 *
 * @param {string|null|undefined} rawVerdict
 * @returns {'PASS'|'FAIL'|'BLOCKED'|'CONDITIONAL_PASS'|'WARNING'|'MANUAL_REQUIRED'|'PENDING'|'ERROR'}
 */
export function mapVerdict(rawVerdict) {
  // NORMALIZE FIRST. Live data carries lowercase 'pass' and 'approve-with-conditions';
  // an exact-match-only map sends both to the fallback. Case sensitivity is safe against
  // LAUNDERING (the fallback rejects) but not against FALSE REJECTION, and the first cut
  // of this fix reasoned about the former and never measured the latter.
  const raw = String(rawVerdict ?? '').trim().toUpperCase();

  const verdictMap = {
    PASS: 'PASS',
    FAIL: 'FAIL',
    BLOCKED: 'BLOCKED',
    CONDITIONAL_PASS: 'CONDITIONAL_PASS',
    WARNING: 'WARNING',
    ERROR: 'ERROR',                     // was FAIL — both reject; identity is truthful
    PENDING: 'PENDING',                 // was WARNING (accepting) — schema allows it
    MANUAL_REQUIRED: 'MANUAL_REQUIRED', // was WARNING (accepting) — schema allows it
    // UNKNOWN is NOT one of the eight allowed values, so it must still be translated.
    // BLOCKED is the exact semantic match — the gate documents it as "the agent could not
    // reach a verdict. NOT a pass" — and it is rejecting, which UNKNOWN should be.
    UNKNOWN: 'BLOCKED',
  };
  if (verdictMap[raw]) return verdictMap[raw];

  // PREFIX FAMILIES — measured, not guessed. 60 live rows carry a verdict outside the map
  // above, and ALL 60 are stored as ACCEPTING today. They are overwhelmingly SEMANTICALLY
  // PASSING: PASS_WITH_CONCERNS x14, CONCERNS x14, PASS_WITH_CONDITIONS, APPROVE_WITH_
  // HARDENING, PROCEED_WITH_CONCERNS, lowercase 'pass'. Sending that family straight to a
  // rejecting fallback would turn ~30 semantically-passing rows PER MONTH into hard
  // handoff failures the moment SUBAGENT_VERDICT_MODE=block is enabled — i.e. this SD
  // would have broken the very promotion it exists to make possible.
  //
  // AND IT WOULD HAVE CONSUMED ITS OWN TRIPWIRE. The rationale for ERROR (below, and in
  // the gate at subagent-evidence-gate.js:57-66) is that ERROR has ZERO rows, so its
  // appearance unambiguously means "a new verdict value needs classifying". Bulk-filling
  // ERROR with PASS_WITH_CONCERNS destroys exactly that property.
  //
  // A pass-with-caveats IS CONDITIONAL_PASS — the gate documents it as "a pass with
  // caveats" (:39) and accepts it. Prefix, never `includes`: a prose FAIL verdict that
  // merely mentions "pass" must not be read as passing, and two such rows exist (both
  // begin "FAIL —" and are stored as accepting WARNING today, which is itself laundering
  // this change now corrects).
  // Scan the LEADING TOKENS, not the whole string, and take the FIRST token that carries a
  // verdict meaning. Prefix-only matching missed STRATEGY_APPROVED_WITH_REQUIRED_ADDITIONS
  // (a plain approval whose first word is a namespace); whole-string `includes` would read
  // the "pass" buried inside a prose FAIL and accept it. Token order decides, so
  // "FAIL — ... re-verified ... closed" resolves on FAIL, not on a later word.
  // Bounded to the first 3 tokens: a verdict announces itself at the front, and scanning
  // further starts mining prose for keywords, which is how the substring trap gets in.
  const REJECTING = { FAIL: 'FAIL', FAILED: 'FAIL', BLOCK: 'BLOCKED', BLOCKED: 'BLOCKED', REJECT: 'FAIL', REJECTED: 'FAIL' };
  const ACCEPTING_WITH_CAVEATS = ['PASS', 'PASSED', 'APPROVE', 'APPROVED', 'PROCEED', 'CONDITIONAL', 'CONCERN', 'CONCERNS'];
  // NEGATION, found by review after I asked whether the scan could be defeated — it could.
  // 'CANNOT PROCEED', 'NOT APPROVED', 'DID NOT PASS' all resolved to CONDITIONAL_PASS,
  // because the negator is not itself a verdict token so the scan walked straight past it
  // and landed on the accepting word behind it. Not a regression (the old `|| 'WARNING'`
  // accepted them too) and no live row matches today — but an LLM sub-agent emitting
  // "CANNOT PROCEED" is entirely plausible, and the exposure becomes real precisely when
  // SUBAGENT_VERDICT_MODE=block is turned on, which is the promotion this SD exists to enable.
  const NEGATORS = new Set(['NOT', 'NO', 'CANNOT', 'CANT', 'UNABLE', 'NEVER', 'WITHOUT', 'DENY', 'DENIED', 'FAILING']);
  let negated = false;
  // Still THREE tokens: every negated form observed fits ("DID NOT PASS", "SHOULD NOT
  // PROCEED", "UNABLE TO PROCEED"). Widening to 4 to be safe would have quietly broken the
  // bound this file documents and tests, for no case that needs it.
  for (const token of raw.split(/[^A-Z]+/).filter(Boolean).slice(0, 3)) {
    if (NEGATORS.has(token)) { negated = true; continue; }
    if (REJECTING[token]) return REJECTING[token];
    if (ACCEPTING_WITH_CAVEATS.includes(token)) {
      // A negated pass is NOT a pass. BLOCKED rather than FAIL: the gate documents BLOCKED
      // as "the agent could not reach a verdict. NOT a pass", which is what a negated
      // approval actually says, and it avoids asserting an active failure we did not read.
      // Deliberately NOT ERROR — ERROR already carries 59 live rows of real agent crashes,
      // and adding a second meaning would dilute the one tripwire this file depends on.
      return negated ? 'BLOCKED' : 'CONDITIONAL_PASS';
    }
  }

  // TRULY UNRECOGNISED. Of the 60 live outliers only two land here — 'HIGH' (a severity
  // leaked into the verdict column) and a findings string. Those are exactly the rows a
  // human should look at. Rejecting, because a value this writer cannot classify must not
  // mean accepted; the raw input is preserved in metadata.original_verdict.
  //
  // AMENDED AFTER REVIEW — THE TRIPWIRE IS WEAKER THAN THIS FILE FIRST CLAIMED. The
  // original rationale was "ERROR has zero rows today, so its appearance is unambiguous".
  // That is true of the verdict COLUMN (0 rows) but not of the input: 59 live rows carry
  // original_verdict='ERROR' from real agent crashes, and the ERROR->ERROR identity above
  // now routes those into verdict='ERROR' too. So going forward ERROR means EITHER "the
  // agent crashed" (the common case) OR "this writer could not classify the verdict" (rare).
  // Both reject, so correctness is unaffected, and metadata.original_verdict still tells
  // the two apart — but anyone reading verdict='ERROR' as "a new value needs classifying"
  // will be wrong most of the time. Recorded rather than quietly left standing, because
  // this file's own design leans on that signal.
  return 'ERROR';
}

/**
 * SD-LEO-INFRA-CLAIM-TTL-LONG-SUBAGENT-TICK-001 (FR-1): refresh the owning worker's claim heartbeat
 * after a sub-agent evidence write lands. When a fleet worker session id is supplied (CLAUDE_SESSION_
 * ID — the claim owner in the fleet model), ping claude_sessions.heartbeat_at so the claim is touched
 * at WORK frequency and stays alive through a long parallel-sub-agent tick. When no session id is
 * supplied (non-fleet contexts) it is a no-op — fail-soft, zero behavior change.
 *
 * FR-2: a truly-dead session writes no evidence, so this never fires for it and genuine stale-claim
 * reaping is preserved by construction. Fail-soft: a ping failure is logged and swallowed so it can
 * never break the evidence write that preceded it.
 *
 * Pure-ish + exported for unit testing (heartbeatFn lets a test inject a spy without a live DB).
 * @param {string|undefined|null} sessionId - the owning worker session id (CLAUDE_SESSION_ID)
 * @param {(sessionId:string)=>Promise<any>} [heartbeatFn] - the heartbeat updater (default updateHeartbeat)
 * @returns {Promise<boolean>} true if a ping was attempted+succeeded, false if skipped or it failed
 */
export async function touchOwnerHeartbeat(sessionId, heartbeatFn = updateHeartbeat) {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) return false;
  try {
    await heartbeatFn(sessionId);
    return true;
  } catch (e) {
    console.warn(`[evidence-heartbeat] claim heartbeat ping failed for ${sessionId}: ${e?.message ?? e}`);
    return false;
  }
}

/**
 * Normalize confidence value from sub-agent results
 *
 * SD-LEO-FIX-COLUMN-NAMES-001: Handles schema/code mismatch where:
 * - Sub-agents emit `confidence_score` (47+ files)
 * - Database uses `confidence` column
 *
 * Priority: confidence_score > confidence > NULL (unless EHG_CONFIDENCE_DEFAULT_ENABLED)
 *
 * @param {Object} results - Sub-agent result object
 * @param {Object} options - Options including sdId for logging
 * @returns {{ value: number|null, source: string, warning: string|null }}
 */
export function normalizeConfidence(results, options = {}) {
  const hasConfidenceScore = results.confidence_score !== undefined && results.confidence_score !== null;
  const hasConfidence = results.confidence !== undefined && results.confidence !== null;
  const sdId = options.sdId || 'unknown';
  const subAgentCode = options.subAgentCode || 'unknown';

  // Case 1: Both fields present - use confidence_score, log warning
  if (hasConfidenceScore && hasConfidence) {
    const value = results.confidence_score;
    const validation = validateConfidenceValue(value);
    if (!validation.valid) {
      return {
        value: null,
        source: 'invalid',
        warning: `confidence.invalid: ${validation.reason} (SD: ${sdId}, sub-agent: ${subAgentCode})`
      };
    }
    return {
      value,
      source: 'confidence_score',
      warning: `confidence.dual_fields: Both confidence_score (${value}) and confidence (${results.confidence}) provided. Using confidence_score. (SD: ${sdId}, sub-agent: ${subAgentCode})`
    };
  }

  // Case 2: Only confidence_score (canonical)
  if (hasConfidenceScore) {
    const value = results.confidence_score;
    const validation = validateConfidenceValue(value);
    if (!validation.valid) {
      return {
        value: null,
        source: 'invalid',
        warning: `confidence.invalid: ${validation.reason} (SD: ${sdId}, sub-agent: ${subAgentCode})`
      };
    }
    return {
      value,
      source: 'confidence_score',
      warning: null
    };
  }

  // Case 3: Only confidence (legacy)
  if (hasConfidence) {
    const value = results.confidence;
    const validation = validateConfidenceValue(value);
    if (!validation.valid) {
      return {
        value: null,
        source: 'invalid',
        warning: `confidence.invalid: ${validation.reason} (SD: ${sdId}, sub-agent: ${subAgentCode})`
      };
    }
    return {
      value,
      source: 'confidence_legacy',
      warning: `confidence.legacy_mapped: Using legacy 'confidence' field. Sub-agent should emit 'confidence_score'. (SD: ${sdId}, sub-agent: ${subAgentCode})`
    };
  }

  // Case 4: Neither field present
  const useDefault = process.env.EHG_CONFIDENCE_DEFAULT_ENABLED === 'true';
  if (useDefault) {
    return {
      value: 50,
      source: 'default',
      warning: `confidence.missing: No confidence provided, defaulting to 50 (EHG_CONFIDENCE_DEFAULT_ENABLED=true). (SD: ${sdId}, sub-agent: ${subAgentCode})`
    };
  }

  return {
    value: null,
    source: 'missing',
    warning: `confidence.missing: No confidence provided by sub-agent. (SD: ${sdId}, sub-agent: ${subAgentCode})`
  };
}

/**
 * Validate confidence value is a finite number in range [0, 100]
 *
 * @param {*} value - Value to validate
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateConfidenceValue(value) {
  if (typeof value !== 'number') {
    return { valid: false, reason: `Expected number, got ${typeof value}` };
  }
  if (!Number.isFinite(value)) {
    return { valid: false, reason: 'Value is not a finite number (NaN or Infinity)' };
  }
  if (value < 0 || value > 100) {
    return { valid: false, reason: `Value ${value} outside valid range [0, 100]` };
  }
  return { valid: true, reason: null };
}

/**
 * QF-20260603-485: Synthesize the DB-required evidence fields for a
 * CONDITIONAL_PASS verdict. `sub_agent_execution_results` enforces
 * check_conditions_required (non-empty `conditions` array) and
 * check_justification_required (`justification` length >= 50) whenever
 * verdict='CONDITIONAL_PASS'. Several sub-agent downgrade paths set the verdict
 * without those fields (design/index.js applyRepoResolutionVerdict + the
 * medium-risk branch; resolve-repo.js applySubAgentRepoVerdict shared by
 * api/dependency/performance), so the write was rejected and the executor
 * recorded a confidence:0/execution_time:0 false-fail. Derive the fields from
 * evidence the row already carries (warnings, critical_issues, recommendations,
 * summary) so every current and future downgrade stores cleanly.
 *
 * Pure + exported for unit testing. Pass-through when the caller already
 * supplied valid values or the verdict is not CONDITIONAL_PASS.
 *
 * @param {Object} results - sub-agent results object (verdict already mapped)
 * @param {string} subAgentCode - sub-agent code (for the justification preamble)
 * @returns {{conditions: (Array|null), justification: (string|null)}}
 */
export function deriveConditionalPassEvidence(results, subAgentCode = 'SUB_AGENT') {
  let conditions = results?.conditions ?? null;
  let justification = results?.justification ?? null;

  if (results?.verdict !== 'CONDITIONAL_PASS') {
    return { conditions, justification };
  }

  // conditions: non-empty array of { action, priority, blocking }
  if (!Array.isArray(conditions) || conditions.length === 0) {
    const fromIssues = [...(results?.warnings || []), ...(results?.critical_issues || [])]
      .map(w => (typeof w === 'string' ? w : (w?.recommendation || w?.issue)))
      .filter(Boolean);
    const fromRecs = (results?.recommendations || [])
      .map(r => (typeof r === 'string' ? r : (r?.recommendation || r?.action)))
      .filter(Boolean);
    const sourced = (fromIssues.length ? fromIssues : fromRecs).slice(0, 5);
    const actions = sourced.length
      ? sourced
      : ['Resolve the conditions noted by the sub-agent before treating this CONDITIONAL_PASS as fully green'];
    conditions = actions.map(action => ({
      action: String(action).slice(0, 300),
      priority: 'medium',
      blocking: false
    }));
  }

  // justification: >= 50 chars
  if (typeof justification !== 'string' || justification.trim().length < 50) {
    const summary = (typeof results?.summary === 'string' && results.summary.trim())
      || conditions[0]?.action
      || 'a conditional pass pending the listed follow-ups';
    justification = `CONDITIONAL_PASS recorded by ${subAgentCode}: ${summary}. See the attached conditions, warnings, and recommendations for the specific follow-ups required before this verdict is treated as fully green.`.slice(0, 2000);
  }

  return { conditions, justification };
}

/**
 * Store sub-agent execution results in database
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent record (or null if error before load)
 * @param {Object} results - Execution results
 * @param {Object} options - Storage options
 * @returns {Promise<Object>} Stored result record
 */
export async function storeSubAgentResults(code, sdId, subAgent, results, options = {}) {
  console.log(`\nStoring ${code} results to database...`);
  const _sdKey = options.sdKey || sdId; // For display/logging purposes

  const supabase = await getSupabaseClient();

  // SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Normalize sd_id to UUID before insert
  // PAT-FK-SDKEY-001: sub_agent_execution_results.sd_id FK expects UUID, not sd_key
  let normalizedSdId = sdId;
  if (sdId) {
    const resolvedId = await normalizeSDId(supabase, sdId);
    if (resolvedId) {
      if (resolvedId !== sdId) {
        console.log(`   [SD-ID] Normalized: "${sdId}" -> "${resolvedId}"`);
      }
      normalizedSdId = resolvedId;
    } else {
      // If normalization fails, log warning but continue with original
      // This allows storage even if SD doesn't exist (edge case)
      console.warn(`   [SD-ID] Warning: Could not normalize "${sdId}" - using as-is`);
    }
  }

  // Convert milliseconds to seconds for execution_time column
  const executionTimeSec = results.execution_time_ms
    ? Math.round(results.execution_time_ms / 1000)
    : 0;

  // SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001: see mapVerdict() above for the full
  // rationale. Summary: the schema allows eight verdicts (widened 2026-01-30), the lossy
  // MANUAL_REQUIRED/PENDING -> WARNING rewrites made rejecting verdicts ACCEPTING before
  // the gate ever saw them, and the unmodelled fallback now rejects instead of accepting.
  const mappedVerdict = mapVerdict(results.verdict);

  // Agentic Context Engineering v3.0: Compress large results
  let detailedAnalysis = results.detailed_analysis || null;

  // FIX: Filter out nested findings from results.metadata before spreading
  // This prevents recursive snowballing where previous sub-agent results are nested
  const safeMetadata = (() => {
    if (!results.metadata) return {};
    const { findings, sub_agent_results: _sub_agent_results, ...rest } = results.metadata;
    // If findings exists in metadata, only keep a summary
    if (findings) {
      rest._findings_stripped = true;
      rest._findings_had_keys = Object.keys(findings);
    }
    return rest;
  })();

  // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C:
  //   resolve phase from options (canonical), results.phase, or incoming
  //   metadata.phase.  Dual-write to the native `phase` column AND
  //   metadata.phase during the one-release burn-in window.
  let phaseValue = (typeof options.phase === 'string' && options.phase.trim())
    || (typeof results.phase === 'string' && results.phase.trim())
    || (typeof results.metadata?.phase === 'string' && results.metadata.phase.trim())
    || null;

  // SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 (FR-1): never-null fallback.
  // Most real callers (the canonical executor.js path, the execute-subagent.js
  // CLI, one-off scripts) never supply a phase at all, so phaseValue was almost
  // always null -- which made the phase-scoped dedup added by
  // EVIDENCE-DEDUP-PHASE-KEY-001 degenerate back to phase-blind behavior for the
  // majority of writes (two null-phase calls for genuinely different real SD
  // phases still collide via .is('phase', null)). When nothing supplied a
  // phase, derive it from the SD's own raw current_phase instead of leaving it
  // null.
  if (!phaseValue && normalizedSdId) {
    try {
      const { data: sdRow, error: sdLookupError } = await supabase
        .from('strategic_directives_v2')
        .select('current_phase')
        .eq('id', normalizedSdId)
        .maybeSingle();
      if (sdLookupError) {
        console.warn(`   [PHASE-DERIVATION] Warning: SD lookup returned an error, phase stays unresolved: ${sdLookupError.message}`);
      } else if (typeof sdRow?.current_phase === 'string' && sdRow.current_phase.trim()) {
        // FR-3: normalize only the DERIVED value at this new choke point.
        // Explicitly-supplied caller phases (options/results/metadata, resolved
        // above) are left byte-identical -- storeSubAgentResults' documented
        // contract (see tests/unit/sub-agent-execution-results-phase-column.test.js,
        // from SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C) is to
        // dual-write whatever phase string a caller supplies verbatim; rewriting
        // an explicitly-supplied value here would silently break that tested
        // contract for any current or future caller relying on it.
        phaseValue = normalizePhaseToken(sdRow.current_phase.trim());
      }
    } catch (phaseLookupError) {
      console.warn(`   [PHASE-DERIVATION] Warning: could not derive phase from SD current_phase: ${phaseLookupError.message}`);
    }
  }

  let metadata = {
    sub_agent_version: subAgent?.metadata?.version || '1.0.0',
    // Store the original before mapping. SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001:
    // ALWAYS a string, never an omitted key. When results.verdict is undefined the JSON
    // serialiser drops the field entirely, and a MISSING key is indistinguishable from a
    // row written by one of the other paths that never touch this writer
    // (source=manual / validation-agent / vision-fidelity-sub-agent). That ambiguity is
    // not academic: it produced a "45% of the table is unauditable" reading during this
    // SD's own investigation, which was wrong by ~12,400 rows. The sentinel makes
    // "the agent returned nothing" a queryable fact rather than an inference from silence.
    options: results.options || {},
    findings: results.findings || [],
    metrics: results.metrics || {},
    error: results.error || null,
    stack: results.stack || null,
    // Model routing metadata (added 2025-12-03)
    routing: subAgent?.routing || null,
    ...safeMetadata,  // FIX: Use filtered metadata instead of raw spread
    // Dual-write during burn-in (SD-LEO-PROTOCOL-INFRASTRUCTURE-
    // RELATIONSHIPAWARE-ORCH-001-C).  If phaseValue is null we keep any
    // metadata.phase that arrived via safeMetadata spread unchanged.
    ...(phaseValue ? { phase: phaseValue } : {}),

    // ORIGINAL_VERDICT IS SET *AFTER* THE SPREAD, DELIBERATELY —
    // SD-LEO-INFRA-WRITER-SUB-AGENT-001 / FR-3a.
    //
    // It used to be declared above `...safeMetadata`, which made the writer's own audit anchor
    // OVERRIDABLE BY THE PARTY IT AUDITS: any caller supplying `results.metadata.original_verdict`
    // silently clobbered the snapshot. Not theoretical — 8 live rows carry verdict='PASS' with
    // original_verdict='CONDITIONAL_PASS', an UPGRADE direction mapVerdict cannot produce, 5 of
    // them within 30 days. A field that records what the caller claimed, and that the caller can
    // write, records nothing.
    //
    // Preserved from SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001: ALWAYS a string, never an omitted
    // key. When results.verdict is undefined the JSON serialiser drops the field entirely, and a
    // MISSING key is indistinguishable from a row written by one of the paths that never touch this
    // writer (source=manual / validation-agent / vision-fidelity-sub-agent). That ambiguity is not
    // academic: it produced a "45% of the table is unauditable" reading during that SD's own
    // investigation, wrong by ~12,400 rows. The sentinel makes "the agent returned nothing" a
    // queryable fact rather than an inference from silence.
    //
    // PREFER THE CHAIN when one exists: verdict_chain[0].from is the verdict as it entered the
    // evidence path, captured BEFORE any in-place mutator ran. results.verdict at this point is
    // whatever the LAST mutator left behind — see verdict-chain.js for why that distinction is the
    // whole point of this SD.
    original_verdict: originalVerdictFor(results)
  };

  // Compress large detailed_analysis to artifact (>8KB threshold)
  if (detailedAnalysis && USE_TASK_CONTRACTS) {
    const analysisStr = typeof detailedAnalysis === 'string'
      ? detailedAnalysis
      : JSON.stringify(detailedAnalysis);

    if (analysisStr.length > RESULT_COMPRESSION_THRESHOLD) {
      try {
        const artifact = await createArtifact(analysisStr, {
          source_tool: 'sub-agent-executor',
          type: 'analysis',
          sd_id: sdId,
          metadata: { sub_agent_code: code, field: 'detailed_analysis' }
        });

        console.log(`   Compressed detailed_analysis to artifact (${artifact.token_count} tokens)`);

        // Replace with artifact reference
        detailedAnalysis = {
          _compressed: true,
          artifact_id: artifact.artifact_id,
          summary: artifact.summary,
          token_count: artifact.token_count
        };
        metadata.detailed_analysis_artifact_id = artifact.artifact_id;
      } catch (compressError) {
        console.warn(`   Warning: Failed to compress detailed_analysis: ${compressError.message}`);
        // Keep original on failure
      }
    }
  }

  // SD-LEO-FIX-COLUMN-NAMES-001: Normalize confidence from both field names
  const confidenceResult = normalizeConfidence(results, { sdId, subAgentCode: code });

  // Log any confidence-related warnings
  if (confidenceResult.warning) {
    console.warn(`   [CONFIDENCE] ${confidenceResult.warning}`);
  }

  // Log confidence source for debugging
  if (confidenceResult.source !== 'confidence_score') {
    console.log(`   [CONFIDENCE] Source: ${confidenceResult.source}, Value: ${confidenceResult.value}`);
  }

  // QF-20260603-485: a CONDITIONAL_PASS write is rejected unless it carries a
  // non-empty conditions array + a >=50-char justification. Synthesize them from
  // the evidence already on the row when a downgrade path omitted them, so the
  // verdict stores instead of becoming a confidence:0/execution_time:0 false-fail.
  const conditionalPassEvidence = deriveConditionalPassEvidence(
    { ...results, verdict: mappedVerdict },
    subAgent?.name || code
  );

  const record = {
    sd_id: normalizedSdId,  // SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Use normalized UUID
    sub_agent_code: code,
    sub_agent_name: subAgent?.name || code,
    verdict: mappedVerdict,
    confidence: confidenceResult.value,
    critical_issues: results.critical_issues || [],
    warnings: results.warnings || [],
    recommendations: results.recommendations || [],
    detailed_analysis: detailedAnalysis,
    execution_time: executionTimeSec,
    // SD-LEO-PROTOCOL-V4-4-0: Add adaptive validation mode fields
    validation_mode: results.validation_mode || 'prospective',  // Default to prospective for backward compatibility
    justification: conditionalPassEvidence.justification,  // QF-20260603-485: synthesized for CONDITIONAL_PASS if a downgrade path omitted it
    conditions: conditionalPassEvidence.conditions,  // QF-20260603-485: synthesized for CONDITIONAL_PASS if a downgrade path omitted it
    // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-C (FR-3):
    //   Native phase column. Paired with metadata.phase via `phaseValue`
    //   above; either or both may be null. Nullable in schema.
    phase: phaseValue,
    metadata,
    created_at: new Date().toISOString()
  };

  // SD-LEO-INFRA-SUB-AGENT-EXECUTION-001-B (TR-003): Dedup check
  // Prevent duplicate records for same sd_id + sub_agent_code + phase within 5 minutes
  // SD-LEO-INFRA-EVIDENCE-DEDUP-PHASE-KEY-001: the dedup key was phase-blind, so a
  // multi-phase SD's second-phase call (e.g. EXEC after PLAN) matched the first phase's
  // row and overwrote it in place -- corrupting created_at (frozen at the earlier phase's
  // time, since the update path preserves it) and making the row invisible to
  // GATE_SUBAGENT_EVIDENCE's created_at >= phaseStartedAt freshness check for the later
  // phase. Scoping the dedup match to the SAME phase (or both null, for legacy callers
  // that never pass options.phase) ensures each phase always gets its own fresh row.
  const DEDUP_WINDOW_MS = 5 * 60 * 1000;
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  let dedupQuery = supabase
    .from('sub_agent_execution_results')
    .select('id')
    .eq('sd_id', normalizedSdId)
    .eq('sub_agent_code', code)
    .gte('created_at', dedupCutoff);
  dedupQuery = phaseValue ? dedupQuery.eq('phase', phaseValue) : dedupQuery.is('phase', null);

  const { data: existing } = await dedupQuery
    .order('created_at', { ascending: false })
    .limit(1);

  let data, error;

  if (existing?.length > 0) {
    // Update existing record instead of creating duplicate
    console.log(`   Dedup: updating existing record ${existing[0].id} (within ${DEDUP_WINDOW_MS / 60000}min window)`);
    const { created_at: _keep, ...updateFields } = record;
    const updateResult = await supabase
      .from('sub_agent_execution_results')
      .update({ ...updateFields, updated_at: new Date().toISOString() })
      .eq('id', existing[0].id)
      .select()
      .single();
    data = updateResult.data;
    error = updateResult.error;
  } else {
    // Normal insert — no recent duplicate
    const insertResult = await supabase
      .from('sub_agent_execution_results')
      .insert(record)
      .select()
      .single();
    data = insertResult.data;
    error = insertResult.error;
  }

  if (error) {
    // SD-VENTURE-STAGE0-UI-001: Treat timeout errors as warnings, not fatal
    // The sub-agent work completed successfully, only the recording failed
    if (error.message.includes('statement timeout') || error.message.includes('timeout')) {
      console.warn(`   Warning: Timeout storing results (non-fatal): ${error.message}`);
      // Return a mock result so the orchestration can continue
      return {
        id: `timeout-${Date.now()}`,
        sd_id: record.sd_id,
        sub_agent_code: record.sub_agent_code,
        verdict: record.verdict,
        confidence: record.confidence,  // SD-LEO-FIX-COLUMN-NAMES-001: Use correct field name
        storage_timeout: true
      };
    }
    throw new Error(`Failed to store sub-agent results: ${error.message}`);
  }

  console.log(`   Stored with ID: ${data.id}`);

  // SD-LEO-INFRA-CLAIM-TTL-LONG-SUBAGENT-TICK-001 (FR-1): the evidence row landed — refresh the
  // owning worker's claim heartbeat so a long parallel-sub-agent tick keeps the claim alive
  // (touches at WORK frequency, never crossing the 900s reap boundary). Fail-soft, no-op off-fleet.
  await touchOwnerHeartbeat(process.env.CLAUDE_SESSION_ID);

  // ============================================================================
  // PAT-SUBAGENT-PRD-LINK-001: Auto-link sub-agent results to PRD metadata
  // Ensures PLAN-TO-EXEC handoff can verify sub-agent execution via PRD
  // ============================================================================

  if (PRD_LINKABLE_SUBAGENTS.includes(code)) {
    try {
      // Query PRD by sd_id (FK to SD) instead of constructing PRD ID
      // PRD IDs may use either sd_key or UUID format depending on creation context
      const metadataField = `${code.toLowerCase()}_analysis`;

      // Fetch current PRD metadata by SD relationship
      const { data: prd, error: prdErr } = await supabase
        .from('product_requirements_v2')
        .select('id, metadata')
        .eq('sd_id', normalizedSdId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!prdErr && prd) {
        const existingMetadata = prd.metadata || {};

        // FIX 3 (2026-01-01): Include full analysis content for GATE1 validation
        // GATE1 expects: raw_analysis, generated_at, sd_context, recommendations
        const analysisContent = {
          // Core execution metadata
          verdict: record.verdict,
          confidence: record.confidence,
          execution_id: data.id,
          executed_at: record.created_at,
          sub_agent_version: metadata.version || '1.0.0',

          // FIX 3: Include full analysis content (GATE1 requirement)
          raw_analysis: record.detailed_analysis,
          generated_at: record.created_at,
          sd_context: record.sd_id,

          // Include actionable outputs
          critical_issues: record.critical_issues || [],
          warnings: record.warnings || [],
          recommendations: record.recommendations || [],

          // Validation context
          validation_mode: record.validation_mode || 'prospective',
          justification: record.justification,
          conditions: record.conditions,

          // Design-informed flag (for DESIGN sub-agent)
          design_informed: code === 'DESIGN' ? true : undefined
        };

        const updatedMetadata = {
          ...existingMetadata,
          [metadataField]: analysisContent
        };

        const { error: updateErr } = await supabase
          .from('product_requirements_v2')
          .update({
            metadata: updatedMetadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', prd.id);

        if (!updateErr) {
          console.log(`   Linked ${code} results to PRD metadata.${metadataField} (with full analysis)`);
        } else {
          console.warn(`   Warning: Failed to link to PRD: ${updateErr.message}`);
        }
      } else if (prdErr?.code !== 'PGRST116') {
        // PGRST116 = not found, which is expected if PRD doesn't exist yet
        console.log(`   Info: No PRD found for ${sdId} - skipping metadata link`);
      }
    } catch (linkError) {
      // Non-fatal - sub-agent results are stored, linking is enhancement
      console.warn(`   Warning: PRD metadata link failed: ${linkError.message}`);
    }
  }

  return data;
}

/**
 * Store validation results in database (LEO v4.4 PATCH-005)
 *
 * @param {Object} validationData - Validation result data
 * @returns {Promise<Object|null>} Stored record or null if storage fails
 */
export async function storeValidationResults(validationData) {
  try {
    const supabase = await getSupabaseClient();

    const record = {
      sd_id: validationData.sd_id,
      sub_agent_code: validationData.sub_agent_code,
      validation_passed: validationData.validation_passed,
      validation_score: validationData.validation_score,
      levels_checked: validationData.levels_checked,
      file_references: validationData.file_references || {},
      symbol_references: validationData.symbol_references || {},
      table_references: validationData.table_references || {},
      code_snippets: validationData.code_snippets || {},
      issues: validationData.issues || [],
      warnings: validationData.warnings || [],
      retry_count: validationData.retry_count || 0,
      retry_reason: validationData.retry_reason || null,
      previous_validation_id: validationData.previous_validation_id || null,
      validation_duration_ms: validationData.validation_duration_ms || null,
      tables_loaded_count: validationData.tables_loaded_count || null,
      execution_id: validationData.execution_id || null
    };

    const { data, error } = await supabase
      .from('subagent_validation_results')
      .insert(record)
      .select()
      .single();

    if (error) {
      // Non-fatal: Log but don't throw - validation storage is enhancement
      console.warn(`   Warning: Failed to store validation results: ${error.message}`);
      return null;
    }

    console.log(`   Validation stored (ID: ${data.id.slice(0, 8)}...)`);
    return data;
  } catch (err) {
    // Non-fatal: Log but don't throw
    console.warn(`   Warning: Validation storage error: ${err.message}`);
    return null;
  }
}
