/**
 * Specialist Identity Registry
 *
 * Manages reusable specialist agent identities across brainstorm sessions.
 * Specialists are spawned when board members flag expertise gaps.
 * Registry enables continuity — specialists build expertise over time.
 */

const SIMILARITY_THRESHOLD = 0.7;

// In-process registry (v1). Future: persist to database.
const registry = new Map();

/**
 * Register a specialist identity.
 * @param {object} specialist - { topicDomain, capabilityProfile, identity, agentCode }
 */
export function registerSpecialist(specialist) {
  const key = normalizeKey(specialist.topicDomain);
  const existing = registry.get(key) || [];
  existing.push({
    ...specialist,
    registeredAt: new Date().toISOString(),
    usageCount: 0
  });
  registry.set(key, existing);
}

/**
 * Find a matching specialist for a given domain.
 * Returns the best match if similarity >= threshold, null otherwise.
 * @param {string} topicDomain - The domain to search for
 * @returns {object|null} Matching specialist or null
 */
export function findSpecialist(topicDomain) {
  const searchKey = normalizeKey(topicDomain);
  const searchWords = searchKey.split('-').filter(Boolean);

  let bestMatch = null;
  let bestScore = 0;

  for (const [key, specialists] of registry.entries()) {
    const keyWords = key.split('-').filter(Boolean);
    const score = computeSimilarity(searchWords, keyWords);

    if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
      bestScore = score;
      // Return the most-used specialist for this domain
      bestMatch = specialists.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0];
    }
  }

  if (bestMatch) {
    bestMatch.usageCount = (bestMatch.usageCount || 0) + 1;
  }

  return bestMatch;
}

/**
 * Generate a specialist identity from an expertise gap description.
 * @param {string} gapDescription - What expertise is needed
 * @param {string} topicContext - The brainstorm topic for context
 * @returns {object} Specialist identity
 */
export function generateSpecialistIdentity(gapDescription, topicContext) {
  const domain = extractDomain(gapDescription);
  const agentCode = `SPECIALIST-${domain.toUpperCase().replace(/\s+/g, '-').slice(0, 20)}`;

  return {
    topicDomain: domain,
    capabilityProfile: gapDescription,
    agentCode,
    identity: `You are a specialist agent summoned by the Board of Directors to provide expert testimony on: ${gapDescription}.

Context: The board is deliberating on "${topicContext}" and identified a gap in their collective expertise regarding ${gapDescription}.

Your role:
- Provide deep, specific expertise that the board's permanent seats cannot
- Reference concrete examples, patterns, and technical details from your domain
- Your testimony will be recorded in debate_arguments and used by board members in their rebuttals
- Be direct and actionable — the board needs expert input, not general advice

Produce your testimony as a focused expert analysis. Include specific recommendations.`
  };
}

/**
 * Parse expertise gaps from board seat outputs.
 * Looks for "EXPERTISE_GAP: <description>" markers.
 * @param {string[]} seatOutputs - Array of board seat position texts
 * @returns {string[]} Array of expertise gap descriptions
 */
export function parseExpertiseGaps(seatOutputs) {
  const gaps = [];
  const seen = new Set();

  for (const output of seatOutputs) {
    const matches = output.matchAll(/EXPERTISE_GAP:\s*(.+?)(?:\n|$)/gi);
    for (const match of matches) {
      const gap = match[1].trim();
      const normalized = gap.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        gaps.push(gap);
      }
    }
  }

  return gaps;
}

function normalizeKey(domain) {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

function computeSimilarity(words1, words2) {
  if (!words1.length || !words2.length) return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = [...set1].filter(w => set2.has(w));
  const union = new Set([...set1, ...set2]);
  return intersection.length / union.size; // Jaccard similarity
}

function extractDomain(gapDescription) {
  // Extract key domain phrases from the gap description
  return gapDescription
    .replace(/^(expertise in|knowledge of|experience with|understanding of)\s*/i, '')
    .slice(0, 50)
    .trim();
}

export function getRegistrySize() {
  return registry.size;
}

export function clearRegistry() {
  registry.clear();
}
