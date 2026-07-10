/**
 * APA Stage-Ladder Orchestrator (SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-D).
 *
 * Design doc §8.5: APA executes as a staged, iterative pipeline — cheap
 * deterministic stages (S0-S2) gate expensive judgment stages (S4), each
 * stage is a fix-loop, and the chairman stamp requires ONE full clean
 * S0-S4 re-run (S5) — never a stitched-together set of partial greens.
 *
 * This module is the scheduling/gating layer only. Stage runners,
 * fix-functions, and dimension-checkers are all injected — it never
 * directly calls Child A (sandbox), Child B (assertions), or Child C
 * (browser executor); a future orchestration entrypoint wires those in.
 *
 * Persona provenance (design doc §10, line 258): personas MUST come from
 * the venture's real artifact corpus, never be invented at assessment
 * time. resolvePersonas is the only I/O in this module for exactly that
 * reason — everything else stays pure and injectable.
 *
 * @module lib/apa/stage-ladder-orchestrator
 */

const DEFAULT_PERSONA_ARTIFACT_TYPES = Object.freeze(['identity_persona_brand']);
const DEFAULT_MAX_RETRIES = 3;

/**
 * FR-1: run an ordered stage list, halting the moment a stage fails.
 * @param {Array<{id: string, run: (ctx: object) => Promise<{pass: boolean, findings?: Array}>}>} stages
 * @param {object} [ctx]
 * @returns {Promise<{completedStages: string[], haltedAt: string|null, results: object}>}
 */
export async function runStageLadder(stages, ctx = {}) {
  const completedStages = [];
  const results = {};
  for (const stage of stages || []) {
    const result = await stage.run(ctx);
    results[stage.id] = result;
    if (!result.pass) {
      return { completedStages, haltedAt: stage.id, results };
    }
    completedStages.push(stage.id);
  }
  return { completedStages, haltedAt: null, results };
}

/**
 * Order-independent fingerprint of a findings array, so re-ordered-but-
 * identical findings are correctly recognized as a plateau (TR-3).
 */
function fingerprintFindings(findings) {
  const normalized = (findings || []).map((f) => JSON.stringify(f, Object.keys(f || {}).sort()));
  normalized.sort();
  return normalized.join('|');
}

/**
 * FR-2: run a single stage's inner fix-loop (run -> findings -> fix ->
 * re-run), bounded by a retry cap, with plateau detection that escalates
 * when the same findings recur with zero improvement.
 * @param {{id: string, run: (ctx: object) => Promise<{pass: boolean, findings?: Array}>}} stage
 * @param {object} ctx
 * @param {{maxRetries?: number, fixFn?: (findings: Array, ctx: object) => Promise<void>}} [opts]
 * @returns {Promise<{clean: boolean, plateaued: boolean, capped: boolean, attempts: number, lastResult: object}>}
 */
export async function runStageWithFixLoop(stage, ctx, opts = {}) {
  const { maxRetries = DEFAULT_MAX_RETRIES, fixFn = async () => {} } = opts;
  let lastResult = await stage.run(ctx);
  let lastFingerprint = fingerprintFindings(lastResult.findings);
  let attempts = 1;

  if (lastResult.pass) {
    return { clean: true, plateaued: false, capped: false, attempts, lastResult };
  }

  while (attempts <= maxRetries) {
    await fixFn(lastResult.findings || [], ctx);
    const nextResult = await stage.run(ctx);
    attempts += 1;
    if (nextResult.pass) {
      return { clean: true, plateaued: false, capped: false, attempts, lastResult: nextResult };
    }
    const nextFingerprint = fingerprintFindings(nextResult.findings);
    if (nextFingerprint === lastFingerprint) {
      return { clean: false, plateaued: true, capped: false, attempts, lastResult: nextResult };
    }
    lastResult = nextResult;
    lastFingerprint = nextFingerprint;
  }

  return { clean: false, plateaued: false, capped: true, attempts, lastResult };
}

/**
 * FR-3: resolve REAL personas from a venture's artifact corpus. Never
 * fabricates a default — absence is itself the finding.
 * @param {string} ventureId
 * @param {object} supabase injected Supabase client
 * @param {{artifactTypes?: string[]}} [opts]
 * @returns {Promise<{personas: Array<object>, findings: Array<object>}>}
 */
export async function resolvePersonas(ventureId, supabase, opts = {}) {
  const artifactTypes = opts.artifactTypes || DEFAULT_PERSONA_ARTIFACT_TYPES;
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('content, created_at')
    .eq('venture_id', ventureId)
    .in('artifact_type', artifactTypes)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) {
    return {
      personas: [],
      findings: [{
        type: 'PERSONA_PROVENANCE_MISSING',
        ventureId,
        artifactTypes,
        reason: error ? `query error: ${error.message}` : 'no matching persona artifact found',
      }],
    };
  }

  let parsed;
  try {
    const row = data[0];
    parsed = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
  } catch (e) {
    return {
      personas: [],
      findings: [{ type: 'PERSONA_PROVENANCE_MISSING', ventureId, artifactTypes, reason: `unparseable artifact content: ${e.message}` }],
    };
  }

  const personas = Array.isArray(parsed && parsed.personas) ? parsed.personas : [];
  if (personas.length === 0) {
    return {
      personas: [],
      findings: [{ type: 'PERSONA_PROVENANCE_MISSING', ventureId, artifactTypes, reason: 'artifact found but personas array is empty' }],
    };
  }

  return { personas, findings: [] };
}

/**
 * FR-4: S3 persona matrix — a true cross-product of dimension-checkers x
 * personas, tagged per (checkerId, personaName) pair.
 * @param {Array<{id: string, check: (persona: object, evidence: object) => {pass: boolean, findings?: Array}}>} dimensionCheckers
 * @param {Array<object>} personas
 * @param {object} evidence
 * @returns {Array<{checkerId: string, personaName: string, pass: boolean, findings: Array}>}
 */
export function runPersonaMatrix(dimensionCheckers, personas, evidence) {
  const results = [];
  for (const checker of dimensionCheckers || []) {
    for (const persona of personas || []) {
      const verdict = checker.check(persona, evidence);
      results.push({
        checkerId: checker.id,
        personaName: persona.name,
        pass: verdict.pass,
        findings: verdict.findings || [],
      });
    }
  }
  return results;
}

/**
 * FR-5: S5 regression guard. The chairman stamp requires exactly one full,
 * uninterrupted, zero-finding S0-S4 re-run — never a stitched-together set
 * of partial greens (design doc §8.5).
 * @param {{completedStages: string[], results: object}} s5Result
 * @param {string[]} [requiredStages] defaults to the canonical S0-S4 ladder
 * @returns {{eligible: boolean, reason: string}}
 */
export function assertChairmanStampEligible(s5Result, requiredStages = ['S0', 'S1', 'S2', 'S3', 'S4']) {
  const completed = new Set(s5Result.completedStages || []);
  for (const stageId of requiredStages) {
    if (!completed.has(stageId)) {
      return { eligible: false, reason: `stage ${stageId} did not complete — chairman stamp requires the full S0-S4 ladder in one pass` };
    }
  }
  for (const stageId of requiredStages) {
    const findings = (s5Result.results && s5Result.results[stageId] && s5Result.results[stageId].findings) || [];
    if (findings.length > 0) {
      return { eligible: false, reason: `stage ${stageId} carries ${findings.length} finding(s) — chairman stamp requires zero findings across the full pass` };
    }
  }
  return { eligible: true, reason: 'full S0-S4 pass, zero findings on every stage' };
}
