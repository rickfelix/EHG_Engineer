/**
 * Data fetchers for CLAUDE.md generation
 * Handles all database queries for LEO Protocol data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };

/**
 * Get active protocol version
 */
export async function getActiveProtocol() {
  const { data, error } = await supabase
    .from('leo_protocols')
    .select('*')
    .eq('status', 'ACTIVE')
    .single();

  if (error) {
    console.warn(`⚠️ No active protocol found: ${error.message}`);
    return {
      id: 'leo-v4-3-3-ui-parity',
      version: '4.3.3',
      title: 'LEO Protocol v4.3.3 - UI Parity Governance',
      status: 'ACTIVE'
    };
  }
  return data;
}

/**
 * Get agents configuration
 */
export async function getAgents() {
  const { data, error } = await supabase.from('leo_agents').select('*').eq('is_active', true);
  if (error) console.warn(`⚠️ Agents: ${error.message}`);
  return data || [];
}

/**
 * Get sub-agents with trigger keywords
 */
export async function getSubAgents() {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('is_active', true)
    .order('code');

  if (error) console.warn(`⚠️ Sub-agents: ${error.message}`);
  return data || [];
}

/**
 * Get handoff templates
 */
export async function getHandoffTemplates() {
  const { data, error } = await supabase.from('sd_phase_handoff_templates').select('*').order('created_at');
  if (error) console.warn(`⚠️ Handoff templates: ${error.message}`);
  return data || [];
}

/**
 * Get validation rules
 */
export async function getValidationRules() {
  const { data, error } = await supabase.from('leo_validation_rules').select('*').eq('active', true).order('gate');
  if (error) console.warn(`⚠️ Validation rules: ${error.message}`);
  return data || [];
}

/**
 * Get schema constraints
 */
export async function getSchemaConstraints() {
  const { data: constraints, error } = await supabase
    .from('schema_validation_rules')
    .select('*')
    .eq('is_active', true)
    .order('table_name, column_name');

  if (error) {
    console.warn(`⚠️ Schema constraints: ${error.message}`);
    return [];
  }

  const grouped = {};
  for (const c of constraints || []) {
    const key = c.table_name;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }

  return Object.entries(grouped).map(([table, rules]) => ({
    table_name: table,
    constraints: rules
  }));
}

/**
 * Get process scripts
 */
export async function getProcessScripts() {
  const { data: scripts, error } = await supabase
    .from('leo_process_scripts')
    .select('*')
    .eq('is_active', true)
    .order('category, script_name');

  if (error) {
    console.warn(`⚠️ Process scripts: ${error.message}`);
    return [];
  }

  const grouped = {};
  for (const s of scripts || []) {
    const key = s.category || 'uncategorized';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  return Object.entries(grouped).map(([category, items]) => ({
    category,
    scripts: items
  }));
}

/**
 * Get hot patterns (recent recurring issues)
 */
export async function getHotPatterns(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('*')
      .in('status', ['active', 'monitoring'])
      .order('occurrence_count', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Get recent retrospectives
 */
export async function getRecentRetrospectives(days = 30, limit = 5) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data, error } = await supabase
      .from('retrospectives')
      .select('*')
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Get gate health metrics
 */
export async function getGateHealth() {
  try {
    const { data: handoffs, error } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status, quality_score, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error) return null;

    const gateMetrics = {};
    for (const h of handoffs || []) {
      const gate = h.handoff_type;
      if (!gateMetrics[gate]) {
        gateMetrics[gate] = { total: 0, passed: 0, totalScore: 0, scores: [] };
      }
      gateMetrics[gate].total++;
      if (h.status === 'accepted') gateMetrics[gate].passed++;
      if (h.quality_score) {
        gateMetrics[gate].totalScore += h.quality_score;
        gateMetrics[gate].scores.push(h.quality_score);
      }
    }

    return Object.entries(gateMetrics).map(([gate, m]) => ({
      gate,
      pass_rate: m.total > 0 ? ((m.passed / m.total) * 100).toFixed(1) : 'N/A',
      avg_score: m.scores.length > 0 ? (m.totalScore / m.scores.length).toFixed(1) : 'N/A',
      total_handoffs: m.total
    }));
  } catch {
    return null;
  }
}

/**
 * Get pending proposals
 */
export async function getPendingProposals(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('sd_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('urgency_level', { ascending: true })
      .order('confidence_score', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Get autonomous directives
 */
export async function getAutonomousDirectives() {
  try {
    const { data, error } = await supabase
      .from('leo_autonomous_directives')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('phase');

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
