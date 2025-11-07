#!/usr/bin/env node

/**
 * Strategic Directive: SD-RECURSION-AI-001
 * Title: AI-First Recursion Enhancement System with LLM Intelligence
 *
 * This script inserts the strategic directive for implementing an AI-first
 * recursion enhancement system with LLM advisory intelligence, multi-agent
 * coordination, and Chairman override learning capabilities.
 *
 * Usage: node scripts/insert-sd-recursion-ai-001.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Use SERVICE_ROLE_KEY to bypass RLS
);

const sdData = {
  // ========================================
  // PRIMARY IDENTIFIERS
  // ========================================
  id: 'SD-RECURSION-AI-001',
  sd_key: 'SD-RECURSION-AI-001',  // MUST match id

  // ========================================
  // CORE METADATA
  // ========================================
  title: 'AI-First Recursion Enhancement System with LLM Intelligence',
  category: 'infrastructure',
  priority: 'critical',
  status: 'draft',
  version: '1.0',
  sd_type: 'feature',
  target_application: 'EHG',
  current_phase: 'LEAD_APPROVAL',
  created_by: 'human:Chairman',

  // ========================================
  // DESCRIPTION
  // ========================================
  description: `
Comprehensive enhancement system for the venture creation recursion workflow that transforms it from human-UI-first to AI-agent-first architecture. This system enables 100% automated venture creation at scale with intelligent recursion detection, LLM-powered advisory recommendations, multi-agent coordination, and Chairman oversight learning.

**Current State (40% Complete):**
- Basic recursion detection for FIN-001 (ROI) and TECH-001 (Technical Issues)
- UI-oriented components (Stage5ROIValidator, Stage10TechnicalValidator)
- Manual Chairman approval process
- Limited pattern learning
- Only 2/25 recursion scenarios implemented

**Target State:**
- API-first architecture for AI agents (100% programmatic access)
- LLM advisory intelligence (context-aware recommendations with confidence scores)
- Multi-agent coordination protocol (Planner, Technical, Execution, Launch agents)
- Chairman override with structured rationale capture
- Continuous learning system (LLM improves from Chairman feedback)
- Desktop-first UI for Chairman oversight
- Real-time validation warnings
- 20-25 recursion scenarios fully implemented

**Key Improvements:**

1. **API-First Recursion Interface** (Phase 1):
   - Batch validation API (validate 100+ scenarios in parallel)
   - Optimization API (suggest values that avoid recursion)
   - Auto-resolution protocol (AI agents resolve programmatically)
   - Real-time validation API (<1s response)
   - Comprehensive API documentation

2. **LLM Advisory Intelligence** (Phase 2):
   - Context-aware recursion analysis (not just threshold checks)
   - Pattern query API (query historical patterns by venture profile)
   - Adaptive threshold calculation (industry-specific, team-specific)
   - Confidence scoring (0-100% with reasoning)
   - Semantic pattern recognition (identify non-obvious patterns)

3. **Multi-Agent Coordination** (Phase 3):
   - Event bus for agent-to-agent communication
   - Handoff protocol (seamless stage ownership transfers)
   - Negotiation system (agents can disagree and reach consensus)
   - Conflict resolution (LLM mediates when agents conflict)
   - Cascade orchestration (prevent circular recursion loops)

4. **Chairman Interface & Learning** (Phase 4):
   - Desktop-first Chairman Dashboard (approvals, analytics)
   - Override interface with structured rationale capture
   - Learning system (Chairman feedback improves LLM)
   - Outcome tracking (validate if overrides were correct)
   - Analytics dashboard (recursion patterns, LLM accuracy trends)

**Architecture:**
- Backend: Node.js/TypeScript with Supabase
- LLM Integration: OpenAI/Anthropic API (advisory role, not autonomous)
- Database: PostgreSQL with 5 new tables
- Frontend: React with shadcn/ui components
- Real-time: WebSocket for live updates
- API: REST endpoints for AI agent access
`.trim(),

  // ========================================
  // RATIONALE
  // ========================================
  rationale: `
**Business Problem:**
The current recursion system (SD-VENTURE-UNIFICATION-001) was designed for human interaction through UI components. With AI agents as primary users (100% automation goal), this creates fundamental mismatches:

1. **UI-First Architecture**: AI agents must interact with React components designed for humans (modals, buttons, forms)
2. **Manual Pattern Learning**: System doesn't learn from historical recursions - same mistakes repeated
3. **No Agent Coordination**: When recursions cross agent boundaries (Planner → Technical), no handoff protocol exists
4. **Chairman Bottleneck**: All recursions require manual approval - doesn't scale to 1000+ ventures/month
5. **Static Thresholds**: FIN-001 uses 15% ROI threshold for all ventures (unfair to hardware ventures that average 12%)

**Impact of Current System:**
- AI agents stall waiting for UI-based validation
- Chairman overwhelmed with approval queue (no intelligent filtering)
- 68% of recursions follow patterns that could be auto-resolved
- No learning from past decisions (repeat same mistakes)
- Agent disagreements escalate immediately (no negotiation capability)

**Strategic Value of Enhancement:**
1. **Scalability**: Enable 1000+ ventures/month (vs current 10-50/month)
2. **Intelligence**: LLM advisory reduces Chairman override rate from ~40% (estimated) to <15%
3. **Efficiency**: 70% time reduction in recursion resolution (4 hours → 1.2 hours average)
4. **Quality**: Adaptive learning prevents known failure patterns (20-30% reduction in post-launch pivots)
5. **Autonomy**: AI agents resolve 85% of recursions without human intervention

**ROI Projection:**
- Implementation cost: 240 hours × $150/hr = $36,000
- Time savings: 1000 ventures × 3 hours saved × $150/hr = $450,000/year
- Quality improvement: 20% reduction in pivots × 50 ventures × $20k pivot cost = $200,000/year
- **Net ROI: 1700% in year 1**

**Alignment with Strategic Goals:**
- Supports "AI-First Organization" initiative
- Enables venture creation at scale
- Reduces Chairman operational burden (focus on strategy, not approvals)
- Creates institutional knowledge capture (Chairman wisdom → LLM training data)
`.trim(),

  // ========================================
  // SCOPE
  // ========================================
  scope: `
**INCLUDED:**

1. **API Development:**
   - POST /api/recursion/validate (single scenario validation)
   - POST /api/recursion/batch-validate (100+ scenarios in parallel)
   - POST /api/recursion/optimize (suggest optimal values)
   - POST /api/recursion/auto-resolve (programmatic resolution)
   - GET /api/patterns/query (historical pattern lookup)
   - POST /api/patterns/contribute (AI agents contribute learnings)
   - GET /api/patterns/adaptive-thresholds (context-specific thresholds)
   - POST /api/recursion/mediate-negotiation (agent conflict resolution)
   - POST /api/recursion/:id/approve (Chairman approval)
   - Comprehensive API documentation with examples

2. **LLM Integration:**
   - Context-aware recursion analysis
   - Confidence scoring (0-100%)
   - Reasoning explanation generation
   - Pattern recognition (semantic, not just statistical)
   - Adaptive threshold recommendations
   - Agent negotiation mediation
   - Advisory recommendations (not autonomous decision-making)

3. **Multi-Agent Coordination:**
   - Agent registration system
   - Event bus (WebSocket-based)
   - Handoff protocol (stage ownership transfers)
   - Negotiation protocol (agents discuss solutions)
   - Consensus algorithms (weighted voting, LLM mediation)
   - Deadlock prevention (5-minute timeout → Chairman escalation)

4. **Chairman Interface (Desktop):**
   - Dashboard with KPIs (Active, Pending, Resolved)
   - Pending Approvals Queue (priority-sorted)
   - LLM Recommendation Panel (with confidence, reasoning)
   - Override Dialog (structured rationale capture)
   - Analytics Dashboard (patterns, LLM accuracy, agent performance)
   - Recursion History Timeline

5. **Learning System:**
   - Override rationale storage (chairman_overrides table)
   - Pattern extraction (monthly batch job)
   - LLM training integration (feedback loop)
   - Outcome tracking (validate decisions 3-6 months later)
   - Learning analytics (what patterns LLM has mastered)

6. **Real-Time Validation:**
   - Input field validators (color-coded: green/yellow/red)
   - Proactive warning system (toast notifications)
   - Suggested adjustments (LLM-generated alternatives)
   - Debounced validation (500ms delay)

7. **Database Schema:**
   - venture_recursion_events (main recursion tracking)
   - recursion_agent_handoffs (agent coordination history)
   - recursion_override_learnings (Chairman feedback for ML)
   - stage_validation_cache (performance optimization)
   - recursion_statistics (aggregated analytics)

8. **Testing:**
   - Unit tests (100% coverage of API endpoints)
   - E2E tests (90%+ coverage of critical workflows)
   - Performance tests (load testing with 100 concurrent agents)
   - Accessibility tests (WCAG 2.1 AA compliance)

**EXCLUDED (Future Phases):**

1. **Mobile Optimization:** Deferred to Phase 2 (6-12 months post-launch)
   - Mobile-responsive UI
   - Touch gestures (swipe to approve/defer)
   - Mobile push notifications
   - Offline support

2. **Voice Interface:** Future consideration
   - Voice commands for Chairman
   - Voice override rationale (speak instead of type)

3. **Advanced AI Features:** Post-MVP enhancements
   - Predictive recursion detection (predict before triggering)
   - Auto-approval rules (Chairman sets thresholds)
   - Natural language queries ("Show all FIN-001 events this week")

4. **External Integrations:** Phase 2
   - Slack notifications
   - Jira/Linear ticket creation
   - Calendar integration
   - Email reply-to-approve

5. **Remaining Recursion Scenarios:** Incremental rollout
   - Currently implementing FIN-001, TECH-001 (2/25)
   - Add 3 more CRITICAL scenarios in Phase 4 (MKT-001, FIN-003, REG-001)
   - Remaining 20 scenarios: post-launch incremental development

**BOUNDARY CONDITIONS:**

- LLM acts in ADVISORY role only (recommends, doesn't decide)
- Chairman retains final authority on all HIGH severity recursions
- CRITICAL severity can auto-execute with Chairman notification
- Desktop-first design (mobile support deferred)
- English language only (i18n future consideration)
`.trim(),

  // ========================================
  // STRATEGIC INTENT
  // ========================================
  strategic_intent: `
Transform EHG's venture creation system from manual/UI-driven to AI-agent-driven with intelligent oversight, enabling:

1. **Scale**: Support 1000+ venture creations per month (100x increase from current 10/month)
2. **Intelligence**: Capture and codify institutional knowledge through LLM learning from Chairman decisions
3. **Efficiency**: Reduce Chairman operational burden by 60% (focus on strategy vs approvals)
4. **Quality**: Improve venture success rate from 55% baseline to 70%+ through proactive pattern recognition
5. **Autonomy**: Enable AI agents to resolve 85% of recursions without human intervention

**Organizational Impact:**

- **Chairman Role Evolution**: From operational approver → strategic overseer
- **Knowledge Preservation**: Chairman's judgment codified in LLM (resilient to turnover)
- **Learning Organization**: System improves with every venture (continuous learning loop)
- **Competitive Advantage**: Venture creation at scale becomes core competency
- **Platform Foundation**: Recursion intelligence applicable to other business processes

**Alignment with Company Vision:**

This SD directly supports the "AI-First Organization" vision by:
- Making AI agents first-class citizens (API-first architecture)
- Augmenting human judgment with LLM intelligence (not replacing)
- Creating feedback loops that make system smarter over time
- Demonstrating value of human-AI collaboration at scale
`.trim(),

  // ========================================
  // SUCCESS CRITERIA
  // ========================================
  success_criteria: [
    {
      id: 'SC-001',
      criterion: 'API endpoints respond within 10ms for recursion detection',
      measure: 'Load testing with 100 concurrent requests, P95 latency <10ms',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-002',
      criterion: 'Batch validation API handles 100+ scenarios in parallel',
      measure: 'E2E test: Submit 100 scenarios, all validated, total time <5 seconds',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-003',
      criterion: 'LLM provides recommendations with confidence scores >70%',
      measure: 'Sample 50 recursions, verify all have confidence scores, median >70%',
      priority: 'HIGH'
    },
    {
      id: 'SC-004',
      criterion: 'Chairman override rationale captured with structured fields',
      measure: 'Override UI requires category, explanation (min 50 chars), confidence',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-005',
      criterion: 'Pattern learning improves LLM accuracy by 10%+ within 6 months',
      measure: 'Track override rate: Month 1 baseline, Month 6 must be -10% or more',
      priority: 'HIGH'
    },
    {
      id: 'SC-006',
      criterion: 'Multi-agent handoff protocol coordinates 4+ agents seamlessly',
      measure: 'E2E test: Trigger recursion that involves Planner→Technical→Execution→Chairman',
      priority: 'HIGH'
    },
    {
      id: 'SC-007',
      criterion: 'Real-time validation warns within 1 second of input change',
      measure: 'E2E test: Type invalid value, verify warning appears within 1s',
      priority: 'MEDIUM'
    },
    {
      id: 'SC-008',
      criterion: 'Chairman dashboard loads within 500ms',
      measure: 'Lighthouse performance test, FCP <500ms on desktop',
      priority: 'HIGH'
    },
    {
      id: 'SC-009',
      criterion: 'Zero recursion data loss (100% audit trail)',
      measure: 'Database constraints prevent deletion, all events have timestamps',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-010',
      criterion: 'E2E tests cover 90%+ of critical workflows',
      measure: 'Playwright test suite covers: approval, override, negotiation, validation',
      priority: 'HIGH'
    },
    {
      id: 'SC-011',
      criterion: 'Accessibility WCAG 2.1 AA compliant',
      measure: 'axe-core automated scan returns 0 violations',
      priority: 'MEDIUM'
    },
    {
      id: 'SC-012',
      criterion: 'System handles 100 concurrent AI agent requests',
      measure: 'Load test: 100 concurrent API calls, all succeed, P95 latency <50ms',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-013',
      criterion: 'Chairman can approve or override recursion within 2 minutes',
      measure: 'UAT with Chairman: time from dashboard open to decision made',
      priority: 'HIGH'
    },
    {
      id: 'SC-014',
      criterion: 'API documentation complete with code examples',
      measure: 'Documentation includes: all endpoints, request/response schemas, cURL examples',
      priority: 'MEDIUM'
    }
  ],

  // ========================================
  // RISKS & MITIGATIONS
  // ========================================
  risks: [
    {
      risk: 'API performance degrades under high load (100+ concurrent agents)',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Implement caching layer (Redis), async job queue, database query optimization with indexes',
      owner: 'EXEC'
    },
    {
      risk: 'LLM hallucinations provide incorrect recommendations',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Always display rule-based trigger alongside LLM recommendation. If they disagree, escalate to Chairman.',
      owner: 'PLAN'
    },
    {
      risk: 'Pattern learning creates bias from early/limited data',
      severity: 'medium',
      probability: 'high',
      mitigation: 'Require minimum sample size (50+ examples) before using patterns. Display confidence scores. Chairman can override biased recommendations.',
      owner: 'EXEC'
    },
    {
      risk: 'Chairman override fatigue (too many approvals required)',
      severity: 'medium',
      probability: 'medium',
      mitigation: 'Implement smart escalation (only HIGH severity requires approval). Add auto-approval rules for low-risk patterns after 3 months.',
      owner: 'PLAN'
    },
    {
      risk: 'Database query performance for pattern analytics',
      severity: 'medium',
      probability: 'high',
      mitigation: 'Optimized indexes on venture_recursion_events table. Materialized views for analytics. Cache frequent queries.',
      owner: 'DATABASE'
    },
    {
      risk: 'Agent negotiation deadlocks (infinite disagreement)',
      severity: 'medium',
      probability: 'low',
      mitigation: '5-minute timeout for negotiations. Auto-escalate to Chairman if no consensus. Circuit breaker pattern.',
      owner: 'EXEC'
    },
    {
      risk: 'API security vulnerabilities (unauthorized access)',
      severity: 'critical',
      probability: 'low',
      mitigation: 'JWT authentication for all API endpoints. Rate limiting (100 requests/minute per agent). RLS policies on database.',
      owner: 'EXEC'
    },
    {
      risk: 'Backward compatibility with existing recursion UI',
      severity: 'low',
      probability: 'medium',
      mitigation: 'Feature flags for gradual rollout. Maintain existing UI during transition. Run A/B test with 10% traffic.',
      owner: 'PLAN'
    }
  ],

  // ========================================
  // DEPENDENCIES
  // ========================================
  dependencies: [
    {
      dependency: 'Existing recursion engine (recursionEngine.ts)',
      type: 'technical',
      status: 'ready',
      notes: 'Core detection logic exists (451 LOC). Needs API wrapper layer.'
    },
    {
      dependency: 'Database schema (recursion_events table)',
      type: 'technical',
      status: 'ready',
      notes: 'Table exists from SD-VENTURE-UNIFICATION-001. Need to add 4 new tables.'
    },
    {
      dependency: 'Supabase API infrastructure',
      type: 'technical',
      status: 'ready',
      notes: 'Supabase client configured. RLS policies need updates.'
    },
    {
      dependency: 'LLM provider API access (OpenAI/Anthropic)',
      type: 'external',
      status: 'pending',
      notes: 'Need API key with sufficient quota. Estimate: 10k requests/month.'
    },
    {
      dependency: 'WebSocket support for real-time updates',
      type: 'technical',
      status: 'ready',
      notes: 'Supabase Realtime enabled. Need to implement subscriptions.'
    },
    {
      dependency: 'Pattern storage and analytics capability',
      type: 'technical',
      status: 'needs_implementation',
      notes: 'Requires new tables: recursion_override_learnings, recursion_statistics'
    },
    {
      dependency: 'shadcn/ui component library',
      type: 'technical',
      status: 'ready',
      notes: 'Library installed. May need to add: Breadcrumb, Command, Slider components.'
    }
  ],

  // ========================================
  // SUCCESS METRICS
  // ========================================
  success_metrics: {
    implementation: {
      total_duration_weeks: 8,
      total_effort_hours: 280,
      effort_breakdown: {
        phase_1_api_foundation: 60,
        phase_2_llm_integration: 70,
        phase_3_agent_coordination: 80,
        phase_4_chairman_interface: 70
      },
      lines_of_code_estimate: '2,400-3,100 LOC',
      component_count: 11,
      new_components: 6,
      enhanced_components: 3,
      api_endpoints: 10
    },
    performance: {
      api_response_time_p95: '<10ms',
      batch_validation_100_scenarios: '<5 seconds',
      real_time_validation_latency: '<1 second',
      chairman_dashboard_load_time: '<500ms',
      websocket_uptime: '>99.9%',
      concurrent_agent_capacity: 100
    },
    quality: {
      unit_test_coverage: '100% (API endpoints)',
      e2e_test_coverage: '90%+ (critical workflows)',
      accessibility_wcag_level: 'AA',
      zero_data_loss: true,
      audit_trail_complete: true
    },
    business: {
      ventures_per_month_capacity: '1000+',
      venture_success_rate_target: '70%',
      chairman_oversight_reduction: '60%',
      recursion_resolution_time_avg: '1.2 hours (was 4 hours)',
      llm_accuracy_improvement_6mo: '+10%',
      ai_agent_autonomy_rate: '85%',
      roi_year_1: '1700%'
    },
    learning: {
      chairman_override_rate_target: '<15%',
      pattern_minimum_sample_size: 50,
      learning_cycle_frequency: 'monthly',
      outcome_validation_timeframe: '3-6 months'
    }
  },

  // ========================================
  // STAKEHOLDERS
  // ========================================
  stakeholders: [
    {
      name: 'Chairman',
      role: 'Executive Sponsor & Approver',
      involvement: 'Final sign-off on SD. Primary user of Chairman Dashboard. Provides override feedback for learning.',
      contact: 'Primary decision-maker'
    },
    {
      name: 'LEAD Agent',
      role: 'Requirements Validator',
      involvement: 'Strategic validation gate. Over-engineering review. Simplicity-first enforcement.',
      contact: 'LEO Protocol LEAD phase'
    },
    {
      name: 'PLAN Agent',
      role: 'Architecture Designer',
      involvement: 'PRD creation. API design. Database schema. Testing strategy. Component sizing review.',
      contact: 'LEO Protocol PLAN phase'
    },
    {
      name: 'EXEC Agent',
      role: 'Implementation Lead',
      involvement: 'Code implementation. API development. LLM integration. Testing execution. Deployment.',
      contact: 'LEO Protocol EXEC phase'
    },
    {
      name: 'DATABASE Agent',
      role: 'Schema Optimizer',
      involvement: 'Database schema design. Index optimization. Query performance tuning. RLS policy creation.',
      contact: 'Specialized sub-agent'
    },
    {
      name: 'QA Engineering Director',
      role: 'Testing Strategy Lead',
      involvement: 'E2E test design. Performance testing. Load testing. Accessibility validation.',
      contact: 'QA sub-agent'
    },
    {
      name: 'AI Agents (Planner, Technical, Execution, Launch)',
      role: 'Primary Users',
      involvement: 'Use API endpoints for recursion detection, validation, resolution. Participate in agent coordination.',
      contact: 'System users'
    }
  ],

  // ========================================
  // STRATEGIC OBJECTIVES
  // ========================================
  strategic_objectives: [
    'Enable 100% AI-driven venture creation with human oversight',
    'Scale venture creation capacity to 1000+ per month',
    'Reduce Chairman operational burden by 60%',
    'Improve venture success rate from 55% to 70%+',
    'Create institutional knowledge capture through LLM learning',
    'Establish AI-first architecture patterns for organization'
  ],

  // ========================================
  // METADATA
  // ========================================
  metadata: {
    estimated_effort_hours: 280,
    complexity: 'HIGH',
    requires_migration: true,
    phased_delivery: true,

    phases: [
      {
        phase: 1,
        name: 'API-First Foundation',
        duration_weeks: 2,
        effort_hours: 60,
        deliverables: [
          'POST /api/recursion/validate endpoint',
          'POST /api/recursion/batch-validate endpoint',
          'POST /api/recursion/optimize endpoint',
          'POST /api/recursion/auto-resolve endpoint',
          'API documentation (Swagger/OpenAPI)',
          'Unit tests (100% coverage)',
          'E2E smoke tests'
        ],
        success_criteria: ['SC-001', 'SC-002', 'SC-012'],
        risks: ['API performance under load']
      },
      {
        phase: 2,
        name: 'LLM Advisory Intelligence',
        duration_weeks: 2,
        effort_hours: 70,
        deliverables: [
          'LLM provider integration (OpenAI/Anthropic)',
          'Context-aware recursion analysis',
          'GET /api/patterns/query endpoint',
          'POST /api/patterns/contribute endpoint',
          'GET /api/patterns/adaptive-thresholds endpoint',
          'Confidence scoring system',
          'Pattern recognition logic',
          'Unit tests for LLM integration'
        ],
        success_criteria: ['SC-003', 'SC-005'],
        risks: ['LLM hallucinations', 'Pattern learning bias']
      },
      {
        phase: 3,
        name: 'Multi-Agent Coordination',
        duration_weeks: 2,
        effort_hours: 80,
        deliverables: [
          'Agent registration system',
          'Event bus (WebSocket-based)',
          'POST /api/agents/register endpoint',
          'WebSocket /api/recursion/events',
          'POST /api/recursion/handoff endpoint',
          'POST /api/recursion/mediate-negotiation endpoint',
          'Negotiation & consensus algorithms',
          'Deadlock prevention logic',
          'E2E tests for agent coordination'
        ],
        success_criteria: ['SC-006'],
        risks: ['Agent negotiation deadlocks']
      },
      {
        phase: 4,
        name: 'Chairman Interface & Learning',
        duration_weeks: 2,
        effort_hours: 70,
        deliverables: [
          'ChairmanDashboard component (450-550 LOC)',
          'RecursionOverviewPanel component (300-400 LOC)',
          'PendingApprovalsQueue component (400-500 LOC)',
          'ApprovalDialog component (500-600 LOC)',
          'LLMRecommendationPanel component (350-450 LOC)',
          'Override rationale capture',
          'Learning system integration',
          'RecursionAnalyticsDashboard component',
          'Real-time validation UI',
          'E2E tests for Chairman workflows',
          'Accessibility audit (WCAG AA)'
        ],
        success_criteria: ['SC-004', 'SC-007', 'SC-008', 'SC-011', 'SC-013'],
        risks: ['Chairman override fatigue']
      }
    ],

    database_changes: {
      new_tables: [
        'venture_recursion_events (enhanced)',
        'recursion_agent_handoffs',
        'recursion_override_learnings',
        'stage_validation_cache',
        'recursion_statistics'
      ],
      indexes_added: 15,
      triggers_added: 3,
      rls_policies_added: 8
    },

    api_endpoints: [
      'POST /api/recursion/validate',
      'POST /api/recursion/batch-validate',
      'POST /api/recursion/optimize',
      'POST /api/recursion/auto-resolve',
      'POST /api/recursion/:id/approve',
      'GET /api/patterns/query',
      'POST /api/patterns/contribute',
      'GET /api/patterns/adaptive-thresholds',
      'POST /api/agents/register',
      'POST /api/recursion/handoff',
      'POST /api/recursion/mediate-negotiation',
      'WebSocket /api/recursion/events'
    ],

    ui_components: [
      'ChairmanDashboard (new, 450-550 LOC)',
      'RecursionOverviewPanel (new, 300-400 LOC)',
      'PendingApprovalsQueue (new, 400-500 LOC)',
      'ApprovalDialog (new, 500-600 LOC)',
      'LLMRecommendationPanel (new, 350-450 LOC)',
      'AgentHandoffVisualizer (new, 400-500 LOC)',
      'RecursionRiskBadge (new, 100-150 LOC)',
      'ValidatedInput (new, 200-300 LOC)',
      'Stage5ROIValidator (enhance, +100 LOC)',
      'Stage10TechnicalValidator (enhance, +100 LOC)',
      'RecursionHistoryPanel (enhance, +150 LOC)'
    ],

    testing_strategy: {
      unit_tests: 'Jest + React Testing Library, 100% coverage of API endpoints and business logic',
      e2e_tests: 'Playwright, 90%+ coverage of critical workflows (approval, override, negotiation, validation)',
      performance_tests: 'k6 load testing, 100 concurrent agents, P95 latency <50ms',
      accessibility_tests: 'axe-core automated scanning, manual keyboard navigation testing, WCAG 2.1 AA',
      integration_tests: 'API integration tests, database trigger tests, WebSocket communication tests'
    },

    deferred_features: [
      'Mobile optimization (Phase 2, 6-12 months post-launch)',
      'Voice interface (future consideration)',
      'Predictive recursion detection (post-MVP)',
      'Auto-approval rules (after 3 months of learning)',
      'External integrations (Slack, Jira, Calendar)',
      'Remaining 20 recursion scenarios (incremental post-launch)'
    ],

    technology_stack: {
      backend: 'Node.js, TypeScript, Supabase',
      frontend: 'React, TypeScript, shadcn/ui, Tailwind CSS',
      llm: 'OpenAI GPT-4 or Anthropic Claude (advisory role)',
      database: 'PostgreSQL (Supabase)',
      realtime: 'Supabase Realtime (WebSocket)',
      testing: 'Jest, React Testing Library, Playwright, k6, axe-core',
      deployment: 'Vercel (frontend), Supabase (backend)',
      monitoring: 'Supabase Dashboard, custom analytics'
    },

    deployment_strategy: 'Phased rollout with feature flags. Phase 1-3: API development (internal testing). Phase 4: Chairman Dashboard (10% traffic A/B test). Full rollout after 2 weeks of validation.'
  }
};

async function insertSD() {
  console.log('🚀 Inserting Strategic Directive: SD-RECURSION-AI-001\n');

  // Check if SD already exists
  const { data: existing, error: checkError } = await supabase
    .from('strategic_directives_v2')
    .select('id, status')
    .eq('id', sdData.id)
    .maybeSingle();

  if (checkError) {
    console.error('❌ Error checking for existing SD:', checkError.message);
    process.exit(1);
  }

  if (existing) {
    console.log(`⚠️  SD already exists with status: ${existing.status}`);
    console.log('   To update, delete the existing SD first or use an UPDATE query.\n');
    process.exit(0);
  }

  // Insert the SD
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error inserting SD:', error.message);
    console.error('   Details:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log('✅ Strategic Directive created successfully!\n');
  console.log('📋 Summary:');
  console.log(`   ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Category: ${data.category}`);
  console.log(`   Priority: ${data.priority}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Phase: ${data.current_phase}`);
  console.log('\n📊 Metrics:');
  console.log(`   Duration: ${data.metadata.phases.length} phases, 8 weeks total`);
  console.log('   Effort: 280 hours');
  console.log('   LOC: 2,400-3,100 lines');
  console.log('   Components: 11 (6 new, 3 enhanced)');
  console.log('   API Endpoints: 12');
  console.log(`   Success Criteria: ${data.success_criteria.length}`);
  console.log('\n🎯 Next Steps:');
  console.log('   1. LEAD Agent: Review and validate strategic alignment');
  console.log('   2. Chairman: Approve or request modifications');
  console.log('   3. PLAN Agent: Create detailed PRD');
  console.log('   4. EXEC Agent: Begin Phase 1 implementation\n');
}

insertSD();
