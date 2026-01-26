/**
 * DOCMON Pattern Library
 * False-positive pattern normalization for duplicate detection
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-B
 */

/**
 * Stage numbering patterns (e.g., 'Stage 1', 'Phase II', 'Step 03')
 */
const STAGE_PATTERNS = [
  /\b(?:stage|phase|step)\s*(?:\d+|[ivxlcdm]+)\b/gi,
  /\b(?:stage|phase|step)\s*-?\s*\d+[a-z]?\b/gi,
  /^\d{2,3}_/gm, // Numeric prefix like '01_', '001_'
  /^[0-9]+[a-z]?_/gm // '01a_', '2b_'
];

/**
 * SD identifier patterns (e.g., 'SD-LEO-INFRA-...')
 */
const SD_PATTERNS = [
  /\bSD-[A-Z0-9-]+(?:-\d{3})?(?:-[A-Z])?/gi,
  /\bQF-\d{8}-\d{3}/gi,
  /\bPRD-[A-Z0-9-]+/gi
];

/**
 * Version suffix patterns (e.g., 'v1', 'v1.2.3', 'rev 2')
 */
const VERSION_PATTERNS = [
  /\bv\d+(?:\.\d+)*\b/gi,
  /\brevision\s*\d+\b/gi,
  /\brev\s*\d+\b/gi,
  /[-_]v\d+(?:\.\d+)*(?:[-_]|$)/gi,
  /_v\d+\.md$/gi
];

/**
 * Workflow phase patterns (e.g., 'draft', 'approved', 'deprecated')
 */
const WORKFLOW_PATTERNS = [
  /\b(?:draft|approved|deprecated|review|final|wip|todo|pending|archived)\b/gi,
  /[-_](?:draft|approved|deprecated|review|final|wip|todo|pending|archived)[-_.]?/gi
];

/**
 * Common noise words for keyword extraction
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'we', 'you', 'they', 'them', 'their', 'our', 'your',
  'not', 'no', 'yes', 'all', 'any', 'some', 'more', 'most', 'other',
  'into', 'over', 'after', 'before', 'between', 'under', 'above',
  'such', 'each', 'which', 'while', 'when', 'where', 'who', 'what',
  'how', 'why', 'than', 'then', 'just', 'also', 'only', 'very',
  'about', 'out', 'up', 'down', 'new', 'old', 'first', 'last',
  'etc', 'eg', 'ie', 'vs', 'via'
]);

/**
 * Normalize text by removing false-positive patterns
 */
export function normalizeForComparison(text, options = {}) {
  const {
    removeStages = true,
    removeSD = true,
    removeVersions = true,
    removeWorkflow = true
  } = options;

  let normalized = text;

  if (removeStages) {
    for (const pattern of STAGE_PATTERNS) {
      normalized = normalized.replace(pattern, '');
    }
  }

  if (removeSD) {
    for (const pattern of SD_PATTERNS) {
      normalized = normalized.replace(pattern, '');
    }
  }

  if (removeVersions) {
    for (const pattern of VERSION_PATTERNS) {
      normalized = normalized.replace(pattern, '');
    }
  }

  if (removeWorkflow) {
    for (const pattern of WORKFLOW_PATTERNS) {
      normalized = normalized.replace(pattern, '');
    }
  }

  // Normalize whitespace and trim
  return normalized.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Normalize filename for comparison
 */
export function normalizeFilename(filename) {
  let normalized = filename;

  // Remove extension
  normalized = normalized.replace(/\.[^.]+$/, '');

  // Apply pattern normalization
  normalized = normalizeForComparison(normalized);

  // Normalize separators
  normalized = normalized.replace(/[-_]+/g, '-');

  // Remove leading/trailing separators
  normalized = normalized.replace(/^-+|-+$/g, '');

  return normalized;
}

/**
 * Extract keywords from text
 */
export function extractKeywords(text, options = {}) {
  const { minLength = 3, maxKeywords = 100, useStemming = false } = options;

  // Normalize and tokenize
  const normalized = normalizeForComparison(text);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(t => t.length >= minLength);

  // Remove stopwords
  const keywords = tokens.filter(t => !STOPWORDS.has(t));

  // Simple stemming (optional, removes common suffixes)
  const processed = useStemming
    ? keywords.map(k => k.replace(/(ing|ed|s|tion|ment|ness|able|ible|ly)$/, ''))
    : keywords;

  // Deduplicate and limit
  const unique = [...new Set(processed)];
  return unique.slice(0, maxKeywords);
}

/**
 * Calculate Jaccard similarity between two keyword sets
 */
export function jaccardSimilarity(set1, set2) {
  const a = new Set(set1);
  const b = new Set(set2);

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate keyword overlap count
 */
export function keywordOverlap(keywords1, keywords2) {
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  return [...set1].filter(k => set2.has(k)).length;
}

/**
 * Simple fuzzy string similarity (token-based ratio)
 */
export function fuzzySimilarity(str1, str2) {
  const tokens1 = str1.toLowerCase().split(/\s+/).sort();
  const tokens2 = str2.toLowerCase().split(/\s+/).sort();

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = [...set1].filter(t => set2.has(t)).length;
  const union = new Set([...set1, ...set2]).size;

  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Check if a match is a false positive based on pattern library
 */
export function isFalsePositive(file1, file2, matchType) {
  // If files have same normalized name after removing patterns, check if difference
  // is ONLY in the patterns we remove
  const name1 = file1.name || file1;
  const name2 = file2.name || file2;

  const norm1 = normalizeFilename(name1);
  const norm2 = normalizeFilename(name2);

  // If normalized names are identical but original names differ only by pattern,
  // it's likely a false positive
  if (norm1 === norm2 && name1 !== name2) {
    // Check if difference is only version, stage, SD, or workflow
    const diff1 = name1.replace(new RegExp(norm1, 'i'), '');
    const diff2 = name2.replace(new RegExp(norm2, 'i'), '');

    // If residual is only pattern matches, it's a false positive
    const isPattern1 = isOnlyPatternContent(diff1);
    const isPattern2 = isOnlyPatternContent(diff2);

    return isPattern1 && isPattern2;
  }

  return false;
}

/**
 * Check if string contains only pattern content (versions, stages, etc.)
 */
function isOnlyPatternContent(str) {
  let cleaned = str;

  // Remove all pattern matches
  for (const pattern of [...STAGE_PATTERNS, ...SD_PATTERNS, ...VERSION_PATTERNS, ...WORKFLOW_PATTERNS]) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove separators and whitespace
  cleaned = cleaned.replace(/[-_.\s]/g, '');

  // If nothing remains, it was only patterns
  return cleaned.length === 0;
}

export default {
  normalizeForComparison,
  normalizeFilename,
  extractKeywords,
  jaccardSimilarity,
  keywordOverlap,
  fuzzySimilarity,
  isFalsePositive,
  STOPWORDS
};
