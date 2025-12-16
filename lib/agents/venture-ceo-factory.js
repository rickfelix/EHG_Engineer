/**
 * VentureFactory - Creates hierarchical agent structure for ventures
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 6
 *
 * Creates complete organizational structure from template:
 * - 1 CEO agent (hierarchy_level=2, parent=EVA)
 * - 4 VP agents (VP_STRATEGY, VP_PRODUCT, VP_TECH, VP_GROWTH)
 * - 14 crew agents distributed across VPs
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Well-known agent IDs (SD-VISION-V2-004)
const WELL_KNOWN_IDS = {
  CHAIRMAN: '00000000-0000-0000-0000-000000000001',
  EVA: '00000000-0000-0000-0000-000000000002'
};

/**
 * Standard venture template with CEO, 4 VPs, and 14 crews
 * Based on spec Section 6.1 VentureTemplate interface
 */
const STANDARD_VENTURE_TEMPLATE = {
  id: 'standard',
  name: 'Standard Venture Template',
  description: 'Standard 19-agent organizational structure',

  ceo: {
    agent_role: 'venture_ceo',
    display_name_template: '{venture_name} CEO',
    capabilities: [
      'venture_oversight', 'stage_management', 'vp_coordination',
      'escalation_routing', 'status_aggregation', 'decision_making'
    ],
    delegation_authority: {
      can_create_agents: false,
      can_allocate_budget: true,
      max_budget_per_vp_usd: 5000,
      can_advance_stage: true,
      requires_advisory_approval: [13, 14, 15, 16] // Kochel firewall stages
    },
    token_budget: 50000
  },

  executives: [
    {
      agent_role: 'VP_STRATEGY',
      display_name_template: '{venture_name} VP Strategy',
      capabilities: ['market_research', 'competitive_analysis', 'financial_modeling', 'tam_calculation'],
      tools: ['web_search', 'company_lookup', 'market_data', 'financial_model', 'tam_calculator'],
      stage_ownership: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      token_budget: 30000
    },
    {
      agent_role: 'VP_PRODUCT',
      display_name_template: '{venture_name} VP Product',
      capabilities: ['product_definition', 'user_research', 'narrative_development', 'naming'],
      tools: ['document_writer', 'sentiment_analyzer'],
      stage_ownership: [10, 11, 12],
      token_budget: 25000
    },
    {
      agent_role: 'VP_TECH',
      display_name_template: '{venture_name} VP Tech',
      capabilities: ['tech_architecture', 'data_modeling', 'code_generation', 'qa_testing'],
      tools: ['code_generator', 'venture_query', 'artifact_store'],
      stage_ownership: [13, 14, 15, 16, 17, 18, 19, 20],
      token_budget: 40000
    },
    {
      agent_role: 'VP_GROWTH',
      display_name_template: '{venture_name} VP Growth',
      capabilities: ['launch_planning', 'analytics', 'optimization', 'user_acquisition'],
      tools: ['web_search', 'sentiment_analyzer'],
      stage_ownership: [21, 22, 23, 24, 25],
      token_budget: 25000
    }
  ],

  crews: [
    // VP_STRATEGY crews (4)
    { agent_role: 'Market_Research_Crew', executive_parent: 'VP_STRATEGY', capabilities: ['market_research'], token_budget: 5000 },
    { agent_role: 'Competitive_Analysis_Crew', executive_parent: 'VP_STRATEGY', capabilities: ['competitive_analysis'], token_budget: 5000 },
    { agent_role: 'Financial_Modeling_Crew', executive_parent: 'VP_STRATEGY', capabilities: ['financial_modeling'], token_budget: 5000 },
    { agent_role: 'Validation_Crew', executive_parent: 'VP_STRATEGY', capabilities: ['market_validation'], token_budget: 5000 },

    // VP_PRODUCT crews (3)
    { agent_role: 'User_Research_Crew', executive_parent: 'VP_PRODUCT', capabilities: ['user_research'], token_budget: 5000 },
    { agent_role: 'Narrative_Crew', executive_parent: 'VP_PRODUCT', capabilities: ['narrative_development'], token_budget: 5000 },
    { agent_role: 'Design_Crew', executive_parent: 'VP_PRODUCT', capabilities: ['ui_design'], token_budget: 5000 },

    // VP_TECH crews (4)
    { agent_role: 'Architecture_Crew', executive_parent: 'VP_TECH', capabilities: ['tech_architecture'], token_budget: 5000 },
    { agent_role: 'Development_Crew', executive_parent: 'VP_TECH', capabilities: ['code_generation'], token_budget: 10000 },
    { agent_role: 'QA_Crew', executive_parent: 'VP_TECH', capabilities: ['qa_testing'], token_budget: 5000 },
    { agent_role: 'DevOps_Crew', executive_parent: 'VP_TECH', capabilities: ['deployment'], token_budget: 5000 },

    // VP_GROWTH crews (3)
    { agent_role: 'Launch_Crew', executive_parent: 'VP_GROWTH', capabilities: ['launch_planning'], token_budget: 5000 },
    { agent_role: 'Analytics_Crew', executive_parent: 'VP_GROWTH', capabilities: ['analytics'], token_budget: 5000 },
    { agent_role: 'Growth_Crew', executive_parent: 'VP_GROWTH', capabilities: ['optimization'], token_budget: 5000 }
  ],

  budget_distribution: {
    ceo_percentage: 10,
    vp_percentage: 90
  }
};

/**
 * VentureFactory - Creates complete venture organizational structure
 */
export class VentureFactory {
  constructor(supabaseClient = null) {
    this.supabase = supabaseClient || createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for agent operations
    );
  }

  /**
   * Instantiate a new venture with complete organizational structure
   * @param {Object} options - Instantiation options
   * @param {string} options.ventureName - Name of the venture
   * @param {string} options.ventureId - UUID of the venture from ventures table
   * @param {string} options.templateId - Template ID (default: 'standard')
   * @param {string} options.parentAgentId - Parent agent ID (default: EVA)
   * @param {number} options.totalTokenBudget - Total token budget for all agents
   * @returns {Promise<InstantiationResult>}
   */
  async instantiateVenture(options) {
    const {
      ventureName,
      ventureId,
      templateId = 'standard',
      parentAgentId = WELL_KNOWN_IDS.EVA,
      totalTokenBudget = 250000
    } = options;

    console.log(`\n📦 VentureFactory: Instantiating venture "${ventureName}"`);
    console.log('='.repeat(60));

    // Get template
    const template = this._getTemplate(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // Generate venture code for hierarchy paths
    const ventureCode = this._generateVentureCode(ventureName);

    const result = {
      venture_id: ventureId,
      venture_name: ventureName,
      venture_code: ventureCode,
      ceo_agent_id: null,
      executive_agent_ids: {},
      crew_agent_ids: {},
      tool_grants_created: 0,
      relationships_created: 0,
      memory_stores_initialized: 0,
      total_agents_created: 0
    };

    try {
      // Step 1: Create CEO agent
      console.log('\n1️⃣  Creating CEO agent...');
      const ceo = await this._createAgent({
        agent_type: 'venture_ceo',
        agent_role: template.ceo.agent_role,
        display_name: template.ceo.display_name_template.replace('{venture_name}', ventureName),
        parent_agent_id: parentAgentId,
        hierarchy_level: 2,
        hierarchy_path: `chairman.eva.${ventureCode}_ceo`,
        venture_id: ventureId,
        capabilities: template.ceo.capabilities,
        delegation_authority: template.ceo.delegation_authority,
        token_budget: Math.round(totalTokenBudget * (template.budget_distribution.ceo_percentage / 100))
      });
      result.ceo_agent_id = ceo.id;
      result.total_agents_created++;
      console.log(`   ✅ CEO created: ${ceo.id}`);

      // Step 2: Create VP agents
      console.log('\n2️⃣  Creating VP agents...');
      const vpBudget = Math.round(totalTokenBudget * (template.budget_distribution.vp_percentage / 100));
      const budgetPerVp = Math.round(vpBudget / template.executives.length);

      for (const exec of template.executives) {
        const vp = await this._createAgent({
          agent_type: 'executive',
          agent_role: exec.agent_role,
          display_name: exec.display_name_template.replace('{venture_name}', ventureName),
          parent_agent_id: ceo.id,
          hierarchy_level: 3,
          hierarchy_path: `chairman.eva.${ventureCode}_ceo.${exec.agent_role.toLowerCase()}`,
          venture_id: ventureId,
          capabilities: exec.capabilities,
          token_budget: exec.token_budget || budgetPerVp,
          context_window_id: null
        });
        result.executive_agent_ids[exec.agent_role] = vp.id;
        result.total_agents_created++;
        console.log(`   ✅ ${exec.agent_role} created: ${vp.id}`);

        // Grant tools to VP
        if (exec.tools && exec.tools.length > 0) {
          const grantsCreated = await this._grantTools(vp.id, exec.tools, ceo.id);
          result.tool_grants_created += grantsCreated;
        }

        // Create CEO -> VP relationship
        await this._createRelationship(ceo.id, vp.id, 'supervises');
        await this._createRelationship(vp.id, ceo.id, 'reports_to');
        result.relationships_created += 2;
      }

      // Step 3: Create crew agents
      console.log('\n3️⃣  Creating crew agents...');
      for (const crew of template.crews) {
        const parentVpId = result.executive_agent_ids[crew.executive_parent];
        if (!parentVpId) {
          console.warn(`   ⚠️  Skipping ${crew.agent_role}: parent VP ${crew.executive_parent} not found`);
          continue;
        }

        const crewAgent = await this._createAgent({
          agent_type: 'crew',
          agent_role: crew.agent_role,
          display_name: `${ventureName} ${crew.agent_role.replace(/_/g, ' ')}`,
          parent_agent_id: parentVpId,
          hierarchy_level: 4,
          hierarchy_path: `chairman.eva.${ventureCode}_ceo.${crew.executive_parent.toLowerCase()}.${crew.agent_role.toLowerCase()}`,
          venture_id: ventureId,
          capabilities: crew.capabilities,
          token_budget: crew.token_budget || 5000
        });

        if (!result.crew_agent_ids[crew.executive_parent]) {
          result.crew_agent_ids[crew.executive_parent] = [];
        }
        result.crew_agent_ids[crew.executive_parent].push(crewAgent.id);
        result.total_agents_created++;

        // Create VP -> crew relationship
        await this._createRelationship(parentVpId, crewAgent.id, 'supervises');
        await this._createRelationship(crewAgent.id, parentVpId, 'reports_to');
        result.relationships_created += 2;
      }
      console.log(`   ✅ Created ${template.crews.length} crews`);

      // Step 4: Initialize CEO memory
      console.log('\n4️⃣  Initializing CEO memory...');
      await this._initializeCeoMemory(ceo.id, {
        venture_id: ventureId,
        venture_name: ventureName,
        venture_code: ventureCode,
        template_id: templateId,
        created_at: new Date().toISOString(),
        vp_ids: result.executive_agent_ids,
        total_agents: result.total_agents_created
      });
      result.memory_stores_initialized++;
      console.log('   ✅ CEO memory initialized');

      // Step 5: Send startup message to CEO
      console.log('\n5️⃣  Sending startup message to CEO...');
      await this._sendStartupMessage(ceo.id, parentAgentId, ventureName);
      console.log('   ✅ Startup message sent');

      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 INSTANTIATION COMPLETE');
      console.log('='.repeat(60));
      console.log(`   Venture: ${ventureName} (${ventureCode})`);
      console.log(`   CEO: ${result.ceo_agent_id}`);
      console.log(`   VPs: ${Object.keys(result.executive_agent_ids).length}`);
      console.log(`   Crews: ${Object.values(result.crew_agent_ids).flat().length}`);
      console.log(`   Total Agents: ${result.total_agents_created}`);
      console.log(`   Tool Grants: ${result.tool_grants_created}`);
      console.log(`   Relationships: ${result.relationships_created}`);
      console.log('');

      return result;

    } catch (error) {
      console.error(`\n❌ Instantiation failed: ${error.message}`);
      // Note: In production, would need rollback logic here
      throw error;
    }
  }

  /**
   * Get template by ID
   * @private
   */
  _getTemplate(templateId) {
    if (templateId === 'standard') {
      return STANDARD_VENTURE_TEMPLATE;
    }
    // Could extend to load from database
    return null;
  }

  /**
   * Generate venture code from name (lowercase, underscored)
   * @private
   */
  _generateVentureCode(ventureName) {
    return ventureName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 20);
  }

  /**
   * Create agent in agent_registry
   * @private
   */
  async _createAgent(agentData) {
    const agent = {
      id: uuidv4(),
      ...agentData,
      status: 'active',
      token_consumed: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('agent_registry')
      .insert(agent)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create agent ${agentData.agent_role}: ${error.message}`);
    }

    return data;
  }

  /**
   * Create relationship between agents
   * @private
   */
  async _createRelationship(fromAgentId, toAgentId, relationshipType) {
    const { error } = await this.supabase
      .from('agent_relationships')
      .insert({
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        relationship_type: relationshipType,
        communication_channel: relationshipType === 'supervises' ? 'task_contract' : 'message_queue'
      });

    if (error && !error.message.includes('duplicate')) {
      console.warn(`   ⚠️  Relationship warning: ${error.message}`);
    }
  }

  /**
   * Grant tools to agent
   * @private
   */
  async _grantTools(agentId, toolNames, grantedBy) {
    let grantsCreated = 0;

    for (const toolName of toolNames) {
      // Get tool ID
      const { data: tool } = await this.supabase
        .from('tool_registry')
        .select('id')
        .eq('tool_name', toolName)
        .single();

      if (!tool) {
        console.warn(`   ⚠️  Tool "${toolName}" not found in registry`);
        continue;
      }

      const { error } = await this.supabase
        .from('tool_access_grants')
        .insert({
          agent_id: agentId,
          tool_id: tool.id,
          grant_type: 'direct',
          granted_by: grantedBy,
          daily_usage_limit: 100
        });

      if (!error) {
        grantsCreated++;
      }
    }

    return grantsCreated;
  }

  /**
   * Initialize CEO memory with venture context
   * @private
   */
  async _initializeCeoMemory(ceoId, context) {
    const { error } = await this.supabase
      .from('agent_memory_stores')
      .insert({
        agent_id: ceoId,
        memory_type: 'context',
        content: context,
        summary: `Initial context for venture ${context.venture_name}`,
        version: 1,
        is_current: true,
        importance_score: 1.0
      });

    if (error) {
      console.warn(`   ⚠️  Memory initialization warning: ${error.message}`);
    }
  }

  /**
   * Send startup message to CEO via agent_messages
   * @private
   */
  async _sendStartupMessage(ceoId, fromAgentId, ventureName) {
    const { error } = await this.supabase
      .from('agent_messages')
      .insert({
        message_type: 'task_delegation',
        from_agent_id: fromAgentId,
        to_agent_id: ceoId,
        correlation_id: uuidv4(),
        subject: `[STARTUP] Welcome ${ventureName} CEO`,
        body: {
          directive: 'Initialize venture operations',
          venture_name: ventureName,
          instructions: [
            'Review VP team composition',
            'Verify tool access grants',
            'Begin Stage 1 preparation'
          ],
          priority_stage: 1
        },
        priority: 'high',
        status: 'pending',
        requires_response: true,
        response_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

    if (error) {
      console.warn(`   ⚠️  Startup message warning: ${error.message}`);
    }
  }
}

// Export template for reference
export { STANDARD_VENTURE_TEMPLATE, WELL_KNOWN_IDS };

// Default export
export default VentureFactory;
