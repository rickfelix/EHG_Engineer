#!/usr/bin/env node

/**
 * Create Backlog Items for SD-EVA-CONTENT-001
 * EVA Content Catalogue & Dynamic Presentation System MVP
 *
 * Creates 7 backlog items covering:
 * 1. Database schema implementation
 * 2. Content Type System (3 types)
 * 3. Version History Service
 * 4. Presentation Layout Engine
 * 5. Pan/Zoom Canvas Controller
 * 6. EVA Conversation Integration
 * 7. Settings Panel & E2E Tests
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const backlogItems = [
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-001',
    backlog_title: 'Database Schema Implementation',
    description_raw: 'Must Have',
    item_description: 'Create 9-table database schema with indexes, RLS policies, foreign keys, and seed data',
    priority: 'High',
    stage_number: 1,
    phase: 'Development',
    new_module: true,
    extras: {
      Category: 'Database & Infrastructure',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Implement comprehensive database schema: content_types, screen_layouts, content_catalogue, content_versions, content_layout_assignments, eva_conversations, conversation_content_links, eva_user_settings, content_item_metadata. Include GIN indexes on JSONB fields, B-tree indexes on foreign keys, RLS policies for user isolation, and auto-update timestamp triggers. Seed with 3 content types (text_block, data_table, chart) and 1 presentation layout.',
      estimated_hours: 16
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-002',
    backlog_title: 'Content Type System (3 types)',
    description_raw: 'Must Have',
    item_description: 'Implement text_block, data_table, chart content types with creation workflows, validation, and display renderers',
    priority: 'High',
    stage_number: 2,
    phase: 'Development',
    new_module: true,
    extras: {
      Category: 'Frontend & User Experience (UX/UI)',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Build content type renderers: TextBlockRenderer.tsx (react-markdown for rich text), DataTableRenderer.tsx (react-table with sorting/filtering), ChartRenderer.tsx (recharts with bar/line/pie/area charts). Implement contentTypeService.ts with CRUD operations, validation against JSON schemas, and transformation logic. Create content creation UI forms for each type with proper validation feedback.',
      estimated_hours: 20,
      technologies: ['React', 'TypeScript', 'react-markdown', 'react-table', 'recharts']
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-003',
    backlog_title: 'Version History Service',
    description_raw: 'Must Have',
    item_description: 'Build version control system with create/retrieve/rollback capabilities and linear history',
    priority: 'High',
    stage_number: 3,
    phase: 'Development',
    new_module: true,
    extras: {
      Category: 'Backend & API',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Implement versioningService.ts with methods: createVersion(catalogueId, data, changeDescription), getVersionHistory(catalogueId), getVersion(catalogueId, versionNumber), rollbackToVersion(catalogueId, versionNumber). Store full snapshots in content_versions table with change tracking (who, when, what). Build VersionHistoryUI.tsx component showing timeline, diff viewer (react-diff-viewer), and rollback confirmation dialog. Ensure immutability (versions never deleted, only marked archived).',
      estimated_hours: 16,
      technologies: ['TypeScript', 'Supabase', 'react-diff-viewer']
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-004',
    backlog_title: 'Presentation Layout Engine',
    description_raw: 'Must Have',
    item_description: 'Build React layout engine rendering content in presentation mode with slide transitions',
    priority: 'High',
    stage_number: 4,
    phase: 'Development',
    new_module: true,
    extras: {
      Category: 'Frontend & User Experience (UX/UI)',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Create LayoutEngine.tsx orchestrating content rendering based on screen_layouts template. Build PresentationMode.tsx component with slide deck view, navigation controls (prev/next/jump to slide), slide transitions (fade, slide, none), and progress indicator. Implement responsive breakpoints (desktop/tablet/mobile) from layout logic_rules. Add keyboard shortcuts (arrow keys for navigation, F for fullscreen). Style with Tailwind CSS for clean presentation aesthetic.',
      estimated_hours: 18,
      technologies: ['React', 'TypeScript', 'Tailwind CSS', 'Framer Motion']
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-005',
    backlog_title: 'Pan/Zoom Canvas Controller',
    description_raw: 'Must Have',
    item_description: 'Implement interactive canvas with pan/zoom using react-zoom-pan-pinch, touch/mouse gestures, and viewport management',
    priority: 'Medium',
    stage_number: 5,
    phase: 'Development',
    new_module: true,
    extras: {
      Category: 'Frontend & User Experience (UX/UI)',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Build CanvasController.tsx wrapping layout content with react-zoom-pan-pinch. Implement pan (drag with mouse/touch), zoom (mouse wheel/pinch gesture), and reset view button. Add mini-map navigator showing current viewport position. Store zoom/pan state in eva_user_settings for persistence. Optimize performance: debounce pan/zoom events (60fps target), viewport culling (only render visible items), lazy load content outside viewport. Add UI controls: zoom in/out buttons, fit-to-screen, 100% zoom buttons.',
      estimated_hours: 14,
      technologies: ['React', 'TypeScript', 'react-zoom-pan-pinch']
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-006',
    backlog_title: 'EVA Conversation Integration',
    description_raw: 'Must Have',
    item_description: 'Enable EVA to create content via conversation, record transcripts, and link content to conversations',
    priority: 'High',
    stage_number: 6,
    phase: 'Development',
    new_module: true,
    extras: {
      Category: 'AI & Automation',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Build evaConversationService.ts with methods: recordConversation(userId, messages, context), createContentFromConversation(conversationId, contentType, data), linkContentToConversation(conversationId, catalogueId, linkType). Extend EVA to recognize content creation intents: "create presentation", "make a chart", "build a table". Implement content generation logic: for "create pitch deck", query venture data, generate 5 slides (title, metrics chart, data table, roadmap, summary). Build ConversationViewer.tsx showing transcript with highlighted content references (clickable links to catalogue items). Store conversation in eva_conversations with full context for future reference.',
      estimated_hours: 22,
      technologies: ['TypeScript', 'Supabase', 'React', 'EVA Assistant API']
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  },
  {
    sd_id: 'SD-EVA-CONTENT-001',
    backlog_id: 'BP-EVA-CONTENT-007',
    backlog_title: 'Settings Panel & E2E Tests',
    description_raw: 'Must Have',
    item_description: 'Build user settings panel for layout preferences and comprehensive E2E test suite',
    priority: 'Medium',
    stage_number: 7,
    phase: 'Launch',
    new_module: false,
    extras: {
      Category: 'Quality Assurance & Testing',
      'Page Category_1': 'EVA Content System',
      'Description_1': 'Create EVASettingsPanel.tsx with tabs: Layout Preferences (default layout per content type), Default Views (zoom/pan/theme), Keyboard Shortcuts. Implement settings persistence in eva_user_settings table. Build comprehensive E2E test suite with Playwright: eva-content-creation.spec.ts (test "EVA, create pitch deck" flow), eva-version-control.spec.ts (test create/rollback versions), eva-canvas-interaction.spec.ts (test pan/zoom gestures). Add performance tests: load 100 catalogue items, measure <500ms load time. Document test results with screenshots, pass/fail criteria, performance metrics.',
      estimated_hours: 16,
      technologies: ['React', 'TypeScript', 'Playwright', 'Supabase']
    },
    item_type: 'story',
    completion_status: 'NOT_STARTED'
  }
];

async function createBacklogItems() {
  console.log('📋 Creating Backlog Items for SD-EVA-CONTENT-001');
  console.log('===================================================\n');

  try {
    // Check if SD exists
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title')
      .eq('id', 'SD-EVA-CONTENT-001')
      .maybeSingle();

    if (sdError) throw sdError;

    if (!sd) {
      console.error('❌ SD-EVA-CONTENT-001 not found. Run create-sd-eva-content-001.js first.');
      process.exit(1);
    }

    console.log(`✅ Found SD: ${sd.title}\n`);
    console.log(`📦 Creating ${backlogItems.length} backlog items...\n`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const item of backlogItems) {
      // Check if item already exists
      const { data: existing } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id')
        .eq('sd_id', item.sd_id)
        .eq('backlog_id', item.backlog_id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('sd_backlog_map')
          .update(item)
          .eq('sd_id', item.sd_id)
          .eq('backlog_id', item.backlog_id);

        if (error) {
          console.error(`❌ Error updating ${item.backlog_id}:`, error.message);
          errors++;
        } else {
          console.log(`✅ Updated: ${item.backlog_id} - ${item.backlog_title}`);
          updated++;
        }
      } else {
        // Create new
        const { error } = await supabase
          .from('sd_backlog_map')
          .insert(item);

        if (error) {
          console.error(`❌ Error creating ${item.backlog_id}:`, error.message);
          errors++;
        } else {
          console.log(`✅ Created: ${item.backlog_id} - ${item.backlog_title}`);
          created++;
        }
      }
    }

    console.log('\n===================================================');
    console.log('✅ Backlog creation complete!');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);

    if (errors === 0) {
      console.log('\n📊 Backlog Summary:');
      console.log('   BP-EVA-CONTENT-001: Database Schema (16h)');
      console.log('   BP-EVA-CONTENT-002: Content Types (20h)');
      console.log('   BP-EVA-CONTENT-003: Version History (16h)');
      console.log('   BP-EVA-CONTENT-004: Layout Engine (18h)');
      console.log('   BP-EVA-CONTENT-005: Pan/Zoom Canvas (14h)');
      console.log('   BP-EVA-CONTENT-006: EVA Integration (22h)');
      console.log('   BP-EVA-CONTENT-007: Settings & Tests (16h)');
      console.log('\n   📈 Total Estimated: 122 hours (~3-4 weeks)');
    }

  } catch (error) {
    console.error('❌ Error creating backlog items:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { createBacklogItems };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createBacklogItems();
}
