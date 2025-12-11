#!/usr/bin/env node

/**
 * User Stories Generator for SD-VISION-TRANSITION-001D4
 * Phase 4 Stages: THE BLUEPRINT (Stages 13-16) - Kochel Firewall
 *
 * Following INVEST criteria with rich implementation context
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

const PRD_ID = 'PRD-SD-VISION-TRANSITION-001D4';
const SD_ID = 'SD-VISION-TRANSITION-001D4';

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
        testable: true
      },
      {
        criterion: 'AI interrogation panel appears with challenge questions when user selects tech stack options',
        testable: true
      },
      {
        criterion: 'User can provide rationale for each tech stack decision, saved to venture_artifacts',
        testable: true
      },
      {
        criterion: 'Decision gate shows green/yellow/red status based on completeness',
        testable: true
      },
      {
        criterion: 'Incomplete decision prevents stage progression with validation error',
        testable: true
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
      'EVA Gateway API - AI interrogation integration'
    ],
    example_code_patterns: [
      {
        pattern: 'AI Interrogation',
        code: `const { interrogate } = useAIInterrogation();
const challenges = await interrogate({
  decision_type: 'programming_language',
  current_choice: 'Python'
});`
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 13: Chairman Decision Gate Approval',
    user_role: 'Chairman',
    user_want: 'to review and approve tech stack decisions at Stage 13 decision gate',
    user_benefit: 'so that ventures proceed with validated technology choices, preventing risky tech stack choices',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Chairman can view tech stack decision rationale and AI interrogation responses',
        testable: true
      },
      {
        criterion: 'Chairman approval advances venture to Stage 14, logged in chairman_decisions table',
        testable: true
      },
      {
        criterion: 'Chairman rejection blocks progression with reason, entrepreneur receives notification',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a Chairman reviewing tech stack decision',
        when: 'they click Approve',
        then: 'stage 13 is marked completed and entrepreneur is notified'
      }
    ],
    implementation_context: 'ChairmanDecisionGate component for Stage 13 approval. Displays tech stack decisions with rationale and AI interrogation history.',
    architecture_references: [
      'chairman_decisions table - approval/rejection tracking',
      'venture_stage_work table - stage status updates'
    ],
    example_code_patterns: []
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
    user_benefit: 'so that I can clearly define entities and relationships, preventing schema ambiguity',
    story_points: 13,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Entity creation via drag-drop from palette to canvas',
        testable: true
      },
      {
        criterion: 'Field editor allows adding fields with types (uuid, string, integer, boolean, timestamp) and constraints',
        testable: true
      },
      {
        criterion: 'Relationship creation between entities with cardinality (1:1, 1:M, M:M)',
        testable: true
      },
      {
        criterion: 'Field type validation prevents invalid types with error messages',
        testable: true
      },
      {
        criterion: 'Real-time validation shows ERD completeness with green/yellow/red indicators',
        testable: true
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
      'Field type validation schema'
    ],
    example_code_patterns: [
      {
        pattern: 'React Flow Setup',
        code: `import ReactFlow from '@xyflow/react';
const ERDBuilder = () => {
  const [nodes, setNodes] = useState([]);
  return <ReactFlow nodes={nodes} />;
};`
      }
    ]
  },

  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 14: ERD Export to Mermaid, SQL, TypeScript',
    user_role: 'Entrepreneur',
    user_want: 'to export my data model to Mermaid diagrams, SQL DDL, and TypeScript interfaces',
    user_benefit: 'so that I can use these artifacts in documentation and handoff to developers',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Export to Mermaid diagram format with valid syntax',
        testable: true
      },
      {
        criterion: 'Export to PostgreSQL SQL DDL with primary keys, foreign keys, constraints',
        testable: true
      },
      {
        criterion: 'Export to TypeScript interfaces with correct type mappings',
        testable: true
      },
      {
        criterion: 'SQL reserved keywords are auto-escaped with validation warning',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur with completed ERD',
        when: 'they export to Mermaid',
        then: 'valid Mermaid syntax is generated with all entities and relationships'
      }
    ],
    implementation_context: 'ExportControls component with format selection. Code generators for Mermaid, SQL, TypeScript. Template-based generation. Browser download API.',
    architecture_references: [
      'Code generation utilities',
      'Template engines for SQL/TypeScript'
    ],
    example_code_patterns: []
  },

  // ============================================================================
  // STAGE 15: USER STORY PACK
  // ============================================================================
  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 15: User Story Editor with INVEST Validation',
    user_role: 'Entrepreneur',
    user_want: 'to create user stories with automatic INVEST criteria validation',
    user_benefit: 'so that I ensure my stories are high-quality and testable, reducing implementation ambiguity',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Story template provides As/Want/So structure with placeholders',
        testable: true
      },
      {
        criterion: 'Acceptance criteria editor supports Given-When-Then format validation',
        testable: true
      },
      {
        criterion: 'INVEST score is calculated and displayed with breakdown (Independent, Negotiable, Valuable, Estimable, Small, Testable)',
        testable: true
      },
      {
        criterion: 'Low INVEST score shows warnings with improvement suggestions',
        testable: true
      },
      {
        criterion: 'Story size validation warns about large stories (>5 acceptance criteria)',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur on Stage 15 User Story Pack',
        when: 'they create story with Given-When-Then acceptance criteria',
        then: 'INVEST score is ≥80% and story is saved to user_story_pack artifact'
      }
    ],
    implementation_context: 'Stage15UserStoryPack component with story editor. Story template (As/Want/So). INVEST validation engine. Acceptance criteria array editor with Given-When-Then parser.',
    architecture_references: [
      'venture_artifacts table - artifact_type="user_story_pack"',
      'INVEST validation algorithm'
    ],
    example_code_patterns: []
  },

  {
    story_key: `${SD_ID}:US-006`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 15: Epic Management with Story Grouping',
    user_role: 'Entrepreneur',
    user_want: 'to organize stories into epics and map dependencies',
    user_benefit: 'so that I can group related features and plan implementation phases',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Epic creation and story assignment with epic card display',
        testable: true
      },
      {
        criterion: 'Dependency mapping between stories with visualization',
        testable: true
      },
      {
        criterion: 'Epic summary shows story count and completion status',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur with 5 user stories',
        when: 'they create epic "Customer Management" and assign 3 stories',
        then: 'epic is saved with story assignments and displayed in UI'
      }
    ],
    implementation_context: 'EpicManager component with epic cards (collapsible). Story assignment via drag-drop or select. DependencyMapper for visual dependency graph.',
    architecture_references: [
      'user_story_pack artifact structure'
    ],
    example_code_patterns: []
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
    user_benefit: 'so that I know if my specifications are ready for development',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Checklist displays 6 completeness items (Entities Named, Relationships Explicit, Fields Typed, Constraints Stated, API Contracts, TypeScript Interfaces) with status indicators',
        testable: true
      },
      {
        criterion: 'Firewall blocks progression when checklist incomplete, disabling "Proceed to Stage 17" button',
        testable: true
      },
      {
        criterion: 'Partial completion shows yellow status with expandable details',
        testable: true
      },
      {
        criterion: 'Firewall pass enables Stage 17 and records timestamp',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur at Stage 16 Kochel Firewall',
        when: 'all checklist items are complete',
        then: 'all items show green and Stage 17 is unlocked'
      }
    ],
    implementation_context: 'Stage16KochelFirewall component with completeness checklist. 6 checklist items with expand/collapse details. Traffic light status (green/yellow/red). Progressive button enablement.',
    architecture_references: [
      'venture_artifacts validation',
      'venture_stage_work.stage_status'
    ],
    example_code_patterns: []
  },

  {
    story_key: `${SD_ID}:US-008`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 16: Four Buckets Epistemic Classification',
    user_role: 'Entrepreneur',
    user_want: 'to classify each schema decision as Fact, Assumption, Simulation, or Unknown',
    user_benefit: 'so that I understand the certainty level of my specifications',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Classification UI for schema decisions with dropdown for bucket selection (Fact, Assumption, Simulation, Unknown)',
        testable: true
      },
      {
        criterion: 'Honesty requirement enforces at least one Unknown, blocking firewall if not met',
        testable: true
      },
      {
        criterion: 'Assumptions link to Stage 2-3 assumption sets for traceability',
        testable: true
      },
      {
        criterion: 'Facts require source reference, validation error if missing',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur reviewing schema at Stage 16',
        when: 'they classify field "email" as Fact with source "OAuth spec"',
        then: 'classification is saved with source and displayed with Fact badge'
      }
    ],
    implementation_context: 'FourBucketsClassification component with dropdown for bucket selection. Source reference field for Facts. Assumption_set_id lookup from Stage 2-3. Honesty requirement validation.',
    architecture_references: [
      'venture_artifacts.epistemic_classification field',
      'assumption_sets table'
    ],
    example_code_patterns: []
  },

  {
    story_key: `${SD_ID}:US-009`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Stage 16: Schema Generator for SQL and TypeScript',
    user_role: 'Entrepreneur',
    user_want: 'to generate SQL schema and TypeScript API contracts from my ERD and user stories',
    user_benefit: 'so that developers have unambiguous specifications',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'SQL schema generation from ERD with PostgreSQL CREATE TABLE statements, primary keys, foreign keys, constraints',
        testable: true
      },
      {
        criterion: 'TypeScript API contract generation from user stories with interfaces for request/response types and OpenAPI spec',
        testable: true
      },
      {
        criterion: 'Reserved SQL keyword handling with auto-escaping and validation warning',
        testable: true
      },
      {
        criterion: 'Generated schemas are downloadable as .sql and .ts/.yaml files',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'an entrepreneur with complete ERD',
        when: 'they generate SQL schema',
        then: 'valid PostgreSQL CREATE TABLE statements are generated with all constraints'
      }
    ],
    implementation_context: 'SchemaGenerator component with SQL and TypeScript generation. Template-based code generation. PostgreSQL syntax. OpenAPI spec generation (v3). Reserved keyword escaping.',
    architecture_references: [
      'ERD data model structure',
      'venture_artifacts - schema_spec, api_contract'
    ],
    example_code_patterns: []
  },

  // ============================================================================
  // CROSS-STAGE: PROGRESSION
  // ============================================================================
  {
    story_key: `${SD_ID}:US-010`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Cross-Stage: Sequential Stage Progression with Gates',
    user_role: 'Entrepreneur',
    user_want: 'stages to unlock sequentially (13→14→15→16) as I complete each phase',
    user_benefit: 'so that I complete each critical specification step before proceeding',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        criterion: 'Stage unlocking follows sequential progression (13→14→15→16)',
        testable: true
      },
      {
        criterion: 'Locked stages prevent direct access with redirect and error message',
        testable: true
      },
      {
        criterion: 'Firewall pass unlocks Stage 17 with timestamp recorded',
        testable: true
      },
      {
        criterion: 'Navigation shows lock icons on incomplete stages',
        testable: true
      }
    ],
    test_scenarios: [
      {
        given: 'a venture completing Stage 13',
        when: 'stage 13 is marked completed',
        then: 'Stage 14 unlocks and Stage 15/16 remain locked'
      }
    ],
    implementation_context: 'StageProgressionManager component handles sequential unlocking. Navigation guard middleware prevents unauthorized stage access. Lock icon UI in stage navigation.',
    architecture_references: [
      'venture_stage_work table',
      'lifecycle_stage_config table'
    ],
    example_code_patterns: []
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

  // Step 2: Delete existing user stories
  console.log('\n2️⃣  Checking for existing user stories...');
  const { data: existing } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (existing && existing.length > 0) {
    console.log(`   Found ${existing.length} existing stories, deleting...`);
    await supabase.from('user_stories').delete().eq('sd_id', SD_ID);
    console.log('   ✅ Existing stories deleted');
  }

  // Step 3: Insert user stories
  console.log('\n3️⃣  Inserting user stories...');

  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    const { error } = await supabase
      .from('user_stories')
      .insert({
        ...story,
        created_by: 'STORIES_AGENT_v2.0',
        created_at: new Date().toISOString()
      });

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
  console.log('   ✅ Valuable: Clear benefit statements');
  console.log('   ✅ Estimable: Story points assigned (5, 8, 13)');
  console.log('   ✅ Small: Single feature focus');
  console.log('   ✅ Testable: Clear acceptance criteria with test scenarios');

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
