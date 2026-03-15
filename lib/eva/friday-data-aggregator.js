/**
 * Friday Data Aggregator
 * SD-LEO-INFRA-EVA-PERSONALITY-FRIDAY-001
 *
 * Queries weekly metrics from existing tables and structures them
 * for injection into EVA chat LLM context during Friday sessions.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Aggregate weekly metrics for Friday session context.
 * @returns {Promise<Object>} Structured JSON with weekly metrics
 */
export async function aggregateFridayData() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [sdMetrics, ventureMetrics, brainstormMetrics, patternMetrics] = await Promise.all([
    getSDMetrics(oneWeekAgo),
    getVentureMetrics(),
    getBrainstormMetrics(oneWeekAgo),
    getPatternMetrics(),
  ]);

  return {
    generated_at: new Date().toISOString(),
    period: { since: oneWeekAgo, until: new Date().toISOString() },
    sd_velocity: sdMetrics,
    venture_progress: ventureMetrics,
    brainstorm_outcomes: brainstormMetrics,
    trending_patterns: patternMetrics,
  };
}

async function getSDMetrics(since) {
  const { data: completed } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, sd_type, completion_date')
    .eq('status', 'completed')
    .gte('completion_date', since)
    .order('completion_date', { ascending: false });

  const { data: active } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, current_phase, progress')
    .in('status', ['draft', 'in_progress', 'planning', 'active', 'ready'])
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    completed_this_week: completed?.length || 0,
    completed_sds: (completed || []).map(s => ({ key: s.sd_key, title: s.title, type: s.sd_type })),
    active_count: active?.length || 0,
    active_sds: (active || []).map(s => ({ key: s.sd_key, title: s.title, phase: s.current_phase, progress: s.progress })),
  };
}

async function getVentureMetrics() {
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name, current_stage, status, updated_at')
    .in('status', ['active', 'proving', 'evaluation'])
    .order('updated_at', { ascending: false })
    .limit(10);

  return {
    active_count: ventures?.length || 0,
    ventures: (ventures || []).map(v => ({ name: v.name, stage: v.current_stage, status: v.status })),
  };
}

async function getBrainstormMetrics(since) {
  const { data: sessions } = await supabase
    .from('brainstorm_sessions')
    .select('id, title, outcome_type, score, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    count_this_week: sessions?.length || 0,
    sessions: (sessions || []).map(s => ({ title: s.title, outcome: s.outcome_type, score: s.score })),
  };
}

async function getPatternMetrics() {
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('id, category, severity, occurrence_count, trend')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false })
    .limit(5);

  return {
    active_count: patterns?.length || 0,
    top_patterns: (patterns || []).map(p => ({ category: p.category, severity: p.severity, occurrences: p.occurrence_count, trend: p.trend })),
  };
}

/**
 * Generate data-driven suggested prompts from Friday metrics.
 * @param {Object} fridayData - Output from aggregateFridayData()
 * @returns {string[]} Array of 3-5 suggested prompts
 */
export function generateSuggestedPrompts(fridayData) {
  const prompts = [];
  const sd = fridayData.sd_velocity;
  const ventures = fridayData.venture_progress;
  const patterns = fridayData.trending_patterns;

  if (sd.completed_this_week > 0) {
    prompts.push(`We completed ${sd.completed_this_week} SDs this week. What patterns do you see in our velocity?`);
  }
  if (sd.active_count > 0) {
    prompts.push(`We have ${sd.active_count} active SDs. Which ones should I prioritize for next week?`);
  }
  if (ventures.active_count > 0) {
    const names = ventures.ventures.slice(0, 3).map(v => v.name).join(', ');
    prompts.push(`Compare progress across ${names} — who needs attention?`);
  }
  if (patterns.active_count > 0) {
    prompts.push(`We have ${patterns.active_count} recurring patterns. Which ones are the most dangerous?`);
  }
  prompts.push('What are the key strategic decisions I should make this week?');

  return prompts.slice(0, 5);
}
