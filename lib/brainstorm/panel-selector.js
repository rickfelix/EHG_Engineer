/**
 * Panel Selection Engine
 * SD: SD-LEO-INFRA-INTELLIGENT-DYNAMIC-BOARD-001-B
 *
 * Selects an optimal panel of identities from the specialist_registry
 * for a given brainstorm topic. Replaces the hardcoded BOARD_SEATS array.
 *
 * Selection algorithm:
 * 1. Query all identities from specialist_registry
 * 2. Score each by topic relevance (keyword matching) * authority_score
 * 3. Apply cold start bonus for new identities (<5 deliberations)
 * 4. Guarantee governance floor identities are always included
 * 5. Fill remaining seats by composite score descending
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { buildRubricPrompt } from './expertise-gap-rubric.js';

const COLD_START_THRESHOLD = 5;
const COLD_START_BONUS = 10;
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'about', 'and', 'but', 'or', 'not',
  'if', 'then', 'when', 'where', 'how', 'what', 'which', 'who', 'that',
  'this', 'it', 'its', 'we', 'our', 'they', 'them', 'their', 'up', 'out',
  'no', 'all', 'any', 'each', 'every', 'some', 'only', 'also', 'just',
  'more', 'most', 'very'
]);

const RUBRIC = buildRubricPrompt();

/**
 * Select an optimal panel of identities for a brainstorm topic.
 *
 * @param {string} topic - The brainstorm topic
 * @param {string[]} keywords - Additional topic keywords
 * @param {object} opts
 * @param {number} opts.maxSeats - Maximum panel size (default: 6)
 * @param {number} opts.minGovernance - Minimum governance floor seats (default: 2)
 * @returns {Promise<object[]>} Selected panel identities with system prompts
 */
export async function selectPanel(topic, keywords = [], { maxSeats = 6, minGovernance = 2 } = {}) {
  const supabase = createSupabaseServiceClient();

  // 1. Fetch all identities from the pool
  const { data: identities, error } = await supabase
    .from('specialist_registry')
    .select('name, role, expertise, context, metadata, authority_score, is_governance_floor, legacy_agent_code, expertise_domains, total_deliberations');

  if (error || !identities?.length) {
    console.warn('[PanelSelector] No identities found:', error?.message);
    return [];
  }

  // 2. Build search words from topic + keywords
  const topicWords = extractWords(topic);
  const kwWords = keywords.flatMap(k => extractWords(k));
  const searchWords = [...new Set([...topicWords, ...kwWords])];

  if (!searchWords.length) return identities.slice(0, maxSeats);

  // 3. Score each identity
  const scored = identities.map(identity => {
    const domainWords = new Set([
      ...extractWords(identity.expertise || ''),
      ...(identity.expertise_domains || []).flatMap(d => extractWords(d))
    ]);

    // Topic relevance: fraction of search words found in identity domains
    const matched = searchWords.filter(w => domainWords.has(w)).length;
    const relevance = searchWords.length > 0 ? matched / searchWords.length : 0;

    // Authority weight (normalized 0-1)
    const authority = (identity.authority_score || 50) / 100;

    // Cold start bonus for new identities
    const coldStart = (identity.total_deliberations || 0) < COLD_START_THRESHOLD
      ? COLD_START_BONUS / 100
      : 0;

    const compositeScore = (relevance * 0.6) + (authority * 0.3) + (coldStart * 0.1);

    return {
      ...identity,
      relevance,
      compositeScore,
      isGovernanceFloor: identity.is_governance_floor || false
    };
  });

  // 4. Separate governance floor identities
  const floorIdentities = scored.filter(s => s.isGovernanceFloor);
  const nonFloor = scored.filter(s => !s.isGovernanceFloor);

  // 5. Sort non-floor by composite score
  nonFloor.sort((a, b) => b.compositeScore - a.compositeScore);

  // 6. Build panel: governance floor first, then top-scoring non-floor
  const panel = [];

  // Always include governance floor (up to minGovernance)
  for (const identity of floorIdentities.slice(0, minGovernance)) {
    panel.push(identity);
  }

  // Fill remaining seats with top-scoring non-floor identities
  const remaining = maxSeats - panel.length;
  for (const identity of nonFloor.slice(0, remaining)) {
    panel.push(identity);
  }

  // 7. Build system prompts for each panel member
  return panel.map(identity => ({
    code: identity.legacy_agent_code || identity.name,
    title: identity.name,
    perspective: identity.expertise,
    standingQuestion: extractStandingQuestion(identity),
    relevanceScore: identity.relevance,
    compositeScore: identity.compositeScore,
    authorityScore: identity.authority_score,
    isGovernanceFloor: identity.isGovernanceFloor,
    systemPrompt: (seat) => `You are ${identity.name} on EHG's Board of Directors.

Your domain: ${identity.expertise}

${identity.context || ''}

${seat.memoryContext || ''}
${seat.specialistTestimony || ''}

Produce a position that is specific to THIS topic. Reference concrete details from the topic, not generic advice.

${RUBRIC}`
  }));
}

function extractWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function extractStandingQuestion(identity) {
  const role = (identity.role || '').toLowerCase();
  const questions = {
    cso: 'Does this move EHG forward or sideways?',
    cro: "What's the blast radius if this fails?",
    cto: "What do we already have? What's the real build cost?",
    ciso: 'What attack surface does this create?',
    coo: 'Can we actually deliver this given current load?',
    cfo: "What does this cost and what's the return?"
  };
  return questions[role] || `What is your expert assessment of this from a ${identity.expertise} perspective?`;
}
