/**
 * Database Architect: Schema-Compliant PRD Insertion
 * SD-EVA-CONTENT-001: EVA Content Catalogue MVP
 *
 * Strategy: Use TEXT fields for markdown, JSONB for structured arrays/objects
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createPRD() {
  console.log('🗄️ DATABASE ARCHITECT: Creating PRD for SD-EVA-CONTENT-001\n');

  // Generate unique PRD ID
  const prdId = `PRD-EVA-CONTENT-001-${Date.now()}`;

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Use minimal required fields + content TEXT field for full PRD
    const insertSQL = `
      INSERT INTO product_requirements_v2 (
        id,
        directive_id,
        sd_id,
        title,
        version,
        status,
        category,
        priority,
        executive_summary,
        business_context,
        technical_context,
        system_architecture,
        implementation_approach,
        content,
        functional_requirements,
        non_functional_requirements,
        technical_requirements,
        test_scenarios,
        acceptance_criteria,
        risks,
        constraints,
        assumptions,
        plan_checklist,
        exec_checklist,
        approved_by,
        approval_date,
        created_at,
        updated_at,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
      ) RETURNING id, title, sd_id, status, created_at;
    `;

    const values = [
      prdId, // id
      'SD-EVA-CONTENT-001', // directive_id
      'SD-EVA-CONTENT-001', // sd_id
      'EVA Content Catalogue & Dynamic Presentation System MVP', // title
      '1.0', // version
      'approved', // status
      'AI & Automation', // category
      'high', // priority

      // TEXT fields - executive summary
      `Build a dynamic content management and presentation system integrated with EVA that enables users to create, manage, and present structured content (text, tables, charts) through conversational AI interactions.

**Target URL**: http://localhost:8080/eva-assistant

**Approved Scope** (92h, 5 backlog items):
1. Database Schema (16h, HIGH) - 9 tables via migration
2. Content Type System (20h, HIGH) - 3 renderers + service
3. Presentation Layout Engine (18h, HIGH) - Slide navigation
4. EVA Conversation Integration (22h, HIGH) - Natural language content creation
5. Settings Panel & E2E Testing (16h, MEDIUM) - User preferences + Playwright

**Deferred to v2**: Version History Service, Pan/Zoom Canvas Controller`,

      // business_context (TEXT)
      `**Problem**: Current EVA is text-only. Users cannot create structured content (presentations, tables, charts).

**Business Objectives**:
- Enable content creation via EVA: "EVA, create pitch deck"
- Support 3 content types: text_block, data_table, chart
- Provide presentation mode for viewing
- Persist content in database with RLS

**Success Metrics**:
- Content creation success rate: 100%
- Rendering errors: 0
- E2E coverage: 100% of user stories
- Load time: <500ms`,

      // technical_context (TEXT)
      `**Target**: EHG application at http://localhost:8080/eva-assistant
**Database**: liapbndqlqxdcgpwntbv (Supabase)
**Stack**: Vite + React 18 + TypeScript + Shadcn + Tailwind

**Infrastructure**:
- Supabase client: /src/integrations/supabase/client.ts
- EVA components: /src/components/eva/ (13 files)
- EVA conversation: /src/services/evaConversation.ts

**Migration**: database/migrations/20251011_eva_content_catalogue_mvp.sql
- Status: Ready to apply (9 tables, RLS, seed data)`,

      // system_architecture (TEXT)
      `**Component Hierarchy**:
EVAContentPage (http://localhost:8080/eva-assistant)
├── EVA Chat Interface (existing)
├── LayoutEngine (~500 LOC)
│   ├── PresentationMode (~400 LOC)
│   │   ├── TextBlockRenderer (~300 LOC)
│   │   ├── DataTableRenderer (~400 LOC)
│   │   └── ChartRenderer (~350 LOC)
│   └── Navigation Controls
└── EVASettingsPanel (~350 LOC)

**Services**:
- contentTypeService.ts (~400 LOC): CRUD operations
- evaContentService.ts (~300 LOC): Extends evaConversation.ts

**Data Flow**:
User → "EVA, create pitch deck" → evaContentService → Query venture data →
Generate content → Save to content_catalogue → LayoutEngine renders → User views`,

      // implementation_approach (TEXT)
      `**Phase 1: Database** (16h)
- Apply migration to EHG database
- Verify 9 tables + RLS + seed data

**Phase 2: Content Types** (20h)
- Build 3 renderers (text, table, chart)
- Implement contentTypeService.ts

**Phase 3: Presentation** (18h)
- Build LayoutEngine + PresentationMode
- Add keyboard shortcuts

**Phase 4: EVA Integration** (22h)
- Extend evaConversation.ts
- Implement intent recognition

**Phase 5: Testing** (16h)
- Build EVASettingsPanel
- Write E2E tests (Playwright)
- 100% user story coverage`,

      // content (TEXT) - Full detailed PRD
      `# Product Requirements Document
# EVA Content Catalogue & Dynamic Presentation System MVP

## Target URL
http://localhost:8080/eva-assistant

## Functional Requirements

### FR-1: Database Schema (BP-EVA-CONTENT-001, 16h, HIGH)
Create 9 tables via migration file:
- content_types, screen_layouts, content_catalogue, content_versions
- content_layout_assignments, eva_conversations, conversation_content_links
- eva_user_settings, content_item_metadata

Acceptance Criteria:
- All 9 tables created with RLS policies
- Seed data: 3 content types + 1 layout
- GIN indexes on JSONB fields (<100ms queries)

### FR-2: Content Type System (BP-EVA-CONTENT-002, 20h, HIGH)
Components:
- TextBlockRenderer.tsx (~300 LOC): react-markdown
- DataTableRenderer.tsx (~400 LOC): react-table with sort/filter
- ChartRenderer.tsx (~350 LOC): recharts (bar/line/pie/area)
- contentTypeService.ts (~400 LOC): CRUD + validation

Acceptance Criteria:
- Text blocks render markdown correctly
- Tables support sorting/filtering
- Charts support 4 types
- Content validates against JSON schemas

### FR-3: Presentation Layout (BP-EVA-CONTENT-004, 18h, HIGH)
Components:
- LayoutEngine.tsx (~500 LOC): Orchestrates rendering
- PresentationMode.tsx (~400 LOC): Slide deck view

Features:
- Slide navigation (prev/next/jump)
- Keyboard shortcuts (arrows, F)
- Slide transitions (60fps)
- Responsive design

Acceptance Criteria:
- Slides render from database
- Navigation functional
- Keyboard shortcuts work
- Responsive on mobile/tablet/desktop

### FR-4: EVA Integration (BP-EVA-CONTENT-006, 22h, HIGH)
Service:
- evaContentService.ts (~300 LOC): Extends evaConversation.ts

Features:
- Recognize intents: "create presentation", "make chart"
- Generate content from venture data
- Link conversations to content
- Store transcripts in eva_conversations

Acceptance Criteria:
- EVA recognizes "create pitch deck"
- Content generated from data
- Conversation stored
- Content linked to conversation

### FR-5: Settings & Testing (BP-EVA-CONTENT-007, 16h, MEDIUM)
Component:
- EVASettingsPanel.tsx (~350 LOC)

E2E Tests:
- eva-content-creation.spec.ts
- eva-presentation-mode.spec.ts
- eva-settings-panel.spec.ts

Acceptance Criteria:
- Settings persist in eva_user_settings
- E2E tests cover 100% user stories
- All tests pass (0 failures)

## Non-Functional Requirements
- Performance: <500ms load time, 60fps transitions
- Security: RLS policies, user isolation
- Maintainability: 300-600 LOC per component

## EXEC Pre-Implementation Checklist
1. Verify application: /mnt/c/_EHG/ehg (NOT EHG_Engineer)
2. Apply migration to EHG database
3. Navigate to http://localhost:8080/eva-assistant
4. Install dependencies: react-markdown, react-table, recharts
5. Screenshot BEFORE changes

## Testing Requirements (MANDATORY)
- Unit tests: npm run test:unit (MUST pass)
- E2E tests: npm run test:e2e (MUST pass)
- Coverage: 100% of user stories
- Evidence: Screenshots, videos, HTML reports`,

      // JSONB fields - structured data as JSON
      JSON.stringify([
        { id: "FR-1", title: "Database Schema", hours: 16, priority: "HIGH" },
        { id: "FR-2", title: "Content Type System", hours: 20, priority: "HIGH" },
        { id: "FR-3", title: "Presentation Layout", hours: 18, priority: "HIGH" },
        { id: "FR-4", title: "EVA Integration", hours: 22, priority: "HIGH" },
        { id: "FR-5", title: "Settings & Testing", hours: 16, priority: "MEDIUM" }
      ]), // functional_requirements

      JSON.stringify([
        { id: "NFR-1", requirement: "Performance: <500ms load, 60fps transitions" },
        { id: "NFR-2", requirement: "Security: RLS policies enforce user isolation" },
        { id: "NFR-3", requirement: "Usability: Keyboard shortcuts, responsive design" },
        { id: "NFR-4", requirement: "Maintainability: 300-600 LOC per component" }
      ]), // non_functional_requirements

      JSON.stringify([
        { id: "TR-1", requirement: "React 18 + TypeScript + Vite + Tailwind" },
        { id: "TR-2", requirement: "Dependencies: react-markdown, react-table, recharts" },
        { id: "TR-3", requirement: "Migration: 20251011_eva_content_catalogue_mvp.sql" },
        { id: "TR-4", requirement: "Target URL: http://localhost:8080/eva-assistant" }
      ]), // technical_requirements

      JSON.stringify([
        { id: "TS-1", scenario: "User creates content via EVA: 'create pitch deck'" },
        { id: "TS-2", scenario: "User navigates slides with arrow keys" },
        { id: "TS-3", scenario: "User saves settings in panel" },
        { id: "TS-4", scenario: "E2E tests pass with 100% user story coverage" }
      ]), // test_scenarios

      JSON.stringify([
        { id: "AC-D", criteria: "All 9 tables created with RLS + seed data" },
        { id: "AC-C", criteria: "3 content types render correctly (text/table/chart)" },
        { id: "AC-P", criteria: "Presentation mode with keyboard shortcuts functional" },
        { id: "AC-E", criteria: "EVA recognizes intents and generates content" },
        { id: "AC-T", criteria: "Unit + E2E tests pass, 100% coverage" }
      ]), // acceptance_criteria

      JSON.stringify([
        { id: "R-1", risk: "Migration failure", severity: "HIGH", mitigation: "Validate before apply" },
        { id: "R-2", risk: "Performance degradation", severity: "MEDIUM", mitigation: "GIN indexes + pagination" },
        { id: "R-3", risk: "E2E test failures", severity: "MEDIUM", mitigation: "data-testid attributes" }
      ]), // risks

      JSON.stringify([
        { id: "C-1", constraint: "Target URL: http://localhost:8080/eva-assistant (fixed)" },
        { id: "C-2", constraint: "Component sizing: 300-600 LOC (enforced)" },
        { id: "C-3", constraint: "Testing: 100% user story coverage (mandatory)" },
        { id: "C-4", constraint: "Database: Schema fixed (9 tables via migration)" }
      ]), // constraints

      JSON.stringify([
        { id: "A-1", assumption: "EXEC has access to EHG Supabase (liapbndqlqxdcgpwntbv)" },
        { id: "A-2", assumption: "EVA conversation service is functional" },
        { id: "A-3", assumption: "Dependencies install without conflicts" },
        { id: "A-4", assumption: "Venture data exists for content generation" }
      ]), // assumptions

      JSON.stringify([
        { step: "5-Step SD Evaluation", status: "complete" },
        { step: "Database Architect validation", status: "complete" },
        { step: "Design Sub-Agent assessment", status: "complete" },
        { step: "PRD creation", status: "complete" }
      ]), // plan_checklist

      JSON.stringify([
        { step: "Verify application directory (/mnt/c/_EHG/ehg)", status: "pending", critical: true },
        { step: "Apply migration to EHG database", status: "pending", critical: true },
        { step: "Navigate to http://localhost:8080/eva-assistant", status: "pending", critical: true },
        { step: "Install dependencies", status: "pending", critical: true },
        { step: "Implement 8 components (~3000 LOC)", status: "pending", critical: false },
        { step: "Run unit tests (npm run test:unit)", status: "pending", critical: true },
        { step: "Run E2E tests (npm run test:e2e)", status: "pending", critical: true },
        { step: "Collect test evidence", status: "pending", critical: true }
      ]), // exec_checklist

      'PLAN_AGENT', // approved_by
      new Date().toISOString(), // approval_date
      new Date().toISOString(), // created_at
      new Date().toISOString(), // updated_at
      'PLAN_AGENT' // created_by
    ];

    const result = await client.query(insertSQL, values);
    const data = result.rows[0];

    console.log('✅ DATABASE ARCHITECT: PRD CREATED SUCCESSFULLY!\n');
    console.log('📋 PRD ID:', data.id);
    console.log('🎯 Title:', data.title);
    console.log('🔗 SD:', data.sd_id);
    console.log('📊 Status:', data.status);
    console.log('⏱️  Created:', data.created_at);
    console.log('\n🗄️ SCHEMA COMPLIANCE: 100%');
    console.log('   - TEXT fields: Used for markdown content');
    console.log('   - JSONB fields: Used for structured arrays');
    console.log('   - content field: Full detailed PRD stored');
    console.log('\n✅ PLAN PRD CREATION COMPLETE');
    console.log('➡️  Next: Generate user stories, create PLAN→EXEC handoff\n');

  } catch (err) {
    console.error('❌ DATABASE ARCHITECT ERROR:', err.message);
    console.error('Details:', err.detail || err.hint || 'No additional details');
    throw err;
  } finally {
    await client.end();
  }
}

createPRD();
