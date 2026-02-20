/**
 * EVA COO Integration - Delegated mode routing for Vision V2
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 13
 *
 * EVA routes directives to CEO (delegated mode) vs crews (direct mode):
 * - Delegated mode: Venture has CEO -> route to CEO
 * - Direct mode: No CEO -> dispatch to crews directly (legacy)
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { checkBudgetOrThrow } from '../governance/budget-check.js';

// Well-known agent IDs
const WELL_KNOWN_IDS = {
  CHAIRMAN: '00000000-0000-0000-0000-000000000001',
  EVA: '00000000-0000-0000-0000-000000000002'
};

/**
 * EVACOOIntegration - EVA's interface for venture CEO delegation
 */
export class EVACOOIntegration {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.evaAgentId = options.evaAgentId || WELL_KNOWN_IDS.EVA;
  }

  /**
   * Route directive to appropriate handler based on venture CEO existence
   * @param {Object} directive - Directive from Chairman or internal
   * @returns {Object} Routing result
   */
  async routeDirective(directive) {
    const {
      ventureId,
      directiveType,
      subject: _subject,
      body: _body,
      priority = 'normal'
    } = directive;

    console.log(`\n🔀 EVA routing directive for venture ${ventureId}`);
    console.log(`   Type: ${directiveType} | Priority: ${priority}`);

    // Check if venture has a CEO
    const ceo = await this._getVentureCeo(ventureId);

    if (ceo) {
      // Delegated mode: Route to CEO
      console.log(`   ✅ Delegated mode: Routing to CEO ${ceo.display_name}`);
      return this._routeToCeo(ceo, directive);
    } else {
      // Direct mode: Dispatch to crews directly (legacy)
      console.log('   ℹ️  Direct mode: No CEO found, dispatching to crews');
      return this._dispatchToCrews(ventureId, directive);
    }
  }

  /**
   * Route directive to CEO (delegated mode)
   * @private
   */
  async _routeToCeo(ceo, directive) {
    const message = {
      message_type: 'task_delegation',
      from_agent_id: this.evaAgentId,
      to_agent_id: ceo.id,
      correlation_id: uuidv4(),
      subject: `[EVA] ${directive.subject}`,
      body: {
        directive_type: directive.directiveType,
        original_body: directive.body,
        venture_id: directive.ventureId,
        delegated_at: new Date().toISOString()
      },
      priority: directive.priority,
      status: 'pending',
      requires_response: true,
      response_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const { data, error } = await this.supabase
      .from('agent_messages')
      .insert(message)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to route to CEO: ${error.message}`);
    }

    return {
      mode: 'delegated',
      routed_to: ceo.id,
      ceo_name: ceo.display_name,
      message_id: data.id,
      status: 'pending'
    };
  }

  /**
   * Dispatch directly to crews (legacy direct mode)
   * GOVERNED-ENGINE-v5.1.0: Budget check before dispatch
   * @private
   */
  async _dispatchToCrews(ventureId, directive) {
    // GOVERNED-ENGINE-v5.1.0: Check budget before crew dispatch
    try {
      await checkBudgetOrThrow(ventureId);
    } catch (error) {
      console.error(`[EVA-COO] Budget check failed: ${error.message}`);
      return {
        mode: 'direct',
        error: `Budget check failed: ${error.message}`,
        status: 'blocked_by_budget',
        governance: 'GOVERNED-ENGINE-v5.1.0'
      };
    }

    // Get crews for this venture
    const { data: crews } = await this.supabase
      .from('agent_registry')
      .select('id, agent_role, capabilities')
      .eq('venture_id', ventureId)
      .eq('agent_type', 'crew');

    if (!crews || crews.length === 0) {
      return {
        mode: 'direct',
        error: 'No crews found for venture',
        status: 'failed'
      };
    }

    // Find best crew for the directive (simple capability matching)
    const targetCrew = this._selectCrewForDirective(crews, directive);

    if (!targetCrew) {
      return {
        mode: 'direct',
        error: 'No matching crew found',
        status: 'failed'
      };
    }

    // GOVERNED-ENGINE-v5.1.0: Include governance anchors in message
    const message = {
      message_type: 'task_delegation',
      from_agent_id: this.evaAgentId,
      to_agent_id: targetCrew.id,
      correlation_id: uuidv4(),
      subject: `[EVA-DIRECT] ${directive.subject}`,
      body: {
        directive_type: directive.directiveType,
        original_body: directive.body,
        mode: 'direct_dispatch',
        // GOVERNED-ENGINE-v5.1.0: Governance anchors
        governance: {
          venture_id: ventureId,
          prd_id: directive.prdId || null,
          sd_id: directive.sdId || null,
          governed_at: new Date().toISOString()
        }
      },
      priority: directive.priority,
      status: 'pending'
    };

    const { data, error } = await this.supabase
      .from('agent_messages')
      .insert(message)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to dispatch to crew: ${error.message}`);
    }

    return {
      mode: 'direct',
      routed_to: targetCrew.id,
      crew_role: targetCrew.agent_role,
      message_id: data.id,
      status: 'pending'
    };
  }

  /**
   * Select best crew for directive based on capabilities
   * @private
   */
  _selectCrewForDirective(crews, directive) {
    const directiveKeywords = directive.subject?.toLowerCase().split(/\s+/) || [];

    let bestMatch = null;
    let bestScore = 0;

    for (const crew of crews) {
      const capabilities = crew.capabilities || [];
      let score = 0;

      for (const cap of capabilities) {
        for (const keyword of directiveKeywords) {
          if (cap.toLowerCase().includes(keyword) || keyword.includes(cap.toLowerCase())) {
            score++;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = crew;
      }
    }

    // If no match found, return first crew
    return bestMatch || crews[0];
  }

  /**
   * Get venture CEO if exists
   * @private
   */
  async _getVentureCeo(ventureId) {
    const { data } = await this.supabase
      .from('agent_registry')
      .select('id, display_name, status')
      .eq('venture_id', ventureId)
      .eq('agent_type', 'venture_ceo')
      .eq('status', 'active')
      .single();

    return data;
  }

  /**
   * Aggregate CEO status reports for Chairman briefing
   * @param {Array<string>} ventureIds - Venture IDs to aggregate
   * @returns {Object} Aggregated status
   */
  async aggregateCeoStatuses(ventureIds = null) {
    console.log('\n📊 Aggregating CEO statuses for Chairman briefing...');

    // Get all active CEOs
    let query = this.supabase
      .from('agent_registry')
      .select(`
        id,
        display_name,
        venture_id,
        status,
        token_consumed,
        token_budget
      `)
      .eq('agent_type', 'venture_ceo')
      .eq('status', 'active');

    if (ventureIds) {
      query = query.in('venture_id', ventureIds);
    }

    const { data: ceos, error } = await query;

    if (error || !ceos) {
      return { error: 'Failed to fetch CEO statuses' };
    }

    // Get latest status report from each CEO
    const statuses = [];

    for (const ceo of ceos) {
      const { data: latestReport } = await this.supabase
        .from('agent_messages')
        .select('body, created_at')
        .eq('from_agent_id', ceo.id)
        .eq('message_type', 'status_report')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      statuses.push({
        ceo_id: ceo.id,
        ceo_name: ceo.display_name,
        venture_id: ceo.venture_id,
        token_usage: {
          consumed: ceo.token_consumed,
          budget: ceo.token_budget,
          percent: Math.round((ceo.token_consumed / ceo.token_budget) * 100)
        },
        latest_status: latestReport?.body || { status: 'no_report' },
        last_report_at: latestReport?.created_at || null
      });
    }

    const summary = {
      total_ceos: statuses.length,
      ceos_reporting: statuses.filter(s => s.last_report_at).length,
      avg_token_usage: Math.round(
        statuses.reduce((sum, s) => sum + s.token_usage.percent, 0) / statuses.length
      ) || 0,
      individual_statuses: statuses,
      generated_at: new Date().toISOString()
    };

    console.log(`   ✅ Aggregated ${summary.total_ceos} CEO statuses`);

    return summary;
  }

  /**
   * Onboard new venture - calls factory if CEO needed
   * @param {Object} venture - Venture data
   * @param {boolean} createCeo - Whether to create CEO structure
   */
  async onboardVenture(venture, createCeo = true) {
    console.log(`\n🚀 EVA onboarding venture: ${venture.name}`);

    if (createCeo) {
      // Import factory dynamically to avoid circular dependency
      const { VentureFactory } = await import('./venture-ceo-factory.js');
      const factory = new VentureFactory(this.supabase);

      const result = await factory.instantiateVenture({
        ventureName: venture.name,
        ventureId: venture.id,
        parentAgentId: this.evaAgentId,
        totalTokenBudget: venture.token_budget || 250000
      });

      return {
        onboarded: true,
        mode: 'delegated',
        ceo_agent_id: result.ceo_agent_id,
        total_agents: result.total_agents_created
      };
    }

    // Direct mode - no CEO created
    return {
      onboarded: true,
      mode: 'direct',
      ceo_agent_id: null
    };
  }

  /**
   * Get EVA's view of venture hierarchy
   */
  async getVentureHierarchy(ventureId) {
    const { data: agents } = await this.supabase
      .from('agent_registry')
      .select('id, agent_type, agent_role, display_name, parent_agent_id, hierarchy_level')
      .eq('venture_id', ventureId)
      .order('hierarchy_level');

    if (!agents) return null;

    // Build tree structure
    const tree = { ceo: null, vps: [], crews: {} };

    for (const agent of agents) {
      switch (agent.agent_type) {
        case 'venture_ceo':
          tree.ceo = agent;
          break;
        case 'executive':
          tree.vps.push(agent);
          break;
        case 'crew':
          const vpId = agent.parent_agent_id;
          if (!tree.crews[vpId]) tree.crews[vpId] = [];
          tree.crews[vpId].push(agent);
          break;
      }
    }

    return tree;
  }
}

// Export well-known IDs
export { WELL_KNOWN_IDS };

// Default export
export default EVACOOIntegration;
