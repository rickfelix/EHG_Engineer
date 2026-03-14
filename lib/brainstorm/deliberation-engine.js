/**
 * Board Deliberation Engine
 *
 * Orchestrates the two-round board deliberation model:
 * - Round 1: All 6 seats in parallel produce initial positions
 * - Specialist summoning: Auto-detect and fill expertise gaps
 * - Round 2: Rebuttals informed by Round 1 and specialist testimony
 * - Judiciary synthesis with constitutional citations
 *
 * Quorum enforcement: Minimum seats must participate (default: 4/6).
 */
import { BOARD_SEATS, getAllSeatCodes } from './board-seats/index.js';
import { loadSeatMemory } from './institutional-memory.js';
import { parseExpertiseGaps, findSpecialist, generateSpecialistIdentity, registerSpecialist } from './specialist-registry.js';
import {
  createBoardDebateSession,
  recordBoardArgument,
  recordJudiciaryVerdict,
  extractConstitutionalCitations,
  getDebateArguments
} from './board-judiciary-bridge.js';

const DEFAULT_QUORUM = 4;
const DELIBERATION_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Execute a full board deliberation on a brainstorm topic.
 *
 * @param {object} params
 * @param {string} params.topic - The brainstorm topic
 * @param {string} params.brainstormSessionId - Brainstorm session ID
 * @param {string[]} params.keywords - Topic keywords for memory queries
 * @param {Function} params.invokeAgent - Function to invoke an LLM agent: (systemPrompt, userPrompt) => string
 * @param {number} params.quorum - Minimum seats required (default: 4)
 * @param {object} params.topicContext - Additional context (domain, venture, etc.)
 * @returns {Promise<object>} Deliberation result
 */
export async function executeDeliberation({
  topic,
  brainstormSessionId,
  keywords = [],
  invokeAgent,
  quorum = DEFAULT_QUORUM,
  topicContext = {}
}) {
  const startTime = Date.now();
  const result = {
    debateSessionId: null,
    round1Positions: [],
    specialistTestimony: [],
    round2Rebuttals: [],
    verdict: null,
    quorumMet: false,
    totalTimeMs: 0,
    seatTimings: {}
  };

  // 1. Create debate session
  result.debateSessionId = await createBoardDebateSession(brainstormSessionId, topic);

  // 2. Load institutional memory for each seat (parallel)
  const memoryPromises = BOARD_SEATS.map(async seat => {
    const memory = await loadSeatMemory(seat.code, topic, keywords);
    return { code: seat.code, memory };
  });
  const memories = await Promise.all(memoryPromises);
  const memoryMap = Object.fromEntries(memories.map(m => [m.code, m.memory]));

  // 3. Round 1: All seats in parallel
  const round1Start = Date.now();
  const round1Promises = BOARD_SEATS.map(async seat => {
    const seatStart = Date.now();
    const prompt = seat.systemPrompt({
      memoryContext: memoryMap[seat.code] || '',
      specialistTestimony: ''
    });

    const position = await invokeAgent(
      prompt,
      `Deliberation Topic: ${topic}\n\nDomain: ${topicContext.domain || 'general'}\n\nProduce your ${seat.title} position on this topic. Address your standing question: "${seat.standingQuestion}"\n\nBe specific to this topic. Reference concrete details.`
    );

    result.seatTimings[seat.code] = { round1Ms: Date.now() - seatStart };

    return {
      seatCode: seat.code,
      seatTitle: seat.title,
      position,
      confidenceScore: 0.8
    };
  });

  result.round1Positions = await Promise.all(round1Promises);

  // 4. Quorum check
  const activeSeatCount = result.round1Positions.filter(p => p.position && p.position.length > 50).length;
  result.quorumMet = activeSeatCount >= quorum;

  if (!result.quorumMet) {
    const unavailable = result.round1Positions
      .filter(p => !p.position || p.position.length <= 50)
      .map(p => p.seatCode);

    result.error = {
      type: 'QUORUM_NOT_MET',
      message: `Quorum not met: ${activeSeatCount}/${BOARD_SEATS.length} seats responded (minimum: ${quorum})`,
      unavailableSeats: unavailable
    };
    result.totalTimeMs = Date.now() - startTime;
    return result;
  }

  // 5. Record Round 1 arguments in database
  const round1Ids = {};
  for (const pos of result.round1Positions) {
    const citations = extractConstitutionalCitations(pos.position);
    const argId = await recordBoardArgument({
      debateSessionId: result.debateSessionId,
      agentCode: pos.seatCode,
      roundNumber: 1,
      argumentType: 'initial_position',
      summary: pos.position.slice(0, 500),
      detailedReasoning: pos.position,
      confidenceScore: pos.confidenceScore,
      constitutionCitations: citations
    });
    round1Ids[pos.seatCode] = argId;
  }

  // 6. Specialist summoning
  const allOutputs = result.round1Positions.map(p => p.position);
  const expertiseGaps = parseExpertiseGaps(allOutputs);

  if (expertiseGaps.length > 0) {
    for (const gap of expertiseGaps.slice(0, 3)) { // Max 3 specialists
      let specialist = findSpecialist(gap);

      if (!specialist) {
        specialist = generateSpecialistIdentity(gap, topic);
        registerSpecialist(specialist);
      }

      const testimony = await invokeAgent(
        specialist.identity,
        `The Board of Directors is deliberating on: "${topic}"\n\nThey identified an expertise gap in: ${gap}\n\nProvide your expert testimony. Be specific, actionable, and grounded in domain knowledge.`
      );

      const testimonyId = await recordBoardArgument({
        debateSessionId: result.debateSessionId,
        agentCode: specialist.agentCode,
        roundNumber: 1,
        argumentType: 'specialist_testimony',
        summary: testimony.slice(0, 500),
        detailedReasoning: testimony,
        confidenceScore: 0.85
      });

      result.specialistTestimony.push({
        gap,
        agentCode: specialist.agentCode,
        testimony,
        argumentId: testimonyId
      });
    }
  }

  // 7. Round 2: Rebuttals with cross-seat awareness
  const specialistContext = result.specialistTestimony
    .map(s => `[Specialist: ${s.agentCode}] ${s.testimony}`)
    .join('\n\n');

  const otherPositionsSummary = result.round1Positions
    .map(p => `[${p.seatCode} - ${p.seatTitle}]: ${p.position.slice(0, 300)}`)
    .join('\n\n');

  const round2Promises = BOARD_SEATS.map(async seat => {
    const seatStart = Date.now();
    const othersExceptSelf = result.round1Positions
      .filter(p => p.seatCode !== seat.code)
      .map(p => `[${p.seatCode}]: ${p.position.slice(0, 400)}`)
      .join('\n\n');

    const prompt = seat.systemPrompt({
      memoryContext: memoryMap[seat.code] || '',
      specialistTestimony: specialistContext
    });

    const rebuttal = await invokeAgent(
      prompt,
      `ROUND 2 REBUTTAL — Deliberation Topic: "${topic}"

Your Round 1 position has been recorded. Now review the other board members' positions and any specialist testimony, then produce your rebuttal.

OTHER BOARD POSITIONS:
${othersExceptSelf}

${specialistContext ? `SPECIALIST TESTIMONY:\n${specialistContext}\n` : ''}
Produce your rebuttal. Reference specific positions from other seats by their code (e.g., "The CRO raises a valid concern about..."). Incorporate specialist testimony where relevant. Refine or defend your position based on new information.`
    );

    if (result.seatTimings[seat.code]) {
      result.seatTimings[seat.code].round2Ms = Date.now() - seatStart;
    }

    return {
      seatCode: seat.code,
      seatTitle: seat.title,
      rebuttal,
      inResponseTo: round1Ids // References all Round 1 positions
    };
  });

  result.round2Rebuttals = await Promise.all(round2Promises);

  // 8. Record Round 2 arguments
  for (const reb of result.round2Rebuttals) {
    const citations = extractConstitutionalCitations(reb.rebuttal);
    await recordBoardArgument({
      debateSessionId: result.debateSessionId,
      agentCode: reb.seatCode,
      roundNumber: 2,
      argumentType: 'rebuttal',
      summary: reb.rebuttal.slice(0, 500),
      detailedReasoning: reb.rebuttal,
      confidenceScore: 0.85,
      constitutionCitations: citations
    });
  }

  // 9. Update debate session to round 2 complete
  await updateDebateRound(result.debateSessionId, 2);

  result.totalTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Generate a judiciary synthesis verdict from the deliberation.
 *
 * @param {object} deliberationResult - Result from executeDeliberation
 * @param {Function} invokeAgent - LLM invocation function
 * @returns {Promise<object>} Verdict result
 */
export async function synthesizeVerdict(deliberationResult, invokeAgent) {
  const { debateSessionId, round1Positions, round2Rebuttals, specialistTestimony } = deliberationResult;

  const allPositions = round1Positions
    .map(p => `[${p.seatCode} Round 1]: ${p.position.slice(0, 500)}`)
    .join('\n\n');

  const allRebuttals = round2Rebuttals
    .map(r => `[${r.seatCode} Round 2]: ${r.rebuttal.slice(0, 500)}`)
    .join('\n\n');

  const specialistInput = specialistTestimony
    .map(s => `[${s.agentCode}]: ${s.testimony.slice(0, 300)}`)
    .join('\n\n');

  const verdictText = await invokeAgent(
    `You are the Judiciary of EHG's Board of Directors governance system.

Your role: Synthesize the board's deliberation into a clear verdict that respects constitutional principles.

You MUST:
1. Identify consensus points across all 6 seats
2. Identify tension points where seats disagree
3. Cite specific constitutional rules (PROTOCOL CONST-001 through CONST-010, FOUR_OATHS, DOCTRINE) where relevant, with a relevance score (0-100) for each citation
4. Determine if the positions are reconcilable or require chairman escalation
5. Provide a clear recommendation

Set escalation_required=true if:
- Board positions are fundamentally irreconcilable after Round 2
- A position raises constitutional concerns that require human judgment
- Confidence in synthesis is below 0.6`,
    `BOARD DELIBERATION SYNTHESIS

ROUND 1 POSITIONS:
${allPositions}

ROUND 2 REBUTTALS:
${allRebuttals}

${specialistInput ? `SPECIALIST TESTIMONY:\n${specialistInput}\n` : ''}

Produce your judiciary verdict. Include:
1. CONSENSUS: Points all/most seats agree on
2. TENSIONS: Key disagreements and their resolution
3. CONSTITUTIONAL CITATIONS: Relevant rules with relevance scores
4. RECOMMENDATION: Clear actionable recommendation
5. ESCALATION: Whether chairman override is needed (true/false) and why`
  );

  // Parse escalation signal from verdict
  const escalationRequired = /escalation.*(?:required|needed|true)/i.test(verdictText);

  // Extract citations from verdict
  const citations = extractConstitutionalCitations(verdictText);
  const citationsWithScores = citations.map(c => ({
    source: c.startsWith('CONST-') ? 'PROTOCOL' : c,
    rule_number: c,
    relevance_score: 80 // Default; LLM should provide specific scores
  }));

  const verdictId = await recordJudiciaryVerdict({
    debateSessionId,
    summary: verdictText.slice(0, 500),
    detailedRationale: verdictText,
    constitutionCitations: citationsWithScores,
    constitutionalScore: 80,
    confidenceScore: escalationRequired ? 0.5 : 0.8,
    escalationRequired
  });

  return {
    verdictId,
    verdictText,
    escalationRequired,
    citations: citationsWithScores
  };
}

async function updateDebateRound(debateSessionId, roundNumber) {
  await supabase
    .from('debate_sessions')
    .update({ round_number: roundNumber })
    .eq('id', debateSessionId);
}

// Re-export for convenience
export { DEFAULT_QUORUM, DELIBERATION_TIMEOUT_MS };
