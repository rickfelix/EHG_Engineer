// Diverse-lens domain-expert panel assembly + bounded iterative review
// (SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002, SSOT L3 §1).
//
// Three mechanisms, all REUSE: (1) provider-adapters.js's multi-family
// adapters realized as a diverse-lens panel (never a lone expert); (2) the
// existing research-engine.js wired in as-is; (3) iterative review bounded
// at maxRounds -> chairman, never looping forever.
//
// SCOPING NOTE (discovered during EXEC, not assumed at PLAN): research-engine.js
// runResearch() is a multi-model OPINION-SYNTHESIS tool (confidence_score,
// consensus strength) -- it does NOT return cited external URLs or freshness
// timestamps. It is still the correct reuse target for the 'factual' gap-fill
// route (SSOT explicitly says wire it in, don't rebuild), but it cannot by
// itself satisfy the "cited-primary-source, freshness-checked" termination
// base case -- that would be decorative grounding (claiming verification this
// codebase cannot yet perform). isTerminated() below requires an EXPLICIT,
// structurally-verified primarySource citation instead of inferring one from
// runResearch()'s synthesis; see the SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002
// retro for the tracked follow-up (a real citation-yielding research upgrade
// is out of scope here).

import { getAllAdapters } from '../sub-agents/vetting/provider-adapters.js';
import { runResearch } from '../research/research-engine.js';
import { recordDisposition } from '../decision-binding/disposition.js';
import { classifyTriggerPredicate } from '../../scripts/modules/handoff/validation/validator-registry/gates/value-authenticity-spec-gate.js';
import {
  classifyDivergence,
  routeDivergence,
  evaluateConvergence,
  requiresExternalConfirmation,
} from './divergence-router.js';
import { computeEffectiveGrade } from './weakest-link.js';

export class PanelTooSmallError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PanelTooSmallError';
  }
}

const VALID_GRADES = ['E0', 'E1', 'E2', 'E3'];
const VALID_STANCES = ['factual', 'judgment'];
const FRESHNESS_WINDOW_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function validateClaimShape(claim) {
  return !!claim
    && typeof claim === 'object'
    && typeof claim.claim === 'string' && claim.claim.trim().length > 0
    && typeof claim.subject === 'string' && claim.subject.trim().length > 0
    && (claim.value !== undefined && claim.value !== null)
    && VALID_STANCES.includes(claim.stance)
    && Array.isArray(claim.sources)
    && VALID_GRADES.includes(claim.evidence_grade);
}

/**
 * Detect which model families are actually available (API key configured) --
 * getAllAdapters() constructs all adapter objects unconditionally regardless
 * of key presence, so availability is a separate, cheap check.
 *
 * @returns {string[]}
 */
export function detectAvailableFamilies() {
  const families = [];
  if (process.env.ANTHROPIC_API_KEY) families.push('anthropic');
  if (process.env.OPENAI_API_KEY) families.push('openai');
  if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) families.push('google');
  return families;
}

function buildLensSystemPrompt(lens) {
  return `You are a domain-expert panelist with a "${lens}" lens for a value-authenticity spec-production pipeline. Respond with ONLY a JSON array of claims, each shaped exactly: { "claim": string, "subject": string, "value": string|number, "stance": "factual"|"judgment", "sources": string[], "evidence_grade": "E0"|"E1"|"E2"|"E3" }. Cite REAL sources only; if you cannot cite a real source, use evidence_grade "E0" and an empty sources array rather than inventing one.`;
}

async function defaultCompleteFn({ family, lens, question, context }) {
  const adapters = getAllAdapters();
  const adapter = adapters[family];
  if (!adapter) throw new Error(`defaultCompleteFn: no adapter available for family "${family}"`);
  const response = await adapter.complete(
    buildLensSystemPrompt(lens),
    `Question: ${question}\nContext: ${JSON.stringify(context)}`,
    {},
  );
  const jsonMatch = (response.content || '').match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`defaultCompleteFn: panel response from ${family}/${lens} contained no parseable JSON array`);
  }
  return JSON.parse(jsonMatch[0]);
}

/**
 * Assemble a diverse-lens domain-expert panel: fan the SAME question out
 * across the available independent model families, each prompted with a
 * distinct domain-expert lens. NEVER a lone expert -- throws
 * PanelTooSmallError when fewer than 2 families are available and the
 * caller has not explicitly opted into degraded mode via stakesLevel:
 * 'degraded_ok'.
 *
 * @param {object} params
 * @param {string} params.question
 * @param {object} [params.context]
 * @param {'low'|'medium'|'high'|'degraded_ok'} params.stakesLevel
 * @param {string[]} [params.lenses] - distinct domain-expert lens labels, one per family (cycles if shorter)
 * @param {string} [params.adjudicatorSessionId] - must never equal any panel author_session_id
 * @param {Function} [params.completeFn] - injectable per-family completion fn (tests); defaults to real adapter calls
 * @param {Function} [params.detectFamiliesFn]
 * @returns {Promise<Array<{ family: string, lens: string, authorSessionId: string, claims: object[] }>>}
 */
export async function assemblePanel({
  question,
  context = {},
  stakesLevel,
  lenses = ['general'],
  adjudicatorSessionId = null,
  completeFn = defaultCompleteFn,
  detectFamiliesFn = detectAvailableFamilies,
} = {}) {
  if (!question) throw new Error('assemblePanel: question is required');
  const availableFamilies = detectFamiliesFn();

  if (availableFamilies.length === 0) {
    throw new PanelTooSmallError('assemblePanel: no model families available -- cannot assemble any panel, even degraded');
  }
  if (availableFamilies.length < 2 && stakesLevel !== 'degraded_ok') {
    throw new PanelTooSmallError(
      `assemblePanel: only ${availableFamilies.length} model family available -- a panel is never a lone expert. Pass stakesLevel: 'degraded_ok' to explicitly opt into degraded mode.`,
    );
  }

  const responses = [];
  for (let i = 0; i < availableFamilies.length; i += 1) {
    const family = availableFamilies[i];
    const lens = lenses[i % lenses.length];
    const authorSessionId = `panel:${family}:${lens}`;
    if (adjudicatorSessionId && adjudicatorSessionId === authorSessionId) {
      throw new Error('assemblePanel: adjudicatorSessionId must never equal a panel author_session_id (author != adjudicator)');
    }
     
    const claims = await completeFn({ family, lens, question, context });
    if (!Array.isArray(claims) || claims.length === 0) {
      throw new Error(`assemblePanel: panel response from ${family}/${lens} produced no claims`);
    }
    for (const claim of claims) {
      if (!validateClaimShape(claim)) {
        throw new Error(`assemblePanel: panel response from ${family}/${lens} violates the provenance shape (claim/subject/value/stance/sources/evidence_grade required)`);
      }
    }
    responses.push({ family, lens, authorSessionId, claims });
  }

  return responses;
}

/**
 * Cost-tiering: reuse SPEC-001's L2 trigger predicate (same classifier, no
 * second mechanism) to decide whether a leaf warrants the full panel +
 * triangulation pipeline or a cheap single grounded pass.
 *
 * @param {string} leafText
 * @returns {boolean}
 */
export function shouldRunFullPanel(leafText) {
  return classifyTriggerPredicate(leafText);
}

/**
 * Termination base cases: cited-primary-source (freshness-checked) OR
 * chairman escalation (dispositioned). See the module-level SCOPING NOTE --
 * primarySource must be an EXPLICIT, structurally-verified citation; it is
 * never inferred from runResearch()'s opinion-synthesis output.
 *
 * @param {object} reviewState
 * @param {{ url: string, checkedAt: string }} [reviewState.primarySource]
 * @param {{ payload: { status: string } }} [reviewState.disposition]
 * @returns {boolean}
 */
export function isTerminated(reviewState) {
  const primarySource = reviewState?.primarySource;
  if (primarySource && typeof primarySource.url === 'string' && primarySource.url.trim() && primarySource.checkedAt) {
    const ageMs = Date.now() - Date.parse(primarySource.checkedAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= FRESHNESS_WINDOW_MS) {
      return true;
    }
  }
  if (reviewState?.disposition?.payload?.status === 'dispositioned') return true;
  return false;
}

/**
 * Bounded iterative review: draft (assemble panel) -> critique (evaluate
 * convergence) -> gap-fill (route divergence) -> re-review, capped at
 * maxRounds. At the round cap, ANY unresolved divergence force-escalates to
 * the chairman regardless of its classified type -- round N+1 never occurs.
 *
 * Cost-tiered: leaves that fail the L2 trigger predicate (shouldRunFullPanel)
 * skip the panel entirely and take a single grounded research pass.
 * Degraded mode (single-family availability) is auto-detected and floors
 * stakesLevel to 'degraded_ok' regardless of the caller's requested level.
 *
 * @param {object} params
 * @param {string} params.question
 * @param {object} [params.context]
 * @param {'low'|'medium'|'high'} params.stakesLevel
 * @param {string[]} [params.lenses]
 * @param {number} [params.maxRounds]
 * @param {object} params.supabase - required (chairman escalation may fire)
 * @returns {Promise<object>} terminal review result
 */
export async function runIterativeReview({
  question,
  context = {},
  stakesLevel,
  lenses = ['general'],
  maxRounds = 3,
  supabase,
  assemblePanelFn = assemblePanel,
  routeDivergenceFn = routeDivergence,
  runResearchFn = runResearch,
  detectFamiliesFn = detectAvailableFamilies,
} = {}) {
  if (!shouldRunFullPanel(question)) {
    const research = await runResearchFn({ question, context });
    return { terminated: true, rounds: 0, mode: 'single_grounded_pass', research, roundHistory: [] };
  }

  const availableFamilies = detectFamiliesFn();
  const effectiveStakesLevel = availableFamilies.length < 2 ? 'degraded_ok' : stakesLevel;

  const roundHistory = [];
  let workingContext = context;

  for (let round = 1; round <= maxRounds; round += 1) {
     
    const responses = await assemblePanelFn({
      question, context: workingContext, stakesLevel: effectiveStakesLevel, lenses, detectFamiliesFn,
    });
    const primaryAnswers = responses.map((r) => ({
      family: r.family,
      subject: r.claims[0].subject,
      value: r.claims[0].value,
      stance: r.claims[0].stance,
    }));

    const convergence = evaluateConvergence({ responses: primaryAnswers, stakesLevel: effectiveStakesLevel });
    const needsConfirmation = requiresExternalConfirmation(convergence, effectiveStakesLevel);
    const roundRecord = { round, responses, convergence, needsConfirmation };

    if (convergence.convergent && !needsConfirmation) {
      roundHistory.push(roundRecord);
      return {
        terminated: true, rounds: round, mode: 'converged', responses, convergence, roundHistory,
      };
    }

    if (round === maxRounds) {
      // Bounded iteration: the round cap forces chairman escalation for ANY
      // still-unresolved divergence, regardless of type -- round N+1 never runs.
      // subject stays { question } only (idempotent dedup key, see
      // divergence-router.js); the full round history goes in answerPayload
      // (a context digest for the chairman, not yet an answer -- status is
      // explicitly kept 'awaiting_disposition' so recordDisposition's
      // answerPayload-implies-dispositioned default does not misfire).
      const finalRoundHistory = [...roundHistory, roundRecord];
      const roundHistoryDigest = finalRoundHistory.map((r) => ({
        round: r.round,
        convergent: r.convergence.convergent,
        suspiciousUnanimity: r.convergence.suspiciousUnanimity,
        classificationType: r.classification?.type ?? null,
        routingAction: r.routing?.action ?? null,
      }));
      const { row } = await recordDisposition(supabase, {
        decisionType: 'ratification',
        subject: { question },
        decisionKey: `value-authenticity-round-cap:${question}`,
        answerPayload: { context: { roundHistoryDigest } },
        status: 'awaiting_disposition',
      });
      roundHistory.push(roundRecord);
      return {
        terminated: true, rounds: round, mode: 'round_cap_escalation', disposition: row, roundHistory,
      };
    }

    // classifyDivergence needs 2+ voices to type a DISPUTE. Two cases still need
    // a gap-fill pass despite that: (a) degraded/single-family (only 1 response,
    // nothing to compare), and (b) suspicious perfect unanimity among 2+
    // responses with nothing to classify (classifyDivergence returns type=null
    // when all agree) -- FR-4's guard means agreement alone never resolves a
    // high-stakes/degraded review, so both cases route through the 'factual'
    // (deep-research) gap-fill path as external confirmation, not a typed dispute.
    const classification = responses.length >= 2
      ? classifyDivergence({ responses: primaryAnswers, question })
      : { type: 'factual', confidence: 0 };
    const routeType = classification.type || 'factual';

    let routing = null;
     
    routing = await routeDivergenceFn({ type: routeType }, { question, panelContext: workingContext, supabase });
    if (routing.action === 'chairman_escalation') {
      roundHistory.push({ ...roundRecord, classification, routing });
      return {
        terminated: true, rounds: round, mode: 'chairman_escalation', disposition: routing.disposition, roundHistory,
      };
    }
    if (routing.action === 'deep_research') {
      workingContext = { ...workingContext, researchGapFill: routing.result };
    } else if (routing.action === 're_spec') {
      workingContext = { ...workingContext, reSpecInstruction: routing.instruction };
    }

    roundRecord.classification = classification;
    roundRecord.routing = routing;
    roundHistory.push(roundRecord);
  }

  // Unreachable: the round === maxRounds branch above always returns.
  throw new Error('runIterativeReview: exited the round loop without terminating -- this is a bug');
}

/**
 * Persist a spec-authored criterion selection with its weakest-link-propagated
 * effective grade (FR-5). This is the artifact that makes propagation
 * VISIBLE and queryable without building the runtime consumer (pair-half B,
 * out of scope for this SD).
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.sdKey
 * @param {string} params.frId
 * @param {string} params.criterionId
 * @param {object} [params.parameters]
 * @param {Array<{evidence_grade: string}>} params.domainClaims
 * @param {string} params.canonicalGrade
 * @returns {Promise<object>} the persisted row
 */
export async function recordCriteriaSelection(supabase, {
  sdKey, frId, criterionId, parameters = {}, domainClaims, canonicalGrade,
}) {
  if (!supabase) throw new Error('recordCriteriaSelection: supabase client is required');
  const { computedWeakestLinkGrade, effectiveGrade } = computeEffectiveGrade(canonicalGrade, domainClaims);

  const { data, error } = await supabase
    .from('value_authenticity_criteria_selections')
    .insert({
      sd_key: sdKey,
      fr_id: frId,
      criterion_id: criterionId,
      parameters,
      domain_claims: domainClaims,
      computed_weakest_link_grade: computedWeakestLinkGrade,
      canonical_grade: canonicalGrade,
      effective_grade: effectiveGrade,
    })
    .select()
    .single();

  if (error) throw new Error(`recordCriteriaSelection: insert failed: ${error.message}`);
  return data;
}
