#!/usr/bin/env node

/**
 * Create SD-VENTURE-ARCHETYPES-001: Configurable Venture Archetypes & Artisanal Automation Philosophy
 * Target Application: EHG (business app)
 * Database: liapbndqlqxdcgpwntbv (EHG Supabase)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('Creating SD-VENTURE-ARCHETYPES-001: Configurable Venture Archetypes & Artisanal Automation Philosophy...\n');

  const sdData = {
    id: 'SD-VENTURE-ARCHETYPES-001',
    sd_key: 'SD-VENTURE-ARCHETYPES-001',
    title: 'Configurable Venture Archetypes & Artisanal Automation Philosophy',
    description: `Enable users to configure venture "archetypes" (personality presets) from settings page that influence venture creation, UI theming, workflow emphasis, and value proposition framing. Primary archetype: "Artisanal Automation" - ventures that feel personal and handmade but are fully automated, using primitive functionality as style guide for contemporary design. Archetypes are multi-dimensional, affecting: (1) UI/UX visual aesthetic, (2) type of venture pursued, (3) customer pain points addressed, (4) value provided to customers. Examples: beach bar using natural materials styled like NYC penthouse bar; world-renowned chef using local ingredients for beautifully presented meals.`,

    status: 'draft',
    priority: 'high',
    category: 'Venture Management',

    target_application: 'EHG',

    strategic_intent: 'Enable personalized venture creation experiences that balance artisanal aesthetics with automated execution',

    rationale: `Current venture creation offers industry categories but no "personality" or philosophical framework. Users cannot express preferences for ventures that balance handcrafted feel with modern automation. Archetypes provide:

1. **Strategic Guidance**: Help users articulate venture philosophy (e.g., "Artisanal Automation" guides toward local materials + premium presentation)
2. **Visual Identity**: Archetype-driven theming creates cohesive aesthetic across venture UI
3. **Value Framing**: Templates for customer pain points and value propositions aligned with archetype philosophy
4. **Workflow Emphasis**: Different archetypes highlight different stages (craft vs. scale vs. innovation)
5. **Differentiation**: Ventures feel unique and intentional, not generic

Artisanal Automation specifically addresses growing market trend: consumers crave authenticity and craftsmanship while expecting modern convenience. Think: local brewery with artisan branding but automated ordering/delivery; boutique hotel with handcrafted furniture but AI concierge.`,

    scope: {
      included: [
        'Settings page UI for archetype management (CRUD operations)',
        'Archetype schema: name, description, visual_theme, workflow_emphasis, value_proposition_template',
        'Database storage for company-wide archetype definitions',
        'Archetype selector step in venture creation flow (VentureCreationDialog.tsx)',
        '5 default archetypes: Artisanal Automation, Tech Minimalist, Luxury Essentials, Sustainable Innovation, Cultural Fusion',
        'Archetype-driven visual theming system (colors, typography, spacing)',
        'Archetype metadata stored in venture.metadata.archetype',
        'Archetype preview in settings (visual mockup of theme)',
        'Archetype-driven workflow stage emphasis (UI highlighting)',
        'Archetype-aligned value proposition templates',
        'EVA integration for archetype-aware venture validation',
        'Mobile responsive design for archetype selection',
        'RLS policies for company-scoped archetypes',
        'Default archetype fallback (if none selected)',
        'Archetype deletion handling (ventures retain archetype snapshot)'
      ],
      excluded: [
        'AI-generated archetype recommendations (phase 2)',
        'Industry-specific archetype templates (focus on philosophy-based)',
        'Archetype marketplace or sharing between companies',
        'Real-time theme previewing during venture creation (static preview only)',
        'Archetype-driven financial modeling (separate SD)',
        'Workflow automation rules based on archetype (phase 2)',
        'Chairman decision-making influenced by archetype (separate system)'
      ],
      database_changes: {
        new_tables: ['venture_archetypes'], // company-scoped archetype definitions
        new_views: [],
        modified_tables: ['ventures'], // metadata.archetype field
        leverage_existing: ['ventures.metadata', 'companies', 'users']
      }
    },

    strategic_objectives: [
      'Enable settings-based configuration of venture archetypes (no code changes for new archetypes)',
      'Implement "Artisanal Automation" archetype as exemplar (primitive + premium)',
      'Multi-dimensional archetype influence: UI theme + workflow emphasis + value framing',
      'Archetype selection integrated seamlessly into venture creation flow',
      'Visual theming system applies archetype aesthetic to venture UI',
      'Settings page archetype management achieves <200ms CRUD operations',
      '80% of users select an archetype during venture creation within 4 weeks'
    ],

    success_criteria: [
      '100% of ventures can have archetype assigned (default or custom)',
      'Settings page supports CRUD for archetypes (create, edit, delete, preview)',
      'Archetype selector step in VentureCreationDialog is intuitive (<30s decision time)',
      'Visual theming changes are perceivable (colors, fonts, spacing reflect archetype)',
      'Workflow emphasis highlights archetype-relevant stages (e.g., "craft" stages for Artisanal)',
      'Value proposition templates pre-populate based on archetype selection',
      'Archetype changes in settings do NOT break existing ventures (snapshot model)',
      'RLS policies prevent cross-company archetype access',
      'Mobile archetype selection UI is responsive and usable',
      '5 default archetypes feel distinct and cover major philosophies'
    ],

    key_principles: [
      'SETTINGS-FIRST: Archetype management happens in settings, NOT hardcoded',
      'MULTI-DIMENSIONAL: Archetypes affect visuals + workflow + value framing, not just aesthetics',
      'SNAPSHOT MODEL: Ventures store archetype snapshot (immune to archetype edits/deletes)',
      'EXTENSIBILITY: Schema supports custom archetype properties beyond defaults',
      'SIMPLICITY IN DEFAULTS: 5 archetypes cover 80% of use cases, custom for remaining 20%',
      'ARTISANAL AUTOMATION EXEMPLAR: Primary archetype demonstrates primitive + premium philosophy'
    ],

    implementation_guidelines: [
      'Phase 1: Settings Page Infrastructure (4-6 hours)',
      '  - Analyze existing settings page structure and patterns',
      '  - Create venture_archetypes database table (company_id, name, description, theme_config JSONB)',
      '  - Build ArchetypeManagement.tsx settings component (CRUD UI)',
      '  - Add RLS policies (company-scoped access)',
      '  - Seed 5 default archetypes',
      '',
      'Phase 2: Archetype Schema & Data Model (3-4 hours)',
      '  - Define archetype JSONB structure (visual_theme, workflow_emphasis, value_templates)',
      '  - Create React hooks: useVentureArchetypes(), useArchetypeTheme()',
      '  - Design snapshot model (ventures store archetype copy, not FK)',
      '  - Plan fallback behavior (no archetype selected)',
      '',
      'Phase 3: Venture Creation Integration (4-5 hours)',
      '  - Add archetype selection step to VentureCreationDialog.tsx',
      '  - Create ArchetypeSelector.tsx component (visual cards with previews)',
      '  - Store selected archetype in venture.metadata.archetype',
      '  - Add archetype context to form (influence category, value prop suggestions)',
      '',
      'Phase 4: Visual Theming System (5-7 hours)',
      '  - Design archetype theme schema (colors, typography, spacing)',
      '  - Implement Artisanal Automation theme (earthy colors, serif fonts, organic spacing)',
      '  - Create VentureThemeProvider.tsx (applies archetype theme)',
      '  - Add theme preview to settings (ArchetypePreviewCard.tsx)',
      '  - Test theme application on venture detail page, workflow views',
      '',
      'Phase 5: Workflow & Value Proposition Alignment (3-4 hours)',
      '  - Design workflow_emphasis schema (stage weights for archetype)',
      '  - Highlight emphasized stages in workflow UI (visual indicators)',
      '  - Create value proposition templates per archetype',
      '  - Integrate templates into venture creation form (suggestions)',
      '',
      'Phase 6: Testing & Refinement (2-3 hours)',
      '  - Test archetype CRUD in settings (create, edit, delete)',
      '  - Test venture creation with each archetype',
      '  - Verify theming applies correctly',
      '  - Test archetype deletion (existing ventures retain snapshot)',
      '  - Mobile responsive validation',
      '  - RLS policy testing (multi-company scenarios)'
    ],

    dependencies: [
      'EXISTING settings page infrastructure (src/pages/SettingsPage.tsx or similar)',
      'EXISTING venture creation dialogs (VentureCreationDialog.tsx, CreateVentureDialog.tsx)',
      'EXISTING ventures.metadata JSONB field',
      'EXISTING Tailwind CSS + design system',
      'EXISTING React Query hooks pattern',
      'EXISTING Supabase RLS policies',
      'Shadcn UI components (already installed)',
      'Supabase client (already configured)'
    ],

    risks: [
      {
        description: 'Archetype theming may conflict with existing dark/light mode toggle',
        mitigation: 'Design archetype themes as overlays on base theme; test both modes',
        severity: 'medium',
        probability: 0.4
      },
      {
        description: 'Settings page may not exist or may lack extensibility for new sections',
        mitigation: 'Prompt 1 will discover settings infrastructure; create if missing',
        severity: 'medium',
        probability: 0.3
      },
      {
        description: 'Archetype influence may be too subtle (users don\'t perceive value)',
        mitigation: 'Make visual theming bold; add explicit "Your archetype: X" badges',
        severity: 'low',
        probability: 0.3
      },
      {
        description: 'Snapshot model may cause confusion (user edits archetype, ventures unchanged)',
        mitigation: 'Clear messaging: "Changes affect new ventures only"; offer bulk update tool',
        severity: 'low',
        probability: 0.2
      }
    ],

    success_metrics: [
      'Archetype CRUD operations: 100% success rate in settings',
      'Archetype selection rate: 80%+ of ventures have archetype assigned',
      'Theme perception: User survey shows 90%+ can identify archetype by visual theme',
      'Settings page load time: <500ms with 20+ custom archetypes',
      'Venture creation flow: Archetype step adds <30s to total time',
      'Default archetype coverage: 80% of users satisfied with 5 defaults (don\'t need custom)'
    ],

    metadata: {
      created_by: 'User brainstorm + PLAN Agent - Codebase Analysis',
      sequence_rank: 25,
      sub_agents_required: [
        'Senior Design Sub-Agent (UI/UX for settings page, archetype selector, theming)',
        'Principal Database Architect (archetype schema, snapshot model, RLS)',
        'QA Engineering Director (testing strategy for theming, settings CRUD)',
        'Performance Engineering Lead (theme application performance)',
        'Principal Systems Analyst (settings page infrastructure discovery)'
      ],
      acceptance_testing_required: true,
      database_changes: true, // venture_archetypes table
      estimated_effort: '21-29 hours (~3-4 sprints)',
      code_reuse_percentage: 70, // Reuse settings patterns, venture creation flow, metadata storage

      // User's vision and examples
      user_vision: {
        primary_concept: 'Artisanal Automation - ventures feel personal/handmade but fully automated',
        design_philosophy: 'Primitive functionality as style guide for contemporary/modern architecture',
        influences: [
          'UI/UX visual aesthetic',
          'Type of venture pursued (business model)',
          'Customer pain points addressed',
          'Value provided to customers'
        ],
        examples: [
          {
            scenario: 'Beach bar',
            primitive_elements: 'Natural, locally sourced building materials',
            modern_execution: 'Styled like high-end NYC penthouse bar',
            result: 'World-renowned destination balancing local authenticity with premium experience'
          },
          {
            scenario: 'Restaurant',
            primitive_elements: 'Locally grown and sourced ingredients',
            modern_execution: 'Beautifully presented meals by world-renowned chef',
            result: 'Unique palate experience combining local terroir with culinary artistry'
          }
        ]
      },

      // 5 comprehensive prompts for analysis
      analysis_prompts: [
        {
          prompt_id: 1,
          title: 'Settings Page Infrastructure Analysis',
          purpose: 'Understand how to add archetype configuration to settings',
          questions: [
            'Locate settings page components and routing',
            'Identify existing configuration patterns (company settings, user preferences)',
            'Find data storage for settings (database tables, metadata fields)',
            'Examine UI patterns for CRUD operations in settings',
            'Check for existing "templates" or "presets" systems to align with',
            'Document settings page authorization/RLS patterns',
            'Identify gaps: What infrastructure is missing for archetype management?'
          ],
          deliverable: 'Settings page integration strategy showing exactly where/how archetype management fits'
        },
        {
          prompt_id: 2,
          title: 'Archetype Schema & Database Design',
          purpose: 'Define data structure for configurable archetypes',
          questions: [
            'Review existing metadata usage in ventures table',
            'Analyze venture type/category structures for alignment opportunities',
            'Define archetype schema: name, description, visual_theme, workflow_emphasis, value_proposition_template',
            'Determine storage approach: new table vs. company metadata vs. venture metadata',
            'Identify which archetype properties are company-wide vs. venture-specific',
            'Check for existing "template" or "preset" database patterns to reuse',
            'Design multi-dimensional influence model (UI theme, workflow stages, value framing)',
            'Plan default archetypes vs. custom archetype capabilities'
          ],
          deliverable: 'Database schema with clear distinction between archetype definitions (settings) and instances (ventures)'
        },
        {
          prompt_id: 3,
          title: 'Venture Creation Integration & UX Flow',
          purpose: 'Design user experience for applying archetypes during venture creation',
          questions: [
            'Review VentureCreationDialog.tsx and CreateVentureDialog.tsx current flows',
            'Identify optimal insertion point for archetype selection step',
            'Design archetype selector UI (cards, dropdown, visual preview)',
            'Plan how archetype selection influences subsequent form fields',
            'Check EVA validation system compatibility with archetypes',
            'Design preview/explanation of how archetype affects venture',
            'Handle edge cases: no archetypes configured, archetype deleted after venture created',
            'Ensure mobile responsiveness for archetype selection'
          ],
          deliverable: 'UX flow diagram showing archetype selection integrated into venture creation'
        },
        {
          prompt_id: 4,
          title: 'Archetype-Driven Visual Theming System',
          purpose: 'Implement visual influence of archetypes on UI/UX',
          questions: [
            'Analyze existing Tailwind/CSS theming infrastructure',
            'Define "Artisanal Automation" visual language: colors, typography, spacing, component styles',
            'Plan theme application scope: venture detail page only vs. dashboard-wide vs. workflow views',
            'Review existing dark/light mode switching for pattern reuse',
            'Design theme preview system in settings (show visual impact of archetype)',
            'Check for design system documentation or component library to align with',
            'Plan performance: CSS variables, dynamic classes, or pre-compiled themes',
            'Define 4-5 archetype theme examples (Artisanal Automation, Tech Minimalist, etc.)'
          ],
          deliverable: 'Theming architecture showing how archetype selection changes visual presentation'
        },
        {
          prompt_id: 5,
          title: 'Workflow & Value Proposition Alignment',
          purpose: 'Extend archetype influence beyond visuals to business logic',
          questions: [
            'Review existing workflow stages and WORKFLOW_STAGES constants',
            'Design how archetypes emphasize different workflow stages (e.g., Artisanal Automation emphasizes "craft" stages)',
            'Examine value proposition templates or business model canvas integration',
            'Plan archetype-driven suggestions for customer pain points and value provided',
            'Check for existing AI/EVA integration points for archetype-aware recommendations',
            'Review stage progression logic for archetype-specific guidance',
            'Analyze chairman feedback system for archetype-aligned coaching',
            'Design archetype-driven metrics and success criteria templates'
          ],
          deliverable: 'Business logic integration showing how archetypes guide strategic decisions beyond aesthetics'
        }
      ],

      target_application_context: {
        implementation_path: '/mnt/c/_EHG/ehg/',
        database: 'liapbndqlqxdcgpwntbv',
        github_repo: 'rickfelix/ehg.git',
        port: 8080,
        critical_check: 'MUST verify pwd shows /mnt/c/_EHG/ehg before ANY code changes!'
      },

      // Codebase context from initial exploration
      initial_codebase_findings: {
        venture_creation_dialogs: {
          VentureCreationDialog: {
            location: '/mnt/c/_EHG/ehg/src/components/ventures/VentureCreationDialog.tsx',
            lines: 365,
            capabilities: [
              'EVA validation (calculateEVAQualityScore)',
              'Category selection from predefined list',
              'Voice capture for descriptions',
              'Chairman feedback display',
              'Metadata storage (assumptions, successCriteria, stage1_complete)'
            ],
            gap: 'NO archetype selection step exists',
            integration_point: 'Add archetype selector before category selection or after description'
          },
          CreateVentureDialog: {
            location: '/mnt/c/_EHG/ehg/src/components/ventures/CreateVentureDialog.tsx',
            lines: 191,
            capabilities: [
              'Simpler creation flow',
              'Basic form data (name, description, industry, stage)'
            ],
            gap: 'Also lacks archetype system',
            integration_point: 'Add archetype as optional field'
          }
        },
        venture_types: {
          location: '/mnt/c/_EHG/ehg/src/types/venture.ts',
          metadata_field: 'metadata: Record<string, any>',
          extensibility: 'HIGHLY EXTENSIBLE - can store archetype snapshot',
          current_usage: 'Stores assumptions, successCriteria, stage1_complete',
          proposed_addition: 'metadata.archetype = { id, name, theme_config, workflow_emphasis, value_templates }'
        },
        web_research_validation: {
          findings: [
            'AI as creative collaborator, not replacement (UX design trend)',
            'Artisanal value in AI age - consumers crave authenticity',
            'Backend automation with frontend focus - human-centered design',
            'Balancing efficiency and craftsmanship is recognized design philosophy'
          ],
          conclusion: 'Artisanal Automation is validated market trend with existing design precedents'
        }
      }
    }
  };

  // Insert SD into database
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating SD:', error);
    process.exit(1);
  }

  console.log('✅ SD-VENTURE-ARCHETYPES-001 Created Successfully!\n');
  console.log('📋 Strategic Directive Details:');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Status:', data.status);
  console.log('   Priority:', data.priority);
  console.log('   Target Application:', data.target_application);
  console.log('   Estimated Effort:', data.metadata.estimated_effort);
  console.log('   Code Reuse:', data.metadata.code_reuse_percentage + '%');
  console.log('\n🎯 Key Concept: Artisanal Automation');
  console.log('   Philosophy: Primitive functionality as style guide for contemporary design');
  console.log('   Influence: UI/UX + Venture Type + Pain Points + Value Provided');
  console.log('   Primary Feature: Settings-based archetype configuration');
  console.log('\n📍 User Vision Examples:');
  console.log('   • Beach bar: Natural materials + NYC penthouse style = World-renowned destination');
  console.log('   • Restaurant: Local ingredients + Culinary artistry = Unique palate experience');
  console.log('\n🔍 5 Comprehensive Analysis Prompts:');
  console.log('   1. Settings Page Infrastructure Analysis');
  console.log('   2. Archetype Schema & Database Design');
  console.log('   3. Venture Creation Integration & UX Flow');
  console.log('   4. Archetype-Driven Visual Theming System');
  console.log('   5. Workflow & Value Proposition Alignment');
  console.log('\n📍 CRITICAL: Implementation Target');
  console.log('   Application: EHG (/mnt/c/_EHG/ehg/)');
  console.log('   Database: liapbndqlqxdcgpwntbv');
  console.log('   GitHub: rickfelix/ehg.git');
  console.log('\n🚀 Next Steps:');
  console.log('   1. Execute 5 analysis prompts to enhance SD with comprehensive codebase findings');
  console.log('   2. LEAD review and approval');
  console.log('   3. PLAN creates comprehensive PRD');
  console.log('   4. EXEC implements in /mnt/c/_EHG/ehg/ (NOT EHG_Engineer!)');
}

createStrategicDirective().catch(console.error);
