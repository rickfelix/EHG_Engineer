/**
 * Create Product Requirements Document (PRD) for SDIP
 * Following LEO Protocol v4.1.2_database_first
 * PLAN Phase - Technical Requirements Definition
 */

import dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSDIPPRD() {
  console.log('📋 PLAN Phase: Creating PRD for SDIP (SD-2025-0903-SDIP)');
  
  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdData = {
    // Required fields from schema
    id: `PRD-${Date.now()}`,
    title: 'Strategic Directive Initiation Protocol (SDIP) - Directive Lab',
    version: '1.0',
    status: 'draft',
    priority: 'high',
    category: 'feature',
    directive_id: 'SD-2025-0903-SDIP',
    created_by: 'PLAN',
    
    // Executive summary fields
    executive_summary: 'Transform Chairman feedback into validated Strategic Directives through a 6-step mandatory validation workflow with critical analysis and synthesis generation.',
    business_context: 'The Chairman requires a streamlined process to provide page-by-page feedback on the EHG application and have that feedback transformed into actionable Strategic Directives. Current process lacks structure and validation.',
    technical_context: 'Integration with EHG_Engineer dashboard to provide a "Directive Lab" feature that processes feedback through PACER analysis (backend-only), critical intent extraction, strategic/tactical classification, and synthesis generation with mandatory validation gates.',
    
    // Technical requirements
    technical_requirements: {
      architecture: {
        type: 'Full-stack SPA with API',
        frontend: 'React with TypeScript',
        backend: 'Node.js Express API',
        database: 'Supabase PostgreSQL',
        deployment: 'EHG_Engineer Dashboard Integration'
      },
      
      components: [
        {
          name: 'DirectiveLab UI',
          description: 'Main interface for SDIP workflow',
          requirements: [
            'Step-driven accordion interface',
            '6 mandatory validation gates',
            'No step skipping allowed',
            'Real-time progress tracking',
            'Screenshot upload support'
          ]
        },
        {
          name: 'PACER Engine',
          description: 'Backend-only analysis engine',
          requirements: [
            'Categorize input into 5 PACER categories',
            'Store results in database only',
            'Never expose to frontend UI',
            'Async processing support'
          ]
        },
        {
          name: 'Critical Analyzer',
          description: 'Critical mode analysis engine',
          requirements: [
            'Implement "cold war judge" pattern',
            'Extract intent from feedback',
            'Strategic/tactical classification',
            'Generate clarifying questions',
            'No supportive mode in MVP+'
          ]
        },
        {
          name: 'Synthesis Generator',
          description: 'Generate actionable synthesis',
          requirements: [
            'Create aligned/required/recommended items',
            'Assign change policy badges',
            'Generate client summaries',
            'Support enhancement with badges'
          ]
        },
        {
          name: 'Validation Gate Enforcer',
          description: 'Enforce mandatory workflow gates',
          requirements: [
            'Enforce all 6 validation gates',
            'Prevent SD creation without all gates',
            'Track gate completion status',
            'Calculate progress percentage'
          ]
        }
      ],
      
      apis: [
        {
          endpoint: '/api/sdip/submissions',
          methods: ['GET', 'POST'],
          description: 'Create and retrieve SDIP submissions'
        },
        {
          endpoint: '/api/sdip/submissions/:id',
          methods: ['GET', 'PUT'],
          description: 'Get and update specific submission'
        },
        {
          endpoint: '/api/sdip/submissions/:id/step/:step',
          methods: ['POST'],
          description: 'Complete specific validation step'
        },
        {
          endpoint: '/api/sdip/groups',
          methods: ['POST'],
          description: 'Create submission groups for manual linking'
        },
        {
          endpoint: '/api/sdip/strategic-directive',
          methods: ['POST'],
          description: 'Create SD from validated submission'
        }
      ],
      
      database_schema: {
        tables: [
          'sdip_submissions - Store individual feedback submissions',
          'sdip_groups - Store manually linked submission groups'
        ],
        relationships: [
          'sdip_submissions.group_id -> sdip_groups.id',
          'sdip_submissions.resulting_sd_id -> strategic_directives_v2.id'
        ]
      },
      
      validation_gates: {
        step1: 'Input & Screenshot Collection',
        step2: 'Intent Confirmation',
        step3: 'Strategic/Tactical Classification',
        step4: 'Synthesis Review',
        step5: 'Clarifying Questions',
        step6: 'Summary Confirmation'
      }
    },
    
    // Functional requirements
    functional_requirements: [
      {
        id: 'SDIP-001',
        name: 'Feedback Submission',
        description: 'Capture Chairman feedback with optional screenshot',
        acceptance_criteria: [
          'Text input for feedback (required)',
          'Screenshot upload (optional)',
          'Auto-save to database',
          'Generate submission ID'
        ]
      },
      {
        id: 'SDIP-002',
        name: 'PACER Analysis',
        description: 'Backend-only PACER categorization',
        acceptance_criteria: [
          'Analyze feedback into 5 categories',
          'Store in pacer_analysis JSONB field',
          'Never display in UI',
          'Complete within 2 seconds'
        ]
      },
      {
        id: 'SDIP-003',
        name: 'Critical Intent Extraction',
        description: 'Extract and validate intent summary',
        acceptance_criteria: [
          'Generate intent summary',
          'Allow user confirmation/editing',
          'Store both original and confirmed',
          'Update validation gate status'
        ]
      },
      {
        id: 'SDIP-004',
        name: 'Strategic/Tactical Classification',
        description: 'Classify feedback as strategic or tactical',
        acceptance_criteria: [
          'Calculate percentage split',
          'Display visual breakdown',
          'Allow manual override',
          'Store final classification'
        ]
      },
      {
        id: 'SDIP-005',
        name: 'Synthesis Generation',
        description: 'Generate aligned/required/recommended items',
        acceptance_criteria: [
          'Create categorized action items',
          'Assign change policy badges',
          'Display with accordion UI',
          'Support review and confirmation'
        ]
      },
      {
        id: 'SDIP-006',
        name: 'Clarifying Questions',
        description: 'Generate and collect answers to questions',
        acceptance_criteria: [
          'Generate 3-5 relevant questions',
          'Capture answers in form',
          'Store responses in database',
          'Update client summary based on answers'
        ]
      },
      {
        id: 'SDIP-007',
        name: 'SD Creation',
        description: 'Create Strategic Directive from validated submission',
        acceptance_criteria: [
          'Enforce all 6 gates complete',
          'Generate unique SD ID',
          'Copy data to SD table',
          'Update submission with SD reference',
          'Redirect to SD view'
        ]
      },
      {
        id: 'SDIP-008',
        name: 'Manual Submission Linking',
        description: 'Group related submissions manually',
        acceptance_criteria: [
          'List uncombined submissions',
          'Select multiple for grouping',
          'Choose combination method',
          'Create merged SD from group'
        ]
      }
    ],
    
    // Non-functional requirements (including sub-agents)
    non_functional_requirements: [
      {
        agent: 'Database',
        reason: 'New schema for SDIP tables',
        tasks: [
          'Create sdip_submissions table',
          'Create sdip_groups table',
          'Add indexes for performance',
          'Setup RLS policies'
        ]
      },
      {
        agent: 'Design',
        reason: 'Complex UI with accordion and validation',
        tasks: [
          'Design step-driven accordion',
          'Create validation gate indicators',
          'Design badge system UI',
          'Mobile responsive layout'
        ]
      },
      {
        agent: 'Testing',
        reason: 'Critical validation workflow',
        tasks: [
          'Test all 6 validation gates',
          'Test SD creation flow',
          'Test error handling',
          'E2E workflow testing'
        ]
      },
      {
        agent: 'Security',
        reason: 'API key handling and user data',
        tasks: [
          'Secure OpenAI API key usage',
          'Validate input sanitization',
          'RLS for multi-tenant access',
          'Rate limiting for API calls'
        ]
      }
    ],
    
    // Performance requirements
    performance_requirements: {
      response_times: {
        page_load: '<1s',
        step_transitions: '<200ms',
        api_responses: '<500ms',
        pacer_analysis: '<2s'
      },
      throughput: {
        concurrent_users: '50+',
        submissions_per_hour: '100+'
      },
      reliability: {
        uptime: '99.9%',
        sd_creation_success_rate: '>95%'
      }
    },
    
    // Acceptance criteria
    acceptance_criteria: [
      'All 6 validation gates are enforced without exceptions',
      'PACER analysis completes in under 2 seconds',
      'Critical analysis provides actionable intent extraction',
      'No user can skip validation steps',
      'SD creation only allowed after all gates passed',
      'Accessibility compliance with WCAG 2.1 AA',
      'Mobile responsive design works on all devices'
    ],
    
    // Risk assessment
    risks: [
      {
        risk: 'OpenAI API rate limits',
        mitigation: 'Implement caching and queuing',
        severity: 'medium'
      },
      {
        risk: 'Complex validation logic bugs',
        mitigation: 'Comprehensive testing suite',
        severity: 'high'
      },
      {
        risk: 'User confusion with 6-step process',
        mitigation: 'Clear UI indicators and help text',
        severity: 'low'
      }
    ],
    
    // Implementation phases
    phase: 'planning',
    phase_progress: {
      PLAN: 50,
      EXEC: 0,
      VERIFICATION: 0,
      APPROVAL: 0
    },
    
    // Metadata
    metadata: {
      created_via: 'LEO Protocol v4.1.2',
      agent: 'PLAN',
      handoff_from: 'LEAD',
      estimated_effort: '2-3 hours with AI agents',
      complexity: 'high',
      innovation_level: 'high',
      chairman_priority: 'critical'
    }
  sd_uuid: sdUuid, // FIX: Added for handoff validation
  };

  try {
    // Insert PRD into database
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating PRD:', error);
      return;
    }

    console.log('✅ PRD created successfully!');
    console.log('📄 PRD ID:', data.id);
    console.log('🔗 Linked to SD:', data.directive_id);
    console.log('\n📊 Technical Requirements Summary:');
    console.log('  - Components:', prdData.technical_requirements.components.length);
    console.log('  - Functional Requirements:', prdData.functional_requirements.length);
    console.log('  - Non-functional Requirements:', prdData.non_functional_requirements.length);
    console.log('  - APIs:', prdData.technical_requirements.apis.length);
    
    console.log('\n🚦 Validation Gates:');
    Object.entries(prdData.technical_requirements.validation_gates).forEach(([step, desc]) => {
      console.log(`  ${step}: ${desc}`);
    });
    
    console.log('\n✅ PLAN Phase Progress: 50% complete');
    console.log('📝 Next: Complete technical specifications and handoff to EXEC');
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

// Execute
createSDIPPRD();