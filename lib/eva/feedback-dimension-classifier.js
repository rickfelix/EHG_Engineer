/**
 * Feedback Dimension Classifier
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E (FR-001)
 *
 * Maps feedback items to vision/architecture dimension codes using keyword matching.
 * Loads dimension definitions from eva_vision_documents and eva_architecture_plans,
 * then matches feedback text against extracted keywords.
 */

// Cache for dimension definitions (loaded once from DB)
let _dimensionCache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'it', 'its', 'this', 'that', 'these', 'those',
  'with', 'from', 'by', 'as', 'each', 'all', 'any', 'both', 'such', 'not',
  'no', 'than', 'too', 'very', 'just', 'about', 'above', 'after', 'before',
  'between', 'into', 'through', 'during', 'over', 'under', 'again', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'what', 'which',
  'who', 'whom', 'some', 'more', 'most', 'other',
]);

const MIN_CONFIDENCE = 0.1;

/**
 * Extract meaningful keywords from text, filtering out stop words and short tokens.
 * @param {string} name
 * @param {string} description
 * @returns {string[]}
 */
function extractKeywords(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  const words = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // Deduplicate while preserving order
  const seen = new Set();
  return words.filter(w => {
    if (seen.has(w)) return false;
    seen.add(w);
    return true;
  });
}

/**
 * Load and cache dimension definitions from eva_vision_documents and eva_architecture_plans.
 * @param {Object} supabase
 * @returns {Promise<Array<{ id: string, name: string, description: string, keywords: string[], source: string }>>}
 */
async function loadDimensions(supabase) {
  if (_dimensionCache && Date.now() < _cacheExpiry) return _dimensionCache;

  const [visionResult, archResult] = await Promise.all([
    supabase
      .from('eva_vision_documents')
      .select('extracted_dimensions')
      .eq('key', 'VISION-EHG-L1-001')
      .single(),
    supabase
      .from('eva_architecture_plans')
      .select('extracted_dimensions')
      .eq('key', 'ARCH-EHG-L1-001')
      .single(),
  ]);

  const dimensions = [];

  if (visionResult.data?.extracted_dimensions) {
    for (let i = 0; i < visionResult.data.extracted_dimensions.length; i++) {
      const dim = visionResult.data.extracted_dimensions[i];
      dimensions.push({
        id: `V${String(i + 1).padStart(2, '0')}`,
        name: dim.name,
        description: dim.description || '',
        keywords: extractKeywords(dim.name, dim.description || ''),
        source: 'vision',
      });
    }
  }

  if (archResult.data?.extracted_dimensions) {
    for (let i = 0; i < archResult.data.extracted_dimensions.length; i++) {
      const dim = archResult.data.extracted_dimensions[i];
      dimensions.push({
        id: `A${String(i + 1).padStart(2, '0')}`,
        name: dim.name,
        description: dim.description || '',
        keywords: extractKeywords(dim.name, dim.description || ''),
        source: 'architecture',
      });
    }
  }

  _dimensionCache = dimensions;
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return dimensions;
}

/**
 * Classify feedback text against vision/architecture dimensions.
 * Returns matched dimensions sorted by confidence (descending).
 *
 * @param {string} title - Feedback title
 * @param {string} description - Feedback description
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array<{ dimensionId: string, name: string, confidence: number, matchedKeywords: string[] }>>}
 */
export async function classifyFeedback(title, description, supabase) {
  if (!supabase) return [];

  let dimensions;
  try {
    dimensions = await loadDimensions(supabase);
  } catch (err) {
    console.warn(`[FeedbackClassifier] Failed to load dimensions: ${err.message}`);
    return [];
  }

  if (dimensions.length === 0) return [];

  const feedbackText = `${title || ''} ${description || ''}`.toLowerCase();
  const feedbackWords = new Set(
    feedbackText.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  );

  const matches = [];

  for (const dim of dimensions) {
    if (dim.keywords.length === 0) continue;

    const matchedKeywords = dim.keywords.filter(kw => feedbackWords.has(kw));
    if (matchedKeywords.length === 0) continue;

    const confidence = Math.min(matchedKeywords.length / dim.keywords.length, 1.0);

    if (confidence >= MIN_CONFIDENCE) {
      matches.push({
        dimensionId: dim.id,
        name: dim.name,
        confidence: Math.round(confidence * 100) / 100,
        matchedKeywords,
      });
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/** Reset cache (for testing). */
export function _resetClassifierCache() {
  _dimensionCache = null;
  _cacheExpiry = 0;
}

/** Exposed for testing */
export const _extractKeywords = extractKeywords;
