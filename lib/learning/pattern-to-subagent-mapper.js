#!/usr/bin/env node
/**
 * Pattern to Sub-Agent Mapper
 * LEO Protocol v4.3.4 Enhancement
 *
 * PURPOSE:
 * Connects learned patterns from retrospectives to sub-agent selection.
 * When patterns are detected that historically led to issues, this module
 * ensures the relevant sub-agents are REQUIRED to run.
 *
 * EXAMPLE:
 * If pattern "N+1 queries in API endpoints" has been detected 5 times,
 * any SD with "API" or "endpoint" in scope will REQUIRE the PERFORMANCE sub-agent.
 *
 * Created: 2025-12-18
 * Part of LEO Protocol Quality Intelligence System
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Minimum pattern occurrences before it influences sub-agent selection
  minOccurrencesForTrigger: 2,

  // How recent a pattern must be to influence selection (days)
  recencyWindowDays: 90,

  // Pattern category to sub-agent mapping
  categoryToSubAgent: {
    'security': ['SECURITY'],
    'performance': ['PERFORMANCE'],
    'database': ['DATABASE', 'SECURITY'],
    'testing': ['TESTING'],
    'ui': ['DESIGN'],
    'api': ['API', 'SECURITY', 'PERFORMANCE'],
    'documentation': ['DOCMON'],
    'deployment': ['GITHUB'],
    'build': ['GITHUB', 'DEPENDENCY'],
    'ci_cd': ['GITHUB'],
    'code_structure': ['VALIDATION'],
    'protocol': ['VALIDATION'],
    'requirements': ['STORIES']
  },

  // Severity multipliers for occurrence threshold
  severityMultipliers: {
    'critical': 1,    // 1 occurrence triggers
    'high': 2,        // 2 occurrences trigger
    'medium': 3,      // 3 occurrences trigger
    'low': 5          // 5 occurrences trigger
  }
};

// ============================================================================
// Database Client
// ============================================================================

let supabaseClient = null;

async function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabaseClient;
}

// ============================================================================
// Pattern Analysis Functions
// ============================================================================

/**
 * Get active patterns that should influence sub-agent selection
 *
 * @returns {Promise<Array>} Patterns with their trigger implications
 */
export async function getActivePatterns() {
  const supabase = await getSupabaseClient();

  const recencyDate = new Date();
  recencyDate.setDate(recencyDate.getDate() - CONFIG.recencyWindowDays);

  const { data: patterns, error } = await supabase
    .from('issue_patterns')
    .select('*')
    .eq('status', 'active')
    .gte('updated_at', recencyDate.toISOString())
    .order('occurrence_count', { ascending: false });

  if (error) {
    console.error('Failed to load active patterns:', error.message);
    return [];
  }

  return patterns || [];
}

/**
 * Analyze SD scope against known patterns to determine required sub-agents
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Object>} Pattern-based sub-agent requirements
 */
export async function analyzeSDAgainstPatterns(sd) {
  console.log('\n📚 Analyzing SD against learned patterns...');

  const patterns = await getActivePatterns();

  if (patterns.length === 0) {
    console.log('   No active patterns found');
    return { requiredAgents: [], matchedPatterns: [], reasoning: [] };
  }

  const sdContent = `${sd.title || ''} ${sd.description || ''} ${sd.scope || ''}`.toLowerCase();
  const requiredAgents = new Set();
  const matchedPatterns = [];
  const reasoning = [];

  for (const pattern of patterns) {
    // Check if SD content matches pattern keywords
    const patternKeywords = extractKeywords(pattern);
    const matchScore = calculateMatchScore(sdContent, patternKeywords);

    if (matchScore > 0.3) {  // 30% keyword match threshold
      // Determine if occurrence count meets severity threshold
      const threshold = CONFIG.severityMultipliers[pattern.severity] || CONFIG.minOccurrencesForTrigger;

      if (pattern.occurrence_count >= threshold) {
        // This pattern should trigger sub-agent requirements
        const agentsToRequire = CONFIG.categoryToSubAgent[pattern.category] || [];

        agentsToRequire.forEach(agent => requiredAgents.add(agent));

        matchedPatterns.push({
          patternId: pattern.pattern_id,
          category: pattern.category,
          severity: pattern.severity,
          occurrences: pattern.occurrence_count,
          matchScore: Math.round(matchScore * 100)
        });

        reasoning.push(
          `Pattern "${pattern.pattern_id}" (${pattern.category}, ${pattern.severity}, ${pattern.occurrence_count} occurrences) ` +
          `matched with ${Math.round(matchScore * 100)}% confidence. Requiring: ${agentsToRequire.join(', ')}`
        );
      }
    }
  }

  console.log(`   Found ${matchedPatterns.length} relevant patterns`);
  console.log(`   Requiring ${requiredAgents.size} additional sub-agents: ${Array.from(requiredAgents).join(', ')}`);

  return {
    requiredAgents: Array.from(requiredAgents),
    matchedPatterns,
    reasoning
  };
}

/**
 * Extract keywords from a pattern for matching
 */
function extractKeywords(pattern) {
  const keywords = [];

  // From issue_summary
  if (pattern.issue_summary) {
    keywords.push(...pattern.issue_summary.toLowerCase().split(/\s+/));
  }

  // From trigger_keywords if available
  if (pattern.trigger_keywords && Array.isArray(pattern.trigger_keywords)) {
    keywords.push(...pattern.trigger_keywords.map(k => k.toLowerCase()));
  }

  // From category
  keywords.push(pattern.category.toLowerCase());

  // Filter out common words
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'after', 'before', 'when', 'whenever', 'where', 'wherever', 'whether', 'which', 'that', 'what', 'whatever', 'who', 'whom', 'whose', 'this', 'these', 'those']);

  return [...new Set(keywords.filter(k => k.length > 2 && !stopWords.has(k)))];
}

/**
 * Calculate match score between SD content and pattern keywords
 */
function calculateMatchScore(sdContent, keywords) {
  if (keywords.length === 0) return 0;

  let matches = 0;
  for (const keyword of keywords) {
    if (sdContent.includes(keyword)) {
      matches++;
    }
  }

  return matches / keywords.length;
}

/**
 * Get sub-agents required based on learned patterns
 * Returns in format compatible with existing selection system
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Array>} List of required sub-agent recommendations
 */
export async function getPatternBasedSubAgents(sd) {
  const analysis = await analyzeSDAgainstPatterns(sd);

  return analysis.requiredAgents.map(code => ({
    code,
    confidence: 80,  // High confidence for pattern-based requirements
    reason: `Required by learned patterns: ${analysis.matchedPatterns.map(p => p.patternId).join(', ')}`,
    source: 'pattern-learning',
    patterns: analysis.matchedPatterns.filter(p =>
      (CONFIG.categoryToSubAgent[p.category] || []).includes(code)
    )
  }));
}

/**
 * Record that a pattern influenced sub-agent selection
 * This helps track the effectiveness of pattern-based selection
 */
export async function recordPatternInfluence(sdId, patternId, subAgentCode, result) {
  const supabase = await getSupabaseClient();

  try {
    await supabase
      .from('pattern_influence_log')
      .insert({
        sd_id: sdId,
        pattern_id: patternId,
        sub_agent_code: subAgentCode,
        influence_result: result,
        created_at: new Date().toISOString()
      });
  } catch (err) {
    // Table might not exist - non-fatal
    console.log(`   ℹ️ Pattern influence logging skipped: ${err.message}`);
  }
}

/**
 * Update pattern with new learning from SD outcome
 * Called after SD completion to reinforce or weaken pattern associations
 */
export async function updatePatternFromOutcome(sdId, outcome) {
  const supabase = await getSupabaseClient();

  // Get the patterns that influenced this SD
  const { data: influences } = await supabase
    .from('pattern_influence_log')
    .select('pattern_id')
    .eq('sd_id', sdId);

  if (!influences || influences.length === 0) return;

  for (const influence of influences) {
    // Update pattern trend based on outcome
    const trend = outcome.success ? 'decreasing' : 'increasing';

    await supabase
      .from('issue_patterns')
      .update({
        trend,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('pattern_id', influence.pattern_id);
  }
}

// ============================================================================
// CLI for Testing
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const testSd = {
    id: 'test-id',
    sd_key: 'SD-TEST-001',
    title: process.argv[2] || 'Add API endpoint for decisions',
    description: 'Create REST API with database queries',
    scope: 'Implement /api/decisions endpoint with filtering'
  };

  console.log('\n📚 Testing Pattern to Sub-Agent Mapper');
  console.log('=' .repeat(60));
  console.log(`SD: ${testSd.title}`);
  console.log('=' .repeat(60));

  analyzeSDAgainstPatterns(testSd)
    .then(result => {
      console.log('\n📊 Analysis Results:');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('Analysis failed:', error);
      process.exit(1);
    });
}
