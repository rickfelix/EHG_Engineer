/**
 * Database Query Functions for CLAUDE.md Generator
 * Handles all Supabase queries for protocol data
 */

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 4: leo_protocol_sections is the
// SSOT for every generated CLAUDE_*.md — a read silently capped at the PostgREST 1000-row
// max would TRUNCATE the generated protocol files with no error. The sections read
// paginates to completion AND cross-checks an exact head-count; on ANY failure the
// generator ABORTS (throws) — never generate from a partial section set. The auxiliary
// fetchers below paginate too but keep their pre-existing fail-open (warn + empty) policy.
import { fetchAllPaginated } from '../../../lib/db/fetch-all-paginated.mjs';

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

  // COUNT-TRUNCATION DISCIPLINE (FR-6 batch 4): paginate to completion; a thrown page
  // error propagates and ABORTS generation (rule-2 guard semantics — a partial section
  // set must never silently render as the full protocol).
  const sections = await fetchAllPaginated(() => supabase
    .from('leo_protocol_sections')
    .select('*')
    .eq('protocol_id', data.id)
    // SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-1): deterministic secondary sort.
    // Without an `id` tiebreak, Postgres returns rows that share an order_index in an
    // UNSPECIFIED order, so the rendered CLAUDE_*.md byte-order for a tied group could
    // shuffle (table rewrite / VACUUM / plan change) with no DB content change — making the
    // generated docs non-deterministic AND invisible to the per-section drift digest. The
    // tiebreak pins a stable render order so the digest faithfully tracks rendered output.
    // (The tiebreak also pins stable .range() page boundaries for the pagination above.)
    .order('order_index')
    .order('id'));

  // Strongest generation guard: exact head-count vs fetched length. Catches any
  // truncation mode pagination can't see (e.g. a proxy clamping pages). count===null
  // with error===null means the MEASUREMENT failed — abort, never trust the fetch blind.
  // A section inserted/deleted mid-generation also aborts (rerun is cheap and safe).
  const { count, error: countError } = await supabase
    .from('leo_protocol_sections')
    .select('id', { count: 'exact', head: true })
    .eq('protocol_id', data.id);
  if (countError || typeof count !== 'number') {
    throw new Error(
      `leo_protocol_sections exact-count guard unavailable (${countError?.message || 'count=null'}) — `
      + 'aborting generation rather than risk emitting a truncated protocol'
    );
  }
  if (count !== sections.length) {
    throw new Error(
      `leo_protocol_sections count mismatch: exact count=${count} but fetched ${sections.length} — `
      + 'aborting generation (partial section set would silently truncate CLAUDE_*.md)'
    );
  }

  data.sections = sections;
  return data;
}

/**
 * Get all agents from database
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of agents
 */
async function getAgents(supabase) {
  try {
    return await fetchAllPaginated(() => supabase
      .from('leo_agents')
      .select('*')
      .order('agent_code')
      .order('id'));
  } catch (err) {
    console.warn(`Could not load agents: ${err.message}`);
    return [];
  }
}

/**
 * Get active sub-agents with triggers
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of sub-agents with triggers
 */
async function getSubAgents(supabase) {
  try {
    // No `id` tiebreak on purpose: the rendered sub-agent tables inherit this query's
    // order, and the committed CLAUDE_*.md byte-order was produced by the un-tiebroken
    // query (priority ties in physical order). The set is far below one page, so
    // pagination never crosses a tie boundary; adding a tiebreak here would churn every
    // generated doc for zero truncation benefit.
    return await fetchAllPaginated(() => supabase
      .from('leo_sub_agents')
      .select(`
      *,
      triggers:leo_sub_agent_triggers(*)
    `)
      .eq('active', true)
      .order('priority', { ascending: false }));
  } catch (err) {
    console.warn(`Could not load sub-agents: ${err.message}`);
    return [];
  }
}

/**
 * Get active handoff templates
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of handoff templates
 */
async function getHandoffTemplates(supabase) {
  try {
    // No .order() on purpose — rendered handoff sections inherit this order and the
    // committed docs were generated without one (see getSubAgents note); tiny set,
    // single page, so pagination soundness is unaffected.
    return await fetchAllPaginated(() => supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('active', true));
  } catch (err) {
    console.warn(`Could not load handoff templates: ${err.message}`);
    return [];
  }
}

/**
 * Get active validation rules
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of validation rules
 */
async function getValidationRules(supabase) {
  try {
    // No .order() on purpose — rendered validation-rule sections inherit this order
    // and the committed docs were generated without one (see getSubAgents note).
    return await fetchAllPaginated(() => supabase
      .from('leo_validation_rules')
      .select('*')
      .eq('active', true));
  } catch (err) {
    console.warn(`Could not load validation rules: ${err.message}`);
    return [];
  }
}

/**
 * Get schema constraints
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of schema constraints
 */
async function getSchemaConstraints(supabase) {
  try {
    // table_name ties keep physical order (no id tiebreak) — render-order
    // compatibility, see getSubAgents note.
    return await fetchAllPaginated(() => supabase
      .from('leo_schema_constraints')
      .select('*')
      .order('table_name'));
  } catch {
    console.warn('Could not load schema constraints (table may not exist yet)');
    return [];
  }
}

/**
 * Get active process scripts
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of process scripts
 */
async function getProcessScripts(supabase) {
  try {
    // Category ties keep physical order (no id tiebreak) — render-order compatibility,
    // see getSubAgents note.
    return await fetchAllPaginated(() => supabase
      .from('leo_process_scripts')
      .select('*')
      .eq('active', true)
      .order('category'));
  } catch {
    console.warn('Could not load process scripts (table may not exist yet)');
    return [];
  }
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
 * Fetch known friction points from harness-backlog feedback rows.
 * SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-4b.
 * Returns top harness-backlog rows where contributing_workers length ≥ 3,
 * ordered by signal_count DESC. Filters out closed/resolved rows.
 * @param {Object} supabase - Supabase client
 * @param {number} limit - Maximum rows to return (default 5)
 * @returns {Promise<Array>} List of friction-point feedback rows
 */
async function getKnownFrictionPoints(supabase, limit = 5) {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, title, severity, metadata, status')
      .eq('category', 'harness_backlog')
      .in('status', ['new', 'in_progress'])
      .not('metadata->>signal_fingerprint', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50); // overfetch then filter client-side by contributing_workers length

    if (error) {
      console.warn('Could not load known friction points (feedback table or filter issue):', error.message);
      return [];
    }

    // Filter to rows with contributing_workers >= 3 (JSONB array length).
    const filtered = (data || []).filter(row => {
      const workers = row.metadata?.contributing_workers;
      return Array.isArray(workers) && workers.length >= 3;
    });

    // Sort by signal_count DESC then return top `limit`.
    filtered.sort((a, b) => (b.metadata?.signal_count || 0) - (a.metadata?.signal_count || 0));
    return filtered.slice(0, limit);
  } catch (err) {
    console.warn('getKnownFrictionPoints failed:', err.message);
    return [];
  }
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
      let fallbackData;
      try {
        fallbackData = await fetchAllPaginated(() => supabase
          .from('leo_gate_reviews')
          .select('gate, score')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('id'));
      } catch {
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
    // display_order ties keep physical order (no id tiebreak) — render-order
    // compatibility, see getSubAgents note.
    return await fetchAllPaginated(() => supabase
      .from('leo_autonomous_directives')
      .select('*')
      .eq('active', true)
      .order('display_order'));
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
  getKnownFrictionPoints,
  getRecentRetrospectives,
  getGateHealth,
  getPendingProposals,
  getAutonomousDirectives,
  getVisionGapInsights
};
