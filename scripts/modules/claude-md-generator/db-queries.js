/**
 * Database Query Functions for CLAUDE.md Generator
 * Handles all Supabase queries for protocol data
 */

/**
 * Get active protocol from database
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Active protocol with sections
 */
async function getActiveProtocol(supabase) {
  const { data, error } = await supabase
    .from('leo_protocols')
    .select('*')
    .eq('status', 'active')
    .single();

  if (error || !data) {
    throw new Error('No active protocol found in database');
  }

  const { data: sections } = await supabase
    .from('leo_protocol_sections')
    .select('*')
    .eq('protocol_id', data.id)
    .order('order_index');

  data.sections = sections || [];
  return data;
}

/**
 * Get all agents from database
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of agents
 */
async function getAgents(supabase) {
  const { data } = await supabase
    .from('leo_agents')
    .select('*')
    .order('agent_code');

  return data || [];
}

/**
 * Get active sub-agents with triggers
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of sub-agents with triggers
 */
async function getSubAgents(supabase) {
  const { data } = await supabase
    .from('leo_sub_agents')
    .select(`
      *,
      triggers:leo_sub_agent_triggers(*)
    `)
    .eq('active', true)
    .order('priority', { ascending: false });

  return data || [];
}

/**
 * Get active handoff templates
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of handoff templates
 */
async function getHandoffTemplates(supabase) {
  const { data } = await supabase
    .from('leo_handoff_templates')
    .select('*')
    .eq('active', true);

  return data || [];
}

/**
 * Get active validation rules
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of validation rules
 */
async function getValidationRules(supabase) {
  const { data } = await supabase
    .from('leo_validation_rules')
    .select('*')
    .eq('active', true);

  return data || [];
}

/**
 * Get schema constraints
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of schema constraints
 */
async function getSchemaConstraints(supabase) {
  const { data, error } = await supabase
    .from('leo_schema_constraints')
    .select('*')
    .order('table_name');

  if (error) {
    console.warn('Could not load schema constraints (table may not exist yet)');
    return [];
  }

  return data || [];
}

/**
 * Get active process scripts
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of process scripts
 */
async function getProcessScripts(supabase) {
  const { data, error } = await supabase
    .from('leo_process_scripts')
    .select('*')
    .eq('active', true)
    .order('category');

  if (error) {
    console.warn('Could not load process scripts (table may not exist yet)');
    return [];
  }

  return data || [];
}

/**
 * Fetch hot issue patterns - active patterns with high occurrence or increasing trend
 * @param {Object} supabase - Supabase client
 * @param {number} limit - Maximum number of patterns to return
 * @returns {Promise<Array>} List of hot patterns
 */
async function getHotPatterns(supabase, limit = 5) {
  const { data, error } = await supabase
    .from('issue_patterns')
    .select('*')
    .eq('status', 'active')
    .or('trend.eq.increasing,severity.eq.critical,severity.eq.high')
    .order('occurrence_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Could not load issue patterns (table may not exist yet)');
    return [];
  }

  return data || [];
}

/**
 * Fetch recent published retrospectives for lessons learned
 * @param {Object} supabase - Supabase client
 * @param {number} days - Number of days to look back
 * @param {number} limit - Maximum number of retrospectives to return
 * @returns {Promise<Array>} List of retrospectives
 */
async function getRecentRetrospectives(supabase, days = 30, limit = 5) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('retrospectives')
    .select('id, sd_id, title, what_needs_improvement, action_items, learning_category, quality_score, conducted_date')
    .gte('conducted_date', since.toISOString())
    .eq('status', 'PUBLISHED')
    .order('quality_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Could not load retrospectives (table may not exist yet)');
    return [];
  }

  return data || [];
}

/**
 * Fetch gate health metrics for self-improvement monitoring
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of gate health metrics
 */
async function getGateHealth(supabase) {
  try {
    const { data, error } = await supabase
      .from('v_gate_health_metrics')
      .select('*')
      .lt('pass_rate', 80)
      .order('pass_rate', { ascending: true })
      .limit(5);

    if (error) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('leo_gate_reviews')
        .select('gate, score')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (fallbackError) {
        console.warn('Could not load gate health (tables may not exist yet)');
        return [];
      }

      const byGate = {};
      (fallbackData || []).forEach(r => {
        if (!byGate[r.gate]) byGate[r.gate] = { passes: 0, failures: 0 };
        if (r.score >= 85) byGate[r.gate].passes++;
        else byGate[r.gate].failures++;
      });

      return Object.entries(byGate)
        .map(([gate, stats]) => ({
          gate,
          pass_rate: Math.round(100 * stats.passes / (stats.passes + stats.failures)),
          total_attempts: stats.passes + stats.failures,
          failures: stats.failures
        }))
        .filter(g => g.pass_rate < 80)
        .sort((a, b) => a.pass_rate - b.pass_rate)
        .slice(0, 5);
    }

    return data || [];
  } catch (err) {
    console.warn('Could not load gate health:', err.message);
    return [];
  }
}

/**
 * Fetch pending SD proposals for proactive surfacing
 * @param {Object} supabase - Supabase client
 * @param {number} limit - Maximum number of proposals to return
 * @returns {Promise<Array>} List of pending proposals
 */
async function getPendingProposals(supabase, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('sd_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('urgency_level', { ascending: true })
      .order('confidence_score', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Could not load proposals (table may not exist yet)');
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('Could not load proposals:', err.message);
    return [];
  }
}

/**
 * Fetch autonomous continuation directives
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of autonomous directives
 */
async function getAutonomousDirectives(supabase) {
  try {
    const { data, error } = await supabase
      .from('leo_autonomous_directives')
      .select('*')
      .eq('active', true)
      .order('display_order');

    if (error) {
      console.warn('Could not load autonomous directives (table may not exist yet)');
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('Could not load autonomous directives:', err.message);
    return [];
  }
}

/**
 * Get active vision gap insights from issue_patterns.
 * SD-LEO-INFRA-VISION-PROTOCOL-FEEDBACK-001: inject live VGAP data into protocol docs.
 *
 * Non-blocking: returns [] on any error so doc generation is never interrupted.
 *
 * @param {Object} supabase - Supabase client
 * @param {number} [limit=3] - Max patterns to return
 * @returns {Promise<Array<{pattern_id: string, issue_summary: string, category: string, severity: string}>>}
 */
async function getVisionGapInsights(supabase, limit = 3) {
  try {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, issue_summary, category, severity')
      .like('pattern_id', 'VGAP-%')
      .eq('status', 'active')
      .order('severity', { ascending: true }) // critical sorts first alphabetically
      .limit(limit);

    if (error) {
      console.warn(`[vision-gap-insights] Query failed: ${error.message} — continuing without gaps`);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.warn(`[vision-gap-insights] Unexpected error: ${err.message} — continuing without gaps`);
    return [];
  }
}

export {
  getActiveProtocol,
  getAgents,
  getSubAgents,
  getHandoffTemplates,
  getValidationRules,
  getSchemaConstraints,
  getProcessScripts,
  getHotPatterns,
  getRecentRetrospectives,
  getGateHealth,
  getPendingProposals,
  getAutonomousDirectives,
  getVisionGapInsights
};
