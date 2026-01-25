#!/usr/bin/env node

/**
 * Create PRD-RD-DEPT-001: R&D Department Product Requirements Document
 * LEO Protocol v4.2.0 - PLAN Phase
 *
 * Comprehensive PRD based on sub-agent input from LEAD phase:
 * - Database Architect: 5-table schema with RLS
 * - Design Sub-Agent: 6 UI components with wireframes
 * - QA Director: 85% coverage target, comprehensive test plan
 * - Security Architect: RLS policies, input validation
 * - Performance Lead: Cost tracking, latency targets
 * - Systems Analyst: Integration strategy with existing services
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createRDDepartmentPRD() {
  console.log('📋 PLAN: Creating PRD-RD-DEPT-001\n');

  const prd = {
    id: 'PRD-RD-DEPT-001',
    directive_id: 'SD-RD-DEPT-001',
    title: 'R&D Department: Hierarchical Research Agent System',
    version: '1.0',
    status: 'approved',
    category: 'platform',
    priority: 'high',

    // Executive Summary
    executive_summary: `Build a realistic R&D Department with hierarchical agent structure (VP → Manager → Analysts) to perform specialized research operations. The department will support multiple use cases including competitive intelligence, viral content research, market trends analysis, and customer insights.

**Objectives**:
- Automate research operations with 80%+ efficiency gain (2-3 days → 1-2 hours)
- Establish quality gates with Manager + VP approval (85%+ confidence scores)
- Build reusable research library with 40%+ reuse rate
- Support 3+ departments within 90 days
- Track ROI and cost per research request ($18K dev cost, break-even in 6-12 requests)
- Deliver first use case: Viral video research for Creative Media

**First Use Case**: Deep research for viral video creation workflow (Sora integration).

**Target Application**: EHG (../ehg)`,

    business_context: `**Current State**: Manual research is time-consuming (2-3 days per request), inconsistent quality, not reusable across departments, expensive ($1,600-$3,200 per request).

**Desired State**: Automated research delivered in 1-2 hours with 85%+ confidence scores, reusable research library with 40%+ reuse rate, 80% cost reduction.

**Impact**: Multiple departments (Creative Media, Competitive Intelligence, GTM, Financial Planning) need research capabilities but lack infrastructure.

**Strategic Value**:
- Efficiency: Research delivered in hours vs days
- Quality: Multi-layer review (Manager + VP approval gates)
- Reusability: Research library reduces redundant work
- Scalability: Add analysts for new research domains
- Cost Tracking: Measure ROI per research request
- Multi-Department: Supports Creative Media, Competitive Intel, GTM, Financial Planning`,

    technical_context: `**Architecture**: Hierarchical agent system with VP → Manager → 5 Specialized Analysts

**Technology Stack**:
- Database: PostgreSQL (Supabase) with RLS policies
- Backend: TypeScript services with LLM Manager integration
- Frontend: React + TypeScript + Shadcn UI
- Testing: Vitest (unit), Playwright (E2E), axe-core (A11y)

**Integration Points**:
- Creative Media: Stage34CreativeMediaAutomation
- LLM Manager: Existing infrastructure for AI providers
- Competitive Intelligence: Leverage existing AICompetitiveResearchService.ts`,

    // Functional Requirements (from sub-agent input)
    functional_requirements: [
      {
        id: 'FR-1',
        category: 'Hierarchical Structure',
        requirement: 'VP of Research role with strategic oversight and final approval authority',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'VP can view all research requests across departments',
          'VP can approve/reject final research reports',
          'VP approval required before report delivery',
          'VP dashboard shows department-wide metrics'
        ]
      },
      {
        id: 'FR-2',
        category: 'Hierarchical Structure',
        requirement: 'Research Manager role with planning, coordination, and quality review',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Manager receives research requests and creates research plans',
          'Manager assigns analysts to research tasks',
          'Manager compiles analyst findings into reports',
          'Manager submits reports to VP for approval'
        ]
      },
      {
        id: 'FR-3',
        category: 'Hierarchical Structure',
        requirement: '5 Specialized Analyst roles with domain expertise',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Competitive Intelligence Analyst for competitor research',
          'Viral Content Analyst for viral video trends',
          'Market Trends Analyst for market analysis',
          'Customer Insights Analyst for customer research',
          'Financial Research Analyst for financial analysis',
          'Each analyst can only see assigned research tasks',
          'Analysts execute research using LLM Manager'
        ]
      },
      {
        id: 'FR-4',
        category: 'Workflow Engine',
        requirement: 'Research request intake and triage system',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Users can submit research requests with type, objective, priority, deadline',
          'Requests automatically routed to appropriate specialist',
          'Status tracking: pending → in_progress → review → approved → delivered',
          'Email notifications at each stage'
        ]
      },
      {
        id: 'FR-5',
        category: 'Workflow Engine',
        requirement: 'Research plan creation and approval',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Manager creates research plan with assigned analysts',
          'Plan includes research questions, methodology, deliverables',
          'VP approves plan before execution',
          'Plan stored with versioning'
        ]
      },
      {
        id: 'FR-6',
        category: 'Workflow Engine',
        requirement: 'Research execution with analyst collaboration',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Analysts execute research using LLM Manager',
          'Findings stored with confidence scores',
          'Manager can reassign if findings inadequate',
          'Parallel execution by multiple analysts'
        ]
      },
      {
        id: 'FR-7',
        category: 'Workflow Engine',
        requirement: 'Report compilation and approval workflow',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Manager compiles findings into structured report',
          'VP reviews and approves/rejects report',
          'If rejected, Manager revises and resubmits',
          'Approved reports delivered to requestor'
        ]
      },
      {
        id: 'FR-8',
        category: 'Research Library',
        requirement: 'Searchable research library with reuse capability',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Full-text search across reports',
          'Filter by research type, date range, department, analyst',
          'Sort by relevance, date, rating',
          'Download reports as PDF',
          'Track reuse metrics (40%+ target)'
        ]
      },
      {
        id: 'FR-9',
        category: 'Integration',
        requirement: 'Creative Media integration for viral video research',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Stage34CreativeMediaAutomation can submit research requests',
          'Viral Content Analyst performs deep research',
          'Research findings fed into Sora prompt generation',
          'Async workflow with timeout handling'
        ]
      },
      {
        id: 'FR-10',
        category: 'Integration',
        requirement: 'LLM Manager integration for configurable AI providers',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Use existing LLM Manager service',
          'Support OpenAI, Anthropic providers',
          'Model selection: GPT-4o for complex, GPT-4o-mini for simple',
          'Cost tracking per request'
        ]
      },
      {
        id: 'FR-11',
        category: 'Integration',
        requirement: 'Leverage existing AICompetitiveResearchService as library',
        priority: 'SHOULD_HAVE',
        acceptance_criteria: [
          'Competitive Intelligence Analyst uses existing service',
          'No breaking changes to existing competitive intelligence UI',
          'Gradual migration path from old to new system',
          'Existing data remains accessible'
        ]
      },
      {
        id: 'FR-12',
        category: 'Cost Tracking',
        requirement: 'Research cost monitoring and ROI tracking',
        priority: 'MUST_HAVE',
        acceptance_criteria: [
          'Track tokens and cost per analyst execution',
          'Track total cost per research request',
          'Monthly department budget tracking',
          'Cost alerts when thresholds exceeded',
          'ROI metrics: cost saved vs manual research'
        ]
      }
    ],

    // Technical Requirements (from sub-agent input)
    technical_requirements: [
      {
        id: 'TR-1',
        category: 'Database',
        requirement: '5-table schema with RLS policies',
        details: `
**Tables**:
1. rd_department_agents (7 agents: 1 VP, 1 Manager, 5 Analysts)
2. rd_research_requests (intake system)
3. rd_research_plans (Manager planning)
4. rd_research_findings (Analyst outputs)
5. rd_research_reports (Final deliverables)

**RLS Policies** (from Security Architect):
- VP: Full access to all research
- Manager: Department-scoped access
- Analysts: Only assigned research
- Departments: Only own requests

**Indexes** (from Performance Lead):
- rd_research_requests(status, priority)
- rd_research_findings(analyst_id, status)
- rd_research_reports(created_at DESC) WHERE created_at > NOW() - INTERVAL '90 days'
- Full-text search: gin(to_tsvector('english', title || ' ' || summary))

**Foreign Keys**:
- requests → agents (assigned_to)
- plans → requests (request_id)
- findings → plans (plan_id)
- reports → requests (request_id)
`,
        priority: 'MUST_HAVE'
      },
      {
        id: 'TR-2',
        category: 'Services',
        requirement: 'Service layer with agent classes and workflow engine',
        details: `
**Core Services**:
- RDDepartmentService.ts (main orchestration)
- VPOfResearch.ts (strategic oversight, approval)
- ResearchManager.ts (planning, coordination, compilation)
- BaseAnalyst.ts (abstract base class)
- CompetitiveIntelligenceAnalyst.ts (extends BaseAnalyst)
- ViralContentAnalyst.ts (extends BaseAnalyst)
- MarketTrendsAnalyst.ts (extends BaseAnalyst)
- CustomerInsightsAnalyst.ts (extends BaseAnalyst)
- FinancialResearchAnalyst.ts (extends BaseAnalyst)
- ResearchWorkflowEngine.ts (state machine)
- ResearchCostTracker.ts (LLM cost monitoring)

**Estimated LOC**: 1,200-1,500 lines across 11 service files
`,
        priority: 'MUST_HAVE'
      },
      {
        id: 'TR-3',
        category: 'UI Components',
        requirement: '6 UI components with accessibility compliance',
        details: `
**Components** (from Design Sub-Agent):
1. RDDepartmentDashboard.tsx (main container, tabs, ~170 LOC)
2. ResearchRequestForm.tsx (stepper workflow, ~200 LOC)
3. ActiveResearchList.tsx (status tracking, ~150 LOC)
4. ResearchTeamStatus.tsx (agent availability, ~120 LOC)
5. ResearchLibrary.tsx (search, filter, ~180 LOC)
6. ResearchReportViewer.tsx (display findings, ~100 LOC)

**Accessibility** (from Design Sub-Agent):
- WCAG 2.1 AA compliance
- Keyboard navigation (Tab, Enter, Escape)
- Screen reader labels (aria-label, role)
- Color contrast ratios
- Focus indicators
- Error announcements

**Responsive Design**:
- Breakpoints: sm, md, lg, xl
- Bottom sheet for forms on mobile
- Touch-friendly tap targets (44x44px minimum)

**Estimated LOC**: 920 total
`,
        priority: 'MUST_HAVE'
      },
      {
        id: 'TR-4',
        category: 'Security',
        requirement: 'Input validation and prompt injection prevention',
        details: `
**Input Sanitization** (from Security Architect):
\`\`\`typescript
function sanitizeResearchObjective(input: string): string {
  const dangerous = /system:|assistant:|ignore previous|new instructions:/gi;
  if (dangerous.test(input)) {
    throw new Error('Invalid research objective');
  }
  return input.slice(0, 2000); // Length limit
}
\`\`\`

**Zod Validation**:
\`\`\`typescript
const researchRequestSchema = z.object({
  research_type: z.enum(['competitive', 'viral', 'market', 'customer', 'financial']),
  objective: z.string().max(2000),
  priority: z.enum(['high', 'medium', 'low']),
  department_id: z.string().uuid()
});
\`\`\`

**XSS Prevention**:
- Use DOMPurify for research report HTML
- CSP headers to prevent inline scripts
`,
        priority: 'MUST_HAVE'
      },
      {
        id: 'TR-5',
        category: 'Performance',
        requirement: 'Performance targets and optimization',
        details: `
**Latency Targets** (from Performance Lead):
- Dashboard load: <2s
- Submit research request: <500ms
- Library search: <1s for 100+ reports
- LLM research execution: <30s per analyst

**Optimization**:
- Virtualized lists for large research libraries
- Code splitting for R&D Department module (<150KB)
- Supabase connection pooling (20 connections)
- Caching similar queries (40% cost reduction)

**Cost Limits**:
- Per request: 500 tokens
- Per analyst: 2,000 tokens
- Per department: 10,000 tokens/month
`,
        priority: 'MUST_HAVE'
      },
      {
        id: 'TR-6',
        category: 'Testing',
        requirement: 'Comprehensive test coverage (85% target)',
        details: `
**Test Tiers** (from QA Director):

**Tier 1: Smoke Tests (5 minimum)**
1. Database tables exist (all 5)
2. Services import without errors
3. Dashboard page renders (200 OK)
4. Submit research request (end-to-end)
5. View research library (data retrieval)

**Tier 2: Unit Tests**
- Database layer: Table operations, RLS enforcement
- Service layer: Each agent class, workflow state transitions
- Frontend: Component rendering, form validation, state management
- Target: 50% coverage minimum

**Tier 3: Integration Tests**
- End-to-end workflow: Request → Plan → Execute → Report → Approve
- LLM integration with mock responses
- Creative Media integration

**Tier 4: E2E Tests (Playwright)**
- New user submits first research request
- Manager reviews and assigns analysts
- Analyst executes research
- Requester views completed report
- Search library for past research

**Tier 5: Accessibility Tests**
- axe-core for WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader compatibility

**Tier 6: Security Tests**
- RLS verification (users cannot see other departments' research)
- SQL injection prevention
- XSS prevention

**Estimated Effort**: 12 hours
`,
        priority: 'MUST_HAVE'
      }
    ],

    // System Architecture
    system_architecture: `**Hierarchical Structure**:
\`\`\`
VP of Research (Strategic oversight, final approval)
  ├─ Research Manager (Planning, coordination, compilation)
      ├─ Competitive Intelligence Analyst
      ├─ Viral Content Analyst
      ├─ Market Trends Analyst
      ├─ Customer Insights Analyst
      └─ Financial Research Analyst
\`\`\`

**Workflow Engine** (State Machine):
\`\`\`
[Request Submitted] → [Plan Created] → [VP Approves Plan] → [Analysts Assigned]
  → [Research Executed] → [Findings Compiled] → [Manager Submits Report]
  → [VP Approves Report] → [Report Delivered]
\`\`\`

**Integration Points**:
- Creative Media: Stage34CreativeMediaAutomation → RDDepartmentService
- LLM Manager: All agents use existing LLM Manager
- Existing Services: Competitive Intelligence Analyst uses AICompetitiveResearchService.ts`,

    // Data Model
    data_model: {
      tables: [
        {
          name: 'rd_department_agents',
          columns: ['id', 'role', 'specialty', 'department_id', 'status', 'metadata'],
          rls: 'VP: all, Manager: department, Analyst: self'
        },
        {
          name: 'rd_research_requests',
          columns: ['id', 'research_type', 'objective', 'priority', 'status', 'department_id', 'assigned_to'],
          rls: 'Department-scoped access'
        },
        {
          name: 'rd_research_plans',
          columns: ['id', 'request_id', 'created_by', 'assigned_analysts', 'methodology', 'approved_by'],
          rls: 'Manager + assigned analysts'
        },
        {
          name: 'rd_research_findings',
          columns: ['id', 'plan_id', 'analyst_id', 'findings', 'confidence_score', 'sources'],
          rls: 'Analyst: own, Manager: all for plan'
        },
        {
          name: 'rd_research_reports',
          columns: ['id', 'request_id', 'compiled_by', 'findings', 'approved_by', 'delivered_to'],
          rls: 'Requestor + VP + Manager'
        }
      ]
    },

    // API Specifications
    api_specifications: [
      {endpoint: 'POST /api/rd-department/requests', auth: 'required', rls: 'yes'},
      {endpoint: 'GET /api/rd-department/requests', auth: 'required', rls: 'yes'},
      {endpoint: 'POST /api/rd-department/plans', auth: 'Manager only', rls: 'yes'},
      {endpoint: 'POST /api/rd-department/plans/:id/approve', auth: 'VP only', rls: 'yes'},
      {endpoint: 'POST /api/rd-department/findings', auth: 'Analyst only', rls: 'yes'},
      {endpoint: 'POST /api/rd-department/reports', auth: 'Manager only', rls: 'yes'},
      {endpoint: 'POST /api/rd-department/reports/:id/approve', auth: 'VP only', rls: 'yes'},
      {endpoint: 'GET /api/rd-department/library', auth: 'required', rls: 'yes'},
      {endpoint: 'GET /api/rd-department/metrics', auth: 'VP only', rls: 'yes'}
    ],

    // UI/UX Requirements
    ui_ux_requirements: [
      {
        component: 'RDDepartmentDashboard',
        description: 'Main container with tabs (Active, Team Status, Library)',
        accessibility: 'WCAG 2.1 AA',
        responsive: true
      },
      {
        component: 'ResearchRequestForm',
        description: 'Stepper workflow (Type → Details → Questions → Review)',
        accessibility: 'WCAG 2.1 AA',
        responsive: true
      },
      {
        component: 'ActiveResearchList',
        description: 'Status tracking with filters',
        accessibility: 'WCAG 2.1 AA',
        responsive: true
      },
      {
        component: 'ResearchTeamStatus',
        description: 'Agent availability with visual indicators',
        accessibility: 'WCAG 2.1 AA',
        responsive: true
      },
      {
        component: 'ResearchLibrary',
        description: 'Search, filter, sort with virtualized list',
        accessibility: 'WCAG 2.1 AA',
        responsive: true
      },
      {
        component: 'ResearchReportViewer',
        description: 'Display findings with DOMPurify sanitization',
        accessibility: 'WCAG 2.1 AA',
        responsive: true
      }
    ],

    // Implementation Approach
    implementation_approach: `**Phase 1: Database Setup**
- Create 5 tables with RLS policies
- Add indexes for performance
- Seed 7 agents (1 VP, 1 Manager, 5 Analysts)

**Phase 2: Service Layer**
- RDDepartmentService.ts (main orchestration)
- Agent classes: VP, Manager, BaseAnalyst + 5 specialists
- ResearchWorkflowEngine.ts (state machine)
- ResearchCostTracker.ts (LLM cost monitoring)

**Phase 3: UI Components**
- Create 6 components with accessibility compliance
- Add /rd-department route
- Integrate with Creative Media

**Phase 4: Testing**
- Run 5 smoke tests
- Unit tests (50% coverage minimum)
- E2E tests with Playwright
- Accessibility tests with axe-core`,

    // Technology Stack
    technology_stack: [
      {name: 'Database', tech: 'PostgreSQL (Supabase)', version: 'latest'},
      {name: 'Backend', tech: 'TypeScript', version: '5.x'},
      {name: 'Frontend', tech: 'React', version: '18.x'},
      {name: 'UI Library', tech: 'Shadcn UI', version: 'latest'},
      {name: 'State Management', tech: 'React Query', version: '5.x'},
      {name: 'LLM Integration', tech: 'Existing LLM Manager', version: 'latest'},
      {name: 'Testing - Unit', tech: 'Vitest', version: 'latest'},
      {name: 'Testing - E2E', tech: 'Playwright', version: 'latest'},
      {name: 'Testing - A11y', tech: 'axe-core', version: 'latest'}
    ],

    // Dependencies
    dependencies: [
      {
        name: 'LLM Manager',
        type: 'existing',
        status: 'available',
        location: 'src/services/llm-manager/',
        critical: true
      },
      {
        name: 'Supabase Database',
        type: 'existing',
        status: 'available',
        location: 'Database: liapbndqlqxdcgpwntbv',
        critical: true
      },
      {
        name: 'Creative Media Page',
        type: 'existing',
        status: 'available',
        location: 'src/components/creative-media/Stage34CreativeMediaAutomation.tsx',
        critical: false
      },
      {
        name: 'AICompetitiveResearchService',
        type: 'existing',
        status: 'available',
        location: 'src/services/competitive-intelligence/AICompetitiveResearchService.ts',
        critical: false
      }
    ],

    // Test Scenarios
    test_scenarios: [
      {
        scenario: 'Submit research request',
        type: 'smoke',
        steps: ['User fills form', 'Submits request', 'Request appears in database', 'Manager notified']
      },
      {
        scenario: 'Manager creates plan',
        type: 'integration',
        steps: ['Manager views request', 'Creates plan', 'Assigns analysts', 'VP approves']
      },
      {
        scenario: 'Analyst executes research',
        type: 'integration',
        steps: ['Analyst views task', 'Executes research via LLM', 'Submits findings', 'Manager reviews']
      },
      {
        scenario: 'VP approves report',
        type: 'integration',
        steps: ['Manager compiles report', 'Submits to VP', 'VP reviews', 'VP approves', 'Report delivered']
      },
      {
        scenario: 'Search research library',
        type: 'e2e',
        steps: ['User searches library', 'Filters results', 'Downloads report', 'Reuse tracked']
      }
    ],

    // Acceptance Criteria (consolidated from user stories)
    acceptance_criteria: [
      'Creative Media can submit viral video research requests and receive report within 1-2 hours',
      'Research Manager can create plans, assign analysts, and compile findings into reports',
      'Viral Content Analyst can execute research using LLM Manager with confidence scores',
      'VP can approve/reject reports with feedback and track department-wide metrics',
      'GTM team can search research library with full-text search and filters',
      'Research delivery time <2 hours (vs 2-3 days manual)',
      'Average confidence scores >85%',
      '3+ departments actively using within 90 days',
      'Research reuse rate >40%',
      'Cost reduction >80% vs manual research ($1,600-$3,200 saved per request)',
      'VP approval rating >90%'
    ],

    // Performance Requirements
    performance_requirements: {
      latency: {
        dashboard_load: '<2s',
        submit_request: '<500ms',
        library_search: '<1s for 100+ reports',
        llm_execution: '<30s per analyst'
      },
      cost: {
        per_request: '500 tokens',
        per_analyst: '2,000 tokens',
        per_department_monthly: '10,000 tokens'
      },
      scalability: {
        concurrent_requests: '10-20',
        reports_in_library: '100+ after 6 months',
        database_size: 'Handles 100K+ reports'
      }
    },

    // Checklists (PLAN, EXEC, Validation)
    plan_checklist: [
      {task: '5-step evaluation complete', status: 'completed'},
      {task: 'Sub-agents engaged (6 specialists)', status: 'completed'},
      {task: 'PRD created with all requirements', status: 'completed'},
      {task: 'Database schema defined', status: 'completed'},
      {task: 'UI wireframes approved', status: 'completed'},
      {task: 'Test strategy defined', status: 'completed'}
    ],

    exec_checklist: [
      {task: 'Navigate to ../ehg', status: 'pending'},
      {task: 'Create 5 database tables with RLS', status: 'pending'},
      {task: 'Seed 7 agents (1 VP, 1 Manager, 5 Analysts)', status: 'pending'},
      {task: 'Implement 11 service files (~1,200 LOC)', status: 'pending'},
      {task: 'Create 6 UI components (~920 LOC)', status: 'pending'},
      {task: 'Add /rd-department route', status: 'pending'},
      {task: 'Integrate with Creative Media', status: 'pending'},
      {task: 'Run 5 smoke tests', status: 'pending'}
    ],

    validation_checklist: [
      {task: 'Unit tests (50% coverage)', status: 'pending'},
      {task: 'Integration tests (workflow)', status: 'pending'},
      {task: 'E2E tests (Playwright)', status: 'pending'},
      {task: 'Accessibility tests (WCAG 2.1 AA)', status: 'pending'},
      {task: 'Security tests (RLS, XSS, injection)', status: 'pending'},
      {task: 'Performance tests (latency targets)', status: 'pending'}
    ],

    // Risks & Mitigations (from sub-agents)
    risks: [
      {
        risk: 'LLM costs exceed budget',
        impact: 'medium',
        mitigation: 'Cost tracking per request, caching similar queries (40% reduction), progressive research (20% reduction), model selection (GPT-4o-mini for simple tasks)'
      },
      {
        risk: 'Research quality inconsistency',
        impact: 'high',
        mitigation: 'Manager review gate, VP approval, confidence scoring (>85% target), analyst specialization'
      },
      {
        risk: 'Cross-department data leakage',
        impact: 'high',
        mitigation: 'RLS policies (VP/Manager/Analyst/Department roles), security testing, audit trail'
      },
      {
        risk: 'Adoption resistance from teams',
        impact: 'medium',
        mitigation: 'Start with Creative Media use case, demonstrate value (80% cost reduction), phased rollout'
      },
      {
        risk: 'LLM API latency',
        impact: 'medium',
        mitigation: 'Timeout + retry logic, async workflow (non-blocking), performance monitoring'
      }
    ],

    // Constraints
    constraints: [
      'Must use existing LLM Manager (no custom LLM integration)',
      'Must maintain backward compatibility with existing competitive intelligence UI',
      'Must not exceed 10,000 tokens/month per department (budget constraint)',
      'Must comply with WCAG 2.1 AA accessibility standards',
      'Must implement all 5 tables in single migration (atomic deployment)'
    ],

    // Assumptions
    assumptions: [
      'LLM Manager supports concurrent requests (10-20 simultaneous)',
      'Supabase connection pool can handle 20+ connections',
      'Creative Media will be first adopter within 30 days',
      'Users have basic understanding of research workflows',
      'Manual research currently costs $1,600-$3,200 per request'
    ],

    // Stakeholders
    stakeholders: [
      {name: 'Creative Media team', role: 'First adopter, primary user'},
      {name: 'Competitive Intelligence team', role: 'Secondary user, integration point'},
      {name: 'GTM Strategy team', role: 'Future user'},
      {name: 'Financial Planning team', role: 'Future user'},
      {name: 'Executive team', role: 'ROI oversight'}
    ],

    // Metadata
    created_by: 'PLAN',
    created_at: null, // Will be set automatically by database
    updated_at: null,
    approved_by: null, // Will be set to 'LEAD' after final approval
    approval_date: null,

    metadata: {
      estimated_hours: 90,
      estimated_weeks: 4,
      complexity: 'high',
      sub_agent_reviews: {
        database_architect: 'APPROVED - 8 hours',
        design_sub_agent: 'APPROVED - 24 hours',
        qa_director: 'APPROVED - 12 hours',
        security_architect: 'APPROVED - 6 hours',
        performance_lead: 'APPROVED - 4 hours',
        systems_analyst: 'APPROVED - 2 hours'
      },
      total_estimated_loc: 2120, // 1200 services + 920 UI
      database_tables: 5,
      service_files: 11,
      ui_components: 6,
      api_endpoints: 9,
      first_use_case: 'Viral video research for Creative Media Sora integration',
      target_application: 'EHG',
      implementation_path: '../ehg',
      out_of_scope: [
        'External API integrations (Crunchbase, PitchBook)',
        'Real-time market data feeds',
        'Machine learning models for trend prediction',
        'Multi-language research support',
        'Custom research agent training',
        'API automation for Creative Media (Phase 2)'
      ]
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
    return;
  }

  console.log('✅ PRD-RD-DEPT-001 Created Successfully\n');
  console.log('PRD ID:', data[0].id);
  console.log('SD Link:', data[0].directive_id);
  console.log('Status:', data[0].status);
  console.log('Version:', data[0].version);

  console.log('\n📊 PRD Summary:');
  console.log('  Functional Requirements:', prd.functional_requirements.length);
  console.log('  Technical Requirements:', prd.technical_requirements.length);
  console.log('  Acceptance Criteria:', prd.acceptance_criteria.length);
  console.log('  Dependencies:', prd.dependencies.length);
  console.log('  Risks:', prd.risks.length);

  console.log('\n🎯 Sub-Agent Input Incorporated:');
  console.log('  ✅ Database Architect: 5-table schema with RLS');
  console.log('  ✅ Design Sub-Agent: 6 UI components with accessibility');
  console.log('  ✅ QA Director: 85% coverage target, 6 test tiers');
  console.log('  ✅ Security Architect: Input validation, RLS policies');
  console.log('  ✅ Performance Lead: Latency targets, cost tracking');
  console.log('  ✅ Systems Analyst: Integration strategy');

  console.log('\n🎯 Next Steps (LEO Protocol):');
  console.log('  1. PLAN creates PLAN→EXEC handoff:');
  console.log('     node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-RD-DEPT-001');
  console.log('  2. EXEC implements in ../ehg (NOT EHG_Engineer!)');
  console.log('  3. EXEC runs 5 smoke tests');
  console.log('  4. EXEC creates EXEC→PLAN handoff');
  console.log('  5. PLAN supervisor verification with all sub-agents');

  return data[0];
}

createRDDepartmentPRD();
