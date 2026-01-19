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

// Intelligent filtering thresholds
const FILTER_CONFIG = {
  MIN_OCCURRENCE_FOR_PATTERN: 3,    // Minimum occurrences to be considered a pattern (not incident)
  MIN_CONFIDENCE_THRESHOLD: 50,      // Minimum confidence % to surface
  STALE_DAYS_THRESHOLD: 60,          // Days after which declining patterns are filtered
  ACTIONABILITY_BONUS: 15,           // Bonus confidence for items with proven solutions
  SESSION_RECENCY_DAYS: 7,           // Prioritize learnings from last 7 days
};

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
 *
 * INTELLIGENT FILTERING (v2):
 * - Minimum occurrence threshold (3+) - incidents aren't patterns
 * - Minimum confidence threshold (50%)
 * - Auto-filter stale (60+ days) patterns with declining trend
 * - Actionability bonus for patterns with proven solutions
 */
async function getIssuePatterns(limit = TOP_N) {
  // Try decay view first, fall back to base table
  // Query more than needed to allow for filtering
  const queryLimit = limit * 3;

  let { data, error } = await supabase
    .from('v_patterns_with_decay')
    .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend, days_since_update, decay_adjusted_confidence, recency_status')
    .order('decay_adjusted_confidence', { ascending: false })
    .limit(queryLimit);

  // Fallback to base table if view doesn't exist yet
  if (error && (error.message.includes('does not exist') || error.message.includes('schema cache'))) {
    console.log('Note: Using base table (run migration for decay view)');
    const fallback = await supabase
      .from('issue_patterns')
      .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend, updated_at, created_at')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .limit(queryLimit);
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
    return { patterns: [], filtered: { lowOccurrence: 0, lowConfidence: 0, staleDecline: 0 } };
  }

  // Track what gets filtered out for transparency
  const filtered = { lowOccurrence: 0, lowConfidence: 0, staleDecline: 0, total: (data || []).length };

  const patterns = (data || [])
    .map(pattern => {
      // Calculate base confidence with actionability bonus
      let baseConfidence = pattern.decay_adjusted_confidence || Math.min(100, 50 + (pattern.occurrence_count * 5));

      // Actionability bonus: patterns with proven solutions are more valuable
      const hasProvenSolutions = pattern.proven_solutions?.length > 0;
      if (hasProvenSolutions) {
        baseConfidence = Math.min(100, baseConfidence + FILTER_CONFIG.ACTIONABILITY_BONUS);
      }

      return {
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
        confidence: baseConfidence,
        has_actionable_solution: hasProvenSolutions,
        confidence_reason: hasProvenSolutions ? 'boosted: has proven solutions' :
                           pattern.recency_status === 'stale' ? 'reduced: age (60+ days)' :
                           pattern.recency_status === 'aging' ? 'reduced: age (30+ days)' : null
      };
    })
    .filter(pattern => {
      // Filter 1: Minimum occurrences (incidents aren't patterns)
      if (pattern.occurrence_count < FILTER_CONFIG.MIN_OCCURRENCE_FOR_PATTERN) {
        filtered.lowOccurrence++;
        return false;
      }

      // Filter 2: Minimum confidence threshold
      if (pattern.confidence < FILTER_CONFIG.MIN_CONFIDENCE_THRESHOLD) {
        filtered.lowConfidence++;
        return false;
      }

      // Filter 3: Stale + declining = not worth surfacing
      if (pattern.recency_status === 'stale' && pattern.trend === 'decreasing') {
        filtered.staleDecline++;
        return false;
      }

      return true;
    })
    .slice(0, limit);

  return { patterns, filtered };
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
 * SD-QUALITY-INT-001: Query resolved feedback for learning patterns
 * Extracts learnings from resolved issues with high occurrence counts
 */
async function getResolvedFeedbackLearnings(limit = TOP_N) {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, title, description, type, error_type, priority, occurrence_count, resolution_notes, resolution_sd_id, created_at, updated_at')
    .in('status', ['resolved', 'shipped'])
    .not('resolution_notes', 'is', null)
    .order('occurrence_count', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit * 2); // Get more to filter

  if (error) {
    console.error('Error querying feedback for learnings:', error.message);
    return [];
  }

  // Transform resolved feedback into learning items
  const learnings = [];
  for (const feedback of (data || [])) {
    // Skip items without meaningful resolution notes
    if (!feedback.resolution_notes || feedback.resolution_notes.length < 20) {
      continue;
    }

    // Calculate confidence based on occurrence count and resolution completeness
    const baseConfidence = 50;
    const occurrenceBonus = Math.min(30, feedback.occurrence_count * 5);
    const resolutionBonus = feedback.resolution_sd_id ? 15 : 0;
    const confidence = Math.min(100, baseConfidence + occurrenceBonus + resolutionBonus);

    learnings.push({
      id: `FB-${feedback.id.substring(0, 8)}`,
      source_type: 'feedback',
      source_id: feedback.id,
      type: feedback.type,
      error_type: feedback.error_type,
      title: feedback.title,
      content: `${feedback.title}: ${feedback.resolution_notes}`,
      occurrence_count: feedback.occurrence_count || 1,
      resolution_sd_id: feedback.resolution_sd_id,
      priority: feedback.priority,
      confidence,
      created_at: feedback.created_at,
      resolved_at: feedback.updated_at
    });
  }

  return learnings.slice(0, limit);
}

/**
 * SD-QUALITY-INT-001: Get recurring error patterns from feedback table
 * Groups similar errors and identifies patterns
 */
async function getRecurringFeedbackPatterns(limit = TOP_N) {
  const { data, error } = await supabase
    .from('feedback')
    .select('id, title, error_type, priority, occurrence_count, status, created_at')
    .eq('type', 'issue')
    .gt('occurrence_count', 2) // Only patterns with multiple occurrences
    .order('occurrence_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error querying feedback patterns:', error.message);
    return [];
  }

  // Group by error type if available
  const byErrorType = {};
  for (const fb of (data || [])) {
    const key = fb.error_type || 'unknown';
    if (!byErrorType[key]) {
      byErrorType[key] = {
        error_type: key,
        items: [],
        total_occurrences: 0
      };
    }
    byErrorType[key].items.push(fb);
    byErrorType[key].total_occurrences += fb.occurrence_count || 1;
  }

  // Convert to array and sort by total occurrences
  return Object.values(byErrorType)
    .sort((a, b) => b.total_occurrences - a.total_occurrences)
    .slice(0, limit)
    .map(group => ({
      id: `FBP-${group.error_type.substring(0, 10)}`,
      source_type: 'feedback_pattern',
      error_type: group.error_type,
      content: `Recurring ${group.error_type} errors (${group.total_occurrences} total occurrences across ${group.items.length} issues)`,
      total_occurrences: group.total_occurrences,
      item_count: group.items.length,
      items: group.items.map(i => ({
        id: i.id,
        title: i.title,
        status: i.status,
        occurrences: i.occurrence_count
      })),
      confidence: Math.min(100, 40 + (group.total_occurrences * 3))
    }));
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
 * SD-QUALITY-INT-001: Now includes feedback table learnings
 *
 * INTELLIGENT FILTERING (v2):
 * - Filters out low-value patterns (< 3 occurrences, < 50% confidence)
 * - Shows what was filtered for transparency
 * - Prioritizes actionable items with proven solutions
 */
export async function buildLearningContext(sdId = null) {
  console.log('Building learning context with intelligent filtering...');
  console.log(`  Thresholds: min ${FILTER_CONFIG.MIN_OCCURRENCE_FOR_PATTERN} occurrences, min ${FILTER_CONFIG.MIN_CONFIDENCE_THRESHOLD}% confidence`);

  const [lessons, patternResult, improvements, feedbackLearnings, feedbackPatterns] = await Promise.all([
    getRecentLessons(sdId, TOP_N),
    getIssuePatterns(TOP_N),
    getPendingImprovements(TOP_N),
    getResolvedFeedbackLearnings(TOP_N),
    getRecurringFeedbackPatterns(TOP_N)
  ]);

  // Extract patterns and filtered stats
  const patterns = patternResult.patterns || [];
  const patternFiltered = patternResult.filtered || { lowOccurrence: 0, lowConfidence: 0, staleDecline: 0, total: 0 };

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

  // Calculate total filtered for summary
  const totalFiltered = patternFiltered.lowOccurrence + patternFiltered.lowConfidence + patternFiltered.staleDecline;

  const context = {
    lessons,
    patterns,
    improvements,
    // SD-QUALITY-INT-001: Feedback-derived learnings
    feedback_learnings: feedbackLearnings,
    feedback_patterns: feedbackPatterns,
    // Intelligence metadata
    intelligence: {
      similar_patterns: similarPatterns,
      resolution_candidates: resolutionCandidates,
      stale_count: patterns.filter(p => p.recency_status === 'stale').length,
      aging_count: patterns.filter(p => p.recency_status === 'aging').length,
      // Feedback intelligence
      feedback_learning_count: feedbackLearnings.length,
      recurring_error_types: feedbackPatterns.length,
      // Filtering transparency (v2)
      filtering: {
        patterns_scanned: patternFiltered.total,
        patterns_filtered: totalFiltered,
        filter_reasons: {
          low_occurrence: patternFiltered.lowOccurrence,
          low_confidence: patternFiltered.lowConfidence,
          stale_declining: patternFiltered.staleDecline
        },
        thresholds: {
          min_occurrences: FILTER_CONFIG.MIN_OCCURRENCE_FOR_PATTERN,
          min_confidence: FILTER_CONFIG.MIN_CONFIDENCE_THRESHOLD,
          stale_days: FILTER_CONFIG.STALE_DAYS_THRESHOLD
        }
      }
    },
    summary: {
      total_lessons: lessons.length,
      total_patterns: patterns.length,
      total_improvements: improvements.length,
      total_feedback_learnings: feedbackLearnings.length,
      total_feedback_patterns: feedbackPatterns.length,
      // Filtering summary (v2)
      patterns_filtered_out: totalFiltered,
      generated_at: new Date().toISOString()
    }
  };

  // Enhanced logging with filtering transparency
  console.log('\n📊 Learning Context Summary:');
  console.log(`   Lessons: ${lessons.length}`);
  console.log(`   Patterns: ${patterns.length} surfaced (${totalFiltered} filtered out)`);
  if (totalFiltered > 0) {
    console.log(`      └─ Filtered: ${patternFiltered.lowOccurrence} low-occurrence, ${patternFiltered.lowConfidence} low-confidence, ${patternFiltered.staleDecline} stale+declining`);
  }
  console.log(`   Improvements: ${improvements.length}`);
  console.log(`   Feedback learnings: ${feedbackLearnings.length}`);
  console.log(`   Recurring error types: ${feedbackPatterns.length}`);

  if (resolutionCandidates.length > 0) {
    console.log(`\n   → ${resolutionCandidates.length} pattern(s) may be ready for resolution`);
  }

  // Actionability summary
  const actionablePatterns = patterns.filter(p => p.has_actionable_solution).length;
  if (actionablePatterns > 0) {
    console.log(`   → ${actionablePatterns} pattern(s) have proven solutions (actionable)`);
  }

  return context;
}

/**
 * Format context for display
 * SD-QUALITY-INT-001: Now includes feedback learnings
 * v2: Shows filtering stats and highlights actionable items
 */
export function formatContextForDisplay(context) {
  const lines = [];

  // Show filtering summary if any patterns were filtered
  if (context.intelligence?.filtering?.patterns_filtered > 0) {
    lines.push('\n## Intelligent Filtering Applied');
    lines.push(`Scanned ${context.intelligence.filtering.patterns_scanned} patterns, surfacing only high-value items:`);
    const reasons = context.intelligence.filtering.filter_reasons;
    if (reasons.low_occurrence > 0) lines.push(`  - ${reasons.low_occurrence} filtered: < ${context.intelligence.filtering.thresholds.min_occurrences} occurrences (incidents, not patterns)`);
    if (reasons.low_confidence > 0) lines.push(`  - ${reasons.low_confidence} filtered: < ${context.intelligence.filtering.thresholds.min_confidence}% confidence`);
    if (reasons.stale_declining > 0) lines.push(`  - ${reasons.stale_declining} filtered: stale (${context.intelligence.filtering.thresholds.stale_days}+ days) with declining trend`);
    lines.push('');
  }

  lines.push('\n## Patterns (from issue_patterns)');
  if (context.patterns.length === 0) {
    lines.push('*No patterns meet the quality threshold (3+ occurrences, 50%+ confidence)*');
    lines.push('*This is a good sign - no recurring high-value issues to address!*\n');
  } else {
    lines.push('High-value recurring issues with proven solutions:\n');
    for (const p of context.patterns) {
      const actionableBadge = p.has_actionable_solution ? ' ✓ ACTIONABLE' : '';
      lines.push(`**[${p.id}]** ${p.content}${actionableBadge}`);
      lines.push(`  - Category: ${p.category} | Severity: ${p.severity} | Occurrences: ${p.occurrence_count} | Confidence: ${p.confidence}%`);
      if (p.confidence_reason) {
        lines.push(`  - Confidence note: ${p.confidence_reason}`);
      }
      if (p.proven_solutions?.length > 0) {
        lines.push(`  - Proven solution: ${p.proven_solutions[0]?.solution || 'See details'}`);
      }
      lines.push('');
    }
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

  // SD-QUALITY-INT-001: Feedback table learnings
  if (context.feedback_learnings?.length > 0) {
    lines.push('\n## Feedback Learnings (from resolved feedback)');
    lines.push('Solutions extracted from resolved issues:\n');
    for (const fb of context.feedback_learnings) {
      lines.push(`**[${fb.id}]** ${fb.title}`);
      lines.push(`  - Type: ${fb.error_type || fb.type} | Priority: ${fb.priority} | Occurrences: ${fb.occurrence_count}`);
      lines.push(`  - Resolution: ${fb.content.substring(fb.title.length + 2)}`);
      if (fb.resolution_sd_id) {
        lines.push(`  - Resolved via: ${fb.resolution_sd_id}`);
      }
      lines.push('');
    }
  }

  // SD-QUALITY-INT-001: Recurring error patterns
  if (context.feedback_patterns?.length > 0) {
    lines.push('\n## Recurring Error Patterns (from feedback)');
    lines.push('Error types occurring frequently:\n');
    for (const fp of context.feedback_patterns) {
      lines.push(`**[${fp.id}]** ${fp.content}`);
      lines.push(`  - Total occurrences: ${fp.total_occurrences} across ${fp.item_count} issues | Confidence: ${fp.confidence}%`);
      lines.push('');
    }
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
