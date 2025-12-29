#!/usr/bin/env node
/**
 * Add User Stories for SD-VISION-V2-005
 * Vision V2: Venture CEO Runtime & Factory
 *
 * Creates user stories for venture instantiation and CEO runtime following INVEST criteria
 * with Given-When-Then acceptance criteria format (STORIES v2.0.0).
 *
 * Functional Requirements Mapping:
 * - FR-1: VentureFactory.instantiateVenture() function → US-001
 * - FR-2: Standard Venture Template → US-002
 * - FR-3: CEO Runtime Loop → US-003
 * - FR-4: CEO Handler Registry → US-004
 * - FR-5: Venture State Machine (CEO-owned) → US-005
 * - FR-6: Handoff Protocol (VP -> CEO) → US-006
 * - FR-7: EVA Delegated Mode Routing → US-007
 * - FR-8: Test Venture TestCo Instantiation → US-008
 *
 * Vision Spec Reference: docs/vision/specs/06-hierarchical-agent-architecture.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VISION-V2-005';
const PRD_ID = 'PRD-SD-VISION-V2-005';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
const userStories = [
  {
    story_key: 'SD-VISION-V2-005:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'VentureFactory.instantiateVenture() creates complete organizational structure',
    user_role: 'System Architect',
    user_want: 'A factory function that creates CEO, executives, and crews from a template when a venture is instantiated',
    user_benefit: 'Ventures have complete organizational structure automatically created with proper hierarchy, relationships, and tool grants',
    priority: 'critical',
    story_points: 13,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Standard venture instantiation',
        given: 'Standard venture template exists AND agent_registry table exists AND parent agent (EVA) exists',
        when: 'instantiateVenture("TestCo", ventureId, "standard_venture", evaAgentId, 1000000) is called',
        then: 'Function returns InstantiationResult with 19 agent IDs (1 CEO + 4 VPs + 14 crews) AND all agents created in agent_registry AND hierarchy_path follows pattern chairman.eva.testco_ceo.{vp}.{crew} AND tool_grants_created = 46'
      },
      {
        id: 'AC-001-2',
        scenario: 'CEO agent creation - Hierarchy level 2',
        given: 'instantiateVenture is called with ventureName="TestCo"',
        when: 'CEO agent is created',
        then: 'agent_type = "venture_ceo" AND agent_role = "VENTURE_CEO" AND display_name = "TestCo_CEO" AND hierarchy_level = 2 AND hierarchy_path = "chairman.eva.testco_ceo" AND parent_agent_id = evaAgentId AND venture_id = ventureId AND delegation_authority JSONB contains can_approve_spend_usd, auto_advance_stages, must_escalate_stages'
      },
      {
        id: 'AC-001-3',
        scenario: 'Executive agents creation - 4 VPs with stage ownership',
        given: 'CEO agent created successfully',
        when: 'Executive agents are created',
        then: '4 executive agents created (VP_STRATEGY, VP_PRODUCT, VP_TECH, VP_GROWTH) AND all have agent_type = "executive" AND hierarchy_level = 3 AND parent_agent_id = ceo.id AND hierarchy_path = "chairman.eva.testco_ceo.{vp_role}" AND each VP has correct capabilities and tools from template'
      },
      {
        id: 'AC-001-4',
        scenario: 'Crew agents creation - 14 crews under VPs',
        given: 'Executive agents created successfully',
        when: 'Crew agents are created',
        then: '14 crew agents created AND all have agent_type = "crew" AND hierarchy_level = 4 AND parent_agent_id matches correct VP AND hierarchy_path = "chairman.eva.testco_ceo.{vp}.{crew}" AND crews distributed correctly: VP_STRATEGY has 4 crews, VP_PRODUCT has 3, VP_TECH has 4, VP_GROWTH has 3'
      },
      {
        id: 'AC-001-5',
        scenario: 'Relationships creation - Reports-to and coordinates-with',
        given: 'All agents created',
        when: 'Relationships are established',
        then: 'agent_relationships table contains: VPs report_to CEO (4 rows), Crews report_to VPs (14 rows), VPs coordinates_with each other (12 rows bidirectional = 6 pairs), CEO supervises VPs (4 rows), VPs supervise crews (14 rows)'
      },
      {
        id: 'AC-001-6',
        scenario: 'Tool grants creation - VPs and crews get tools',
        given: 'All agents and relationships created',
        when: 'Tool access is granted',
        then: 'tool_access_grants table has entries for all VP tools (4 VPs × 3-4 tools = ~14 grants) AND all crew tools (14 crews × 2-3 tools = ~32 grants) AND access_type = "direct" AND granted_by matches parent agent'
      },
      {
        id: 'AC-001-7',
        scenario: 'CEO memory initialization - Venture context',
        given: 'CEO agent created and all structure complete',
        when: 'CEO memory is initialized',
        then: 'agent_memory_stores has entry with agent_id = ceo.id AND memory_type = "context" AND content includes venture_name, venture_id, template_used, organization_structure (executives + crews per VP), budget_allocation, created_at'
      },
      {
        id: 'AC-001-8',
        scenario: 'Startup message to CEO - Welcome message',
        given: 'All agents created and CEO memory initialized',
        when: 'Startup message is sent',
        then: 'agent_messages table has message with type = "broadcast", from_agent_id = evaAgentId, to_agent_id = ceo.id, subject contains "Welcome: You are now CEO of TestCo", body contains initial_budget and first_action, priority = "high"'
      },
      {
        id: 'AC-001-9',
        scenario: 'Budget distribution - Percentage allocation',
        given: 'Template budget_distribution = {ceo: 10%, VP_STRATEGY: 30%, VP_PRODUCT: 15%, VP_TECH: 35%, VP_GROWTH: 10%}',
        when: 'instantiateVenture called with tokenBudget = 1000000',
        then: 'CEO token_budget = 100000 AND VP_STRATEGY token_budget = 300000 AND VP_PRODUCT token_budget = 150000 AND VP_TECH token_budget = 350000 AND VP_GROWTH token_budget = 100000'
      },
      {
        id: 'AC-001-10',
        scenario: 'Error handling - Template not found',
        given: 'Template with id "invalid_template" does not exist',
        when: 'instantiateVenture called with templateId = "invalid_template"',
        then: 'Function throws error "Template not found: invalid_template" AND no agents created (transaction rollback)'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/instantiation/venture-factory.ts',
      'instantiateVenture() function implemented with all 6 steps (CEO, VPs, peer relationships, crews, memory init, startup message)',
      'Interface definitions: VentureTemplate, InstantiationResult',
      'All acceptance criteria passing',
      'Unit tests: 19 agents created, correct hierarchy, tool grants, relationships',
      'Error handling: template not found, transaction rollback on failure',
      'Function returns InstantiationResult with all IDs and counts',
      'Integration test: TestCo instantiation creates complete org structure'
    ],
    technical_notes: 'VentureFactory is the core instantiation pattern for creating complete organizational structures. Must be atomic (all-or-nothing transaction). Uses LTREE hierarchy_path for efficient ancestor/descendant queries. Budget distribution is percentage-based from template. Tool grants use "direct" access_type with parent agent as grantor. Peer coordination relationships are bidirectional between all VPs. Edge cases: Template missing (error), parent agent not found (error), duplicate venture name (allow, different venture IDs), insufficient budget (warning but proceed), LTREE path max length (validate < 100 chars).',
    implementation_approach: 'Create TypeScript function with 6 sequential steps: (1) Create CEO agent, (2) Create VPs in loop with tool grants, (3) Create peer coordination relationships, (4) Create crews in loop with tool grants, (5) Initialize CEO memory, (6) Send startup message. Use Supabase transactions for atomicity. Return InstantiationResult with all created IDs.',
    implementation_context: 'Foundation for all venture instantiation. Called by EVA when Chairman creates new venture. Replaces manual agent creation. Enables fractal multi-agent architecture.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 6.1 VentureTemplate',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 6.2 instantiateVenture()',
      'lib/supabase.ts - Database client',
      'Previous SD: SD-VISION-V2-004 created agent_registry, agent_relationships, tool_access_grants tables'
    ],
    example_code_patterns: {
      function_signature: `async function instantiateVenture(
  ventureName: string,
  ventureId: string,
  templateId: string = 'standard_venture',
  parentAgentId: string,
  tokenBudget: number
): Promise<InstantiationResult>`,
      create_agent: `const ceoAgent = await supabase
  .from('agent_registry')
  .insert({
    agent_type: 'venture_ceo',
    agent_role: template.ceo_config.role,
    display_name: \`\${ventureName}_CEO\`,
    parent_agent_id: parentAgentId,
    hierarchy_level: 2,
    hierarchy_path: \`chairman.eva.\${ventureName.toLowerCase()}_ceo\`,
    venture_id: ventureId,
    capabilities: template.ceo_config.capabilities,
    delegation_authority: template.ceo_config.delegation_authority,
    token_budget: tokenBudget * (template.budget_distribution.ceo / 100),
    status: 'active'
  })
  .select()
  .single();`,
      grant_tool: `await supabase
  .from('tool_access_grants')
  .insert({
    agent_id: execAgent.id,
    tool_name: toolName,
    access_type: 'direct',
    granted_by: ceoAgent.id
  });`,
      create_relationship: `await supabase
  .from('agent_relationships')
  .insert({
    source_agent_id: execAgent.id,
    target_agent_id: ceoAgent.id,
    relationship_type: 'reports_to'
  });`
    },
    testing_scenarios: [
      { scenario: 'Happy path - TestCo instantiation creates 19 agents', type: 'integration', priority: 'P0' },
      { scenario: 'CEO agent has correct hierarchy_level and delegation_authority', type: 'unit', priority: 'P0' },
      { scenario: '4 VPs created with correct parent and stage ownership', type: 'unit', priority: 'P0' },
      { scenario: '14 crews created under correct VPs', type: 'unit', priority: 'P0' },
      { scenario: 'Tool grants created for all VPs and crews', type: 'integration', priority: 'P1' },
      { scenario: 'Budget distributed correctly per template percentages', type: 'unit', priority: 'P1' },
      { scenario: 'Error handling - Template not found throws error', type: 'unit', priority: 'P2' },
      { scenario: 'Transaction rollback on failure - no partial agents created', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-001-venture-factory-instantiation.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Standard Venture Template defines organizational structure',
    user_role: 'System Architect',
    user_want: 'A JSON template defining CEO config, executives, crews, and budget distribution for standard ventures',
    user_benefit: 'New ventures can be instantiated with consistent organizational structure following proven patterns',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Template structure - Complete VentureTemplate interface',
        given: 'VentureTemplate interface is defined',
        when: 'STANDARD_VENTURE_TEMPLATE constant is created',
        then: 'Template has id = "standard_venture" AND name = "Standard Venture Organization" AND ceo_config with role, capabilities, delegation_authority AND executives array with 4 VPs AND crews array with 14 crews AND budget_distribution with ceo + 4 VP percentages'
      },
      {
        id: 'AC-002-2',
        scenario: 'CEO configuration - Delegation authority',
        given: 'STANDARD_VENTURE_TEMPLATE.ceo_config',
        when: 'CEO delegation_authority is defined',
        then: 'delegation_authority contains can_approve_spend_usd = 500 AND can_approve_token_budget = 100000 AND can_hire_crews = true AND can_fire_crews = true AND escalation_threshold_confidence = 0.7 AND auto_advance_stages array includes [1, 2, 4, 6, 7, 8, 9, 10] AND must_escalate_stages array includes [3, 5, 13, 16, 23, 25]'
      },
      {
        id: 'AC-002-3',
        scenario: 'Executive definitions - 4 VPs with stage ownership',
        given: 'STANDARD_VENTURE_TEMPLATE.executives',
        when: 'Executive array is defined',
        then: 'executives.length = 4 AND VP_STRATEGY owns stages [1-9] with tools [web_search, market_data, financial_model, tam_calculator] AND VP_PRODUCT owns stages [10-12] with tools [web_search, document_writer, image_generator] AND VP_TECH owns stages [13-20] with tools [code_generator, venture_query, artifact_store] AND VP_GROWTH owns stages [21-25] with tools [venture_query, web_search, document_writer]'
      },
      {
        id: 'AC-002-4',
        scenario: 'Crew definitions - 14 crews mapped to VPs',
        given: 'STANDARD_VENTURE_TEMPLATE.crews',
        when: 'Crew array is defined',
        then: 'crews.length = 14 AND VP_STRATEGY has 4 crews (MARKET_RESEARCH_CREW, COMPETITIVE_INTEL_CREW, FINANCIAL_MODELING_CREW, RISK_ASSESSMENT_CREW) AND VP_PRODUCT has 3 crews (NAMING_CREW, GTM_CREW, SALES_PLAYBOOK_CREW) AND VP_TECH has 4 crews (ARCHITECTURE_CREW, IMPLEMENTATION_CREW, QA_CREW, SECURITY_CREW) AND VP_GROWTH has 3 crews (ANALYTICS_CREW, OPTIMIZATION_CREW, SCALE_CREW)'
      },
      {
        id: 'AC-002-5',
        scenario: 'Budget distribution - Percentage allocation sums to 100%',
        given: 'STANDARD_VENTURE_TEMPLATE.budget_distribution',
        when: 'Budget percentages are defined',
        then: 'ceo = 10 AND VP_STRATEGY = 30 AND VP_PRODUCT = 15 AND VP_TECH = 35 AND VP_GROWTH = 10 AND total = 100%'
      },
      {
        id: 'AC-002-6',
        scenario: 'Template retrieval - getTemplate() function',
        given: 'Template registry with STANDARD_VENTURE_TEMPLATE',
        when: 'getTemplate("standard_venture") is called',
        then: 'Function returns VentureTemplate object AND template.id = "standard_venture"'
      },
      {
        id: 'AC-002-7',
        scenario: 'Error path - Template not found',
        given: 'Template registry does not contain "custom_template"',
        when: 'getTemplate("custom_template") is called',
        then: 'Function throws error "Template not found: custom_template"'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/instantiation/templates/standard-venture-template.ts',
      'VentureTemplate interface defined with all required fields',
      'STANDARD_VENTURE_TEMPLATE constant exported',
      'getTemplate() function implemented with template registry',
      'Template validation: budget sums to 100%, all required fields present',
      'All 4 VPs defined with correct stage ownership',
      'All 14 crews defined with correct executive_parent',
      'Unit tests verify template structure and validation'
    ],
    technical_notes: 'Standard template follows Vision v2 spec Section 6.1. CEO delegation_authority.auto_advance_stages includes low-risk stages that CEO can approve automatically. must_escalate_stages are high-risk gates requiring Chairman approval (e.g., Stage 3 = Commit/Kill, Stage 13 = Arch Review, Stage 25 = Launch). Budget distribution reflects typical venture needs: Strategy heavy upfront (30%), Tech heavy mid-stage (35%), Growth at end (10%). Edge cases: Custom templates can be added to registry, budget percentages can vary but must sum to 100%, stage ownership can overlap if needed.',
    implementation_approach: 'Define TypeScript interface VentureTemplate. Create STANDARD_VENTURE_TEMPLATE constant following spec. Implement getTemplate() function with Map-based registry. Add validation function to check budget sums to 100%.',
    implementation_context: 'Template system enables standardized venture creation. Future: Custom templates for specific venture types (e.g., hardware, SaaS, marketplace).',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 6.1 VentureTemplate interface',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Lines 773-850 STANDARD_VENTURE_TEMPLATE definition'
    ],
    example_code_patterns: {
      interface_definition: `interface VentureTemplate {
  id: string;
  name: string;
  description: string;
  ceo_config: {
    role: string;
    capabilities: string[];
    delegation_authority: DelegationAuthority;
    initial_context: Record<string, any>;
  };
  executives: Array<{
    role: string;
    capabilities: string[];
    tools: string[];
    stage_ownership: number[];
  }>;
  crews: Array<{
    role: string;
    executive_parent: string;
    capabilities: string[];
    tools: string[];
  }>;
  budget_distribution: {
    ceo: number;
    executives: Record<string, number>;
  };
}`,
      template_constant: `export const STANDARD_VENTURE_TEMPLATE: VentureTemplate = {
  id: 'standard_venture',
  name: 'Standard Venture Organization',
  description: '4-VP structure for full-lifecycle ventures',
  ceo_config: { /* ... */ },
  executives: [ /* ... */ ],
  crews: [ /* ... */ ],
  budget_distribution: { /* ... */ }
};`,
      get_template: `const TEMPLATE_REGISTRY = new Map<string, VentureTemplate>([
  ['standard_venture', STANDARD_VENTURE_TEMPLATE],
]);

export async function getTemplate(templateId: string): Promise<VentureTemplate> {
  const template = TEMPLATE_REGISTRY.get(templateId);
  if (!template) {
    throw new Error(\`Template not found: \${templateId}\`);
  }
  return template;
}`
    },
    testing_scenarios: [
      { scenario: 'Template has all required fields', type: 'unit', priority: 'P0' },
      { scenario: 'Budget distribution sums to 100%', type: 'unit', priority: 'P0' },
      { scenario: '4 VPs with correct stage ownership', type: 'unit', priority: 'P0' },
      { scenario: '14 crews with correct executive_parent', type: 'unit', priority: 'P0' },
      { scenario: 'getTemplate("standard_venture") returns template', type: 'unit', priority: 'P1' },
      { scenario: 'getTemplate("invalid") throws error', type: 'unit', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-002-standard-venture-template.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'CEO Runtime Loop processes messages autonomously',
    user_role: 'Agent Platform Developer',
    user_want: 'An autonomous runtime loop for CEO agents that claims messages, routes to handlers, executes, and emits results',
    user_benefit: 'CEO agents operate independently without manual triggering, processing their inbox at consistent throughput (10 messages/minute)',
    priority: 'critical',
    story_points: 13,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Runtime loop iteration',
        given: 'CEO agent exists with agentId AND handler registry configured AND agent_messages table has pending messages',
        when: 'runAgentLoop(runtime) executes one iteration',
        then: 'Loop claims next message using claimNextMessage() AND routes to handler based on message_type AND executes handler AND commits result AND emits outbound messages AND runs supervisor timers AND sleeps for pollIntervalMs'
      },
      {
        id: 'AC-003-2',
        scenario: 'Message claim - Atomic with priority ordering',
        given: 'agent_messages has 3 pending messages for CEO: priority [critical, normal, high]',
        when: 'claimNextMessage(ceoAgentId) is called',
        then: 'Function returns message with priority = "critical" AND message.status updated to "processing" AND delivered_at = NOW() AND message locked with FOR UPDATE SKIP LOCKED'
      },
      {
        id: 'AC-003-3',
        scenario: 'Handler routing - Registered handler found',
        given: 'Message with message_type = "task_delegation" AND handler registry has CEO_HANDLERS.get("task_delegation") = handleCEOTaskDelegation',
        when: 'Handler is retrieved from runtime.handlers',
        then: 'handler = handleCEOTaskDelegation function AND handler is executed with (agent, message) parameters'
      },
      {
        id: 'AC-003-4',
        scenario: 'Handler execution - Idempotency check',
        given: 'Handler for message is found',
        when: 'executeWithIdempotency(message, handler) is called',
        then: 'Function checks if message already processed (idempotency key) AND if not processed: runs handler AND if already processed: returns cached result'
      },
      {
        id: 'AC-003-5',
        scenario: 'Result commit - Update message status',
        given: 'Handler returns HandlerResult with success = true',
        when: 'commitMessageResult(message.id, result) is called',
        then: 'Message status updated to "completed" AND processed_at = NOW() AND result stored in message.result_data'
      },
      {
        id: 'AC-003-6',
        scenario: 'Outbound messages - Emit results to other agents',
        given: 'HandlerResult contains outboundMessages = [{type: "task_delegation", to_agent_id: vpId, ...}]',
        when: 'Outbound messages are emitted',
        then: 'For each outbound: sendMessage() inserts into agent_messages with status = "pending" AND from_agent_id = ceoAgentId'
      },
      {
        id: 'AC-003-7',
        scenario: 'Supervisor timers - Deadline watchdog and status rollup',
        given: 'Runtime has supervisorTimers configured',
        when: 'runSupervisorTimers(runtime) is called',
        then: 'Deadline watchdog checks for overdue messages AND status rollup aggregates subordinate progress AND timer results emitted as messages if needed'
      },
      {
        id: 'AC-003-8',
        scenario: 'Error handling - Handler not found',
        given: 'Message with message_type = "unknown_type" AND no handler registered',
        when: 'Handler lookup fails',
        then: 'Message marked as failed with markMessageFailed(message.id, "No handler registered") AND message.status = "failed" AND loop continues to next message'
      },
      {
        id: 'AC-003-9',
        scenario: 'Error handling - Runtime exception',
        given: 'Handler throws exception during execution',
        when: 'Error caught by runtime loop',
        then: 'logRuntimeError(agentId, error) logs error AND runtime sleeps for pollIntervalMs * 2 (backoff) AND loop continues'
      },
      {
        id: 'AC-003-10',
        scenario: 'Throughput - 10 messages per minute',
        given: 'pollIntervalMs = 6000 (6 seconds) AND 10 pending messages in queue',
        when: 'Runtime loop runs for 60 seconds',
        then: 'Approximately 10 messages processed (60s / 6s = 10 iterations) AND throughput measured at ~10 msg/min'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/runtime/agent-runtime.ts',
      'AgentRuntime interface defined',
      'runAgentLoop() function implemented with 7 steps',
      'claimNextMessage() function implemented with advisory lock',
      'executeWithIdempotency() function implemented',
      'commitMessageResult() function implemented',
      'runSupervisorTimers() function implemented',
      'Error handling for handler not found and runtime exceptions',
      'Unit tests: message claim, handler routing, result commit, error handling',
      'Integration test: CEO runtime loop processes 10 messages/minute',
      'Performance test: Throughput measurement at 10 msg/min'
    ],
    technical_notes: 'Runtime loop is the "heartbeat" of autonomous agents. Uses PostgreSQL advisory locks (FOR UPDATE SKIP LOCKED) for concurrent-safe message claiming. Idempotency prevents duplicate processing if handler crashes mid-execution. Supervisor timers run on each iteration to check deadlines and aggregate status. pollIntervalMs = 6000 (6s) gives ~10 msg/min throughput. Edge cases: No pending messages (sleep and continue), handler timeout (kill after 30s), database connection loss (retry with exponential backoff), message claim race condition (SKIP LOCKED handles this).',
    implementation_approach: 'Create infinite while loop with try-catch. Step 1: Claim message with SQL function. Step 2: Lookup handler from Map. Step 3: Execute handler with idempotency wrapper. Step 4: Commit result to database. Step 5: Emit outbound messages. Step 6: Run supervisor timers. Step 7: Sleep. Use Supabase RPC for claimNextMessage(). Implement idempotency with message.processing_key.',
    implementation_context: 'Core runtime for all agent types (CEO, VP, Crew). CEO handlers are specialized but runtime loop is generic. Future: Multi-threaded runtime with worker pool.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 9.3 Agent Runtime Loop',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 9.4 Message Claim with Advisory Lock',
      'database/schema/agent_messages table - Message queue'
    ],
    example_code_patterns: {
      runtime_interface: `interface AgentRuntime {
  agentId: string;
  pollIntervalMs: number;
  handlers: Map<AgentMessageType, MessageHandler>;
  supervisorTimers: SupervisorTimer[];
}`,
      main_loop: `async function runAgentLoop(runtime: AgentRuntime): Promise<void> {
  while (true) {
    try {
      const message = await claimNextMessage(runtime.agentId);
      if (message) {
        const handler = runtime.handlers.get(message.message_type);
        if (!handler) {
          await markMessageFailed(message.id, 'No handler registered');
          continue;
        }
        const result = await executeWithIdempotency(message, handler);
        await commitMessageResult(message.id, result);
        for (const outbound of result.outboundMessages) {
          await sendMessage(outbound);
        }
      }
      await runSupervisorTimers(runtime);
      await sleep(runtime.pollIntervalMs);
    } catch (error) {
      await logRuntimeError(runtime.agentId, error);
      await sleep(runtime.pollIntervalMs * 2);
    }
  }
}`,
      claim_message: `async function claimNextMessage(agentId: string): Promise<AgentMessage | null> {
  const { data } = await supabase.rpc('fn_claim_next_message', {
    p_agent_id: agentId
  });
  return data;
}`
    },
    testing_scenarios: [
      { scenario: 'Happy path - Runtime loop processes message end-to-end', type: 'integration', priority: 'P0' },
      { scenario: 'Message claim with priority ordering (critical > high > normal)', type: 'unit', priority: 'P0' },
      { scenario: 'Handler routing finds correct handler for message_type', type: 'unit', priority: 'P0' },
      { scenario: 'Idempotency prevents duplicate processing', type: 'integration', priority: 'P1' },
      { scenario: 'Outbound messages emitted correctly', type: 'integration', priority: 'P1' },
      { scenario: 'Throughput test - 10 messages per minute', type: 'performance', priority: 'P1' },
      { scenario: 'Error handling - Handler not found', type: 'unit', priority: 'P2' },
      { scenario: 'Error handling - Runtime exception with backoff', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-003-ceo-runtime-loop.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'CEO Handler Registry maps message types to handler functions',
    user_role: 'Agent Platform Developer',
    user_want: 'A registry mapping agent message types to specialized handler functions for CEO agents',
    user_benefit: 'CEO agents can process different message types (task_delegation, task_completion, escalation, etc.) with appropriate business logic',
    priority: 'high',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Handler registry - CEO_HANDLERS map',
        given: 'CEO agent needs to process 5 message types',
        when: 'CEO_HANDLERS registry is defined',
        then: 'Map contains 5 entries: ["task_delegation" → handleCEOTaskDelegation], ["task_completion" → handleCEOTaskCompletion], ["status_report" → handleCEOStatusReport], ["escalation" → handleCEOEscalation], ["query" → handleCEOQuery]'
      },
      {
        id: 'AC-004-2',
        scenario: 'Task delegation handler - Decompose and assign to VPs',
        given: 'CEO receives task_delegation message from EVA with StrategicDirective',
        when: 'handleCEOTaskDelegation(agent, message) is called',
        then: 'Handler updates CEO memory with active_directive AND decomposes directive into VP-level tasks AND assigns tasks to VPs based on stage_ownership AND generates outbound task_delegation messages to VPs AND returns HandlerResult with outboundMessages array'
      },
      {
        id: 'AC-004-3',
        scenario: 'Task completion handler - VP reports work done',
        given: 'CEO receives task_completion message from VP with completed work',
        when: 'handleCEOTaskCompletion(agent, message) is called',
        then: 'Handler updates CEO memory with task completion AND evaluates if stage can be completed AND if all VP tasks done: triggers handoff review AND returns HandlerResult with state updates'
      },
      {
        id: 'AC-004-4',
        scenario: 'Status report handler - Aggregate VP progress',
        given: 'CEO receives status_report message from VP',
        when: 'handleCEOStatusReport(agent, message) is called',
        then: 'Handler stores VP status in CEO memory AND aggregates progress across all VPs AND prepares rollup status for EVA AND returns HandlerResult with potential outbound status update to EVA'
      },
      {
        id: 'AC-004-5',
        scenario: 'Escalation handler - VP needs decision',
        given: 'CEO receives escalation message from VP with decision request',
        when: 'handleCEOEscalation(agent, message) is called',
        then: 'Handler evaluates escalation against delegation_authority AND if within authority: makes decision and responds to VP AND if exceeds authority: escalates to EVA/Chairman AND returns HandlerResult with decision or escalation message'
      },
      {
        id: 'AC-004-6',
        scenario: 'Query handler - Answer info request',
        given: 'CEO receives query message requesting venture status',
        when: 'handleCEOQuery(agent, message) is called',
        then: 'Handler retrieves requested info from CEO memory AND formats response AND returns HandlerResult with outbound response message'
      },
      {
        id: 'AC-004-7',
        scenario: 'Handler result structure - Standard return format',
        given: 'Any CEO handler executes successfully',
        when: 'Handler returns HandlerResult',
        then: 'Result contains success: boolean, outboundMessages: AgentMessage[], stateUpdates: MemoryUpdate[]'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/runtime/handler-registry.ts',
      'CEO_HANDLERS Map defined with 5 handlers',
      'handleCEOTaskDelegation() implemented with directive decomposition',
      'handleCEOTaskCompletion() implemented with handoff trigger',
      'handleCEOStatusReport() implemented with status aggregation',
      'handleCEOEscalation() implemented with authority check',
      'handleCEOQuery() implemented with memory lookup',
      'HandlerResult interface defined',
      'Unit tests for each handler with mock agent and message',
      'Integration test: Task delegation decomposes into VP tasks',
      'Integration test: Escalation routes correctly based on authority'
    ],
    technical_notes: 'Handler registry pattern enables extensibility (new message types = new handlers). CEO handlers are more complex than VP/Crew handlers because CEOs orchestrate subordinates. Task decomposition uses directive.stages to identify which VPs own which parts. Escalation handler checks delegation_authority.can_approve_spend_usd and escalation_threshold_confidence. Edge cases: Unknown message type (handler not found, fail message), directive spans multiple VPs (generate multiple tasks), escalation confidence below threshold (auto-escalate to Chairman).',
    implementation_approach: 'Create Map<AgentMessageType, MessageHandler> for CEO_HANDLERS. Implement 5 handler functions, each with signature (agent: Agent, message: AgentMessage) => Promise<HandlerResult>. Each handler: (1) Parse message.body, (2) Business logic, (3) Update memory, (4) Generate outbound messages, (5) Return result.',
    implementation_context: 'CEO handlers are the "brain" of venture CEOs. Directive decomposition is key innovation - CEO breaks down strategic directives into tactical VP tasks. Future: VP_HANDLERS and CREW_HANDLERS with simpler logic.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 9.5 Handler Registry by Agent Type',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Lines 1340-1391 handleCEOTaskDelegation example',
      'database/schema/agent_messages table - Message types'
    ],
    example_code_patterns: {
      handler_map: `const CEO_HANDLERS: Map<AgentMessageType, MessageHandler> = new Map([
  ['task_delegation', handleCEOTaskDelegation],
  ['task_completion', handleCEOTaskCompletion],
  ['status_report', handleCEOStatusReport],
  ['escalation', handleCEOEscalation],
  ['query', handleCEOQuery],
]);`,
      handler_example: `async function handleCEOTaskDelegation(
  agent: Agent,
  message: AgentMessage
): Promise<HandlerResult> {
  const directive = message.body as StrategicDirective;

  await updateAgentMemory(agent.id, {
    type: 'context',
    content: { active_directive: directive }
  });

  const vpTasks = await decomposeDirective(agent, directive);
  const taskAssignments = await assignTasksToVPs(agent.venture_id, vpTasks);

  const outboundMessages = taskAssignments.map(assignment => ({
    type: 'task_delegation',
    from_agent_id: agent.id,
    to_agent_id: assignment.vp_id,
    subject: \`Task: \${assignment.task.objective}\`,
    body: { task: assignment.task },
    priority: directive.urgency
  }));

  return {
    success: true,
    outboundMessages,
    stateUpdates: [{ type: 'decisions', content: { action: 'decomposed_directive' } }]
  };
}`
    },
    testing_scenarios: [
      { scenario: 'CEO_HANDLERS has 5 message type mappings', type: 'unit', priority: 'P0' },
      { scenario: 'Task delegation handler decomposes directive into VP tasks', type: 'integration', priority: 'P0' },
      { scenario: 'Task completion handler triggers handoff review', type: 'integration', priority: 'P1' },
      { scenario: 'Status report handler aggregates VP progress', type: 'unit', priority: 'P1' },
      { scenario: 'Escalation handler checks delegation authority', type: 'unit', priority: 'P1' },
      { scenario: 'Query handler retrieves info from CEO memory', type: 'unit', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-004-ceo-handler-registry.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Venture State Machine enforces CEO-only stage transitions',
    user_role: 'Agent Platform Developer',
    user_want: 'A state machine owned by CEO that enforces only CEO can commit stage transitions',
    user_benefit: 'Venture stage progression has single source of truth preventing state divergence between CEO and VPs',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'State machine structure - VentureStateMachine interface',
        given: 'Venture state machine needs to track venture and stage state',
        when: 'VentureStateMachine interface is defined',
        then: 'Interface contains venture_id, owner_ceo_id, venture_state (active|paused|pivoted|killed|launched), current_stage (number), stage_states (Map<number, StageState>), handoff_queue (HandoffPackage[])'
      },
      {
        id: 'AC-005-2',
        scenario: 'Happy path - CEO commits valid stage transition',
        given: 'CEO agent owns venture AND venture at stage 5 AND handoff package complete',
        when: 'commitStageTransition(ceoAgentId, 5, 6, handoffPackage) is called',
        then: 'Function verifies CEO ownership AND validates transition 5→6 (sequential) AND validates handoff package AND calls fn_commit_stage_transition RPC AND updates venture current_stage to 6 AND sends task_delegation message to VP owning stage 6 AND returns success: true'
      },
      {
        id: 'AC-005-3',
        scenario: 'Authorization check - Only CEO can commit',
        given: 'VP agent (not CEO) attempts stage transition',
        when: 'commitStageTransition(vpAgentId, 5, 6, handoffPackage) is called',
        then: 'Function throws error "Only CEO can commit stage transitions" AND no stage transition occurs'
      },
      {
        id: 'AC-005-4',
        scenario: 'Validation - Sequential stage transitions only',
        given: 'CEO agent at stage 5',
        when: 'commitStageTransition(ceoAgentId, 5, 7, handoffPackage) is called (skipping stage 6)',
        then: 'Function throws error "Invalid transition: 5 → 7" AND no stage transition occurs'
      },
      {
        id: 'AC-005-5',
        scenario: 'Validation - Complete handoff package required',
        given: 'Handoff package missing required artifacts',
        when: 'commitStageTransition called with incomplete handoff',
        then: 'validateHandoffPackage() throws error AND no stage transition occurs'
      },
      {
        id: 'AC-005-6',
        scenario: 'Database function - fn_commit_stage_transition RPC',
        given: 'PostgreSQL function fn_commit_stage_transition exists',
        when: 'RPC called with p_venture_id, p_from_stage, p_to_stage, p_handoff_package, p_committed_by',
        then: 'Function atomically updates venture current_stage AND inserts handoff record AND returns success'
      },
      {
        id: 'AC-005-7',
        scenario: 'Notification - Next VP notified of handoff',
        given: 'Stage transition committed from 5→6',
        when: 'getVPForStage(ventureId, 6) returns VP_STRATEGY AND sendMessage called',
        then: 'Task_delegation message sent to VP_STRATEGY with subject "Stage 6 Handoff: {stage_name}" AND body contains stage_number, handoff_package, predecessor_artifacts AND priority = high AND requires_response = true'
      },
      {
        id: 'AC-005-8',
        scenario: 'Stage state tracking - Map of stage statuses',
        given: 'VentureStateMachine.stage_states tracks all 25 stages',
        when: 'Stage 5 completed and transitioned',
        then: 'stage_states.get(5) = "completed" AND stage_states.get(6) = "in_progress"'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/state/venture-state-machine.ts',
      'VentureStateMachine interface defined',
      'StageState type defined (pending|queued|in_progress|review|completed|blocked|skipped|failed)',
      'commitStageTransition() function implemented with all validations',
      'validateHandoffPackage() function implemented',
      'getVPForStage() function implemented (lookup VP by stage_ownership)',
      'Database migration: fn_commit_stage_transition RPC function',
      'Unit tests: CEO authorization check, sequential validation, handoff validation',
      'Integration test: Stage transition updates database and notifies next VP',
      'Error handling: Non-CEO attempt, invalid transition, incomplete handoff'
    ],
    technical_notes: 'State machine ownership is CEO-controlled to prevent state divergence (CEO thinks stage 5, VP thinks stage 4). commitStageTransition is the ONLY way to advance stages - no direct database updates. fn_commit_stage_transition RPC ensures atomicity (venture update + handoff record insert). getVPForStage uses template.executives[].stage_ownership to find correct VP. Edge cases: Multiple VPs own same stage (route to primary), stage already completed (idempotent), handoff package validation failures (detailed error messages).',
    implementation_approach: 'Define VentureStateMachine interface and StageState type. Implement commitStageTransition with 4 validations: (1) CEO ownership, (2) Sequential transition, (3) Handoff complete, (4) Call RPC. Create PostgreSQL function fn_commit_stage_transition. Implement getVPForStage lookup. Send notification message to next VP.',
    implementation_context: 'CEO-owned state machine is core governance pattern. VPs propose handoffs, CEO commits transitions. Single source of truth prevents coordination failures. Future: Stage auto-advance based on delegation_authority.auto_advance_stages.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 10.2 Control Plane Decision',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 10.3 Venture State Machine (CEO-Owned)',
      'docs/vision/specs/02-api-contracts.md - StageStatus type'
    ],
    example_code_patterns: {
      interface: `interface VentureStateMachine {
  venture_id: string;
  owner_ceo_id: string;
  venture_state: 'active' | 'paused' | 'pivoted' | 'killed' | 'launched';
  current_stage: number;
  stage_states: Map<number, StageState>;
  handoff_queue: HandoffPackage[];
}`,
      commit_transition: `async function commitStageTransition(
  ceoAgentId: string,
  fromStage: number,
  toStage: number,
  handoff: HandoffPackage
): Promise<TransitionResult> {
  const ceo = await getAgent(ceoAgentId);
  if (ceo.agent_type !== 'venture_ceo') {
    throw new Error('Only CEO can commit stage transitions');
  }

  if (toStage !== fromStage + 1) {
    throw new Error(\`Invalid transition: \${fromStage} → \${toStage}\`);
  }

  validateHandoffPackage(handoff);

  await supabase.rpc('fn_commit_stage_transition', {
    p_venture_id: ceo.venture_id,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_handoff_package: handoff,
    p_committed_by: ceoAgentId
  });

  const nextVP = await getVPForStage(ceo.venture_id, toStage);
  await sendMessage({ /* ... */ });

  return { success: true, new_stage: toStage };
}`,
      rpc_function: `CREATE OR REPLACE FUNCTION fn_commit_stage_transition(
  p_venture_id UUID,
  p_from_stage INT,
  p_to_stage INT,
  p_handoff_package JSONB,
  p_committed_by UUID
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE ventures
  SET current_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id AND current_stage = p_from_stage;

  INSERT INTO stage_handoffs (venture_id, from_stage, to_stage, handoff_package, committed_by)
  VALUES (p_venture_id, p_from_stage, p_to_stage, p_handoff_package, p_committed_by);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;`
    },
    testing_scenarios: [
      { scenario: 'CEO commits valid sequential stage transition', type: 'integration', priority: 'P0' },
      { scenario: 'Non-CEO agent blocked from committing transition', type: 'unit', priority: 'P0' },
      { scenario: 'Non-sequential transition rejected (5→7)', type: 'unit', priority: 'P0' },
      { scenario: 'Incomplete handoff package rejected', type: 'unit', priority: 'P1' },
      { scenario: 'Next VP notified after transition', type: 'integration', priority: 'P1' },
      { scenario: 'Database RPC atomically updates venture and creates handoff record', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-005-venture-state-machine.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Handoff Protocol enables VP proposal and CEO commitment',
    user_role: 'Agent Platform Developer',
    user_want: 'A handoff protocol where VPs propose stage completion with artifacts and CEO reviews/approves',
    user_benefit: 'Stage transitions follow a formal review process ensuring deliverables are complete before advancing',
    priority: 'high',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Handoff package structure - Complete deliverables and context',
        given: 'VP completes stage work',
        when: 'HandoffPackage interface is defined',
        then: 'Interface contains from_stage, to_stage, from_vp_id, to_vp_id, artifacts (array with artifact_id, artifact_type, status), key_decisions (array), open_questions (array), assumptions_validated (array), risks_identified (array), proposed_by, proposed_at, approved_by, approved_at, committed_at'
      },
      {
        id: 'AC-006-2',
        scenario: 'VP proposes handoff - Send task_completion to CEO',
        given: 'VP_STRATEGY completes stage 5 AND all artifacts final',
        when: 'proposeHandoff(vpAgentId, handoffPackage) is called',
        then: 'Function gets VP agent AND gets CEO parent_agent_id AND sends task_completion message to CEO with subject "Stage 5 Complete - Handoff Proposed" AND body contains handoff_package with proposed_by = vpAgentId AND confidence score calculated AND priority = high'
      },
      {
        id: 'AC-006-3',
        scenario: 'CEO approves handoff - Commit transition',
        given: 'CEO receives handoff proposal AND reviews artifacts',
        when: 'handleCEOHandoffReview(ceoAgentId, handoffPackage, "approve") is called',
        then: 'Function calls commitStageTransition(ceoAgentId, handoff.from_stage, handoff.to_stage, handoffWithApproval) AND handoff updated with approved_by = ceoAgentId, approved_at = NOW(), committed_at = NOW() AND stage transition committed'
      },
      {
        id: 'AC-006-4',
        scenario: 'CEO requests changes - Send back to VP',
        given: 'CEO reviews handoff AND identifies missing artifacts',
        when: 'handleCEOHandoffReview(ceoAgentId, handoffPackage, "request_changes") is called',
        then: 'Function sends query message to VP with subject "Handoff Changes Required: Stage 5" AND body contains original_handoff and required_changes AND no stage transition occurs'
      },
      {
        id: 'AC-006-5',
        scenario: 'CEO rejects handoff - Escalate or rework',
        given: 'CEO reviews handoff AND quality below threshold',
        when: 'handleCEOHandoffReview(ceoAgentId, handoffPackage, "reject") is called',
        then: 'Function sends rejection message to VP AND logs rejection reason AND no stage transition occurs AND optionally escalates to EVA if critical'
      },
      {
        id: 'AC-006-6',
        scenario: 'Handoff confidence calculation - Quality score',
        given: 'HandoffPackage with 3 final artifacts, 2 key decisions, 1 open question, 5 assumptions validated',
        when: 'calculateHandoffConfidence(handoffPackage) is called',
        then: 'Function returns confidence score 0.0-1.0 based on completeness: final artifacts (+), open questions (-), validated assumptions (+)'
      },
      {
        id: 'AC-006-7',
        scenario: 'Artifact validation - All deliverables final',
        given: 'HandoffPackage.artifacts = [{status: "final"}, {status: "draft"}, {status: "final"}]',
        when: 'validateHandoffPackage(handoff) checks artifact status',
        then: 'Validation fails with error "Handoff contains draft artifacts" AND identifies which artifacts not final'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/state/handoff-protocol.ts',
      'HandoffPackage interface defined with all fields',
      'proposeHandoff() function implemented',
      'handleCEOHandoffReview() function implemented with approve/reject/request_changes',
      'calculateHandoffConfidence() function implemented',
      'validateHandoffPackage() function validates artifacts, decisions, assumptions',
      'Unit tests: Handoff proposal, CEO approval, CEO rejection, change request',
      'Integration test: VP proposes → CEO approves → Stage transition',
      'Integration test: VP proposes → CEO requests changes → VP revises',
      'Confidence calculation tests with various handoff qualities'
    ],
    technical_notes: 'Handoff protocol is explicit governance preventing premature stage advancement. VPs propose (task_completion message), CEO reviews (using handleCEOHandoffReview), CEO commits (via commitStageTransition). Confidence calculation uses weighted factors: final artifacts (0.4), key decisions documented (0.2), open questions resolved (0.2), assumptions validated (0.2). Low confidence (<0.7) triggers CEO escalation to Chairman per delegation_authority.escalation_threshold_confidence. Edge cases: VP proposes twice (queue multiple proposals), CEO timeout on review (auto-escalate after 24h), missing artifacts (validation error with details).',
    implementation_approach: 'Define HandoffPackage interface. Implement proposeHandoff to construct task_completion message with handoff data. Implement handleCEOHandoffReview with switch on decision type. Implement calculateHandoffConfidence with weighted scoring. Integrate with commitStageTransition for approve path.',
    implementation_context: 'Handoff protocol is key quality gate. Prevents "garbage in, garbage out" across stages. CEO review ensures strategic alignment. Future: Auto-approve for low-risk stages based on delegation_authority.auto_advance_stages.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 10.4 Handoff Protocol',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Lines 1719-1744 proposeHandoff implementation',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Lines 1747-1775 handleCEOHandoffReview implementation'
    ],
    example_code_patterns: {
      interface: `interface HandoffPackage {
  from_stage: number;
  to_stage: number;
  from_vp_id: string;
  to_vp_id: string;
  artifacts: Array<{
    artifact_id: string;
    artifact_type: string;
    status: 'final' | 'draft';
  }>;
  key_decisions: string[];
  open_questions: string[];
  assumptions_validated: string[];
  risks_identified: string[];
  proposed_by: string;
  proposed_at: Date;
  approved_by?: string;
  approved_at?: Date;
  committed_at?: Date;
}`,
      propose_handoff: `async function proposeHandoff(
  vpAgentId: string,
  handoff: Omit<HandoffPackage, 'approved_by' | 'approved_at' | 'committed_at'>
): Promise<void> {
  const vp = await getAgent(vpAgentId);
  const ceo = await getAgent(vp.parent_agent_id);

  await sendMessage({
    type: 'task_completion',
    from_agent_id: vpAgentId,
    to_agent_id: ceo.id,
    subject: \`Stage \${handoff.from_stage} Complete - Handoff Proposed\`,
    body: {
      handoff_package: { ...handoff, proposed_by: vpAgentId, proposed_at: new Date() },
      recommendation: 'approve_handoff',
      confidence: await calculateHandoffConfidence(handoff)
    },
    priority: 'high',
    requires_response: true
  });
}`,
      handle_review: `async function handleCEOHandoffReview(
  ceoAgentId: string,
  handoff: HandoffPackage,
  decision: 'approve' | 'reject' | 'request_changes'
): Promise<void> {
  if (decision === 'approve') {
    await commitStageTransition(ceoAgentId, handoff.from_stage, handoff.to_stage, {
      ...handoff,
      approved_by: ceoAgentId,
      approved_at: new Date(),
      committed_at: new Date()
    });
  } else if (decision === 'request_changes') {
    await sendMessage({
      type: 'query',
      from_agent_id: ceoAgentId,
      to_agent_id: handoff.from_vp_id,
      subject: \`Handoff Changes Required: Stage \${handoff.from_stage}\`,
      body: { original_handoff: handoff, required_changes: decision.changes }
    });
  }
}`
    },
    testing_scenarios: [
      { scenario: 'VP proposes handoff with complete package', type: 'integration', priority: 'P0' },
      { scenario: 'CEO approves handoff and commits transition', type: 'integration', priority: 'P0' },
      { scenario: 'CEO requests changes and sends back to VP', type: 'integration', priority: 'P1' },
      { scenario: 'CEO rejects handoff with reason', type: 'unit', priority: 'P1' },
      { scenario: 'Confidence calculation with various handoff qualities', type: 'unit', priority: 'P1' },
      { scenario: 'Handoff validation fails with draft artifacts', type: 'unit', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-006-handoff-protocol.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-007',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'EVA Delegated Mode routes directives to CEO instead of crews',
    user_role: 'System Architect',
    user_want: 'EVA routing logic that sends directives to CEO when venture has CEO (delegated mode) vs crews directly (direct mode)',
    user_benefit: 'EVA operates as Chief Operating Officer managing CEOs, not as crew dispatcher, enabling scalable portfolio management',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Routing decision - Check if venture has CEO',
        given: 'EVA receives Chairman directive for venture',
        when: 'routeDirective(directive) is called',
        then: 'Function calls getVentureCEO(directive.venture_id) AND if CEO exists: routes to delegated mode AND if no CEO: routes to direct mode'
      },
      {
        id: 'AC-007-2',
        scenario: 'Delegated mode - Send to CEO',
        given: 'Venture has CEO agent AND directive received',
        when: 'Delegated mode routing executes',
        then: 'sendMessage creates task_delegation message with from_agent_id = EVA_AGENT_ID, to_agent_id = ceo.id, subject = "Chairman Directive: {command_text}", body = {directive}, priority = directive.priority, requires_response = true'
      },
      {
        id: 'AC-007-3',
        scenario: 'Direct mode - Dispatch to crews (legacy)',
        given: 'Venture has NO CEO agent AND directive received',
        when: 'Direct mode routing executes',
        then: 'dispatchToCrewsDirectly(directive) is called AND EVA orchestrates crews using legacy 04-eva-orchestration.md pattern'
      },
      {
        id: 'AC-007-4',
        scenario: 'getVentureCEO lookup - Query agent_registry',
        given: 'Venture with venture_id exists',
        when: 'getVentureCEO(ventureId) is called',
        then: 'Function queries agent_registry WHERE venture_id = {ventureId} AND agent_type = "venture_ceo" AND status = "active" AND returns CEO agent or null'
      },
      {
        id: 'AC-007-5',
        scenario: 'EVA responsibility shift - Briefing from CEOs not crews',
        given: 'EVA operates in delegated mode',
        when: 'generateChairmanBriefing() is called',
        then: 'EVA aggregates CEO status reports (not crew outputs) AND briefing shows CEO rollup summaries AND individual crew work not visible to Chairman'
      },
      {
        id: 'AC-007-6',
        scenario: 'Mode transition - Venture gets CEO mid-lifecycle',
        given: 'Venture operating in direct mode (no CEO) AND CEO is instantiated',
        when: 'Next directive arrives',
        then: 'routeDirective detects new CEO AND switches to delegated mode AND sends directive to CEO instead of crews'
      }
    ],
    definition_of_done: [
      'File created: lib/agents/eva/dispatch-router.ts',
      'routeDirective() function implemented with CEO check',
      'getVentureCEO() function implemented',
      'Delegated mode: Send task_delegation to CEO',
      'Direct mode: Call dispatchToCrewsDirectly (existing)',
      'Unit tests: CEO detection, delegated routing, direct routing',
      'Integration test: Venture with CEO routes to CEO',
      'Integration test: Venture without CEO routes to crews',
      'Mode transition test: Direct→Delegated when CEO instantiated'
    ],
    technical_notes: 'EVA dual-mode operation bridges legacy flat model (04-eva-orchestration.md) with new hierarchical model. Direct mode preserves backward compatibility for quick tasks or ventures without full org structure. Delegated mode is preferred for full-lifecycle ventures. getVentureCEO query must check status = "active" to exclude killed/archived ventures. Edge cases: CEO exists but inactive (fallback to direct mode), multiple CEOs per venture (error - should never happen), venture transitions mid-directive (queue directive for CEO to process).',
    implementation_approach: 'Create routeDirective function with getVentureCEO lookup. If CEO found: construct task_delegation message to CEO. If no CEO: call dispatchToCrewsDirectly. Implement getVentureCEO as simple agent_registry query. Update EVA briefing generation to aggregate from CEOs in delegated mode.',
    implementation_context: 'EVA evolution from crew dispatcher to COO. Delegated mode enables EVA to manage 10+ concurrent ventures by delegating operational details to CEOs. Future: EVA focuses on portfolio-level optimization, capital allocation, CEO performance management.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 13.2 Resolution (Dual Mode)',
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Section 13.3 Updated EVA Responsibilities',
      'docs/vision/specs/04-eva-orchestration.md - Legacy direct mode pattern'
    ],
    example_code_patterns: {
      route_directive: `async function routeDirective(directive: ChairmanDirective): Promise<void> {
  const venture = await getVenture(directive.venture_id);
  const ceo = await getVentureCEO(venture.id);

  if (ceo) {
    // DELEGATED MODE: Send to CEO
    await sendMessage({
      type: 'task_delegation',
      from_agent_id: EVA_AGENT_ID,
      to_agent_id: ceo.id,
      subject: \`Chairman Directive: \${directive.command_text.substring(0, 100)}\`,
      body: { directive },
      priority: directive.priority,
      requires_response: true
    });
  } else {
    // DIRECT MODE: EVA orchestrates crews directly
    await dispatchToCrewsDirectly(directive);
  }
}`,
      get_venture_ceo: `async function getVentureCEO(ventureId: string): Promise<Agent | null> {
  const { data } = await supabase
    .from('agent_registry')
    .select('*')
    .eq('venture_id', ventureId)
    .eq('agent_type', 'venture_ceo')
    .eq('status', 'active')
    .single();

  return data;
}`,
      mode_comparison: `// Delegated Mode vs Direct Mode
| Responsibility         | Direct Mode          | Delegated Mode            |
|------------------------|----------------------|---------------------------|
| Crew dispatch          | EVA does it          | CEO/VPs do it             |
| Artifact review        | EVA reviews          | CEO/VPs review            |
| Stage advancement      | EVA decides          | CEO commits               |
| Token tracking         | EVA tracks all       | CEO tracks, EVA sees rollup|
| Briefing generation    | Aggregate crew outputs| Aggregate CEO status reports|`
    },
    testing_scenarios: [
      { scenario: 'Venture with CEO routes to delegated mode', type: 'integration', priority: 'P0' },
      { scenario: 'Venture without CEO routes to direct mode', type: 'integration', priority: 'P0' },
      { scenario: 'getVentureCEO returns CEO when exists', type: 'unit', priority: 'P0' },
      { scenario: 'getVentureCEO returns null when no CEO', type: 'unit', priority: 'P0' },
      { scenario: 'Mode transition when CEO instantiated mid-lifecycle', type: 'integration', priority: 'P1' },
      { scenario: 'EVA briefing aggregates CEO reports in delegated mode', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-007-eva-delegated-mode.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-V2-005:US-008',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'TestCo test venture validates factory and runtime end-to-end',
    user_role: 'QA Engineer',
    user_want: 'A test venture "TestCo" that validates venture instantiation, CEO runtime, and handoff protocol work together',
    user_benefit: 'Complete integration test proves the fractal multi-agent architecture works before deploying to production ventures',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-008-1',
        scenario: 'TestCo instantiation - Create complete org structure',
        given: 'Standard venture template AND EVA agent exists',
        when: 'instantiateVenture("TestCo", testcoVentureId, "standard_venture", EVA_AGENT_ID, 1000000) is called',
        then: 'TestCo venture created with 19 agents (1 CEO + 4 VPs + 14 crews) AND all agents have hierarchy_path starting with "chairman.eva.testco_ceo" AND all tool grants created AND CEO memory initialized'
      },
      {
        id: 'AC-008-2',
        scenario: 'CEO runtime startup - Boot runtime loop',
        given: 'TestCo CEO agent created',
        when: 'TestCo CEO runtime loop started with CEO_HANDLERS',
        then: 'Runtime loop polling at 6s interval AND CEO receives startup message AND message status = "processing" then "completed"'
      },
      {
        id: 'AC-008-3',
        scenario: 'EVA delegates to TestCo CEO - Task delegation',
        given: 'TestCo CEO runtime active AND Chairman directive "Validate market for TestCo idea"',
        when: 'EVA routes directive via routeDirective()',
        then: 'EVA sends task_delegation to TestCo CEO (delegated mode) AND CEO runtime claims message AND handleCEOTaskDelegation executes AND CEO decomposes directive AND CEO sends tasks to VP_STRATEGY'
      },
      {
        id: 'AC-008-4',
        scenario: 'VP executes and proposes handoff - Stage completion',
        given: 'VP_STRATEGY receives task from CEO AND completes work (mock)',
        when: 'VP proposeHandoff to CEO with artifacts',
        then: 'VP sends task_completion message to CEO AND handoff package contains artifacts, key_decisions, assumptions_validated AND CEO runtime claims message'
      },
      {
        id: 'AC-008-5',
        scenario: 'CEO reviews and commits handoff - Stage transition',
        given: 'CEO receives handoff proposal from VP AND artifacts complete',
        when: 'handleCEOHandoffReview(ceoId, handoff, "approve") executes',
        then: 'CEO calls commitStageTransition AND venture current_stage incremented AND next VP notified AND stage_handoffs record created'
      },
      {
        id: 'AC-008-6',
        scenario: 'End-to-end flow validation - Full cycle',
        given: 'TestCo instantiated AND runtime active',
        when: 'EVA→CEO→VP→Crew→VP→CEO→NextVP flow completes',
        then: 'All 7 steps succeed: (1) EVA routes to CEO, (2) CEO decomposes, (3) CEO delegates to VP, (4) VP completes (mock), (5) VP proposes handoff, (6) CEO commits transition, (7) Next VP notified AND all messages processed AND no errors in runtime logs'
      },
      {
        id: 'AC-008-7',
        scenario: 'Performance validation - 10 messages/minute throughput',
        given: 'TestCo CEO runtime with 20 pending messages',
        when: 'Runtime runs for 2 minutes',
        then: 'Approximately 20 messages processed AND throughput ~10 msg/min AND no message processing failures AND no runtime errors'
      },
      {
        id: 'AC-008-8',
        scenario: 'Cleanup - Remove test venture',
        given: 'TestCo integration test complete',
        when: 'cleanupTestVenture(testcoVentureId) is called',
        then: 'All 19 TestCo agents deleted AND all TestCo messages deleted AND all TestCo relationships deleted AND all TestCo tool grants deleted AND venture record deleted'
      }
    ],
    definition_of_done: [
      'File created: tests/integration/vision-v2/testco-end-to-end.spec.ts',
      'Test instantiates TestCo using VentureFactory',
      'Test starts CEO runtime loop',
      'Test simulates EVA directive routing',
      'Test simulates CEO task delegation to VP',
      'Test simulates VP handoff proposal',
      'Test validates CEO handoff review and commit',
      'Test validates stage transition notification',
      'Test measures runtime throughput (10 msg/min)',
      'Test cleanup removes all TestCo data',
      'All acceptance criteria passing',
      'Integration test runs in CI/CD pipeline'
    ],
    technical_notes: 'TestCo is the "smoke test" for Vision v2 hierarchical architecture. Validates all components work together: VentureFactory, templates, CEO runtime, handler registry, state machine, handoff protocol, EVA delegation. Uses REAL database (not mocks) to catch integration issues. VP/Crew execution is mocked to isolate agent platform behavior. Throughput test ensures runtime loop performance meets spec (10 msg/min). Edge cases: Runtime crash mid-message (idempotency prevents duplicates), database connection loss (runtime recovers), message flood (priority queue handles gracefully).',
    implementation_approach: 'Create Vitest integration test. Step 1: Instantiate TestCo. Step 2: Start CEO runtime in background. Step 3: Send EVA directive. Step 4: Assert CEO decomposes. Step 5: Mock VP completion. Step 6: Assert handoff proposal. Step 7: Assert CEO commit. Step 8: Assert next VP notified. Step 9: Measure throughput. Step 10: Cleanup. Use Supabase transactions for test isolation.',
    implementation_context: 'TestCo proves Vision v2 architecture works before launching real ventures. Critical quality gate. Future: TestCo performance benchmarking, chaos testing (kill CEO mid-transaction), multi-venture concurrency tests.',
    architecture_references: [
      'docs/vision/specs/06-hierarchical-agent-architecture.md - Full specification',
      'All previous US-001 through US-007 user stories - Component integration',
      'tests/integration/ - Integration test patterns'
    ],
    example_code_patterns: {
      test_structure: `describe('TestCo End-to-End Integration', () => {
  let testcoVentureId: string;
  let ceoCo: Agent;
  let runtime: AgentRuntime;

  beforeAll(async () => {
    // Create TestCo
    const result = await instantiateVenture('TestCo', testcoVentureId, 'standard_venture', EVA_AGENT_ID, 1000000);
    testcoCEO = await getAgent(result.ceo_agent_id);

    // Start CEO runtime
    runtime = createRuntime(testcoCEO.id, CEO_HANDLERS);
    startRuntimeInBackground(runtime);
  });

  test('EVA routes directive to CEO (delegated mode)', async () => {
    const directive = createTestDirective('Validate market for TestCo');
    await routeDirective(directive);

    // Assert CEO received task_delegation message
    const messages = await getMessagesForAgent(testcoCEO.id);
    expect(messages).toContainEqual(expect.objectContaining({
      message_type: 'task_delegation',
      from_agent_id: EVA_AGENT_ID
    }));
  });

  afterAll(async () => {
    stopRuntime(runtime);
    await cleanupTestVenture(testcoVentureId);
  });
});`,
      throughput_test: `test('CEO runtime processes 10 messages per minute', async () => {
  const startTime = Date.now();
  const messageCount = 20;

  // Send 20 messages
  for (let i = 0; i < messageCount; i++) {
    await sendMessage({ /* ... */ });
  }

  // Wait for processing
  await waitForMessagesProcessed(testcoCEO.id, messageCount, 120000); // 2 min timeout

  const elapsedMs = Date.now() - startTime;
  const throughput = (messageCount / elapsedMs) * 60000; // msg/min

  expect(throughput).toBeGreaterThanOrEqual(9); // Allow 10% variance
  expect(throughput).toBeLessThanOrEqual(11);
});`
    },
    testing_scenarios: [
      { scenario: 'TestCo instantiation creates 19 agents', type: 'integration', priority: 'P0' },
      { scenario: 'CEO runtime processes startup message', type: 'integration', priority: 'P0' },
      { scenario: 'EVA routes directive to CEO (delegated mode)', type: 'integration', priority: 'P0' },
      { scenario: 'CEO decomposes directive into VP tasks', type: 'integration', priority: 'P0' },
      { scenario: 'VP proposes handoff with complete package', type: 'integration', priority: 'P0' },
      { scenario: 'CEO commits stage transition', type: 'integration', priority: 'P0' },
      { scenario: 'End-to-end flow completes without errors', type: 'integration', priority: 'P0' },
      { scenario: 'Runtime throughput meets 10 msg/min target', type: 'performance', priority: 'P1' },
      { scenario: 'Cleanup removes all TestCo data', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/vision-v2/US-008-testco-end-to-end.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'STORIES'
  }
];

async function main() {
  console.log(`\n📝 Creating ${userStories.length} user stories for ${SD_ID}...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    try {
      // Check if story already exists
      const { data: existing } = await supabase
        .from('user_stories')
        .select('id')
        .eq('story_key', story.story_key)
        .single();

      if (existing) {
        console.log(`⏭️  ${story.story_key} - Already exists, skipping`);
        continue;
      }

      // Insert user story
      const { data: _data, error } = await supabase
        .from('user_stories')
        .insert(story)
        .select()
        .single();

      if (error) {
        console.error(`❌ ${story.story_key} - Error:`, error.message);
        errorCount++;
      } else {
        console.log(`✅ ${story.story_key} - ${story.title}`);
        successCount++;
      }
    } catch (err) {
      console.error(`❌ ${story.story_key} - Exception:`, err.message);
      errorCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Created: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📝 Total: ${userStories.length}`);
  console.log(`\n✨ User stories for ${SD_ID} complete!\n`);
}

main().catch(console.error);
