/**
 * Create PRD for SD-EVA-CONTENT-001
 * EVA Content Catalogue & Dynamic Presentation System MVP
 *
 * Target: http://localhost:8080/eva-assistant
 * Approved Scope: 92 hours (5 backlog items)
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createPRD() {
  console.log('🔄 Creating PRD for SD-EVA-CONTENT-001...\n');

  
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

const prd = {
    directive_id: 'SD-EVA-CONTENT-001',
    sd_id: 'SD-EVA-CONTENT-001',
    title: 'EVA Content Catalogue & Dynamic Presentation System MVP',
    version: '1.0',
    status: 'approved',
    category: 'AI & Automation',
    priority: 'high',

    executive_summary: `Build a dynamic content management and presentation system integrated with EVA that enables users to create, manage, and present structured content (text, tables, charts) through conversational AI interactions.

**Target URL**: http://localhost:8080/eva-assistant

**Key Features** (Approved Scope - 92h):
1. Database Schema with 9 tables (16h)
2. Content Type System - 3 types: text_block, data_table, chart (20h)
3. Presentation Layout Engine (18h)
4. EVA Conversation Integration (22h)
5. Settings Panel & E2E Testing (16h)

**Deferred to v2**: Version History Service, Pan/Zoom Canvas Controller

**MVP Value**: Enable EVA to create presentations, tables, and charts from venture data through natural language commands like "EVA, create pitch deck".`,

    business_context: `**Problem Statement**:
Current EVA is text-only conversation. Users cannot create or view structured content (presentations, tables, charts) within the application.

**Business Objectives**:
1. Enable content creation via EVA conversation ("EVA, create pitch deck")
2. Support 3 content types: text_block, data_table, chart
3. Provide presentation mode for content viewing
4. Persist content in database with user ownership (RLS)
5. Integrate with existing EVA assistant at http://localhost:8080/eva-assistant

**Success Metrics**:
- Users can create content via EVA commands: 100% success rate
- Content renders correctly in presentation mode: 0 rendering errors
- E2E test coverage: 100% of user stories
- Performance: Content loads <500ms`,

    technical_context: `**Target Application**: EHG (customer-facing, NOT EHG_Engineer dashboard)
**Target URL**: http://localhost:8080/eva-assistant
**Database**: liapbndqlqxdcgpwntbv (Supabase)
**Stack**: Vite + React 18 + TypeScript + Shadcn + Tailwind CSS

**Existing Infrastructure**:
- Supabase client configured: /src/integrations/supabase/client.ts
- EVA components: /src/components/eva/ (13 files)
- Service pattern: /src/services/ (9 existing services)
- EVA conversation service: /src/services/evaConversation.ts

**Migration File Ready**: database/migrations/20251011_eva_content_catalogue_mvp.sql
- 9 tables defined
- RLS policies configured
- Seed data included (3 content types, 1 layout)
- Status: NOT YET APPLIED (EXEC's first task)`,

    // Store detailed requirements in TEXT fields, structured data in JSONB
    functional_requirements: [
      {
        id: 'FR-1',
        title: 'Database Schema Implementation',
        backlog_id: 'BP-EVA-CONTENT-001',
        hours: 16,
        priority: 'HIGH',
        summary: 'Create 9 tables via migration file'
      },
      {
        id: 'FR-2',
        title: 'Content Type System',
        backlog_id: 'BP-EVA-CONTENT-002',
        hours: 20,
        priority: 'HIGH',
        summary: '3 renderers (text, table, chart) + service'
      },
      {
        id: 'FR-3',
        title: 'Presentation Layout Engine',
        backlog_id: 'BP-EVA-CONTENT-004',
        hours: 18,
        priority: 'HIGH',
        summary: 'Slide navigation, keyboard shortcuts, responsive'
      },
      {
        id: 'FR-4',
        title: 'EVA Conversation Integration',
        backlog_id: 'BP-EVA-CONTENT-006',
        hours: 22,
        priority: 'HIGH',
        summary: 'Content creation via natural language'
      },
      {
        id: 'FR-5',
        title: 'Settings Panel & E2E Testing',
        backlog_id: 'BP-EVA-CONTENT-007',
        hours: 16,
        priority: 'MEDIUM',
        summary: 'User preferences + Playwright tests'
      }
    ],

    // Detailed requirements in TEXT field
    functional_requirements_detail: `**FR-1: Database Schema Implementation** (BP-EVA-CONTENT-001, 16h, HIGH)

Tables to create (via migration):
1. content_types: Define 3 types (text_block, data_table, chart)
2. screen_layouts: 1 presentation layout
3. content_catalogue: User's content items with versioning
4. content_versions: Immutable version snapshots
5. content_layout_assignments: Content↔Layout mappings
6. eva_conversations: Conversation transcripts
7. conversation_content_links: Conversation↔Content links
8. eva_user_settings: User preferences
9. content_item_metadata: Tags, analytics, relationships

Acceptance Criteria:
- AC-1.1: All 9 tables created with correct schema
- AC-1.2: RLS policies active (users see only their content)
- AC-1.3: Seed data inserted: 3 content types + 1 layout
- AC-1.4: Auto-update timestamp triggers functional
- AC-1.5: GIN indexes on JSONB fields perform <100ms queries

---

**FR-2: Content Type System** (BP-EVA-CONTENT-002, 20h, HIGH)

Components:
- TextBlockRenderer.tsx (~300 LOC): react-markdown wrapper
- DataTableRenderer.tsx (~400 LOC): react-table with sort/filter
- ChartRenderer.tsx (~350 LOC): recharts (bar/line/pie/area)
- contentTypeService.ts (~400 LOC): CRUD + validation

Acceptance Criteria:
- AC-2.1: Text blocks render markdown correctly
- AC-2.2: Tables support sorting, filtering, pagination
- AC-2.3: Charts support 4 types: bar, line, pie, area
- AC-2.4: Content validation against JSON schemas
- AC-2.5: Create/Read/Update/Delete operations functional

---

**FR-3: Presentation Layout Engine** (BP-EVA-CONTENT-004, 18h, HIGH)

Components:
- LayoutEngine.tsx (~500 LOC): Layout orchestrator
- PresentationMode.tsx (~400 LOC): Slide deck view

Features:
- Slide navigation (prev/next/jump to slide)
- Keyboard shortcuts (arrow keys, F for fullscreen)
- Slide transitions (fade, slide, none)
- Progress indicator
- Responsive design (desktop/tablet/mobile)

Acceptance Criteria:
- AC-3.1: Slides render content from content_catalogue
- AC-3.2: Navigation controls functional
- AC-3.3: Keyboard shortcuts work (arrows, F key)
- AC-3.4: Responsive on mobile/tablet/desktop
- AC-3.5: Transitions smooth (60fps target)

---

**FR-4: EVA Conversation Integration** (BP-EVA-CONTENT-006, 22h, HIGH)

Service Extension:
- evaContentService.ts (~300 LOC): Extend /src/services/evaConversation.ts

Features:
- Recognize content creation intents: "create presentation", "make chart", "build table"
- Generate content from venture data
- Link conversations to created content
- Store conversation transcripts in eva_conversations table

Acceptance Criteria:
- AC-4.1: EVA recognizes "create pitch deck" intent
- AC-4.2: Content generated from venture data
- AC-4.3: Conversation transcript stored in database
- AC-4.4: Content linked to conversation (conversation_content_links)
- AC-4.5: User can view conversation history

---

**FR-5: Settings Panel & E2E Testing** (BP-EVA-CONTENT-007, 16h, MEDIUM)

Component:
- EVASettingsPanel.tsx (~350 LOC): Settings UI

Settings:
- Default layout per content type
- Default view settings (zoom, theme)
- Keyboard shortcuts configuration

E2E Tests (Playwright):
- eva-content-creation.spec.ts: Test "EVA, create pitch deck" flow
- eva-presentation-mode.spec.ts: Test slide navigation
- eva-settings-panel.spec.ts: Test settings persistence

Acceptance Criteria:
- AC-5.1: Settings panel renders at http://localhost:8080/eva-assistant
- AC-5.2: Settings persist in eva_user_settings table
- AC-5.3: E2E tests cover 100% of user stories
- AC-5.4: All E2E tests pass (0 failures)
- AC-5.5: Test evidence documented (screenshots, videos, HTML reports)`,

    non_functional_requirements: `**NFR-1: Performance**
- Content catalogue loads <500ms for 100 items
- Slide transitions maintain 60fps
- Database queries with GIN indexes <100ms

**NFR-2: Security**
- RLS policies enforce user isolation (no cross-user data leaks)
- Authentication via existing Supabase Auth
- Content ownership tracked (created_by = auth.uid())

**NFR-3: Usability**
- Keyboard shortcuts for navigation (arrows, F)
- Responsive design (mobile/tablet/desktop)
- Accessible (WCAG 2.1 AA where applicable)

**NFR-4: Maintainability**
- Component sizing: 300-600 LOC per file
- Service layer separation
- TypeScript strict mode
- Reuse existing Shadcn patterns`,

    technical_requirements: `**TR-1: Component Architecture**

File Structure:
\`\`\`
/src/components/eva-content/
  ├── renderers/
  │   ├── TextBlockRenderer.tsx        (~300 LOC)
  │   ├── DataTableRenderer.tsx        (~400 LOC)
  │   └── ChartRenderer.tsx            (~350 LOC)
  ├── layout/
  │   ├── LayoutEngine.tsx             (~500 LOC)
  │   └── PresentationMode.tsx         (~400 LOC)
  └── settings/
      └── EVASettingsPanel.tsx         (~350 LOC)

/src/services/eva-content/
  ├── contentTypeService.ts            (~400 LOC)
  └── evaContentService.ts             (~300 LOC)
\`\`\`

**TR-2: Dependencies**
- react-markdown: ^9.0.0 (text rendering)
- react-table: ^8.0.0 (table component)
- recharts: ^2.10.0 (charts)
- Existing: @supabase/supabase-js, shadcn, tailwind

**TR-3: Database Migration**
File: database/migrations/20251011_eva_content_catalogue_mvp.sql
Status: Ready to apply
Target DB: liapbndqlqxdcgpwntbv (EHG Supabase)

**TR-4: Integration Points**
- EVA Assistant: Extend /src/services/evaConversation.ts
- Supabase Client: /src/integrations/supabase/client.ts
- Route: Implement at http://localhost:8080/eva-assistant`,

    system_architecture: `**Application Context**:
- Target: EHG application (/mnt/c/_EHG/EHG/)
- NOT EHG_Engineer dashboard
- Port: 8080 (Playwright tests) / 5173 (dev server)

**Component Hierarchy**:
\`\`\`
EVAContentPage (http://localhost:8080/eva-assistant)
├── EVA Chat Interface (existing)
├── LayoutEngine
│   ├── PresentationMode
│   │   ├── TextBlockRenderer
│   │   ├── DataTableRenderer
│   │   └── ChartRenderer
│   └── Navigation Controls
└── EVASettingsPanel
\`\`\`

**Data Flow**:
1. User: "EVA, create pitch deck"
2. EVA recognizes intent → evaContentService.ts
3. Service queries venture data → generates content
4. Content saved to content_catalogue (Supabase)
5. LayoutEngine renders content in PresentationMode
6. User navigates slides with keyboard/mouse

**State Management**:
- Local: React useState/useEffect
- Persistent: Supabase tables (eva_user_settings, content_catalogue)
- No Redux/Zustand needed for MVP`,

    data_model: `**Tables** (9 total, all in EHG Supabase: liapbndqlqxdcgpwntbv):

1. **content_types**: 3 rows (text_block, data_table, chart)
   - PK: id (UUID)
   - Columns: name, display_name, creation_method, validation_schema

2. **screen_layouts**: 1 row (presentation)
   - PK: id (UUID)
   - Columns: name, layout_type, template_json, logic_rules

3. **content_catalogue**: User content items
   - PK: id (UUID)
   - FK: content_type_id → content_types(id)
   - Columns: title, description, current_version, data (JSONB), created_by
   - RLS: created_by = auth.uid()

4. **content_versions**: Version snapshots
   - PK: id (UUID)
   - FK: catalogue_id → content_catalogue(id) ON DELETE CASCADE
   - Columns: version_number, data_snapshot (JSONB), change_description

5. **content_layout_assignments**: Content↔Layout mappings
   - PK: id (UUID)
   - FK: catalogue_id → content_catalogue(id)
   - FK: layout_id → screen_layouts(id)

6. **eva_conversations**: Conversation transcripts
   - PK: id (UUID)
   - Columns: user_id, conversation_data (JSONB), context (JSONB)
   - RLS: user_id = auth.uid()

7. **conversation_content_links**: Conversation↔Content links
   - PK: id (UUID)
   - FK: conversation_id → eva_conversations(id)
   - FK: catalogue_id → content_catalogue(id)
   - Columns: link_type (created/modified/referenced/displayed)

8. **eva_user_settings**: User preferences
   - PK: id (UUID)
   - Columns: user_id (UNIQUE), layout_preferences (JSONB), default_views (JSONB)
   - RLS: user_id = auth.uid()

9. **content_item_metadata**: Tags, analytics, custom properties
   - PK: id (UUID)
   - FK: catalogue_id → content_catalogue(id) (UNIQUE)
   - Columns: tags (TEXT[]), relationships (JSONB), usage_analytics (JSONB)

**Indexes**:
- GIN indexes on all JSONB fields (data, metadata, conversation_data)
- B-tree indexes on foreign keys
- Composite index: (catalogue_id, is_default) on content_layout_assignments`,

    api_specifications: `**API Pattern**: Use Supabase client (no custom REST API needed)

**Service Methods**:

\`\`\`typescript
// contentTypeService.ts
class ContentTypeService {
  async createContent(typeId: string, data: any): Promise<Content>
  async getContent(id: string): Promise<Content>
  async updateContent(id: string, data: any): Promise<Content>
  async deleteContent(id: string): Promise<void>
  async listContent(filters?: ContentFilters): Promise<Content[]>
  async validateContent(typeId: string, data: any): Promise<ValidationResult>
}

// evaContentService.ts
class EVAContentService extends EVAConversationService {
  async recognizeContentIntent(message: string): Promise<ContentIntent | null>
  async createContentFromConversation(
    conversationId: string,
    contentType: string,
    ventureData: any
  ): Promise<Content>
  async linkContentToConversation(
    conversationId: string,
    catalogueId: string,
    linkType: LinkType
  ): Promise<void>
}
\`\`\`

**Supabase Queries**:
\`\`\`typescript
// Create content
const { data, error } = await supabase
  .from('content_catalogue')
  .insert({
    content_type_id: typeId,
    title: 'My Presentation',
    data: contentData,
    created_by: userId
  })
  .select()
  .single();

// List user's content
const { data, error } = await supabase
  .from('content_catalogue')
  .select('*, content_types(name, display_name)')
  .order('created_at', { ascending: false });
  // RLS automatically filters by created_by = auth.uid()
\`\`\``,

    ui_ux_requirements: `**Target URL**: http://localhost:8080/eva-assistant

**Layout Requirements**:
1. **EVA Chat Interface** (existing, top section)
   - User types: "EVA, create pitch deck"
   - EVA responds with content generation status

2. **Content Viewer** (new, main section)
   - Presentation mode with slide navigation
   - Keyboard shortcuts: ← → (prev/next), F (fullscreen)
   - Progress indicator (e.g., "3 / 10")

3. **Settings Panel** (new, accessible via gear icon)
   - Tabs: Layout Preferences, Default Views, Keyboard Shortcuts
   - Save button → persists to eva_user_settings

**Component Specifications**:
- Use Shadcn UI components (Button, Card, Tabs, Dialog)
- Tailwind CSS for styling
- Responsive breakpoints: sm (640px), md (768px), lg (1024px)
- Dark mode support (via existing theme system)

**Accessibility**:
- Keyboard navigation (arrows, F, Esc)
- ARIA labels on interactive elements
- Focus indicators visible`,

    implementation_approach: `**Phase-Based Implementation** (92 hours total):

**Phase 1: Database Foundation** (16h)
1. Apply migration: 20251011_eva_content_catalogue_mvp.sql to EHG database
2. Verify all 9 tables created
3. Verify RLS policies active
4. Verify seed data (3 content types, 1 layout)
5. Test queries with authenticated user

**Phase 2: Content Type Services** (20h)
1. Implement contentTypeService.ts (CRUD operations)
2. Build TextBlockRenderer.tsx (react-markdown)
3. Build DataTableRenderer.tsx (react-table)
4. Build ChartRenderer.tsx (recharts)
5. Unit tests for service layer

**Phase 3: Presentation Layout** (18h)
1. Implement LayoutEngine.tsx (orchestrator)
2. Build PresentationMode.tsx (slide deck)
3. Add keyboard shortcuts (arrows, F)
4. Implement slide transitions (Framer Motion)
5. Test responsive design

**Phase 4: EVA Integration** (22h)
1. Extend evaConversation.ts → evaContentService.ts
2. Implement intent recognition ("create presentation")
3. Implement content generation from venture data
4. Store conversations in eva_conversations table
5. Link content to conversations

**Phase 5: Settings & Testing** (16h)
1. Build EVASettingsPanel.tsx
2. Implement settings persistence
3. Write E2E tests (Playwright):
   - eva-content-creation.spec.ts
   - eva-presentation-mode.spec.ts
   - eva-settings-panel.spec.ts
4. Execute E2E tests (all must pass)
5. Document test evidence

**EXEC Pre-Implementation Checklist** (MANDATORY):
- [ ] Navigate to http://localhost:8080/eva-assistant
- [ ] Confirm page accessible (screenshot BEFORE changes)
- [ ] Identify target component (EVA assistant page)
- [ ] Verify application: /mnt/c/_EHG/EHG (NOT EHG_Engineer)
- [ ] Verify port: 8080 (Playwright) / 5173 (dev)
- [ ] Verify GitHub remote: rickfelix/ehg.git`,

    technology_stack: `**Frontend**:
- React 18
- TypeScript (strict mode)
- Vite (build tool)
- Tailwind CSS (styling)
- Shadcn UI (component library)

**Content Rendering**:
- react-markdown: ^9.0.0 (text blocks)
- react-table: ^8.0.0 (data tables)
- recharts: ^2.10.0 (charts)
- Framer Motion: ^11.0.0 (transitions)

**Backend/Database**:
- Supabase (PostgreSQL + RLS)
- @supabase/supabase-js: ^2.0.0

**Testing**:
- Vitest (unit tests)
- Playwright (E2E tests)
- Testing Library (component tests)

**Dev Tools**:
- ESLint
- Prettier
- TypeScript Compiler`,

    dependencies: `**External Dependencies** (to install):
\`\`\`json
{
  "react-markdown": "^9.0.0",
  "react-table": "^8.0.0",
  "recharts": "^2.10.0",
  "framer-motion": "^11.0.0"
}
\`\`\`

**Internal Dependencies**:
- Supabase client: /src/integrations/supabase/client.ts
- EVA conversation service: /src/services/evaConversation.ts
- Existing EVA components: /src/components/eva/

**Database Dependency**:
- Migration file: database/migrations/20251011_eva_content_catalogue_mvp.sql
- Status: NOT YET APPLIED
- Action: EXEC must apply to EHG database before implementation

**Risk**: If migration not applied, all content operations will fail (no tables exist)`,

    test_scenarios: `**COMPREHENSIVE TEST PLAN** (Testing-First Edition)

**Unit Tests** (Vitest, /src/services/eva-content/):
1. contentTypeService.createContent() - validates data against schema
2. contentTypeService.getContent() - retrieves content by ID
3. contentTypeService.updateContent() - updates existing content
4. contentTypeService.deleteContent() - soft delete or hard delete
5. evaContentService.recognizeIntent() - parses "create pitch deck"
6. evaContentService.generateContent() - creates content from venture data

**E2E Tests** (Playwright, port 8080):

\`\`\`typescript
// eva-content-creation.spec.ts
test('US-001: User can create content via EVA', async ({ page }) => {
  // Given: User is authenticated at http://localhost:8080/eva-assistant
  await page.goto('http://localhost:8080/eva-assistant');

  // When: User types "EVA, create pitch deck"
  await page.fill('[data-testid="eva-chat-input"]', 'EVA, create pitch deck');
  await page.click('[data-testid="eva-send-button"]');

  // Then: Content is generated and displayed
  await expect(page.locator('[data-testid="presentation-mode"]')).toBeVisible();
  await expect(page.locator('[data-testid="slide-1"]')).toContainText('Pitch Deck');
});

// eva-presentation-mode.spec.ts
test('US-002: User can navigate slides', async ({ page }) => {
  // Given: User has content in presentation mode
  await page.goto('http://localhost:8080/eva-assistant');
  await createTestContent(page);

  // When: User presses right arrow
  await page.keyboard.press('ArrowRight');

  // Then: Next slide displays
  await expect(page.locator('[data-testid="slide-indicator"]')).toContainText('2 / 5');
});

// eva-settings-panel.spec.ts
test('US-003: User can save settings', async ({ page }) => {
  // Given: User opens settings panel
  await page.goto('http://localhost:8080/eva-assistant');
  await page.click('[data-testid="settings-button"]');

  // When: User changes default layout
  await page.selectOption('[data-testid="default-layout"]', 'presentation');
  await page.click('[data-testid="save-settings"]');

  // Then: Settings persist in database
  // Verify by reloading page and checking saved value
});
\`\`\`

**Test Data**:
- Create test user account
- Seed test venture data (for content generation)
- Create 3 test content items (text, table, chart)

**Test Evidence Requirements**:
- Screenshots of passing tests
- Videos of test failures (if any)
- HTML test reports
- Coverage metrics (target: 80% for services)`,

    acceptance_criteria: `**MANDATORY Acceptance Criteria** (ALL must pass):

**AC-DATABASE**:
- ✅ AC-D1: All 9 tables created in EHG database (liapbndqlqxdcgpwntbv)
- ✅ AC-D2: RLS policies active (SELECT * returns only user's data)
- ✅ AC-D3: Seed data present (3 content types, 1 layout)
- ✅ AC-D4: GIN indexes on JSONB fields perform <100ms
- ✅ AC-D5: Timestamp triggers update automatically

**AC-CONTENT-TYPES**:
- ✅ AC-C1: Text blocks render markdown (headings, lists, links)
- ✅ AC-C2: Tables support sorting (click column header)
- ✅ AC-C3: Tables support filtering (search input)
- ✅ AC-C4: Charts render 4 types (bar, line, pie, area)
- ✅ AC-C5: Content validates against JSON schemas
- ✅ AC-C6: CRUD operations work (Create, Read, Update, Delete)

**AC-PRESENTATION**:
- ✅ AC-P1: Slides render content from database
- ✅ AC-P2: Navigation buttons functional (prev/next)
- ✅ AC-P3: Keyboard shortcuts work (← → F)
- ✅ AC-P4: Responsive on mobile/tablet/desktop
- ✅ AC-P5: Transitions smooth (60fps)
- ✅ AC-P6: Progress indicator accurate ("3 / 10")

**AC-EVA-INTEGRATION**:
- ✅ AC-E1: EVA recognizes "create pitch deck" intent
- ✅ AC-E2: Content generated from venture data (5 slides minimum)
- ✅ AC-E3: Conversation stored in eva_conversations table
- ✅ AC-E4: Content linked to conversation (conversation_content_links)
- ✅ AC-E5: User can view conversation history

**AC-SETTINGS**:
- ✅ AC-S1: Settings panel accessible at http://localhost:8080/eva-assistant
- ✅ AC-S2: Settings persist in eva_user_settings table
- ✅ AC-S3: Settings load on page refresh

**AC-TESTING** (MANDATORY - Testing-First Edition):
- ✅ AC-T1: Unit tests pass (npm run test:unit)
- ✅ AC-T2: E2E tests pass (npm run test:e2e)
- ✅ AC-T3: E2E test coverage: 100% of user stories
- ✅ AC-T4: Test evidence collected (screenshots, videos, HTML reports)
- ✅ AC-T5: No console errors during E2E test execution

**AC-PERFORMANCE**:
- ✅ AC-PF1: Content catalogue loads <500ms (100 items)
- ✅ AC-PF2: Slide transitions maintain 60fps
- ✅ AC-PF3: Database queries <100ms (with GIN indexes)

**BLOCKING Criteria** (SD cannot be marked complete if ANY fail):
- ❌ Migration not applied → BLOCKED (tables don't exist)
- ❌ E2E tests failing → BLOCKED (must achieve 100% pass)
- ❌ URL not accessible → BLOCKED (http://localhost:8080/eva-assistant)
- ❌ Content doesn't render → BLOCKED (core functionality broken)`,

    performance_requirements: `**PR-1: Page Load Performance**
- Initial load: <2 seconds (first meaningful paint)
- Content catalogue: <500ms for 100 items
- Lighthouse score: >90 (Performance, Accessibility)

**PR-2: Rendering Performance**
- Slide transitions: 60fps (16.67ms per frame)
- Chart rendering: <200ms for 100 data points
- Table rendering: <300ms for 1000 rows (with virtualization if needed)

**PR-3: Database Performance**
- JSONB queries: <100ms (with GIN indexes)
- Content fetch: <50ms (single item by ID)
- List query: <200ms (paginated, 20 items per page)

**PR-4: Network Performance**
- Bundle size: <500KB (gzipped, excluding Supabase SDK)
- Code splitting: Lazy load chart/table renderers
- Image optimization: WebP format, lazy loading`,

    plan_checklist: `**PLAN Phase Checklist** (100% complete):

✅ **5-Step SD Evaluation**:
1. ✅ Query strategic_directives_v2: SD-EVA-CONTENT-001 retrieved
2. ✅ Query product_requirements_v2: No existing PRD (creating now)
3. ✅ Query sd_backlog_map: 7 items retrieved, 5 approved for MVP
4. ✅ Search codebase: Infrastructure patterns identified
5. ✅ Gap analysis: Migration ready, components need creation

✅ **Sub-Agent Assessments**:
- ✅ Principal Database Architect: Schema production-ready, not yet applied
- ✅ Senior Design Sub-Agent: All components optimally sized (300-600 LOC)
- ✅ (Security Architect completed in LEAD phase)

✅ **PRD Quality**:
- ✅ Executive summary with target URL
- ✅ Business objectives from backlog
- ✅ Detailed features from extras.Description_1
- ✅ Acceptance criteria (measurable, ALL must pass)
- ✅ Comprehensive test plan (unit + E2E, user story mapping)
- ✅ Component architecture (8 components, file structure)
- ✅ Database schema (9 tables, migration file)
- ✅ Technology stack documented
- ✅ EXEC pre-implementation checklist included

✅ **Next Steps**:
- Create PLAN→EXEC handoff
- Generate user stories (Product Requirements Expert auto-trigger)`,

    exec_checklist: `**EXEC Pre-Implementation Checklist** (MANDATORY - complete BEFORE any code):

🔴 **STEP 0: Application Context Validation** (MOST CRITICAL)
- [ ] Read SD description: Target is EHG application (customer-facing)
- [ ] Navigate to /mnt/c/_EHG/EHG (NOT /mnt/c/_EHG/EHG_Engineer)
- [ ] Run: pwd (should show /mnt/c/_EHG/EHG)
- [ ] Run: git remote -v (should show rickfelix/ehg.git)
- [ ] If wrong directory → STOP immediately, correct before proceeding

🔴 **STEP 1: Database Migration** (BLOCKING if not done)
- [ ] File location: /mnt/c/_EHG/EHG_Engineer/database/migrations/20251011_eva_content_catalogue_mvp.sql
- [ ] Apply to EHG database: liapbndqlqxdcgpwntbv
- [ ] Verify 9 tables created: content_types, screen_layouts, content_catalogue, content_versions, content_layout_assignments, eva_conversations, conversation_content_links, eva_user_settings, content_item_metadata
- [ ] Verify seed data: 3 content types (text_block, data_table, chart), 1 layout (presentation)
- [ ] Test RLS: Query content_types table with authenticated user

🔴 **STEP 2: URL Verification**
- [ ] Navigate to http://localhost:8080/eva-assistant
- [ ] Confirm page accessible (screenshot BEFORE changes)
- [ ] Identify EVA assistant component location
- [ ] Document: "Verified: http://localhost:8080/eva-assistant is accessible"

🔴 **STEP 3: Component Identification**
- [ ] Locate EVA assistant page file: /src/pages/eva-assistant.tsx or similar
- [ ] Confirm component exists at specified location
- [ ] Document: "Target component: [full/path/to/component.tsx]"

🔴 **STEP 4: Port Configuration**
- [ ] Dev server port: 5173 (npm run dev)
- [ ] Playwright test port: 8080
- [ ] Update playwright.config.ts if needed

🔴 **STEP 5: Dependencies Installation**
- [ ] npm install react-markdown@^9.0.0
- [ ] npm install react-table@^8.0.0
- [ ] npm install recharts@^2.10.0
- [ ] npm install framer-motion@^11.0.0

**Post-Implementation Checklist**:
- [ ] Unit tests pass: npm run test:unit
- [ ] E2E tests pass: npm run test:e2e (100% user stories)
- [ ] Dev server restart: pkill + npm run build:client + npm run dev
- [ ] Hard refresh browser: Ctrl+Shift+R
- [ ] Screenshot implementation working
- [ ] Git commit with SD-ID: feat(SD-EVA-CONTENT-001): ...
- [ ] Wait for CI/CD (GitHub Actions green)`,

    validation_checklist: `**PLAN Supervisor Verification Checklist**:

✅ **PRD Quality Gates**:
1. ✅ Executive summary includes target URL
2. ✅ Business objectives derived from backlog
3. ✅ Detailed features mapped from extras.Description_1
4. ✅ Acceptance criteria measurable and comprehensive
5. ✅ Test plan includes user story mapping (E2E)
6. ✅ Component architecture documented (8 components)
7. ✅ Database schema validated (9 tables, migration ready)
8. ✅ EXEC checklist includes pre-implementation steps

✅ **Sub-Agent Validation**:
1. ✅ Database Architect: Migration production-ready
2. ✅ Design Sub-Agent: Component sizing optimal
3. ✅ (QA Director will execute in EXEC phase)

✅ **Handoff Readiness**:
1. ✅ 7 handoff elements prepared
2. ✅ Action items for EXEC defined
3. ✅ Known issues documented (migration not yet applied)
4. ✅ Resource utilization tracked`,

    risks: `**R-1: Migration Application Failure** (Severity: HIGH)
- Risk: Migration fails to apply to EHG database
- Impact: No tables exist, all content operations fail
- Mitigation: Validate migration syntax before EXEC, Database Architect already reviewed
- Contingency: Rollback and fix migration, reapply

**R-2: Performance Degradation** (Severity: MEDIUM)
- Risk: Large content catalogues (>1000 items) slow down queries
- Impact: User experience degrades, load times >2s
- Mitigation: GIN indexes on JSONB, pagination (20 items per page), lazy loading
- Contingency: Add query optimization, consider caching

**R-3: E2E Test Failures** (Severity: MEDIUM)
- Risk: E2E tests fail due to timing issues or selector brittleness
- Impact: Cannot mark SD complete (testing mandatory)
- Mitigation: Use data-testid attributes, waitForSelector with timeouts, retry logic
- Contingency: Debug failures, fix tests or implementation

**R-4: Intent Recognition Accuracy** (Severity: LOW)
- Risk: EVA misunderstands "create pitch deck" intent
- Impact: Content not generated, user frustrated
- Mitigation: Pattern matching with multiple phrases, fallback to explicit UI button
- Contingency: Improve intent recognition, add more training examples`,

    constraints: `**C-1: Database Schema Fixed**
- Migration file already created (9 tables)
- Cannot modify schema without new migration
- RLS policies must remain (security requirement)

**C-2: Target URL Fixed**
- Implementation MUST be at http://localhost:8080/eva-assistant
- Cannot change URL without LEAD approval
- EXEC MUST verify URL accessibility before implementation

**C-3: Component Sizing Limit**
- Each component: 300-600 LOC (optimal range)
- If component grows >800 LOC, MUST split
- Enforced by Design Sub-Agent review

**C-4: Testing Mandatory**
- Unit tests: MUST pass before EXEC→PLAN handoff
- E2E tests: MUST pass before EXEC→PLAN handoff
- 100% user story coverage: MANDATORY
- No exceptions per LEO Protocol v4.2.0

**C-5: No Markdown Files**
- Database-first enforcement
- No PRD markdown files
- No handoff markdown files
- All data in database tables only`,

    assumptions: `**A-1: Database Access**
- Assume EXEC has access to EHG Supabase (liapbndqlqxdcgpwntbv)
- Assume migration permissions granted
- Assume RLS policies don't block EXEC operations

**A-2: Existing EVA Functionality**
- Assume /src/services/evaConversation.ts is functional
- Assume EVA assistant page exists at http://localhost:8080/eva-assistant
- Assume Supabase client configured correctly

**A-3: Dependencies Available**
- Assume npm registry accessible
- Assume react-markdown, react-table, recharts install successfully
- Assume no version conflicts with existing packages

**A-4: Testing Environment**
- Assume Playwright configured for port 8080
- Assume test database accessible
- Assume test user account available

**A-5: Venture Data Available**
- Assume venture data exists in database (for content generation)
- Assume queries like "create pitch deck" have data to work with
- Assume fallback content if no venture data exists`,

    stakeholders: `**Primary Stakeholders**:
1. End Users: Venture creators using EVA to generate content
2. EXEC Agent: Implements features per this PRD
3. QA Engineering Director: Validates E2E tests (100% coverage)
4. PLAN Supervisor: Verifies PRD completeness

**Secondary Stakeholders**:
1. Database Architect: Validated migration, monitors performance
2. Security Architect: Validated RLS policies in LEAD phase
3. Design Sub-Agent: Validated component sizing

**Approval Chain**:
- PRD Author: PLAN Agent (this PRD)
- PRD Reviewer: PLAN Supervisor (auto-validates)
- Final Approver: LEAD Agent (after EXEC complete + verification)`,

    approved_by: 'PLAN_AGENT',
    approval_date: new Date().toISOString(),

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'PLAN_AGENT'
  };

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const insertSQL = `
      INSERT INTO product_requirements_v2 (
        directive_id, sd_id, title, version, status, category, priority,
        executive_summary, business_context, technical_context,
        functional_requirements, non_functional_requirements,
        technical_requirements, system_architecture, data_model,
        api_specifications, ui_ux_requirements, implementation_approach,
        technology_stack, dependencies, test_scenarios, acceptance_criteria,
        performance_requirements, plan_checklist, exec_checklist,
        validation_checklist, risks, constraints, assumptions, stakeholders,
        approved_by, approval_date, created_at, updated_at, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32, $33, $34, $35
      ) RETURNING id, title, sd_id, status, created_at;
    `;

    const values = [
      prd.directive_id, prd.sd_id, prd.title, prd.version, prd.status,
      prd.category, prd.priority, prd.executive_summary, prd.business_context,
      prd.technical_context, prd.functional_requirements,
      prd.non_functional_requirements, prd.technical_requirements,
      prd.system_architecture, prd.data_model, prd.api_specifications,
      prd.ui_ux_requirements, prd.implementation_approach,
      prd.technology_stack, prd.dependencies, prd.test_scenarios,
      prd.acceptance_criteria, prd.performance_requirements,
      prd.plan_checklist, prd.exec_checklist, prd.validation_checklist,
      prd.risks, prd.constraints, prd.assumptions, prd.stakeholders,
      prd.approved_by, prd.approval_date, prd.created_at, prd.updated_at,
      prd.created_by
    ];

    const result = await client.query(insertSQL, values);
    const data = result.rows[0];

    console.log('✅ PRD CREATED SUCCESSFULLY!\n');
    console.log('📋 PRD ID:', data.id);
    console.log('🎯 Title:', data.title);
    console.log('🔗 SD:', data.sd_id);
    console.log('📊 Status:', data.status);
    console.log('⏱️  Created:', data.created_at);
    console.log('\n✅ PLAN PRD CREATION COMPLETE');
    console.log('➡️  Next: Generate user stories, create PLAN→EXEC handoff\n');

  } catch (err) {
    console.error('❌ Error creating PRD:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    await client.end();
  }
}

createPRD();
