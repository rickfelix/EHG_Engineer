/**
 * Skill Auditor
 *
 * Orchestrates skill parsing and rubric scoring, then persists results
 * to the skill_assessment_scores table in Supabase.
 *
 * @module scripts/modules/skill-assessment/skill-auditor
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { parseAllSkills } from './skill-parser.js';
import { scoreDescription } from './rubric-dimensions.js';

dotenv.config();

/**
 * @typedef {Object} AuditResult
 * @property {string} skillName - Skill name
 * @property {string} filename - Original filename
 * @property {string|null} description - Description text
 * @property {boolean} hasDescription
 * @property {number} totalScore - Weighted total 0-10
 * @property {string} healthStatus
 * @property {Object[]} dimensions - Per-dimension scores
 */

/**
 * Run a full audit of all skills.
 *
 * @param {string} [skillsDir] - Path to skills directory
 * @returns {AuditResult[]}
 */
export function auditAllSkills(skillsDir) {
  const skills = parseAllSkills(skillsDir);

  // Collect all descriptions for conflict avoidance scoring
  const allDescriptions = skills
    .filter(s => s.description)
    .map(s => s.description);

  return skills.map(skill => {
    const otherDescriptions = allDescriptions.filter(d => d !== skill.description);
    const rubric = scoreDescription(skill.description, otherDescriptions);

    return {
      skillName: skill.name,
      filename: skill.filename,
      description: skill.description,
      hasDescription: skill.hasDescription,
      totalScore: rubric.totalScore,
      healthStatus: rubric.healthStatus,
      dimensions: rubric.dimensions,
    };
  });
}

/**
 * Persist audit results to Supabase skill_assessment_scores table.
 *
 * @param {AuditResult[]} results - Audit results to persist
 * @param {Object} options
 * @param {boolean} [options.isBaseline=false] - Mark these scores as baseline
 * @param {string} [options.runId] - Unique run identifier
 * @returns {Promise<{inserted: number, errors: string[]}>}
 */
export async function persistAuditResults(results, options = {}) {
  const { isBaseline = false, runId = `audit-${Date.now()}` } = options;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { inserted: 0, errors: ['Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'] };
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const errors = [];
  let inserted = 0;

  // Map to existing table schema (created by prior session)
  const rows = results.map(r => ({
    skill_name: r.skillName,
    skill_file: r.filename,
    version: new Date().toISOString().slice(0, 10),
    description_text: r.description,
    rubric_scores: Object.fromEntries(
      r.dimensions.map(d => [d.dimension, d.rawScore])
    ),
    total_score: r.totalScore,
    is_baseline: isBaseline,
    assessed_by: runId,
  }));

  const { data, error } = await sb.from('skill_assessment_scores').insert(rows).select('id');

  if (error) {
    errors.push(`Insert error: ${error.message}`);
  } else {
    inserted = data?.length || 0;
  }

  return { inserted, errors };
}

/**
 * Get baseline scores for comparison.
 *
 * @returns {Promise<Map<string, number>>} Map of skillName → baselineScore
 */
export async function getBaselineScores() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return new Map();

  const sb = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await sb
    .from('skill_assessment_scores')
    .select('skill_name, total_score')
    .eq('is_baseline', true)
    .order('assessed_at', { ascending: false });

  if (error || !data) return new Map();

  // Use the most recent baseline score per skill
  const map = new Map();
  for (const row of data) {
    if (!map.has(row.skill_name)) {
      map.set(row.skill_name, row.total_score);
    }
  }
  return map;
}
