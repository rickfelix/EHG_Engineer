/**
 * Tiered Confidence Engine for EVA Internal Strategic Auditor
 *
 * Classifies findings as high/medium confidence based on data point count.
 * Handles graduation (medium → high after 2+ consecutive weeks),
 * hard caps (max 5 high-confidence per domain per week), and
 * minimum data point thresholds (≥3 required).
 */

import { jaccard } from '../../sourcing-engine/router.js';
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

export const MIN_DATA_POINTS = 3;
export const MAX_HIGH_PER_DOMAIN = 5;
export const GRADUATION_WEEKS = 2;
const GAP_RESET_DAYS = 10;
// FR-3: a past finding only counts toward graduation if its title is genuinely similar
// to the candidate's, not merely in the same domain/detected_by. 0.3 is permissive
// enough to tolerate wording variance across weekly re-runs of the same analyzer while
// still rejecting two unrelated findings that happen to share a domain.
const GRADUATION_TITLE_SIMILARITY_THRESHOLD = 0.3;

/**
 * Classify a raw finding into a confidence tier.
 * @param {object} finding - { title, description, dataPoints, domain }
 * @returns {{ tier: 'high'|'medium', confidenceScore: number }}
 */
function classifyFinding(finding) {
  const dp = finding.dataPoints || 0;
  if (dp < MIN_DATA_POINTS) return null; // filtered out

  // Score based on data points (3 = 0.50, 5+ = 0.80+)
  const baseScore = Math.min(0.50 + (dp - MIN_DATA_POINTS) * 0.10, 0.95);
  const tier = baseScore >= 0.70 ? 'high' : 'medium';

  return { tier, confidenceScore: Math.round(baseScore * 100) / 100 };
}

/**
 * Filter findings below minimum data point threshold.
 * @param {Array} findings - Raw findings array
 * @returns {Array} Findings with ≥ MIN_DATA_POINTS
 */
function filterByMinDataPoints(findings) {
  return findings.filter(f => (f.dataPoints || 0) >= MIN_DATA_POINTS);
}

/**
 * Check graduation eligibility by querying historical findings.
 * A medium finding graduates to high if it appeared in 2+ consecutive weeks.
 *
 * @param {object} supabase - Supabase client
 * @param {Array} currentFindings - Current week's classified findings
 * @returns {Array} Findings with graduation applied
 */
async function applyGraduation(supabase, currentFindings) {
  const graduated = [];

  for (const finding of currentFindings) {
    if (finding.tier === 'high') {
      graduated.push(finding);
      continue;
    }

    // Check for similar past findings in last GRADUATION_WEEKS + 1 weeks
    const lookbackDays = (GRADUATION_WEEKS + 1) * 7 + GAP_RESET_DAYS;
    const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().split('T')[0];

    // Paginated (FR-6 batch 7): a capped read would silently truncate the graduation
    // lookback corpus. Page errors degrade to [] — same effect as the prior
    // destructure-without-error-check (finding graduates as if no history).
    const pastFindings = await fetchAllPaginated(() => supabase
      .from('eva_consultant_recommendations')
      .select('id, recommendation_date, title, application_domain')
      .eq('application_domain', finding.domain)
      .eq('detected_by', 'consultant-analysis-round.mjs')
      .gte('recommendation_date', cutoff)
      .order('recommendation_date', { ascending: false })
      .order('id', { ascending: true })).catch(() => []);

    if (!pastFindings || pastFindings.length === 0) {
      graduated.push(finding);
      continue;
    }

    // FR-3: the query above filters by domain + detected_by only -- title was selected
    // but never compared, so ANY past finding in the domain counted toward graduation
    // regardless of content. Filter to genuinely title-similar findings (via the
    // existing lib/sourcing-engine/router.js jaccard(), reused per TR-1) before
    // counting consecutive weeks.
    const similarPastFindings = pastFindings.filter(
      (p) => jaccard(p.title, finding.title) >= GRADUATION_TITLE_SIMILARITY_THRESHOLD
    );

    if (similarPastFindings.length === 0) {
      graduated.push(finding);
      continue;
    }

    // Count consecutive weeks with similar findings (by domain + similar title)
    const weekDates = [...new Set(similarPastFindings.map(p => p.recommendation_date))].sort().reverse();
    let consecutiveWeeks = 0;
    let lastDate = null;

    for (const dateStr of weekDates) {
      const date = new Date(dateStr);
      if (lastDate) {
        const gapDays = (lastDate.getTime() - date.getTime()) / 86400000;
        if (gapDays > GAP_RESET_DAYS) break; // gap too large, reset
      }
      consecutiveWeeks++;
      lastDate = date;
    }

    if (consecutiveWeeks >= GRADUATION_WEEKS) {
      finding.tier = 'high';
      finding.confidenceScore = Math.min(finding.confidenceScore + 0.15, 0.95);
      finding.graduated = true;
      finding.graduationDate = new Date().toISOString();
    }

    graduated.push(finding);
  }

  return graduated;
}

/**
 * Apply hard cap: max MAX_HIGH_PER_DOMAIN high-confidence findings per domain.
 * Keeps the highest-scoring findings.
 *
 * @param {Array} findings - Classified (and graduated) findings
 * @returns {Array} Capped findings
 */
function applyHardCap(findings) {
  const byDomain = {};
  for (const f of findings) {
    const key = f.domain;
    if (!byDomain[key]) byDomain[key] = [];
    byDomain[key].push(f);
  }

  const capped = [];
  for (const [domain, domainFindings] of Object.entries(byDomain)) {
    const highFindings = domainFindings
      .filter(f => f.tier === 'high')
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
    const mediumFindings = domainFindings.filter(f => f.tier === 'medium');

    // Cap high findings
    const keptHigh = highFindings.slice(0, MAX_HIGH_PER_DOMAIN);
    capped.push(...keptHigh, ...mediumFindings);
  }

  return capped;
}

/**
 * Full confidence pipeline: filter → classify → graduate → cap.
 *
 * @param {object} supabase - Supabase client
 * @param {Array} rawFindings - Array of { title, description, dataPoints, domain, ... }
 * @returns {Array} Processed findings ready for DB insert
 */
async function processFindings(supabase, rawFindings) {
  // Step 1: Filter by minimum data points
  const filtered = filterByMinDataPoints(rawFindings);

  // Step 2: Classify each finding
  const classified = [];
  for (const finding of filtered) {
    const result = classifyFinding(finding);
    if (result) {
      classified.push({ ...finding, ...result });
    }
  }

  // Step 3: Apply graduation (medium → high for persistent findings)
  const graduated = await applyGraduation(supabase, classified);

  // Step 4: Apply hard cap per domain
  const capped = applyHardCap(graduated);

  return capped;
}

export {
  classifyFinding,
  filterByMinDataPoints,
  applyGraduation,
  applyHardCap,
  processFindings,
};
