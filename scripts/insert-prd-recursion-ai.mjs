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
  sd_uuid: 'SD-RECURSION-AI-001',
  title: 'AI-First Recursion Enhancement System with LLM Intelligence - PRD',
  status: 'planning',
  category: 'infrastructure',
  priority: 'critical',
  phase: 'planning',
  progress: 15,
  created_by: 'PLAN Agent (Claude)',
  
  executive_summary: 'Transform existing UI-first recursion system into API-first system optimized for AI agents with LLM advisory intelligence. ROI: 1,700% (32 weeks saved / 2 weeks investment). Unblocks 100% of development team (all AI agents). Foundation 40% exists from SD-VENTURE-UNIFICATION-001.',
  
  content: 'PRD: AI-First Recursion Enhancement System - See detailed sections in functional_requirements, technical_approach, acceptance_criteria, and test_scenarios fields.',
  
  technical_approach: 'API-First Architecture: REST + GraphQL, <10ms response (Redis caching), Batch validation 100+ scenarios. Component Reuse: Extend recursionEngine.ts (450 LOC), integrate RecursionHistoryPanel.tsx (483 LOC), build on 553 tests. Tech Stack: Node.js + Express (REST), Apollo Server (GraphQL), React + Vite + Shadcn, PostgreSQL + Supabase, OpenAI GPT-4 or Anthropic Claude, Redis, Zod, Vitest + Playwright.',
  
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
  
  test_scenarios: [
    { id: 'TS-API-001', scenario: 'POST /api/recursion/validate responds <10ms', test_type: 'performance' },
    { id: 'TS-API-002', scenario: 'Batch validation handles 100 scenarios in <50ms', test_type: 'performance' },
    { id: 'TS-LLM-001', scenario: 'LLM generates recommendation with confidence score', test_type: 'integration' },
    { id: 'TS-LLM-002', scenario: 'Fallback works when LLM unavailable', test_type: 'integration' },
    { id: 'TS-AGENT-001', scenario: 'Full multi-agent workflow (Planner to Launch)', test_type: 'e2e' },
    { id: 'TS-CHAIRMAN-001', scenario: 'Chairman approves/rejects/modifies recommendation', test_type: 'e2e' },
    { id: 'TS-BACKWARD-001', scenario: 'Legacy ventures continue on UI system', test_type: 'e2e' }
  ],
  
  plan_checklist: [
    { text: 'PRD created and saved', checked: true },
    { text: 'Component sizing documented (300-600 LOC)', checked: true },
    { text: 'Database schema designed (3 new tables)', checked: true },
    { text: 'API specification documented', checked: true },
    { text: 'Testing strategy defined (unit + E2E)', checked: true },
    { text: 'Risk mitigations documented (8 risks)', checked: true },
    { text: 'Timeline set (8 weeks, 4 phases)', checked: true }
  ],
  
  exec_checklist: [
    { text: 'Phase 1: API Foundation complete', checked: false },
    { text: 'Phase 2: LLM Intelligence complete', checked: false },
    { text: 'Phase 3: Multi-Agent Coordination complete', checked: false },
    { text: 'Phase 4: Chairman Interface complete', checked: false },
    { text: 'All unit tests passing', checked: false },
    { text: 'All E2E tests passing', checked: false }
  ],
  
  validation_checklist: [
    { text: 'All 14 acceptance criteria met', checked: false },
    { text: 'API response time <10ms verified', checked: false },
    { text: 'Backward compatibility verified', checked: false },
    { text: 'Security review complete (RLS policies)', checked: false },
    { text: 'Retrospective generated (quality ≥70)', checked: false }
  ],
  
  metadata: {
    created_via_script: true,
    learning_context: {
      retrospectives_consulted: 0,
      issue_patterns_matched: 0,
      note: 'No infrastructure patterns - pioneering SD'
    },
    existing_infrastructure_percent: 40,
    roi_multiplier: 17,
    total_estimated_loc: 3000,
    components: [
      { name: 'RecursionAPIController', loc: 400, phase: 1 },
      { name: 'BatchValidationService', loc: 300, phase: 1 },
      { name: 'AdaptiveThresholdManager', loc: 200, phase: 1 },
      { name: 'LLMAdvisoryEngine', loc: 400, phase: 2 },
      { name: 'ConfidenceScoreCalculator', loc: 200, phase: 2 },
      { name: 'PatternRecognitionService', loc: 200, phase: 2 },
      { name: 'AgentHandoffProtocol', loc: 300, phase: 3 },
      { name: 'CoordinationOrchestrator', loc: 300, phase: 3 },
      { name: 'ChairmanOverrideInterface', loc: 400, phase: 4 },
      { name: 'LearningFeedbackLoop', loc: 200, phase: 4 },
      { name: 'ChairmanDashboard', loc: 100, phase: 4 }
    ]
  }
};

console.log('📋 Inserting PRD for SD-RECURSION-AI-001...\n');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdData)
  .select()
  .single();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ PRD Created!');
console.log('ID:', data.id);
console.log('Status:', data.status);
console.log('Progress:', data.progress, '%');
console.log('\n📊 PRD Details:');
console.log('- Functional Requirements:', data.functional_requirements.length);
console.log('- Acceptance Criteria:', data.acceptance_criteria.length);
console.log('- Test Scenarios:', data.test_scenarios.length);
console.log('- Components:', data.metadata.components.length);
console.log('- Total Estimated LOC:', data.metadata.total_estimated_loc);
