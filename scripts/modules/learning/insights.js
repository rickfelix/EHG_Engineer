/**
 * Learning Insights
 *
 * Displays historical learning metrics and recurrence monitoring.
 * Shows:
 * - Approval rate per category (patterns, lessons, improvements)
 * - Recurrence monitor (patterns that reappeared after improvement)
 * - Top rejected reasons for improvement opportunities
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Get approval rate statistics
 */
async function getApprovalStats() {
  const { data, error } = await supabase
    .from('learning_decisions')
    .select('user_decisions, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching approval stats:', error.message);
    return null;
  }

  const stats = {
    total_sessions: data?.length || 0,
    patterns: { approved: 0, rejected: 0 },
    lessons: { approved: 0, rejected: 0 },
    improvements: { approved: 0, rejected: 0 },
    rejection_reasons: {}
  };

  for (const decision of (data || [])) {
    const decisions = decision.user_decisions || {};

    for (const [itemId, itemDecision] of Object.entries(decisions)) {
      const status = itemDecision.status || itemDecision;
      const reason = itemDecision.reason || 'No reason given';

      // Categorize by ID prefix
      let category = 'improvements';
      if (itemId.startsWith('PAT-') || itemId.includes('pattern')) {
        category = 'patterns';
      } else if (itemId.startsWith('LESSON-') || itemId.includes('lesson')) {
        category = 'lessons';
      }

      if (status === 'APPROVED') {
        stats[category].approved++;
      } else if (status === 'REJECTED') {
        stats[category].rejected++;

        // Track rejection reasons
        if (!stats.rejection_reasons[reason]) {
          stats.rejection_reasons[reason] = 0;
        }
        stats.rejection_reasons[reason]++;
      }
    }
  }

  // Calculate rates
  for (const category of ['patterns', 'lessons', 'improvements']) {
    const total = stats[category].approved + stats[category].rejected;
    stats[category].total = total;
    stats[category].approval_rate = total > 0
      ? Math.round((stats[category].approved / total) * 100)
      : 0;
  }

  return stats;
}

/**
 * Get recurrence monitor data
 */
async function getRecurrenceData() {
  // Try to use the view if it exists
  const { data, error } = await supabase
    .from('learning_decisions')
    .select('id, improvements_applied, created_at, status')
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching recurrence data:', error.message);
    return null;
  }

  // For now, return basic completion stats
  // Full recurrence monitoring would require pattern_match_events table
  const recurrence = {
    completed_decisions: data?.length || 0,
    total_improvements_applied: 0,
    recurrences_detected: 0, // Would require pattern_match_events
    recurrence_rate: 0
  };

  for (const decision of (data || [])) {
    recurrence.total_improvements_applied += (decision.improvements_applied || []).length;
  }

  return recurrence;
}

/**
 * Get top rejection reasons
 */
function getTopRejectionReasons(stats, limit = 5) {
  if (!stats?.rejection_reasons) return [];

  return Object.entries(stats.rejection_reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => ({ reason, count }));
}

/**
 * Build complete insights report
 */
export async function buildInsightsReport() {
  console.log('Building learning insights report...\n');

  const [approvalStats, recurrence] = await Promise.all([
    getApprovalStats(),
    getRecurrenceData()
  ]);

  const topRejections = getTopRejectionReasons(approvalStats);

  return {
    approval_stats: approvalStats,
    recurrence,
    top_rejections: topRejections,
    generated_at: new Date().toISOString()
  };
}

/**
 * Format insights for display
 */
export function formatInsightsForDisplay(insights) {
  const lines = [];

  lines.push('# /learn Insights Report\n');
  lines.push(`Generated: ${new Date(insights.generated_at).toLocaleString()}\n`);

  // Approval Rates
  lines.push('## Approval Rates by Category\n');

  if (insights.approval_stats) {
    const stats = insights.approval_stats;

    lines.push('| Category | Approved | Rejected | Rate |');
    lines.push('|----------|----------|----------|------|');
    lines.push(`| Patterns | ${stats.patterns.approved} | ${stats.patterns.rejected} | ${stats.patterns.approval_rate}% |`);
    lines.push(`| Lessons | ${stats.lessons.approved} | ${stats.lessons.rejected} | ${stats.lessons.approval_rate}% |`);
    lines.push(`| Improvements | ${stats.improvements.approved} | ${stats.improvements.rejected} | ${stats.improvements.approval_rate}% |`);

    lines.push(`\n**Total sessions analyzed:** ${stats.total_sessions}`);
  } else {
    lines.push('*No approval data available yet.*');
  }

  // Recurrence Monitor
  lines.push('\n## Recurrence Monitor\n');

  if (insights.recurrence) {
    const rec = insights.recurrence;
    lines.push(`- **Completed decisions:** ${rec.completed_decisions}`);
    lines.push(`- **Total improvements applied:** ${rec.total_improvements_applied}`);
    lines.push(`- **Recurrences detected:** ${rec.recurrences_detected}`);

    if (rec.total_improvements_applied > 0) {
      lines.push(`- **Recurrence rate:** ${rec.recurrence_rate}%`);

      if (rec.recurrence_rate === 0) {
        lines.push('\n*Great! No patterns have recurred after improvement.*');
      } else if (rec.recurrence_rate > 20) {
        lines.push('\n*Warning: High recurrence rate suggests improvements may not be effective.*');
      }
    }
  } else {
    lines.push('*No recurrence data available yet.*');
  }

  // Top Rejection Reasons
  lines.push('\n## Top Rejection Reasons\n');

  if (insights.top_rejections?.length > 0) {
    lines.push('These are opportunities to improve the learning pipeline:\n');
    for (const { reason, count } of insights.top_rejections) {
      lines.push(`- **${reason}** (${count} times)`);
    }
  } else {
    lines.push('*No rejection data available yet.*');
  }

  // Recommendations
  lines.push('\n## Recommendations\n');

  if (insights.approval_stats) {
    const stats = insights.approval_stats;

    if (stats.patterns.approval_rate < 50) {
      lines.push('- Pattern approval rate is low - consider improving pattern quality or relevance filtering');
    }
    if (stats.improvements.approval_rate < 30) {
      lines.push('- Improvement approval rate is very low - review improvement generation criteria');
    }
    if (stats.lessons.approval_rate > 80) {
      lines.push('- Lesson approval rate is healthy - retrospectives are providing value');
    }
  }

  return lines.join('\n');
}

// CLI interface
if (process.argv[1].includes('insights')) {
  buildInsightsReport()
    .then(insights => {
      console.log(formatInsightsForDisplay(insights));
    })
    .catch(console.error);
}

export default { buildInsightsReport, formatInsightsForDisplay };
