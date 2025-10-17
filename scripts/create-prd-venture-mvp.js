#!/usr/bin/env node

/**
 * Create Comprehensive PRD for SD-VENTURE-IDEATION-MVP-001
 * Incorporates all 10 user stories, sub-agent findings, and mandatory conditions
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-VENTURE-IDEATION-MVP-001';

async function createPRD() {
  console.log('📝 Creating Comprehensive PRD for SD-VENTURE-IDEATION-MVP-001...');
  console.log('='.repeat(80));

  const prd = {
    id: randomUUID(),
    title: 'Intelligent Venture Creation MVP - Product Requirements Document',
    sd_id: SD_ID,
    directive_id: SD_ID,
    version: '1.0',
    status: 'approved',
    priority: 'high',
    category: 'venture-platform',
    phase: 'PLAN',

    executive_summary: `Transform venture ideation from a simple modal form into an AI-orchestrated intelligent process. Replace VentureCreationDialog modal with full-page progressive workflow, integrate CrewAI framework, and deploy 4 core research agents that conduct market analysis, pain point validation, competitive intelligence, and strategic fit assessment in 5-15 minutes.

This PRD establishes requirements for the foundational AI-driven venture intelligence platform based on comprehensive sub-agent review (5 agents, 88% avg confidence).`,

    business_context: `Current modal form provides no intelligence - just data capture. Chairman must conduct all research manually. This creates a 10x opportunity: AI agents can research market data, validate pain points via Reddit/forums, analyze competitors, and assess portfolio fit in minutes instead of hours/days. CrewAI framework provides enterprise-ready multi-agent orchestration with proven 5.76x performance advantages.`,

    technical_context: `Existing infrastructure: VentureCreationDialog.tsx (365 lines), VoiceCapture component, EVA validation service. Gaps identified: No CrewAI framework, no research agents, no full-page workflow, no AI research progress display, no pause/resume functionality, no multi-agent orchestration infrastructure. Sub-agent review (5 agents, 88% avg confidence) confirms feasibility and provides detailed technical specifications.`,

    functional_requirements: [
      {
        objective: 'Replace modal with full-page progressive workflow at /ventures/new',
        rationale: 'Current 365-line modal is too constrained for multi-step AI research process requiring 5-15 minutes',
        success_metric: 'Route /ventures/new loads successfully with 5-step progress indicator'
      },
      {
        objective: 'Integrate CrewAI framework foundation with Python FastAPI backend',
        rationale: 'Proven 5.76x performance advantage, enterprise-ready multi-agent orchestration',
        success_metric: 'CrewAI hierarchical crew process executes 4 agents in parallel within 15 minutes'
      },
      {
        objective: 'Deploy 4 core research agents with specialized capabilities',
        rationale: 'Automate 2-4 hours of manual research into 5-15 minute AI-driven process',
        success_metric: 'All 4 agents return findings with ≥85% confidence scores'
      },
      {
        objective: 'Implement pause/resume functionality with draft persistence',
        rationale: 'Chairman may need to context-switch during 5-15 minute research duration',
        success_metric: 'Draft state saves to database, resume returns to exact step'
      },
      {
        objective: 'Maintain chairman control with review/edit/override capabilities',
        rationale: 'AI augments but never replaces chairman judgment',
        success_metric: '85%+ chairman acceptance rate on AI-generated suggestions'
      },
      {
        objective: 'Enforce security and cost controls',
        rationale: 'Research may expose sensitive data, API costs must stay ≤$2.00 per venture',
        success_metric: 'All 3 security conditions met: rate limiting, encryption, cost tracking'
      }
    ],

    technical_requirements: [
      {
        feature_id: 'F-001',
        name: 'Full-Page Venture Creation Workflow',
        description: 'Replace 365-line VentureCreationDialog modal with dedicated full-page route at /ventures/new',
        user_stories: ['US-001'],
        priority: 'critical',
        complexity: 'medium',
        acceptance_criteria: [
          'Route /ventures/new loads successfully',
          'Multi-step form with 5-step progress indicator (Idea → Research → Results → Review → Confirm)',
          'Responsive layout with full-screen real estate',
          'Reuses existing VoiceCapture and EVA validation components',
          'Modal VentureCreationDialog deprecated but preserved for future quick-create',
          'Navigation integrates seamlessly with existing app structure'
        ],
        technical_notes: 'Create VentureCreationPage.tsx (~600 lines) - Main orchestration component with step management, form state, and CrewAI integration'
      },
      {
        feature_id: 'F-002',
        name: 'Company Assignment Field',
        description: 'Required field for venture ownership, defaults to EHG, editable at Phase 3',
        user_stories: ['US-002'],
        priority: 'high',
        complexity: 'low',
        acceptance_criteria: [
          'Company field is required',
          'Defaults to EHG automatically',
          'Editable at Phase 3 after AI research completes',
          'Validates company selection before submission',
          'Supports multi-tenancy with company-level data isolation'
        ],
        technical_notes: 'Add company dropdown/select with default value, implement edit lock until Phase 3, integrate with existing companies table'
      },
      {
        feature_id: 'F-003',
        name: 'CrewAI Framework Integration',
        description: 'Python FastAPI backend with CrewAI hierarchical crew orchestration',
        user_stories: ['US-003'],
        priority: 'critical',
        complexity: 'high',
        acceptance_criteria: [
          'CrewAI installed via pip (crewai crewai-tools)',
          'Python FastAPI service running and accessible',
          'Hierarchical crew process configured with auto-assigned manager',
          'REST API endpoints: POST /api/crewai/execute, GET /api/crewai/status/:sessionId',
          'Database schema: crewai_agents (agent registry), crewai_crews (crew configs), crewai_tasks (execution tracking)',
          'React frontend communicates with Python backend via REST API',
          'Error handling: retry logic, timeout (15 min max), fallback to manual entry'
        ],
        technical_notes: 'Setup Python backend in /backend/crewai_service/, configure CrewAI hierarchical crews, create 3 database tables, implement API endpoints with error handling. Bundle size: ~150KB acceptable for this feature.'
      },
      {
        feature_id: 'F-004',
        name: 'Market Sizing Analyst Agent',
        description: 'AI agent to calculate TAM/SAM/SOM using market data APIs',
        user_stories: ['US-004'],
        priority: 'high',
        complexity: 'medium',
        acceptance_criteria: [
          'Agent deployed with role: Senior Market Intelligence Analyst',
          'Goal: Calculate TAM/SAM/SOM with high accuracy using market data APIs',
          'Tools: Market data APIs, Competitive analysis tools',
          'Delegation enabled: true',
          'Completes analysis within 2-4 minutes',
          'Returns structured results: {tam: number, sam: number, som: number, confidence: number, sources: string[]}',
          'Confidence score ≥85% on average',
          'Stores results in crewai_tasks table with execution metrics'
        ],
        technical_notes: 'Create CrewAI agent with market data API tools (TBD: specific APIs), implement delegation, configure timeout and retry logic'
      },
      {
        feature_id: 'F-005',
        name: 'Pain Point Validator Agent',
        description: 'AI agent to validate customer pain points via Reddit and forums',
        user_stories: ['US-005'],
        priority: 'high',
        complexity: 'medium',
        acceptance_criteria: [
          'Agent deployed with role: Customer Insights Researcher',
          'Goal: Identify and validate genuine customer pain points via Reddit/forums',
          'Tools: Reddit API connector (extends GenericRestConnector), Sentiment analysis',
          'Delegation enabled: true',
          'Integrates with Reddit API: 60 requests/minute rate limit',
          'Performs sentiment analysis on customer discussions',
          'Completes analysis within 3-5 minutes',
          'Returns pain point validation: {painPoints: string[], sentiment: number, evidence: string[], confidence: number}',
          'Sanitizes external API responses to prevent injection attacks'
        ],
        technical_notes: 'Extend GenericRestConnector for Reddit API, implement sentiment analysis library, configure rate limiting (60 req/min), add input sanitization'
      },
      {
        feature_id: 'F-006',
        name: 'Competitive Landscape Mapper Agent',
        description: 'AI agent to map competitive landscape and identify differentiation opportunities',
        user_stories: ['US-006'],
        priority: 'high',
        complexity: 'medium',
        acceptance_criteria: [
          'Agent deployed with role: Competitive Intelligence Specialist',
          'Goal: Map competitive landscape and identify differentiation opportunities',
          'Tools: Competitive tracking service, Market analysis APIs',
          'Delegation enabled: true',
          'Maps existing competitors in the space',
          'Identifies differentiation opportunities',
          'Completes analysis within 2-4 minutes',
          'Returns competitive analysis: {competitors: object[], differentiators: string[], positioning: string, confidence: number}'
        ],
        technical_notes: 'Configure agent with competitive tracking tools (TBD: specific APIs), market analysis APIs, modular design for easy API swaps'
      },
      {
        feature_id: 'F-007',
        name: 'Strategic Fit Analyzer Agent',
        description: 'AI agent to evaluate portfolio alignment and identify synergies',
        user_stories: ['US-007'],
        priority: 'high',
        complexity: 'medium',
        acceptance_criteria: [
          'Agent deployed with role: Strategic Portfolio Analyst',
          'Goal: Evaluate alignment with portfolio strategy and identify synergies',
          'Tools: Portfolio analysis engine, Synergy detection system',
          'Delegation enabled: true',
          'Evaluates alignment with existing ventures in portfolio',
          'Identifies synergies with current ventures',
          'Completes analysis within 1-3 minutes',
          'Returns strategic fit: {fitScore: number, synergies: string[], risks: string[], recommendation: string, confidence: number}'
        ],
        technical_notes: 'Configure agent with portfolio analysis engine (query existing ventures), synergy detection system, integrate with ventures table'
      },
      {
        feature_id: 'F-008',
        name: 'Pause and Resume Functionality',
        description: 'Allow chairman to pause venture creation and resume later with full state preservation',
        user_stories: ['US-008'],
        priority: 'high',
        complexity: 'medium',
        acceptance_criteria: [
          'Pause button available at any step during workflow',
          'Draft state persists to database on pause: {ventureId: uuid, currentStep: number, formData: object, researchStatus: object}',
          'Resume functionality loads draft from database',
          'AI research progress is preserved (completed agents don\'t re-execute)',
          'User is returned to exact step where they left off',
          'Draft state expires after 7 days (soft delete with deleted_at timestamp)',
          'Email notification when AI research completes (optional)'
        ],
        technical_notes: 'Implement draft state management, database table for incomplete ventures (venture_drafts), state serialization/deserialization, resume logic with research cache. MANDATORY CONDITION: Must implement as MVP feature (not deferred).'
      },
      {
        feature_id: 'F-009',
        name: 'AI Research Progress Display',
        description: 'Real-time progress indicator showing agent execution status during 5-15 minute research',
        user_stories: ['US-009'],
        priority: 'medium',
        complexity: 'medium',
        acceptance_criteria: [
          'Progress indicator shows which agents are running, completed, or failed',
          'Real-time status updates (e.g., "Market Sizing Agent: Analyzing TAM...")',
          'Estimated time remaining displayed for each agent',
          'Handles 5-15 minute research duration gracefully with loading states',
          'Agent cards display status: pending (gray) → running (blue) → complete (green) → failed (red)',
          'Optimistic UI updates during research',
          'WebSocket or polling for real-time agent status (every 2 seconds)',
          'Visual feedback for long-running operations'
        ],
        technical_notes: 'Create ResearchAgentsPanel.tsx (~400 lines) - 4 agent cards + orchestration, implement WebSocket or polling for real-time status, progress bar with step indicators. MANDATORY CONDITION: Implement comprehensive loading states.'
      },
      {
        feature_id: 'F-010',
        name: 'Chairman Review and Edit Interface',
        description: 'Allow chairman to review, edit, and approve/reject AI-generated insights',
        user_stories: ['US-010'],
        priority: 'high',
        complexity: 'medium',
        acceptance_criteria: [
          'Enhanced description displayed with AI-generated market insights in side-by-side view',
          'ResearchResultsView.tsx (~300 lines) displays all research findings: market size, pain points, competitors, strategic fit',
          'ChairmanReviewEditor.tsx (~250 lines) provides edit interface with diff view showing original vs AI-suggested changes',
          'Edit interface allows modifications to all fields: title, description, category, assumptions, success criteria',
          'Accept button saves AI suggestions as-is and proceeds to Stage 1 scaffolding',
          'Reject button allows manual override (keeps original input)',
          'Mixed mode: Accept some suggestions, reject others',
          'Chairman feedback is tracked for learning: {accepted: boolean, modified: boolean, feedback: string}',
          'Feedback stored in crewai_tasks table for future agent improvement'
        ],
        technical_notes: 'Create review interface with diff view (react-diff-viewer or similar), accept/reject workflow with partial acceptance, feedback tracking in database. Target 85%+ chairman acceptance rate.'
      }
    ],

    ui_ux_requirements: {
      component_breakdown: [
        {
          component: 'VentureCreationPage.tsx',
          estimated_lines: 600,
          description: 'Main orchestration component with 5-step workflow, form state management, CrewAI integration',
          features: ['Multi-step form', 'Progress indicator', 'Step navigation', 'State persistence', 'Error handling']
        },
        {
          component: 'ResearchAgentsPanel.tsx',
          estimated_lines: 400,
          description: '4 agent cards with real-time status, orchestration engine',
          features: ['Agent status cards', 'Real-time updates', 'Progress tracking', 'Error display', 'Retry controls']
        },
        {
          component: 'ResearchResultsView.tsx',
          estimated_lines: 300,
          description: 'Display all research findings with tabs for each agent',
          features: ['Tabbed interface', 'Data visualization', 'Confidence scores', 'Source links', 'Export capability']
        },
        {
          component: 'ChairmanReviewEditor.tsx',
          estimated_lines: 250,
          description: 'Edit and approve interface with diff view',
          features: ['Diff viewer', 'Inline editing', 'Accept/reject controls', 'Feedback collection', 'Mixed mode']
        },
        {
          component: 'ProgressStepper.tsx',
          estimated_lines: 150,
          description: 'Step navigation with 5 steps',
          features: ['Step indicator', 'Navigation controls', 'Keyboard navigation', 'Validation', 'Progress persistence']
        }
      ],
      total_estimated_lines: 1700,
      design_patterns: [
        'Multi-step form with progress indicator (Shadcn Stepper pattern)',
        'Loading states for AI research (5-15 min duration)',
        'Real-time updates via polling or WebSocket (every 2 seconds)',
        'Editable research results tables',
        'Save draft functionality',
        'Optimistic UI updates during research',
        'Show estimated time remaining for each agent',
        'Allow chairman to cancel research and edit manually',
        'Visual feedback for long-running operations'
      ],
      accessibility: [
        'Keyboard navigation for all steps',
        'Screen reader announcements for AI progress',
        'Focus management during step transitions',
        'ARIA labels for research agent status',
        'WCAG 2.1 AA compliance for all new components'
      ]
    },

    system_architecture: {
      database_schema: {
        existing_tables: [
          'ventures - Main ventures table (already exists)',
          'venture_stages - 40-stage workflow (already exists)',
          'users - Chairman authentication (already exists)',
          'companies - Multi-tenant structure (already exists)'
        ],
        new_tables: [
          {
            name: 'crewai_agents',
            purpose: 'Agent registry with role, goal, backstory, tools, capabilities',
            columns: [
              'id UUID PRIMARY KEY',
              'agent_role TEXT NOT NULL',
              'goal TEXT NOT NULL',
              'backstory TEXT',
              'capabilities JSONB',
              'llm_config JSONB',
              'delegation_enabled BOOLEAN DEFAULT true',
              'tools TEXT[]',
              'is_active BOOLEAN DEFAULT true',
              'created_at TIMESTAMP DEFAULT NOW()',
              'updated_at TIMESTAMP DEFAULT NOW()'
            ]
          },
          {
            name: 'crewai_crews',
            purpose: 'Crew configurations for hierarchical orchestration',
            columns: [
              'id UUID PRIMARY KEY',
              'crew_name TEXT NOT NULL',
              'process_type TEXT DEFAULT \'hierarchical\'',
              'agent_ids UUID[]',
              'config JSONB',
              'is_active BOOLEAN DEFAULT true',
              'created_at TIMESTAMP DEFAULT NOW()',
              'updated_at TIMESTAMP DEFAULT NOW()'
            ]
          },
          {
            name: 'crewai_tasks',
            purpose: 'Task execution tracking with results and performance',
            columns: [
              'id UUID PRIMARY KEY',
              'venture_id UUID REFERENCES ventures(id)',
              'crew_id UUID REFERENCES crewai_crews(id)',
              'task_type TEXT',
              'description TEXT',
              'assigned_agent_id UUID REFERENCES crewai_agents(id)',
              'status TEXT CHECK (status IN (\'pending\', \'running\', \'completed\', \'failed\'))',
              'result JSONB',
              'execution_time_ms INT',
              'confidence_score DECIMAL(3,2)',
              'chairman_accepted BOOLEAN',
              'chairman_feedback TEXT',
              'created_at TIMESTAMP DEFAULT NOW()',
              'updated_at TIMESTAMP DEFAULT NOW()'
            ]
          },
          {
            name: 'venture_drafts',
            purpose: 'Store incomplete ventures for pause/resume functionality',
            columns: [
              'id UUID PRIMARY KEY',
              'venture_id UUID',
              'user_id UUID REFERENCES users(id)',
              'current_step INT',
              'form_data JSONB',
              'research_status JSONB',
              'created_at TIMESTAMP DEFAULT NOW()',
              'updated_at TIMESTAMP DEFAULT NOW()',
              'deleted_at TIMESTAMP'
            ]
          }
        ],
        rls_policies: [
          'crewai_agents: Read-only for all authenticated users',
          'crewai_crews: Read-only for all authenticated users',
          'crewai_tasks: Users can only view tasks for their company ventures',
          'venture_drafts: Users can only access their own drafts'
        ],
        indexes: [
          'crewai_tasks(venture_id, status)',
          'crewai_tasks(assigned_agent_id, status)',
          'crewai_tasks(status, created_at) for pending operations',
          'venture_drafts(user_id, deleted_at) for active drafts'
        ]
      },
      backend_services: {
        crewai_service: {
          technology: 'Python FastAPI',
          location: '/backend/crewai_service/',
          endpoints: [
            'POST /api/crewai/execute - Execute CrewAI crew for venture research',
            'GET /api/crewai/status/:sessionId - Get real-time agent status',
            'POST /api/crewai/pause/:sessionId - Pause research session',
            'POST /api/crewai/resume/:sessionId - Resume paused session',
            'GET /api/crewai/agents - List available agents',
            'GET /api/crewai/crews - List configured crews'
          ],
          dependencies: ['crewai', 'crewai-tools', 'fastapi', 'uvicorn', 'pydantic'],
          installation: 'pip install crewai crewai-tools fastapi uvicorn pydantic',
          configuration: 'Hierarchical crew process with auto-assigned manager'
        },
        reddit_connector: {
          technology: 'Python (extends GenericRestConnector)',
          purpose: 'Scrape subreddits for pain point validation',
          rate_limiting: '60 requests/minute',
          authentication: 'Reddit API credentials in environment variables'
        }
      },
      frontend_integration: {
        communication: 'REST API between React frontend and Python backend',
        polling_interval: '2 seconds for real-time agent status',
        error_handling: 'Retry logic, timeout (15 min max), fallback to manual entry',
        state_management: 'React Context API or Zustand for form state and research progress'
      }
    },

    non_functional_requirements: [
      {
        requirement: 'Chairman role verification required for venture creation',
        implementation: 'Check user role in session before allowing /ventures/new access',
        priority: 'critical'
      },
      {
        requirement: 'RLS policies for ventures table (user can only create for their company)',
        implementation: 'Existing RLS policies apply, no changes needed',
        priority: 'critical'
      },
      {
        requirement: 'API rate limiting for AI research endpoints',
        implementation: 'Rate limit: 5 venture creations per hour per user, 10 AI research operations per day per company',
        priority: 'critical',
        mandatory_condition: 'MUST implement rate limiting before launch'
      },
      {
        requirement: 'Session validation for long-running research operations (5-15 min)',
        implementation: 'Validate JWT token on every polling request, refresh if expired',
        priority: 'high'
      },
      {
        requirement: 'Encrypt AI research results before storage',
        implementation: 'Encrypt sensitive fields in crewai_tasks.result JSONB column using Supabase encryption',
        priority: 'critical',
        mandatory_condition: 'MUST encrypt AI research results'
      },
      {
        requirement: 'Sanitize external API responses (from market research, Reddit, competitors)',
        implementation: 'Use DOMPurify or similar to sanitize all external data before rendering',
        priority: 'high'
      },
      {
        requirement: 'Validate chairman input to prevent injection attacks',
        implementation: 'Max 2000 chars for venture description, sanitize all user input',
        priority: 'high'
      },
      {
        requirement: 'Secure CrewAI API keys in environment variables',
        implementation: 'Store OpenAI/Anthropic API keys in .env, never in client code',
        priority: 'critical'
      },
      {
        requirement: 'Cost tracking and budget alerts',
        implementation: 'Monitor OpenAI API usage per venture, alert if research exceeds $2.00',
        priority: 'critical',
        mandatory_condition: 'MUST add cost tracking and budget alerts'
      },
      {
        requirement: 'Timeout: 15 minutes max for AI research',
        implementation: 'Hard timeout on all CrewAI crew executions to prevent runaway costs',
        priority: 'high'
      },
      {
        requirement: 'Audit logging for all AI research operations',
        implementation: 'Log all CrewAI executions with user, venture, cost, duration in crewai_tasks',
        priority: 'medium'
      },
      {
        requirement: 'GDPR compliance: Venture data belongs to company, not individual user',
        implementation: 'Existing multi-tenancy handles this, no changes needed',
        priority: 'high'
      },
      {
        requirement: 'Data retention: AI research results stored for audit (30 days)',
        implementation: 'Soft delete with deleted_at after 30 days, archive to cold storage',
        priority: 'medium'
      },
      {
        requirement: 'Third-party APIs: Ensure compliance with Reddit, market data ToS',
        implementation: 'Review and document ToS compliance, implement attribution as required',
        priority: 'medium'
      }
    ],

    performance_requirements: {
      response_times: [
        'Route /ventures/new loads in <2 seconds',
        'Form submission and research initiation <1 second',
        'Agent status polling response <500ms',
        'Chairman review page renders in <2 seconds'
      ],
      research_duration: [
        'Total AI research completes in 5-15 minutes (target: 10 minutes avg)',
        'Market Sizing Agent: 2-4 minutes',
        'Pain Point Validator: 3-5 minutes',
        'Competitive Landscape Mapper: 2-4 minutes',
        'Strategic Fit Analyzer: 1-3 minutes'
      ],
      scalability: [
        'Support 100 concurrent venture creations',
        'Handle 1000 ventures/day at peak',
        'Rate limiting prevents abuse: 5 ventures/hour per user',
        'Database indexes on high-traffic queries'
      ],
      cost_targets: [
        'Cost per venture research ≤$2.00',
        'Monthly at scale (100 ventures): $50 - $200',
        'Cost reduction: Cache common research, use GPT-3.5 for drafts'
      ]
    },

    test_scenarios: {
      unit_tests: [
        'Form validation logic',
        'State management functions',
        'API client functions',
        'Component rendering'
      ],
      integration_tests: [
        'End-to-end venture creation flow (happy path)',
        'Pause/resume functionality',
        'Chairman accept/reject workflows',
        'Error handling (API failures, timeouts)',
        'Rate limiting enforcement'
      ],
      e2e_tests: [
        'Full workflow: Idea → Research → Results → Review → Confirm',
        'Multi-step form navigation',
        'Real-time progress updates',
        'Draft state persistence and resume',
        'Accessibility testing (keyboard navigation, screen readers)'
      ],
      smoke_tests: [
        'Route /ventures/new loads successfully',
        'CrewAI backend service is responsive',
        'All 4 agents are registered and active',
        'Database tables exist and have correct schema'
      ],
      acceptance_criteria: [
        '85%+ chairman acceptance rate on AI-generated suggestions',
        'AI research completes in 5-15 minutes',
        'All 3 security conditions met (rate limiting, encryption, cost tracking)',
        'All accessibility requirements pass WCAG 2.1 AA'
      ]
    },

    risks: [
      {
        risk: 'AI research quality varies by industry/niche',
        severity: 'medium',
        likelihood: 'high',
        mitigation: 'Show confidence scores, allow chairman to request re-research or edit manually',
        contingency: 'If confidence <70%, auto-suggest manual research'
      },
      {
        risk: 'Research costs exceed budget ($2+ per venture)',
        severity: 'high',
        likelihood: 'medium',
        mitigation: 'Implement cost tracking, budget alerts, and research tier options (fast/thorough)',
        contingency: 'If cost exceeds $2, halt research and notify chairman'
      },
      {
        risk: 'CrewAI API rate limits or downtime',
        severity: 'high',
        likelihood: 'low',
        mitigation: 'Implement retry logic, queuing, and fallback to manual entry',
        contingency: 'If CrewAI unavailable, allow manual venture creation via modal fallback'
      },
      {
        risk: 'Third-party data sources (Reddit, market data) change APIs',
        severity: 'medium',
        likelihood: 'medium',
        mitigation: 'Modular agent design - easy to swap data sources',
        contingency: 'Disable affected agent, notify chairman of reduced research'
      },
      {
        risk: 'Chairman abandons long-running research (5-15 min)',
        severity: 'medium',
        likelihood: 'high',
        mitigation: 'Pause/resume functionality, save draft, email notification when complete',
        contingency: 'Auto-save drafts every 30 seconds, expire after 7 days'
      },
      {
        risk: 'Security - AI research may expose sensitive market data',
        severity: 'high',
        likelihood: 'medium',
        mitigation: 'Encrypt research results, RLS policies, audit logging',
        contingency: 'Manual review of sensitive ventures before storage'
      }
    ],

    acceptance_criteria: [
      'AI research completes in 5-15 minutes (vs 2-4 hours manual)',
      'Chairman satisfaction ≥8/10 with AI research quality',
      'Cost per venture research ≤$2.00',
      '≥80% of ventures use AI research (vs manual)',
      'Research insights lead to ≥30% improvement in venture validation accuracy',
      '85%+ chairman acceptance rate on AI-generated suggestions',
      'Task completion rate: 90%+',
      'Time savings vs manual: 60%+',
      'Confidence score average: 85%+',
      'Zero security incidents',
      'Zero cost overruns (>$2.00 per venture)'
    ],

    constraints: [
      {
        condition: 'Break into 5 components (~300-600 lines each)',
        source: 'Senior Design Sub-Agent',
        rationale: 'Maintainability and testability - components >800 lines are too complex',
        verification: 'Verify all 5 components exist and are within line count targets'
      },
      {
        condition: 'Implement comprehensive loading states',
        source: 'Senior Design Sub-Agent',
        rationale: 'UX requirement for 5-15 minute research duration',
        verification: 'Test loading states for all 4 agents and transitions'
      },
      {
        condition: 'Include pause/resume as MVP feature (not deferred)',
        source: 'Senior Design Sub-Agent',
        rationale: 'Critical for chairman workflow during long-running operations',
        verification: 'Test pause/resume functionality end-to-end'
      },
      {
        condition: 'Must implement rate limiting before launch',
        source: 'Chief Security Architect',
        rationale: 'Prevent abuse and cost overruns',
        verification: 'Test rate limits: 5 ventures/hour per user, 10 research ops/day per company'
      },
      {
        condition: 'Must encrypt AI research results',
        source: 'Chief Security Architect',
        rationale: 'Protect sensitive market data from unauthorized access',
        verification: 'Verify encryption on crewai_tasks.result JSONB column'
      },
      {
        condition: 'Must add cost tracking and budget alerts',
        source: 'Chief Security Architect',
        rationale: 'Prevent runaway API costs',
        verification: 'Test cost tracking logs and budget alert notifications'
      }
    ],

    implementation_approach: [
      {
        phase: 'Week 1: Foundation',
        tasks: [
          'Install CrewAI and configure Python FastAPI service',
          'Design and implement database schema (4 new tables)',
          'Create full-page route /ventures/new with basic layout',
          'Implement VentureCreationPage.tsx with 5-step structure',
          'Set up REST API endpoints for CrewAI communication'
        ],
        deliverables: [
          'CrewAI backend service running',
          'Database tables created with RLS policies',
          'Basic full-page workflow accessible',
          'API endpoints operational'
        ]
      },
      {
        phase: 'Week 2: Core Agents',
        tasks: [
          'Build Market Sizing Analyst Agent with CrewAI',
          'Build Pain Point Validator Agent with Reddit API integration',
          'Build Competitive Landscape Mapper Agent',
          'Build Strategic Fit Analyzer Agent',
          'Configure hierarchical crew with all 4 agents',
          'Test agent execution and result format'
        ],
        deliverables: [
          'All 4 agents deployed and active',
          'CrewAI crew configuration complete',
          'Agent execution tested with sample ventures'
        ]
      },
      {
        phase: 'Week 3: Integration & Orchestration',
        tasks: [
          'Integrate Reddit API connector with rate limiting',
          'Implement orchestration engine for parallel agent execution',
          'Build ResearchAgentsPanel.tsx with real-time status',
          'Implement polling/WebSocket for agent progress',
          'Add error handling, retry logic, and timeouts'
        ],
        deliverables: [
          'Reddit API integration complete',
          'Agent orchestration engine working',
          'Real-time progress display functional',
          'Error handling tested'
        ]
      },
      {
        phase: 'Week 4: Chairman Interface',
        tasks: [
          'Build ResearchResultsView.tsx for displaying findings',
          'Build ChairmanReviewEditor.tsx with diff view',
          'Implement accept/reject/mixed-mode workflows',
          'Add pause/resume functionality with draft persistence',
          'Implement feedback tracking for chairman decisions'
        ],
        deliverables: [
          'Chairman review interface complete',
          'Pause/resume functionality tested',
          'Feedback tracking operational'
        ]
      },
      {
        phase: 'Week 5: Security, Testing & Launch',
        tasks: [
          'Implement rate limiting (5/hour per user, 10/day per company)',
          'Add encryption for AI research results',
          'Implement cost tracking and budget alerts',
          'End-to-end testing with all 6 mandatory conditions',
          'Accessibility testing (WCAG 2.1 AA)',
          'Performance testing (5-15 min research duration)',
          'Deploy to production'
        ],
        deliverables: [
          'All 6 mandatory conditions met',
          'Security requirements satisfied',
          'Testing complete with passing results',
          'Production deployment successful'
        ]
      }
    ],

    dependencies: {
      internal_dependencies: [
        'Existing ventures table and 40-stage workflow',
        'VoiceCapture component for voice input',
        'EVA validation service for quality scoring',
        'Chairman authentication and role verification',
        'Companies table for multi-tenancy'
      ],
      external_dependencies: [
        'CrewAI framework (Python package)',
        'OpenAI or Anthropic API for LLM reasoning',
        'Reddit API for pain point validation',
        'Market data APIs for sizing analysis (TBD)',
        'Competitive tracking services (TBD)'
      ],
      integration_points: [
        'React frontend → Python FastAPI backend (REST API)',
        'CrewAI agents → External APIs (Reddit, market data)',
        'Python backend → Supabase database (PostgreSQL)',
        'Frontend → Supabase (existing auth and ventures queries)'
      ]
    },

    technology_stack: {
      frontend: ['React', 'Vite', 'Shadcn UI', 'TypeScript', 'React Context API or Zustand'],
      backend: ['Python', 'FastAPI', 'CrewAI', 'OpenAI/Anthropic APIs'],
      database: ['Supabase (PostgreSQL)', 'JSONB for flexible data'],
      external_apis: ['Reddit API', 'Market data APIs (TBD)', 'Competitive tracking (TBD)'],
      deployment: ['Docker', 'GitHub Actions CI/CD']
    },

    metadata: {
      timeline: {
        start_date: '2025-10-07',
        target_completion: '2025-11-11',
        duration: '5 weeks',
        milestones: [
          {
            week: 1,
            milestone: 'Foundation: CrewAI setup, database schema, full-page route',
            date: '2025-10-14'
          },
          {
            week: 2,
            milestone: 'Core Agents: 4 agents deployed with CrewAI crew',
            date: '2025-10-21'
          },
          {
            week: 3,
            milestone: 'Integration: Reddit API, orchestration, real-time progress',
            date: '2025-10-28'
          },
          {
            week: 4,
            milestone: 'Chairman Interface: Review UI, pause/resume, feedback',
            date: '2025-11-04'
          },
          {
            week: 5,
            milestone: 'Security, Testing & Launch: All conditions met, deployed',
            date: '2025-11-11'
          }
        ]
      },
      approval_criteria: [
        'All 10 user stories implemented and tested',
        'All 6 mandatory conditions met and verified',
        'All security requirements satisfied',
        'Performance targets achieved (5-15 min research, <$2.00 cost)',
        'Accessibility compliance (WCAG 2.1 AA)',
        'Chairman acceptance rate ≥85% in testing',
        'Zero critical bugs',
        'LEAD approval obtained',
        'PLAN verification passed with all sub-agents'
      ],
      sub_agent_reviews: {
        count: 5,
        average_confidence: 0.88,
        verdicts: ['APPROVED', 'APPROVED_WITH_CONDITIONS', 'APPROVED_WITH_CONDITIONS', 'APPROVED', 'APPROVED']
      }
    },

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'PLAN'
  };

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert([prd])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully created PRD-VENTURE-MVP-001!');
    console.log('');
    console.log('📊 PRD Summary:');
    console.log(`ID: ${data.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Linked to: ${data.directive_id}`);
    console.log(`Version: ${data.version}`);
    console.log(`Status: ${data.status}`);
    console.log('');
    console.log('📋 Functional Requirements:', prd.functional_requirements.length);
    console.log('🎯 Technical Requirements:', prd.technical_requirements.length);
    console.log('🔒 Non-Functional Requirements:', prd.non_functional_requirements.length);
    console.log('⚠️  Constraints (Mandatory Conditions):', prd.constraints.length);
    console.log('📈 Acceptance Criteria:', prd.acceptance_criteria.length);
    console.log('');
    console.log('📦 UI Components:');
    prd.ui_ux_requirements.component_breakdown.forEach(c => {
      console.log(`  - ${c.component} (~${c.estimated_lines} lines)`);
    });
    console.log(`  Total: ~${prd.ui_ux_requirements.total_estimated_lines} lines`);
    console.log('');
    console.log('🗄️  Database Schema:');
    console.log(`  Existing Tables: ${prd.system_architecture.database_schema.existing_tables.length}`);
    console.log(`  New Tables: ${prd.system_architecture.database_schema.new_tables.length}`);
    prd.system_architecture.database_schema.new_tables.forEach(t => {
      console.log(`    - ${t.name} (${t.columns.length} columns)`);
    });
    console.log('');
    console.log('⚠️  6 MANDATORY CONDITIONS FOR IMPLEMENTATION:');
    prd.constraints.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.condition}`);
      console.log(`     Source: ${c.source}`);
    });
    console.log('');
    console.log('📅 Timeline: 5 weeks (2025-10-07 to 2025-11-11)');
    console.log('='.repeat(80));
    console.log('✅ PRD CREATION COMPLETE');
    console.log('🎯 Next Step: Engage QA Engineering Director for test planning');
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error creating PRD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createPRD();
}

export { createPRD };
