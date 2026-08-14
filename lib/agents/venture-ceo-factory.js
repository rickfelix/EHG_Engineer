/**
 * VentureFactory - Creates hierarchical agent structure for ventures
 *
 * SD-VISION-V2-005: Vision V2 Venture CEO Runtime & Factory
 * Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md Section 6
 *
 * Creates complete organizational structure from template:
 * - 1 CEO agent (hierarchy_level=2, parent=EVA)
 * - 6 VP agents (VP_STRATEGY, VP_PRODUCT, VP_TECH, VP_GROWTH, VP_MARKETING, VP_CUSTOMER)
 * - 21 crew agents distributed across VPs
 *
 * SD-FDBK-ENH-ADD-MARKETING-STANDARD-001: VP_MARKETING added as a STANDARD
 * (unconditionally instantiated) role per chairman ruling 2026-07-12, covering
 * continuous post-launch brand/content/SEO/demand-gen/lifecycle marketing —
 * a mandate that does not terminate at Stage 26, unlike VP_GROWTH's.
 *
 * SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (chairman-ratified V1 org-template delta):
 * per-venture VP_CUSTOMER (CS+Support folded) + Sales_Crew under VP_GROWTH; three
 * mandate extensions (post_stage_mandate on VP_TECH/VP_PRODUCT/VP_GROWTH — no VP
 * mandate terminates at a build stage anymore); and a SEPARATE EHG_SHARED_OPERATORS
 * export (FINANCE_BILLING/LEGAL_COMPLIANCE/SECURITY_POSTURE/DATA_PLATFORM — commodity
 * rails instantiated ONCE at the holdco level). Every new role carries its §1 run-state
 * duty cycle + an honest-idle no-op (define-now = behavior definition, not decoration).
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { v4 as uuidv4 } from 'uuid';
// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-1: identity+authority supersession seam.
// Fail-soft fold: substrate misses never break instantiation; gate ladder off by default.
import identityFold from '../org/factory-identity-fold.cjs';

// Well-known agent IDs (SD-VISION-V2-004)
const WELL_KNOWN_IDS = {
  CHAIRMAN: '00000000-0000-0000-0000-000000000001',
  EVA: '00000000-0000-0000-0000-000000000002'
};

/**
 * Standard venture template with CEO, 6 VPs, and 21 crews (per-venture roster).
 * EHG-shared operators (EHG_SHARED_OPERATORS) are instantiated ONCE at holdco level,
 * separately — they are NOT part of this per-venture count.
 * Based on spec Section 6.1 VentureTemplate interface
 */
const STANDARD_VENTURE_TEMPLATE = {
  id: 'standard',
  name: 'Standard Venture Template',
  description: 'Standard 28-agent per-venture organizational structure (1 CEO + 6 VPs + 21 crews)',

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
      // SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (F8): mandate extension past S12 — the
      // build-stage ownership above is unchanged; this adds the continuous live duty.
      post_stage_mandate: 'live-iteration past S12: weekly feedback/analytics review → backlog grooming (inbound-ingestion as intake); monthly roadmap iteration; per-release acceptance',
      honest_idle: 'no live users/feedback yet → no backlog fabricated; grooming no-ops on an empty inbound queue',
      token_budget: 25000
    },
    {
      agent_role: 'VP_TECH',
      display_name_template: '{venture_name} VP Tech',
      capabilities: ['tech_architecture', 'data_modeling', 'code_generation', 'qa_testing'],
      tools: ['code_generator', 'venture_query', 'artifact_store'],
      stage_ownership: [13, 14, 15, 16, 17, 18, 19, 20, 21],
      // SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (F1/F5): keep-live/SRE mandate past S21.
      post_stage_mandate: 'keep-live/SRE past S21: daily cert/renewal/DNS-drift/deploy-health watch; on-alert remediation (restart/rollback) via factory work orders; weekly dependency/CVE patch; deprovision-on-kill (harvest-before-teardown)',
      honest_idle: 'no deployed venture surface yet → monitors/remediation no-op; nothing to keep live',
      token_budget: 40000
    },
    {
      agent_role: 'VP_GROWTH',
      display_name_template: '{venture_name} VP Growth',
      capabilities: ['launch_planning', 'analytics', 'optimization', 'user_acquisition'],
      tools: ['web_search', 'sentiment_analyzer'],
      stage_ownership: [22, 23, 24, 25, 26],
      // SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (F9/F10): post-launch mandate past S26.
      post_stage_mandate: 'post-launch acquisition/analytics past S26: continuous user-acquisition + weekly KPI/analytics rollups to the evidence fabric (mandate no longer terminates at launch)',
      honest_idle: 'no launched venture yet → acquisition/analytics rounds no-op; no metrics fabricated',
      token_budget: 25000
    },
    {
      // SD-FDBK-ENH-ADD-MARKETING-STANDARD-001: continuous post-launch mandate —
      // stage_ownership is intentionally [] (no BUILD-pipeline stage binding),
      // unlike VP_GROWTH's [22-26] which terminates at launch.
      agent_role: 'VP_MARKETING',
      display_name_template: '{venture_name} VP Marketing',
      capabilities: ['brand_strategy', 'content_marketing', 'seo', 'demand_generation', 'lifecycle_marketing'],
      tools: ['web_search', 'document_writer', 'sentiment_analyzer', 'email_sender', 'image_generator'],
      stage_ownership: [],
      token_budget: 25000
    },
    {
      // SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (F3+F12 folded): new standard per-venture
      // VP_CUSTOMER — Customer Success + Support at this scale (split at scale per the
      // audit). Continuous mandate (stage_ownership=[]) like VP_MARKETING.
      agent_role: 'VP_CUSTOMER',
      display_name_template: '{venture_name} VP Customer',
      capabilities: ['customer_health_scoring', 'at_risk_detection', 'onboarding_sequence', 'support_intake', 'ticket_triage', 'churn_save_motion'],
      tools: ['document_writer', 'sentiment_analyzer', 'email_sender', 'venture_query'],
      stage_ownership: [],
      duty_cycle: 'on-signup onboarding sequence; weekly health scoring + at-risk detection → save-motion outreach; monthly cohort review; continuous support intake + triage + FAQ-class autonomous response (graduated autonomy); escalate bugs → VP_PRODUCT backlog, at-risk signals → CS',
      honest_idle: 'no customers/tickets yet → health scorer and support intake no-op; never fabricate health scores or tickets (no customers table populated)',
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

    // VP_GROWTH crews (4)
    { agent_role: 'Launch_Crew', executive_parent: 'VP_GROWTH', capabilities: ['launch_planning'], token_budget: 5000 },
    { agent_role: 'Analytics_Crew', executive_parent: 'VP_GROWTH', capabilities: ['analytics'], token_budget: 5000 },
    { agent_role: 'Growth_Crew', executive_parent: 'VP_GROWTH', capabilities: ['optimization'], token_budget: 5000 },
    // SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (F9): new Sales_Crew — a crew, not a VP
    // (smallest honest role; revisit VP_SALES at scale). ARM-ABLE for the v2 demand
    // test (arming is a separate named action; define-now ships the duty cycle text).
    { agent_role: 'Sales_Crew', executive_parent: 'VP_GROWTH', capabilities: ['outreach', 'reply_triage', 'pipeline_review', 'suppression_management'], token_budget: 5000,
      duty_cycle: 'daily outreach batch (manual-1:1, AUP-compliant) + reply triage via inbound-ingestion; pilot/preorder conversion; weekly pipeline review; suppression/opt-out honored',
      honest_idle: 'no prospects/replies yet → no outreach fabricated; suppression list always respected' },

    // VP_MARKETING crews (4)
    { agent_role: 'Brand_Content_Crew', executive_parent: 'VP_MARKETING', capabilities: ['brand_strategy', 'content_marketing'], token_budget: 5000 },
    { agent_role: 'SEO_Crew', executive_parent: 'VP_MARKETING', capabilities: ['seo'], token_budget: 5000 },
    { agent_role: 'Demand_Gen_Crew', executive_parent: 'VP_MARKETING', capabilities: ['demand_generation'], token_budget: 5000 },
    { agent_role: 'Lifecycle_Crew', executive_parent: 'VP_MARKETING', capabilities: ['lifecycle_marketing'], token_budget: 5000 },

    // VP_CUSTOMER crews (2) — SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (F3+F12 folded)
    { agent_role: 'Customer_Success_Crew', executive_parent: 'VP_CUSTOMER', capabilities: ['customer_health_scoring', 'onboarding_sequence', 'churn_save_motion'], token_budget: 5000,
      duty_cycle: 'weekly health scoring across the 4 dimensions + at-risk detection → outreach; on-signup onboarding; monthly cohort review',
      honest_idle: 'no customers yet → scorer no-ops; never fabricate a health score for a customer that does not exist' },
    { agent_role: 'Support_Crew', executive_parent: 'VP_CUSTOMER', capabilities: ['support_intake', 'ticket_triage', 'faq_response'], token_budget: 5000,
      duty_cycle: 'continuous intake from the venture public email rail; triage + FAQ-class autonomous response; escalate bugs → VP_PRODUCT, at-risk → CS; injection-quarantine draining',
      honest_idle: 'empty ticket queue → intake no-ops; no synthetic tickets, no fabricated responses' }
  ],

  budget_distribution: {
    ceo_percentage: 10,
    vp_percentage: 90
  }
};

/**
 * EHG-SHARED operators — SD-FDBK-ENH-ORG-TEMPLATE-DELTA-001 (§2 delta, chairman-ratified V1).
 *
 * Commodity rails that instantiate ONCE at the EHG (holdco) level — NOT per venture — so
 * chairman cost scales sub-linearly (one agent serves N ventures as ledger/tenant rows).
 * They are deliberately a SEPARATE structure from STANDARD_VENTURE_TEMPLATE (which
 * standard-instantiates per venture). Placement default = 'shared' for all four
 * (chairman-ratified; flippable per-operator later when a single venture's scale justifies
 * a dedicated agent). Each carries its §1 run-state duty cycle AND an honest-idle no-op —
 * define-now is real behavior definition, never role-rows-as-decoration; a defined-but-
 * unarmed operator no-ops honestly on empty inputs and NEVER fabricates activity.
 * Arming (wiring the duty cycle to a live scheduler/webhook) is a deferred named-trigger
 * action per §5 (V2/V3 demand-test riders), out of this define-now SD's scope.
 */
const EHG_SHARED_OPERATORS = [
  {
    agent_role: 'FINANCE_BILLING_OPERATOR',
    display_name: 'EHG Finance/Billing Operator',
    placement: 'shared',
    capabilities: ['payment_capture', 'reconciliation', 'mrr_churn_rollup', 'dunning', 'revenue_recognition', 'webhook_liveness_watch'],
    duty_cycle: 'event-driven payment capture (webhook → ledger); daily reconcile; weekly MRR/churn rollup to the evidence fabric; dunning sequence on failures (day 0/3/7 + email); monthly recognition; webhook-liveness watch',
    honest_idle: 'no payment/checkout events → capture, reconcile and dunning all no-op; never fabricate a ledger row or MRR figure',
    token_budget: 15000
  },
  {
    agent_role: 'LEGAL_COMPLIANCE_OPERATOR',
    display_name: 'EHG Legal/Compliance Operator',
    placement: 'shared',
    capabilities: ['policy_generation', 'consent_records', 'dsar_fulfillment', 'quarterly_policy_refresh'],
    duty_cycle: 'at-launch ToS/privacy/DPA/cookie-consent generation (templated per venture); consent records on signup; DSAR fulfillment on request (30-day statutory clock); quarterly policy refresh',
    honest_idle: 'no launches / no DSAR requests → generator and fulfillment no-op; never emit a policy for a venture that has not launched',
    token_budget: 12000
  },
  {
    agent_role: 'SECURITY_POSTURE_OPERATOR',
    display_name: 'EHG Security-Posture Operator',
    placement: 'shared',
    capabilities: ['cve_scanning', 'posture_recheck', 'secret_rotation_watch', 'abuse_anomaly_watch'],
    duty_cycle: 'weekly dependency/CVE scan of each live venture; posture re-check on each deploy; secret/credential rotation watch; abuse/anomaly watch (injection-quarantine consumer); findings → patch PRs as factory work orders',
    honest_idle: 'no deployed venture surface → scans and posture checks no-op; no synthetic findings',
    token_budget: 12000
  },
  {
    agent_role: 'DATA_PLATFORM_OPERATOR',
    display_name: 'EHG Data-Platform Operator',
    placement: 'shared',
    capabilities: ['telemetry_ingest', 'kpi_rollup', 'experiment_readouts'],
    duty_cycle: 'daily telemetry ingest across ventures; weekly KPI rollup to the evidence fabric; per-decision experiment readouts (incl. demand-test gauges) with real_event provenance',
    honest_idle: 'metrics_base_url null / no telemetry exposed → ingest skips HONESTLY (records a skip, never a fabricated metric); the pull stops skipping only when a venture deploys with /v1/metrics',
    token_budget: 15000
  },
  {
    // SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A: 5th shared operator. Owns the
    // standing model/tech-landscape reference (research_intelligence_reference table) that
    // EHG reads holdco-wide to stay ahead of the field. Ships DEFINED-BUT-UNARMED (armed:false):
    // arming the live duty cycle is a separate action gated on a chairman ratification stamp
    // (see lib/agents/research-intelligence-operator.js isOperatorArmed).
    agent_role: 'RESEARCH_INTELLIGENCE_OPERATOR',
    display_name: 'EHG Research-Intelligence Operator',
    placement: 'shared',
    capabilities: ['landscape_reference_curation', 'youtube_intake_triage', 'model_tech_trajectory_watch', 'versioned_reference_custody'],
    duty_cycle: 'periodic LIVE-research refresh of a standing model/tech-landscape reference (compute-continuously/read-many, holdco-wide, NOT recomputed per-venture); triages the eva_youtube_intake reference/insight lane, deciding which videos merit deeper analysis; writes accepted signals into research_intelligence_reference as versioned entries',
    honest_idle: 'no fresh landscape/intake signals -> the standing reference stands unchanged; triage and refresh no-op and NEVER fabricate a landscape update or a reference row',
    token_budget: 15000,
    // Defined-but-unarmed: the duty cycle is not wired to a live scheduler here. Arming
    // requires a chairman ratification stamp {ratified_by:'chairman', ratified_at, sd_key}.
    armed: false
  }
];

/**
 * VentureFactory - Creates complete venture organizational structure
 */
export class VentureFactory {
  constructor(supabaseClient = null) {
    this.supabase = supabaseClient || createSupabaseServiceClient();
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
          const grantsCreated = await this._grantTools(vp.id, exec.tools, ceo.id, {
            identity_id: vp._org_identity_id || null,
            role_key: exec.agent_role,
            venture_id: ventureId,
          });
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
   * Instantiate the 4 EHG_SHARED_OPERATORS at the holdco level (venture_id=null),
   * once for the whole fleet -- NOT per-venture. Idempotent: pre-checks
   * org_agent_identities for existing holdco (venture_id IS NULL) rows by role_key
   * before creating, so re-entry is a no-op rather than a duplicate or an error.
   * SD-LEO-INFRA-ORG-TEMPLATE-ARMING-001 (FR-1/FR-2). Chairman-ratified build-now
   * correction 2026-07-16 -- turned on unconditionally, not gated on any venture
   * reaching a lifecycle stage.
   */
  async instantiateSharedOperators() {
    const roleKeys = EHG_SHARED_OPERATORS.map((op) => op.agent_role.toUpperCase());

    const { data: existingRows, error: existingErr } = await this.supabase
      .from('org_agent_identities')
      .select('role_key')
      .is('venture_id', null)
      .in('role_key', roleKeys);
    if (existingErr) {
      throw new Error(`Failed to check existing shared-operator identities: ${existingErr.message}`);
    }
    const existingRoleKeys = new Set((existingRows || []).map((r) => r.role_key));

    const result = { created: [], already_existed: [], total: EHG_SHARED_OPERATORS.length };

    for (const operator of EHG_SHARED_OPERATORS) {
      const roleKey = operator.agent_role.toUpperCase();
      if (existingRoleKeys.has(roleKey)) {
        result.already_existed.push(roleKey);
        continue;
      }

      const hierarchyPath = `chairman.eva.shared.${operator.agent_role.toLowerCase()}`;

      // Repair path: a prior run may have created the agent_registry row but failed
      // (fail-soft by contract, per lib/org/factory-identity-fold.cjs) to record its
      // org_agent_identities row -- re-running _createAgent() here would collide on
      // the UNIQUE hierarchy_path and crash the whole batch. Detect and repair the
      // missing identity instead of re-inserting the registry row.
      const { data: existingAgent, error: existingAgentErr } = await this.supabase
        .from('agent_registry')
        .select('id')
        .eq('hierarchy_path', hierarchyPath)
        .maybeSingle();
      if (existingAgentErr) {
        throw new Error(`Failed to check existing agent_registry row for ${roleKey}: ${existingAgentErr.message}`);
      }

      let agentId;
      if (existingAgent) {
        agentId = existingAgent.id;
        const fold = await identityFold.recordIdentityForAgent(
          this.supabase,
          {
            agent_role: operator.agent_role,
            display_name: operator.display_name,
            agent_type: 'executive',
            hierarchy_path: hierarchyPath,
            capabilities: operator.capabilities,
            venture_id: null
          },
          { id: agentId }
        );
        if (!fold.recorded) {
          throw new Error(`Failed to repair missing identity for ${roleKey} (agent_registry row ${agentId} already exists): ${fold.reason || 'unknown'}`);
        }
      } else {
        const agent = await this._createAgent({
          agent_type: 'executive',
          agent_role: operator.agent_role,
          display_name: operator.display_name,
          parent_agent_id: WELL_KNOWN_IDS.EVA,
          hierarchy_level: 3,
          hierarchy_path: hierarchyPath,
          venture_id: null,
          capabilities: operator.capabilities,
          token_budget: operator.token_budget
        });
        if (!agent._org_identity_id) {
          throw new Error(`Failed to record identity for ${roleKey}: agent_registry row ${agent.id} was created but org_agent_identities write failed (fail-soft fold miss) -- re-run instantiateSharedOperators() to repair`);
        }
        agentId = agent.id;
      }

      await this._createRelationship(WELL_KNOWN_IDS.EVA, agentId, 'supervises');
      await this._createRelationship(agentId, WELL_KNOWN_IDS.EVA, 'reports_to');

      result.created.push(roleKey);
    }

    return result;
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

    // SPINE-001-B FR-1: record the role-specialized identity in the spine substrate.
    // BORN DENIED — this records who the agent is; every write authority arrives later
    // as an explicit writer_auth disposition (chairman/coordinator/calibration-engine).
    const fold = await identityFold.recordIdentityForAgent(this.supabase, agentData, data);
    if (!fold.recorded) {
      console.warn(`   [identity-fold] substrate miss for ${agentData.agent_role}: ${fold.reason || 'unknown'} (instantiation proceeds)`);
    }
    data._org_identity_id = fold.identity_id;

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
  async _grantTools(agentId, toolNames, grantedBy, identityRef = null) {
    let grantsCreated = 0;

    // SPINE-001-B FR-1/FR-2: tool grants route through the writer-authorization gate.
    // off → byte-identical; observe → would-deny evidence, grant proceeds; enforce →
    // an un-granted identity gets ZERO tool grants (born denied, fail-closed).
    if (identityRef) {
      const gate = await identityFold.gateFactoryToolGrant(this.supabase, identityRef);
      if (!gate.allow) {
        console.warn(`   [writer-auth] tool grants denied for ${identityRef.role_key}: ${gate.verdict.reason}`);
        return 0;
      }
    }

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
   * INDUSTRIAL-HARDENING-v2.9.0: Memory Partitioning
   * All memory operations MUST include venture_id to prevent cross-contamination
   * @private
   */
  async _initializeCeoMemory(ceoId, context) {
    // SOVEREIGN SEAL v2.9.0: Enforce venture_id on all memory writes
    if (!context.venture_id) {
      console.warn('[GOVERNANCE] INDUSTRIAL-v2.9.0: Memory init blocked - no venture_id in context');
      return;
    }

    const { error } = await this.supabase
      .from('agent_memory_stores')
      .insert({
        agent_id: ceoId,
        venture_id: context.venture_id, // INDUSTRIAL-HARDENING-v2.9.0: Memory isolation
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
export { STANDARD_VENTURE_TEMPLATE, EHG_SHARED_OPERATORS, WELL_KNOWN_IDS };

// Default export
export default VentureFactory;
