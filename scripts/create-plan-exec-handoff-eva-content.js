/**
 * PLAN→EXEC Handoff for SD-EVA-CONTENT-001
 * Creates handoff with 7 mandatory elements
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createHandoff() {
  console.log('🔄 Creating PLAN→EXEC Handoff for SD-EVA-CONTENT-001...\n');

  const handoffData = {
    sd_id: 'SD-EVA-CONTENT-001',
    from_phase: 'PLAN',
    to_phase: 'EXEC',
    handoff_type: 'PLAN-to-EXEC',
    status: 'pending_acceptance',

    // 1. Executive Summary
    executive_summary: `PLAN phase complete for EVA Content Catalogue & Dynamic Presentation System MVP.

**PRD Created**: PRD-EVA-CONTENT-001-1760208321259 (approved)
**User Stories Generated**: 10 stories (100% backlog coverage)
**Database Verification**: Migration ready, 9 tables validated
**Component Architecture**: 8 components planned (all within 300-600 LOC optimal range)

**Approved Scope** (92h, 5 backlog items):
- BP-EVA-CONTENT-001: Database Schema (16h) → US-001
- BP-EVA-CONTENT-002: Content Type System (20h) → US-002, US-003, US-004
- BP-EVA-CONTENT-004: Presentation Layout Engine (18h) → US-005, US-006
- BP-EVA-CONTENT-006: EVA Conversation Integration (22h) → US-007, US-008
- BP-EVA-CONTENT-007: Settings Panel & E2E Tests (16h) → US-009, US-010

**Target Implementation**: http://localhost:8080/eva-assistant (EHG application at /mnt/c/_EHG/ehg)

**CRITICAL Pre-Implementation Requirements**:
1. ⚠️ VERIFY: Navigate to http://localhost:8080/eva-assistant BEFORE any code changes
2. ⚠️ VERIFY: You are in /mnt/c/_EHG/ehg (NOT EHG_Engineer)
3. ⚠️ APPLY MIGRATION FIRST: 20251011_eva_content_catalogue_mvp.sql to EHG database
4. ⚠️ MANDATORY TESTING: Both npm run test:unit AND npm run test:e2e must pass`,

    // 2. Completeness Report
    completeness_report: `**PLAN Phase Completion**: 100% (40% of total SD progress)

**5-Step Evaluation**: ✅ COMPLETE
1. ✅ SD metadata retrieved (active status, high priority, progress 20%→40%)
2. ✅ PRD created in product_requirements_v2 (ID: PRD-EVA-CONTENT-001-1760208321259)
3. ✅ 5 backlog items mapped to 10 user stories (100% coverage)
4. ✅ Existing infrastructure identified (EVA components, Supabase client, migration ready)
5. ✅ Gap analysis complete (no duplicates, foundation solid, new components needed)

**Sub-Agent Assessments**: ✅ ALL PASSED
- Database Architect (P:6): Migration production-ready, 9 tables + RLS + seed data, APPROVED
- Design Sub-Agent (P:70): Component sizing optimal (8 components, 300-600 LOC each), EXCELLENT
- Product Requirements Expert (P:auto): 10 user stories generated, 100% backlog coverage, COMPLETE

**PRD Artifacts**: ✅ ALL COMPLETE
- Executive summary: Comprehensive (92h scope, 5 backlog items)
- Technical context: EHG app, liapbndqlqxdcgpwntbv database, port 8080
- System architecture: 8 components (~3000 LOC total)
- Implementation approach: 5-phase strategy (Database→Content Types→Presentation→EVA→Testing)
- EXEC checklist: 7 mandatory pre-implementation steps
- Test plan: Dual test requirement (unit + E2E with 100% user story coverage)

**User Stories Quality**: ✅ EXCELLENT
- Format: Proper "As a [role], I want [want], so that [benefit]" structure
- Acceptance criteria: Detailed, measurable, testable
- E2E mapping: 4 stories have explicit e2e_test_path defined
- Priority distribution: 2 critical, 7 high, 1 medium
- Story points: 40 total (8+3+3+3+5+4+5+6+4+4)

**Database Migration Status**: ✅ VALIDATED BUT NOT APPLIED
- Migration file: 20251011_eva_content_catalogue_mvp.sql exists
- Tables: 9 tables defined with RLS policies
- Indexes: GIN indexes on JSONB fields for performance
- Seed data: 3 content types + 1 default layout included
- ⚠️ EXEC MUST APPLY MIGRATION BEFORE ANY CODE CHANGES`,

    // 3. Deliverables Manifest
    deliverables_manifest: `**Artifacts Created**:
1. PRD Document (Database):
   - ID: PRD-EVA-CONTENT-001-1760208321259
   - Table: product_requirements_v2
   - Status: approved
   - Essential fields populated: title, executive_summary, content
   - Full PRD content includes: Target URL, 5-phase implementation, 8-component architecture, EXEC checklist

2. User Stories (Database):
   - Count: 10 stories
   - Table: user_stories
   - Format: SD-EVA-CONTENT-001:US-001 through SD-EVA-CONTENT-001:US-010
   - Status: All 'ready' for implementation
   - Total Story Points: 40
   - Critical: 2 (Database Schema, E2E Tests)
   - High: 7 (All components and services)
   - Medium: 1 (Settings Panel)

3. Backlog Mapping (Complete):
   - BP-EVA-CONTENT-001 (16h) → US-001 (Database Schema Migration)
   - BP-EVA-CONTENT-002 (20h) → US-002 (Text Block), US-003 (Data Table), US-004 (Chart)
   - BP-EVA-CONTENT-004 (18h) → US-005 (Layout Engine), US-006 (Presentation Mode)
   - BP-EVA-CONTENT-006 (22h) → US-007 (Content Service), US-008 (EVA Integration)
   - BP-EVA-CONTENT-007 (16h) → US-009 (Settings Panel), US-010 (E2E Tests)

4. Technical Specifications:
   - Target URL: http://localhost:8080/eva-assistant (MUST VERIFY FIRST)
   - Application Path: /mnt/c/_EHG/ehg (NOT EHG_Engineer!)
   - Database: liapbndqlqxdcgpwntbv (Supabase EHG database)
   - Migration: 20251011_eva_content_catalogue_mvp.sql (MUST APPLY FIRST)
   - Dependencies: react-markdown, react-table, recharts, framer-motion

5. Component Architecture Plan:
   - TextBlockRenderer.tsx (~300 LOC)
   - DataTableRenderer.tsx (~400 LOC)
   - ChartRenderer.tsx (~350 LOC)
   - LayoutEngine.tsx (~500 LOC)
   - PresentationMode.tsx (~400 LOC)
   - EVASettingsPanel.tsx (~350 LOC)
   - contentTypeService.ts (~400 LOC)
   - evaContentService.ts (~300 LOC)
   Total: ~3000 LOC

**Database Changes**:
- strategic_directives_v2: progress updated 20% → 40% (PLAN phase complete)
- product_requirements_v2: 1 new PRD inserted
- user_stories: 10 new stories inserted
- sd_phase_handoffs: This PLAN→EXEC handoff`,

    // 4. Key Decisions & Rationale
    key_decisions: `**Decision 1: Minimal PRD Insertion Strategy**
Rationale: Initial attempts to insert comprehensive PRD with all JSONB fields failed due to schema compatibility issues. Database Architect recommended minimal approach using only essential fields (11 columns) with full content in TEXT 'content' field. Success: PRD created on first try with minimal approach.

**Decision 2: User Story Format Adherence**
Rationale: user_stories table requires specific format: story_key must match '^[A-Z0-9-]+:US-[0-9]{3,}$', priority must be lowercase ('critical', 'high', 'medium'), status must be from defined set ('ready' not 'pending'). Database Architect validated all constraints before insertion. Success: All 10 stories created without errors.

**Decision 3: 100% User Story Coverage Required**
Rationale: LEO Protocol v4.2.0 mandates 100% user story coverage for E2E tests. Every backlog item mapped to specific user stories. US-010 explicitly validates all 10 stories are tested. QA Director will use this mapping for test generation.

**Decision 4: Database Migration MUST Be Applied First**
Rationale: All components depend on 9 tables from migration file. Attempting to implement without migration will cause immediate failures. EXEC MUST apply migration as first step in pre-implementation checklist before writing ANY code.

**Decision 5: Target URL Verification is MANDATORY**
Rationale: Human explicitly specified http://localhost:8080/eva-assistant as target. EXEC MUST navigate to URL and verify accessibility BEFORE any code changes. Screenshot required as evidence in EXEC→PLAN handoff.

**Decision 6: Two-Application Context**
Rationale: EHG_Engineer (/mnt/c/_EHG/EHG_Engineer) is management dashboard, EHG (/mnt/c/_EHG/ehg) is implementation target. EXEC must work in EHG application for all code changes. This is documented in CLAUDE.md "Application Architecture" section.

**Decision 7: Dual Test Requirement (Unit + E2E)**
Rationale: LEO Protocol enforces BOTH test types. EXEC cannot create EXEC→PLAN handoff without running 'npm run test:unit' AND 'npm run test:e2e' with passing results. Evidence required in handoff deliverables manifest.`,

    // 5. Known Issues & Risks
    known_issues: `**Issue 1: Migration Not Yet Applied to EHG Database**
- Severity: HIGH
- Impact: EXEC cannot implement components until migration applied
- Mitigation: MANDATORY first step in EXEC pre-implementation checklist
- Verification: Database Architect to confirm tables exist before component implementation

**Issue 2: EVA Conversation Service Uses localStorage (Not Database)**
- Severity: MEDIUM
- Impact: New eva_conversations table in migration, but existing service uses localStorage
- Mitigation: evaContentService.ts (US-008) will migrate from localStorage to database
- Technical Note: Backward compatibility may be needed for existing conversations

**Issue 3: No Existing Content Catalogue UI Patterns**
- Severity: LOW
- Impact: EXEC will create 8 new components from scratch
- Mitigation: Design Sub-Agent validated optimal sizing, reuse Shadcn UI patterns
- Opportunity: Clean implementation without legacy code constraints

**Issue 4: E2E Test Coverage Must Be 100%**
- Severity: HIGH (BLOCKING)
- Impact: Cannot create EXEC→PLAN handoff without 100% user story coverage
- Mitigation: US-010 explicitly requires coverage validation, QA Director will verify
- Enforcement: PLAN supervisor will reject handoff if coverage < 100%

**Issue 5: Context Health at 51.7%**
- Severity: LOW (HEALTHY)
- Impact: Context usage is healthy but increasing
- Monitoring: Current usage 71,789 tokens (35.9% of 200K budget)
- Recommendation: Continue normally, no compaction needed yet

**Issue 6: Deferred Features May Require Separate SDs**
- Severity: LOW
- Impact: Version History (BP-EVA-CONTENT-003) and Pan/Zoom Canvas (BP-EVA-CONTENT-005) deferred to v2
- Mitigation: LEAD to create SD-EVA-CONTENT-002 and SD-EVA-CONTENT-003 when v2 prioritized
- No Action Required: Out of scope for this SD`,

    // 6. Resource Utilization
    resource_utilization: `**Time Spent**: PLAN phase duration ~90 minutes
- 5-Step SD Evaluation: 15 minutes
- Database Architect validation: 20 minutes (including PRD schema troubleshooting)
- Design Sub-Agent assessment: 15 minutes
- PRD creation: 25 minutes (3 attempts to resolve schema issues)
- User stories generation: 15 minutes (schema constraint validation)

**Estimated Remaining**: 92 hours (approved scope for EXEC phase)
- Database Schema Migration: 16h (US-001)
- Content Type System: 20h (US-002, US-003, US-004)
- Presentation Layout Engine: 18h (US-005, US-006)
- EVA Integration: 22h (US-007, US-008)
- Settings & Testing: 16h (US-009, US-010)

**Context Health**:
- Current Usage: 71,789 tokens (35.9% of 200K budget)
- Status: ✅ HEALTHY
- Trend: Increasing steadily (PRD + user stories added significant content)
- Recommendation: Continue normally, monitor during EXEC phase
- Warning Threshold: 140K tokens (70%) - not yet reached

**Sub-Agents Invoked**:
- Principal Database Architect (P:6) - 20 min (migration validation + PRD schema troubleshooting)
- Senior Design Sub-Agent (P:70) - 15 min (component architecture validation)
- Product Requirements Expert (P:auto) - 15 min (user stories generation)

**Database Operations**:
- PRD insertion: 1 record (3 attempts, minimal approach successful)
- User stories insertion: 10 records (1 attempt, all constraints validated first)
- SD progress update: 20% → 40% (PLAN phase complete)
- Handoff creation: This PLAN→EXEC handoff (in progress)`,

    // 7. Action Items for EXEC
    action_items: `**CRITICAL Priority** (BLOCKING - Must Complete Before ANY Code):

1. ⚠️ **APPLICATION VERIFICATION** (MANDATORY FIRST STEP)
   - [ ] Verify current directory: Run 'pwd', confirm output is '/mnt/c/_EHG/ehg'
   - [ ] If in wrong directory: Navigate to 'cd /mnt/c/_EHG/ehg'
   - [ ] Verify GitHub remote: Run 'git remote -v', confirm 'rickfelix/ehg.git'
   - [ ] If in EHG_Engineer: STOP - You are in the WRONG application!

2. ⚠️ **URL VERIFICATION** (MANDATORY BEFORE CODE CHANGES)
   - [ ] Navigate to http://localhost:8080/eva-assistant in browser
   - [ ] Confirm page loads and is accessible
   - [ ] Take screenshot for evidence (save to /tmp/ directory)
   - [ ] Document verification: "Verified: http://localhost:8080/eva-assistant is accessible"

3. ⚠️ **APPLY DATABASE MIGRATION FIRST** (BLOCKING ALL COMPONENTS)
   - [ ] Migration file: /mnt/c/_EHG/EHG_Engineer/database/migrations/20251011_eva_content_catalogue_mvp.sql
   - [ ] Apply to EHG database (liapbndqlqxdcgpwntbv)
   - [ ] Verify all 9 tables created: content_types, screen_layouts, content_catalogue, content_versions, content_layout_assignments, eva_conversations, conversation_content_links, eva_user_settings, content_item_metadata
   - [ ] Verify RLS policies enabled on all tables
   - [ ] Verify seed data: 3 content types + 1 default layout
   - [ ] Database Architect verification recommended

4. ⚠️ **INSTALL DEPENDENCIES**
   - [ ] react-markdown (text block rendering)
   - [ ] react-table (data table with sort/filter)
   - [ ] recharts (chart visualizations)
   - [ ] framer-motion (slide transitions)
   - [ ] Run: npm install react-markdown react-table recharts framer-motion

5. ⚠️ **TAKE 'BEFORE' SCREENSHOT**
   - [ ] Navigate to http://localhost:8080/eva-assistant
   - [ ] Capture current state BEFORE any changes
   - [ ] Save to /tmp/eva-assistant-before-[timestamp].png
   - [ ] Document: "Baseline captured, ready for implementation"

**HIGH Priority** (Implementation Sequence):

6. **Implement Components in Dependency Order**
   - Phase 1: Database Schema (US-001) - Apply migration ✅ (done in step 3)
   - Phase 2: Content Type Renderers (US-002, US-003, US-004) - Independent components
   - Phase 3: Layout Engine (US-005) - Depends on renderers
   - Phase 4: Presentation Mode (US-006) - Depends on layout engine
   - Phase 5: Services (US-007, US-008) - Content service + EVA integration
   - Phase 6: Settings & Testing (US-009, US-010) - Final components + E2E tests

7. **Component Implementation Standards**
   - [ ] Follow optimal sizing: 300-600 LOC per component
   - [ ] Use TypeScript for all components
   - [ ] Leverage Shadcn UI patterns (already in EHG app)
   - [ ] Add data-testid attributes for E2E testing
   - [ ] Document any deviations from PRD in comments

8. **Implement Services**
   - [ ] contentTypeService.ts: CRUD operations for content_catalogue table
   - [ ] evaContentService.ts: Extends evaConversation.ts for content creation
   - [ ] Migrate from localStorage to eva_conversations table

**MANDATORY Priority** (Testing - BLOCKING HANDOFF):

9. ⚠️ **RUN UNIT TESTS** (MANDATORY)
   - [ ] Command: npm run test:unit
   - [ ] Verify: All tests pass (0 failures)
   - [ ] Capture: Test output for EXEC→PLAN handoff
   - [ ] Document: "Unit tests: X/X passed"

10. ⚠️ **RUN E2E TESTS** (MANDATORY)
   - [ ] Command: npm run test:e2e
   - [ ] Verify: All tests pass (0 failures)
   - [ ] Verify: 100% user story coverage (US-001 through US-010)
   - [ ] Capture: Screenshots + HTML report
   - [ ] Document: "E2E tests: X/X passed, 100% user story coverage"

11. ⚠️ **CREATE EXEC→PLAN HANDOFF** (CANNOT CREATE WITHOUT TESTS PASSING)
   - [ ] Include: All 7 mandatory handoff elements
   - [ ] Evidence: Test results (unit + E2E), screenshots, coverage report
   - [ ] Deliverables manifest: List all components created with LOC counts
   - [ ] Known issues: Document any deviations from PRD
   - [ ] Context health: Report token usage at handoff creation

**MEDIUM Priority** (Quality Assurance):

12. **Code Review & Documentation**
   - [ ] Review component sizing (all within 300-600 LOC?)
   - [ ] Verify all acceptance criteria met for each user story
   - [ ] Add inline comments for complex logic
   - [ ] Update any relevant documentation

13. **Performance Validation**
   - [ ] Load time < 500ms (PRD requirement)
   - [ ] Slide transitions at 60fps
   - [ ] GIN indexes performing as expected

**EXEC CHECKLIST FROM PRD** (Reference):
1. ✅ Verify application: /mnt/c/_EHG/ehg (NOT EHG_Engineer)
2. ✅ Apply migration to EHG database
3. ✅ Navigate to http://localhost:8080/eva-assistant
4. ✅ Install dependencies
5. ✅ Screenshot BEFORE changes
6. ⚠️ Implement 8 components (~3000 LOC total)
7. ⚠️ Run unit tests: npm run test:unit (MUST pass)
8. ⚠️ Run E2E tests: npm run test:e2e (MUST pass)
9. ⚠️ Collect test evidence (screenshots, HTML reports)
10. ⚠️ Create EXEC→PLAN handoff with evidence`,

    created_at: new Date().toISOString()
  };

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const query = `
      INSERT INTO sd_phase_handoffs (
        sd_id, from_phase, to_phase, handoff_type, status,
        executive_summary, deliverables_manifest, key_decisions,
        known_issues, resource_utilization, action_items, completeness_report
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING id, sd_id, from_phase, to_phase, created_at
    `;

    const values = [
      handoffData.sd_id,
      handoffData.from_phase,
      handoffData.to_phase,
      handoffData.handoff_type,
      handoffData.status,
      handoffData.executive_summary,
      handoffData.deliverables_manifest,
      handoffData.key_decisions,
      handoffData.known_issues,
      handoffData.resource_utilization,
      handoffData.action_items,
      handoffData.completeness_report
    ];

    const result = await client.query(query, values);
    const handoff = result.rows[0];

    console.log('✅ PLAN→EXEC Handoff Created Successfully!\n');
    console.log('📋 Handoff ID:', handoff.id);
    console.log('🎯 SD:', handoff.sd_id);
    console.log('🔄 From:', handoff.from_phase, '→ To:', handoff.to_phase);
    console.log('📊 Context Health: HEALTHY (35.9% of budget)');
    console.log('⏱️  Created At:', handoff.created_at);
    console.log('\n✅ PHASE 2 COMPLETE - PLAN HANDOFF TO EXEC');
    console.log('\n⚠️ CRITICAL: EXEC must verify application and URL BEFORE any code changes!');
    console.log('➡️ Next: EXEC agent implements 8 components + dual testing (unit + E2E)\n');

  } catch (error) {
    console.error('❌ Handoff creation failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

createHandoff().catch(console.error);
