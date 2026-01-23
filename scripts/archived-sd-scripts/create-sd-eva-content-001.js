#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-EVA-CONTENT-001
 * EVA Content Catalogue & Dynamic Presentation System MVP
 *
 * Build a content catalogue of things EVA can present with configurable layouts,
 * version control, and conversation recording integration.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createEVAContentSD() {
  console.log('🎨 Creating Strategic Directive: EVA Content Catalogue & Dynamic Presentation System');
  console.log('===================================================================================\n');

  const strategicDirective = {
    id: 'SD-EVA-CONTENT-001',
    sd_key: 'SD-EVA-CONTENT-001',
    title: 'EVA Content Catalogue & Dynamic Presentation System MVP',
    description: `Build a dynamic content management and presentation system integrated with EVA that combines:
    - Multi-modal presentation capabilities (presentation, spreadsheet, document, flowchart views)
    - Content type system with creation workflows and display logic
    - Configurable layouts with intelligent rendering rules
    - Version-controlled content catalogue in database
    - Conversation-aware content linking EVA interactions to catalogue items
    - Interactive canvas with pan/zoom controls

    MVP focuses on foundational architecture with 3 content types (text, table, chart), one layout mode
    (presentation), and basic EVA integration. This establishes the platform for future expansion.`,
    priority: 'high',
    status: 'draft',
    category: 'AI Platform Enhancement',
    rationale: `EVA currently generates responses but lacks structured content persistence and presentation capabilities.
    Users need to:
    (1) Ask EVA to create presentations/reports/analyses and have them saved
    (2) Switch between different view modes (spreadsheet for analysis, presentation for meetings)
    (3) Track version history of content with rollback capability
    (4) Link EVA conversations to the content they produce for context
    (5) Pan/zoom through content like a canvas for better navigation

    This creates a "Notion + Airtable + Miro + PowerPoint" experience, all integrated with EVA AI.`,
    scope: `MVP (4-6 weeks):
    - Content catalogue database (3 content types: text_block, data_table, chart)
    - Version history (create/retrieve, linear history only)
    - Presentation layout engine with pan/zoom
    - EVA conversation recording and content linking
    - Basic settings panel for layout preferences
    - E2E test: "EVA, create a pitch deck" → Full presentation generated

    Excludes (Future Phases):
    - Multi-modal views (spreadsheet, document, flowchart modes) → SD-EVA-CONTENT-002
    - Advanced version control (branching/merging) → SD-EVA-CONTENT-003
    - Custom content types and extensibility → SD-EVA-CONTENT-004
    - Collaborative editing → SD-EVA-CONTENT-005`,
    strategic_objectives: `1. FOUNDATION: Design and implement 9-table database schema for content catalogue, versions, layouts, conversations, and metadata
2. CONTENT TYPES: Implement 3 foundational content types with creation methods and display rules:
   - Text Block: Rich text/markdown with formatting
   - Data Table: Structured rows/columns with basic formulas
   - Chart: Visualization (bar, line, pie) from data
3. VERSIONING: Build version history service with create/retrieve/rollback capabilities (linear history)
4. PRESENTATION: Deploy layout engine rendering content in presentation mode with slide transitions
5. CANVAS: Implement interactive pan/zoom controller using react-zoom-pan-pinch
6. EVA INTEGRATION: Enable EVA to create content via conversation, store in catalogue, link to conversation
7. CONVERSATION: Record all EVA conversations with context and content references
8. SETTINGS: Create user settings panel for layout preferences and default views
9. E2E VALIDATION: Comprehensive test suite proving: "EVA creates presentation → User views → User rolls back version"`,
    success_criteria: [
      'Database schema deployed with all 9 tables, indexes, RLS policies, foreign keys',
      'All 3 content types (text, table, chart) functional: create, display, validate, transform',
      'Version history tracks every change with full rollback capability',
      'Presentation layout renders all 3 content types with proper styling and transitions',
      'Pan/zoom canvas allows smooth navigation (pinch, mouse wheel, drag)',
      'EVA creates content items via conversation and links them to conversation_id',
      'Conversation viewer shows transcript with highlighted content references',
      'Settings panel allows users to configure default layouts per content type',
      'E2E test passes: User asks "EVA, create pitch deck for Q4 ventures" → EVA generates 5-slide presentation with title, metrics chart, data table, roadmap, summary → User can pan/zoom, view version history, rollback to previous version',
      'Performance: Content catalogue loads <500ms, version retrieval <200ms, canvas pan/zoom 60fps'
    ],
    key_principles: `1. DATABASE-FIRST: All content in database, no markdown files
2. VERSION EVERYTHING: Immutable version history, no data loss
3. CONVERSATION-AWARE: Every content item linked to originating conversation
4. SIMPLICITY IN MVP: 3 content types, 1 layout mode, linear versioning (expand later)
5. PERFORMANCE: Lazy loading, viewport culling, caching for large catalogues
6. EXTENSIBLE: Architecture supports future content types and layout modes without refactoring`,
    implementation_guidelines: `PHASE 1 - Database Foundation (Week 1):
- Create migration file: database/migrations/20251011_eva_content_catalogue_mvp.sql
- Implement 9 tables: content_types, screen_layouts, content_catalogue, content_versions,
  content_layout_assignments, eva_conversations, conversation_content_links, eva_user_settings, content_item_metadata
- Add indexes (GIN on JSONB, B-tree on foreign keys), RLS policies, audit triggers
- Seed with 3 content type definitions and 1 presentation layout template

PHASE 2 - Content Type Services (Week 1-2):
- Build contentCatalogueService.ts (CRUD, versioning)
- Build contentTypeRenderers:
  * TextBlockRenderer.tsx (rich text display with react-markdown)
  * DataTableRenderer.tsx (grid with react-table)
  * ChartRenderer.tsx (recharts integration)
- Build transformationService.ts (convert data between types)

PHASE 3 - Layout Engine & Canvas (Week 2-3):
- Build LayoutEngine.tsx (renders content based on layout template)
- Build CanvasController.tsx (react-zoom-pan-pinch integration)
- Build PresentationMode.tsx (slide deck view with transitions)
- CSS: Pan/zoom animations, slide transitions, responsive breakpoints

PHASE 4 - EVA Integration (Week 3):
- Build evaConversationService.ts (record conversations, link content)
- Extend EVA to recognize "create presentation" intent
- Integrate with contentCatalogueService for content creation
- Build ConversationViewer.tsx (transcript with content links)

PHASE 5 - Settings & E2E (Week 4):
- Build EVASettingsPanel.tsx (layout preferences, default views)
- Build VersionHistoryUI.tsx (timeline, diff viewer, rollback)
- Create E2E tests with Playwright: eva-content-creation.spec.ts
- Performance testing: Load 100 catalogue items, measure latency

PHASE 6 - Polish & Documentation (Week 4):
- Error handling, loading states, offline support
- User documentation: How to use EVA content catalogue
- Admin documentation: Database schema, service architecture`,
    dependencies: `INTERNAL: Supabase database access, EVA assistant integration point, react-zoom-pan-pinch library
EXTERNAL: None (all self-contained)
TECHNICAL: TypeScript 5.x, React 18+, Recharts 2.x, react-table 8.x, react-markdown 9.x`,
    risks: `RISK 1: Canvas performance with large content catalogues (>500 items)
- MITIGATION: Implement virtualization, lazy loading, viewport culling

RISK 2: Version history storage growth (JSONB snapshots accumulate)
- MITIGATION: Archive versions older than 90 days to cold storage, compress JSONB

RISK 3: EVA content generation quality (may produce malformed data)
- MITIGATION: Strict validation schemas, fallback to manual creation, user editing capability

RISK 4: Pan/zoom UX complexity (users may get lost in canvas)
- MITIGATION: Mini-map navigator, "reset view" button, breadcrumb trail

RISK 5: Scope creep into multi-modal views (temptation to add spreadsheet mode early)
- MITIGATION: Strict MVP scope, defer to SD-EVA-CONTENT-002`,
    success_metrics: `BASELINE (before MVP):
- EVA generates text responses, not saved → AFTER: Content saved in catalogue with versions
- No presentation capability → AFTER: Presentation mode with pan/zoom
- No conversation history linked to content → AFTER: Full conversation-content linking

TARGETS:
- Content creation success rate: >95% (EVA creates valid content 95%+ of time)
- Version rollback accuracy: 100% (rollback always restores exact previous state)
- Canvas performance: 60fps pan/zoom with <500 items, 30fps with <1000 items
- Load time: <500ms for catalogue list, <200ms for version retrieval
- User satisfaction: >85% find content catalogue useful in first week
- Adoption: >50% of EVA conversations result in saved content items within 2 weeks

PASS CRITERIA: All 9 success criteria met, E2E test passes, performance targets achieved`,
    metadata: {
      timeline: {
        start_date: null,
        target_completion: '4-6 weeks',
        milestones: [
          'Week 1: Database schema + content type services',
          'Week 2: Layout engine + canvas controller',
          'Week 3: EVA integration + conversation recording',
          'Week 4: Settings panel + E2E tests + polish'
        ]
      },
      business_impact: 'HIGH - Transforms EVA from conversational AI to content creation platform',
      technical_impact: 'Establishes reusable content management infrastructure for all future features',
      related_sds: [],
      technical_details: {
        database_tables: [
          {
            name: 'content_types',
            purpose: 'Define available content types (text, table, chart)',
            estimated_rows: '10-20 (grows slowly as new types added)'
          },
          {
            name: 'screen_layouts',
            purpose: 'Define layout templates (presentation, spreadsheet, document, flowchart)',
            estimated_rows: '10-50 (grows as users create custom layouts)'
          },
          {
            name: 'content_catalogue',
            purpose: 'Central repository of all content items',
            estimated_rows: '1000+ (grows with usage)'
          },
          {
            name: 'content_versions',
            purpose: 'Full version history of every content item',
            estimated_rows: '5000+ (5-10 versions per item average)'
          },
          {
            name: 'content_layout_assignments',
            purpose: 'Link content to layouts with display settings',
            estimated_rows: '2000+ (2 layouts per item average)'
          },
          {
            name: 'eva_conversations',
            purpose: 'Record all EVA conversations',
            estimated_rows: '5000+ (grows with every conversation)'
          },
          {
            name: 'conversation_content_links',
            purpose: 'Link conversations to content they created/discussed',
            estimated_rows: '10000+ (multiple links per conversation)'
          },
          {
            name: 'eva_user_settings',
            purpose: 'User preferences for layouts and views',
            estimated_rows: '100+ (one row per user)'
          },
          {
            name: 'content_item_metadata',
            purpose: 'Meta database per item (tags, relationships, analytics)',
            estimated_rows: '1000+ (one per content item)'
          }
        ],
        content_types_mvp: [
          {
            name: 'text_block',
            creation_method: 'Rich text editor OR AI generation via EVA',
            display_rules: 'Markdown rendering with formatting',
            validation: 'Max 50000 chars, no malicious scripts',
            transformation: 'Can export to plain text, HTML, PDF'
          },
          {
            name: 'data_table',
            creation_method: 'Grid editor OR CSV import OR AI generation',
            display_rules: 'Sortable columns, row selection, basic formulas',
            validation: 'Max 1000 rows × 50 columns, typed columns',
            transformation: 'Can convert to chart, export to CSV/Excel'
          },
          {
            name: 'chart',
            creation_method: 'Chart builder OR AI generation from data',
            display_rules: 'Interactive Recharts (bar, line, pie, area)',
            validation: 'Valid data series, axis labels, legend',
            transformation: 'Can export to PNG/SVG, convert to data table'
          }
        ],
        performance_optimizations: [
          'Lazy load content items (load on-demand, not all at once)',
          'Viewport culling for canvas (only render visible items)',
          'Debounce pan/zoom events (reduce re-render frequency)',
          'Cache version snapshots in memory (LRU cache)',
          'WebSocket for real-time updates (future collaborative editing)',
          'Service worker for offline access (cache catalogue)'
        ]
      },
      resource_requirements: [
        'Full-stack developer (primary) - 4 weeks full-time',
        'UI/UX designer - 1 week (layout design, canvas UX)',
        'QA engineer - 1 week (E2E test suite, performance testing)',
        'No external API costs (self-contained system)'
      ],
      estimated_loc: {
        database_migration: '~350 lines SQL',
        backend_services: '~800 lines (4 services × 200 lines)',
        frontend_components: '~1200 lines (8 components × 150 lines)',
        tests: '~500 lines (unit + E2E)',
        total: '~2850 lines'
      }
    },
    target_application: 'EHG',
    created_by: 'Chairman',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-EVA-CONTENT-001')
      .maybeSingle();

    if (existing) {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', 'SD-EVA-CONTENT-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive updated successfully!');
    } else {
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Strategic Directive created successfully!');
    }

    console.log('\n📊 SD Details:');
    console.log('   ID: SD-EVA-CONTENT-001');
    console.log('   Title: EVA Content Catalogue & Dynamic Presentation System MVP');
    console.log('   Priority: HIGH');
    console.log('   Status: DRAFT (awaiting LEAD approval)');
    console.log('   Timeline: 4-6 weeks');
    console.log('   Impact: Transforms EVA into content creation platform');

    console.log('\n🎯 MVP Scope:');
    console.log('   - 3 content types (text, table, chart)');
    console.log('   - 1 layout mode (presentation)');
    console.log('   - Version control (linear history)');
    console.log('   - EVA conversation integration');
    console.log('   - Pan/zoom canvas');

    console.log('\n📈 Success Criteria:');
    console.log('   - E2E test: "EVA, create pitch deck" → Full presentation');
    console.log('   - Version rollback: 100% accuracy');
    console.log('   - Canvas performance: 60fps with <500 items');
    console.log('   - Content creation success: >95%');

    console.log('\n📦 Deliverables:');
    console.log('   - 9 database tables with schema');
    console.log('   - 3 content type renderers');
    console.log('   - Presentation layout engine');
    console.log('   - EVA conversation service');
    console.log('   - ~2850 lines of code');

    console.log('\n===================================================================================');
    console.log('Next steps: Review backlog items and database migration schema');

    return strategicDirective;
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createEVAContentSD };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createEVAContentSD();
}
