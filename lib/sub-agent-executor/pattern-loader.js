/**
 * Pattern Loader
 * Loads relevant issue patterns for sub-agents based on category mapping
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { getSupabaseClient } from './supabase-client.js';
import { SUB_AGENT_CATEGORY_MAPPING } from './phase-model-config.js';

/**
 * Load relevant issue patterns for a sub-agent based on category mapping
 * LEO Protocol v4.3.2 Enhancement: Proactive pattern injection
 * @param {string} code - Sub-agent code
 * @returns {Promise<Array>} Relevant patterns with proven solutions
 */
export async function loadRelevantPatterns(code) {
  const categories = SUB_AGENT_CATEGORY_MAPPING[code] || [];

  if (categories.length === 0) {
    console.log(`   Info: No category mapping for ${code}, skipping pattern injection`);
    return [];
  }

  console.log(`   Searching: Loading patterns for categories: ${categories.join(', ')}`);

  const supabase = await getSupabaseClient();

  try {
    // Query patterns that match any of the mapped categories
    const { data: patterns, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend')
      .eq('status', 'active')
      .in('category', categories)
      .order('occurrence_count', { ascending: false })
      .limit(5);

    if (error) {
      console.warn(`   Warning: Failed to load patterns: ${error.message}`);
      return [];
    }

    if (!patterns || patterns.length === 0) {
      console.log(`   Info: No active patterns found for ${code}`);
      return [];
    }

    console.log(`   Success: Loaded ${patterns.length} relevant patterns`);
    return patterns;

  } catch (err) {
    console.warn(`   Warning: Pattern loading error: ${err.message}`);
    return [];
  }
}
