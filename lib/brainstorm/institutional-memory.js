/**
 * Institutional Memory Module
 *
 * Queries past board positions from debate_arguments, cross-references against
 * completed SDs and retrospectives, and annotates positions with lifecycle status.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_MEMORY_TOKENS = 2000;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_MEMORY_CHARS = MAX_MEMORY_TOKENS * APPROX_CHARS_PER_TOKEN;

/**
 * Lifecycle statuses for past positions.
 * - Active: No resolution signal found
 * - Mitigated: A related SD was completed that addresses the concern
 * - Superseded: Context has changed (newer brainstorm on same topic)
 * - Validated: Issue actually occurred (found in retrospectives)
 */
const LIFECYCLE = {
  ACTIVE: 'active',
  MITIGATED: 'mitigated',
  SUPERSEDED: 'superseded',
  VALIDATED: 'validated'
};

/**
 * Load past positions for a board seat on topics related to the current brainstorm.
 *
 * @param {string} seatCode - Board seat agent code (CSO, CRO, etc.)
 * @param {string} topic - Current brainstorm topic
 * @param {string[]} keywords - Topic keywords for relevance matching
 * @returns {Promise<string>} Formatted memory context string
 */
export async function loadSeatMemory(seatCode, topic, keywords = []) {
  if (!keywords.length) {
    keywords = extractKeywords(topic);
  }

  // 1. Fetch past positions from debate_arguments for this seat
  const { data: pastPositions, error: posErr } = await supabase
    .from('debate_arguments')
    .select('id, debate_session_id, round_number, summary, detailed_reasoning, confidence_score, created_at')
    .eq('agent_code', seatCode)
    .order('created_at', { ascending: false })
    .limit(20);

  if (posErr || !pastPositions?.length) {
    return '';
  }

  // 2. Fetch completed SDs for mitigated detection
  const { data: completedSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, scope, completion_date')
    .eq('status', 'completed')
    .order('completion_date', { ascending: false })
    .limit(50);

  // 3. Fetch retrospectives for validated detection
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('title, what_needs_improvement, key_learnings, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  // 4. Annotate each position with lifecycle status
  const annotated = pastPositions.map(pos => {
    const posText = (pos.summary || '') + ' ' + (pos.detailed_reasoning || '');
    const relevance = computeRelevance(posText, keywords);

    if (relevance < 0.2) return null; // Not relevant enough

    const lifecycle = determineLifecycle(posText, completedSDs || [], retros || []);

    return {
      ...pos,
      relevance,
      lifecycle,
      lifecycleLabel: lifecycle.status,
      lifecycleReason: lifecycle.reason
    };
  }).filter(Boolean);

  // Sort by relevance
  annotated.sort((a, b) => b.relevance - a.relevance);

  // 5. Format as context string within token budget
  return formatMemoryContext(seatCode, annotated);
}

function extractKeywords(topic) {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'can', 'for', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
    'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
    'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'up', 'about', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out',
    'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'how', 'what']);

  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function computeRelevance(text, keywords) {
  if (!text || !keywords.length) return 0;
  const lower = text.toLowerCase();
  const matches = keywords.filter(kw => lower.includes(kw));
  return matches.length / keywords.length;
}

function determineLifecycle(positionText, completedSDs, retros) {
  // Check for validated (issue occurred per retrospective)
  for (const retro of retros) {
    const retroText = ((retro.what_needs_improvement || '') + ' ' + (retro.key_learnings || '')).toLowerCase();
    const overlap = computeRelevance(retroText, extractKeywords(positionText));
    if (overlap > 0.3) {
      return { status: LIFECYCLE.VALIDATED, reason: `Issue confirmed in retrospective: ${retro.title}` };
    }
  }

  // Check for mitigated (related SD completed)
  for (const sd of completedSDs) {
    const sdText = ((sd.title || '') + ' ' + (sd.scope || '')).toLowerCase();
    const overlap = computeRelevance(sdText, extractKeywords(positionText));
    if (overlap > 0.3) {
      return { status: LIFECYCLE.MITIGATED, reason: `Addressed by completed SD: ${sd.sd_key}` };
    }
  }

  // Default: active
  return { status: LIFECYCLE.ACTIVE, reason: 'No resolution signal found' };
}

function formatMemoryContext(seatCode, positions) {
  if (!positions.length) return '';

  let context = `[INSTITUTIONAL MEMORY - ${seatCode}]\n`;
  let charCount = context.length;

  for (const pos of positions) {
    const entry = `- [${pos.lifecycleLabel.toUpperCase()}] ${pos.summary || '(no summary)'} (confidence: ${pos.confidence_score || 'N/A'}, relevance: ${(pos.relevance * 100).toFixed(0)}%) ${pos.lifecycleReason ? `| ${pos.lifecycleReason}` : ''}\n`;

    if (charCount + entry.length > MAX_MEMORY_CHARS) break;
    context += entry;
    charCount += entry.length;
  }

  context += `[END MEMORY - ${positions.length} position(s) loaded]\n`;
  return context;
}

export { LIFECYCLE, extractKeywords };
