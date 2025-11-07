import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get PRD UUID
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('id')
  .eq('id', 'PRD-RECURSION-AI-001')
  .single();

if (!prd) {
  console.error('PRD not found');
  process.exit(1);
}

const stories = [
  {
    story_key: 'US-RECURSION-001',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'API Endpoints for Recursion Validation',
    user_role: 'AI agent',
    user_want: 'validate recursion scenarios via REST and GraphQL APIs',
    user_benefit: 'I can programmatically trigger recursion workflows without UI interaction',
    acceptance_criteria: [
      'POST /api/recursion/validate endpoint responds in <10ms',
      'GraphQL validateRecursion mutation works correctly',
      'Batch validation endpoint handles 100+ scenarios',
      'API returns proper error codes (4xx, 5xx)',
      'Response includes should_recurse boolean and trigger details'
    ],
    story_points: 8,
    priority: 'critical',
    status: 'pending',
    phase: 1,
    implementation_context: 'Phase 1. Build RecursionAPIController (400 LOC). Use Express for REST, Apollo Server for GraphQL. Redis caching for threshold lookups (<10ms target). Reference existing recursionEngine.ts (450 LOC) for business logic.'
  },
  {
    story_key: 'US-RECURSION-002',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Batch Validation Service',
    description: 'As an AI agent, I want to validate 100+ recursion scenarios in a single API call so that I can efficiently process multiple ventures simultaneously.',
    acceptance_criteria: [
      'POST /api/recursion/batch accepts array of scenarios',
      'Processes 100 scenarios in <50ms',
      'Returns aggregated results with pass/fail counts',
      'Handles partial failures gracefully',
      'Parallel processing using Promise.all()'
    ],
    story_points: 5,
    priority: 'high',
    status: 'pending',
    phase: 1,
    implementation_context: 'Phase 1. Build BatchValidationService (300 LOC). Use Promise.all() for parallel evaluation. Handle errors individually (partial success). Return summary: { results: [], summary: { passed: N, failed: M } }.'
  },
  {
    story_key: 'US-RECURSION-003',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'LLM Advisory Engine',
    description: 'As an AI agent, I want intelligent recursion recommendations with confidence scores so that I can make informed decisions about recursion triggers.',
    acceptance_criteria: [
      'LLM generates recommendations with 0.0-1.0 confidence scores',
      'Supports OpenAI GPT-4 and Anthropic Claude',
      'Recommendation generation completes in <2s',
      'Cached recommendations return in <100ms',
      'Fallback to rule-based when LLM unavailable'
    ],
    story_points: 13,
    priority: 'high',
    status: 'pending',
    phase: 2,
    implementation_context: 'Phase 2. Build LLMAdvisoryEngine (400 LOC). Abstraction layer supports multiple providers. Use embeddings for semantic pattern matching. Store in llm_recommendations table. Implement fallback mechanism (rule-based) for LLM downtime.'
  },
  {
    story_key: 'US-RECURSION-004',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Pattern Recognition Service',
    description: 'As the system, I want to recognize patterns from historical recursion events so that LLM recommendations improve over time through semantic matching.',
    acceptance_criteria: [
      'Semantic similarity matching using embeddings',
      'Pattern recognition achieves >70% accuracy',
      'Patterns stored in llm_recommendations table',
      'Historical data retrieved efficiently (<5ms)',
      'Chairman overrides feed pattern updates'
    ],
    story_points: 8,
    priority: 'medium',
    status: 'pending',
    phase: 2,
    implementation_context: 'Phase 2. Build PatternRecognitionService (200 LOC). Use vector embeddings for semantic matching. Query historical recursion_events for similar scenarios. Update patterns based on Chairman override outcomes.'
  },
  {
    story_key: 'US-RECURSION-005',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Multi-Agent Handoff Protocol',
    description: 'As an AI agent, I want structured handoff protocols between agents so that I can coordinate with Planner, Technical, Execution, and Launch agents seamlessly.',
    acceptance_criteria: [
      'Zod schema validation enforces handoff structure',
      'Handoffs between 4 agent types work correctly',
      'FSM state management tracks current state',
      'Rollback mechanism restores previous state on failure',
      'All handoffs stored in agent_handoffs table'
    ],
    story_points: 8,
    priority: 'high',
    status: 'pending',
    phase: 3,
    implementation_context: 'Phase 3. Build AgentHandoffProtocol (300 LOC) and CoordinationOrchestrator (300 LOC). Define Zod schemas for validation. Implement FSM for state transitions. Create rollback mechanism (restore previous state if agent fails).'
  },
  {
    story_key: 'US-RECURSION-006',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Chairman Override Interface',
    description: 'As Chairman, I want to approve, reject, or modify LLM recommendations via a desktop interface so that I maintain final authority over critical recursion decisions.',
    acceptance_criteria: [
      'Desktop-first React UI with approve/reject/modify options',
      'Structured rationale capture (decision + reasoning + context)',
      'Overrides stored in chairman_overrides table',
      'Integration with existing RecursionHistoryPanel',
      'Rationale feeds learning pipeline for LLM improvement'
    ],
    story_points: 8,
    priority: 'medium',
    status: 'pending',
    phase: 4,
    implementation_context: 'Phase 4. Build ChairmanOverrideInterface (400 LOC). Use React + Shadcn (existing EHG stack). Desktop-first design (no mobile). Capture structured rationale: { decision: enum, reasoning: text, context: {} }. Reuse RecursionHistoryPanel (483 LOC existing).'
  },
  {
    story_key: 'US-RECURSION-007',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Learning Feedback Loop',
    description: 'As the system, I want Chairman overrides to feed back into LLM training so that recommendations improve based on real decisions.',
    acceptance_criteria: [
      'Pattern extraction from override rationale',
      'Outcome tracking (success/failure) for overrides',
      'Periodic model updates based on override patterns',
      'Learning pipeline processes overrides within 24 hours',
      'Recommendation accuracy improves to >85% within 6 months'
    ],
    story_points: 5,
    priority: 'medium',
    status: 'pending',
    phase: 4,
    implementation_context: 'Phase 4. Build LearningFeedbackLoop (200 LOC). Extract patterns from chairman_overrides.rationale. Track outcomes in chairman_overrides.outcome field. Schedule periodic LLM retraining (batch job). Measure accuracy improvement over time.'
  },
  {
    story_key: 'US-RECURSION-008',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Adaptive Threshold Management',
    description: 'As Chairman, I want to configure industry-specific recursion thresholds so that different industries (FinTech, Hardware, etc.) have appropriate ROI targets.',
    acceptance_criteria: [
      'Configuration API: POST /api/thresholds/configure',
      'Industry-specific thresholds stored (FinTech 18%, Hardware 12%)',
      'Threshold changes require Chairman approval',
      'Historical overrides inform threshold recommendations',
      'Thresholds applied correctly in recursion validation'
    ],
    story_points: 5,
    priority: 'low',
    status: 'pending',
    phase: 1,
    implementation_context: 'Phase 1. Build AdaptiveThresholdManager (200 LOC). Store industry-specific configs in metadata. Expose /api/thresholds/configure endpoint (Chairman only). Default thresholds: FinTech 18%, Hardware 12%, Software 15%.'
  },
  {
    story_key: 'US-RECURSION-009',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Chairman Dashboard',
    description: 'As Chairman, I want a comprehensive dashboard with Analytics, Calibration, and Settings tabs so that I can monitor recursion system performance and adjust configurations.',
    acceptance_criteria: [
      'Desktop-first dashboard with 3 tabs',
      'Analytics tab shows recursion metrics and trends',
      'Calibration tab displays override history and learning progress',
      'Settings tab allows threshold configuration',
      'Integration with existing RecursionHistoryPanel component'
    ],
    story_points: 3,
    priority: 'low',
    status: 'pending',
    phase: 4,
    implementation_context: 'Phase 4. Build ChairmanDashboard (100 LOC wrapper). Reuse existing RecursionHistoryPanel (483 LOC). Add tabs: Analytics (metrics), Calibration (override history), Settings (threshold config). Use Shadcn Tabs component.'
  },
  {
    story_key: 'US-RECURSION-010',
    sd_id: 'SD-RECURSION-AI-001',
    prd_id: 'PRD-RECURSION-AI-001',
    title: 'Backward Compatibility',
    description: 'As a legacy venture, I want to continue using the existing UI-based recursion system so that new API changes don\'t break my workflow.',
    acceptance_criteria: [
      'unification_version flag distinguishes legacy vs unified ventures',
      'Legacy ventures continue on old UI system',
      'New API endpoints don\'t affect legacy ventures',
      'E2E tests verify legacy ventures unaffected',
      'Gradual migration path documented for future transition'
    ],
    story_points: 3,
    priority: 'high',
    status: 'pending',
    phase: 1,
    implementation_context: 'Phase 1. Add unification_version check in recursionEngine.ts. If legacy, skip API validation (use existing UI logic). E2E test: Create legacy venture, verify UI workflow unchanged. Migration guide: Document how to transition venture from legacy to unified.'
  }
];

console.log('📝 Creating user stories for SD-RECURSION-AI-001...\n');

const { data, error } = await supabase
  .from('user_stories')
  .insert(stories)
  .select();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('✅ Created ' + data.length + ' user stories!');
console.log('\n📊 Summary by Phase:');
const byPhase = stories.reduce((acc, s) => {
  acc[s.phase] = (acc[s.phase] || 0) + 1;
  return acc;
}, {});
Object.entries(byPhase).forEach(([phase, count]) => {
  console.log('  Phase ' + phase + ': ' + count + ' stories');
});

const totalPoints = stories.reduce((sum, s) => sum + s.story_points, 0);
console.log('\nTotal Story Points: ' + totalPoints);
console.log('\n🎯 Next: Review existing infrastructure and begin Phase 1 implementation');
