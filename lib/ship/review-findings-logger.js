/**
 * Review Findings Logger for /ship Step 5.5
 *
 * Persists review gate findings to ship_review_findings table for audit trail.
 * Every PR gets a record: tier, score, finding count, categories, and SD context.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Log review findings after the review gate runs.
 *
 * @param {Object} params
 * @param {number} params.prNumber - GitHub PR number
 * @param {string} params.reviewTier - 'light' | 'standard' | 'deep'
 * @param {number} params.riskScore - Composite risk score (0-1)
 * @param {Array}  params.findings - Array of finding objects from review
 * @param {string} params.verdict - 'pass' | 'block'
 * @param {string} [params.sdKey] - SD key if available
 * @param {string} [params.branch] - Branch name
 * @param {boolean} [params.multiAgent] - Whether multi-agent review was used
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function logFindings({
  prNumber, reviewTier, riskScore, findings = [], verdict,
  sdKey = null, branch = null, multiAgent = false
}) {
  const supabase = getSupabase();

  const findingCategories = {};
  for (const f of findings) {
    const type = (f.type || 'UNKNOWN').toUpperCase();
    findingCategories[type] = (findingCategories[type] || 0) + 1;
  }

  const { data, error } = await supabase
    .from('ship_review_findings')
    .insert({
      pr_number: prNumber,
      review_tier: reviewTier,
      risk_score: riskScore,
      finding_count: findings.length,
      finding_categories: findingCategories,
      verdict,
      sd_key: sdKey,
      branch,
      multi_agent: multiAgent,
      reviewed_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, id: data.id };
}

/**
 * Get review history for analysis and self-tuning.
 *
 * @param {number} [days=90] - Number of days to look back
 * @returns {Promise<{ tierDistribution: Object, findingPatterns: Object, totalReviews: number, records: Array }>}
 */
export async function getReviewHistory(days = 90) {
  const supabase = getSupabase();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('ship_review_findings')
    .select('*')
    .gte('reviewed_at', since)
    .order('reviewed_at', { ascending: false });

  if (error || !data) {
    return { tierDistribution: {}, findingPatterns: {}, totalReviews: 0, records: [] };
  }

  const tierDistribution = { light: 0, standard: 0, deep: 0 };
  const findingPatterns = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  let blockCount = 0;

  for (const record of data) {
    tierDistribution[record.review_tier] = (tierDistribution[record.review_tier] || 0) + 1;
    if (record.finding_categories) {
      for (const [type, count] of Object.entries(record.finding_categories)) {
        findingPatterns[type] = (findingPatterns[type] || 0) + count;
      }
    }
    if (record.verdict === 'block') blockCount++;
  }

  return {
    tierDistribution,
    findingPatterns,
    totalReviews: data.length,
    blockRate: data.length > 0 ? Math.round((blockCount / data.length) * 100) : 0,
    records: data
  };
}
