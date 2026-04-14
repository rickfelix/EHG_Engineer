/**
 * Prompt-Build Analyzer
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-D-A
 *
 * Compares sprint specification prompts against actual Replit build
 * output from github-repo-analyzer. Produces a coverage report showing
 * which sprint items were implemented, partially implemented, or missed.
 *
 * This powers the feedback loop that improves prompts for subsequent builds.
 */

/**
 * Normalize a string for fuzzy matching — lowercase, remove punctuation,
 * collapse whitespace.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Extract keywords from a sprint item for matching.
 * @param {object} item - Sprint item with name/title, description, acceptance_criteria
 * @returns {string[]} Keywords for matching
 */
function extractKeywords(item) {
  const parts = [
    item.name || item.title || '',
    item.description || item.scope || '',
    ...(Array.isArray(item.acceptance_criteria) ? item.acceptance_criteria : []),
  ];

  const text = normalize(parts.join(' '));
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'to', 'from', 'with', 'of', 'for',
    'in', 'on', 'at', 'is', 'it', 'be', 'as', 'by', 'this', 'that', 'should',
    'must', 'can', 'will', 'has', 'have', 'been', 'are', 'was', 'were',
    'create', 'add', 'implement', 'build', 'make', 'ensure', 'include',
  ]);

  return text.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Score how well a sprint item matches the repo file listing.
 * Returns a match score (0-1) and evidence (matching files).
 *
 * @param {object} item - Sprint item
 * @param {string[]} files - Repo file paths
 * @param {object} structure - Repo structure from analyzer
 * @returns {{score: number, evidence: string[], matchType: string}}
 */
function scoreItemMatch(item, files, structure) {
  const keywords = extractKeywords(item);
  if (keywords.length === 0) {
    return { score: 0, evidence: [], matchType: 'no_keywords' };
  }

  const normalizedFiles = files.map(f => ({ path: f, normalized: normalize(f) }));
  const matchedFiles = [];
  let keywordHits = 0;

  for (const keyword of keywords) {
    const matches = normalizedFiles.filter(f => f.normalized.includes(keyword));
    if (matches.length > 0) {
      keywordHits++;
      for (const m of matches) {
        if (!matchedFiles.includes(m.path)) {
          matchedFiles.push(m.path);
        }
      }
    }
  }

  // Also check top-level dirs for broad feature areas
  const dirs = structure?.topLevelDirs || [];
  for (const keyword of keywords) {
    if (dirs.some(d => normalize(d).includes(keyword))) {
      keywordHits++;
    }
  }

  const score = Math.min(1, keywordHits / Math.max(keywords.length, 1));
  const evidence = matchedFiles.slice(0, 5); // Limit evidence to 5 files

  let matchType;
  if (score >= 0.6) matchType = 'implemented';
  else if (score >= 0.3) matchType = 'partial';
  else if (score > 0) matchType = 'weak';
  else matchType = 'missing';

  return { score, evidence, matchType };
}

/**
 * Analyze how well a Replit build matches its sprint specification.
 *
 * @param {object} sprintPlan - Sprint plan data from S19 advisory_data
 * @param {object} repoAnalysis - Output from github-repo-analyzer.analyzeRepo()
 * @returns {{
 *   coveragePercent: number,
 *   totalItems: number,
 *   implemented: number,
 *   partial: number,
 *   missing: number,
 *   items: Array<{name: string, status: string, score: number, evidence: string[]}>,
 *   summary: string
 * }}
 */
export function analyzePromptVsBuild(sprintPlan, repoAnalysis) {
  const empty = {
    coveragePercent: 0,
    totalItems: 0,
    implemented: 0,
    partial: 0,
    missing: 0,
    items: [],
    summary: 'No data available for analysis.',
  };

  if (!sprintPlan || !repoAnalysis) return empty;

  // Extract sprint items from various formats
  const rawItems = sprintPlan.items
    || sprintPlan.sprint_items
    || sprintPlan.tasks
    || [];

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ...empty, summary: 'No sprint items found in plan.' };
  }

  const { files = [], structure = {} } = repoAnalysis;

  if (files.length === 0) {
    return {
      ...empty,
      totalItems: rawItems.length,
      missing: rawItems.length,
      items: rawItems.map(item => ({
        name: item.name || item.title || 'Unnamed',
        status: 'missing',
        score: 0,
        evidence: [],
      })),
      summary: `Empty repository — 0/${rawItems.length} sprint items matched.`,
    };
  }

  // Score each sprint item
  const results = rawItems.map(item => {
    const { score, evidence, matchType } = scoreItemMatch(item, files, structure);
    return {
      name: item.name || item.title || 'Unnamed',
      status: matchType,
      score: Math.round(score * 100),
      evidence,
      keywords: extractKeywords(item).slice(0, 5),
    };
  });

  const implemented = results.filter(r => r.status === 'implemented').length;
  const partial = results.filter(r => r.status === 'partial' || r.status === 'weak').length;
  const missing = results.filter(r => r.status === 'missing').length;

  // Weighted coverage: implemented = 100%, partial = 50%, missing = 0%
  const totalWeight = results.length;
  const weightedScore = results.reduce((sum, r) => {
    if (r.status === 'implemented') return sum + 1;
    if (r.status === 'partial' || r.status === 'weak') return sum + 0.5;
    return sum;
  }, 0);
  const coveragePercent = Math.round((weightedScore / totalWeight) * 100);

  const summary = `Prompt-vs-Build Coverage: ${coveragePercent}% — ${implemented} implemented, ${partial} partial, ${missing} missing out of ${results.length} sprint items.`;

  return {
    coveragePercent,
    totalItems: results.length,
    implemented,
    partial,
    missing,
    items: results,
    summary,
  };
}

export default { analyzePromptVsBuild };
