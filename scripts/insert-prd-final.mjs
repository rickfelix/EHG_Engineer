import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const prdData = {
  id: 'PRD-RECURSION-AI-001',
  directive_id: 'SD-RECURSION-AI-001',
  sd_id: 'SD-RECURSION-AI-001',
  sd_uuid: 'eb57d225-21a2-44f2-abf7-acef8352b371',
  title: 'AI-First Recursion Enhancement System with LLM Intelligence - PRD',
  status: 'planning',
  category: 'infrastructure',
  priority: 'critical',
  phase: 'planning',
  progress: 15,
  created_by: 'PLAN Agent (Claude)',
  
  executive_summary: `Transform existing UI-first recursion system into API-first system optimized for AI agents with LLM advisory intelligence.

**Business Value**: ROI 1,700% (32 weeks saved / 2 weeks investment), unblocks 100% of development team (all AI agents)
**Foundation**: 40% exists from SD-VENTURE-UNIFICATION-001
**Timeline**: 8 weeks, 4 implementation phases
**Strategic Alignment**: Critical for AI-First Organization initiative`,
  
  business_context: 'Current recursion system blocks AI agents with UI-first design. AI agents are 100% of development team and cannot interact with UI workflows. Need API-first system with LLM intelligence for intelligent decision-making and multi-agent coordination.',
  
  system_architecture: `API-First Architecture with 4 Layers:
1. API Layer: REST + GraphQL endpoints (<10ms response, Redis caching)
2. Intelligence Layer: LLM advisory engine (OpenAI/Anthropic, confidence scores 0.0-1.0)
3. Coordination Layer: Multi-agent handoff protocol (Zod validation, FSM state management)
4. Interface Layer: Chairman dashboard (React + Shadcn, desktop-first)

Reuse Existing (40%): recursionEngine.ts (450 LOC), RecursionHistoryPanel.tsx (483 LOC), recursion_events table, 553 tests`,
  
  technology_stack: 'Backend: Node.js + Express (REST), Apollo Server (GraphQL). Frontend: React + Vite + Shadcn. Database: PostgreSQL + Supabase. LLM: OpenAI GPT-4 or Anthropic Claude. Caching: Redis. Validation: Zod. Testing: Vitest (unit) + Playwright (E2E)',
  
  implementation_approach: `4 Sequential Phases (8 weeks total):

**Phase 1: API Foundation (2 weeks, ~900 LOC)**
- RecursionAPIController (400 LOC) - REST/GraphQL endpoints
- BatchValidationService (300 LOC) - Parallel 100+ scenarios
- AdaptiveThresholdManager (200 LOC) - Industry configs
Exit: API deployed, <10ms verified, E2E tests passing

**Phase 2: LLM Intelligence (2 weeks, ~800 LOC)**
- LLMAdvisoryEngine (400 LOC) - OpenAI/Anthropic integration
- ConfidenceScoreCalculator (200 LOC) - Weighted 0.0-1.0 scale
- PatternRecognitionService (200 LOC) - Semantic matching
Exit: LLM integrated, confidence scores working, fallback tested

**Phase 3: Multi-Agent Coordination (2 weeks, ~600 LOC)**
- AgentHandoffProtocol (300 LOC) - Zod schema validation
- CoordinationOrchestrator (300 LOC) - FSM state management
Exit: 4 agents coordinated, handoffs validated, rollback working

**Phase 4: Chairman Interface (2 weeks, ~700 LOC)**
- ChairmanOverrideInterface (400 LOC) - React desktop UI
- LearningFeedbackLoop (200 LOC) - Pattern extraction
- ChairmanDashboard (100 LOC) - Analytics/Calibration/Settings tabs
Exit: Override interface working, learning pipeline operational`,

  data_model: `New Tables (3):
1. llm_recommendations (8 columns): venture_id, scenario_id, recommendation, confidence_score, reasoning, created_at, metadata
2. chairman_overrides (10 columns): recommendation_id, decision (enum), rationale, modified_recommendation, outcome (enum), outcome_notes, created_at, created_by, metadata
3. agent_handoffs (7 columns): from_agent, to_agent, context (JSONB), status (enum), created_at, updated_at

RLS Policies:
- llm_recommendations: Read-only authenticated, insert service role
- chairman_overrides: Chairman role only
- agent_handoffs: Service role only`,

  api_specifications: `REST Endpoints:
POST /api/recursion/validate - Single scenario validation (<10ms)
POST /api/recursion/batch - Batch 100+ scenarios (<50ms)
GET /api/thresholds/:industry - Get industry thresholds
POST /api/thresholds/configure - Configure thresholds (Chairman only)

GraphQL:
mutation validateRecursion(ventureId, currentStage, stageData): RecursionValidationResult
mutation batchValidate(scenarios): BatchValidationResult
mutation overrideRecursion(recommendationId, decision, rationale): ChairmanOverrideResult
query recursionHistory(ventureId, limit): [RecursionEvent]
query llmRecommendations(ventureId): [LLMRecommendation]
query chairmanOverrides(limit): [ChairmanOverride]`,

  acceptance_criteria: [
    'API endpoints respond <10ms (avg over 100 requests)',
    'Batch validation handles 100+ scenarios',
    'LLM recommendations include confidence scores (0.0-1.0)',
    'Multi-agent handoffs validated via Zod schema',
    '4 agent types coordinated (Planner, Technical, Execution, Launch)',
    'Chairman override interface captures structured rationale',
    'Overrides feed LLM learning pipeline',
    'Adaptive thresholds support industry configs',
    'Fallback mechanisms operational',
    'Backward compatibility: legacy ventures unaffected',
    'Desktop-first UI (no mobile Phase 1)',
    'All E2E tests passing (100% coverage)',
    'Performance benchmarks met',
    'Quality score ≥70 in retrospective'
  ],
  
  functional_requirements: [
    { id: 'FR-01', requirement: 'API endpoints for recursion validation (REST + GraphQL)', priority: 'HIGH' },
    { id: 'FR-02', requirement: 'Batch validation supporting 100+ scenarios', priority: 'HIGH' },
    { id: 'FR-03', requirement: 'LLM advisory engine with confidence scores', priority: 'HIGH' },
    { id: 'FR-04', requirement: 'Multi-agent coordination protocol', priority: 'HIGH' },
    { id: 'FR-05', requirement: 'Chairman override interface with rationale capture', priority: 'MEDIUM' },
    { id: 'FR-06', requirement: 'Adaptive threshold management (industry-specific)', priority: 'MEDIUM' },
    { id: 'FR-07', requirement: 'Pattern recognition service (semantic matching)', priority: 'MEDIUM' },
    { id: 'FR-08', requirement: 'Learning feedback loop (overrides to LLM training)', priority: 'MEDIUM' },
    { id: 'FR-09', requirement: 'Chairman dashboard (Analytics, Calibration, Settings)', priority: 'LOW' },
    { id: 'FR-10', requirement: 'Backward compatibility with legacy UI system', priority: 'HIGH' }
  ],
  
  technical_requirements: [
    { id: 'TR-01', requirement: 'API response time <10ms (cached threshold lookups)', type: 'performance' },
    { id: 'TR-02', requirement: 'Batch processing 100+ scenarios in <50ms', type: 'performance' },
    { id: 'TR-03', requirement: 'LLM recommendation generation <2s (with caching <100ms)', type: 'performance' },
    { id: 'TR-04', requirement: 'Database queries <5ms (proper indexing)', type: 'performance' },
    { id: 'TR-05', requirement: 'Redis caching for threshold lookups', type: 'infrastructure' },
    { id: 'TR-06', requirement: 'Zod schema validation for agent handoffs', type: 'validation' },
    { id: 'TR-07', requirement: 'FSM state management for coordination', type: 'architecture' },
    { id: 'TR-08', requirement: 'RLS policies for all 3 new tables', type: 'security' }
  ],

  performance_requirements: [
    { metric: 'API Response Time', target: '<10ms', measurement: 'avg over 100 requests' },
    { metric: 'Batch Validation', target: '<50ms', measurement: '100 scenarios' },
    { metric: 'LLM Recommendation', target: '<2s', measurement: 'uncached, <100ms cached' },
    { metric: 'Database Query', target: '<5ms', measurement: 'with indexing' }
  ],
  
  test_scenarios: [
    { id: 'TS-API-001', scenario: 'POST /api/recursion/validate responds <10ms', test_type: 'performance' },
    { id: 'TS-API-002', scenario: 'Batch validation handles 100 scenarios in <50ms', test_type: 'performance' },
    { id: 'TS-LLM-001', scenario: 'LLM generates recommendation with confidence score', test_type: 'integration' },
    { id: 'TS-LLM-002', scenario: 'Fallback works when LLM unavailable', test_type: 'integration' },
    { id: 'TS-AGENT-001', scenario: 'Full multi-agent workflow (Planner to Launch)', test_type: 'e2e' },
    { id: 'TS-CHAIRMAN-001', scenario: 'Chairman approves/rejects/modifies recommendation', test_type: 'e2e' },
    { id: 'TS-BACKWARD-001', scenario: 'Legacy ventures continue on UI system', test_type: 'e2e' }
  ],
  
  risks: [
    { risk: 'LLM provider API changes', impact: 'medium', mitigation: 'Abstraction layer supports multiple providers (OpenAI, Anthropic)', fallback: 'Rule-based recommendations' },
    { risk: 'Performance targets aggressive (<10ms with LLM)', impact: 'high', mitigation: 'Redis caching, async LLM calls', acceptance: 'Sync API <10ms, LLM advisory <2s acceptable' },
    { risk: 'Multi-agent protocol ambiguity', impact: 'medium', mitigation: 'Zod schema validation enforces structure', testing: 'E2E tests validate all scenarios' },
    { risk: 'Wrong UI framework choice', impact: 'low', mitigation: 'Use existing EHG stack (React + Shadcn + Vite)', benefit: 'Reuse RecursionHistoryPanel component' },
    { risk: 'Backward compatibility broken', impact: 'high', mitigation: 'unification_version flag (legacy vs unified)', testing: 'E2E tests ensure legacy unaffected' },
    { risk: 'Incorrect RLS policies', impact: 'high', mitigation: 'Delegate to security-agent for creation', validation: 'Security sub-agent verification' },
    { risk: 'Wrong industry thresholds', impact: 'medium', mitigation: 'Chairman configuration interface with defaults', learning: 'Override patterns inform adjustments' },
    { risk: 'Phase dependencies blocking', impact: 'medium', mitigation: 'Sequential execution, clear exit criteria', tracking: 'Phase completion gates' }
  ],

  dependencies: [
    { type: 'internal', name: 'recursionEngine.ts', status: 'exists', note: '450 LOC existing, extend' },
    { type: 'internal', name: 'RecursionHistoryPanel.tsx', status: 'exists', note: '483 LOC existing, integrate' },
    { type: 'internal', name: 'recursion_events table', status: 'exists', note: '8 columns, extend' },
    { type: 'internal', name: 'Test suite', status: 'exists', note: '553 tests passing, extend to 800+' },
    { type: 'external', name: 'OpenAI GPT-4 or Anthropic Claude API', status: 'required', note: 'LLM provider' },
    { type: 'external', name: 'Redis', status: 'required', note: 'Caching for performance' },
    { type: 'external', name: 'Zod', status: 'required', note: 'Schema validation' },
    { type: 'external', name: 'React Hook Form', status: 'required', note: 'Chairman override UI' }
  ],

  constraints: [
    'Desktop-first UI only (no mobile in Phase 1)',
    'Backward compatibility with legacy ventures (no breaking changes)',
    'Sequential phase execution (Phase 2 depends on Phase 1 complete)',
    'Performance: API <10ms, batch <50ms, LLM <2s',
    'LLM advisory role only (not autonomous)',
    'Component sizing: 300-600 LOC per component (PLAN sweet spot)'
  ],

  assumptions: [
    'AI agents are 100% of development team (confirmed by user)',
    'Chairman approval required for all critical recursion decisions',
    'LLM provider APIs remain stable during 8-week implementation',
    'Redis caching infrastructure available in production',
    'Existing recursionEngine.ts can be extended without major refactor',
    '553 existing tests continue passing throughout implementation'
  ],

  plan_checklist: [
    { text: 'PRD created and saved', checked: true },
    { text: 'Component sizing documented (11 components, 3000 LOC)', checked: true },
    { text: 'Database schema designed (3 new tables)', checked: true },
    { text: 'API specification documented (REST + GraphQL)', checked: true },
    { text: 'Testing strategy defined (unit + E2E, dual tests)', checked: true },
    { text: 'Risk mitigations documented (8 risks with fallbacks)', checked: true },
    { text: 'Timeline set (8 weeks, 4 sequential phases)', checked: true },
    { text: 'Stakeholders identified (AI agents, Chairman)', checked: true }
  ],
  
  exec_checklist: [
    { text: 'Phase 1: API Foundation complete (900 LOC)', checked: false },
    { text: 'Phase 2: LLM Intelligence complete (800 LOC)', checked: false },
    { text: 'Phase 3: Multi-Agent Coordination complete (600 LOC)', checked: false },
    { text: 'Phase 4: Chairman Interface complete (700 LOC)', checked: false },
    { text: 'All unit tests passing (Vitest, 80%+ coverage)', checked: false },
    { text: 'All E2E tests passing (Playwright, 100% user stories)', checked: false },
    { text: 'Performance benchmarks met (Artillery load tests)', checked: false },
    { text: 'Database migrations applied (3 new tables)', checked: false },
    { text: 'RLS policies verified (security-agent)', checked: false },
    { text: 'Documentation updated (API specs, architecture)', checked: false }
  ],
  
  validation_checklist: [
    { text: 'All 14 acceptance criteria met', checked: false },
    { text: 'API response time <10ms verified (100 requests avg)', checked: false },
    { text: 'Batch validation 100+ scenarios verified (<50ms)', checked: false },
    { text: 'LLM recommendation accuracy >85% (Chairman override analysis)', checked: false },
    { text: 'Multi-agent workflow validated end-to-end (4 agents)', checked: false },
    { text: 'Chairman override learning pipeline working (pattern extraction)', checked: false },
    { text: 'Backward compatibility verified (legacy ventures unaffected)', checked: false },
    { text: 'Security review complete (RLS policies validated)', checked: false },
    { text: 'Performance testing passed (Artillery load tests)', checked: false },
    { text: 'Retrospective generated (quality_score ≥70 required)', checked: false }
  ],

  stakeholders: [
    { name: 'AI Agents (Development Team)', role: 'Primary Users', need: 'API access for recursion workflows' },
    { name: 'Chairman', role: 'Final Authority', need: 'Override interface with learning feedback' },
    { name: 'PLAN Agent', role: 'PRD Creator', need: 'Clear technical requirements and acceptance criteria' },
    { name: 'EXEC Agent', role: 'Implementer', need: 'Detailed implementation approach and component sizing' }
  ],

  metadata: {
    created_via_script: true,
    prd_version: '1.0',
    learning_context: {
      retrospectives_consulted: 0,
      issue_patterns_matched: 0,
      note: 'No infrastructure patterns found - pioneering SD'
    },
    existing_infrastructure_percent: 40,
    roi_multiplier: 17,
    total_estimated_loc: 3000,
    components: [
      { name: 'RecursionAPIController', loc: 400, phase: 1, complexity: 'medium' },
      { name: 'BatchValidationService', loc: 300, phase: 1, complexity: 'medium' },
      { name: 'AdaptiveThresholdManager', loc: 200, phase: 1, complexity: 'low' },
      { name: 'LLMAdvisoryEngine', loc: 400, phase: 2, complexity: 'high' },
      { name: 'ConfidenceScoreCalculator', loc: 200, phase: 2, complexity: 'medium' },
      { name: 'PatternRecognitionService', loc: 200, phase: 2, complexity: 'high' },
      { name: 'AgentHandoffProtocol', loc: 300, phase: 3, complexity: 'medium' },
      { name: 'CoordinationOrchestrator', loc: 300, phase: 3, complexity: 'high' },
      { name: 'ChairmanOverrideInterface', loc: 400, phase: 4, complexity: 'medium' },
      { name: 'LearningFeedbackLoop', loc: 200, phase: 4, complexity: 'high' },
      { name: 'ChairmanDashboard', loc: 100, phase: 4, complexity: 'low' }
    ],
    database_tables: {
      new: ['llm_recommendations', 'chairman_overrides', 'agent_handoffs'],
      existing: ['recursion_events', 'strategic_directives_v2', 'ventures']
    }
  }
};

console.log('📋 Inserting Comprehensive PRD for SD-RECURSION-AI-001...\n');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdData)
  .select()
  .single();

if (error) {
  console.error('❌ Error:', error.message);
  console.error('Details:', error);
  process.exit(1);
}

console.log('✅ PRD Created Successfully!');
console.log('\n📊 PRD Summary:');
console.log('ID:', data.id);
console.log('Status:', data.status);
console.log('Progress:', data.progress, '%');
console.log('Functional Requirements:', data.functional_requirements.length);
console.log('Technical Requirements:', data.technical_requirements.length);
console.log('Acceptance Criteria:', data.acceptance_criteria.length);
console.log('Test Scenarios:', data.test_scenarios.length);
console.log('Risks Documented:', data.risks.length);
console.log('Components Designed:', data.metadata.components.length);
console.log('Total Estimated LOC:', data.metadata.total_estimated_loc);
console.log('\n🎯 Next Steps:');
console.log('1. Auto-trigger STORIES sub-agent (user story generation)');
console.log('2. Execute RISK sub-agent (risk assessment validation)');
console.log('3. Create PLAN→EXEC handoff');
