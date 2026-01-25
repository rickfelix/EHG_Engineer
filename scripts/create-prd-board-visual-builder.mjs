#!/usr/bin/env node
/**
 * Create PRD for SD-BOARD-VISUAL-BUILDER-001
 * Comprehensive Product Requirements Document
 * PLAN Phase: Technical Architecture & Testing Strategy
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const SD_KEY = 'SD-BOARD-VISUAL-BUILDER-001';

async function createPRD() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log('\n📋 Creating PRD for SD-BOARD-VISUAL-BUILDER-001');
    console.log('═'.repeat(70));

    // Get SD UUID
    const sdResult = await client.query(`
      SELECT uuid_id, sd_key FROM strategic_directives_v2 WHERE sd_key = $1;
    `, [SD_KEY]);

    if (sdResult.rows.length === 0) {
      throw new Error(`SD ${SD_KEY} not found`);
    }

    const sd_uuid = sdResult.rows[0].uuid_id;
    console.log(`   SD UUID: ${sd_uuid}`);

    const prd = {
      id: `PRD-${SD_KEY}`,
      sd_id: SD_KEY,
      sd_uuid: sd_uuid,
      directive_id: SD_KEY,
      title: 'Visual Workflow Builder with React Flow & CrewAI Flows Integration',
      version: '1.0.0',
      status: 'draft',
      category: 'board_governance',
      priority: 'critical',

      // Executive Summary
      executive_summary: `Full-page visual workflow builder powered by React Flow for drag-and-drop flow design with CrewAI Flows backend integration.

**Purpose**: Enable non-technical users to create custom AI agent workflows beyond the 3 hardcoded templates from SD-BOARD-GOVERNANCE-001 (Phase 1).

**Strategic Context**: Phase 2 of board governance infrastructure. Builds on established board member system. Enables customization without coding.

**User Value**: Product managers and business users can design board meeting workflows, investment approval processes, and decision-making flows visually, then execute them with real AI agents.

**Technical Approach**: Industry-standard React Flow library for visual canvas, CrewAI Flows Python decorators for backend execution, Monaco Editor for code preview/validation.`,

      // Problem Statement
      problem_statement: `**Current State**: SD-BOARD-GOVERNANCE-001 delivered 3 hardcoded workflow templates (Weekly Board Meeting, Emergency Session, Investment Approval). Users cannot customize workflows or create new ones without developer intervention.

**Problem**: Limited to 3 pre-built workflows. Cannot adapt to new meeting types, decision processes, or business scenarios without code changes.

**Impact**: Reduced flexibility, slower response to business needs, developer dependency for workflow changes.

**Desired State**: Non-technical users can visually design custom workflows using drag-and-drop interface, generate Python code automatically, save/load workflows from database, and execute with board AI agents.`,

      // Proposed Solution
      proposed_solution: `Full-page visual workflow builder with 3-panel layout:

**1. Node Palette (Left Panel, ~200-300 LOC)**:
- Drag-and-drop node types: Start, Agent Task, Decision, Parallel, Wait, Router, Listener, End
- Search/filter nodes
- Node type descriptions
- Icon library integration

**2. Flow Canvas (Center Panel, ~300-400 LOC)**:
- React Flow canvas for visual design
- Node positioning and connections
- Zoom/pan controls
- Minimap overview
- Validation indicators (red borders for errors)

**3. Inspector Panel (Right Panel, ~400-500 LOC)**:
- Selected node properties editor
- Agent assignment dropdown
- Task configuration forms
- Condition builder for decision nodes
- Code preview tab (Monaco Editor)

**4. Workflow State Manager (~200-300 LOC)**:
- Centralized state for nodes, edges, selected node
- Validation logic
- Change history (undo/redo)

**5. Python Code Generator (~300-400 LOC)**:
- JSON workflow → CrewAI Flows Python classes
- @start, @listen, @router decorators
- Agent task assignments
- Decision logic translation

**6. Workflow Save/Load (~200-300 LOC)**:
- Database operations (crewai_flows table)
- Template instantiation
- Version management

**Total Estimated Size**: 1800-2400 LOC (within optimal range)`,

      // Technical Architecture
      technical_architecture: {
        frontend: {
          framework: 'React 18.2 + Vite',
          routing: 'React Router v6 - Route: /board-visual-builder',
          state_management: 'React useState/useReducer for workflow state',
          ui_library: 'Tailwind CSS + Lucide React icons',
          key_libraries: [
            '@xyflow/react v11.11.0 - Visual flow canvas',
            '@monaco-editor/react v4.6.0 - Code editor for preview',
            'react-router-dom v6.20.0 - Navigation'
          ],
          layout: '3-panel split: Palette (20% width) | Canvas (55% width) | Inspector (25% width)',
          responsive: 'Minimum screen width: 1280px (desktop-only initially)'
        },
        backend: {
          database: 'PostgreSQL via Supabase (dedlbzhpgkmetvhbkyzq)',
          tables: [
            'crewai_flows - Workflow definitions (JSON + Python code)',
            'crewai_flow_executions - Execution history',
            'crewai_flow_templates - Pre-built templates',
            'board_members - Board agent references (prerequisite)',
            'board_meetings - Workflow execution linkage (prerequisite)'
          ],
          rls_policies: 'User can CRUD own workflows, read public templates',
          python_backend: 'CrewAI Flows decorators: @start, @listen, @router'
        },
        data_flow: [
          '1. User drags nodes onto canvas → React Flow state update',
          '2. User configures node properties → Inspector panel forms',
          '3. User saves workflow → PythonCodeGenerator converts JSON to Python',
          '4. Python code stored in crewai_flows.python_code column',
          '5. User executes workflow → Python code runs via CrewAI Flows',
          '6. Execution tracked in crewai_flow_executions table'
        ],
        integration_points: [
          'Board Members table (agent_id references)',
          'Board Meetings table (workflow_id linkage)',
          'CrewAI Flows Python runtime (external execution environment)'
        ]
      },

      // Component Specifications
      component_specifications: [
        {
          name: 'VisualWorkflowBuilder',
          path: 'src/client/src/pages/VisualWorkflowBuilder.jsx',
          estimated_loc: 600,
          purpose: 'Main page component orchestrating 3-panel layout',
          responsibilities: [
            'Initialize React Flow canvas',
            'Manage workflow state (nodes, edges, selectedNode)',
            'Handle save/load operations',
            'Coordinate panel communication',
            'Display notifications/errors'
          ],
          props: 'None (route component)',
          state: {
            nodes: 'ReactFlow.Node[] - Canvas nodes',
            edges: 'ReactFlow.Edge[] - Node connections',
            selectedNode: 'ReactFlow.Node | null - Currently selected',
            workflowMetadata: '{name, description, status}'
          }
        },
        {
          name: 'NodePalette',
          path: 'src/client/src/components/workflow-builder/NodePalette.jsx',
          estimated_loc: 250,
          purpose: 'Left panel with draggable node types',
          responsibilities: [
            'Display 8+ node types with icons',
            'Handle drag start events',
            'Search/filter node types',
            'Show node type descriptions on hover'
          ],
          props: {
            onNodeDragStart: '(nodeType: string) => void'
          }
        },
        {
          name: 'FlowCanvas',
          path: 'src/client/src/components/workflow-builder/FlowCanvas.jsx',
          estimated_loc: 350,
          purpose: 'Center panel React Flow canvas',
          responsibilities: [
            'Render nodes and edges',
            'Handle node/edge interactions',
            'Validate connections',
            'Display minimap and controls'
          ],
          props: {
            nodes: 'ReactFlow.Node[]',
            edges: 'ReactFlow.Edge[]',
            onNodesChange: '(changes) => void',
            onEdgesChange: '(changes) => void',
            onNodeClick: '(node) => void'
          }
        },
        {
          name: 'InspectorPanel',
          path: 'src/client/src/components/workflow-builder/InspectorPanel.jsx',
          estimated_loc: 450,
          purpose: 'Right panel for node property editing',
          responsibilities: [
            'Display selected node properties',
            'Render type-specific forms (Agent Task, Decision, etc.)',
            'Agent assignment dropdown (from board_members)',
            'Code preview tab (Monaco Editor)',
            'Save property changes'
          ],
          props: {
            selectedNode: 'ReactFlow.Node | null',
            onPropertyChange: '(nodeId, property, value) => void',
            boardMembers: 'BoardMember[]'
          }
        },
        {
          name: 'CodePreviewTab',
          path: 'src/client/src/components/workflow-builder/CodePreviewTab.jsx',
          estimated_loc: 200,
          purpose: 'Monaco Editor integration for Python preview',
          responsibilities: [
            'Display generated Python code',
            'Syntax highlighting (Python)',
            'Read-only editor (no manual editing)',
            'Copy to clipboard button'
          ],
          props: {
            pythonCode: 'string',
            workflowName: 'string'
          }
        },
        {
          name: 'WorkflowStateManager',
          path: 'src/client/src/hooks/useWorkflowState.js',
          estimated_loc: 280,
          purpose: 'Centralized workflow state management (custom hook)',
          responsibilities: [
            'Manage nodes/edges state',
            'Validation logic (e.g., "Start node required")',
            'Change history for undo/redo',
            'Dirty state tracking'
          ],
          returns: {
            nodes: 'ReactFlow.Node[]',
            edges: 'ReactFlow.Edge[]',
            validation: '{isValid, errors: string[]}',
            addNode: '(node) => void',
            updateNode: '(nodeId, updates) => void',
            deleteNode: '(nodeId) => void',
            undo: '() => void',
            redo: '() => void'
          }
        },
        {
          name: 'PythonCodeGenerator',
          path: 'src/client/src/utils/pythonCodeGenerator.js',
          estimated_loc: 350,
          purpose: 'Convert JSON workflow to CrewAI Flows Python code',
          responsibilities: [
            'Generate Flow class with @start decorator',
            'Add @listen methods for each node',
            'Generate @router for decision nodes',
            'Handle parallel execution nodes',
            'Include agent task assignments',
            'Add error handling and logging'
          ],
          input: '{nodes: ReactFlow.Node[], edges: ReactFlow.Edge[], metadata: WorkflowMetadata}',
          output: 'string (Python code)',
          example_output: `
class WeeklyBoardMeetingFlow(Flow):
    @start()
    def start_meeting(self):
        return {"status": "started"}

    @listen(start_meeting)
    def parallel_reports(self):
        return [
            {"agent": "CFO", "task": "financial_report"},
            {"agent": "CTO", "task": "tech_report"}
        ]

    @router(parallel_reports)
    def check_red_flags(self, reports):
        if any(r.get("red_flag") for r in reports):
            return "escalate"
        return "proceed"
          `
        },
        {
          name: 'WorkflowSaveLoad',
          path: 'src/client/src/services/workflowService.js',
          estimated_loc: 280,
          purpose: 'Database operations for workflows',
          responsibilities: [
            'Save workflow to crewai_flows table',
            'Load workflow by ID or key',
            'List user workflows',
            'Instantiate template',
            'Delete workflow',
            'Publish workflow (draft → active)'
          ],
          methods: {
            saveWorkflow: 'async (workflow) => {id, flow_key}',
            loadWorkflow: 'async (flow_id) => Workflow',
            listWorkflows: 'async (filters) => Workflow[]',
            instantiateTemplate: 'async (template_key, params) => Workflow',
            deleteWorkflow: 'async (flow_id) => boolean',
            publishWorkflow: 'async (flow_id) => boolean'
          }
        }
      ],

      // Node Types Specification
      node_types: [
        {
          type: 'start',
          label: 'Start',
          icon: 'PlayCircle',
          description: 'Entry point for workflow. Required. Only one per workflow.',
          properties: {
            label: 'string - Node display name',
            initial_state: 'object - Starting state variables'
          },
          validation: 'Must have exactly 1 Start node. Must be first in execution order.'
        },
        {
          type: 'agent_task',
          label: 'Agent Task',
          icon: 'User',
          description: 'Assigns task to a board member agent',
          properties: {
            label: 'string',
            agent_id: 'UUID - Reference to board_members.id',
            task_type: 'string - report, analysis, recommendation, vote',
            task_description: 'string - Instructions for agent',
            timeout_seconds: 'number - Max execution time (default: 300)'
          },
          validation: 'Must have agent_id selected. Must have task_description.'
        },
        {
          type: 'decision',
          label: 'Decision',
          icon: 'GitBranch',
          description: 'Conditional branching based on state evaluation',
          properties: {
            label: 'string',
            condition: 'string - JavaScript expression (e.g., "state.red_flags > 0")',
            true_label: 'string - Label for true branch (default: "yes")',
            false_label: 'string - Label for false branch (default: "no")'
          },
          validation: 'Must have 2 outgoing edges (true/false branches). Condition must be valid JS.'
        },
        {
          type: 'parallel',
          label: 'Parallel',
          icon: 'Layers',
          description: 'Execute multiple tasks concurrently',
          properties: {
            label: 'string',
            tasks: 'string[] - Array of task identifiers',
            wait_for_all: 'boolean - Wait for all tasks or first completion (default: true)'
          },
          validation: 'Must have 2+ outgoing edges for parallel tasks.'
        },
        {
          type: 'wait',
          label: 'Wait',
          icon: 'Clock',
          description: 'Wait for all incoming edges before proceeding',
          properties: {
            label: 'string',
            timeout_seconds: 'number - Max wait time (optional)'
          },
          validation: 'Must have 2+ incoming edges.'
        },
        {
          type: 'router',
          label: 'Router',
          icon: 'Route',
          description: 'Multi-way routing based on state evaluation',
          properties: {
            label: 'string',
            routes: 'Array<{condition: string, label: string}> - Multiple conditions',
            default_route: 'string - Fallback route label'
          },
          validation: 'Must have N+1 outgoing edges (N routes + 1 default).'
        },
        {
          type: 'listener',
          label: 'Listener',
          icon: 'Ear',
          description: 'Listen to output from another node (CrewAI @listen decorator)',
          properties: {
            label: 'string',
            listen_to: 'string - Node ID to listen to',
            transform: 'string - Optional transformation logic'
          },
          validation: 'Must have listen_to node selected.'
        },
        {
          type: 'end',
          label: 'End',
          icon: 'CheckCircle',
          description: 'Terminal node. Marks workflow completion.',
          properties: {
            label: 'string',
            outcome: 'string - success, failure, cancelled',
            final_state: 'object - State to return'
          },
          validation: 'Must have no outgoing edges. Should have at least 1 End node.'
        }
      ],

      // User Stories
      user_stories: [
        'As a product manager, I want to drag Start/End nodes onto the canvas so I can define workflow boundaries',
        'As a product manager, I want to drag Agent Task nodes and assign board members so I can delegate tasks',
        'As a product manager, I want to drag Decision nodes and configure conditions so I can create branching logic',
        'As a product manager, I want to connect nodes with edges so I can define execution flow',
        'As a product manager, I want to see validation errors highlighted on the canvas so I can fix issues before saving',
        'As a product manager, I want to save my workflow to the database so I can reuse it later',
        'As a product manager, I want to load a saved workflow from the database so I can continue editing',
        'As a product manager, I want to preview the generated Python code so I can understand the implementation',
        'As a product manager, I want to instantiate a template workflow so I can start from proven patterns',
        'As a product manager, I want to publish my workflow (draft → active) so others can use it',
        'As a product manager, I want to delete draft workflows so I can clean up my workspace',
        'As a product manager, I want to search/filter node types in the palette so I can find nodes quickly'
      ],

      // Acceptance Criteria
      acceptance_criteria: [
        'User can access /board-visual-builder route and see 3-panel layout',
        'User can drag 8+ node types from palette onto canvas',
        'User can connect nodes with edges (click source handle, click target handle)',
        'User can select a node and edit properties in Inspector panel',
        'User can assign board members to Agent Task nodes via dropdown',
        'User can configure decision conditions and see branching edges',
        'User can save workflow to database (status: draft)',
        'User can load workflow from database and see nodes/edges restored',
        'User can preview generated Python code in Code Preview tab',
        'User can instantiate template workflow (3 templates available)',
        'User can publish workflow (draft → active) after validation passes',
        'User sees validation errors (e.g., "No Start node") highlighted on canvas',
        'User can undo/redo changes (5-step history)',
        'User can zoom/pan canvas with mouse wheel and drag',
        'User can see minimap overview in bottom-right corner'
      ],

      // Testing Strategy
      testing_strategy: {
        unit_tests: {
          framework: 'Vitest',
          coverage_target: '80%',
          focus_areas: [
            'PythonCodeGenerator: JSON → Python conversion accuracy (>95%)',
            'WorkflowStateManager: Validation logic (8+ node types)',
            'WorkflowSaveLoad: Database CRUD operations',
            'Node type validations (Start node required, Decision 2 branches, etc.)'
          ]
        },
        e2e_tests: {
          framework: 'Playwright',
          coverage_requirement: '100% user story coverage (12 user stories = 12+ tests)',
          test_scenarios: [
            'Create workflow from scratch (drag nodes, connect, save)',
            'Load existing workflow and verify nodes/edges restored',
            'Instantiate template workflow (Weekly Board Meeting)',
            'Configure Agent Task node with board member assignment',
            'Configure Decision node with JavaScript condition',
            'Validate workflow with errors (missing Start node)',
            'Validate workflow success (complete workflow)',
            'Preview Python code and verify format',
            'Publish workflow (draft → active)',
            'Delete draft workflow',
            'Undo/redo node changes',
            'Search node palette and drag filtered result'
          ]
        },
        manual_testing: {
          required: true,
          scenarios: [
            'Visual regression: Verify 3-panel layout on 1920x1080 screen',
            'Verify Monaco Editor syntax highlighting (Python)',
            'Verify React Flow minimap rendering',
            'Verify drag-and-drop smoothness (no lag)',
            'Verify zoom/pan controls responsiveness'
          ]
        }
      },

      // Success Metrics
      success_metrics: {
        adoption: [
          'At least 2 custom workflows created by users within first week',
          'At least 5 workflow executions within first 2 weeks'
        ],
        usability: [
          'Average workflow creation time <15 minutes (template instantiation <5 min)',
          'Workflow validation pass rate >85% (users catch errors before saving)'
        ],
        technical: [
          'Python code generation accuracy >95% (manual verification of 10 workflows)',
          'E2E test coverage 100% (all user stories have ≥1 test)',
          'Page load time <2 seconds (React Flow initialization)',
          'No console errors on workflow save/load'
        ]
      },

      // Dependencies and Prerequisites
      dependencies: {
        npm_packages: [
          '@xyflow/react v11.11.0 - INSTALLED (src/client/package.json)',
          '@monaco-editor/react v4.6.0 - INSTALLED (src/client/package.json)'
        ],
        database_tables: [
          'board_members - BLOCKER: Table does not exist (prerequisite from SD-BOARD-GOVERNANCE-001)',
          'board_meetings - BLOCKER: Table does not exist (prerequisite from SD-BOARD-GOVERNANCE-001)',
          'board_meeting_attendance - BLOCKER: Table does not exist (prerequisite from SD-BOARD-GOVERNANCE-001)',
          'crewai_flows - ✅ Migration created: database/migrations/20251011_crewai_flows_tables.sql',
          'crewai_flow_executions - ✅ Migration created (same file)',
          'crewai_flow_templates - ✅ Migration created (same file, includes 3 seed templates)'
        ],
        prerequisite_sds: [
          'SD-BOARD-GOVERNANCE-001 - Status: completed (80%), CRITICAL ISSUE: Tables missing despite completion status'
        ]
      },

      // Risks and Mitigation
      risks: [
        {
          risk: 'Board infrastructure tables missing',
          severity: 'CRITICAL',
          likelihood: 'HIGH',
          impact: 'Cannot execute workflows without board_members table',
          mitigation: 'PLAN phase created migration file (database/migrations/20251011_board_infrastructure_tables.sql). EXEC phase MUST apply via Supabase CLI before implementation begins.'
        },
        {
          risk: 'React Flow learning curve',
          severity: 'MEDIUM',
          likelihood: 'MEDIUM',
          impact: 'Slightly longer implementation time (1-2 days)',
          mitigation: 'Extensive documentation available. Senior Design Sub-Agent provided UI/UX specs. React Flow has 12M+ npm downloads/week (well-supported).'
        },
        {
          risk: 'Python code generation accuracy',
          severity: 'MEDIUM',
          likelihood: 'LOW',
          impact: 'Generated code may need manual fixes',
          mitigation: 'Target >95% accuracy. Code preview panel allows user verification before execution. Unit tests for code generator (80%+ coverage).'
        },
        {
          risk: 'Performance with large workflows',
          severity: 'LOW',
          likelihood: 'LOW',
          impact: 'Canvas lag with 50+ nodes',
          mitigation: 'React Flow handles 100+ nodes efficiently. Optimize rendering with React.memo. Defer if not encountered in Phase 1.'
        }
      ],

      // Out of Scope (Deferred to Future Phases)
      out_of_scope: [
        'Workflow analytics dashboard (Future: SD-BOARD-WORKFLOWS-002)',
        'A/B testing for workflow variations (Future: SD-BOARD-WORKFLOWS-003)',
        'Workflow template marketplace (Future: SD-BOARD-WORKFLOWS-004)',
        'Multi-user real-time collaboration (Future enhancement)',
        'Workflow simulation mode (dry-run without execution) (Future enhancement)',
        'Mobile responsiveness (desktop-only for Phase 1)',
        'Workflow versioning and rollback (Future enhancement)',
        'Custom node type creation by users (Future enhancement)'
      ],

      // Open Questions
      open_questions: [
        'Should workflow execution happen synchronously (block UI) or asynchronously (background + notification)?',
        'Should users be able to manually edit generated Python code, or keep it read-only?',
        'What permission model for workflow sharing? (private, team, public)',
        'Should we include workflow templates beyond the 3 seed templates in Phase 1?'
      ],

      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Map PRD fields to schema
    const technicalRequirements = {
      component_specifications: prd.component_specifications,
      node_types: prd.node_types,
      user_stories: prd.user_stories
    };

    const functionalRequirements = {
      three_panel_layout: prd.technical_architecture.frontend.layout,
      node_palette: 'Draggable node types: Start, Agent Task, Decision, Parallel, Wait, Router, Listener, End',
      flow_canvas: 'React Flow visual canvas with zoom/pan/minimap',
      inspector_panel: 'Node property editor with agent assignment',
      code_preview: 'Monaco Editor for generated Python code'
    };

    // Insert PRD
    await client.query(`
      INSERT INTO product_requirements_v2 (
        id, sd_id, sd_uuid, directive_id, title, version, status, category, priority,
        executive_summary, business_context, technical_context,
        functional_requirements, technical_requirements,
        system_architecture, technology_stack, dependencies,
        test_scenarios, acceptance_criteria,
        risks, constraints,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `, [
      prd.id,
      prd.sd_id,
      prd.sd_uuid,
      prd.directive_id,
      prd.title,
      prd.version,
      prd.status,
      prd.category,
      prd.priority,
      prd.executive_summary,
      prd.problem_statement, // business_context
      prd.proposed_solution, // technical_context
      JSON.stringify(functionalRequirements),
      JSON.stringify(technicalRequirements),
      JSON.stringify(prd.technical_architecture), // system_architecture as JSON
      JSON.stringify(prd.technical_architecture.frontend.key_libraries), // technology_stack
      JSON.stringify(prd.dependencies),
      JSON.stringify(prd.testing_strategy), // test_scenarios
      JSON.stringify(prd.acceptance_criteria),
      JSON.stringify(prd.risks),
      JSON.stringify({ out_of_scope: prd.out_of_scope, open_questions: prd.open_questions }),
      prd.created_at,
      prd.updated_at
    ]);

    // Update SD progress
    await client.query(`
      UPDATE strategic_directives_v2
      SET progress_percentage = 35,
          updated_at = NOW()
      WHERE sd_key = $1;
    `, [SD_KEY]);

    console.log('\n✅ PRD Created Successfully!');
    console.log('\n📊 Summary:');
    console.log('   Version: 1.0.0');
    console.log('   Status: draft');
    console.log('   Components: 8 (1800-2400 LOC total)');
    console.log('   Node Types: 8+ (Start, Agent Task, Decision, etc.)');
    console.log('   User Stories: 12');
    console.log('   E2E Tests Required: 12+ (100% coverage)');
    console.log('   Dependencies: @xyflow/react, @monaco-editor/react (INSTALLED)');
    console.log('   Critical Blocker: Board infrastructure tables (migration ready)');
    console.log('   SD Progress: 20% → 35%');
    console.log('\n' + '═'.repeat(70));
    console.log('📋 Next Steps:');
    console.log('   1. Generate user stories (Product Requirements Expert auto-trigger)');
    console.log('   2. Define component architecture details');
    console.log('   3. Create PLAN→EXEC handoff');
    console.log('   4. EXEC phase MUST apply board infrastructure migration first');

  } finally {
    await client.end();
  }
}

createPRD().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
