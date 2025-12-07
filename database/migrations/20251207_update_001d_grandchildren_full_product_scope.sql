-- Update 001D grandchildren with full product scope
-- These SDs now reflect actual deliverables: UI/UX, forms, workflows, APIs, AI agents
-- Each grandchild delivers a working product for their phase of the 25-stage venture lifecycle

-- 001D1: Stages 1-5 (THE TRUTH)
UPDATE strategic_directives_v2
SET
  scope = 'DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 1-5 (THE TRUTH phase).

ASSESSMENT: Inventory existing implementations before building:
- Existing UI components for idea capture, critique, validation
- Existing APIs for venture creation and stage progression
- Existing AI agents (multi-model critique, validation)

BUILD REQUIREMENTS:
1. UI/Forms: Idea submission, AI critique display, validation report, financial model input
2. Workflows: Stage 1→2→3→4→5 progression with proper gates
3. APIs: Stage advancement, decision recording, advisory retrieval
4. AI Agents: Multi-model critique (stage 2), market validation (stage 3), profitability analysis (stage 5)
5. Decision Gates: Stage 3 (Reality Check) and Stage 5 (Unit Economics) with ADVANCE/REVISE/KILL options
6. Advisory System: Health score display and recommendations at stages 3 and 5

Must work as finished product - venture can progress from idea to validated business model.',
  success_criteria = '["User can create venture and submit idea (Stage 1)","AI critique automatically runs and displays results (Stage 2)","Decision gate UI works at Stage 3 with advisory","Competitive analysis form/display works (Stage 4)","Decision gate UI works at Stage 5 with advisory","APIs handle all stage transitions","venture_stage_work populated on progression","E2E test passes for stages 1-5 flow"]'::jsonb
WHERE id = 'SD-VISION-TRANSITION-001D1';

-- 001D2: Stages 6-9 (THE ENGINE)
UPDATE strategic_directives_v2
SET
  scope = 'DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 6-9 (THE ENGINE phase).

ASSESSMENT: Inventory existing implementations before building:
- Existing UI components for risk, pricing, BMC, exit strategy
- Existing APIs for artifact management
- Existing AI agents for business analysis

BUILD REQUIREMENTS:
1. UI/Forms: Risk matrix builder, pricing model designer, BMC canvas, exit strategy planner
2. Workflows: Stage 6→7→8→9 progression (artifact-only, no decision gates)
3. APIs: Artifact upload/retrieval, stage advancement
4. AI Agents: Risk assessment, pricing recommendations, BMC generation, exit analysis
5. Artifact Management: Each stage produces required artifacts that must be stored and viewable

Must work as finished product - venture has complete business engine documented.',
  success_criteria = '["Risk matrix form captures and displays risk data (Stage 6)","Pricing model tool works with AI recommendations (Stage 7)","Business Model Canvas interactive and complete (Stage 8)","Exit strategy planner with AI analysis (Stage 9)","All artifacts stored in venture_artifacts table","APIs handle artifact CRUD and stage transitions","E2E test passes for stages 6-9 flow"]'::jsonb
WHERE id = 'SD-VISION-TRANSITION-001D2';

-- 001D3: Stages 10-12 (THE IDENTITY)
UPDATE strategic_directives_v2
SET
  scope = 'DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 10-12 (THE IDENTITY phase).

CRITICAL: ADR-002 Chairman Override - Story before name. Stage 10 creates strategic_narrative FIRST, then Stage 11 uses it for naming.

ASSESSMENT: Inventory existing implementations before building:
- Existing UI components for branding, narrative, GTM
- Existing APIs for SD generation (Stage 10 is FIRST sd_required stage)
- Existing AI agents for brand/identity work

BUILD REQUIREMENTS:
1. UI/Forms: Strategic narrative builder, naming workshop, GTM planner, sales playbook creator
2. Workflows: Stage 10→11→12 with SD generation at Stage 10
3. APIs: SD auto-creation, artifact management, stage advancement
4. AI Agents: Narrative generation, name candidates, GTM strategy, sales logic
5. Leo Protocol Integration: Stage 10 triggers first SD - must integrate with LEAD→PLAN→EXEC flow
6. Artifact Dependencies: Stage 11 naming REQUIRES Stage 10 narrative complete

Must work as finished product - venture has complete brand identity and go-to-market strategy.',
  success_criteria = '["Strategic narrative form and AI generation works (Stage 10)","SD auto-created when Stage 10 starts (first sd_required)","Naming only available AFTER narrative complete (dependency enforced)","GTM strategy builder with marketing manifest (Stage 11)","Sales playbook creator works (Stage 12)","Leo Protocol integration verified","E2E test passes for stages 10-12 flow"]'::jsonb
WHERE id = 'SD-VISION-TRANSITION-001D3';

-- 001D4: Stages 13-16 (THE BLUEPRINT - Kochel Firewall)
UPDATE strategic_directives_v2
SET
  scope = 'DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 13-16 (THE BLUEPRINT phase - Kochel Firewall).

CRITICAL: Stage 16 is the Kochel Firewall - no code written until schema is unambiguous.

ASSESSMENT: Inventory existing implementations before building:
- Existing UI components for tech decisions, data modeling, user stories
- Existing APIs for schema generation
- Existing AI agents for architecture work

BUILD REQUIREMENTS:
1. UI/Forms: Tech stack decision matrix, ERD builder, user story writer, schema generator
2. Workflows: Stage 13→14→15→16 with decision gates at 13 and 16
3. APIs: SD generation, schema validation, stage advancement
4. AI Agents: Tech stack interrogation, data model design, story breakdown, schema generation
5. Decision Gates: Stage 13 (Tech Stack) and Stage 16 (Firewall) with advisory
6. Kochel Firewall: Schema Completeness Checklist - "Can Claude build without clarifying questions?"
7. Schema Generation: TypeScript interfaces, SQL schemas, API contracts

Must work as finished product - venture has complete, unambiguous technical specification.',
  success_criteria = '["Tech stack decision UI with AI interrogation (Stage 13)","ERD/data model builder works (Stage 14)","User story breakdown with INVEST validation (Stage 15)","Schema Completeness Checklist enforced at Stage 16","Firewall advisory shows green/yellow/red status","Generated schemas downloadable (TypeScript, SQL)","Decision gate blocks progression if schema ambiguous","E2E test passes for stages 13-16 flow"]'::jsonb
WHERE id = 'SD-VISION-TRANSITION-001D4';

-- 001D5: Stages 17-20 (THE BUILD LOOP)
UPDATE strategic_directives_v2
SET
  scope = 'DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 17-20 (THE BUILD LOOP phase).

CRITICAL: All 4 stages are sd_required - full Leo Protocol integration for each.

ASSESSMENT: Inventory existing implementations before building:
- Existing UI components for environment config, development workflow
- Existing APIs for SD/PRD management
- Existing AI agents for code generation

BUILD REQUIREMENTS:
1. UI/Forms: Environment configurator, MVP tracker, integration manager, security dashboard
2. Workflows: Stage 17→18→19→20 with SD generation at each stage
3. APIs: SD auto-creation with proper sd_suffix, stage advancement
4. AI Agents: Environment setup, code generation, integration design, security hardening
5. Leo Protocol: Each stage generates SD that follows LEAD→PLAN→EXEC flow
6. SD Templates: ENVCONFIG, MVP, INTEGRATION, SECURITY suffixes used
7. Stage 17: Determines venture deployment target (critical configuration)

Must work as finished product - venture code is built, integrated, and secured.',
  success_criteria = '["Environment config UI determines deployment target (Stage 17)","MVP development tracker with SD integration (Stage 18)","Integration/API layer management works (Stage 19)","Security audit dashboard with findings (Stage 20)","Each stage auto-generates SD with correct suffix","Leo Protocol handoffs work for each stage SD","E2E test passes for stages 17-20 flow"]'::jsonb
WHERE id = 'SD-VISION-TRANSITION-001D5';

-- 001D6: Stages 21-25 (LAUNCH & LEARN)
UPDATE strategic_directives_v2
SET
  scope = 'DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 21-25 (LAUNCH & LEARN phase).

CRITICAL: Stage 23 is final decision gate before launch - Kill Protocol available here.

ASSESSMENT: Inventory existing implementations before building:
- Existing UI components for QA, deployment, analytics
- Existing APIs for launch management
- Existing AI agents for optimization

BUILD REQUIREMENTS:
1. UI/Forms: QA test runner, deployment dashboard, launch checklist, analytics viewer, optimization planner
2. Workflows: Stage 21→22→23→24→25 with decision gate at 23
3. APIs: Test execution, deployment triggers, analytics integration, stage advancement
4. AI Agents: QA automation, deployment validation, analytics insights, optimization recommendations
5. Decision Gate: Stage 23 (Production Launch) - go/no-go with Kill Protocol option
6. Kill Protocol: If KILL selected, venture terminated, all open SDs cancelled
7. Post-Launch: Analytics dashboard (24) and optimization roadmap (25)

Must work as finished product - venture launches to production and enters continuous improvement.',
  success_criteria = '["QA/UAT workflow with test coverage tracking (Stage 21)","Deployment dashboard with runbook (Stage 22)","Production launch decision gate works (Stage 23)","Kill Protocol executes correctly if selected","Analytics dashboard displays metrics (Stage 24)","Optimization roadmap generator works (Stage 25)","E2E test passes for stages 21-25 flow","Full venture lifecycle completable end-to-end"]'::jsonb
WHERE id = 'SD-VISION-TRANSITION-001D6';

-- Verification
SELECT
  id,
  title,
  LENGTH(scope) as scope_chars,
  jsonb_array_length(success_criteria) as criteria_count
FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001D_'
ORDER BY id;
