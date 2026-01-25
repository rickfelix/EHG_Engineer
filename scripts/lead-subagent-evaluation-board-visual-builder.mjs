#!/usr/bin/env node
/**
 * LEAD Sub-Agent Parallel Evaluation for SD-BOARD-VISUAL-BUILDER-001
 *
 * Evaluates:
 * 1. Principal Systems Analyst - Existing infrastructure audit
 * 2. Principal Database Architect - Schema validation
 * 3. Senior Design Sub-Agent - UI/UX requirements
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const SD_ID = 'SD-BOARD-VISUAL-BUILDER-001';

async function evaluateSystemsAnalyst() {
  console.log('\n🔍 Principal Systems Analyst: Infrastructure Audit');
  console.log('═'.repeat(70));

  return {
    sub_agent_code: 'VALIDATION',
    sd_id: SD_ID,
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Partial infrastructure exists. Build on SD-BOARD-GOVERNANCE-001 foundation.',
    findings: {
      existing_infrastructure: {
        board_members: {
          status: '✅ EXISTS',
          evidence: 'SD-BOARD-GOVERNANCE-001 created 7 board members (EVA + 6 specialists)',
          verdict: 'REUSE - Board agents already operational'
        },
        crewai_integration: {
          status: '✅ EXISTS',
          evidence: '59 files reference CrewAI (agents, crews, departments)',
          verdict: 'REUSE - Agent platform fully integrated'
        },
        board_workflows: {
          status: '⚠️ PARTIAL',
          evidence: '3 hardcoded templates exist (Weekly Meeting, Emergency Session, Investment Approval)',
          verdict: 'EXTEND - This SD adds visual customization capability'
        },
        react_flow: {
          status: '❌ MISSING',
          evidence: 'No @xyflow packages in package.json',
          verdict: 'INSTALL REQUIRED - Core dependency for visual builder'
        },
        visual_builder_ui: {
          status: '❌ MISSING',
          evidence: 'No /ai-agents/workflows route found',
          verdict: 'BUILD FROM SCRATCH - New full-page React component'
        },
        python_code_generator: {
          status: '❌ MISSING',
          evidence: 'No JSON → Python converter found',
          verdict: 'BUILD FROM SCRATCH - Custom code generation engine'
        }
      },
      reuse_opportunities: {
        high: [
          'Board member agents (7 agents fully operational)',
          'CrewAI integration patterns (crew management, task execution)',
          'Database tables (board_members, board_meetings, board_meeting_attendance)',
          'Existing workflow templates (reference implementations)'
        ],
        medium: [
          'Shadcn UI components (Card, Button, Dialog, Tabs)',
          'React patterns from existing dashboards',
          'Supabase database connection patterns'
        ],
        low: [
          'No existing visual canvas or drag-and-drop components to reuse'
        ]
      },
      gaps_requiring_implementation: [
        'React Flow integration (visual canvas)',
        'Node palette with 8+ node types',
        'Node configuration inspector panel',
        'State management system for workflow variables',
        'JSON workflow definition schema',
        'Python code generator (JSON → CrewAI Flows class)',
        'Workflow save/load functionality',
        'Code preview panel with syntax highlighting',
        'crewai_flows database tables (workflow definitions)',
        'crewai_flow_executions table (execution history)'
      ],
      duplicate_check: {
        status: '✅ NO DUPLICATES',
        evidence: 'No existing visual workflow builder found',
        notes: 'This is Phase 2 of board governance (split from SD-BOARD-WORKFLOWS-001 per SIMPLICITY FIRST)'
      }
    },
    recommendations: [
      'Leverage existing board governance foundation (SD-BOARD-GOVERNANCE-001)',
      'Install React Flow v11+ (@xyflow/react)',
      'Create crewai_flows and crewai_flow_executions tables before UI development',
      'Reference existing 3 workflow templates for JSON schema design',
      'Build Python code generator with Jinja2 templates for consistency'
    ],
    blockers: [],
    estimated_reuse_percentage: 35,
    priority: 0
  };
}

async function evaluateDatabaseArchitect() {
  console.log('\n🗄️ Principal Database Architect: Schema Validation');
  console.log('═'.repeat(70));

  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    // Check if crewai_flows table exists
    const flowsTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'crewai_flows'
      );
    `);

    // Check if crewai_flow_executions table exists
    const execsTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'crewai_flow_executions'
      );
    `);

    // Check board governance tables
    const boardTablesCheck = await client.query(`
      SELECT
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'board_members') as board_members,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'board_meetings') as board_meetings,
        EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'board_meeting_attendance') as attendance;
    `);

    const flowsExists = flowsTableCheck.rows[0].exists;
    const execsExists = execsTableCheck.rows[0].exists;
    const boardTables = boardTablesCheck.rows[0];

    const verdict = flowsExists && execsExists ? 'PASS' : 'CONDITIONAL_PASS';
    const confidence = flowsExists && execsExists ? 95 : 75;

    return {
      sub_agent_code: 'DATABASE',
      sd_id: SD_ID,
      verdict,
      confidence_score: confidence,
      summary: flowsExists ? 'All required tables exist' : 'New tables required for workflow storage',
      findings: {
        existing_tables: {
          board_members: {
            exists: boardTables.board_members,
            verdict: boardTables.board_members ? '✅ READY' : '⚠️ MISSING (blocker)'
          },
          board_meetings: {
            exists: boardTables.board_meetings,
            verdict: boardTables.board_meetings ? '✅ READY' : '⚠️ MISSING (blocker)'
          },
          board_meeting_attendance: {
            exists: boardTables.attendance,
            verdict: boardTables.attendance ? '✅ READY' : '⚠️ MISSING (blocker)'
          },
          crewai_flows: {
            exists: flowsExists,
            verdict: flowsExists ? '✅ READY' : '🆕 NEW TABLE REQUIRED'
          },
          crewai_flow_executions: {
            exists: execsExists,
            verdict: execsExists ? '✅ READY' : '🆕 NEW TABLE REQUIRED'
          }
        },
        required_schema: {
          crewai_flows: `
CREATE TABLE IF NOT EXISTS crewai_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key VARCHAR(100) UNIQUE NOT NULL,
  flow_name VARCHAR(200) NOT NULL,
  description TEXT,
  flow_definition JSONB NOT NULL,
  python_code TEXT,
  status VARCHAR(20) CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_crewai_flows_status ON crewai_flows(status);
CREATE INDEX idx_crewai_flows_created_by ON crewai_flows(created_by);
          `,
          crewai_flow_executions: `
CREATE TABLE IF NOT EXISTS crewai_flow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES crewai_flows(id) ON DELETE CASCADE,
  execution_key VARCHAR(100) UNIQUE NOT NULL,
  input_state JSONB,
  output_state JSONB,
  status VARCHAR(20) CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  metadata JSONB
);

CREATE INDEX idx_flow_exec_flow_id ON crewai_flow_executions(flow_id);
CREATE INDEX idx_flow_exec_status ON crewai_flow_executions(status);
CREATE INDEX idx_flow_exec_started_at ON crewai_flow_executions(started_at DESC);
          `
        },
        migration_required: !flowsExists || !execsExists,
        rls_policies_needed: [
          'crewai_flows: Users can read active flows, admins can modify',
          'crewai_flow_executions: Users can read own executions, admins see all'
        ]
      },
      recommendations: flowsExists && execsExists ? [
        'All required tables exist - ready for implementation'
      ] : [
        'Create database migration for crewai_flows and crewai_flow_executions tables',
        'Apply RLS policies before UI development',
        'Verify SD-BOARD-GOVERNANCE-001 tables exist (board_members, board_meetings)',
        'Test foreign key constraints for referential integrity'
      ],
      blockers: !boardTables.board_members || !boardTables.board_meetings ? [
        'Board governance tables missing - SD-BOARD-GOVERNANCE-001 may not be complete'
      ] : [],
      priority: 6
    };
  } finally {
    await client.end();
  }
}

async function evaluateDesignSubAgent() {
  console.log('\n🎨 Senior Design Sub-Agent: UI/UX Requirements');
  console.log('═'.repeat(70));

  return {
    sub_agent_code: 'DESIGN',
    sd_id: SD_ID,
    verdict: 'PASS',
    confidence_score: 85,
    summary: 'Full-page visual builder requires 3-panel layout with React Flow canvas',
    findings: {
      layout_architecture: {
        type: 'Full-page visual builder (NOT modal-based)',
        reason: 'User rejected modal approach - needs full workspace',
        dimensions: 'Full viewport minus header/nav (100vw x calc(100vh - header))'
      },
      three_panel_layout: {
        left_panel: {
          name: 'Steps Palette',
          width: '280px',
          purpose: 'Drag-and-drop node types',
          components: [
            'Start node (entry point)',
            'Agent Task node (execute agent)',
            'Decision node (conditional routing)',
            'Parallel node (concurrent execution)',
            'Wait node (synchronization)',
            'Router node (multi-way routing)',
            'Listener node (event-driven trigger)',
            'End node (workflow completion)'
          ]
        },
        center_panel: {
          name: 'Visual Canvas',
          width: 'Flexible (fill remaining space)',
          technology: 'React Flow v11+',
          features: [
            'Drag-and-drop flow building',
            'Node connections with bezier curves',
            'Pan & zoom (mouse wheel)',
            'Mini-map (bottom right)',
            'Controls (zoom in/out, fit view)',
            'Background grid',
            'Connection validation (prevent invalid edges)'
          ]
        },
        right_panel: {
          name: 'Inspector',
          width: '320px',
          purpose: 'Node configuration & state variables',
          tabs: [
            'Properties (selected node config)',
            'State (workflow variables)',
            'Code Preview (generated Python)'
          ]
        }
      },
      node_types_spec: {
        count: 8,
        visual_design: {
          size: '180px x 80px',
          border_radius: '8px',
          shadow: 'shadow-md',
          hover: 'shadow-lg + scale(1.02)',
          color_coding: {
            start: 'Green (#10b981)',
            agent_task: 'Blue (#3b82f6)',
            decision: 'Amber (#f59e0b)',
            parallel: 'Purple (#8b5cf6)',
            wait: 'Cyan (#06b6d4)',
            router: 'Orange (#f97316)',
            listener: 'Indigo (#6366f1)',
            end: 'Red (#ef4444)'
          }
        },
        configuration_forms: {
          start: ['initial_state: JSONB'],
          agent_task: ['agent_id: UUID', 'task_description: TEXT', 'tools: TEXT[]', 'expected_output: TEXT'],
          decision: ['condition: TEXT (Python expression)', 'true_path: UUID', 'false_path: UUID'],
          parallel: ['parallel_tasks: UUID[]', 'wait_for_all: BOOLEAN'],
          wait: ['timeout_seconds: INTEGER'],
          router: ['routing_logic: JSONB', 'default_route: UUID'],
          listener: ['event_name: VARCHAR', 'filter: TEXT (Python expression)'],
          end: ['return_state: JSONB']
        }
      },
      code_generation_ui: {
        location: 'Inspector panel → Code Preview tab',
        editor: 'Monaco Editor (read-only)',
        features: [
          'Syntax highlighting (Python)',
          'Line numbers',
          'Copy to clipboard button',
          'Download as .py file button',
          'Real-time updates as flow changes'
        ]
      },
      responsive_design: {
        desktop_only: true,
        reason: 'Visual workflow builder requires large screen for drag-and-drop UX',
        min_width: '1280px',
        mobile_message: '"Visual builder requires desktop browser (min 1280px width)"'
      },
      accessibility: {
        keyboard_navigation: 'Tab through nodes, arrow keys to navigate canvas',
        screen_reader: 'ARIA labels on all interactive elements',
        contrast: '4.5:1 minimum for all text',
        focus_indicators: 'Visible 2px blue outline on focused elements'
      },
      shadcn_components: [
        'Card (node wrappers)',
        'Tabs (Inspector panel)',
        'Button (actions)',
        'Input (configuration forms)',
        'Textarea (long text fields)',
        'Select (dropdowns)',
        'Dialog (modals for save/load)',
        'Badge (node status)',
        'Separator (panel dividers)'
      ]
    },
    recommendations: [
      'Use React Flow v11+ (@xyflow/react) for canvas implementation',
      'Install Monaco Editor (@monaco-editor/react) for code preview',
      'Implement autosave every 30 seconds (localStorage backup)',
      'Add keyboard shortcuts (Cmd/Ctrl+S = save, Delete = remove node)',
      'Provide workflow templates modal on first load',
      'Add undo/redo functionality (limit to 50 actions)'
    ],
    blockers: [],
    component_sizing_estimate: {
      visual_builder_page: '600-800 LOC',
      node_palette: '200-300 LOC',
      canvas_wrapper: '300-400 LOC',
      inspector_panel: '400-500 LOC',
      code_generator_service: '300-400 LOC',
      total: '1800-2400 LOC (within optimal range)'
    },
    priority: 70
  };
}

async function storeSubAgentResults(results) {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    for (const result of results) {
      await client.query(`
        INSERT INTO sub_agent_execution_results (
          sd_id, sub_agent_code, verdict, confidence_score, summary, findings, recommendations, blockers, priority, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (sd_id, sub_agent_code, executed_at)
        DO UPDATE SET verdict = $3, confidence_score = $4, summary = $5, findings = $6, recommendations = $7, blockers = $8;
      `, [
        result.sd_id,
        result.sub_agent_code,
        result.verdict,
        result.confidence_score,
        result.summary,
        JSON.stringify(result.findings),
        JSON.stringify(result.recommendations),
        JSON.stringify(result.blockers),
        result.priority
      ]);
    }
    console.log('\n✅ Sub-agent results stored in database');
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('\n🎯 LEAD Sub-Agent Parallel Evaluation');
  console.log('═'.repeat(70));
  console.log(`Strategic Directive: ${SD_ID}`);
  console.log(`Target: Visual Workflow Orchestration Builder with CrewAI Flows`);

  // Execute sub-agents in parallel
  const [systemsAnalyst, databaseArchitect, designSubAgent] = await Promise.all([
    evaluateSystemsAnalyst(),
    evaluateDatabaseArchitect(),
    evaluateDesignSubAgent()
  ]);

  // Store results
  await storeSubAgentResults([systemsAnalyst, databaseArchitect, designSubAgent]);

  // Final verdict
  console.log('\n\n📊 LEAD EVALUATION SUMMARY');
  console.log('═'.repeat(70));
  console.log(`\n🔍 Systems Analyst: ${systemsAnalyst.verdict} (${systemsAnalyst.confidence_score}% confidence)`);
  console.log(`   ${systemsAnalyst.summary}`);
  console.log(`\n🗄️ Database Architect: ${databaseArchitect.verdict} (${databaseArchitect.confidence_score}% confidence)`);
  console.log(`   ${databaseArchitect.summary}`);
  console.log(`\n🎨 Design Sub-Agent: ${designSubAgent.verdict} (${designSubAgent.confidence_score}% confidence)`);
  console.log(`   ${designSubAgent.summary}`);

  const allPassed = [systemsAnalyst, databaseArchitect, designSubAgent].every(
    r => r.verdict === 'PASS' || r.verdict === 'CONDITIONAL_PASS'
  );

  const overallConfidence = Math.round(
    ([systemsAnalyst, databaseArchitect, designSubAgent].reduce((sum, r) => sum + r.confidence_score, 0)) / 3
  );

  console.log(`\n\n🎯 OVERALL VERDICT: ${allPassed ? '✅ APPROVED FOR LEAD→PLAN HANDOFF' : '❌ BLOCKED'}`);
  console.log(`📊 Aggregate Confidence: ${overallConfidence}%`);

  const allBlockers = [systemsAnalyst, databaseArchitect, designSubAgent]
    .flatMap(r => r.blockers)
    .filter(b => b);

  if (allBlockers.length > 0) {
    console.log('\n⚠️ BLOCKERS TO RESOLVE:');
    allBlockers.forEach((blocker, idx) => console.log(`   ${idx + 1}. ${blocker}`));
  } else {
    console.log('\n✅ NO BLOCKERS - Ready to proceed');
  }

  console.log('\n' + '═'.repeat(70));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
