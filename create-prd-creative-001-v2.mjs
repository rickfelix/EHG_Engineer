import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 PLAN: Creating PRD for SD-CREATIVE-001 Phase 1\n');

  const prd = {
    id: 'PRD-SD-CREATIVE-001-PHASE1',
    directive_id: 'SD-CREATIVE-001',
    title: 'AI Video Prompt Generator - Phase 1 Implementation',
    version: '1.0',
    status: 'approved',
    category: 'technical',
    priority: 'high',

    executive_summary: `Implement an AI-powered video prompt generator that transforms venture data into optimized prompts for Sora 2, Runway, and Kling video platforms. Phase 1 focuses on prompt generation with manual copy-paste workflow, validating demand before investing in API automation (Phase 2).

Core Value: Enable non-technical users to create professional video ad prompts in seconds
Scope: 30 development hours over 2-3 weeks
Success Gate: >50% usage validates Phase 2 investment`,

    business_context: `Problem: Venture teams need professional video advertisements but lack video production expertise and budget for agencies.

Target Users:
- Venture managers
- Marketing teams
- Founders without video experience

Success Criteria:
- Generate prompts for 20+ ventures in first 90 days
- 50%+ of generated prompts actually used on video platforms
- Positive user feedback on prompt quality
- Clear data for Phase 2 go/no-go decision

Out of Scope:
- Direct API integration with video platforms (Phase 2)
- Video generation/hosting (use external platforms)
- A/B testing framework (Phase 2)
- Custom ML models (use GPT-4)`,

    technical_context: `Architecture:
- Database: PostgreSQL (Supabase) with video_prompts table
- Backend: Supabase Edge Function with GPT-4 integration
- Frontend: React/TypeScript components with ShadCN UI
- AI: OpenAI GPT-4 for prompt generation

Integration Points:
- Existing ventures database (venture_id FK)
- OpenAI API for prompt generation
- User authentication (auth.users)

Technology Stack:
- Supabase Edge Functions (Deno runtime)
- OpenAI GPT-4 API
- React with TypeScript
- ShadCN UI components
- PostgreSQL with RLS policies`,

    functional_requirements: [
      {
        id: 'FR-001',
        title: 'Venture-to-Prompt Generation',
        description: 'Transform venture data into platform-optimized video prompts',
        priority: 'CRITICAL',
        user_story: 'As a venture manager, I want to generate video prompts from my venture data so that I can create professional video ads without expertise',
        acceptance_criteria: [
          'Select venture from dropdown',
          'Choose from 4 templates: product_demo, testimonial, feature_highlight, brand_story',
          'Customize tone (4 options), duration (3 options), style (3 options)',
          'Prompts generated in <10 seconds',
          'Receive 3 prompts for each platform (Sora, Runway, Kling)'
        ]
      },
      {
        id: 'FR-002',
        title: 'Clipboard Copy Functionality',
        description: 'One-click copy prompts to clipboard for use on external platforms',
        priority: 'CRITICAL',
        user_story: 'As a user, I want to copy prompts to clipboard so that I can paste them into Sora/Runway/Kling platforms',
        acceptance_criteria: [
          'One-click copy button for each prompt',
          'Visual confirmation of copy action',
          'Prompts formatted ready for platform use',
          'No manual editing required'
        ]
      },
      {
        id: 'FR-003',
        title: 'Dual Integration UI',
        description: 'Access prompt generation from both standalone page and venture details',
        priority: 'HIGH',
        user_story: 'As a user, I want to access prompt generation from venture details so that I have contextual access without leaving my workflow',
        acceptance_criteria: [
          '"Generate Ad Prompts" button visible on venture detail page',
          'Quick template selector in side panel',
          'Shows 3 most recent prompts',
          'Link to full prompt studio for advanced features'
        ]
      },
      {
        id: 'FR-004',
        title: 'Usage Tracking',
        description: 'Track which prompts were used and their performance',
        priority: 'HIGH',
        user_story: 'As a user, I want to track which prompts I used so that I can remember what worked and provide feedback',
        acceptance_criteria: [
          'Mark prompt as "used" with checkbox',
          'Select which platform it was used on',
          'Add performance notes (optional text field)',
          'Rate prompt quality 1-5 stars (optional)',
          'Usage data visible in prompt library'
        ]
      },
      {
        id: 'FR-005',
        title: 'Prompt Library',
        description: 'View and search all generated prompts',
        priority: 'MEDIUM',
        user_story: 'As a user, I want to see all my generated prompts so that I can reuse successful patterns',
        acceptance_criteria: [
          'Prompt library shows all prompts for my ventures',
          'Filter by venture, template, platform, used/unused',
          'Sort by date, rating, usage',
          'Search by text content'
        ]
      },
      {
        id: 'FR-006',
        title: 'Usage Analytics Dashboard',
        description: 'Admin dashboard for Phase 2 decision metrics',
        priority: 'MEDIUM',
        user_story: 'As an admin, I want to see usage analytics so that I can make Phase 2 go/no-go decision',
        acceptance_criteria: [
          'Dashboard shows: total prompts generated, % prompts used, platform breakdown',
          'Identifies most popular templates and tones',
          'Shows user engagement trends over time',
          'Clear metric: % ventures using feature'
        ]
      }
    ],

    technical_requirements: [
      {
        id: 'TR-001',
        title: 'Database Schema',
        description: 'Create video_prompts table with RLS policies',
        priority: 'CRITICAL',
        details: `CREATE TABLE video_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  template_type VARCHAR(50) NOT NULL,
  tone VARCHAR(50) NOT NULL,
  duration VARCHAR(10) NOT NULL,
  style VARCHAR(50) NOT NULL,
  sora_prompt TEXT,
  runway_prompt TEXT,
  kling_prompt TEXT,
  used BOOLEAN DEFAULT false,
  platform_used VARCHAR(50),
  performance_notes TEXT,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`
      },
      {
        id: 'TR-002',
        title: 'Supabase Edge Function',
        description: 'Create generate-video-prompts Edge Function with GPT-4',
        priority: 'CRITICAL',
        details: 'Function name: generate-video-prompts\nInput: { ventureId, template, tone, platforms, duration, style }\nOutput: { sora_prompt, runway_prompt, kling_prompt }\nIntegration: OpenAI GPT-4 API\nError handling: Retry logic, fallback responses'
      },
      {
        id: 'TR-003',
        title: 'React Components',
        description: 'Build 5 core React components',
        priority: 'HIGH',
        details: 'Components: VideoPromptStudio, VenturePromptPanel, PromptCard, PromptLibrary, PromptConfigPanel\nTechnology: React + TypeScript + ShadCN UI\nState Management: React Query for server state\nRouting: Integrate with existing app router'
      }
    ],

    ui_ux_requirements: [
      {
        id: 'UX-001',
        title: 'Standalone Prompt Studio Page',
        description: 'Full-featured prompt generation interface',
        wireframe: '/creative-media-automation',
        components: ['VideoPromptStudio', 'PromptConfigPanel', 'PromptResultsGrid']
      },
      {
        id: 'UX-002',
        title: 'Venture Detail Integration',
        description: 'Quick prompt generation panel in venture details',
        wireframe: '/ventures/:id (side panel)',
        components: ['VenturePromptPanel', 'PromptCard (compact)']
      },
      {
        id: 'UX-003',
        title: 'Prompt Library View',
        description: 'Browse and search historical prompts',
        wireframe: '/creative-media-automation/library',
        components: ['PromptLibrary', 'PromptCard', 'FilterBar']
      }
    ],

    implementation_approach: `Week 1: Database & Backend (12h)
- Create video_prompts table migration
- Set up RLS policies and indexes
- Build Supabase Edge Function scaffold
- Integrate GPT-4 API with template system
- Platform-specific prompt optimization logic
- Unit tests for Edge Function

Week 2: Frontend Components (13h)
- Build VideoPromptStudio component (standalone)
- Create VenturePromptPanel (integrated)
- Implement PromptCard with clipboard copy
- Add PromptLibrary with filters
- Build PromptConfigPanel (selectors)
- Integrate with ventures data

Week 3: Testing & Polish (5h)
- Integration testing with real GPT-4
- Manual testing with 10 sample ventures
- UX refinements based on testing
- Analytics dashboard (basic metrics)
- User documentation
- Deploy to staging`,

    test_scenarios: [
      {
        id: 'TS-001',
        title: 'Unit Tests - Edge Function',
        tests: [
          'GPT-4 API integration with mock responses',
          'Error handling (API failures, invalid inputs)',
          'Platform-specific prompt formatting',
          'Template system logic'
        ]
      },
      {
        id: 'TS-002',
        title: 'Integration Tests',
        tests: [
          'End-to-end: Generate prompt → Save to DB → Retrieve in UI',
          'Venture context: Correct data passed to GPT-4',
          'Multi-platform: All 3 prompts generated',
          'Clipboard: Copy function works across browsers'
        ]
      },
      {
        id: 'TS-003',
        title: 'Manual Tests',
        tests: [
          'UX Flow: Standalone page → Select venture → Generate → Copy → Use on Sora.com',
          'UX Flow: Venture detail → Quick generate → Copy to Runway',
          'Prompt Quality: 10 test ventures, verify prompts are usable',
          'Performance: Generate prompts for 20 ventures in one session'
        ]
      }
    ],

    acceptance_criteria: [
      'All 6 user stories implemented and tested',
      'Database migration applied successfully',
      'Edge Function deployed and tested with real GPT-4',
      'Prompt generation <10s end-to-end',
      'Clipboard copy works in Chrome, Safari, Firefox',
      'RLS policies enforce venture ownership',
      'Design sub-agent UX review passed',
      'Manual testing completed with 10 ventures',
      'Analytics dashboard shows key metrics'
    ],

    performance_requirements: {
      prompt_generation: '<10s end-to-end',
      page_load: '<2s for prompt library',
      database_query: '<500ms for prompt history',
      gpt4_api: '<8s response time (with retries)',
      uptime: '95% availability'
    },

    plan_checklist: [
      { task: 'Create database migration script', status: 'pending', owner: 'PLAN' },
      { task: 'Spec Edge Function requirements', status: 'pending', owner: 'PLAN' },
      { task: 'Design component architecture', status: 'pending', owner: 'PLAN' },
      { task: 'Trigger Design sub-agent for UX review', status: 'pending', owner: 'PLAN' },
      { task: 'Create PLAN→EXEC handoff', status: 'pending', owner: 'PLAN' }
    ],

    exec_checklist: [
      { task: 'Apply database migration', status: 'pending', owner: 'EXEC' },
      { task: 'Build Supabase Edge Function', status: 'pending', owner: 'EXEC' },
      { task: 'Implement React components', status: 'pending', owner: 'EXEC' },
      { task: 'Integration testing', status: 'pending', owner: 'EXEC' },
      { task: 'Deploy to staging', status: 'pending', owner: 'EXEC' }
    ],

    validation_checklist: [
      { task: 'Verify all acceptance criteria met', status: 'pending', owner: 'PLAN' },
      { task: 'Test with 10 real ventures', status: 'pending', owner: 'PLAN' },
      { task: 'Collect user feedback', status: 'pending', owner: 'PLAN' },
      { task: 'Validate Phase 2 go/no-go metrics', status: 'pending', owner: 'PLAN' }
    ],

    risks: [
      {
        risk: 'GPT-4 generates low-quality prompts',
        impact: 'HIGH',
        probability: 'LOW',
        mitigation: 'Template refinement, human review loop, collect user ratings'
      },
      {
        risk: 'Users find manual copy-paste tedious',
        impact: 'MEDIUM',
        probability: 'MEDIUM',
        mitigation: 'Streamline UX, communicate Phase 2 automation roadmap'
      },
      {
        risk: 'Platform prompt formats change',
        impact: 'LOW',
        probability: 'MEDIUM',
        mitigation: 'Template versioning system, easy updates via database'
      }
    ],

    dependencies: [
      { name: 'OpenAI GPT-4 API', type: 'external', status: 'available', notes: 'Already integrated' },
      { name: 'Supabase Edge Functions', type: 'external', status: 'available', notes: 'Platform ready' },
      { name: 'Ventures database schema', type: 'internal', status: 'available', notes: 'Existing table' },
      { name: 'Design sub-agent UX review', type: 'internal', status: 'pending', notes: 'Required before EXEC' },
      { name: 'Database migration approval', type: 'internal', status: 'pending', notes: 'PLAN to create' }
    ],

    phase: 'planning',
    progress: 0,
    phase_progress: {
      planning: 80,  // This PRD creation
      execution: 0,
      validation: 0
    },

    created_by: 'PLAN',
    metadata: {
      total_hours: 30,
      weeks: 3,
      team: ['PLAN (this PRD)', 'EXEC (implementation)', 'Design sub-agent (UX review)'],
      success_gate: '>50% usage validates Phase 2 investment',
      phase_2_hours: 60,
      phase_2_conditional: 'Only if Phase 1 usage >50%'
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

  console.log('✅ PRD Created Successfully\n');
  console.log('PRD ID:', data[0].id);
  console.log('Title:', data[0].title);
  console.log('\n📊 PRD Summary:');
  console.log('  Scope: Phase 1 - AI Video Prompt Generator');
  console.log('  Hours: 30h over 3 weeks');
  console.log('  Functional Requirements: 6 (4 critical/high priority)');
  console.log('  Technical Requirements: 3 critical components');
  console.log('  Database: video_prompts table with RLS');
  console.log('  Backend: Supabase Edge Function + GPT-4');
  console.log('  Frontend: 5 React components');
  console.log('  Success Gate: >50% usage validates Phase 2');

  console.log('\n🎯 Next Steps:');
  console.log('  1. Trigger Design sub-agent for UX review');
  console.log('  2. Create database migration script');
  console.log('  3. Create PLAN→EXEC handoff');
  console.log('  4. Begin implementation in /mnt/c/_EHG/ehg/');

  return data[0];
}

createPRD();
