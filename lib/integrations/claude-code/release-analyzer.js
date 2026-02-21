/**
 * Claude Code Release Analyzer
 *
 * Assesses release relevance to EHG workflows, produces structured
 * analysis with impact areas and recommendations, and records a
 * brainstorm_sessions entry for audit trail.
 *
 * Pattern: lib/integrations/evaluation-bridge.js (classification step)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const AUTO_SKIP_THRESHOLD = parseFloat(process.env.RELEASE_AUTO_SKIP_THRESHOLD || '0.3');

// Keywords mapped to EHG workflow areas
const IMPACT_KEYWORDS = {
  'sub-agent': ['sub-agent', 'subagent', 'agent', 'spawn', 'task tool', 'parallel'],
  'automation': ['hook', 'auto', 'script', 'cli', 'command', 'pipeline', 'workflow'],
  'memory': ['memory', 'context', 'compact', 'CLAUDE.md', 'session', 'persist'],
  'performance': ['performance', 'speed', 'fast', 'latency', 'token', 'cache', 'streaming'],
  'tools': ['tool', 'bash', 'read', 'write', 'edit', 'glob', 'grep', 'mcp'],
  'git': ['git', 'commit', 'branch', 'pr', 'pull request', 'worktree', 'diff'],
  'security': ['security', 'permission', 'sandbox', 'trust', 'auth'],
  'ide': ['vscode', 'jetbrains', 'ide', 'extension', 'editor'],
  'api': ['api', 'model', 'claude', 'opus', 'sonnet', 'haiku', 'anthropic']
};

/**
 * Create a Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Analyze a release's relevance to EHG workflows
 * @param {Object} intake - eva_claude_code_intake row
 * @returns {Object} Analysis result
 */
function analyzeRelevance(intake) {
  const text = `${intake.title || ''} ${intake.description || ''}`.toLowerCase();
  const matchedAreas = {};
  let totalHits = 0;

  for (const [area, keywords] of Object.entries(IMPACT_KEYWORDS)) {
    const hits = keywords.filter(kw => text.includes(kw)).length;
    if (hits > 0) {
      matchedAreas[area] = hits;
      totalHits += hits;
    }
  }

  // Relevance score: normalize keyword hits (0-1), capped at 1
  const relevanceScore = Math.min(1, totalHits / 8);

  // Extract workflow improvements from release notes
  const improvements = extractImprovements(intake.description || '', matchedAreas);

  // Recommendation based on relevance
  let recommendation;
  if (relevanceScore >= 0.7) recommendation = 'adopt';
  else if (relevanceScore >= 0.5) recommendation = 'evaluate';
  else if (relevanceScore >= AUTO_SKIP_THRESHOLD) recommendation = 'monitor';
  else recommendation = 'skip';

  const impactAreas = Object.keys(matchedAreas);

  const summary = impactAreas.length > 0
    ? `Release ${intake.tag_name} impacts: ${impactAreas.join(', ')}. Recommendation: ${recommendation}.`
    : `Release ${intake.tag_name} has minimal relevance to current EHG workflows.`;

  return {
    relevanceScore: Math.round(relevanceScore * 100) / 100,
    impactAreas,
    improvements,
    recommendation,
    summary
  };
}

/**
 * Extract concrete workflow improvements from release notes
 * @param {string} body - Release notes markdown
 * @param {Object} matchedAreas - Areas that matched
 * @returns {Array<Object>} Improvement objects
 */
function extractImprovements(body, matchedAreas) {
  const improvements = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.replace(/^[\s*\-#]+/, '').trim();
    if (!trimmed || trimmed.length < 10) continue;

    // Check if this line relates to any matched area
    const lower = trimmed.toLowerCase();
    for (const [area, keywords] of Object.entries(IMPACT_KEYWORDS)) {
      if (matchedAreas[area] && keywords.some(kw => lower.includes(kw))) {
        improvements.push({
          area,
          description: trimmed.slice(0, 200),
          source: 'release_notes'
        });
        break;
      }
    }
  }

  return improvements.slice(0, 10); // Cap at 10 improvements
}

/**
 * Record a brainstorm session for the analysis
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} intake - Intake row
 * @param {Object} analysis - Analysis result
 * @returns {Promise<string|null>} Session ID or null
 */
async function recordBrainstormSession(supabase, intake, analysis) {
  const { data, error } = await supabase
    .from('brainstorm_sessions')
    .insert({
      domain: 'protocol',
      topic: `Claude Code ${intake.tag_name} release assessment`,
      mode: 'structured',
      stage: 'analysis',
      outcome_type: analysis.recommendation === 'skip' ? 'no_action' : 'enhancement_identified',
      session_quality_score: Math.round(analysis.relevanceScore * 100),
      crystallization_score: analysis.relevanceScore,
      retrospective_status: 'pending',
      metadata: {
        source: 'claude_code_release_monitor',
        tag_name: intake.tag_name,
        github_release_id: intake.github_release_id,
        impact_areas: analysis.impactAreas,
        recommendation: analysis.recommendation
      }
    })
    .select('id')
    .single();

  if (error) {
    console.error(`  Failed to record brainstorm session: ${error.message}`);
    return null;
  }
  return data.id;
}

/**
 * Analyze all pending intake rows
 * @param {Object} options
 * @param {boolean} [options.verbose=false]
 * @param {number} [options.limit]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzePendingReleases(options = {}) {
  const { verbose = false, limit } = options;
  const supabase = options.supabase || createSupabaseClient();

  let query = supabase
    .from('eva_claude_code_intake')
    .select('*')
    .eq('status', 'pending')
    .order('published_at', { ascending: false });

  if (limit) query = query.limit(limit);

  const { data: pendingRows, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch pending releases: ${error.message}`);
  }

  const results = {
    analyzed: 0,
    skipped: 0,
    evaluating: 0,
    errors: [],
    items: []
  };

  for (const intake of pendingRows || []) {
    try {
      const analysis = analyzeRelevance(intake);

      if (verbose) {
        console.log(`  ${intake.tag_name}: relevance=${analysis.relevanceScore}, rec=${analysis.recommendation}`);
      }

      // Record brainstorm session
      const sessionId = await recordBrainstormSession(supabase, intake, analysis);

      // Auto-skip low-relevance releases
      if (analysis.relevanceScore < AUTO_SKIP_THRESHOLD) {
        await supabase
          .from('eva_claude_code_intake')
          .update({
            status: 'skipped',
            relevance_score: analysis.relevanceScore,
            impact_areas: analysis.impactAreas,
            analysis_summary: analysis.summary,
            workflow_improvements: analysis.improvements,
            recommendation: analysis.recommendation,
            brainstorm_session_id: sessionId
          })
          .eq('id', intake.id);

        results.skipped++;
        results.items.push({ id: intake.id, tag: intake.tag_name, status: 'skipped', relevance: analysis.relevanceScore });
        continue;
      }

      // Update intake with analysis, move to evaluating
      await supabase
        .from('eva_claude_code_intake')
        .update({
          status: 'evaluating',
          relevance_score: analysis.relevanceScore,
          impact_areas: analysis.impactAreas,
          analysis_summary: analysis.summary,
          workflow_improvements: analysis.improvements,
          recommendation: analysis.recommendation,
          brainstorm_session_id: sessionId
        })
        .eq('id', intake.id);

      results.evaluating++;
      results.items.push({ id: intake.id, tag: intake.tag_name, status: 'evaluating', relevance: analysis.relevanceScore });
    } catch (err) {
      results.errors.push({ id: intake.id, tag: intake.tag_name, error: err.message });
    }

    results.analyzed++;
  }

  return results;
}

export { analyzeRelevance, IMPACT_KEYWORDS, AUTO_SKIP_THRESHOLD };
export default { analyzePendingReleases };
