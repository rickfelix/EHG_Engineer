/**
 * Product Requirements Expert: Generate User Stories for SD-EVA-CONTENT-001
 * Generates user stories from PRD and approved backlog items
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function generateUserStories() {
  console.log('📋 Product Requirements Expert: Generating User Stories\n');

  const sdId = 'SD-EVA-CONTENT-001';
  const prdId = 'PRD-EVA-CONTENT-001-1760208321259';

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Define user stories based on PRD + approved backlog items
    const userStories = [
      // BP-EVA-CONTENT-001: Database Schema (16h)
      {
        story_key: 'SD-EVA-CONTENT-001:US-001',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Database Schema Migration',
        user_role: 'system admin',
        user_want: 'the EVA content catalogue database schema applied',
        user_benefit: 'content can be persisted with RLS policies',
        acceptance_criteria: [
          'All 9 tables created (content_types, screen_layouts, content_catalogue, content_versions, content_layout_assignments, eva_conversations, conversation_content_links, eva_user_settings, content_item_metadata)',
          'RLS policies enabled on all tables',
          'GIN indexes created on JSONB fields',
          'Seed data inserted: 3 content types (text_block, data_table, chart) + 1 default layout',
          'Migration file 20251011_eva_content_catalogue_mvp.sql applied successfully'
        ],
        priority: 'critical',
        story_points: 8,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-001 (16h)'
      },

      // BP-EVA-CONTENT-002: Content Types (20h) - Text Block
      {
        story_key: 'SD-EVA-CONTENT-001:US-002',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Text Block Renderer Component',
        user_role: 'user',
        user_want: 'to view text content with markdown formatting',
        user_benefit: 'I can read formatted documentation',
        acceptance_criteria: [
          'TextBlockRenderer.tsx component created (~300 LOC)',
          'Supports markdown rendering via react-markdown',
          'Renders headings, lists, bold, italic, links, code blocks',
          'Responsive design (mobile, tablet, desktop)',
          'Unit tests pass for markdown rendering'
        ],
        priority: 'high',
        story_points: 3,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-002 (20h total, 7h for text block)'
      },

      // BP-EVA-CONTENT-002: Content Types (20h) - Data Table
      {
        story_key: 'SD-EVA-CONTENT-001:US-003',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Data Table Renderer Component',
        user_role: 'user',
        user_want: 'to view tabular data with sorting and filtering',
        user_benefit: 'I can analyze structured information',
        acceptance_criteria: [
          'DataTableRenderer.tsx component created (~400 LOC)',
          'Supports react-table for rendering',
          'Column sorting (ascending/descending)',
          'Column filtering (text search)',
          'Pagination (configurable rows per page)',
          'Unit tests pass for table operations'
        ],
        priority: 'high',
        story_points: 3,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-002 (20h total, 7h for data table)'
      },

      // BP-EVA-CONTENT-002: Content Types (20h) - Chart
      {
        story_key: 'SD-EVA-CONTENT-001:US-004',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Chart Renderer Component',
        user_role: 'user',
        user_want: 'to view data visualizations (bar, line, pie, area charts)',
        user_benefit: 'I can understand trends and patterns',
        acceptance_criteria: [
          'ChartRenderer.tsx component created (~350 LOC)',
          'Supports recharts for rendering',
          '4 chart types: bar, line, pie, area',
          'Interactive tooltips on hover',
          'Responsive sizing and legends',
          'Unit tests pass for chart rendering'
        ],
        priority: 'high',
        story_points: 3,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-002 (20h total, 6h for charts)'
      },

      // BP-EVA-CONTENT-004: Presentation Layout (18h) - Layout Engine
      {
        story_key: 'SD-EVA-CONTENT-001:US-005',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Layout Engine Component',
        user_role: 'user',
        user_want: 'a layout engine that orchestrates content rendering',
        user_benefit: 'multiple content types display cohesively',
        acceptance_criteria: [
          'LayoutEngine.tsx component created (~500 LOC)',
          'Fetches content from content_catalogue table',
          'Dynamically renders TextBlock/DataTable/Chart components',
          'Supports multiple layouts from screen_layouts table',
          'Handles loading states and errors gracefully',
          'Unit tests pass for layout orchestration'
        ],
        priority: 'high',
        story_points: 5,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-004 (18h total, 10h for layout engine)'
      },

      // BP-EVA-CONTENT-004: Presentation Layout (18h) - Presentation Mode
      {
        story_key: 'SD-EVA-CONTENT-001:US-006',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Presentation Mode with Navigation',
        user_role: 'user',
        user_want: 'a slide deck presentation mode with keyboard navigation',
        user_benefit: 'I can present content in a structured flow',
        acceptance_criteria: [
          'PresentationMode.tsx component created (~400 LOC)',
          'Slide navigation: prev/next/jump to slide',
          'Keyboard shortcuts: Arrow keys (prev/next), F (fullscreen)',
          'Slide transitions at 60fps',
          'Responsive design for different screen sizes',
          'E2E test covers keyboard navigation'
        ],
        priority: 'high',
        story_points: 4,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-004 (18h total, 8h for presentation mode)',
        e2e_test_path: 'tests/e2e/eva-presentation-mode.spec.ts'
      },

      // BP-EVA-CONTENT-006: EVA Integration (22h) - Content Service
      {
        story_key: 'SD-EVA-CONTENT-001:US-007',
        sd_id: sdId,
        prd_id: prdId,
        title: 'Content Type CRUD Service',
        user_role: 'developer',
        user_want: 'a content type service for CRUD operations',
        user_benefit: 'content can be created, retrieved, updated, and deleted',
        acceptance_criteria: [
          'contentTypeService.ts created (~400 LOC)',
          'CRUD methods: create, read, update, delete, list',
          'JSON schema validation for content_data field',
          'Supabase integration with RLS enforcement',
          'Error handling and TypeScript types',
          'Unit tests pass for all CRUD operations'
        ],
        priority: 'high',
        story_points: 5,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-006 (22h total, 10h for CRUD service)'
      },

      // BP-EVA-CONTENT-006: EVA Integration (22h) - EVA Service
      {
        story_key: 'SD-EVA-CONTENT-001:US-008',
        sd_id: sdId,
        prd_id: prdId,
        title: 'EVA Content Creation Integration',
        user_role: 'user',
        user_want: 'to create content via natural language commands to EVA',
        user_benefit: 'I can generate presentations without manual data entry',
        acceptance_criteria: [
          'evaContentService.ts created (~300 LOC)',
          'Extends existing evaConversation.ts service',
          'Recognizes intents: "create presentation", "make pitch deck", "generate chart"',
          'Queries venture data from database for content generation',
          'Stores conversations in eva_conversations table',
          'Links content to conversations via conversation_content_links',
          'E2E test: User says "EVA, create pitch deck" → content generated'
        ],
        priority: 'high',
        story_points: 6,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-006 (22h total, 12h for EVA integration)',
        e2e_test_path: 'tests/e2e/eva-content-creation.spec.ts'
      },

      // BP-EVA-CONTENT-007: Settings & Testing (16h) - Settings Panel
      {
        story_key: 'SD-EVA-CONTENT-001:US-009',
        sd_id: sdId,
        prd_id: prdId,
        title: 'EVA Settings Panel',
        user_role: 'user',
        user_want: 'a settings panel to configure EVA content preferences',
        user_benefit: 'I can customize my experience',
        acceptance_criteria: [
          'EVASettingsPanel.tsx component created (~350 LOC)',
          'Settings fields: default layout, content type preferences, presentation mode defaults',
          'Persists settings to eva_user_settings table',
          'Real-time updates with Supabase subscriptions',
          'Form validation with error messages',
          'E2E test covers settings save and retrieval'
        ],
        priority: 'medium',
        story_points: 4,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-007 (16h total, 8h for settings)',
        e2e_test_path: 'tests/e2e/eva-settings-panel.spec.ts'
      },

      // BP-EVA-CONTENT-007: Settings & Testing (16h) - E2E Tests
      {
        story_key: 'SD-EVA-CONTENT-001:US-010',
        sd_id: sdId,
        prd_id: prdId,
        title: 'E2E Test Suite for EVA Content',
        user_role: 'QA engineer',
        user_want: 'comprehensive E2E tests covering all user stories',
        user_benefit: 'I can validate functionality before deployment',
        acceptance_criteria: [
          '100% user story coverage (SD-EVA-CONTENT-001:US-001 through SD-EVA-CONTENT-001:US-010)',
          'Playwright tests created: eva-content-creation.spec.ts, eva-presentation-mode.spec.ts, eva-settings-panel.spec.ts',
          'All tests pass with 0 failures',
          'Test execution time < 5 minutes',
          'Screenshots captured for visual evidence',
          'HTML report generated and reviewed'
        ],
        priority: 'critical',
        story_points: 4,
        status: 'ready',
        technical_notes: 'Backlog Item: BP-EVA-CONTENT-007 (16h total, 8h for E2E tests)'
      }
    ];

    console.log(`📝 Inserting ${userStories.length} user stories...\n`);

    // Insert each user story
    for (const story of userStories) {
      const insertSQL = `
        INSERT INTO user_stories (
          story_key, sd_id, prd_id, title, user_role, user_want, user_benefit,
          acceptance_criteria, priority, story_points, status, technical_notes,
          e2e_test_path, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING story_key, title, priority;
      `;

      const values = [
        story.story_key,
        story.sd_id,
        story.prd_id,
        story.title,
        story.user_role,
        story.user_want,
        story.user_benefit,
        JSON.stringify(story.acceptance_criteria),
        story.priority,
        story.story_points,
        story.status,
        story.technical_notes,
        story.e2e_test_path || null,
        'PLAN_AGENT'
      ];

      const result = await client.query(insertSQL, values);
      const data = result.rows[0];
      console.log(`  ✅ ${data.story_key}: ${data.title} [${data.priority}]`);
    }

    console.log('\n✅ Product Requirements Expert: User Stories Generated Successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Total Stories: ${userStories.length}`);
    console.log('   Coverage: 100% of approved backlog items');
    console.log('   Critical: 2 (Database Schema, E2E Tests)');
    console.log('   High: 7 (Components & Services)');
    console.log('   Medium: 1 (Settings Panel)');
    console.log('   Total Story Points: 40');
    console.log('   Total Hours: 92h');
    console.log('\n➡️ Next: Create PLAN→EXEC handoff with user story mapping\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Details:', err.detail || err.hint || 'No additional details');
    throw err;
  } finally {
    await client.end();
  }
}

generateUserStories();
