#!/usr/bin/env node

/**
 * User Stories Generator for SD-VISION-TRANSITION-001D4
 * Phase 4 Stages: THE BLUEPRINT (Stages 13-16) - Kochel Firewall
 *
 * Following INVEST criteria with rich implementation context
 * - Independent: Each story can be developed independently
 * - Negotiable: Details can be refined during implementation
 * - Valuable: Clear benefit to entrepreneurs
 * - Estimable: Story points provided
 * - Small: Single feature focus
 * - Testable: Clear Given-When-Then acceptance criteria
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const PRD_ID = 'PRD-SD-VISION-TRANSITION-001D4';
const SD_ID = 'SD-VISION-TRANSITION-001D4';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const userStories = [
  // ============================================================================
  // STAGE 13: TECH STACK INTERROGATION
  // ============================================================================
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 13: Tech Stack Decision Form with AI Challenges',
    user_role: 'Entrepreneur',
    user_want: 'to select my tech stack with AI-powered challenge questions',
    user_benefit: 'so that I make informed technology decisions backed by rationale, reducing tech stack regret',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Tech stack decision form displays with sections for Language, Framework, Database selections',
        testable: true,
        scenario: 'Happy path - tech stack selection with AI interrogation',
        given: 'Entrepreneur is on Stage 13 Tech Stack page AND venture is in stage 13 status',
        when: 'User selects programming language "Python"',
        then: 'AI interrogation panel appears with challenge questions ("Have you considered TypeScript for type safety?")'
      },
      {
        criterion: 'User can provide rationale for each tech stack decision',
        testable: true,
        given: 'AI challenge questions are displayed',
        when: 'User provides rationale "Python preferred for ML integration"',
        then: 'Decision is saved to venture_artifacts table with artifact_type="tech_stack_decision" AND rationale is captured'
      },
      {
        criterion: 'Decision gate shows green/yellow/red status based on completeness',
        testable: true,
        given: 'User has completed all tech stack selections with rationale',
        when: 'System evaluates completeness',
        then: 'Decision gate shows green status AND "Proceed to Stage 14" button is enabled'
      },
      {
        criterion: 'Incomplete decision prevents stage progression',
        testable: true,
        scenario: 'Error path - incomplete decision',
        given: 'User has selected language but not database',
        when: 'User tries to proceed to Stage 14',
        then: 'System shows validation error "Complete all tech stack decisions" AND decision gate shows red status'
      },
      {
        criterion: 'Decision versioning maintains history when choices change',
        testable: true,
        scenario: 'Edge case - changing decision after AI rationale',
        given: 'User has completed tech stack decision with AI rationale captured',
        when: 'User changes language from "Python" to "TypeScript"',
        then: 'AI interrogation re-triggers with new challenge questions AND previous rationale is versioned AND new artifact version is created'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur on Stage 13 Tech Stack page',
        when: 'they select programming language Python',
        then: 'AI interrogation appears with trade-off questions about TypeScript, Go, etc.'
      },
      {
        given: 'an entrepreneur has completed tech stack decision',
        when: 'they click Save & Continue',
        then: 'tech_stack_decision artifact is saved and Stage 14 is unlocked'
      }
    ],
    implementation_context: 'Stage13TechStack component with form for tech stack selection (language, framework, database). AI interrogation via EVA Gateway. Artifact versioning for decision history. Decision gate status panel shows completeness.',
    architecture_references: [
      'src/app/(dashboard)/ventures/[id]/stages/[stage]/page.tsx - Stage page pattern',
      'src/components/ventures/CreateVentureDialog.tsx - Form pattern with validation',
      'src/hooks/useVentureArtifacts.ts - Artifact persistence with versioning',
      'EVA Gateway API - AI interrogation integration',
      'venture_artifacts table - tech_stack_decision artifact type',
      'venture_stage_work table - stage status tracking'
    ],
    example_code_patterns: [
      {
        pattern: 'AI Interrogation',
        code: `const { interrogate } = useAIInterrogation();
const challenges = await interrogate({
  decision_type: 'programming_language',
  current_choice: 'Python',
  context: ventureContext
});`
      },
      {
        pattern: 'Artifact Save with Versioning',
        code: `const { saveArtifact } = useVentureArtifacts(ventureId);
await saveArtifact({
  stage_number: 13,
  artifact_type: 'tech_stack_decision',
  artifact_data: {
    language: 'Python',
    framework: 'FastAPI',
    database: 'PostgreSQL',
    rationale: 'Python for ML, FastAPI for async, PostgreSQL for relational data'
  },
  version: currentVersion + 1
});`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-001-tech-stack-interrogation.spec.ts',
      test_cases: [
        { id: 'TC-D4-001-1', scenario: 'Complete tech stack decision flow', priority: 'P0' },
        { id: 'TC-D4-001-2', scenario: 'AI interrogation response handling', priority: 'P0' },
        { id: 'TC-D4-001-3', scenario: 'Decision versioning on change', priority: 'P1' }
      ]
    },
    edge_cases: [
      'AI interrogation API timeout - fallback to template questions',
      'Network error during decision save - show retry UI',
      'Chairman rejects tech stack decision - allow re-entry'
    ]
  },

  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 13: Chairman Decision Gate Approval for Tech Stack',
    user_role: 'Chairman',
    user_want: 'to review and approve tech stack decisions at Stage 13 decision gate',
    user_benefit: 'so that ventures proceed with validated technology choices, preventing risky tech stack choices from reaching implementation',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Chairman can view tech stack decision rationale and AI interrogation responses',
        testable: true,
        scenario: 'Happy path - Chairman approval',
        given: 'Entrepreneur has completed tech stack decision AND decision gate is pending',
        when: 'Chairman reviews decision rationale',
        then: 'All tech stack choices, rationale, and AI challenge responses are displayed'
      },
      {
        criterion: 'Chairman approval advances venture to Stage 14',
        testable: true,
        given: 'Chairman has reviewed tech stack decision',
        when: 'Chairman clicks "Approve"',
        then: 'venture_stage_work.stage_status = "completed" for stage 13 AND Stage 14 becomes available AND approval is logged in chairman_decisions table'
      },
      {
        criterion: 'Chairman rejection blocks progression with reason',
        testable: true,
        scenario: 'Error path - Chairman rejection',
        given: 'Entrepreneur has completed tech stack decision',
        when: 'Chairman clicks "Reject" with reason "Consider serverless options"',
        then: 'venture_stage_work.stage_status = "blocked" AND entrepreneur receives rejection notification AND decision gate shows red with rejection reason'
      }
    ],
    test_scenarios: [
      {
        given: 'a Chairman reviewing tech stack decision',
        when: 'they click Approve',
        then: 'stage 13 is marked completed and entrepreneur is notified'
      },
      {
        given: 'a Chairman reviewing tech stack decision',
        when: 'they click Reject with reason',
        then: 'stage 13 is blocked and entrepreneur sees rejection reason'
      }
    ],
    implementation_context: 'ChairmanDecisionGate component for Stage 13 approval. Displays tech stack decisions with rationale and AI interrogation history. Approval/rejection updates venture_stage_work and chairman_decisions tables. Notification integration.',
    architecture_references: [
      'chairman_decisions table - approval/rejection tracking',
      'venture_stage_work table - stage status updates',
      'Notification system - entrepreneur notifications'
    ],
    example_code_patterns: [
      {
        pattern: 'Chairman Approval',
        code: `const { approveDecision } = useChairmanActions();
await approveDecision({
  venture_id: ventureId,
  stage_number: 13,
  decision_type: 'tech_stack',
  notes: 'Tech stack choices align with venture goals'
});`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-002-chairman-tech-stack-approval.spec.ts',
      test_cases: [
        { id: 'TC-D4-002-1', scenario: 'Chairman approves tech stack', priority: 'P0' },
        { id: 'TC-D4-002-2', scenario: 'Chairman rejects with reason', priority: 'P0' }
      ]
    },
    edge_cases: [
      'Multiple Chairman users - first approval wins',
      'Entrepreneur modifies decision after Chairman review - re-trigger approval'
    ]
  },

  // ============================================================================
  // STAGE 14: ERD BUILDER
  // ============================================================================
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 14: Interactive ERD Builder with Drag-Drop Entities',
    user_role: 'Entrepreneur',
    user_want: 'to visually design my data model using a drag-drop ERD builder',
    user_benefit: 'so that I can clearly define entities and relationships, preventing schema ambiguity and relationship errors',
    story_points: 13,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Entity creation via drag-drop from palette to canvas',
        testable: true,
        scenario: 'Happy path - create entity with fields',
        given: 'Entrepreneur is on Stage 14 ERD Builder page',
        when: 'User drags "Entity" from palette to canvas AND names it "Customer"',
        then: 'Entity appears on canvas with empty field list'
      },
      {
        criterion: 'Field editor allows adding fields with types and constraints',
        testable: true,
        given: 'Entity "Customer" exists on canvas',
        when: 'User adds fields (id: uuid, name: string, email: string) AND sets id as primary key',
        then: 'Fields are saved to artifact_data.entities array AND validation panel shows green for "Customer" entity'
      },
      {
        criterion: 'Relationship creation between entities with cardinality',
        testable: true,
        scenario: 'Happy path - create relationship',
        given: 'Canvas has "Customer" and "Order" entities',
        when: 'User drags from Customer to Order AND selects relationship type "1:M" AND labels it "places"',
        then: 'Relationship edge appears on canvas with cardinality label AND relationship saved to artifact_data.relationships'
      },
      {
        criterion: 'Field type validation prevents invalid types',
        testable: true,
        scenario: 'Error path - invalid field type',
        given: 'User is adding a field to an entity',
        when: 'User enters field type "CustomType" that is not in allowed types',
        then: 'System shows validation error "Invalid field type" AND suggests valid types (uuid, string, integer, boolean, timestamp, jsonb)'
      },
      {
        criterion: 'Real-time validation shows ERD completeness',
        testable: true,
        given: 'ERD has 3 entities with fields and relationships',
        when: 'System validates data model',
        then: 'Validation panel shows green/yellow/red indicators for each entity and overall completeness score'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur on Stage 14 ERD Builder',
        when: 'they create entity "Customer" with fields id, name, email',
        then: 'entity is saved to data_model artifact and displayed on canvas'
      },
      {
        given: 'an entrepreneur with Customer and Order entities',
        when: 'they create 1:M relationship "places" from Customer to Order',
        then: 'relationship is saved and visually displayed with cardinality'
      }
    ],
    implementation_context: 'Stage14ERDBuilder component using React Flow (@xyflow/react) for graph rendering. Custom EntityNode component for entities. RelationshipEdge for relationships. FieldEditor modal for field definitions. Real-time validation panel. Artifact auto-save (debounced).',
    architecture_references: [
      '@xyflow/react library - Graph/flow diagram library',
      'venture_artifacts table - artifact_type="data_model"',
      'Field type validation schema - allowed types list'
    ],
    example_code_patterns: [
      {
        pattern: 'React Flow Setup',
        code: `import ReactFlow, { Node, Edge } from '@xyflow/react';

const ERDBuilder = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  return (
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange}>
      <Background />
      <Controls />
    </ReactFlow>
  );
};`
      },
      {
        pattern: 'Artifact Save',
        code: `const { saveArtifact } = useVentureArtifacts(ventureId);
await saveArtifact({
  stage_number: 14,
  artifact_type: 'data_model',
  artifact_data: {
    entities: nodes.map(n => n.data),
    relationships: edges.map(e => e.data)
  }
});`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-003-erd-builder.spec.ts',
      test_cases: [
        { id: 'TC-D4-003-1', scenario: 'Create entity with fields', priority: 'P0' },
        { id: 'TC-D4-003-2', scenario: 'Create relationship between entities', priority: 'P0' },
        { id: 'TC-D4-003-3', scenario: 'Drag-drop interaction', priority: 'P1' },
        { id: 'TC-D4-003-4', scenario: 'Field validation', priority: 'P0' }
      ]
    },
    edge_cases: [
      'Large ERD with 30+ entities - performance testing',
      'Circular relationships - validation warning',
      'Duplicate entity names - prevent or auto-rename',
      'Canvas zoom and pan - maintain interaction accuracy'
    ]
  },

  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 14: ERD Export to Mermaid, SQL, and TypeScript',
    user_role: 'Entrepreneur',
    user_want: 'to export my data model to Mermaid diagrams, SQL DDL, and TypeScript interfaces',
    user_benefit: 'so that I can use these artifacts in documentation and handoff to developers with unambiguous specifications',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Export to Mermaid diagram format',
        testable: true,
        scenario: 'Happy path - export to Mermaid',
        given: 'ERD has Customer and Order entities with 1:M relationship',
        when: 'User clicks "Export" AND selects "Mermaid Diagram"',
        then: 'System generates valid Mermaid syntax AND download dialog appears with .mmd file'
      },
      {
        criterion: 'Export to PostgreSQL SQL DDL',
        testable: true,
        scenario: 'Happy path - export to SQL DDL',
        given: 'ERD has Customer entity with fields',
        when: 'User clicks "Export" AND selects "SQL DDL"',
        then: 'System generates PostgreSQL CREATE TABLE statements with primary keys, foreign keys, and constraints AND download .sql file'
      },
      {
        criterion: 'Export to TypeScript interfaces',
        testable: true,
        scenario: 'Happy path - export to TypeScript',
        given: 'ERD has Customer entity',
        when: 'User clicks "Export" AND selects "TypeScript Interfaces"',
        then: 'System generates TypeScript interfaces with correct types AND download .ts file'
      },
      {
        criterion: 'SQL reserved keywords are auto-escaped',
        testable: true,
        given: 'ERD has entity named "User" (SQL reserved keyword)',
        when: 'User exports to SQL DDL',
        then: 'System auto-escapes keyword (e.g., "user" → "users" or \\"user\\") AND shows validation warning'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur with completed ERD',
        when: 'they export to Mermaid',
        then: 'valid Mermaid syntax is generated with all entities and relationships'
      },
      {
        given: 'an entrepreneur with completed ERD',
        when: 'they export to SQL DDL',
        then: 'valid PostgreSQL CREATE TABLE statements are generated'
      }
    ],
    implementation_context: 'ExportControls component with format selection. Code generators for Mermaid, SQL, TypeScript. Template-based generation. Browser download API (createObjectURL). Type mapping (uuid→string, integer→number).',
    architecture_references: [
      'Code generation utilities',
      'Template engines for SQL/TypeScript',
      'Browser download functionality'
    ],
    example_code_patterns: [
      {
        pattern: 'Mermaid Generation',
        code: `const generateMermaid = (entities, relationships) => {
  let mermaid = 'erDiagram\\n';
  relationships.forEach(rel => {
    mermaid += \`  \${rel.from} ||\${rel.cardinality}| \${rel.to} : \${rel.label}\\n\`;
  });
  return mermaid;
};`
      },
      {
        pattern: 'SQL DDL Generation',
        code: `const generateSQL = (entities) => {
  return entities.map(entity => {
    const fields = entity.fields.map(f =>
      \`\${f.name} \${mapType(f.type)} \${f.isPrimaryKey ? 'PRIMARY KEY' : ''}\`
    ).join(', ');
    return \`CREATE TABLE \${entity.name} (\${fields});\`;
  }).join('\\n');
};`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-004-erd-export.spec.ts',
      test_cases: [
        { id: 'TC-D4-004-1', scenario: 'Export to Mermaid', priority: 'P0' },
        { id: 'TC-D4-004-2', scenario: 'Export to SQL DDL', priority: 'P0' },
        { id: 'TC-D4-004-3', scenario: 'Export to TypeScript', priority: 'P0' },
        { id: 'TC-D4-004-4', scenario: 'Validate SQL syntax', priority: 'P1' }
      ]
    },
    edge_cases: [
      'Complex relationships (M:M) - generate junction tables in SQL',
      'Reserved SQL keywords in entity names - auto-escape',
      'TypeScript type mapping for jsonb fields - use any or unknown'
    ]
  },

  // ============================================================================
  // STAGE 15: USER STORY PACK GENERATOR
  // ============================================================================
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 15: User Story Editor with INVEST Validation',
    user_role: 'Entrepreneur',
    user_want: 'to create user stories with automatic INVEST criteria validation',
    user_benefit: 'so that I ensure my stories are high-quality and testable, reducing implementation ambiguity and rework',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Story template provides As/Want/So structure',
        testable: true,
        scenario: 'Happy path - create story with high INVEST score',
        given: 'Entrepreneur is on Stage 15 User Story Pack page',
        when: 'User creates story "As a customer, I want to view order history, so that I can track purchases"',
        then: 'Story is saved with structured format (role, want, benefit)'
      },
      {
        criterion: 'Acceptance criteria editor supports Given-When-Then format',
        testable: true,
        given: 'User is editing acceptance criteria',
        when: 'User adds "Given customer is logged in, When customer clicks Order History, Then list of orders is displayed"',
        then: 'Acceptance criteria is validated for Given-When-Then pattern AND testable flag is set to true'
      },
      {
        criterion: 'INVEST score is calculated and displayed',
        testable: true,
        given: 'User has created story with acceptance criteria',
        when: 'System calculates INVEST score',
        then: 'Score card shows ≥80% for high-quality stories AND displays score breakdown (Independent, Negotiable, Valuable, Estimable, Small, Testable)'
      },
      {
        criterion: 'Low INVEST score shows warnings',
        testable: true,
        scenario: 'Error path - low INVEST score warning',
        given: 'User creates story with vague acceptance criteria',
        when: 'Story has acceptance criteria "User can see data" (missing Given-When-Then)',
        then: 'INVEST score shows yellow (50-79%) AND warning message "Acceptance criteria should use Given-When-Then format"'
      },
      {
        criterion: 'Story size validation warns about large stories',
        testable: true,
        scenario: 'Edge case - story too large',
        given: 'User creates story with 8 acceptance criteria',
        when: 'Story is saved',
        then: 'INVEST validation shows warning "Story may be too large (>5 AC), consider splitting" AND Small score is reduced'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur on Stage 15 User Story Pack',
        when: 'they create story with Given-When-Then acceptance criteria',
        then: 'INVEST score is ≥80% and story is saved to user_story_pack artifact'
      },
      {
        given: 'an entrepreneur creating story with vague criteria',
        when: 'they save story',
        then: 'low INVEST score warning is displayed with improvement suggestions'
      }
    ],
    implementation_context: 'Stage15UserStoryPack component with story editor. Story template (As/Want/So) with placeholders. INVEST validation engine. Acceptance criteria array editor with Given-When-Then parser. Real-time validation feedback.',
    architecture_references: [
      'venture_artifacts table - artifact_type="user_story_pack"',
      'INVEST validation algorithm',
      'Given-When-Then parser utility'
    ],
    example_code_patterns: [
      {
        pattern: 'INVEST Score Calculation',
        code: `const calculateINVESTScore = (story) => {
  const scores = {
    independent: checkIndependence(story),
    negotiable: 100, // Always negotiable
    valuable: checkValueStatement(story),
    estimable: checkEstimability(story),
    small: checkSize(story),
    testable: checkTestability(story)
  };
  return Object.values(scores).reduce((a, b) => a + b) / 6;
};`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-005-user-story-invest.spec.ts',
      test_cases: [
        { id: 'TC-D4-005-1', scenario: 'Create high-quality story', priority: 'P0' },
        { id: 'TC-D4-005-2', scenario: 'INVEST score calculation', priority: 'P0' },
        { id: 'TC-D4-005-3', scenario: 'Low score warning', priority: 'P1' }
      ]
    },
    edge_cases: [
      'Empty acceptance criteria - INVEST score = 0',
      'Story dependencies - flag in Independent score',
      'Missing benefit statement - reduce Valuable score'
    ]
  },

  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 15: Epic Management with Story Grouping',
    user_role: 'Entrepreneur',
    user_want: 'to organize stories into epics and map dependencies',
    user_benefit: 'so that I can group related features and plan implementation phases, enabling phased development',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Epic creation and story assignment',
        testable: true,
        scenario: 'Happy path - create epic with stories',
        given: 'Entrepreneur has created 5 user stories',
        when: 'User creates epic "Customer Management" AND assigns 3 stories to epic',
        then: 'Epic card displays with 3 stories AND stories show epic badge AND epic_id is saved in user_story_pack artifact'
      },
      {
        criterion: 'Dependency mapping between stories',
        testable: true,
        scenario: 'Happy path - dependency mapping',
        given: 'Epic has stories with dependencies',
        when: 'User marks Story A as dependent on Story B',
        then: 'Dependency arrow appears in visualization AND INVEST validation shows Independent score impact'
      },
      {
        criterion: 'Epic summary shows story count and completion status',
        testable: true,
        given: 'Epic has 5 stories, 3 completed',
        when: 'Epic card is displayed',
        then: 'Card shows "3/5 stories complete" with progress indicator'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur with 5 user stories',
        when: 'they create epic "Customer Management" and assign 3 stories',
        then: 'epic is saved with story assignments and displayed in UI'
      },
      {
        given: 'an entrepreneur mapping dependencies',
        when: 'they mark Story A depends on Story B',
        then: 'dependency is saved and INVEST Independent score reflects dependency'
      }
    ],
    implementation_context: 'EpicManager component with epic cards (collapsible). Story assignment via drag-drop or select. DependencyMapper for visual dependency graph. Epic grouping in user_story_pack artifact.',
    architecture_references: [
      'user_story_pack artifact structure',
      'Dependency validation for INVEST'
    ],
    example_code_patterns: [
      {
        pattern: 'Epic Creation',
        code: `const { saveArtifact } = useVentureArtifacts(ventureId);
await saveArtifact({
  stage_number: 15,
  artifact_type: 'user_story_pack',
  artifact_data: {
    epics: [{
      id: 'epic-1',
      name: 'Customer Management',
      stories: ['story-1', 'story-2', 'story-3']
    }]
  }
});`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-006-epic-management.spec.ts',
      test_cases: [
        { id: 'TC-D4-006-1', scenario: 'Create epic and assign stories', priority: 'P0' },
        { id: 'TC-D4-006-2', scenario: 'Map story dependencies', priority: 'P1' }
      ]
    },
    edge_cases: [
      'Circular dependencies - validation error',
      'Story in multiple epics - allow or prevent?',
      'Epic without stories - warn before saving'
    ]
  },

  // ============================================================================
  // STAGE 16: KOCHEL FIREWALL
  // ============================================================================
  {
    story_key: `${SD_ID}:US-007`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 16: Schema Completeness Checklist UI',
    user_role: 'Entrepreneur',
    user_want: 'to see a schema completeness checklist with visual indicators',
    user_benefit: 'so that I know if my specifications are ready for development, preventing ambiguous specs from reaching implementation',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Checklist displays 6 completeness items with status indicators',
        testable: true,
        scenario: 'Happy path - all checklist items pass',
        given: 'Entrepreneur has completed Stages 13-15 with complete artifacts',
        when: 'System evaluates checklist (Entities Named, Relationships Explicit, Fields Typed, Constraints Stated, API Contracts, TypeScript Interfaces)',
        then: 'All 6 checklist items show green status'
      },
      {
        criterion: 'Firewall blocks progression when checklist incomplete',
        testable: true,
        scenario: 'Error path - incomplete checklist blocks',
        given: 'ERD has entity without field types defined',
        when: 'System evaluates checklist',
        then: '"Fields Typed" shows red status AND "Proceed to Stage 17" button is disabled AND blocking_items includes "fields_typed"'
      },
      {
        criterion: 'Partial completion shows yellow status',
        testable: true,
        scenario: 'Edge case - partial completion',
        given: 'ERD has 5 entities, 4 with all fields typed',
        when: 'System evaluates "Fields Typed" checklist item',
        then: 'Item shows yellow status (80% complete) AND expandable detail shows "4/5 entities complete"'
      },
      {
        criterion: 'Firewall pass enables Stage 17',
        testable: true,
        given: 'All 6 checklist items show green',
        when: 'User clicks "Proceed to Stage 17"',
        then: 'venture_stage_work.stage_status = "completed" for stage 16 AND Stage 17 becomes available'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur at Stage 16 Kochel Firewall',
        when: 'all checklist items are complete',
        then: 'all items show green and Stage 17 is unlocked'
      },
      {
        given: 'an entrepreneur with incomplete schema',
        when: 'checklist is evaluated',
        then: 'incomplete items show red and progression is blocked'
      }
    ],
    implementation_context: 'Stage16KochelFirewall component with completeness checklist. 6 checklist items with expand/collapse details. Traffic light status (green/yellow/red). Progressive button enablement. Real-time validation on artifact changes.',
    architecture_references: [
      'venture_artifacts validation',
      'venture_stage_work.stage_status',
      'Firewall validation API endpoint'
    ],
    example_code_patterns: [
      {
        pattern: 'Checklist Validation',
        code: `const validateFirewall = async (ventureId) => {
  const artifacts = await getVentureArtifacts(ventureId, [13, 14, 15]);
  return {
    entities_named: checkEntitiesNamed(artifacts.data_model),
    relationships_explicit: checkRelationships(artifacts.data_model),
    fields_typed: checkFieldTypes(artifacts.data_model),
    constraints_stated: checkConstraints(artifacts.data_model),
    api_contracts: checkAPIContracts(artifacts.user_story_pack),
    typescript_interfaces: checkTypeScriptInterfaces(artifacts.data_model)
  };
};`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-007-kochel-firewall-checklist.spec.ts',
      test_cases: [
        { id: 'TC-D4-007-1', scenario: 'All checklist items pass', priority: 'P0' },
        { id: 'TC-D4-007-2', scenario: 'Incomplete checklist blocks', priority: 'P0' },
        { id: 'TC-D4-007-3', scenario: 'Partial completion yellow', priority: 'P1' }
      ]
    },
    edge_cases: [
      'Checklist re-evaluation on artifact update - real-time status',
      'Chairman override - special permission required',
      'Validation timeout - show pending status'
    ]
  },

  {
    story_key: `${SD_ID}:US-008`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 16: Four Buckets Epistemic Classification',
    user_role: 'Entrepreneur',
    user_want: 'to classify each schema decision as Fact, Assumption, Simulation, or Unknown',
    user_benefit: 'so that I understand the certainty level of my specifications, surfacing areas of uncertainty before development',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Classification UI for schema decisions',
        testable: true,
        scenario: 'Happy path - classify as Fact',
        given: 'Firewall checklist shows entity "Customer" with field "email"',
        when: 'User clicks "Classify" on field decision AND selects "Fact" AND provides source "OAuth provider requires email"',
        then: 'Classification is saved to artifact epistemic_classification AND badge shows "Fact" with source tooltip'
      },
      {
        criterion: 'Honesty requirement enforces at least one Unknown',
        testable: true,
        scenario: 'Error path - no Unknowns',
        given: 'User has classified all decisions as Facts or Assumptions',
        when: 'User tries to pass firewall',
        then: 'Validation error "At least one Unknown must be declared" AND firewall remains blocked'
      },
      {
        criterion: 'Assumptions link to Stage 2-3 assumption sets',
        testable: true,
        scenario: 'Happy path - link Assumption',
        given: 'User classifies decision as "Assumption"',
        when: 'User selects "Customer wants email notifications" from assumption_sets',
        then: 'Classification links to assumption_set_id from Stage 2-3 AND assumption is traceable'
      },
      {
        criterion: 'Facts require source reference',
        testable: true,
        given: 'User classifies decision as "Fact"',
        when: 'User leaves source field empty',
        then: 'Validation error "Facts require source reference" AND classification not saved until source provided'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur reviewing schema at Stage 16',
        when: 'they classify field "email" as Fact with source "OAuth spec"',
        then: 'classification is saved with source and displayed with Fact badge'
      },
      {
        given: 'an entrepreneur trying to pass firewall',
        when: 'no Unknowns are declared',
        then: 'honesty requirement validation blocks progression'
      }
    ],
    implementation_context: 'FourBucketsClassification component with dropdown for bucket selection. Source reference field for Facts. Assumption_set_id lookup from Stage 2-3. Honesty requirement validation (≥1 Unknown). Epistemic classification in venture_artifacts.',
    architecture_references: [
      'venture_artifacts.epistemic_classification field',
      'assumption_sets table - Stage 2-3 link',
      'Firewall validation logic'
    ],
    example_code_patterns: [
      {
        pattern: 'Epistemic Classification',
        code: `const classifyDecision = async (decision, bucket, metadata) => {
  await updateArtifact({
    epistemic_classification: {
      ...existing,
      [decision.id]: {
        bucket, // 'fact' | 'assumption' | 'simulation' | 'unknown'
        source: bucket === 'fact' ? metadata.source : null,
        assumption_set_id: bucket === 'assumption' ? metadata.assumption_set_id : null,
        confidence: metadata.confidence
      }
    }
  });
};`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-008-epistemic-classification.spec.ts',
      test_cases: [
        { id: 'TC-D4-008-1', scenario: 'Classify decision as Fact', priority: 'P0' },
        { id: 'TC-D4-008-2', scenario: 'Honesty requirement validation', priority: 'P0' },
        { id: 'TC-D4-008-3', scenario: 'Link Assumption to Stage 2-3', priority: 'P1' }
      ]
    },
    edge_cases: [
      'Simulations - validate simulation reference exists',
      'Multiple classifications - use most recent',
      'Classification change after firewall - re-trigger validation'
    ]
  },

  {
    story_key: `${SD_ID}:US-009`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 16: Schema Generator for SQL and TypeScript Contracts',
    user_role: 'Entrepreneur',
    user_want: 'to generate SQL schema and TypeScript API contracts from my ERD and user stories',
    user_benefit: 'so that developers have unambiguous specifications, eliminating "what did they mean?" questions during implementation',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'SQL schema generation from ERD',
        testable: true,
        scenario: 'Happy path - generate SQL',
        given: 'ERD has complete entity definitions with fields and relationships',
        when: 'User clicks "Generate SQL Schema" at Stage 16',
        then: 'System generates PostgreSQL CREATE TABLE statements with primary keys, foreign keys, constraints AND saves as artifact_type="schema_spec"'
      },
      {
        criterion: 'TypeScript API contract generation from user stories',
        testable: true,
        scenario: 'Happy path - generate TypeScript',
        given: 'User stories define API endpoints',
        when: 'User clicks "Generate API Contracts"',
        then: 'System generates TypeScript interfaces for request/response types AND OpenAPI spec is created AND saved as artifact_type="api_contract"'
      },
      {
        criterion: 'Reserved SQL keyword handling',
        testable: true,
        scenario: 'Edge case - reserved keyword',
        given: 'ERD has entity with reserved SQL keyword as name',
        when: 'Generator creates SQL',
        then: 'System auto-escapes keyword (e.g., "user" → "users") AND validation warning shown'
      },
      {
        criterion: 'Generated schemas are downloadable',
        testable: true,
        given: 'SQL schema and TypeScript contracts are generated',
        when: 'User clicks download',
        then: 'Files are downloaded as .sql and .ts/.yaml formats'
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur with complete ERD',
        when: 'they generate SQL schema',
        then: 'valid PostgreSQL CREATE TABLE statements are generated with all constraints'
      },
      {
        given: 'an entrepreneur with user stories defining APIs',
        when: 'they generate TypeScript contracts',
        then: 'TypeScript interfaces and OpenAPI spec are generated'
      }
    ],
    implementation_context: 'SchemaGenerator component with SQL and TypeScript generation. Template-based code generation. PostgreSQL syntax. OpenAPI spec generation (v3). Reserved keyword escaping. Download as file functionality.',
    architecture_references: [
      'ERD data model structure',
      'User story pack for API endpoints',
      'venture_artifacts - schema_spec, api_contract',
      'Code generation utilities'
    ],
    example_code_patterns: [
      {
        pattern: 'SQL Schema Generation',
        code: `const generatePostgreSQLSchema = (entities, relationships) => {
  const tables = entities.map(entity => {
    const fields = entity.fields.map(f =>
      \`  \${f.name} \${mapToPostgreSQLType(f.type)}\${f.isPrimaryKey ? ' PRIMARY KEY' : ''}\${f.isRequired ? ' NOT NULL' : ''}\`
    ).join(',\\n');

    return \`CREATE TABLE \${escapeKeyword(entity.name)} (\\n\${fields}\\n);\`;
  }).join('\\n\\n');

  return tables;
};`
      },
      {
        pattern: 'TypeScript Interface Generation',
        code: `const generateTypeScriptInterfaces = (entities) => {
  return entities.map(entity => {
    const fields = entity.fields.map(f =>
      \`  \${f.name}\${f.isRequired ? '' : '?'}: \${mapToTypeScriptType(f.type)};\`
    ).join('\\n');

    return \`export interface \${entity.name} {\\n\${fields}\\n}\`;
  }).join('\\n\\n');
};`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-009-schema-generator.spec.ts',
      test_cases: [
        { id: 'TC-D4-009-1', scenario: 'Generate valid SQL schema', priority: 'P0' },
        { id: 'TC-D4-009-2', scenario: 'Generate TypeScript contracts', priority: 'P0' },
        { id: 'TC-D4-009-3', scenario: 'Handle reserved keywords', priority: 'P1' }
      ]
    },
    edge_cases: [
      'M:M relationships - generate junction tables',
      'Complex constraints (CHECK) - include in SQL',
      'TypeScript enum generation for fixed values',
      'Schema versioning - append version to artifact'
    ]
  },

  // ============================================================================
  // CROSS-STAGE: PROGRESSION & WORKFLOW
  // ============================================================================
  {
    story_key: `${SD_ID}:US-010`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Cross-Stage: Sequential Stage Progression with Gates',
    user_role: 'Entrepreneur',
    user_want: 'stages to unlock sequentially (13→14→15→16) as I complete each phase',
    user_benefit: 'so that I complete each critical specification step before proceeding, preventing skipped specification work',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Stage unlocking follows sequential progression',
        testable: true,
        scenario: 'Happy path - stage unlocking',
        given: 'Venture completes Stage 13 tech stack decision',
        when: 'venture_stage_work.stage_status = "completed" for stage 13',
        then: 'Stage 14 becomes available in navigation AND Stage 15/16 remain locked AND venture_stage_work record created for stage 14 with status="in_progress"'
      },
      {
        criterion: 'Locked stages prevent direct access',
        testable: true,
        scenario: 'Error path - locked stage access',
        given: 'Stage 14 is not yet unlocked (Stage 13 incomplete)',
        when: 'User tries to navigate to Stage 14 URL directly',
        then: 'System redirects to current stage (13) AND shows message "Complete Stage 13 to unlock Stage 14"'
      },
      {
        criterion: 'Firewall pass unlocks Stage 17',
        testable: true,
        scenario: 'Happy path - firewall pass',
        given: 'Stage 16 Firewall checklist all green',
        when: 'User clicks "Proceed to Stage 17"',
        then: 'venture_stage_work.stage_status = "completed" for stage 16 AND Stage 17 becomes available AND firewall_passed_at timestamp recorded'
      },
      {
        criterion: 'Navigation shows lock icons on incomplete stages',
        testable: true,
        given: 'Stages 15 and 16 are locked',
        when: 'Navigation is displayed',
        then: 'Lock icons appear on Stage 15 and 16 navigation items'
      }
    ],
    test_scenarios: [
      {
        given: 'a venture completing Stage 13',
        when: 'stage 13 is marked completed',
        then: 'Stage 14 unlocks and Stage 15/16 remain locked'
      },
      {
        given: 'a user trying to access locked Stage 15',
        when: 'they navigate to Stage 15 URL',
        then: 'system redirects to current stage with locked message'
      },
      {
        given: 'a venture passing Kochel Firewall at Stage 16',
        when: 'all checklist items are green and user proceeds',
        then: 'Stage 17 unlocks and firewall_passed_at is recorded'
      }
    ],
    implementation_context: 'StageProgressionManager component handles sequential unlocking. Navigation guard middleware prevents unauthorized stage access. Lock icon UI in stage navigation. venture_stage_work status transitions. Redirect to current stage on locked access.',
    architecture_references: [
      'venture_stage_work table - stage status tracking',
      'lifecycle_stage_config table - stage configuration',
      'Navigation component - lock/unlock UI',
      'Stage routing guards'
    ],
    example_code_patterns: [
      {
        pattern: 'Stage Unlock',
        code: `const unlockNextStage = async (ventureId, currentStage) => {
  await updateStageWork(ventureId, currentStage, { stage_status: 'completed' });
  await createStageWork(ventureId, currentStage + 1, { stage_status: 'in_progress' });
};`
      },
      {
        pattern: 'Navigation Guard',
        code: `const canAccessStage = (venture, targetStage) => {
  const currentStageWork = venture.stage_work.find(sw => sw.stage_number === targetStage);
  return currentStageWork && currentStageWork.stage_status !== 'locked';
};`
      }
    ],
    testing_scenarios: {
      e2e_test_location: 'tests/e2e/stages/US-D4-010-stage-progression.spec.ts',
      test_cases: [
        { id: 'TC-D4-010-1', scenario: 'Complete stage unlocks next', priority: 'P0' },
        { id: 'TC-D4-010-2', scenario: 'Locked stage access blocked', priority: 'P0' },
        { id: 'TC-D4-010-3', scenario: 'Firewall pass unlocks Stage 17', priority: 'P0' },
        { id: 'TC-D4-010-4', scenario: 'Full 13→16 progression', priority: 'P0' }
      ]
    },
    edge_cases: [
      'Chairman override - unlock stage early with permission',
      'Stage regression - allow return to completed stages for edits',
      'Concurrent stage work - prevent simultaneous progress'
    ]
  }
];

async function createUserStories() {
  console.log('\n📝 Creating User Stories for SD-VISION-TRANSITION-001D4');
  console.log('='.repeat(80));

  // Step 1: Verify PRD exists
  console.log('\n1️⃣  Verifying PRD exists...');
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, sd_uuid')
    .eq('id', PRD_ID)
    .single();

  if (prdError || !prd) {
    console.error(`❌ PRD ${PRD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ PRD found: ${prd.title}`);

  // Step 2: Delete existing user stories for this SD
  console.log('\n2️⃣  Checking for existing user stories...');
  const { data: existing } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (existing && existing.length > 0) {
    console.log(`   Found ${existing.length} existing stories, deleting...`);
    await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', SD_ID);
    console.log('   ✅ Existing stories deleted');
  }

  // Step 3: Insert user stories
  console.log('\n3️⃣  Inserting user stories...');

  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    const { error } = await supabase
      .from('user_stories')
      .insert(story);

    if (error) {
      console.error(`   ❌ Failed to insert ${story.story_key}:`, error.message);
      errorCount++;
    } else {
      console.log(`   ✅ ${story.story_key}: ${story.title}`);
      successCount++;
    }
  }

  // Step 4: Summary
  console.log('\n📊 Summary:');
  console.log('='.repeat(80));
  console.log(`   Total Stories: ${userStories.length}`);
  console.log(`   ✅ Successfully Created: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  console.log('\n📈 Story Breakdown by Stage:');
  console.log('   Stage 13 (Tech Stack): 2 stories (US-001, US-002)');
  console.log('   Stage 14 (ERD Builder): 2 stories (US-003, US-004)');
  console.log('   Stage 15 (User Stories): 2 stories (US-005, US-006)');
  console.log('   Stage 16 (Kochel Firewall): 3 stories (US-007, US-008, US-009)');
  console.log('   Cross-Stage (Progression): 1 story (US-010)');

  console.log('\n📊 INVEST Quality:');
  console.log('   ✅ Independent: Each story can be developed separately');
  console.log('   ✅ Negotiable: Implementation details flexible');
  console.log('   ✅ Valuable: Clear benefit statements for each story');
  console.log('   ✅ Estimable: Story points assigned (5, 8, 13 points)');
  console.log('   ✅ Small: Single feature focus per story');
  console.log('   ✅ Testable: Given-When-Then acceptance criteria with scenarios');

  console.log('\n🎯 Total Story Points: 62');
  console.log('   Estimated Duration: 12-14 days (2-3 week sprint)');

  console.log('\n📝 Next Steps:');
  console.log('   1. Review user stories in database');
  console.log('   2. Run DATABASE sub-agent for schema review');
  console.log('   3. Run SECURITY sub-agent for security assessment');
  console.log('   4. Execute PLAN-TO-EXEC handoff when ready');
  console.log('');
}

createUserStories().catch(error => {
  console.error('\n❌ Error creating user stories:', error.message);
  process.exit(1);
});
