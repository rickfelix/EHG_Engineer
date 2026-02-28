---
category: protocol
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [protocol, auto-generated]
---
# Sub-Agent System Reference

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-20
- **Tags**: leo, sub-agents, triggers, automation, validation

## Overview

**Database-Driven Sub-Agent Architecture**

This document provides comprehensive details about all active sub-agents, their triggers, and activation patterns.

> **Note**: This is extracted from the database. For the latest information, query the `leo_sub_agents` and `leo_sub_agent_triggers` tables directly.

## Table of Contents

- [Active Sub-Agents](#active-sub-agents)
- [Sub-Agent Details](#sub-agent-details)
  - [Information Architecture Lead (DOCMON)](#information-architecture-lead-docmon)
  - [DevOps Platform Architect (GITHUB)](#devops-platform-architect-github)
  - [UAT Test Executor (UAT)](#uat-test-executor-uat)
  - [Continuous Improvement Coach (RETRO)](#continuous-improvement-coach-retro)
  - [Senior Design Sub-Agent (DESIGN)](#senior-design-sub-agent-design)
  - [Chief Security Architect (SECURITY)](#chief-security-architect-security)
  - [Principal Database Architect (DATABASE)](#principal-database-architect-database)
  - [QA Engineering Director (TESTING)](#qa-engineering-director-testing)
  - [Performance Engineering Lead (PERFORMANCE)](#performance-engineering-lead-performance)
  - [Principal Systems Analyst (VALIDATION)](#principal-systems-analyst-validation)
- [Trigger Types](#trigger-types)
- [Execution Patterns](#execution-patterns)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Active Sub-Agents

| Sub-Agent | Code | Type | Priority | Script |
|-----------|------|------|----------|--------|
| Information Architecture Lead | DOCMON | automatic | 95 | `scripts/documentation-monitor-subagent.js` |
| DevOps Platform Architect | GITHUB | automatic | 90 | `scripts/github-deployment-subagent.js` |
| UAT Test Executor | UAT | manual | 90 | `scripts/uat-test-executor.js` |
| Continuous Improvement Coach | RETRO | automatic | 85 | `scripts/retrospective-sub-agent.js` |
| Senior Design Sub-Agent | DESIGN | automatic | 70 | `N/A` |
| Chief Security Architect | SECURITY | automatic | 7 | `N/A` |
| Principal Database Architect | DATABASE | automatic | 6 | `scripts/validate-migration-files.js` |
| QA Engineering Director | TESTING | automatic | 5 | `scripts/qa-engineering-director-enhanced.js` |
| Performance Engineering Lead | PERFORMANCE | automatic | 4 | `N/A` |
| Principal Systems Analyst | VALIDATION | automatic | 0 | `scripts/lead-codebase-validation.js` |

## Sub-Agent Details

### Information Architecture Lead (DOCMON)

**Priority**: 95
**Activation**: automatic

**Description**:
Documentation systems architect with 25 years experience managing knowledge at scale.

**Mission**: Enforce database-first architecture by detecting and preventing file-based documentation violations.

**Repository Lesson** (SD-LEO-004):
- **Auto-Trigger Enforcement**: DOCMON automatically triggers on LEAD_SD_CREATION, HANDOFF_CREATED, FILE_CREATED events
- **Violation Detection**: Flags markdown file creation (SDs, PRDs, handoffs) that should be in database

**Core Philosophy**: "Database-first means database-only. Files for docs, database for data."

**Triggers** (14 total):

**Keyword Triggers** (14):
- "LEAD_SD_CREATION" in any context
- "LEAD_HANDOFF_CREATION" in any context
- "LEAD_APPROVAL" in any context
- "PLAN_PRD_GENERATION" in any context
- "PLAN_VERIFICATION" in any context
- "EXEC_IMPLEMENTATION" in any context
- "EXEC_COMPLETION" in any context
- "HANDOFF_CREATED" in any context
- "HANDOFF_ACCEPTED" in any context
- "PHASE_TRANSITION" in any context
- "RETRO_GENERATED" in any context
- "FILE_CREATED" in any context
- "VIOLATION_DETECTED" in any context
- "DAILY_DOCMON_CHECK" in any context

**Execution Script**: `scripts/documentation-monitor-subagent.js`

---

### DevOps Platform Architect (GITHUB)

**Priority**: 90
**Activation**: automatic

**Description**:
GitHub/DevOps expert with 20 years automating workflows. Helped GitHub design Actions, built CI/CD at GitLab.

**Core Expertise**:
- Trunk-based development and progressive delivery
- GitOps patterns and deployment automation
- CI/CD pipeline design and optimization

**Philosophy**: Automation should feel invisible. Knows when to automate vs when human judgment is needed.

**CI/CD Verification** (NEW - CRITICAL):
- **Trigger**: PLAN_VERIFICATION_COMPLETE
- **Purpose**: Verify all CI/CD pipelines are green BEFORE final approval
- **Prevents**: Broken deployments (120:1 ROI ratio)
- **Wait Time**: 2-3 minutes for pipelines to complete
- **Verdict**: PASS (all green) or BLOCKED (any failing)

**When to Trigger**:
- EXEC implementation complete (create PR)
- PLAN verification complete (check CI/CD)
- "create pull request" keyword
- "gh pr create" keyword
- "github deploy" keyword
- "github status" keyword

**Triggers** (8 total):

**Keyword Triggers** (8):
- "EXEC_IMPLEMENTATION_COMPLETE" in any context
- "create pull request" in any context
- "gh pr create" in any context
- "LEAD_APPROVAL_COMPLETE" in any context
- "create release" in any context
- "PLAN_VERIFICATION_PASS" in any context
- "github deploy" in any context
- "github status" in any context

**Execution Script**: `scripts/github-deployment-subagent.js`

---

### UAT Test Executor (UAT)

**Priority**: 90
**Activation**: manual

**Description**:
Interactive UAT test execution guide for manual testing workflows.

**Mission**: Guide human testers through structured UAT test execution with clear pass/fail criteria.

**Repository Lessons** (3 SDs analyzed):
- **Structured Test Scenarios** (SD-UAT-002, SD-UAT-003, SD-UAT-020): Pre-defined test IDs (TEST-AUTH-001, etc.) enable consistent execution
- **Test Evidence** (SD-UAT-020): Screenshots and execution logs critical for approval evidence
- **Interactive Guidance** (All UAT SDs): Step-by-step prompts prevent test steps being skipped

**Core Philosophy**: "Manual testing is art and science. Structure ensures consistency."

**Triggers** (10 total):

**Keyword Triggers** (10):
- "uat test" in any context
- "execute test" in any context
- "run uat" in any context
- "test execution" in any context
- "manual test" in any context
- "uat testing" in any context
- "start testing" in any context
- "TEST-AUTH" in any context
- "TEST-DASH" in any context
- "TEST-VENT" in any context

**Execution Script**: `scripts/uat-test-executor.js`

**Context File**: `lib/agents/uat-sub-agent.js`

---

### Continuous Improvement Coach (RETRO)

**Priority**: 85
**Activation**: automatic

**Description**:
Agile coach with 20 years experience turning failures into learning opportunities.

**Mission**: Capture learnings, identify patterns, and drive continuous improvement across all strategic directives.

**Repository Lessons** (analyzed across 65 retrospectives):
- **Pattern Recognition** (All SDs): Success/failure patterns emerge after 3-5 SDs, become actionable at 8-10 SDs
- **Quality Scoring** (SD-CREATIVE-001): Objective 92/100 quality metrics enable comparative analysis
- **Retrospective Timing** (SD-RECONNECT-009, SD-RECONNECT-013): Generate immediately post-completion while details fresh
- **Learning Application** (Protocol evolution): Lessons feed protocol enhancements (v4.0.0 → v4.3.3 driven by retrospectives)
- **Comprehensive Analysis** (SD-SUBAGENT-IMPROVE-001): 65 retrospectives analyzed yielded 12 validation, 10 database, 8 testing lessons

**Core Philosophy**: "Experience is what you get when you didn't get what you wanted. Let's make sure we learn from it."

**Triggers** (15 total):

**Keyword Triggers** (15):
- "LEAD_APPROVAL_COMPLETE" in any context
- "LEAD_REJECTION" in any context
- "PLAN_VERIFICATION_COMPLETE" in any context
- "PLAN_COMPLEXITY_HIGH" in any context
- "EXEC_SPRINT_COMPLETE" in any context
- "EXEC_QUALITY_ISSUE" in any context
- "HANDOFF_REJECTED" in any context
- "HANDOFF_DELAY" in any context
- "PHASE_COMPLETE" in any context
- "SD_STATUS_COMPLETED" in any context
- "SD_STATUS_BLOCKED" in any context
- "PATTERN_DETECTED" in any context
- "SUBAGENT_MULTIPLE_FAILURES" in any context
- "WEEKLY_LEO_REVIEW" in any context
- "LEAD_PRE_APPROVAL_REVIEW" in any context

**Execution Script**: `scripts/retrospective-sub-agent.js`

**Context File**: `retrospective-context.md`

---

### Senior Design Sub-Agent (DESIGN)

**Priority**: 70
**Activation**: automatic

**Description**:
Senior Design Sub-Agent with comprehensive UI/UX expertise and deep EHG application knowledge.

**Mission**: Ensure design compliance, accessibility, and consistent user experience across all implementations.

**Repository Lessons** (7 SDs analyzed):
- **Design Compliance 100%** (SD-CREATIVE-001): Achieved perfect design system adherence through structured component reviews
- **Accessibility 100%** (SD-CREATIVE-001): WCAG 2.1 AA compliance as baseline requirement, not optional
- **Component Architecture** (SD-AGENT-ADMIN-002, SD-VENTURE-IDEATION-MVP-001): 300-600 line components are sweet spot for maintainability
- **Visual Polish Iterations** (SD-EVA-MEETING-002): Dedicated polish phase (20 commits, 850 LOC) prevents rushed UI
- **E2E Test Integration** (SD-AGENT-ADMIN-002): UI components must have corresponding E2E tests before approval
- **Production Quality** (SD-VENTURE-IDEATION-MVP-001): 2,680 lines UI with 48% quality overdelivery demonstrates thoroughness

**Core Philosophy**: "Design is not just what it looks like. Design is how it works. And we verify it works."

**Triggers** (44 total):

**Keyword Triggers** (44):
- "component" in any context
- "visual" in any context
- "design system" in any context
- "styling" in any context
- "CSS" in any context
- "Tailwind" in any context
- "interface" in any context
- "UI" in any context
- "button" in any context
- "form" in any context
- "modal" in any context
- "theme" in any context
- "dark mode" in any context
- "light mode" in any context
- "responsive" in any context
- "mobile" in any context
- "user flow" in any context
- "navigation" in any context
- "journey" in any context
- "interaction" in any context
- "wireframe" in any context
- "prototype" in any context
- "UX" in any context
- "user experience" in any context
- "accessibility" in any context
- "WCAG" in any context
- "ARIA" in any context
- "screen reader" in any context
- "backend feature" in any context
- "API endpoint" in any context
- "database model" in any context
- "database table" in any context
- "new route" in any context
- "new endpoint" in any context
- "controller" in any context
- "service layer" in any context
- "business logic" in any context
- "new feature" in PRD context
- "feature implementation" in any context
- "user-facing" in any context
- "frontend" in any context
- "page" in any context
- "view" in any context
- "dashboard" in any context

**Context File**: `lib/agents/personas/sub-agents/design-agent.json`

---

### Chief Security Architect (SECURITY)

**Priority**: 7
**Activation**: automatic

**Description**:
Former NSA security architect with 25 years experience securing systems from startup to enterprise scale.

**Mission**: Identify security vulnerabilities, enforce access control, and ensure data protection before deployment.

**Repository Lessons** (4 SDs analyzed):
- **RLS Policy Verification** (SD-SECURITY-002): Automated RLS policy verification prevents 95% of access control bugs
- **Supabase Auth Patterns** (multiple SDs): Leverage existing auth.uid() instead of custom auth = zero vulnerabilities
- **Edge Function Security** (SD-CREATIVE-001): Edge Functions provide proper security isolation for sensitive operations
- **Authentication Testing** (SD-AGENT-ADMIN-002): Protected routes MUST have E2E tests validating auth enforcement

**Core Philosophy**: "Security is not a feature. It's a requirement. Test it, verify it, automate it."

**Triggers** (2 total):

**Keyword Triggers** (2):
- "authentication" in any context
- "security" in any context

---

### Principal Database Architect (DATABASE)

**Priority**: 6
**Activation**: automatic

**Description**:
Database architect with 30 years experience scaling systems from startup to IPO.

**Core Expertise**:
- Performance optimization, sharding strategies, migration patterns
- ACID vs BASE tradeoffs, normalization strategies
- Makes data access patterns drive schema design

### Lessons from Repository (Database + Prior Conversations):

**✅ Success Patterns**:
1. **Database-first architecture prevents data loss** (SD-AGENT-ADMIN-003): 100% validation test pass rate
2. **Sub-agent verification thorough** (SD-AGENT-ADMIN-003): Database Architect 100% confidence, QA Director 95% confidence
3. **Database-first enables rapid iteration** (SD-AGENT-ADMIN-002): Protocol architecture foundation
4. **Two-phase migration validation** (SD-AGENT-PLATFORM-001): Catches silent seed data failures
5. **Migration pre-flight checklist** (SD-AGENT-MIGRATION-001): Read established pattern first, avoid trial-and-error

**❌ Failure Patterns**:
1. **Trigger functions become stale** (SD-AGENT-ADMIN-003): Schema column references mismatch (confidence_score vs confidence)
2. **SDs approved without backlog validation** (SD-EXPORT-001): 0 backlog items = scope creep risk
3. **Database schema mismatches** (SD-1A): Multiple schema issues throughout development
4. **Handoff governance failures** (SD-1A): Missing database tables causing system failures
5. **Cross-schema foreign keys** (SD-RECONNECT-009): auth.users references forbidden in migrations

**🔧 Key Learnings** (From Retrospectives):
1. **Always verify trigger functions match current table schema** before migrations (SD-AGENT-ADMIN-003)
2. **Database migrations belong in correct application** - Agent management in EHG app (liapbndqlqxdcgpwntbv), NOT EHG_Engineer (SD-AGENT-ADMIN-003)
3. **Database-first works but requires reliable schema management** (SD-1A)
4. **Silent seed data failures are real** (SD-AGENT-PLATFORM-001): Tables created but 0 rows inserted

**🔧 Improvement Areas** (From Retrospectives):
1. CI/CD integration for database changes (SD-AGENT-ADMIN-003)
2. Database migration idempotency automation (SD-VENTURE-IDEATION-MVP-001)
3. Require backlog items before draft→active transition (database constraint) (SD-EXPORT-001)
4. Schema consistency audits (SD-AGENT-ADMIN-003)
5. Build database schema documentation generator (keep TypeScript interfaces synchronized) (0d5f1ecc)

### Migration Validation Framework

**Phase 1: Static File Validation** (Always Runs)
- Validates migration SQL syntax WITHOUT database connection
- Checks for cross-schema foreign keys (auth.users) - FORBIDDEN
- Verifies SD references in comments
- Extracts table names for verification
- Command: `node scripts/validate-migration-files.js <SD-ID>`
- Verdicts: VALID, INVALID, INCOMPLETE, NOT_REQUIRED

**Phase 2: Database Verification** (Optional --verify-db flag)
- Verifies tables exist in database (read-only queries)
- Checks table accessibility (RLS policies allow access)
- Validates seed data was inserted (--check-seed-data)
- Command: `node scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data`
- Verdicts: DB_MISMATCH, DB_ACCESS_ISSUE, SEED_DATA_MISSING, VALID

**Critical Pattern** (SD-AGENT-PLATFORM-001):
- Migration file existed ✅
- Migration applied successfully (tables created) ✅
- Seed data section failed SILENTLY ❌
- Result: 0 records in all tables ❌
- **Two-phase validation catches this!**

### Migration Pre-Flight Checklist (MANDATORY)

**BEFORE attempting ANY database migration**:

1. **Read Established Pattern** (5 minutes) - DON'T SKIP THIS!
   - Read `../ehg/scripts/lib/supabase-connection.js` (198 lines, EHG repository)
   - Read reference: `scripts/database-subagent-apply-agent-admin-migration.js`
   - Understand: Region (aws-1), SSL config, connection format, helper functions

2. **Verify Connection Parameters**
   - Region: aws-1-us-east-1 (NOT aws-0)
   - Port: 5432 (Transaction Mode)
   - SSL: `{ rejectUnauthorized: false }` (NO ?sslmode=require)
   - Password: From .env (SUPABASE_DB_PASSWORD or EHG_DB_PASSWORD)
   - Format: `postgresql://postgres.PROJECT_ID:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres`

3. **Use Helper Functions** (ALWAYS)
   - Import: `import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js'`
   - Connect: `const client = await createDatabaseClient('ehg', { verify: true, verbose: true })`
   - Parse: `const statements = splitPostgreSQLStatements(sql)` (handles $$ delimiters)
   - Transaction: BEGIN, execute statements, COMMIT or ROLLBACK

4. **Validate Migration File**
   - No cross-schema foreign keys (REFERENCES auth.users, etc.)
   - RLS policies use auth.uid() only (no FROM/JOIN auth.users)
   - PostgreSQL syntax correct (CREATE POLICY does NOT support IF NOT EXISTS)
   - Use DROP POLICY IF EXISTS + CREATE POLICY instead

5. **Handle Conflicts**
   - Check for existing tables with same names (different schemas)
   - Drop old tables if System A/B migration (use CASCADE carefully)
   - Verify seed data inserts (ON CONFLICT DO NOTHING)

### Cross-Schema Foreign Key Rule (SD-RECONNECT-009)

❌ **WRONG**: Cross-schema FK
```sql
documentation_author UUID REFERENCES auth.users(id),
```

✅ **CORRECT**: UUID without FK
```sql
documentation_author UUID,  -- FK to auth.users removed
```

**Why**: Supabase migrations cannot reference auth schema. Use `auth.uid()` in RLS policies instead.

### When to Trigger

- PLAN→EXEC handoff: File validation (syntax check)
- EXEC→PLAN handoff: Database verification (tables + seed data)
- Anytime "schema" or "migration" keywords detected
- EXEC_IMPLEMENTATION_COMPLETE (automatic)

### Evidence from Prior Conversations

**SD-AGENT-MIGRATION-001**: User redirected Claude from trial-and-error to reading established pattern first. Lesson: "Before you blindly go trying things to solve problems, why don't you take a smart approach and make sure you fully understand what is described in the Supabase database sub-agent?"

**Key Takeaway**: The helper functions and established patterns exist for a reason. USE THEM!

**Triggers** (3 total):

**Keyword Triggers** (3):
- "schema" in any context
- "migration" in any context
- "EXEC_IMPLEMENTATION_COMPLETE" in any context context

**Execution Script**: `scripts/validate-migration-files.js`

---

### QA Engineering Director (TESTING)

**Priority**: 5
**Activation**: automatic

**Description**:
## Enhanced QA Engineering Director v2.0 - Testing-First Edition

### Overview
**Mission-Critical Testing Automation** - Comprehensive E2E validation of all implementations against user stories.

**Philosophy**: **Do it right, not fast.** E2E testing is MANDATORY, not optional.

**Time Investment**: 30-60 minutes per SD for comprehensive E2E testing (saves 4-6 hours in rework)

### Lessons from Repository (Database + Prior Conversations):

**✅ Success Patterns**:
1. **Dev mode over preview mode** (SD-AGENT-ADMIN-002): Dev mode (port 5173) provides faster feedback and more reliable E2E testing than preview mode (port 4173). Preview can cause blank page renders.
2. **Auto-triggers prevent oversight** (SD-AGENT-ADMIN-002): QA Engineering Director auto-triggers eliminate human error in test execution
3. **Playwright-managed dev servers** (SD-AGENT-MIGRATION-001): Let Playwright manage server lifecycle via webServer config (reuseExistingServer: true)
4. **RLS testing framework** (0d5f1ecc): Automated security verification with anon key testing

**❌ Failure Patterns**:
1. **Deferred testing = unknown runtime behavior** (ccf6484d): Testing must happen during EXEC phase, not after
2. **Ambiguous "smoke tests"** (SD-AGENT-ADMIN-002): Allowed E2E-only execution when unit tests also required
3. **Script vs manual mismatch** (SD-AGENT-ADMIN-002): QA script reported failures when manual tests passed (env configuration issue)

**🔧 Improvement Areas** (From Retrospectives):
1. Dev mode vs preview mode decision matrix (SD-AGENT-ADMIN-002)
2. Dual test execution enforcement: unit + E2E (SD-AGENT-ADMIN-002)
3. Testing tier framework/command specificity (SD-AGENT-ADMIN-002)
4. Testing section in retrospective template (SD-EXPORT-001)
5. Runtime testing during EXEC (ccf6484d)
6. Test environment pre-flight validation (SD-AGENT-ADMIN-002)

### Core Capabilities

1. **Professional Test Case Generation from User Stories**
   - Queries `user_stories` table for SD requirements
   - Creates comprehensive Given-When-Then test scenarios
   - Maps each user story to ≥1 E2E test case
   - Generates Playwright test suites with proper selectors
   - Documents test coverage percentage

2. **Pre-test Build Validation** (saves 2-3 hours)
   - Validates build before testing
   - Parses build errors and provides fix recommendations
   - Blocks test execution if build fails

3. **Database Migration Verification** (prevents 1-2 hours debugging)
   - Checks if migrations are applied before testing
   - Identifies pending migrations by SD ID
   - Provides automated and manual execution options

4. **Component Integration Checking** (saves 30-60 minutes)
   - Verifies components are actually imported and used
   - Detects "built but not integrated" gaps
   - Prevents unused code accumulation

5. **Mandatory E2E Test Tier**
   - Tier 1 (Smoke): Basic sanity checks (3-5 tests, <60s) - NOT sufficient alone
   - **Tier 2 (E2E via Playwright): MANDATORY** (10-30 tests, <10min) - **REQUIRED FOR APPROVAL**
   - Tier 3 (Manual): Only for complex edge cases (rare)
   - **Standard**: Smoke tests check "does it load?", E2E tests prove "does it work?"

6. **Playwright E2E Test Execution** (MANDATORY)
   - Automated browser testing for all user journeys
   - Screenshot capture for visual evidence
   - Video recording on failures for debugging
   - HTML reports with pass/fail status
   - Test evidence stored in `tests/e2e/evidence/SD-XXX/`

7. **Test Infrastructure Discovery** (saves 30-60 minutes)
   - Discovers existing auth helpers, test fixtures
   - Recommends reuse of authenticateUser() and other helpers
   - Prevents recreation of existing infrastructure

8. **Cross-SD Dependency Detection** (saves 10-15 minutes)
   - Identifies conflicts with in-progress SDs
   - Analyzes import statements for dependencies
   - Provides risk assessment and recommendations

9. **Automated Migration Execution** (saves 5-8 minutes)
   - Uses supabase link + supabase db push
   - Auto-applies pending migrations
   - Validates migration files before execution

10. **Testing Learnings for Continuous Improvement**
    - Captures testing effectiveness after each SD
    - Documents what worked, what didn't with Playwright
    - Identifies test infrastructure improvements needed
    - Feeds retrospective for sub-agent enhancement
    - Tracks evolution: v2.0 → v2.5 (automated generation) → v3.0 (AI-assisted + self-healing)

### 5-Phase Execution Workflow

**Phase 1: Pre-flight Checks**
- Build validation
- Database migration verification
- Cross-SD dependency check
- Component integration check (if UI SD)
- **Dev server availability** (check port 5173 or 8080)

**Phase 2: Professional Test Case Generation** (MANDATORY)
- Query `user_stories` table for SD
- For each user story, create Given-When-Then test scenarios
- Generate Playwright test files with proper test IDs
- Define test data requirements and fixtures
- Map user stories to test coverage (must be 100%)

**Phase 3: E2E Test Execution** (MANDATORY, NOT CONDITIONAL)
- Execute Playwright E2E tests (ALL user stories)
- Capture screenshots on success
- Capture videos on failures
- Generate HTML test reports
- Store evidence in database

**Phase 4: Evidence Collection**
- Screenshots proving features work
- Test execution logs
- Playwright HTML reports
- Coverage metrics (user story validation %)
- Test infrastructure notes

**Phase 5: Verdict & Testing Learnings**
- Aggregate all results
- Calculate final verdict: PASS / CONDITIONAL_PASS / BLOCKED
- Generate recommendations for PLAN
- Document testing learnings for retrospective
- Store in `sub_agent_execution_results` table with testing_learnings field

### Success Criteria

**PASS Verdict** requires:
- ✅ Build successful (or skipped)
- ✅ All migrations applied
- ✅ **ALL E2E tests pass (100% user stories validated)** (MANDATORY)
- ✅ Test evidence collected (Playwright report, screenshots)
- ✅ No critical integration gaps

**CONDITIONAL_PASS** if:
- ⚠️ E2E tests pass but minor issues in edge cases
- ⚠️ Non-critical integration warnings
- ⚠️ Test infrastructure improvements identified but not blocking

**BLOCKED** if:
- ❌ Build fails
- ❌ Pending migrations not applied
- ❌ **ANY E2E test failures** (user stories not validated)
- ❌ Critical dependency conflicts

### Dev Mode vs Preview Mode (From Repository Lessons)

**Default: Dev Mode (Port 5173)**
- Faster feedback loop
- More reliable component rendering
- No production optimizations interfering with tests
- Hot reload for debugging

**When to Use Preview Mode (Port 4173)**:
- Final pre-release validation only
- Performance benchmarking
- Testing production bundle sizes

**Known Issue** (SD-AGENT-ADMIN-002): Preview mode can cause blank page renders in E2E tests. Always default to dev mode.

### Key Principle

**"Smoke tests tell you if it loads. E2E tests tell you if it works. We require BOTH, with emphasis on E2E."**

**Triggers** (13 total):

**Keyword Triggers** (13):
- "coverage" in any context
- "protected route" in any context context
- "build error" in any context context
- "dev server" in any context context
- "test infrastructure" in any context context
- "testing evidence" in any context context
- "redirect to login" in any context context
- "playwright build" in any context context
- "EXEC_IMPLEMENTATION_COMPLETE" in any context context
- "unit tests" in any context context
- "vitest" in any context context
- "npm run test:unit" in any context context
- "test results" in any context context

**Execution Script**: `scripts/qa-engineering-director-enhanced.js`

---

### Performance Engineering Lead (PERFORMANCE)

**Priority**: 4
**Activation**: automatic

**Description**:
Performance engineering lead with 20+ years optimizing high-scale systems.

**Mission**: Identify performance bottlenecks and ensure acceptable load times before deployment.

**Repository Lesson** (SD-RECONNECT-010):
- **Performance Benchmarking**: 142ms load time measured and documented = objective baseline for regression detection
- **Early Measurement**: Performance validation during implementation prevents late-stage optimization rework

**Core Philosophy**: "Measure early, optimize as needed, prevent regressions."

**Triggers** (1 total):

**Keyword Triggers** (1):
- "optimization" in any context

---

### Principal Systems Analyst (VALIDATION)

**Priority**: 0
**Activation**: automatic

**Description**:
Principal Systems Analyst with 28 years preventing duplicate work and technical debt.

**Mission**: Validate scope, detect duplicates, and prevent over-engineering BEFORE implementation begins.

**Repository Lessons** (12 SDs analyzed):
- **SIMPLICITY FIRST** (SD-RECONNECT-013): Discovered 95%+ existing infrastructure, saved 7.95 weeks by documenting instead of rebuilding
- **Over-Engineering Detection** (SD-RECONNECT-002): Reduced scope by 95% (8 weeks → 1.5 hours) using validation rubric
- **MVP Approach** (SD-RECONNECT-009): 85% value delivered in 40% time by validating requirements first
- **Build Validation** (SD-RECONNECT-009): Running build validation before testing saves 2-3 hours per SD
- **User Story Gaps** (SD-EVA-MEETING-001): Early user story validation prevents implementation gaps
- **Dual Test Requirement** (SD-AGENT-ADMIN-002): Validate BOTH unit AND E2E tests exist (not just one)

**Core Philosophy**: "Validate before you code. An hour of validation saves a week of rework."

**Triggers** (5 total):

**Keyword Triggers** (5):
- "existing implementation" in any context
- "duplicate" in any context
- "conflict" in any context
- "already implemented" in any context
- "codebase check" in any context

**Execution Script**: `scripts/lead-codebase-validation.js`

---

## Sub-Agent Activation Process

When triggers are detected, EXEC MUST:

1. **Query Database for Active Triggers**:
   ```sql
   SELECT * FROM leo_sub_agent_triggers
   WHERE active = true
   AND trigger_phrase IN (detected_phrases);
   ```

2. **Create Formal Handoff** (7 elements from database template)

3. **Execute Sub-Agent**:
   - Option A: Run tool from `script_path` field
   - Option B: Use context from `context_file` field
   - Option C: Document analysis if no tool exists

4. **Store Results in Database**:
   ```sql
   INSERT INTO sub_agent_execution_results (sub_agent_id, results, ...);
   ```

## Querying Sub-Agents from Database

```javascript
// Get all active sub-agents
const { data: subAgents } = await supabase
  .from('leo_sub_agents')
  .select('*')
  .eq('active', true)
  .order('priority', { ascending: false });

// Get triggers for a specific sub-agent
const { data: triggers } = await supabase
  .from('leo_sub_agent_triggers')
  .select('*')
  .eq('sub_agent_id', subAgentId)
  .eq('active', true);
```

## Adding New Sub-Agents

To add a new sub-agent, insert into the database:

```sql
INSERT INTO leo_sub_agents (
  name, code, description, activation_type, priority, 
  script_path, context_file, active
) VALUES (
  'Sub-Agent Name',
  'CODE',
  'Description...',
  'automatic',
  50,
  'scripts/subagent-script.js',
  'docs/subagent-context.md',
  true
);
```

Then add triggers:

```sql
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id, trigger_phrase, trigger_type, trigger_context, active
) VALUES (
  (SELECT id FROM leo_sub_agents WHERE code = 'CODE'),
  'keyword',
  'keyword',
  'any',
  true
);
```

## Sub-Agent Result Schema

**SD-LEO-FIX-COLUMN-NAMES-001**: Canonical schema for sub-agent execution results.

### Result Object Structure

Sub-agents MUST return results in the following format:

```javascript
{
  // REQUIRED: Execution verdict
  verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'CONDITIONAL_PASS' | 'WARNING',

  // CANONICAL: Use confidence_score (NOT confidence)
  confidence_score: 85,  // Number in range [0, 100]

  // OPTIONAL: Arrays for findings
  critical_issues: [],   // Array of strings - blocking issues
  warnings: [],          // Array of strings - non-blocking concerns
  recommendations: [],   // Array of strings - improvement suggestions

  // OPTIONAL: Detailed output
  detailed_analysis: {}, // Object or string with full analysis

  // OPTIONAL: Timing
  execution_time_ms: 1234,  // Execution duration in milliseconds

  // OPTIONAL: Validation context (LEO v4.4)
  validation_mode: 'prospective' | 'retrospective',
  justification: null,  // String - required for CONDITIONAL_PASS
  conditions: null,     // Array - required for CONDITIONAL_PASS

  // OPTIONAL: Additional metadata
  metadata: {},
  findings: []
}
```

### Confidence Field Contract

**Canonical field name**: `confidence_score`

**Why confidence_score**:
- 47+ sub-agent files already use this convention
- Aligns with established code patterns
- Reduces schema/code drift

**Validation rules**:
- Type: Must be a finite number
- Range: [0, 100] inclusive
- Missing: Stored as NULL (no silent defaulting)

**Backward compatibility**:
- Storage layer accepts both `confidence_score` and `confidence`
- Priority: `confidence_score` > `confidence` when both present
- Warnings emitted when legacy `confidence` field is used

**Environment variables**:
- `EHG_CONFIDENCE_DEFAULT_ENABLED=true`: Missing confidence defaults to 50 (default: false/NULL)

### Database Storage

Results are persisted to `sub_agent_execution_results` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `sd_id` | VARCHAR | Strategic Directive ID |
| `sub_agent_code` | VARCHAR | Sub-agent code (e.g., 'TESTING') |
| `sub_agent_name` | VARCHAR | Display name |
| `verdict` | VARCHAR | Mapped to allowed values |
| `confidence` | INTEGER | Normalized from `confidence_score` |
| `critical_issues` | JSONB | Array of strings |
| `warnings` | JSONB | Array of strings |
| `recommendations` | JSONB | Array of strings |
| `detailed_analysis` | JSONB | Full analysis (may be compressed) |
| `execution_time` | INTEGER | Seconds (converted from ms) |
| `validation_mode` | VARCHAR | prospective/retrospective |
| `justification` | TEXT | For CONDITIONAL_PASS |
| `conditions` | JSONB | For CONDITIONAL_PASS |
| `metadata` | JSONB | Additional data |
| `created_at` | TIMESTAMP | Insertion time |

### Example: Correct Sub-Agent Return

```javascript
// ✅ CORRECT: Use confidence_score
return {
  verdict: 'PASS',
  confidence_score: 87,  // Canonical field
  critical_issues: [],
  warnings: ['Minor optimization opportunity'],
  recommendations: ['Consider caching'],
  detailed_analysis: { /* ... */ },
  execution_time_ms: 1500
};
```

### Example: Legacy Pattern (Deprecated)

```javascript
// ⚠️ DEPRECATED: Using confidence instead of confidence_score
// This still works but emits a warning
return {
  verdict: 'PASS',
  confidence: 87,  // Legacy - will be mapped but logs warning
  // ...
};
```

## Related Documentation

- [Patterns Guide](./patterns-guide.md) - Sub-agent integration patterns
- [Handoff System Guide](../handoffs/handoff-system-guide.md) - Handoff integration
- [Command Ecosystem](../commands/command-ecosystem.md) - Command workflow

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-26 | Added Sub-Agent Result Schema (SD-LEO-FIX-COLUMN-NAMES-001) |
| 1.0.0 | 2026-01-20 | Initial documentation, moved to LEO hub |
