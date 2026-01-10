/**
 * LearningContextBuilder
 *
 * Queries and aggregates learning sources from database:
 * - retrospectives (recent lessons)
 * - issue_patterns (recurring issues with proven solutions)
 * - protocol_improvement_queue (pending improvements)
 *
 * Returns top 5 items per category with confidence scores.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TOP_N = 5;

/**
 * Query recent retrospectives for lessons learned
 */
async function getRecentLessons(sdId = null, limit = TOP_N) {
  let query = supabase
    .from('retrospectives')
    .select('id, sd_id, key_learnings, quality_score, created_at')
    .order('quality_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit * 2); // Get more to filter

  if (sdId) {
    // If SD provided, prioritize related retrospectives
    query = query.or(`sd_id.eq.${sdId}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error querying retrospectives:', error.message);
    return [];
  }

  // Extract lessons from retrospectives
  const lessons = [];
  for (const retro of (data || [])) {
    const learnings = retro.key_learnings || [];
    for (const learning of learnings.slice(0, 2)) { // Max 2 per retro
      if (typeof learning === 'string' && learning.length > 10) {
        lessons.push({
          id: `LESSON-${retro.id}-${lessons.length}`,
          source_type: 'retrospective',
          source_id: retro.id,
          sd_id: retro.sd_id,
          content: learning,
          confidence: retro.quality_score || 75,
          created_at: retro.created_at
        });
      }
    }
  }

  return lessons.slice(0, limit);
}

/**
 * Query issue patterns with decay-adjusted confidence
 * Uses v_patterns_with_decay view for recency-weighted ranking
 */
async function getIssuePatterns(limit = TOP_N) {
  // Try decay view first, fall back to base table
  let { data, error } = await supabase
    .from('v_patterns_with_decay')
    .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend, days_since_update, decay_adjusted_confidence, recency_status')
    .order('decay_adjusted_confidence', { ascending: false })
    .limit(limit);

  // Fallback to base table if view doesn't exist yet
  if (error && (error.message.includes('does not exist') || error.message.includes('schema cache'))) {
    console.log('Note: Using base table (run migration for decay view)');
    const fallback = await supabase
      .from('issue_patterns')
      .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend, updated_at, created_at')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .limit(limit);
    data = fallback.data;
    error = fallback.error;

    // Calculate decay manually for fallback
    if (data) {
      data = data.map(p => {
        const daysSince = Math.floor((Date.now() - new Date(p.updated_at || p.created_at).getTime()) / (1000 * 60 * 60 * 24));
        const baseConfidence = 50 + (p.occurrence_count * 5);
        const decayFactor = Math.exp(-0.023 * daysSince);
        return {
          ...p,
          days_since_update: daysSince,
          decay_adjusted_confidence: Math.round(baseConfidence * decayFactor),
          recency_status: daysSince > 60 ? 'stale' : daysSince > 30 ? 'aging' : 'fresh'
        };
      });
    }
  }

  if (error) {
    console.error('Error querying issue_patterns:', error.message);
    return [];
  }

  return (data || []).map(pattern => ({
    id: pattern.pattern_id,
    source_type: 'issue_pattern',
    source_id: pattern.pattern_id,
    category: pattern.category,
    severity: pattern.severity,
    content: pattern.issue_summary,
    occurrence_count: pattern.occurrence_count,
    proven_solutions: pattern.proven_solutions || [],
    prevention_checklist: pattern.prevention_checklist || [],
    trend: pattern.trend,
    days_since_update: pattern.days_since_update || 0,
    recency_status: pattern.recency_status || 'fresh',
    // Use decay-adjusted confidence if available, otherwise calculate
    confidence: pattern.decay_adjusted_confidence || Math.min(100, 50 + (pattern.occurrence_count * 5)),
    confidence_reason: pattern.recency_status === 'stale' ? 'reduced due to age (60+ days)' :
                       pattern.recency_status === 'aging' ? 'slightly reduced due to age (30+ days)' : null
  }));
}

/**
 * Find similar patterns using fuzzy matching
 * Uses search_issue_patterns() function if available
 */
async function findSimilarPatterns(patterns) {
  const similarityMap = {};
  const SIMILARITY_THRESHOLD = 0.7;

  for (const pattern of patterns) {
    // Use RPC call to search_issue_patterns function
    const { data, error } = await supabase.rpc('search_issue_patterns', {
      query_text: pattern.content,
      similarity_threshold: SIMILARITY_THRESHOLD,
      result_limit: 3
    });

    if (!error && data && data.length > 1) {
      // Filter out self and already-shown patterns
      const similar = data
        .filter(d => d.pattern_id !== pattern.id)
        .filter(d => !patterns.some(p => p.id === d.pattern_id))
        .map(d => ({
          pattern_id: d.pattern_id,
          similarity: Math.round(d.similarity_score * 100)
        }));

      if (similar.length > 0) {
        similarityMap[pattern.id] = similar;
      }
    }
  }

  return similarityMap;
}

/**
 * Query pending protocol improvements sorted by evidence count
 */
async function getPendingImprovements(limit = TOP_N) {
  const { data, error } = await supabase
    .from('protocol_improvement_queue')
    .select('id, improvement_type, description, evidence_count, target_table, target_operation, payload, status, source_retro_id')
    .eq('status', 'PENDING')
    .order('evidence_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error querying protocol_improvement_queue:', error.message);
    return [];
  }

  return (data || []).map(imp => ({
    id: imp.id,
    source_type: 'improvement',
    source_id: imp.id,
    improvement_type: imp.improvement_type,
    title: imp.description?.substring(0, 50) + '...' || 'Untitled improvement',
    content: imp.description,
    evidence_count: imp.evidence_count || 1,
    source_retro_id: imp.source_retro_id,
    target_table: imp.target_table,
    target_operation: imp.target_operation,
    payload: imp.payload,
    confidence: Math.min(100, 60 + ((imp.evidence_count || 1) * 10))
  }));
}

/**
 * Build complete learning context with intelligence enhancements
 */
export async function buildLearningContext(sdId = null) {
  console.log('Building learning context...');

  const [lessons, patterns, improvements] = await Promise.all([
    getRecentLessons(sdId, TOP_N),
    getIssuePatterns(TOP_N),
    getPendingImprovements(TOP_N)
  ]);

  // Find similar patterns (duplicate detection)
  let similarPatterns = {};
  try {
    similarPatterns = await findSimilarPatterns(patterns);
  } catch (_e) {
    // Similarity search is optional - continue without it
    console.log('Note: Similarity search unavailable');
  }

  // Identify patterns that may be ready for resolution (decreasing trend)
  const resolutionCandidates = patterns
    .filter(p => p.trend === 'decreasing' || p.recency_status === 'stale')
    .map(p => p.id);

  const context = {
    lessons,
    patterns,
    improvements,
    // Intelligence metadata
    intelligence: {
      similar_patterns: similarPatterns,
      resolution_candidates: resolutionCandidates,
      stale_count: patterns.filter(p => p.recency_status === 'stale').length,
      aging_count: patterns.filter(p => p.recency_status === 'aging').length
    },
    summary: {
      total_lessons: lessons.length,
      total_patterns: patterns.length,
      total_improvements: improvements.length,
      generated_at: new Date().toISOString()
    }
  };

  console.log(`Found: ${lessons.length} lessons, ${patterns.length} patterns, ${improvements.length} improvements`);

  if (resolutionCandidates.length > 0) {
    console.log(`  → ${resolutionCandidates.length} pattern(s) may be ready for resolution`);
  }

  return context;
}

/**
 * Format context for display
 */
export function formatContextForDisplay(context) {
  const lines = [];

  lines.push('\n## Patterns (from issue_patterns)');
  lines.push('High-occurrence issues with proven solutions:\n');
  for (const p of context.patterns) {
    lines.push(`**[${p.id}]** ${p.content}`);
    lines.push(`  - Category: ${p.category} | Severity: ${p.severity} | Occurrences: ${p.occurrence_count}`);
    if (p.proven_solutions?.length > 0) {
      lines.push(`  - Proven solution: ${p.proven_solutions[0]?.solution || 'See details'}`);
    }
    lines.push('');
  }

  lines.push('\n## Lessons (from retrospectives)');
  lines.push('Recent learnings from completed SDs:\n');
  for (const l of context.lessons) {
    lines.push(`**[${l.id}]** ${l.content}`);
    lines.push(`  - Source SD: ${l.sd_id || 'N/A'} | Confidence: ${l.confidence}%`);
    lines.push('');
  }

  lines.push('\n## Improvements (from protocol_improvement_queue)');
  lines.push('Pending protocol changes:\n');
  for (const i of context.improvements) {
    lines.push(`**[${i.id}]** ${i.title}`);
    lines.push(`  - Type: ${i.improvement_type} | Evidence: ${i.evidence_count} | Target: ${i.target_table}`);
    lines.push(`  - ${i.content}`);
    lines.push('');
  }

  return lines.join('\n');
}

// CLI interface
if (process.argv[1].includes('context-builder')) {
  const sdId = process.argv.find(a => a.startsWith('--sd-id='))?.split('=')[1];

  buildLearningContext(sdId)
    .then(context => {
      console.log(formatContextForDisplay(context));
      console.log('\n---');
      console.log(JSON.stringify(context.summary, null, 2));
    })
    .catch(console.error);
}

export default { buildLearningContext, formatContextForDisplay };
