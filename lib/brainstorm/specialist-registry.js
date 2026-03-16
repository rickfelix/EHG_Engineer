/**
 * Specialist Identity Registry
 *
 * Manages reusable specialist agent identities across brainstorm sessions.
 * Specialists are spawned when board members flag expertise gaps.
 * Registry enables continuity — specialists build expertise over time.
 * Backed by the specialist_registry table for cross-session persistence.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SIMILARITY_THRESHOLD = 0.7;

// In-session cache — avoids repeated DB queries within a single deliberation
const registry = new Map();

// All-rows DB cache to avoid repeated full-table fetches within a session
let dbRowsCache = null;
let dbRowsCacheTime = 0;
const DB_CACHE_TTL_MS = 30_000;

const SPECIALIST_ROLE_INSTRUCTIONS = `Your role:
- Provide deep, specific expertise that the board's permanent seats cannot
- Reference concrete examples, patterns, and technical details from your domain
- Your testimony will be recorded in debate_arguments and used by board members in their rebuttals
- Be direct and actionable — the board needs expert input, not general advice

Produce your testimony as a focused expert analysis. Include specific recommendations.`;

/**
 * Register a specialist identity (in-session cache + database).
 * @param {object} specialist - { topicDomain, capabilityProfile, identity, agentCode }
 */
export async function registerSpecialist(specialist) {
  const key = normalizeKey(specialist.topicDomain);
  const existing = registry.get(key) || [];
  const entry = {
    ...specialist,
    registeredAt: new Date().toISOString(),
    usageCount: 0
  };
  existing.push(entry);
  registry.set(key, existing);

  // Persist to database for cross-session reuse
  const role = specialist.agentCode.toLowerCase();
  const { error } = await supabase.from('specialist_registry').upsert({
    name: specialist.agentCode,
    role,
    expertise: specialist.capabilityProfile,
    context: specialist.identity,
    metadata: { source: 'brainstorm-deliberation', topicDomain: specialist.topicDomain }
  }, { onConflict: 'role' });
  if (error) console.log(`specialist_registry upsert error: ${error.message}`);
  else dbRowsCache = null; // invalidate so next findSpecialist sees the new entry
}

/**
 * Find a matching specialist for a given domain.
 * Checks in-session cache first, then falls back to the database.
 * @param {string} topicDomain - The domain to search for
 * @returns {Promise<object|null>} Matching specialist or null
 */
export async function findSpecialist(topicDomain) {
  const searchKey = normalizeKey(topicDomain);
  const searchWords = searchKey.split('-').filter(Boolean);

  // 1. Check in-session cache
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, specialists] of registry.entries()) {
    const keyWords = key.split('-').filter(Boolean);
    const score = computeSimilarity(searchWords, keyWords);

    if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestMatch = specialists.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0];
    }
  }

  if (bestMatch) {
    bestMatch.usageCount = (bestMatch.usageCount || 0) + 1;
    return bestMatch;
  }

  // 2. Fall back to database (use query coverage — asymmetric match)
  const rows = await getCachedRows();
  if (!rows.length) return null;

  for (const row of rows) {
    const candidateWords = new Set(
      normalizeKey(`${row.name} ${row.expertise}`).split('-').filter(Boolean)
    );
    // Query coverage: what fraction of search words appear in the candidate
    const matched = searchWords.filter(w => candidateWords.has(w)).length;
    const score = matched / searchWords.length;

    if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  if (!bestMatch) return null;

  // Convert DB row to specialist identity format
  const specialist = {
    topicDomain: bestMatch.metadata?.topicDomain || bestMatch.role,
    capabilityProfile: bestMatch.expertise,
    agentCode: bestMatch.name,
    identity: bestMatch.context || buildIdentityFromRow(bestMatch),
    usageCount: 0,
    source: 'database'
  };

  // Cache for remainder of session
  const cacheKey = normalizeKey(specialist.topicDomain);
  registry.set(cacheKey, [specialist]);

  return specialist;
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

${SPECIALIST_ROLE_INSTRUCTIONS}`
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

async function getCachedRows() {
  if (dbRowsCache && Date.now() - dbRowsCacheTime < DB_CACHE_TTL_MS) {
    return dbRowsCache;
  }
  const { data, error } = await supabase
    .from('specialist_registry')
    .select('name, role, expertise, context, metadata');
  if (error || !data?.length) return [];
  dbRowsCache = data;
  dbRowsCacheTime = Date.now();
  return data;
}

function buildIdentityFromRow(row) {
  return `You are a specialist agent summoned by the Board of Directors to provide expert testimony.

Your expertise: ${row.expertise}

${SPECIALIST_ROLE_INSTRUCTIONS}`;
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
  dbRowsCache = null;
}
