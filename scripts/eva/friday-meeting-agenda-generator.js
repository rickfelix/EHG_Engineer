#!/usr/bin/env node

/**
 * EVA Friday Meeting Agenda Generator
 *
 * Generates a structured agenda for the weekly EVA Friday meeting by
 * querying the last 7 days of:
 *   - worktree_gate_metrics (pass/fail rates)
 *   - issue_patterns (new or recurring patterns)
 *   - retrospectives (recent retros with quality scores)
 *
 * Designed to run Thursday 22:00 UTC via cron, producing the Friday
 * morning agenda. Can also be run manually at any time.
 *
 * Output: Inserts into eva_friday_meeting_agenda table.
 *
 * SD: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-E
 * @module scripts/eva/friday-meeting-agenda-generator
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const LOOKBACK_DAYS = 7;
const RECURRENCE_WINDOW_DAYS = 30;

/**
 * Get the date N days ago as ISO string.
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Query worktree gate metrics from the last 7 days.
 */
async function getGateMetrics() {
  const since = daysAgo(LOOKBACK_DAYS);
  const { data, error } = await supabase
    .from('worktree_gate_metrics')
    .select('sd_key, gate_name, result, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) return { total: 0, failures: [], summary: 'Query failed' };

  const failures = (data || []).filter(r => r.result === 'fail');
  const total = (data || []).length;
  const passRate = total > 0
    ? Math.round(100 * (total - failures.length) / total)
    : 100;

  return {
    total,
    failures: failures.slice(0, 10).map(f => ({
      sd_key: f.sd_key,
      gate: f.gate_name,
      at: f.created_at,
    })),
    passRate,
    summary: `${total} gate checks, ${passRate}% pass rate, ${failures.length} failures`,
  };
}

/**
 * Query issue patterns with recent activity or recurrence.
 */
async function getPatternActivity() {
  const since = daysAgo(LOOKBACK_DAYS);
  const recurrenceSince = daysAgo(RECURRENCE_WINDOW_DAYS);

  // New patterns in last 7 days
  const { data: newPatterns } = await supabase
    .from('issue_patterns')
    .select('pattern_id, category, severity, issue_summary, occurrence_count')
    .gte('created_at', since)
    .eq('status', 'active');

  // Recurring: 2+ occurrences in 30-day window
  const { data: recurring } = await supabase
    .from('issue_patterns')
    .select('pattern_id, category, severity, issue_summary, occurrence_count')
    .gte('updated_at', recurrenceSince)
    .gte('occurrence_count', 2)
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false })
    .limit(10);

  return {
    newPatterns: (newPatterns || []).map(p => ({
      id: p.pattern_id,
      summary: p.issue_summary,
      severity: p.severity,
      occurrences: p.occurrence_count,
    })),
    recurring: (recurring || []).map(p => ({
      id: p.pattern_id,
      summary: p.issue_summary,
      severity: p.severity,
      occurrences: p.occurrence_count,
    })),
  };
}

/**
 * Query recent retrospectives.
 */
async function getRecentRetros() {
  const since = daysAgo(LOOKBACK_DAYS);
  const { data } = await supabase
    .from('retrospectives')
    .select('sd_id, title, quality_score, status, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);

  return (data || []).map(r => ({
    sd_id: r.sd_id,
    title: r.title,
    quality: r.quality_score,
    status: r.status,
  }));
}

/**
 * Generate the complete agenda.
 */
export async function generateAgenda() {
  const [gateMetrics, patterns, retros] = await Promise.all([
    getGateMetrics(),
    getPatternActivity(),
    getRecentRetros(),
  ]);

  const now = new Date();
  const weekEnd = new Date(now);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - LOOKBACK_DAYS);

  const agenda = {
    generated_at: now.toISOString(),
    period: {
      start: weekStart.toISOString().split('T')[0],
      end: weekEnd.toISOString().split('T')[0],
    },
    sections: {
      gate_health: {
        title: 'Worktree Gate Health',
        summary: gateMetrics.summary,
        pass_rate: gateMetrics.passRate,
        recent_failures: gateMetrics.failures,
      },
      new_patterns: {
        title: 'New Patterns This Week',
        count: patterns.newPatterns.length,
        items: patterns.newPatterns,
      },
      recurrence_watch: {
        title: '30-Day Recurrence Watch',
        count: patterns.recurring.length,
        items: patterns.recurring,
        action_needed: patterns.recurring.length > 0,
      },
      retrospective_quality: {
        title: 'Retrospective Quality',
        count: retros.length,
        items: retros,
        avg_quality: retros.length > 0
          ? Math.round(retros.reduce((s, r) => s + (r.quality || 0), 0) / retros.length)
          : null,
      },
    },
    action_items: [],
  };

  // Auto-generate action items from findings
  if (gateMetrics.failures.length > 3) {
    agenda.action_items.push('Review high gate failure rate — consider pattern-specific fixes');
  }
  if (patterns.recurring.length > 0) {
    agenda.action_items.push(`${patterns.recurring.length} recurring pattern(s) detected — evaluate for enforcement layer upgrade`);
  }
  if (retros.length === 0) {
    agenda.action_items.push('No retrospectives filed this week — check SD completion workflow');
  }

  return agenda;
}

/**
 * Generate and store agenda in database.
 */
export async function generateAndStore() {
  const agenda = await generateAgenda();

  const { data, error } = await supabase
    .from('eva_friday_meeting_agenda')
    .insert({
      week_start: agenda.period.start,
      week_end: agenda.period.end,
      agenda_data: agenda,
      status: 'generated',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[FridayAgenda] Failed to store agenda:', error.message);
    return { success: false, error: error.message };
  }

  console.log(`[FridayAgenda] Agenda stored: ${data.id}`);
  console.log(`[FridayAgenda] Period: ${agenda.period.start} to ${agenda.period.end}`);
  console.log(`[FridayAgenda] Gate health: ${agenda.sections.gate_health.summary}`);
  console.log(`[FridayAgenda] New patterns: ${agenda.sections.new_patterns.count}`);
  console.log(`[FridayAgenda] Recurring: ${agenda.sections.recurrence_watch.count}`);
  console.log(`[FridayAgenda] Retros: ${agenda.sections.retrospective_quality.count}`);
  console.log(`[FridayAgenda] Action items: ${agenda.action_items.length}`);

  return { success: true, id: data.id, agenda };
}

// CLI entry point
if (isMainModule(import.meta.url)) {
  generateAndStore()
    .then(result => {
      if (!result.success) process.exit(1);
    })
    .catch(err => {
      console.error('[FridayAgenda] Fatal:', err.message);
      process.exit(1);
    });
}
