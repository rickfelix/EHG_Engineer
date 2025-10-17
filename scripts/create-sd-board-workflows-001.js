#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-BOARD-WORKFLOWS-001
 * Board of Directors & AI Workflow Orchestration MVP
 *
 * Establishes AI Board of Directors governance system with 7 board member agents (EVA as chair + 6 new members),
 * integrated with existing RAID log for decision tracking, and visual workflow builder powered by CrewAI Flows
 * for orchestrating complex board meetings and decision workflows.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createBoardWorkflowsSD() {
  console.log('🎯 Creating Strategic Directive: Board of Directors & AI Workflow Orchestration MVP');
  console.log('===================================================================================\n');

  const strategicDirective = {
    id: 'SD-BOARD-WORKFLOWS-001',
    sd_key: 'SD-BOARD-WORKFLOWS-001',
    title: 'Board of Directors & AI Workflow Orchestration MVP',
    description: `Establish comprehensive AI Board of Directors governance system with 7 board member agents
    (EVA as Board Chair + 6 new specialized board members: CFO, CTO, GTM Strategist, Legal/Compliance, COO, CEO agents),
    leveraging existing RAID log infrastructure for decision tracking, and deploying visual workflow builder
    powered by CrewAI Flows for event-driven orchestration of board meetings, voting workflows, and governance processes.

    Full-page visual workflow builder with React Flow enables drag-and-drop flow design, state management,
    conditional routing, and dynamic Python code generation. Board members use weighted voting system based on
    expertise domain (financial decisions favor CFO, technical favor CTO, etc.).`,
    priority: 'high',
    status: 'draft',
    category: 'ai-governance',
    rationale: `Existing infrastructure analysis reveals:
    (1) Extensive Board of Directors documentation exists but zero implementation
    (2) RAID log already tracks Decisions - can leverage instead of duplicate tables
    (3) CrewAI agent platform exists - just need board-specific agents and department
    (4) No workflow orchestration system - needed for complex board meeting flows
    (5) CrewAI Flows is production-ready (12M+ executions/day) with @start, @listen, @router decorators
    (6) Modal-based configuration rejected by user - need full-page visual builder

    MVP delivers board governance with minimal database changes (3 new fields to existing raid_log vs 4 new tables),
    reuses existing agent infrastructure, and provides visual workflow configuration for non-technical users.`,
    scope: '6 new board member agents, 3 new database tables (board-specific), 3 fields added to raid_log, full-page visual workflow builder with React Flow, CrewAI Flows backend integration, 3 board meeting templates',
    strategic_objectives: [
      'Deploy 7-member AI Board of Directors with EVA as Board Chair',
      'Create 6 new board member agents: AI CFO, AI CTO, AI GTM Strategist, AI Legal/Compliance, AI COO, AI CEO agents',
      'Leverage existing RAID log for decision tracking (add 3 fields instead of 4 new tables)',
      'Create Board of Directors department in organizational hierarchy',
      'Implement weighted voting system based on expertise domain',
      'Deploy visual workflow builder with React Flow (3-panel layout: Palette, Canvas, Inspector)',
      'Integrate CrewAI Flows for event-driven orchestration (@start, @listen, @router)',
      'Generate Python workflow code dynamically from visual definitions',
      'Provide 3 board meeting workflow templates (Weekly Meeting, Emergency Session, Investment Approval)',
      'Enable drag-and-drop flow building with state variable tracking'
    ],
    success_criteria: [
      'All 7 board members operational with correct voting weights and expertise domains',
      'Board of Directors crew created (hierarchical type, EVA as manager)',
      'RAID log enhanced with board_meeting_id, voting_record, decision_level fields',
      'Board meetings table tracks all governance sessions with attendance and outcomes',
      'Visual workflow builder accessible at /ai-agents/workflows route',
      'React Flow canvas supports drag-and-drop flow creation with 8+ node types',
      'CrewAI Flows backend executes visual workflows with state management',
      'Python code generation produces valid CrewAI Flows classes from JSON definitions',
      '3 board meeting templates deployable with one click',
      'First board meeting workflow executes successfully end-to-end'
    ],
    metadata: {
      timeline: {
        start_date: null,
        target_completion: null, // 3-4 weeks
        milestones: [
          'Week 1: Database foundation + Board member agents',
          'Week 2-3: Visual workflow builder UI (React Flow integration)',
          'Week 3-4: CrewAI Flows backend + Python code generation',
          'Week 4: Board meeting templates + End-to-end testing'
        ]
      },
      business_impact: 'HIGH - Enables AI-powered board governance and workflow orchestration infrastructure',
      technical_impact: 'MEDIUM - Establishes reusable workflow orchestration system for future complex workflows',
      dependencies: {
        before: [], // No blocking dependencies
        after: [] // Foundation for future governance features
      },
      technical_details: {
        board_members: [
          {
            name: 'AI CFO',
            role: 'Chief Financial Officer',
            goal: 'Oversee financial health, projections, burn rate, and investment decisions',
            voting_weight: 1.5,
            expertise_domains: ['financial', 'budget', 'fundraising'],
            backstory: 'Former Fortune 500 CFO with 20 years venture capital and financial modeling experience'
          },
          {
            name: 'AI CTO',
            role: 'Chief Technology Officer',
            goal: 'Assess technical feasibility, architecture decisions, and technology risk',
            voting_weight: 1.5,
            expertise_domains: ['technical', 'architecture', 'security'],
            backstory: 'Former FAANG principal engineer with expertise in scalable systems and AI/ML'
          },
          {
            name: 'AI GTM Strategist',
            role: 'Go-To-Market Strategy Lead',
            goal: 'Evaluate market opportunity, competitive positioning, and growth strategy',
            voting_weight: 1.5,
            expertise_domains: ['market', 'competitive', 'growth'],
            backstory: 'Former VP Marketing with 15 years scaling startups from $0 to $100M+ ARR'
          },
          {
            name: 'AI Legal/Compliance Officer',
            role: 'Chief Legal and Compliance Officer',
            goal: 'Identify regulatory risks, compliance requirements, and legal implications',
            voting_weight: 1.2,
            expertise_domains: ['legal', 'compliance', 'regulatory'],
            backstory: 'Former General Counsel with expertise in startup law, intellectual property, and regulatory compliance'
          },
          {
            name: 'AI COO',
            role: 'Chief Operating Officer',
            goal: 'Assess operational feasibility, resource requirements, and execution risks',
            voting_weight: 1.3,
            expertise_domains: ['operations', 'execution', 'resources'],
            backstory: 'Former startup COO with experience scaling operations from 10 to 500+ employees'
          },
          {
            name: 'AI CEO Agent',
            role: 'Venture Chief Executive Officer',
            goal: 'Present venture case to board and advocate for approval',
            voting_weight: 1.0,
            expertise_domains: ['venture_specific'], // One per venture
            backstory: 'AI agent assigned to each venture to present case and answer board questions'
          }
        ],
        board_governance: {
          voting_system: 'Weighted voting based on expertise domain',
          quorum_requirement: 'Minimum 60% board participation (5 of 7 members)',
          decision_levels: {
            venture: 'Individual venture approval/rejection',
            portfolio: 'Portfolio-wide strategy and resource allocation',
            board: 'Board governance and policy decisions'
          },
          meeting_types: [
            'Weekly Board Meeting (routine governance)',
            'Emergency Board Session (urgent decisions)',
            'Investment Approval (venture-specific deep dive)'
          ]
        },
        database_schema: {
          new_tables: [
            {
              name: 'board_members',
              purpose: 'Board-specific metadata for agents',
              columns: [
                'id UUID PRIMARY KEY',
                'agent_id UUID REFERENCES crewai_agents(id)',
                'board_role VARCHAR(100)',
                'voting_weight DECIMAL(3,2)',
                'expertise_domains TEXT[]',
                'appointment_date TIMESTAMPTZ',
                'status VARCHAR(20) DEFAULT active'
              ]
            },
            {
              name: 'board_meetings',
              purpose: 'Track board meetings and outcomes',
              columns: [
                'id UUID PRIMARY KEY',
                'meeting_key VARCHAR(50) UNIQUE',
                'meeting_type VARCHAR(50)',
                'agenda TEXT',
                'scheduled_at TIMESTAMPTZ',
                'completed_at TIMESTAMPTZ',
                'outcome JSONB',
                'status VARCHAR(20)'
              ]
            },
            {
              name: 'board_meeting_attendance',
              purpose: 'Track which board members attended meetings',
              columns: [
                'id UUID PRIMARY KEY',
                'meeting_id UUID REFERENCES board_meetings(id)',
                'board_member_id UUID REFERENCES board_members(id)',
                'attended BOOLEAN',
                'vote VARCHAR(20)',
                'notes TEXT'
              ]
            }
          ],
          enhanced_tables: [
            {
              name: 'raid_log',
              new_columns: [
                'board_meeting_id UUID REFERENCES board_meetings(id) -- Link decisions to board meetings',
                'voting_record JSONB -- Store vote tallies and individual votes',
                'decision_level VARCHAR(20) CHECK (decision_level IN (venture, portfolio, board))'
              ],
              rationale: 'Leverage existing RAID log instead of creating separate board_decisions table'
            }
          ],
          workflow_tables: [
            {
              name: 'crewai_flows',
              purpose: 'Store workflow definitions',
              columns: [
                'id UUID PRIMARY KEY',
                'flow_key VARCHAR(100) UNIQUE',
                'flow_name VARCHAR(200)',
                'description TEXT',
                'flow_definition JSONB',
                'python_code TEXT',
                'status VARCHAR(20)',
                'created_by UUID',
                'created_at TIMESTAMPTZ',
                'updated_at TIMESTAMPTZ'
              ]
            },
            {
              name: 'crewai_flow_executions',
              purpose: 'Track workflow execution history',
              columns: [
                'id UUID PRIMARY KEY',
                'flow_id UUID REFERENCES crewai_flows(id)',
                'execution_key VARCHAR(100)',
                'input_state JSONB',
                'output_state JSONB',
                'status VARCHAR(20)',
                'error_message TEXT',
                'started_at TIMESTAMPTZ',
                'completed_at TIMESTAMPTZ'
              ]
            }
          ]
        },
        workflow_builder_ui: {
          architecture: 'Full-page visual workflow builder (no modals)',
          layout: {
            left_panel: 'Steps Palette (8+ node types: Start, Agent Task, Decision, Parallel, Wait, Router, Listener, End)',
            center_panel: 'Visual Canvas (React Flow with drag-and-drop)',
            right_panel: 'Inspector (node configuration, state variables)',
            bottom_panel: 'State Management (view/edit state variables passed between steps)'
          },
          route: '/ai-agents/workflows/:id/builder',
          features: [
            'Drag-and-drop flow building',
            'Visual connections between nodes',
            'State variable tracking (hover to see variables)',
            'Python expression editor for conditions',
            'Real-time validation',
            'Code preview panel (generated Python)',
            'Save/load workflow definitions',
            'Export to CrewAI Flows Python class'
          ],
          node_types: [
            {
              type: 'start',
              decorator: '@start()',
              description: 'Entry point for workflow',
              configuration: ['initial_state_variables']
            },
            {
              type: 'agent_task',
              decorator: '@listen(previous_step)',
              description: 'Execute agent task',
              configuration: ['agent_id', 'task_description', 'tools', 'expected_output']
            },
            {
              type: 'decision',
              decorator: '@router(condition)',
              description: 'Conditional branching',
              configuration: ['condition_expression', 'true_path', 'false_path']
            },
            {
              type: 'parallel',
              description: 'Execute multiple agents in parallel',
              configuration: ['parallel_agent_ids', 'wait_for_all']
            },
            {
              type: 'wait',
              description: 'Wait for all parallel tasks to complete',
              configuration: ['timeout_seconds']
            },
            {
              type: 'listener',
              decorator: '@listen(event)',
              description: 'Event-driven trigger',
              configuration: ['event_name', 'filter_expression']
            },
            {
              type: 'router',
              decorator: '@router(routes)',
              description: 'Multi-way routing',
              configuration: ['routing_logic', 'default_route']
            },
            {
              type: 'end',
              description: 'Workflow completion',
              configuration: ['return_state_variables']
            }
          ]
        },
        crewai_flows_integration: {
          technology: 'CrewAI Flows (production-ready, 12M+ executions/day)',
          decorators: {
            start: '@start() - Entry point with initial state',
            listen: '@listen(event) - React to previous step completion',
            router: '@router(condition) - Conditional routing based on state'
          },
          state_management: 'State variables passed automatically between decorated methods',
          code_generation: {
            input: 'Visual workflow definition (JSON)',
            output: 'Python class with @start, @listen, @router decorators',
            example: `
# Generated from visual workflow
from crewai.flow.flow import Flow, listen, router, start

class BoardWeeklyMeetingFlow(Flow):
    @start()
    def begin_meeting(self):
        return {"meeting_id": "BOARD-2024-001", "agenda_items": []}

    @listen(begin_meeting)
    def cfo_financial_report(self, meeting_state):
        # Execute AI CFO agent task
        return {"financial_report": report, **meeting_state}

    @listen(cfo_financial_report)
    @router(financial_report.status)
    def route_based_on_financials(self, state):
        if state["financial_report"]["burn_rate_acceptable"]:
            return "continue_routine_meeting"
        else:
            return "trigger_emergency_session"
            `
          }
        },
        board_meeting_templates: [
          {
            name: 'Weekly Board Meeting',
            workflow_steps: [
              'Start: Initialize meeting state',
              'Parallel: CFO financial report + CTO technical update + GTM market report',
              'Wait: All parallel reports complete',
              'Sequential: EVA synthesizes reports',
              'Decision: Any red flags? (yes → emergency session, no → routine voting)',
              'Parallel: Board members vote on agenda items',
              'End: Record decisions in RAID log'
            ],
            estimated_duration: '15-20 minutes'
          },
          {
            name: 'Emergency Board Session',
            workflow_steps: [
              'Start: Trigger event (e.g., burn rate critical)',
              'Sequential: Responsible board member (CFO) presents situation',
              'Parallel: All board members analyze implications',
              'Sequential: Debate and discussion (AI agents exchange messages)',
              'Router: Decision type (unanimous required, majority vote, chairman decision)',
              'Parallel: Weighted voting based on decision type',
              'End: Record emergency decision and action items'
            ],
            estimated_duration: '20-30 minutes'
          },
          {
            name: 'Investment Approval',
            workflow_steps: [
              'Start: Venture investment proposal',
              'Sequential: AI CEO agent presents venture case',
              'Parallel: CFO financial analysis + CTO technical assessment + GTM market validation + Legal compliance check',
              'Wait: All analyses complete',
              'Router: Any blockers? (yes → reject, no → proceed to vote)',
              'Sequential: Board discussion (questions to AI CEO)',
              'Parallel: Weighted board vote (expertise-based)',
              'Decision: Vote passes threshold? (yes → approve + RAID log decision, no → reject + feedback)',
              'End: Return decision to chairman'
            ],
            estimated_duration: '25-35 minutes'
          }
        ],
        performance_requirements: {
          workflow_execution_latency: '<500ms to start workflow',
          ui_responsiveness: '<100ms for node drag-and-drop',
          code_generation: '<2s to generate Python from visual workflow',
          board_meeting_duration: '15-35 minutes depending on complexity',
          concurrent_workflows: 'Support 10+ simultaneous workflow executions'
        }
      },
      resource_requirements: [
        'Full-stack developer for workflow builder UI (30 hours)',
        'Backend developer for CrewAI Flows integration (25 hours)',
        'Database engineer for schema migrations (10 hours)',
        'AI/ML engineer for board agent configuration (15 hours)',
        'DevOps for deployment and testing (10 hours)',
        'No additional costs (CrewAI Flows is open source)'
      ],
      performance_targets: {
        board_operational: 'All 7 board members functional within Week 1',
        workflow_builder_mvp: 'Basic workflow builder functional by Week 3',
        first_board_meeting: 'Successful end-to-end board meeting execution by Week 4',
        template_library: '3 board meeting templates ready by Week 4',
        code_generation_accuracy: '>95% generated code executes without errors'
      },
      future_enhancements: {
        post_mvp_roadmap: [
          'SD-BOARD-WORKFLOWS-002: Advanced Board Governance',
          'SD-BOARD-WORKFLOWS-003: Workflow Analytics & Optimization',
          'SD-BOARD-WORKFLOWS-004: Multi-tenant Board Management'
        ],
        potential_features: {
          board_governance_v2: [
            'Board member performance analytics (voting patterns, expertise utilization)',
            'Historical decision analysis and pattern recognition',
            'Board composition optimization based on portfolio needs',
            'Automated compliance reporting and audit trails',
            'Board meeting minutes auto-generation with action items'
          ],
          workflow_builder_v2: [
            'Workflow templates marketplace (community-contributed)',
            'AI-assisted workflow optimization suggestions',
            'Visual debugging and execution tracing',
            'Workflow versioning and rollback',
            'A/B testing for workflow variations',
            'Integration with external systems (Slack, email, webhooks)',
            'Workflow metrics and performance dashboards'
          ],
          board_operations_v2: [
            'Multi-venture portfolio view for board',
            'Resource allocation recommendations across portfolio',
            'Risk dashboard aggregating all venture risks',
            'Automated board reporting (monthly/quarterly summaries)',
            'Board member training and onboarding system',
            'External advisor integration (non-AI board members)'
          ],
          crewai_flows_advanced: [
            'Error recovery and retry strategies in visual builder',
            'Workflow composition (reusable sub-workflows)',
            'Parallel execution optimization with resource limits',
            'State persistence and workflow resume after failures',
            'Real-time workflow monitoring dashboard',
            'Cost/latency optimization for agent execution'
          ]
        },
        technical_improvements: [
          'Workflow execution engine horizontal scaling',
          'Real-time collaboration on workflow editing (multi-user)',
          'Workflow simulation mode (test without executing)',
          'Integration testing framework for workflows',
          'Performance profiling and bottleneck detection',
          'Workflow documentation auto-generation'
        ],
        integration_opportunities: [
          'Integrate board decisions with venture stage transitions',
          'Connect board meetings to RAID log automation',
          'Link board member expertise to agent tool recommendations',
          'Integrate workflow executions with LEO Protocol phases',
          'Connect board governance to investment tracking'
        ],
        lessons_learned_capture: {
          purpose: 'Capture MVP learnings for future iterations',
          mechanisms: [
            'Post-MVP retrospective (stored in retrospectives table)',
            'User feedback on workflow builder UX',
            'Board member effectiveness metrics',
            'Workflow execution performance data',
            'Code generation accuracy tracking'
          ],
          questions_to_answer: [
            'Which board member agents were most valuable?',
            'What workflow patterns emerged as most common?',
            'Where did users struggle with visual workflow builder?',
            'What CrewAI Flows features were underutilized?',
            'What decision patterns appeared in RAID log?'
          ]
        }
      },
      related_sds: ['SD-AGENT-PLATFORM-001', 'SD-VENTURE-IDEATION-MVP-001']
    },
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-BOARD-WORKFLOWS-001')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-BOARD-WORKFLOWS-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('   ID: SD-BOARD-WORKFLOWS-001');
    console.log('   Title: Board of Directors & AI Workflow Orchestration MVP');
    console.log('   Priority: HIGH');
    console.log('   Status: DRAFT');
    console.log('   Timeline: 3-4 weeks (100 hours)');
    console.log('   Impact: AI-powered board governance + workflow orchestration infrastructure');
    console.log('\n🎯 Part 1: Board of Directors Infrastructure');
    console.log('   - 7 board members (EVA as chair + 6 new agents)');
    console.log('   - Weighted voting system based on expertise');
    console.log('   - Leverage existing RAID log for decisions');
    console.log('\n🔄 Part 2: Visual Workflow Builder');
    console.log('   - Full-page workflow builder with React Flow');
    console.log('   - CrewAI Flows integration (@start, @listen, @router)');
    console.log('   - Dynamic Python code generation');
    console.log('   - 3 board meeting templates');
    console.log('\n📊 Success Metrics:');
    console.log('   - First board meeting executes successfully by Week 4');
    console.log('   - >95% code generation accuracy');
    console.log('   - Support 10+ concurrent workflow executions');
    console.log('===================================================================================');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createBoardWorkflowsSD };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createBoardWorkflowsSD();
}
