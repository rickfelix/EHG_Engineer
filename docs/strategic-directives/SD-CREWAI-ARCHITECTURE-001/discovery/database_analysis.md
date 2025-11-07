# Dual-Database Analysis — CrewAI Architecture

**Analysis Date**: 2025-11-06T15:28:57.788Z
**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Phase**: Discovery (Phase 1)

## Executive Summary

### Key Findings

- **EHG_Engineer Database**: 55 related tables found
  - LEO Agents: 3 records
  - LEO Sub-Agents: 15 records
  - Governance structure exists for agent registration

- **EHG Application Database**: 20 related tables found
  - CrewAI Agents: 30 records
  - CrewAI Crews: 2 records
  - Crew Members: 8 records
  - Operational CrewAI platform fully implemented

### Critical Gaps Identified

- ⚠️ **REGISTRATION GAP**: 30 CrewAI agents exist but only 3 LEO agents registered
- Potential architectural misalignment between operational and governance layers
- CrewAI flows and executions may not be tracked in governance system

### Database Health Status

- **EHG_Engineer**: ✅ Connection successful, 55 tables analyzed
- **EHG Application**: ✅ Connection successful, 20 tables analyzed
- **RLS Policies**: Mixed implementation (details below)
- **Data Integrity**: Foreign key constraints present (see schema details)

---

## EHG_Engineer Database Analysis (Governance)

**Project ID**: dedlbzhpgkmetvhbkyzq
**Purpose**: LEO Protocol governance, Strategic Directives, PRDs, retrospectives

### Tables Found

| Table Name | Row Count | Columns | Constraints | RLS Policies |
|------------|-----------|---------|-------------|-------------|
| active_leo_protocol_view | 1 | 12 | 0 | 0 |
| agent_coordination_state | 0 | 19 | 6 | 2 |
| agent_events | 22 | 16 | 10 | 2 |
| agent_execution_cache | 3 | 14 | 8 | 2 |
| agent_intelligence_insights | 0 | 19 | 8 | 2 |
| agent_knowledge_base | 5 | 16 | 7 | 2 |
| agent_learning_outcomes | 0 | 33 | 16 | 2 |
| agent_performance_metrics | 3 | 24 | 27 | 2 |
| agentic_reviews | 12 | 19 | 7 | 3 |
| crewai_flow_executions | 0 | 18 | 8 | 2 |
| crewai_flow_templates | 3 | 16 | 6 | 2 |
| crewai_flows | 0 | 18 | 8 | 4 |
| cross_agent_correlations | 0 | 13 | 7 | 2 |
| exec_sub_agent_activations | 0 | 14 | 15 | 2 |
| leo_adrs | 0 | 14 | 13 | 2 |
| leo_agents | 3 | 12 | 6 | 2 |
| leo_artifacts | 0 | 8 | 6 | 2 |
| leo_codebase_validations | 6 | 13 | 6 | 2 |
| leo_complexity_thresholds | 4 | 5 | 5 | 2 |
| leo_gate_reviews | 65 | 7 | 9 | 2 |
| leo_handoff_executions | 358 | 25 | 10 | 2 |
| leo_handoff_rejections | 0 | 14 | 6 | 2 |
| leo_handoff_templates | 5 | 10 | 24 | 2 |
| leo_handoff_validations | 0 | 14 | 7 | 2 |
| leo_interfaces | 0 | 10 | 9 | 2 |
| leo_mandatory_validations | 2 | 9 | 5 | 2 |
| leo_nfr_requirements | 0 | 13 | 9 | 2 |
| leo_protocol_changes | 0 | 9 | 5 | 2 |
| leo_protocol_file_audit | 0 | 13 | 9 | 2 |
| leo_protocol_references | 0 | 7 | 5 | 2 |
| leo_protocol_sections | 83 | 9 | 18 | 3 |
| leo_protocols | 3 | 11 | 8 | 3 |
| leo_reasoning_sessions | 0 | 17 | 8 | 2 |
| leo_reasoning_triggers | 7 | 8 | 7 | 2 |
| leo_risk_spikes | 0 | 12 | 10 | 2 |
| leo_sub_agent_handoffs | 0 | 9 | 4 | 2 |
| leo_sub_agent_triggers | 235 | 9 | 6 | 2 |
| leo_sub_agents | 15 | 15 | 6 | 2 |
| leo_subagent_handoffs | 11 | 14 | 7 | 2 |
| leo_test_plans | 1 | 9 | 9 | 2 |
| leo_validation_rules | 11 | 8 | 8 | 2 |
| leo_workflow_phases | 0 | 9 | 10 | 2 |
| plan_sub_agent_executions | 0 | 12 | 13 | 2 |
| plan_subagent_queries | 0 | 15 | 11 | 2 |
| sub_agent_execution_batches | 1 | 18 | 6 | 2 |
| sub_agent_execution_results | 1514 | 15 | 11 | 3 |
| sub_agent_executions | 1 | 19 | 7 | 2 |
| sub_agent_gate_requirements | 13 | 7 | 5 | 2 |
| subagent_activations | 20 | 15 | 13 | 2 |
| subagent_requirements | 216 | 9 | 10 | 2 |
| v_agent_documentation_compliance | 0 | 5 | 0 | 0 |
| v_contexts_missing_sub_agents | 1 | 4 | 0 | 0 |
| v_sub_agent_execution_history | 1 | 16 | 0 | 0 |
| v_sub_agent_executions_unified | 1 | 20 | 0 | 0 |
| v_subagent_compliance | 399 | 11 | 0 | 0 |

### Schema: `active_leo_protocol_view`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | character varying(50) | YES | NULL |
| version | character varying(50) | YES | NULL |
| status | character varying(20) | YES | NULL |
| title | character varying(500) | YES | NULL |
| description | text | YES | NULL |
| content | text | YES | NULL |
| created_at | timestamp without time zone | YES | NULL |
| created_by | character varying(100) | YES | NULL |
| superseded_by | character varying(50) | YES | NULL |
| superseded_at | timestamp without time zone | YES | NULL |
| metadata | jsonb | YES | NULL |
| sections | json | YES | NULL |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data (first 1 rows)

```json
[
  {
    "id": "leo-v4-2-0-story-gates",
    "version": "v4.2.0_story_gates",
    "status": "active",
    "title": "LEO Protocol v4.2.0 - Story Gates & Automated Release Control",
    "description": "Automated release gates with user story verification, CI/CD integration, and branch protection enforcement. Enforces 80% quality threshold for all merges.",
    "content": "# LEO Protocol v4.2.0 - Story Gates & Automated Release Control\n\n## 🎯 Core Simplicity Principles\n\n**Universal Guidelines for All Agents:**\n\n1. **Occam's Razor**: The simplest solution that solves the problem wins\n2. **Boring Technology**: Use proven, reliable tools over novel, complex ones\n3. **Configuration Over Code**: Solve problems with settings before writing custom logic\n4. **80/20 Rule**: Focus on solutions that solve 80% of the problem with 20% of the effort\n5. **Maintenance Mindset**: Consider the developer who will modify this in 6 months\n\n**Complexity Justification Framework:**\n- Simple solution = Default choice, no justification needed\n- Complex solution = Requires extraordinary business/technical justification\n- Any added complexity must solve a real, measured problem\n\n**Universal Questions for All Agents:**\n- \"What's the simplest approach?\"\n- \"Can we use existing tools/patterns?\"\n- \"Why not just...?\"\n- \"What would we do with tight deadlines?\"\n- \"How do we solve this with zero new complexity?\"\n\n## Agent Responsibilities\n\n[Rest of protocol content continues...]",
    "created_at": "2025-09-17T17:51:50.360Z",
    "created_by": null,
    "superseded_by": null,
    "superseded_at": null,
    "metadata": {
      "created_at": "2025-09-17T13:51:49.118Z",
      "created_by": "add-leo-protocol-v4.2.0-story-gates.js",
      "key_features": [
        "User Story Generation",
        "Release Gates (80% threshold)",
        "Branch Protection",
        "CI/CD Webhooks",
        "Automated Merge Blocking"
      ],
      "migration_scripts": [
        "database/migrations/2025-01-17-user-stories-compat.sql",
        "database/migrations/verify-2025-01-17-user-stories.sql",
        "database/migrations/2025-01-17-prod-hardening.sql"
      ],
      "requires_migration": true,
      "backward_compatible": true
    },
    "sections": [
      {
        "section_type": "file_warning",
        "title": "⚠️ DO NOT EDIT THIS FILE DIRECTLY",
        "content": "**This file is AUTO-GENERATED from the database.**\n\n## To Make Changes:\n1. **For dynamic content** (agents, sub-agents, triggers): Update database tables directly\n2. **For static sections** (guides, examples, instructions): Add/update in `leo_protocol_sections` table\n3. **Regenerate file**: Run `node scripts/generate-claude-md-from-db.js`\n\n**Any direct edits to this file will be lost on next regeneration!**\n\nSee documentation for table structure: `database/schema/007_leo_protocol_schema_fixed.sql`",
        "order_index": 0
      },
      {
        "section_type": "smart_router",
        "title": "Context Router & Loading Strategy",
        "content": "# CLAUDE.md - LEO Protocol Context Router\n\n⚠️ **THIS IS A ROUTER FILE** - Read additional files based on task context\n\n## 📋 Loading Strategy (Follow These Steps)\n\n**Step 1: ALWAYS read CLAUDE_CORE.md first** (15k chars)\n- Essential workflow, application architecture, git guidelines\n- Required for ALL sessions\n- Contains: session prologue, execution philosophy, quick reference\n\n**Step 2: Detect user's phase and load appropriate file**\n\n| User Keywords | Load File | Size | Contents |\n|--------------|-----------|------|----------|\n| \"approve SD\", \"LEAD\", \"over-engineering\", \"directive review\", \"simplicity\" | CLAUDE_LEAD.md | 25k | LEAD operations, directive submission, simplicity enforcement |\n| \"create PRD\", \"PLAN\", \"schema validation\", \"pre-EXEC\", \"verification\" | CLAUDE_PLAN.md | 30k | PRD creation, validation gates, testing strategy |\n| \"implement\", \"EXEC\", \"write code\", \"component\", \"test\", \"build\" | CLAUDE_EXEC.md | 20k | Implementation requirements, dual testing, server restart |\n\n**Step 3: Load reference docs ONLY when specific issues arise**\n\n| Issue Type | Load File | Size |\n|------------|-----------|------|\n| Database errors, schema issues, RLS problems | docs/reference/database-agent-patterns.md | 15k |\n| Validation failures, gate blocking | docs/reference/validation-enforcement.md | 14k |\n| Test timeouts, E2E issues, Playwright | docs/reference/qa-director-guide.md | 8k |\n| Context high (>70%) | docs/reference/context-monitoring.md | 5k |\n| Sub-agent compression | docs/reference/sub-agent-compression.md | 6k |\n| Handoff creation issues | docs/reference/unified-handoff-system.md | 7k |\n| Database migration errors | docs/reference/database-migration-validation.md | 5k |\n\n## 🔍 Quick Decision Tree\n\n```\nSTART\n  ↓\nRead CLAUDE_CORE.md (always)\n  ↓\nUser request contains:\n  - \"approve\" OR \"LEAD\" OR \"directive\"? → Read CLAUDE_LEAD.md\n  - \"PRD\" OR \"PLAN\" OR \"validation\"? → Read CLAUDE_PLAN.md\n  - \"implement\" OR \"EXEC\" OR \"code\"? → Read CLAUDE_EXEC.md\n  - Specific error/issue? → Read relevant docs/reference/*.md\n  - General question? → CLAUDE_CORE.md is sufficient\n  ↓\nProceed with task\n```\n\n## 📊 Context Budget Tracking\n\nAfter loading files, you'll have consumed:\n- **Router + Core**: 3k + 15k = 18k chars (9% of 200k budget) ✅ HEALTHY\n- **Router + Core + Phase**: 18k + 25k avg = 43k chars (22% of budget) ✅ HEALTHY\n- **With reference doc**: 43k + 15k avg = 58k chars (29% of budget) ✅ HEALTHY\n- **Old CLAUDE.md**: 123k chars (62% of budget) ❌ INEFFICIENT\n\n## 📚 All Available Context Files\n\n### Core Files (Generated from Database)\n1. **CLAUDE_CORE.md** (15k) - Always read first\n   - Session prologue\n   - Application architecture (EHG vs EHG_Engineer)\n   - Execution philosophy\n   - Git commit guidelines\n   - Communication & context best practices\n   - Quick reference commands\n   - Development workflow\n   - Database operations overview\n   - Parallel execution patterns\n\n2. **CLAUDE_LEAD.md** (25k) - LEAD phase operations\n   - LEAD agent responsibilities\n   - Directive submission review process\n   - Over-engineering evaluation rubric\n   - Simplicity-first enforcement\n   - Strategic validation gate (6 questions)\n   - Code review requirements for UI/UX SDs\n   - SD evaluation 6-step checklist\n   - Phase 4 verification (stubbed code detection)\n\n3. **CLAUDE_PLAN.md** (30k) - PLAN phase operations\n   - PLAN pre-EXEC checklist\n   - Testing tier strategy\n   - CI/CD pipeline verification\n   - Component sizing guidelines (300-600 LOC sweet spot)\n   - BMAD enhancements (6 improvements)\n   - Multi-application testing architecture\n   - QA Engineering Director v2.0 guide\n   - PR size guidelines\n   - Database migration validation\n   - Context management proactive monitoring\n\n4. **CLAUDE_EXEC.md** (20k) - EXEC phase operations\n   - EXEC implementation requirements\n   - Dual test requirement (unit + E2E MANDATORY)\n   - TODO comment standard\n   - Strategic directive execution protocol\n   - 5-phase workflow (EXEC portions)\n   - Testing tier strategy (updated)\n   - Playwright MCP integration\n   - Sub-agent parallel execution\n\n### Reference Documentation (Load on Demand)\n5. **docs/reference/database-agent-patterns.md** (15k)\n   - Error-triggered invocation patterns\n   - Database workaround anti-patterns\n   - First-responder checklist\n   - Integration requirements\n\n6. **docs/reference/validation-enforcement.md** (14k)\n   - Intelligent validation framework (4 gates)\n   - Adaptive thresholds (70-100%) based on risk/performance/maturity\n   - Phase-aware weighting and non-negotiable blockers\n   - Hybrid validation logic (Phase 1 blockers + Phase 2 scoring)\n   - Pattern tracking for maturity bonuses\n   - Testing guide, debugging, and troubleshooting\n\n7. **docs/reference/qa-director-guide.md** (8k)\n   - Enhanced QA Engineering Director v2.0\n   - 5-phase workflow\n   - Pre-test build validation\n   - E2E testing requirements\n\n8. **docs/reference/context-monitoring.md** (5k)\n   - Token budget thresholds\n   - Proactive monitoring requirements\n   - Compaction strategies\n\n9. **docs/reference/sub-agent-compression.md** (6k)\n   - 3-tier compression system\n   - TIER 1/2/3 patterns\n   - When to use each tier\n\n10. **docs/reference/unified-handoff-system.md** (7k)\n    - 7-element handoff structure\n    - Database-first handoff creation\n    - RLS bypass patterns\n\n[Additional reference docs listed with descriptions...]\n\n## 🧠 Smart Loading Examples\n\n### Example 1: LEAD Approval Request\n```\nUser: \"Review and approve SD-EXPORT-001\"\nAI thinking: Keywords \"approve\" detected → LEAD phase\nActions:\n  1. Read CLAUDE_CORE.md (15k)\n  2. Read CLAUDE_LEAD.md (25k)\nTotal context: 40k chars (20% of budget)\nProceed with: LEAD pre-approval process, strategic validation gate\n```\n\n### Example 2: Database Error\n```\nUser: \"I'm getting 'column does not exist' error when running migration\"\nAI thinking: Database error detected → Need database agent patterns\nActions:\n  1. Read CLAUDE_CORE.md (15k)\n  2. Read docs/reference/database-agent-patterns.md (15k)\nTotal context: 30k chars (15% of budget)\nProceed with: Database agent error-triggered invocation\n```\n\n### Example 3: Implementation Task\n```\nUser: \"Implement the user settings component according to PRD-SETTINGS-001\"\nAI thinking: Keywords \"implement\" detected → EXEC phase\nActions:\n  1. Read CLAUDE_CORE.md (15k)\n  2. Read CLAUDE_EXEC.md (20k)\nTotal context: 35k chars (18% of budget)\nProceed with: EXEC pre-implementation checklist, dual testing\n```\n\n## 📏 Context Efficiency Rules\n\n**This router system achieves**:\n- **85% reduction** on session start (123k → 18k chars)\n- **65% reduction** with phase loaded (123k → 43k avg)\n- **On-demand reference loading** (saves 30-50k chars per session)\n\n**Old approach**:\n- Loaded full 123k chars immediately\n- Consumed 62% of context budget before any work\n- Wasted tokens on irrelevant sections\n\n**New approach**:\n- Load only what you need\n- Start with 9% of budget (18k chars)\n- Add phase-specific context as needed (22-24% total)\n- Load reference docs selectively (29% max)\n\n## ⚠️ Critical Reminder\n\n**DO NOT** attempt to load old CLAUDE.md (deprecated)\n**DO** follow this router's loading strategy\n**DO** track context consumption after loading files\n**DO** report context health in handoffs\n\n---\n\n*Router generated from database: leo_protocol_sections*\n*Last updated: 2025-10-13*\n*Part of LEO Protocol v4.2.0 performance optimization*",
        "order_index": 0
      },
      {
        "section_type": "session_prologue",
        "title": "Session Prologue (Short)",
        "content": "1. **Follow LEAD→PLAN→EXEC** - Target ≥85% gate pass rate\n2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs\n3. **Database-first** - No markdown files as source of truth\n4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, unified-handoff-system.js ⚠️\n5. **Small PRs** - Target ≤100 lines, max 400 with justification\n6. **Priority-first** - Use `npm run prio:top3` to justify work\n\n*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*",
        "order_index": 1
      },
      {
        "section_type": "application_architecture",
        "title": "🏗️ Application Architecture - CRITICAL CONTEXT",
        "content": "### Two Distinct Applications:\n1. **EHG_Engineer** (Management Dashboard) - WHERE YOU ARE NOW\n   - **Path**: `/mnt/c/_EHG/EHG_Engineer/`\n   - **Purpose**: LEO Protocol dashboard for managing Strategic Directives & PRDs\n   - **Database**: dedlbzhpgkmetvhbkyzq (Supabase)\n   - **GitHub**: https://github.com/rickfelix/EHG_Engineer.git\n   - **Port**: 3000-3001\n   - **Role**: MANAGEMENT TOOL ONLY - no customer features here!\n\n2. **EHG** (Business Application) - IMPLEMENTATION TARGET\n   - **Path**: `/mnt/c/_EHG/ehg/`\n   - **Purpose**: The actual customer-facing business application\n   - **Database**: liapbndqlqxdcgpwntbv (Supabase)\n   - **GitHub**: https://github.com/rickfelix/ehg.git\n   - **Built with**: Vite + React + Shadcn + TypeScript\n   - **Role**: WHERE ALL FEATURES GET IMPLEMENTED\n\n### ⚠️ CRITICAL: During EXEC Phase Implementation\n1. **Read PRD** from EHG_Engineer database\n2. **Navigate** to `/mnt/c/_EHG/ehg/` for implementation\n3. **Make code changes** in EHG application (NOT in EHG_Engineer!)\n4. **Push changes** to EHG's GitHub repo: `rickfelix/ehg.git`\n5. **Track progress** in EHG_Engineer dashboard\n\n### 🔄 Workflow Relationship\n```\nEHG_Engineer (Management)          EHG App (Implementation)\n├── Strategic Directives     →     Features implemented here\n├── PRDs                     →     Code changes made here\n├── Progress Tracking        ←     Results verified from here\n└── Dashboard Views          ←     No changes here!\n```",
        "order_index": 2
      },
      {
        "section_type": "strategic_directive_execution_protocol",
        "title": "Strategic Directive Execution Protocol",
        "content": "# STRATEGIC DIRECTIVE EXECUTION PROTOCOL\n\n**When executing a Strategic Directive, follow this structured 5-phase workflow.**\n\n## Target Application Selection\n\n**CRITICAL FIRST STEP**: Determine which application this SD targets:\n\n- **EHG** (`/mnt/c/_EHG/ehg/`) - Customer-facing features (MOST IMPLEMENTATIONS)\n  - Database: liapbndqlqxdcgpwntbv (Supabase)\n  - GitHub: rickfelix/ehg.git\n  - Stack: Vite + React + Shadcn + TypeScript\n\n- **EHG_Engineer** (`/mnt/c/_EHG/EHG_Engineer/`) - LEO Protocol dashboard/tooling ONLY\n  - Database: dedlbzhpgkmetvhbkyzq (Supabase)\n  - GitHub: rickfelix/EHG_Engineer.git\n  - Role: Management tool, no customer features\n\n## Priority Tiers\n\n- **CRITICAL** (90+): Business-critical, immediate action required\n- **HIGH** (70-89): Important features, near-term priority\n- **MEDIUM** (50-69): Standard enhancements, planned work\n- **LOW** (30-49): Nice-to-have improvements\n\n## Workflow Overview\n\nExecute in order: **LEAD PRE-APPROVAL → PLAN PRD → EXEC IMPLEMENTATION → PLAN VERIFICATION → LEAD FINAL APPROVAL**\n\nEach phase has:\n- Assigned agent (LEAD/PLAN/EXEC)\n- Percentage allocation\n- Required sub-agents\n- Exit criteria\n- Mandatory handoff\n\nSee detailed phase sections below.",
        "order_index": 5
      },
      {
        "section_type": "execution_philosophy",
        "title": "Execution Philosophy",
        "content": "## 🧠 EXECUTION PHILOSOPHY (Read First!)\n\nThese principles override default behavior and must be internalized before starting work:\n\n### Quality-First (PARAMOUNT)\n**Get it right, not fast.** Correctness and completeness are MORE IMPORTANT than speed.\n- Take the time needed to understand requirements fully\n- Verify BEFORE implementing, test BEFORE claiming completion\n- 2-4 hours of careful implementation beats 6-12 hours of rework\n- If rushing leads to mistakes, you haven't saved time - you've wasted it\n- \"Done right\" > \"Done fast\" - ALWAYS\n\n### Testing-First (MANDATORY)\n**Build confidence through comprehensive testing.**\n- E2E testing is MANDATORY, not optional\n- 30-60 minute investment saves 4-6 hours of rework\n- 100% user story coverage required\n- Both unit tests AND E2E tests must pass\n- Tests are not overhead - they ARE the work\n\n### Database-First (REQUIRED)\n**Zero markdown files.** Database tables are single source of truth.\n- SDs → `strategic_directives_v2`\n- PRDs → `product_requirements_v2`\n- Handoffs → `sd_phase_handoffs`\n- Retrospectives → `retrospectives`\n- Sub-agent results → `sub_agent_execution_results`\n\n### Validation-First (GATEKEEPING)\n**Thorough validation BEFORE approval, full commitment AFTER.**\n- LEAD validates: Real problem? Feasible solution? Resources available?\n- After LEAD approval: SCOPE LOCK - deliver what was approved\n- Exception: Critical blocker + human approval + new SD for deferred work\n\n### Context-Aware (PROACTIVE)\n**Monitor token usage proactively throughout execution.**\n- Report context health in EVERY handoff\n- HEALTHY (<70%), WARNING (70-90%), CRITICAL (90-95%), EMERGENCY (>95%)\n- Use `/context-compact` when approaching WARNING threshold\n\n### Application-Aware (VERIFICATION)\n**Verify directory BEFORE writing ANY code.**\n- `cd /mnt/c/_EHG/ehg && pwd` for customer features\n- `git remote -v` to confirm correct repository\n- Wrong directory = STOP immediately\n\n### Evidence-Based (PROOF REQUIRED)\n**Screenshot, test, verify. Claims without evidence are rejected.**\n- Screenshot BEFORE and AFTER changes\n- Test results with pass/fail counts\n- CI/CD pipeline status (green checks required)\n- Sub-agent verification results in database\n\n**REMEMBER**: The goal is NOT to complete SDs quickly. The goal is to complete SDs CORRECTLY. A properly implemented SD that takes 8 hours is infinitely better than a rushed implementation that takes 4 hours but requires 6 hours of fixes.\n",
        "order_index": 6
      },
      {
        "section_type": "five_phase_workflow",
        "title": "5-Phase Strategic Directive Workflow",
        "content": "## 🎯 5-PHASE STRATEGIC DIRECTIVE WORKFLOW\n\nTotal: 100% = LEAD (35%) + PLAN (35%) + EXEC (30%)\n\n---\n\n### PHASE 1: LEAD PRE-APPROVAL (20% of LEAD allocation)\n\n**Agent**: Strategic Leadership Agent (LEAD)\n**Purpose**: Strategic validation, business alignment, feasibility assessment\n**Duration**: 1-2 hours\n\n**Mandatory Sub-Agents**:\n- Principal Systems Analyst (duplicate check, existing implementation)\n- Principal Database Architect (if database keywords in scope)\n- Chief Security Architect (if security keywords in scope)\n- Senior Design Sub-Agent (if UI/UX keywords in scope)\n\n**Execution**: Run in parallel to save time\n```bash\n# Parallel execution\nnode scripts/systems-analyst-codebase-audit.js <SD-ID> &\nnode scripts/database-architect-schema-review.js <SD-ID> &\nnode scripts/security-architect-assessment.js <SD-ID> &\nnode scripts/design-subagent-evaluation.js <SD-ID> &\nwait\n```\n\n**Deliverables**:\n- SD approved or rejected with feedback\n- Strategic Validation gate passed\n- Over-engineering rubric applied (if needed)\n- LEAD→PLAN handoff created\n\n**Exit Criteria**:\n- SD status = 'active'\n- Strategic Validation gate passed (6 questions answered)\n- No critical blockers identified\n- Handoff stored in `sd_phase_handoffs`\n\n---\n\n### PHASE 2: PLAN PRD CREATION (20% of PLAN allocation)\n\n**Agent**: Technical Planning Agent (PLAN)\n**Purpose**: Technical design, PRD creation, test planning\n**Duration**: 2-4 hours\n\n**Mandatory Sub-Agents**:\n- Principal Database Architect (MANDATORY for ALL SDs - database validation)\n- Product Requirements Expert (auto-generates user stories)\n\n**Execution**: Sequential (each informs next)\n```bash\n# Step 1: Database validation\nnode scripts/database-architect-schema-review.js <SD-ID>\n\n# Step 2: User story generation (automatic)\n# Triggered by PRD creation, stores in user_stories table\n\n# Step 3: Component sizing (if UI/UX SD)\nnode scripts/design-subagent-evaluation.js <SD-ID>\n```\n\n**Deliverables**:\n- PRD created in `product_requirements_v2` table\n- User stories in `user_stories` table (100% mapped to E2E tests)\n- Component architecture defined (300-600 LOC per component)\n- Database migrations planned (if needed)\n- PLAN→EXEC handoff created\n\n**Exit Criteria**:\n- PRD exists with comprehensive test plan\n- User stories generated and validated\n- Database dependencies resolved or escalated\n- Handoff stored in `sd_phase_handoffs`\n\n---\n\n### PHASE 3: EXEC IMPLEMENTATION (30% of EXEC allocation)\n\n**Agent**: Implementation Agent (EXEC)\n**Purpose**: Code implementation, testing, delivery\n**Duration**: 4-8 hours\n\n**Mandatory Sub-Agents**:\n- None (EXEC does the work directly)\n\n**Pre-Implementation Checklist**:\n```markdown\n## EXEC Pre-Implementation Checklist\n- [ ] Application: [EHG or EHG_Engineer - VERIFIED via pwd]\n- [ ] GitHub remote: [verified via git remote -v]\n- [ ] URL: [exact URL from PRD - accessible: YES/NO]\n- [ ] Component: [path/to/component]\n- [ ] Screenshot: [BEFORE state captured]\n```\n\n**Post-Implementation Requirements**:\n1. **Server Restart** (MANDATORY for UI changes)\n   ```bash\n   pkill -f \"node server.js\"\n   npm run build:client  # If UI changes\n   PORT=3000 node server.js\n   # Hard refresh: Ctrl+Shift+R\n   ```\n\n2. **Git Commit** (Conventional Commits with SD-ID)\n   ```bash\n   git commit -m \"feat(<SD-ID>): Brief description\n\n   Detailed explanation.\n\n   🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\n   Co-Authored-By: Claude <noreply@anthropic.com>\"\n   ```\n\n3. **Dual Test Execution** (MANDATORY - BOTH types)\n   ```bash\n   npm run test:unit      # Business logic\n   npm run test:e2e       # User flows\n   ```\n\n4. **Wait for CI/CD** (2-3 minutes)\n   ```bash\n   gh run list --limit 5  # All green ✅\n   ```\n\n**Deliverables**:\n- Implementation complete\n- Unit tests pass\n- E2E tests pass (100% user story coverage)\n- CI/CD pipelines green\n- Documentation generated\n- EXEC→PLAN handoff created\n\n**Exit Criteria**:\n- All PRD requirements implemented\n- Both test types passing\n- CI/CD green\n- Documentation exists in `generated_docs`\n- Handoff stored in `sd_phase_handoffs`\n\n---\n\n### PHASE 4: PLAN SUPERVISOR VERIFICATION (15% of PLAN allocation)\n\n**Agent**: Technical Planning Agent (PLAN) in supervisor mode\n**Purpose**: Verification, quality assurance, sub-agent orchestration\n**Duration**: 1-2 hours\n\n**Mandatory Sub-Agents**:\n- QA Engineering Director (CRITICAL - E2E testing)\n- DevOps Platform Architect (CRITICAL - CI/CD verification)\n- Principal Database Architect (if database changes)\n- Chief Security Architect (if security features)\n- Performance Engineering Lead (if performance-critical)\n- Senior Design Sub-Agent (if UI components)\n\n**Automated Orchestration**:\n```bash\n# Orchestrator runs automatically when creating EXEC→PLAN handoff\n# All required sub-agents execute in parallel\n# Results stored in sub_agent_execution_results table\n# Handoff BLOCKED if CRITICAL sub-agents fail\n```\n\n**Manual Verification** (if needed):\n```bash\n# QA Director\nnode scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e\n\n# GitHub Actions\ngh run list --limit 5\ngh run view [run-id]\n\n# Database verification\nnode scripts/database-architect-schema-review.js <SD-ID>\n```\n\n**Deliverables**:\n- All sub-agents executed\n- E2E tests passed (100% user stories)\n- CI/CD pipelines verified green\n- Integration verification complete\n- PLAN→LEAD handoff created\n\n**Exit Criteria**:\n- Verdict: PASS or CONDITIONAL_PASS (≥85% confidence)\n- All CRITICAL sub-agents passed\n- E2E test evidence documented\n- Handoff stored in `sd_phase_handoffs`\n\n---\n\n### PHASE 5: LEAD FINAL APPROVAL (15% of LEAD allocation)\n\n**Agent**: Strategic Leadership Agent (LEAD)\n**Purpose**: Final approval, retrospective, completion\n**Duration**: 30-60 minutes\n\n**Mandatory Sub-Agents**:\n- Continuous Improvement Coach (RETRO - retrospective generation)\n\n**Automated Orchestration**:\n```bash\n# Orchestrator runs automatically when creating PLAN→LEAD handoff\n# RETRO sub-agent executes if not already run\n# Handoff BLOCKED if retrospective missing\n```\n\n**Approval Checklist**:\n- [ ] PLAN→LEAD handoff reviewed\n- [ ] Verification verdict acceptable (PASS or CONDITIONAL_PASS)\n- [ ] All PRD requirements met (SCOPE LOCK validation)\n- [ ] CI/CD pipelines green\n- [ ] E2E test evidence sufficient (100% user stories)\n- [ ] Retrospective generated\n- [ ] Sub-agent validation script passed\n- [ ] Human approval (if required)\n\n**Deliverables**:\n- SD marked as 'completed'\n- Progress = 100%\n- Retrospective in `retrospectives` table\n- All handoffs complete\n- Dashboard updated\n\n**Exit Criteria**:\n- SD status = 'completed'\n- progress_percentage = 100\n- completed_at timestamp set\n- Retrospective exists with quality_score ≥ 70\n",
        "order_index": 7
      },
      {
        "section_type": "context_management_upfront",
        "title": "Context Management Throughout Execution",
        "content": "## 🧠 CONTEXT MANAGEMENT (Throughout Execution)\n\n**Token Budget**: 200,000 tokens\n\n### Status Thresholds\n\n| Status | Range | Percentage | Action |\n|--------|-------|------------|--------|\n| 🟢 HEALTHY | 0-140K | 0-70% | Continue normally |\n| 🟡 WARNING | 140K-180K | 70-90% | Consider `/context-compact` |\n| 🔴 CRITICAL | 180K-190K | 90-95% | MUST compact before handoff |\n| 🚨 EMERGENCY | >190K | >95% | BLOCKED - force handoff |\n\n### Report in EVERY Handoff\n\n**Mandatory section in all handoffs**:\n```markdown\n## Context Health\n**Current Usage**: X tokens (Y% of 200K budget)\n**Status**: HEALTHY/WARNING/CRITICAL\n**Recommendation**: [action if needed]\n**Compaction Needed**: YES/NO\n```\n\n### Efficiency Rules\n\n**Always apply these practices**:\n\n1. **Select specific columns** (not `SELECT *`)\n   ```javascript\n   // ❌ Bad\n   .select('*')\n\n   // ✅ Good\n   .select('id, title, status, priority')\n   ```\n\n2. **Limit results** for large datasets\n   ```javascript\n   .limit(5)  // For summaries\n   .limit(50) // For dashboards\n   ```\n\n3. **Summarize, don't dump**\n   ```javascript\n   // ❌ Bad: Full JSON dump\n   console.log(results);\n\n   // ✅ Good: Summary\n   console.log(`Found ${results.length} tests: ${passed} passed, ${failed} failed`);\n   ```\n\n4. **Use Read tool with offset/limit** for large files\n   ```javascript\n   Read('file.js', { offset: 100, limit: 50 })\n   ```\n\n5. **Compress sub-agent reports** (3-tier system)\n   - TIER 1 (CRITICAL): Full detail for blockers\n   - TIER 2 (IMPORTANT): Structured summary for warnings\n   - TIER 3 (INFORMATIONAL): One-line for passing checks\n\n### Expected Impact\n\nApplying these rules: **90-98% token reduction per query**\n\n### Compaction Command\n\nWhen WARNING or CRITICAL:\n```bash\n/context-compact [focus area]\n```\n\nExample:\n```bash\n/context-compact database-schema\n```",
        "order_index": 8
      },
      {
        "section_type": "exec_implementation_requirements",
        "title": "🚨 EXEC Agent Implementation Requirements",
        "content": "### MANDATORY Pre-Implementation Verification\nBefore writing ANY code, EXEC MUST:\n\n0. **AMBIGUITY RESOLUTION** 🔍 CRITICAL FIRST STEP\n   - Review PRD for unclear requirements, missing details, or conflicting specifications\n   - Do NOT proceed with implementation if ANY ambiguity exists\n   - Use 3-tier escalation to resolve:\n     1. **Re-read PRD**: Check acceptance_criteria, functional_requirements, test_scenarios\n     2. **Query database context**: Check user stories, implementation_context, SD strategic_objectives\n     3. **Ask user**: Use AskUserQuestion tool with specific, focused questions\n   - Document resolution: \"Ambiguity in [area] resolved via [method]: [resolution]\"\n   - **If still unclear after escalation**: BLOCK implementation and await user clarification\n\n**Common Ambiguities to Watch For**:\n- Vague feature descriptions (\"improve UX\", \"make it better\")\n- Missing edge case handling (\"what if user inputs invalid data?\")\n- Unclear success criteria (\"should be fast\", \"should look good\")\n- Conflicting requirements between PRD sections\n- Undefined behavior for error states\n\n**Example Ambiguity Resolution**:\n```\n❌ BAD: Guess at implementation based on similar feature\n✅ GOOD:\n  - Tier 1: Re-read PRD section 3.2 → Still unclear on validation rules\n  - Tier 2: Query user_stories table → Found implementation_context with validation spec\n  - Resolution: \"Email validation will use regex pattern from US-002 context\"\n```\n\n1. **APPLICATION CHECK** ⚠️ CRITICAL\n   - Confirm target app: `/mnt/c/_EHG/ehg/` (NOT EHG_Engineer!)\n   - Verify: `cd /mnt/c/_EHG/ehg && pwd` should show `/mnt/c/_EHG/ehg`\n   - Check GitHub: `git remote -v` should show `rickfelix/ehg.git`\n   - If you're in EHG_Engineer, you're in the WRONG place for implementation!\n\n2. **URL Verification** ✅\n   - Navigate to the EXACT URL specified in the PRD\n   - Confirm the page loads and is accessible\n   - Take a screenshot for evidence\n   - Document: \"Verified: [URL] is accessible\"\n\n3. **Component Identification** 🎯\n   - Identify the exact file path of the target component\n   - Confirm component exists at specified location\n   - Document: \"Target component: [full/path/to/component.tsx]\"\n\n4. **Application Context** 📁\n   - Verify correct application directory\n   - Confirm port number matches PRD\n   - Document: \"Application: [/path/to/app] on port [XXXX]\"\n\n5. **Visual Confirmation** 📸\n   - Screenshot current state BEFORE changes\n   - Identify exact location for new features\n   - Document: \"Current state captured, changes will go at [location]\"\n\n### Implementation Checklist Template\n```markdown\n## EXEC Pre-Implementation Checklist\n- [ ] **Ambiguity Check**: All requirements clear and unambiguous\n- [ ] **Ambiguity Resolution**: [NONE FOUND | Resolved via Tier X: description]\n- [ ] **Application verified**: [/mnt/c/_EHG/ehg/ confirmed]\n- [ ] **URL verified**: [exact URL from PRD]\n- [ ] **Page accessible**: [YES/NO]\n- [ ] **Component identified**: [path/to/component]\n- [ ] **Port confirmed**: [port number]\n- [ ] **Screenshot taken**: [timestamp]\n- [ ] **Target location confirmed**: [where changes go]\n```\n\n### Common Mistakes to AVOID\n- ❌ Assuming component location based on naming similarity\n- ❌ Implementing without navigating to the URL first\n- ❌ Ignoring port numbers in URLs\n- ❌ Pattern matching without verification\n- ❌ Starting to code before completing checklist\n- ❌ Not restarting dev servers after changes\n- ❌ **CRITICAL**: Creating files for PRDs, handoffs, or documentation\n- ❌ **CRITICAL**: Proceeding with implementation when requirements are ambiguous",
        "order_index": 10
      },
      {
        "section_type": "git_commit_guidelines",
        "title": "🔄 Git Commit Guidelines",
        "content": "**Git Commit Guidelines**: `<type>(<SD-ID>): <subject>` format MANDATORY\n\n**Required**: Type (feat/fix/docs/etc), SD-ID scope, imperative subject, AI attribution in footer\n**Timing**: After checklist items, before context switches, at logical breakpoints\n**Branch Strategy**: `eng/` prefix for EHG_Engineer, standard prefixes for EHG app features\n**Size**: <100 lines ideal, <200 max\n\n**Full Guidelines**: See `docs/03_protocols_and_standards/leo_git_commit_guidelines_v4.2.0.md`",
        "order_index": 20
      },
      {
        "section_type": "PHASE_2_PLANNING",
        "title": "Deferred Work Management",
        "content": "\n## Deferred Work Management\n\n**Purpose**: Prevent losing track of work when reducing SD scope\n\n**Root Cause** (SD-VENTURE-BACKEND-002 Lesson):\nWhen SD-VENTURE-IDEATION-MVP-001's backend scope was deferred, no child SD was created immediately. Work was completed 6 months later but without tracking, requiring extensive backfill to restore LEO Protocol compliance.\n\n**The Problem**:\n- LEAD approves SD with 100 story points\n- During PLAN, team realizes 40 points should be deferred\n- PRD created with 60 points, work proceeds\n- Deferred 40 points forgotten → completed later without tracking → backfill nightmare\n\n---\n\n### MANDATORY PROCESS: Create Child SD Immediately\n\n**WHEN**: During PLAN phase, if any work is removed/deferred from approved scope\n\n**REQUIRED ACTION**:\n1. **Create child SD BEFORE finalizing PRD**\n2. **Transfer user stories** to child SD\n3. **Document relationship** in both SDs\n4. **Set priority** based on criticality\n5. **Link PRDs** (parent PRD references child SD)\n\n---\n\n### Example Workflow\n\n**Scenario**: SD-VENTURE-MVP-001 approved for 10 user stories (100 points)\n\n**PLAN discovers**: Stories 6-10 (40 points) are backend-only, can be deferred\n\n**CORRECT Process** ✅:\n\n```bash\n# 1. Create child SD immediately\nINSERT INTO strategic_directives_v2 (\n  id, title, description, priority, status,\n  parent_directive_id, relationship_type\n) VALUES (\n  'SD-VENTURE-BACKEND-001',\n  'Venture Backend Implementation',\n  'Deferred backend work from SD-VENTURE-MVP-001',\n  'high',           -- Set based on business need\n  'approved',       -- Already approved via parent\n  'SD-VENTURE-MVP-001',\n  'deferred_scope'\n);\n\n# 2. Transfer user stories to child SD\nUPDATE user_stories\nSET sd_id = 'SD-VENTURE-BACKEND-001'\nWHERE sd_id = 'SD-VENTURE-MVP-001'\nAND id IN ('US-006', 'US-007', 'US-008', 'US-009', 'US-010');\n\n# 3. Update parent PRD to document deferral\nUPDATE product_requirements_v2\nSET metadata = metadata || jsonb_build_object(\n  'scope_reductions', jsonb_build_array(\n    jsonb_build_object(\n      'deferred_to', 'SD-VENTURE-BACKEND-001',\n      'user_stories', ARRAY['US-006', 'US-007', 'US-008', 'US-009', 'US-010'],\n      'story_points', 40,\n      'reason', 'Backend implementation deferred to separate sprint',\n      'deferred_at', NOW()\n    )\n  )\n)\nWHERE id = 'PRD-VENTURE-MVP-001';\n\n# 4. Create child PRD immediately (or mark as TODO)\n-- Option A: Create minimal PRD now\nINSERT INTO product_requirements_v2 (\n  id, sd_uuid, title, status, progress,\n  deferred_from\n) VALUES (\n  'PRD-VENTURE-BACKEND-001',\n  (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-VENTURE-BACKEND-001'),\n  'Venture Backend Implementation',\n  'planning',  -- Will be worked on later\n  0,\n  'PRD-VENTURE-MVP-001'\n);\n\n-- Option B: Add TODO to parent SD notes\n-- \"TODO: Create PRD-VENTURE-BACKEND-001 when ready to start backend work\"\n```\n\n---\n\n### Backfill Process (If Child SD Was Not Created)\n\n**Scenario**: Work completed without tracking (like SD-VENTURE-BACKEND-002)\n\n**Required Steps**:\n\n1. **Create SD record**\n   - Use historical commit data for dates\n   - Set status: 'completed'\n\n2. **Create PRD**\n   - Set status: 'implemented' (not 'planning')\n   - Set progress: 100\n\n3. **Create user stories**\n   - Extract from git commits\n   - Set verification_status: 'passing' or 'validated'\n   - Put in BOTH user_stories AND sd_backlog_map tables\n\n4. **Create deliverables**\n   - Extract from git history\n   - Map to valid deliverable_types: api, test, documentation, migration\n   - Mark all as completion_status: 'completed'\n\n5. **Create handoffs**\n   - EXEC→PLAN: Implementation summary\n   - PLAN→LEAD: Verification summary\n   - Use manual creation (validation gates not suitable for backfill)\n\n6. **Create retrospective**\n   - Document lessons learned\n   - Note: \"Tracking backfilled retroactively\"\n\n7. **Mark SD complete**\n   - Fix any blocking issues first\n   - Ensure all progress gates pass\n\n**Backfill Scripts Created**: See /scripts/create-*-venture-backend-002-*.mjs\n\n---\n\n### Checklist: Scope Reduction Decision Point\n\nUse this during PLAN phase when considering scope changes:\n\n- [ ] **Identify deferred work**: Which user stories/deliverables are being removed?\n- [ ] **Assess criticality**: Is this work needed eventually? (If yes → child SD required)\n- [ ] **Create child SD**: Don't defer this step! Create the SD now.\n- [ ] **Transfer user stories**: Move them to child SD immediately\n- [ ] **Set priority**: high/medium/low based on business need\n- [ ] **Document relationship**: Update parent PRD metadata\n- [ ] **Create child PRD** (minimal) OR add TODO to parent notes\n- [ ] **Notify LEAD**: \"Scope reduced, child SD created: SD-XXX\"\n\n---\n\n### Red Flags (Lessons from SD-VENTURE-BACKEND-002)\n\n❌ **\"We'll create the SD later when we work on it\"**\n   - Result: Work gets forgotten or done without tracking\n\n❌ **\"Let's just note it in the parent PRD description\"**\n   - Result: No tracking, no progress visibility, no reminders\n\n❌ **\"It's only 3 user stories, not worth a separate SD\"**\n   - Result: Those 3 stories = 25 deliverables, 4 commits, 2 handoffs to backfill\n\n✅ **\"Scope changed, creating child SD now\"**\n   - Result: Work tracked from day 1, no backfill needed\n\n---\n\n### Documentation Updates\n\nThis section added to LEO Protocol based on:\n- **Incident**: SD-VENTURE-BACKEND-002 backfill (Oct 19, 2025)\n- **Root Cause**: Child SD not created when backend scope deferred\n- **Solution**: Mandatory child SD creation at scope reduction point\n- **Prevention**: PLAN checklist enforcement, LEAD verification\n\n**Related Sections**:\n- Phase 2 (PLAN Pre-EXEC Checklist): Added scope reduction check\n- Phase 4 (LEAD Verification): Verify child SDs created for deferrals\n- Retrospective Templates: Include \"Deferred work management\" assessment\n\n---\n\n### Integration with Existing Workflow\n\n**PLAN Agent** must now:\n1. Check for scope reductions during PRD creation\n2. Create child SDs for any deferred work\n3. Document relationship in metadata\n4. Report to LEAD in PLAN→LEAD handoff\n\n**LEAD Agent** must verify:\n- Any scope reduction has corresponding child SD\n- Child SD has appropriate priority\n- Parent-child relationship documented\n- User stories transferred correctly\n\n**Progress Tracking**:\n- Parent SD progress: Based on reduced scope (60 points)\n- Child SD progress: Tracked independently (40 points)\n- Portfolio view: Shows both SDs with relationship\n\n---\n\n### FAQ\n\n**Q: What if we're not sure the deferred work will ever be done?**\nA: Create the child SD with priority: 'low'. Better to have it and not need it than lose track of potential work.\n\n**Q: Can we combine multiple deferrals into one child SD?**\nA: Yes, if they're related. Example: \"SD-VENTURE-FUTURE-ENHANCEMENTS\" for all nice-to-have features.\n\n**Q: What if the deferred work changes significantly later?**\nA: Update the child SD's PRD when you start working on it. The SD serves as a placeholder until then.\n\n**Q: Do we need a full PRD for the child SD immediately?**\nA: Minimal PRD is acceptable. At minimum: title, description, deferred_from reference. Full PRD created when work begins.\n\n**Q: What section_type for database?**\nA: Use 'PHASE_2_PLANNING' (belongs in PLAN phase guidance)\n\n",
        "order_index": 25
      },
      {
        "section_type": "database",
        "title": "Database Operations - One Table at a Time",
        "content": "### REQUIRED: Database Operations Only\n\n**⚠️ CRITICAL: One Table at a Time**\n- When manipulating Supabase tables, **ALWAYS operate on ONE table at a time**\n- Batch operations across multiple tables often fail or cause inconsistencies\n- Complete each table operation fully before moving to the next table\n- Verify success after each table operation before proceeding\n\n**Strategic Directives**:\n- ✅ Create in `strategic_directives_v2` table\n- ✅ Use `scripts/create-strategic-directive.js` or dashboard\n- ✅ ALL SD data must be in database, not files\n- ✅ **One SD insertion at a time** - verify before next\n\n**PRDs (Product Requirements)**:\n- ✅ Create in `product_requirements_v2` table\n- ✅ Use `scripts/add-prd-to-database.js`\n- ✅ Link to SD via `strategic_directive_id` foreign key\n- ✅ **One PRD insertion at a time** - verify before next\n\n**Retrospectives**:\n- ✅ Create in `retrospectives` table\n- ✅ Use `scripts/generate-comprehensive-retrospective.js`\n- ✅ Trigger: Continuous Improvement Coach sub-agent\n- ✅ Link to SD via `sd_id` foreign key\n- ✅ **One retrospective at a time** - verify before next\n\n**Handoffs**:\n- ✅ Store in handoff tracking tables\n- ✅ 7-element structure required\n- ✅ Link to SD and phase\n- ✅ **One handoff at a time** - verify before next\n\n**Progress & Verification**:\n- ✅ Update database fields directly\n- ✅ Store verification results in database\n- ✅ Track in real-time via dashboard\n- ✅ **One record update at a time** - verify before next",
        "order_index": 26
      },
      {
        "section_type": "communication_context",
        "title": "📊 Communication & Context",
        "content": "### Communication Style\n\n**Brief by Default**: Responses should be concise and action-oriented unless the user explicitly requests detailed explanations.\n\n**When to be Brief** (default):\n- Status updates and progress reports\n- Acknowledging commands or requests\n- Confirming successful operations\n- Error messages (summary + fix)\n- Tool invocation descriptions\n\n**When to be Verbose** (only if requested):\n- User asks \"explain in detail\"\n- User requests \"comprehensive\" or \"thorough\" analysis\n- Teaching or knowledge transfer scenarios\n- Complex debugging requiring full context\n- Documentation generation\n\n**Examples**:\n\n| Context | ❌ Verbose (unnecessary) | ✅ Brief (preferred) |\n|---------|------------------------|---------------------|\n| File created | \"I have successfully created the file at the specified path with all the requested content...\" | \"File created: path/to/file.md\" |\n| Test passed | \"The test suite has been executed and all tests have passed successfully with 100% coverage...\" | \"✅ Tests passed (100% coverage)\" |\n| Next step | \"Now I will proceed to the next step which involves updating the database schema...\" | \"Updating database schema...\" |\n\n### Context Economy Rules\n\n**Core Principles**:\n- **Response Budget**: ≤500 tokens default (unless complexity requires more)\n- **Summarize > Paste**: Reference paths/links instead of full content\n- **Fetch-on-Demand**: Name files first, retrieve only needed parts\n- **Running Summaries**: Keep condensed handoff/PR descriptions\n\n### Best Practices\n\n**Efficient Context Usage**:\n- **Quote selectively**: Show only relevant lines with context\n- **Use file:line references**: `src/component.js:42-58` instead of full file\n- **Batch related reads**: Minimize round-trips when exploring\n- **Archive verbosity**: Move details to handoffs/database, not conversation\n\n### Examples\n\n| ❌ Inefficient | ✅ Efficient |\n|----------------|--------------|\n| Paste entire 500-line file | Quote lines 42-58 with `...` markers |\n| Read file multiple times | Batch read relevant sections once |\n| Repeat full error in response | Summarize error + reference line |\n| Include all test output | Show failed tests + counts only |\n\n### 🔄 MANDATORY: Server Restart Protocol\nAfter ANY code changes:\n1. **Kill the dev server**: `kill [PID]` or Ctrl+C\n2. **Restart the server**: `npm run dev` or appropriate command\n3. **Wait for ready message**: Confirm server is fully started\n4. **Hard refresh browser**: Ctrl+Shift+R / Cmd+Shift+R\n5. **Verify changes are live**: Test the new functionality\n\n**WHY**: Dev servers may cache components, especially new files. Hot reload is NOT always reliable.",
        "order_index": 30
      },
      {
        "section_type": "guideline",
        "title": "⚠️ Mandatory Process Scripts",
        "content": "## ⚠️ MANDATORY PROCESS SCRIPTS\n\n**CRITICAL**: Bypassing these scripts will cause handoff failures and data quality issues.\n\n### Required Scripts by Phase\n\n**PLAN Phase - PRD Creation**:\n```bash\n# ALWAYS use this script to create PRDs\nnode scripts/add-prd-to-database.js <SD-ID> [PRD-Title]\n\n# Example:\nnode scripts/add-prd-to-database.js SD-EXPORT-001 \"Export Feature PRD\"\n```\n\n**Why mandatory:**\n- Auto-triggers Product Requirements Expert (STORIES sub-agent)\n- Generates user stories WITH implementation context\n- Validates PRD schema and completeness\n- Creates proper audit trail\n\n**If you bypass:** PLAN→EXEC handoff will fail due to missing implementation context.\n\n---\n\n**All Phases - Handoff Creation**:\n```bash\n# ALWAYS use unified handoff system\nnode scripts/unified-handoff-system.js execute <TYPE> <SD-ID>\n\n# Types: LEAD-to-PLAN, PLAN-to-EXEC, EXEC-to-PLAN, PLAN-to-LEAD\n```\n\n**Why mandatory:**\n- Runs validation gates (BMAD, Git branch enforcement)\n- Triggers required sub-agents automatically\n- Ensures 7-element handoff structure\n- Enforces quality standards\n\n**If you bypass:** Phase transitions will be blocked by database constraints.\n\n---\n\n### ❌ NEVER Do This\n\n```javascript\n// ❌ WRONG: Direct database insert\nconst { data, error } = await supabase\n  .from('product_requirements_v2')\n  .insert({ title: 'My PRD', ... });\n\n// ❌ WRONG: Manual user story creation\nconst { data, error } = await supabase\n  .from('user_stories')\n  .insert({ title: 'My Story', ... });\n```\n\n**Why this fails:**\n- Bypasses STORIES sub-agent (no implementation context)\n- Bypasses validation gates\n- Missing required structured data\n- Breaks audit trail\n- **Database constraints will block invalid inserts**\n\n---\n\n### ✅ Always Do This\n\n```bash\n# ✅ CORRECT: Use process scripts\nnode scripts/add-prd-to-database.js SD-XXX \"PRD Title\"\n# → Auto-triggers STORIES sub-agent\n# → Generates user stories with context\n# → Validates all required fields\n\nnode scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-XXX\n# → Runs BMAD validation\n# → Enforces git branch\n# → Triggers required sub-agents\n```\n\n---\n\n### Database Enforcement\n\nThe following constraints enforce process compliance:\n\n- `product_requirements_v2.functional_requirements` must have ≥3 items\n- `product_requirements_v2.test_scenarios` must have ≥1 item  \n- `product_requirements_v2.acceptance_criteria` must have ≥1 item\n- `user_stories.implementation_context` must be populated (not NULL, not empty)\n\n**Attempting to bypass scripts will result in database constraint violations.**",
        "order_index": 30
      },
      {
        "section_type": "lead_operations",
        "title": "🎯 LEAD Agent Operations",
        "content": "**LEAD Agent Operations**: Strategic planning, business objectives, final approval.\n\n**Finding Active SDs**: `node scripts/query-active-sds.js` or query `strategic_directives_v2` table directly\n\n**Decision Matrix**:\n- Draft → Review & approve\n- Pending Approval → Final review  \n- Active → Create LEAD→PLAN handoff\n- In Progress → Monitor execution\n\n**Key Responsibilities**: Strategic direction, priority setting (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49), handoff creation, progress monitoring\n\n**Complete Guide**: See `docs/reference/lead-operations.md`",
        "order_index": 40
      },
      {
        "section_type": "directive_submission_review",
        "title": "📋 Directive Submission Review Process",
        "content": "**Directive Submission Review**: Review submissions before creating SDs.\n\n**Quick Review**:\n```bash\nnode scripts/lead-review-submissions.js\n```\n\n**Review Checklist**:\n- Chairman input (original intent)\n- Intent clarity & strategic alignment\n- Priority assessment & scope validation\n- Duplicate check & gate progression\n\n**Decision Matrix**:\n- Completed + No SD → Create SD\n- Completed + SD exists → Verify & handoff\n- Pending → Monitor\n- Failed → Archive/remediate\n\n**Complete Process**: See `docs/reference/directive-submission-review.md`",
        "order_index": 45
      },
      {
        "section_type": "PHASE_4_VERIFICATION",
        "title": "Stubbed/Mocked Code Detection",
        "content": "\n**CRITICAL: Stubbed/Mocked Code Detection** (MANDATORY):\n\nBefore PLAN→LEAD handoff, MUST verify NO stubbed/mocked code in production files:\n\n**Check For** (BLOCKING if found):\n```bash\n# 1. TEST_MODE flags in production code\ngrep -r \"TEST_MODE.*true\\|NODE_ENV.*test\" lib/ src/ --exclude-dir=test\n\n# 2. Mock/stub patterns\ngrep -r \"MOCK:\\|STUB:\\|TODO:\\|PLACEHOLDER:\\|DUMMY:\" lib/ src/ --exclude-dir=test\n\n# 3. Commented-out implementations\ngrep -r \"// REAL IMPLEMENTATION\\|// TODO: Implement\" lib/ src/ --exclude-dir=test\n\n# 4. Mock return values without logic\ngrep -r \"return.*mock.*result\\|return.*dummy\" lib/ src/ --exclude-dir=test\n```\n\n**Acceptable Patterns** ✅:\n- `TEST_MODE` in test files (`tests/`, `*.test.js`, `*.spec.js`)\n- TODO comments with SD references for future work: `// TODO (SD-XXX): Implement caching`\n- Feature flags with proper configuration: `if (config.enableFeature)`\n\n**BLOCKING Patterns** ❌:\n- `const TEST_MODE = process.env.TEST_MODE === 'true'` in production code\n- `return { verdict: 'PASS' }` without actual logic\n- `console.log('MOCK: Using dummy data')`\n- Empty function bodies: `function execute() { /* TODO */ }`\n- Commented-out real implementations\n\n**Verification Script**:\n```bash\n# Create verification script\nnode scripts/detect-stubbed-code.js <SD-ID>\n```\n\n**Manual Code Review**:\n- Read all modified files from git diff\n- Verify implementations are complete\n- Check for placeholder comments\n- Validate TEST_MODE usage is test-only\n\n**Exit Requirement**: Zero stubbed code in production files, OR documented in \"Known Issues\" with follow-up SD created.\n",
        "order_index": 45
      },
      {
        "section_type": "knowledge_retrieval",
        "title": "📚 Automated PRD Enrichment (MANDATORY)",
        "content": "**SD-LEO-LEARN-001: Proactive Learning Integration**\n\n**CRITICAL**: Run BEFORE writing PRD to incorporate historical lessons.\n\n## Step 0: Knowledge Preflight Check\n\n**Run this command before creating PRD**:\n\n```bash\nnode scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>\nnode scripts/enrich-prd-with-research.js <SD_UUID>  # If available\n```\n\n## What This Does\n\nAutomatically:\n1. Queries retrospectives for similar SDs\n2. Extracts proven technical approaches\n3. Identifies common pitfalls → adds to \"Risks & Mitigations\"\n4. Suggests prevention measures → adds to acceptance criteria\n5. Updates user_stories.implementation_context\n\n## How to Use Results\n\n### In PRD \"Technical Approach\" Section\n- Include proven solutions from high-success patterns\n- Reference historical approaches that worked well\n- Example: \"Based on PAT-001 (100% success), we'll verify schema types before...\"\n\n### In PRD \"Risks & Mitigations\" Section\n- Document known pitfalls from retrospectives\n- Add prevention measures from historical failures\n- Example: \"Risk: Test path errors after refactor (PAT-002). Mitigation: Verify all imports.\"\n\n### In PRD \"Acceptance Criteria\"\n- Include prevention checklist items\n- Add validation steps from proven patterns\n- Example: \"[ ] Schema types verified against database (prevents PAT-001)\"\n\n## Verification\n\nVerify enrichment appears in PRD's \"Reference Materials\" section:\n\n```markdown\n## Reference Materials\n\n### Historical Patterns Consulted\n- PAT-001: Schema mismatch TypeScript/Supabase (Success: 100%)\n- SD-SIMILAR-001 Retrospective: Database validation prevented 3 rework cycles\n\n### Prevention Measures Applied\n- Schema verification before implementation\n- Test path validation in acceptance criteria\n```\n\n## Why This Matters\n\n- **Better PRDs**: Incorporate lessons before design, not after errors\n- **Prevents design flaws**: Known pitfalls addressed in planning\n- **Faster implementation**: EXEC has clear prevention guidance\n- **Higher quality**: Proven approaches baked into requirements\n\n## Quick Reference\n\n```bash\n# Before creating PRD (MANDATORY)\nnode scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>\n\n# Enrich PRD with research (if script exists)\nnode scripts/enrich-prd-with-research.js <SD_UUID>\n\n# View category-specific lessons\ncat docs/summaries/lessons/<category>-lessons.md\n```\n\n**Time Investment**: 1-2 minutes\n**Time Saved**: 30-90 minutes of EXEC rework",
        "order_index": 50
      },
      {
        "section_type": "pr_size_guidelines",
        "title": "PR Size Guidelines",
        "content": "**Philosophy**: Balance AI capability with human review capacity. Modern AI can handle larger changes, but humans still need to review them.\n\n**Three Tiers**:\n\n1. **≤100 lines (Sweet Spot)** - No justification needed\n   - Simple bug fixes\n   - Single feature additions\n   - Configuration changes\n   - Documentation updates\n\n2. **101-200 lines (Acceptable)** - Brief justification in PR description\n   - Multi-component features\n   - Refactoring with tests\n   - Database migrations with updates\n   - Example: \"Adds authentication UI (3 components) + tests\"\n\n3. **201-400 lines (Requires Strong Justification)** - Detailed rationale required\n   - Complex features that cannot be reasonably split\n   - Large refactorings with extensive test coverage\n   - Third-party integrations with configuration\n   - Must explain why splitting would create more risk/complexity\n   - Example: \"OAuth integration requires provider config, UI flows, session management, and error handling as atomic unit\"\n\n**Over 400 lines**: Generally prohibited. Split into multiple PRs unless exceptional circumstances (emergency hotfix, external dependency forcing bundled changes).\n\n**Key Principle**: If you can split it without creating incomplete/broken intermediate states, you should split it.",
        "order_index": 50
      },
      {
        "section_type": "parallel_execution",
        "title": "Parallel Execution",
        "content": "**When to Use**: Modern AI supports parallel tool execution for independent operations. Use conservatively.\n\n**Safe for Parallel Execution**:\n- ✅ Reading multiple independent files for analysis\n- ✅ Running multiple independent database queries\n- ✅ Executing multiple read-only Git commands (status, log, diff)\n- ✅ Multiple WebFetch calls to different URLs\n- ✅ Batch file searches (multiple Glob operations)\n\n**NOT Safe for Parallel Execution**:\n- ❌ Write operations (Edit, Write tools)\n- ❌ Database mutations (INSERT, UPDATE, DELETE)\n- ❌ Any operations where order matters\n- ❌ Operations that depend on each other's results\n- ❌ Git operations that modify state (commit, push, merge)\n\n**Critical Constraint**: Context sharing between parallel operations is limited. Each operation receives the same initial context but cannot see other parallel operations' results until they all complete.\n\n**Example Use Case**:\n```\n\"Read the following 3 files for analysis:\"\n- Read src/component.tsx\n- Read src/types.ts\n- Read tests/component.test.tsx\n```\n\n**Anti-Pattern**:\n```\n\"Read file A, then based on what you find, read file B\"\n(Must be sequential - second read depends on first)\n```",
        "order_index": 60
      },
      {
        "section_type": "subagent_parallel_execution",
        "title": "Sub-Agent Parallel Execution",
        "content": "**Overview**: Sub-agents are independent specialists. When multiple sub-agents provide non-overlapping assessments, call them in parallel to reduce latency.\n\n**When Parallel Execution is Beneficial**:\n\n1. **LEAD Initial Assessment**\n   - Parallel: Security Architect + Database Architect + Business Analyst\n   - Why: Each evaluates different aspects of an SD (security posture, data model feasibility, business alignment)\n   - Context sharing: Not required - each has independent assessment criteria\n\n2. **PLAN Supervisor Verification**\n   - Parallel: QA Director + Security Architect + Performance Lead + Database Architect\n   - Why: Final \"done done\" check across all quality dimensions simultaneously\n   - Context sharing: Not required - each validates their domain independently\n\n3. **EXEC Pre-Implementation Checks**\n   - Parallel: Systems Analyst (duplicate check) + Security Architect (auth requirements) + Database Architect (schema changes)\n   - Why: Gather all constraints before coding begins\n   - Context sharing: Not required - each identifies risks independently\n\n**When Sequential Execution is Required**:\n\n- ❌ One sub-agent's output feeds another's input\n- ❌ Database schema must be reviewed before security assessment\n- ❌ Any workflow where order creates dependencies\n\n**Implementation Pattern**:\n\n```javascript\n// ✅ Parallel - Independent assessments\nconst results = await Promise.all([\n  callSubAgent('security-architect', sd_id),\n  callSubAgent('database-architect', sd_id),\n  callSubAgent('qa-director', sd_id)\n]);\n\n// ❌ Sequential - One depends on another\nconst schema = await callSubAgent('database-architect', sd_id);\nconst securityReview = await callSubAgent('security-architect', schema); // Needs schema first\n```\n\n**Critical Constraints**:\n- Each sub-agent receives the same initial context\n- Sub-agents cannot see each other's results until all complete\n- Aggregate results AFTER all sub-agents finish\n- If any sub-agent fails, gracefully handle in aggregation phase\n\n**Benefits**:\n- Reduces total verification time (4 sub-agents in 30s vs. 2min sequential)\n- No context sharing limitations since assessments are independent\n- Each specialist works from fresh context without bias from others",
        "order_index": 70
      },
      {
        "section_type": "multi_application_testing_architecture",
        "title": "Multi-Application Testing Architecture",
        "content": "**Multi-App Testing**: Two independent test suites (EHG_Engineer + EHG app).\n\n**CRITICAL**: Determine target app from SD context before running tests\n- **EHG_Engineer**: Vitest + Jest (50% coverage)\n- **EHG**: Vitest (unit) + Playwright (E2E)\n\n**Full Guide**: See `docs/reference/multi-app-testing.md`",
        "order_index": 98
      },
      {
        "section_type": "quick_reference",
        "title": "Quick Reference",
        "content": "## 📋 QUICK REFERENCE\n\n### Component Sizing\n\n| Lines of Code | Action | Rationale |\n|---------------|--------|-----------|\n| <200 | Consider combining | Too granular |\n| **300-600** | ✅ **OPTIMAL** | Sweet spot for testing & maintenance |\n| >800 | **MUST split** | Too complex, hard to test |\n\n### Git Commits (Conventional Commits)\n\n**Format**: `<type>(<SD-ID>): <subject>`\n\n```bash\ngit commit -m \"feat(SD-XXX): Brief description\n\nDetailed explanation of changes.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>\"\n```\n\n**Types**: feat, fix, docs, refactor, test, chore, perf\n\n### Server Restart (After ANY Changes)\n\n```bash\n# Kill\npkill -f \"node server.js\"\n\n# Build (if UI changes)\nnpm run build:client\n\n# Restart\nPORT=3000 node server.js\n\n# Hard refresh browser\n# Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)\n```\n\n### Parallel Execution (Save Time)\n\n**When Safe**:\n- ✅ Multiple independent file reads\n- ✅ Multiple database queries (read-only)\n- ✅ Sub-agent execution (different domains)\n\n**NOT Safe**:\n- ❌ Write operations\n- ❌ Database mutations\n- ❌ Sequential dependencies\n\n**Example**:\n```bash\n# LEAD Pre-Approval: 4 sub-agents in parallel\nnode scripts/systems-analyst-codebase-audit.js <SD-ID> &\nnode scripts/database-architect-schema-review.js <SD-ID> &\nnode scripts/security-architect-assessment.js <SD-ID> &\nnode scripts/design-subagent-evaluation.js <SD-ID> &\nwait\n\n# Reduces time from 2 minutes sequential to 30 seconds parallel\n```\n\n### Context Efficiency Patterns\n\n```javascript\n// ❌ Inefficient\nconst { data } = await supabase.from('table').select('*');\nconsole.log(data); // Dumps full JSON\n\n// ✅ Efficient\nconst { data } = await supabase\n  .from('table')\n  .select('id, title, status')\n  .limit(5);\nconsole.log(`Found ${data.length} items`);\n```\n\n### Database Operations (One at a Time)\n\n**CRITICAL**: When manipulating Supabase tables, operate on ONE table at a time.\n\n```javascript\n// ❌ Bad: Batch across tables\nawait Promise.all([\n  supabase.from('table1').insert(data1),\n  supabase.from('table2').insert(data2)\n]);\n\n// ✅ Good: Sequential, one table at a time\nawait supabase.from('table1').insert(data1);\n// Verify success\nawait supabase.from('table2').insert(data2);\n// Verify success\n```\n\n### Sub-Agent Orchestration\n\n**Automated** (preferred):\n```bash\n# Orchestrator runs all required sub-agents for phase\nnode scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>\n\n# Phases: LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, PLAN_VERIFY, LEAD_FINAL\n```\n\n**Manual** (if needed):\n```bash\n# QA Director\nnode scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e\n\n# GitHub Actions\nnode scripts/github-actions-verifier.js <SD-ID>\n\n# Database Architect\nnode scripts/database-architect-schema-review.js <SD-ID>\n```\n\n### Testing Commands\n\n```bash\n# Unit tests (business logic)\nnpm run test:unit\n\n# E2E tests (user flows)\nnpm run test:e2e\n\n# Both (MANDATORY before EXEC→PLAN handoff)\nnpm run test:unit && npm run test:e2e\n```\n\n### Handoff Creation\n\n```bash\n# Unified handoff system (with auto sub-agent orchestration)\nnode scripts/unified-handoff-system.js execute <TYPE> <SD-ID>\n\n# Types:\n# - LEAD-to-PLAN\n# - PLAN-to-EXEC\n# - EXEC-to-PLAN (auto-runs PLAN_VERIFY sub-agents)\n# - PLAN-to-LEAD (auto-runs LEAD_FINAL sub-agents)\n```\n\n### Progress Verification\n\n```bash\n# Check progress breakdown\nnode -e \"\nconst { createClient } = require('@supabase/supabase-js');\nconst supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);\n(async () => {\n  const { data } = await supabase.rpc('get_progress_breakdown', { sd_id_param: 'SD-XXX' });\n  console.log(JSON.stringify(data, null, 2));\n})();\n\"\n```",
        "order_index": 100
      },
      {
        "section_type": "knowledge_retrieval",
        "title": "🔍 Pre-Implementation Knowledge Retrieval (MANDATORY)",
        "content": "**SD-LEO-LEARN-001: Proactive Learning Integration**\n\n**CRITICAL**: Run BEFORE starting implementation to retrieve relevant historical lessons.\n\n## Step 0: Knowledge Preflight Check\n\n**Run this command before writing any code**:\n\n```bash\nnode scripts/phase-preflight.js --phase EXEC --sd-id <SD_UUID>\n```\n\n## What This Does\n\nQueries historical knowledge base for:\n- **Issue patterns** relevant to your SD category\n- **Retrospectives** from similar past work\n- **Proven solutions** with success rates >85%\n- **Common pitfalls** to avoid (success rate <50%)\n- **Prevention checklists** for proactive measures\n\n## How to Use Results\n\n1. **High Success Patterns (✅ ≥85%)**:\n   - Apply proven solutions preemptively\n   - Add to implementation plan before encountering issues\n   - Example: \"PAT-004 shows server restart needed after changes → add to workflow\"\n\n2. **Moderate Patterns (⚠️ 50-85%)**:\n   - Be aware, prepare contingencies\n   - Document why you chose alternative approach\n   - Example: \"PAT-002 test path errors → verify imports carefully\"\n\n3. **Low Success Patterns (❌ <50%)**:\n   - Known failure modes, avoid these approaches\n   - Flag in handoff if you must use similar approach\n   - Example: \"PAT-007 sub-agent not triggering → use manual invocation\"\n\n## Handoff Documentation (MANDATORY)\n\nAdd \"Patterns Consulted\" section to your handoff:\n\n```markdown\n## Patterns Consulted\n\n- PAT-001: Schema mismatch TypeScript/Supabase (Success: 100%, Applied: Yes)\n- PAT-004: Server restart needed for changes (Success: 100%, Applied: Yes)\n- PAT-002: Test path errors after refactor (Success: 100%, Not encountered)\n```\n\n## Why This Matters\n\n- **Prevents repeated mistakes**: 60%+ of issues have been seen before\n- **Saves time**: Apply proven solutions immediately (avg 15-20 min saved)\n- **Builds institutional memory**: Every SD benefits from prior learnings\n- **Reduces rework**: Proactive prevention vs reactive debugging\n\n## Quick Reference\n\n```bash\n# Before starting implementation (MANDATORY)\nnode scripts/phase-preflight.js --phase EXEC --sd-id <SD_UUID>\n\n# View detailed pattern info\nnode scripts/search-prior-issues.js \"<issue description>\"\n\n# View knowledge summaries (updated weekly)\nls docs/summaries/lessons/*.md\n```\n\n**Time Investment**: 30 seconds to run, 2-3 minutes to review\n**Time Saved**: 15-60 minutes of debugging/rework",
        "order_index": 100
      },
      {
        "section_type": "qa_engineering_enhanced",
        "title": "Enhanced QA Engineering Director v2.0 - Testing-First Edition",
        "content": "**Enhanced QA Engineering Director v2.0**: Mission-critical testing automation with comprehensive E2E validation.\n\n**Core Capabilities:**\n1. Professional test case generation from user stories\n2. Pre-test build validation (saves 2-3 hours)\n3. Database migration verification (prevents 1-2 hours debugging)\n4. **Mandatory E2E testing via Playwright** (REQUIRED for approval)\n5. Test infrastructure discovery and reuse\n\n**5-Phase Workflow**: Pre-flight checks → Test generation → E2E execution → Evidence collection → Verdict & learnings\n\n**Activation**: Auto-triggers on `EXEC_IMPLEMENTATION_COMPLETE`, coverage keywords, testing evidence requests\n\n**Full Guide**: See `docs/reference/qa-director-guide.md`",
        "order_index": 100
      },
      {
        "section_type": "process",
        "title": "LEAD Over-Engineering Evaluation Process",
        "content": "### 🛡️ LEAD Over-Engineering Evaluation Process\n\n**MANDATORY**: LEAD agents MUST use the standardized rubric before making any SD status/priority changes.\n\n#### Step-by-Step Evaluation Process\n\n1. **Execute Rubric Evaluation**:\n   ```bash\n   node scripts/lead-over-engineering-rubric.js --sd-id [SD_ID]\n   ```\n\n2. **Review 6-Dimension Scores** (1-5 scale each):\n   - **Technical Complexity vs Business Value**: Complexity-to-value ratio\n   - **Resource Intensity vs Urgency**: Development effort vs business urgency  \n   - **Strategic Priority Alignment**: Alignment with Stage 1/EVA/GTM priorities\n   - **Market Timing & Opportunity Window**: Market opportunity timing\n   - **Implementation & Business Risk**: Risk vs reward assessment\n   - **Return on Investment Projection**: Expected ROI evaluation\n\n3. **Check Over-Engineering Thresholds**:\n   - Total Score ≤15/30 = Over-engineered\n   - Complexity ≤2 = Problematic\n   - Strategic Alignment ≤2 = Concerning  \n   - Risk Assessment ≤2 = Dangerous\n\n4. **Present Findings to Human**:\n   ```bash\n   node scripts/lead-human-approval-system.js --sd-id [SD_ID] --evaluation [RESULTS]\n   ```\n\n5. **Request Explicit Approval**: Show scores, reasoning, and consequences\n\n6. **Execute Only After Approval**: NEVER make autonomous changes\n\n#### Available Scripts for LEAD Agents\n- `scripts/lead-over-engineering-rubric.js` - Standardized 6-dimension evaluation\n- `scripts/lead-human-approval-system.js` - Human approval workflow\n- `scripts/enhanced-priority-rubric.js` - Priority rebalancing tools\n\n#### Prohibited Actions\n- ❌ Autonomous SD status/priority changes  \n- ❌ Overriding user selections without permission\n- ❌ Subjective over-engineering calls without rubric\n- ❌ Making changes before human approval",
        "order_index": 100
      },
      {
        "section_type": "sd_evaluation",
        "title": "6-Step SD Evaluation Checklist",
        "content": "**6-Step SD Evaluation Checklist (MANDATORY for LEAD & PLAN)**:\n\n1. Query `strategic_directives_v2` for SD metadata\n2. Query `product_requirements_v2` for existing PRD\n3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL\n4. Search codebase for existing infrastructure\n5. Identify gaps between backlog requirements and existing code\n6. **Execute QA smoke tests** ← NEW (verify tests run before approval)\n\n**Backlog Review Requirements**: Review backlog_title, item_description, extras.Description_1 for each item\n\n**Complete Checklist**: See `docs/reference/sd-evaluation-checklist.md`",
        "order_index": 100
      },
      {
        "section_type": "simplicity_first_enforcement",
        "title": "Quality Validation Examples",
        "content": "## Quality Validation Examples\n\n**Evidence from Retrospectives**: Thorough validation saves 4-6 hours per SD by catching issues early.\n\n### LEAD Pre-Approval Validation Examples\n\n#### Example 1: Verify Claims Against Reality\n\n**Case** (SD-UAT-002): Code review revealed 3/5 claimed issues didn't exist → saved 3-4 hours of unnecessary work\n\n**Lesson**: Always verify claims with actual code inspection, don't trust assumptions\n\n#### Example 2: Leverage Existing Infrastructure\n\n**Case** (SD-UAT-020): Used existing Supabase Auth instead of custom solution → saved 8-10 hours\n\n**Lesson**: Check what already exists before approving new development\n\n#### Example 3: Document Blockers Instead of Building Around Them\n\n**Case** (SD-UAT-003): Database blocker identified early → documented constraint instead of workaround → saved 4-6 hours\n\n**Lesson**: Identify true blockers during approval phase, not during implementation\n\n#### Example 4: Question Necessity vs. Nicety\n\n**Lesson**: Distinguish between \"must have\" (core requirements) and \"nice to have\" (future enhancements) during validation\n\n### Quality Gate Benefits\n\nThorough LEAD pre-approval validation:\n- Catches false assumptions early\n- Identifies existing solutions\n- Documents blockers before implementation starts\n- Ensures resource allocation matches real requirements\n\n**Total Time Saved from Examples**: 15-20 hours across validated SDs\n",
        "order_index": 102
      },
      {
        "section_type": "schema_documentation_reference",
        "title": "Database Schema Documentation",
        "content": "### Database Schema Documentation\n\nAuto-generated schema docs provide quick reference without database queries:\n\n**Paths**:\n- EHG_Engineer: `docs/reference/schema/engineer/database-schema-overview.md`\n- EHG App: `docs/reference/schema/ehg/database-schema-overview.md`\n\n**Update**: `npm run schema:docs:engineer` or `npm run schema:docs:ehg`\n\n**PRD Integration**: PRDs stored in `product_requirements_v2` table (NOT markdown).\nUse `add-prd-to-database.js` to create PRDs with schema review prompts.\n",
        "order_index": 124
      },
      {
        "section_type": "plan_pre_exec_checklist",
        "title": "PLAN Pre-EXEC Checklist",
        "content": "## PLAN Agent Pre-EXEC Checklist (MANDATORY)\n\n**Evidence from Retrospectives**: Database verification issues appeared in SD-UAT-003, SD-UAT-020, and SD-008. Early verification saves 2-3 hours per blocker.\n\nBefore creating PLAN→EXEC handoff, PLAN agent MUST verify:\n\n### Database Dependencies ✅\n- [ ] **Identify all data dependencies** in PRD\n- [ ] **Run schema verification script** for data-dependent SDs\n- [ ] **Verify tables/columns exist** OR create migration\n- [ ] **Document verification results** in PLAN→EXEC handoff\n- [ ] If tables missing: **Escalate to LEAD** with options\n\n**Success Pattern** (SD-UAT-003):\n> \"Database Architect verification provided evidence for LEAD decision. Documented instead of implementing → saved 4-6 hours\"\n\n### Architecture Planning ✅\n- [ ] **Component sizing estimated** (target 300-600 lines per component)\n- [ ] **Existing infrastructure identified** (don't rebuild what exists)\n- [ ] **Third-party libraries considered** before custom code\n\n**Success Pattern** (SD-UAT-020):\n> \"Leveraged existing Supabase Auth instead of building custom → saved 8-10 hours\"\n\n### Testing Strategy ✅\n- [ ] **Smoke tests defined** (3-5 tests minimum)\n- [ ] **Test scenarios documented** in PRD\n\n### Quality Validation ✅\n- [ ] **Verified claims with code review** (if UI/UX SD)\n- [ ] **Assessed technical feasibility**\n- [ ] **Identified potential blockers**\n\n**Success Pattern** (SD-UAT-002):\n> \"LEAD code review rejected 3/5 false claims → saved hours of unnecessary work\"\n",
        "order_index": 135
      },
      {
        "section_type": "testing_tier_strategy",
        "title": "Testing Tier Strategy",
        "content": "## Testing Requirements - Clear Thresholds\n\n**Evidence from Retrospectives**: Testing confusion appeared in SD-UAT-002, SD-UAT-020, SD-008.\n\n### Three-Tier Testing Strategy\n\n#### Tier 1: Smoke Tests (MANDATORY) ✅\n- **Requirement**: 3-5 tests, <60 seconds execution\n- **Approval**: **SUFFICIENT for PLAN→LEAD approval**\n\n#### Tier 2: Comprehensive E2E (RECOMMENDED) 📋\n- **Requirement**: 30-50 tests covering user flows\n- **Approval**: Nice to have, **NOT blocking for LEAD approval**\n- **Timing**: Can be refined post-deployment\n\n#### Tier 3: Manual Testing (SITUATIONAL) 🔍\n- **UI changes**: Single smoke test recommended (+5 min)\n- **Logic changes <5 lines**: Optional\n- **Logic changes >10 lines**: Required\n\n### Anti-Pattern to Avoid ❌\n\n**DO NOT** create 100+ manual test checklists unless specifically required.\n\n**From SD-UAT-020**:\n> \"Created 100+ test checklist but didn't execute manually. Time spent on unused documentation.\"",
        "order_index": 140
      },
      {
        "section_type": "exec_component_sizing_guidelines",
        "title": "Component Sizing Guidelines",
        "content": "## Component Sizing Guidelines\n\n**Evidence from Retrospectives**: Proven pattern in SD-UAT-020 and SD-008.\n\n### Optimal Component Size: 300-600 Lines\n\n**Success Pattern** (SD-UAT-020):\n> \"Split settings into three focused components. Each ~500 lines. Easy to test and maintain.\"\n\n### Sizing Rules\n\n| Lines of Code | Action | Rationale |\n|---------------|--------|-----------|\n| **<200** | Consider combining | Too granular |\n| **300-600** | ✅ **OPTIMAL** | Sweet spot |\n| **>800** | **MUST split** | Too complex |",
        "order_index": 145
      },
      {
        "section_type": "bmad_enhancements",
        "title": "🔬 BMAD Method Enhancements",
        "content": "## 🔬 BMAD Method Enhancements\n\n**BMAD** (Build-Measure-Adapt-Document) Method principles integrated into LEO Protocol to reduce context consumption, improve implementation quality, and enable early error detection.\n\n### Core Principles\n\n1. **Dev Agents Must Be Lean**: Minimize context consumption throughout workflow\n2. **Natural Language First**: Reduce code-heavy implementation guidance\n3. **Context-Engineered Stories**: Front-load implementation details to reduce EXEC confusion\n4. **Risk Assessment**: Multi-domain analysis during LEAD_PRE_APPROVAL\n5. **Mid-Development Quality Gates**: Checkpoint pattern for large SDs\n6. **Early Validation**: Catch issues at gates, not during final testing\n\n---\n\n### Six BMAD Enhancements\n\n**1. Risk Assessment Sub-Agent (RISK)**\n- **Phase**: LEAD_PRE_APPROVAL (mandatory for all SDs)\n- **Purpose**: Multi-domain risk scoring before approval\n- **Domains**: Technical Complexity (1-10), Security Risk (1-10), Performance Risk (1-10), Integration Risk (1-10), Data Migration Risk (1-10), UI/UX Risk (1-10)\n- **Storage**: risk_assessments table\n- **Script**: node lib/sub-agent-executor.js RISK SD-ID\n- **Benefit**: Early risk identification prevents 4-6 hours rework per SD\n\n**2. User Story Context Engineering (STORIES)**\n- **Phase**: PLAN_PRD (after PRD creation, before EXEC)\n- **Purpose**: Hyper-detailed implementation context for each user story\n- **Fields Added**: implementation_context, architecture_references, example_code_patterns, testing_scenarios\n- **Storage**: user_stories table columns\n- **Script**: node lib/sub-agent-executor.js STORIES SD-ID\n- **Benefit**: Reduces EXEC confusion by 30-40% through front-loaded guidance\n- **Validation**: PLAN→EXEC handoff checks for ≥80% coverage\n\n**3. Retrospective Review for LEAD**\n- **Phase**: LEAD_PRE_APPROVAL (before approving new SDs)\n- **Purpose**: Learn from similar completed SDs\n- **Analysis**: Success patterns, failure patterns, effort adjustments, risk mitigations\n- **Storage**: Queries retrospectives table\n- **Script**: node scripts/retrospective-review-for-lead.js SD-ID\n- **Benefit**: Informed decision-making based on historical data\n\n**4. Checkpoint Pattern Generator**\n- **Phase**: PLAN_PRD (for SDs with >8 user stories)\n- **Purpose**: Break large SDs into 3-4 manageable checkpoints\n- **Benefits**: 30-40% context reduction, 50% faster debugging, early error detection\n- **Storage**: strategic_directives_v2.checkpoint_plan (JSONB)\n- **Script**: node scripts/generate-checkpoint-plan.js SD-ID\n- **Validation**: PLAN→EXEC handoff requires checkpoint plan for large SDs\n\n**5. Test Architecture Phase Enhancement**\n- **Phase**: PLAN_PRD and PLAN_VERIFY (QA Director integration)\n- **Purpose**: Structured test planning with 4 strategies\n- **Strategies**: Unit (business logic), E2E (user flows), Integration (APIs/DB), Performance (benchmarks)\n- **Storage**: test_plans table\n- **Script**: QA Director auto-generates during PLAN phase\n- **Benefit**: 100% user story → E2E test mapping enforced\n- **Validation**: EXEC→PLAN handoff checks test plan existence and coverage\n\n**6. Lean EXEC_CONTEXT.md**\n- **Phase**: EXEC_IMPLEMENTATION (context optimization)\n- **Purpose**: Reduced CLAUDE.md for EXEC agents (~500 lines vs 5000+)\n- **Content**: EXEC-specific guidance only (no LEAD/PLAN operations)\n- **Location**: docs/EXEC_CONTEXT.md\n- **Benefit**: 90% context reduction during EXEC phase\n\n---\n\n### Validation Gates Integration\n\n**PLAN→EXEC Handoff**:\n- ✅ User story context engineering (≥80% coverage)\n- ✅ Checkpoint plan (if SD has >8 stories)\n- ✅ Risk assessment exists\n\n**EXEC→PLAN Handoff**:\n- ✅ Test plan generated (unit + E2E strategies)\n- ✅ User story → E2E mapping (100% requirement)\n- ✅ Test plan stored in database\n\n**Validation Script**: scripts/modules/bmad-validation.js\n**Integration**: Automatic via unified-handoff-system.js\n\n---\n\n### Quick Reference: BMAD Scripts\n\n```bash\n# 1. Risk Assessment (LEAD_PRE_APPROVAL)\nnode lib/sub-agent-executor.js RISK SD-ID\n\n# 2. User Story Context Engineering (PLAN_PRD)\nnode lib/sub-agent-executor.js STORIES SD-ID\n\n# 3. Retrospective Review (LEAD_PRE_APPROVAL)\nnode scripts/retrospective-review-for-lead.js SD-ID\n\n# 4. Checkpoint Plan (PLAN_PRD, if >8 stories)\nnode scripts/generate-checkpoint-plan.js SD-ID\n\n# 5. Test Architecture (PLAN_VERIFY, automatic)\nnode scripts/qa-engineering-director-enhanced.js SD-ID\n\n# 6. Lean EXEC Context (reference during EXEC)\ncat docs/EXEC_CONTEXT.md\n```\n\n---\n\n### Expected Impact\n\n**Context Consumption**:\n- User story context engineering: 30-40% reduction in EXEC confusion\n- Checkpoint pattern: 30-40% reduction in total context per large SD\n- Lean EXEC_CONTEXT.md: 90% reduction during EXEC phase\n\n**Time Savings**:\n- Risk assessment: 4-6 hours saved per SD (early issue detection)\n- Test architecture: 2-3 hours saved per SD (structured planning)\n- Retrospective review: Informed decisions prevent 3-4 hours unnecessary work\n\n**Quality Improvements**:\n- Early validation gates catch issues before late-stage rework\n- Structured test planning ensures 100% user story coverage\n- Context engineering reduces implementation ambiguity\n\n---\n\n### Database Schema Additions\n\n**New Tables**:\n- risk_assessments: Risk scoring across 6 domains\n- test_plans: Structured test strategies (4 types)\n\n**Enhanced Tables**:\n- user_stories: Added implementation_context, architecture_references, example_code_patterns, testing_scenarios\n- strategic_directives_v2: Added checkpoint_plan (JSONB)\n\n**Sub-Agents**:\n- leo_sub_agents: Added RISK (code: 'RISK', priority: 8)\n- leo_sub_agents: Added STORIES (code: 'STORIES', priority: 50)\n\n---\n\n### Further Reading\n\n- **BMAD Principles**: See retrospectives from SD-UAT-002, SD-UAT-020, SD-EXPORT-001\n- **Implementation Guide**: docs/bmad-implementation-guide.md\n- **Validation Gates**: docs/reference/handoff-validation.md\n\n*Last Updated: 2025-10-12*\n*BMAD Method: Build-Measure-Adapt-Document*\n",
        "order_index": 150
      },
      {
        "section_type": "exec_todo_comment_standard",
        "title": "TODO Comment Standard",
        "content": "## TODO Comment Standard (When Deferring Work)\n\n**Evidence from Retrospectives**: Proven pattern in SD-UAT-003 saved 4-6 hours.\n\n### Standard TODO Format\n\n```typescript\n// TODO (SD-ID): Action required\n// Requires: Dependencies, prerequisites\n// Estimated effort: X-Y hours\n// Current state: Mock/temporary/placeholder\n```\n\n**Success Pattern** (SD-UAT-003):\n> \"Comprehensive TODO comments provided clear future work path. Saved 4-6 hours.\"",
        "order_index": 150
      },
      {
        "section_type": "design_database_validation_gates",
        "title": "DESIGN→DATABASE Validation Gates",
        "content": "## DESIGN→DATABASE Validation Gates\n\nThe LEO Protocol enforces the DESIGN→DATABASE workflow pattern through 4 mandatory validation gates that ensure:\n1. Sub-agent execution completeness (PLAN→EXEC)\n2. Implementation fidelity to recommendations (EXEC→PLAN)\n3. End-to-end traceability (PLAN→LEAD)\n4. Workflow ROI and pattern effectiveness (LEAD Final)\n\n**Passing Score**: ≥80 points (out of 100) required for each gate\n\n---\n\n### Gate 1: PLAN→EXEC Handoff (Pre-Implementation)\n\n**When**: After PRD creation, before EXEC starts implementation\n**Purpose**: Verify planning is complete and recommendations exist\n**Script**: `scripts/modules/design-database-gates-validation.js`\n**Integration Point**: `unified-handoff-system.js` line ~271 (after BMAD validation)\n\n**9 Validation Checks** (11 points each + 1 buffer = 100 points):\n\n1. **DESIGN Sub-Agent Executed** (11 points)\n   - Queries: `sub_agent_execution_results` table\n   - Checks: `sub_agent_name = 'DESIGN'` AND `status = 'SUCCESS'`\n\n2. **DATABASE Sub-Agent Executed** (11 points)\n   - Queries: `sub_agent_execution_results` table\n   - Checks: `sub_agent_name = 'DATABASE'` AND `status = 'SUCCESS'`\n\n3. **DATABASE Informed by DESIGN** (11 points)\n   - Queries: `product_requirements_v2.metadata.database_analysis.design_informed`\n   - Checks: `design_informed = true`\n\n4. **STORIES Sub-Agent Executed** (11 points)\n   - Queries: `sub_agent_execution_results` table\n   - Checks: `sub_agent_name = 'STORIES'` AND `status = 'SUCCESS'`\n\n5. **Schema Documentation Consulted** (11 points)\n   - Analyzes: `database_analysis.analysis` text\n   - Checks: References to `docs/reference/schema/`\n\n6. **PRD Metadata Complete** (11 points)\n   - Checks: Both `design_analysis` AND `database_analysis` exist in PRD metadata\n\n7. **Sub-Agent Execution Order** (11 points)\n   - Validates: DESIGN timestamp < DATABASE timestamp < STORIES timestamp\n\n8. **PRD Created Via Script** (11 points)\n   - Detects: `add-prd-to-database.js` metadata signature\n\n9. **User Stories Context Coverage** (12 points)\n   - Calculates: % of stories with `implementation_context`\n   - Threshold: ≥80% coverage required\n\n**Conditional Execution**:\n- Only validates SDs with BOTH `design` AND `database` categories\n- OR scope contains both \"UI\" AND \"database\" keywords\n- Use: `shouldValidateDesignDatabase(sd)` helper function\n\n---\n\n### Gate 2: EXEC→PLAN Handoff (Post-Implementation)\n\n**When**: After EXEC completes implementation, before PLAN verification\n**Purpose**: Verify EXEC actually implemented DESIGN/DATABASE recommendations\n**Script**: `scripts/modules/implementation-fidelity-validation.js`\n**Integration Point**: `unified-handoff-system.js` line ~486 (after BMAD validation)\n\n**4 Validation Sections** (25 points each = 100 points):\n\n#### A. Design Implementation Fidelity (25 points)\n\n- **A1: UI Components** (10 points)\n  - Git analysis: `git log --all --grep=\"SD-XXX\" --name-only`\n  - Checks: Component files (.tsx, .jsx) committed\n\n- **A2: Workflows** (10 points)\n  - Queries: EXEC→PLAN handoff deliverables\n  - Checks: Workflow implementation mentioned\n\n- **A3: User Actions** (5 points)\n  - Git analysis: `git log --all --grep=\"SD-XXX\" --patch`\n  - Checks: CRUD operations in code changes\n\n#### B. Database Implementation Fidelity (25 points)\n\n- **B1: Migrations** (15 points)\n  - Scans: `database/migrations`, `supabase/migrations`\n  - Checks: Migration files exist for SD\n\n- **B2: RLS Policies** (5 points)\n  - Git analysis: Checks for CREATE POLICY statements\n\n- **B3: Migration Complexity** (5 points)\n  - Reads: Migration file line count\n  - Compares: To DATABASE analysis estimate (optional)\n\n#### C. Data Flow Alignment (25 points)\n\n- **C1: Database Queries** (10 points)\n  - Git analysis: Checks for .select(), .insert(), .update(), .from()\n\n- **C2: Form/UI Integration** (10 points)\n  - Git analysis: Checks for useState, useForm, onSubmit, <form>, Input, Button\n\n- **C3: Data Validation** (5 points)\n  - Git analysis: Checks for zod, validate, schema, .required()\n\n#### D. Enhanced Testing (25 points)\n\n- **D1: E2E Tests** (15 points)\n  - Scans: `tests/e2e`, `tests/integration`, `playwright/tests`\n  - Checks: Test files exist for SD\n\n- **D2: Migration Tests** (5 points)\n  - Git analysis: Checks for migration + test file mentions\n\n- **D3: Coverage Documentation** (5 points)\n  - Queries: EXEC→PLAN handoff metadata\n  - Checks: Test coverage documented\n\n**Why This Gate Matters**:\nThis is the MOST CRITICAL gate - ensures recommendations weren't just generated but actually implemented. Without this, EXEC could ignore all recommendations.\n\n---\n\n### Gate 3: PLAN→LEAD Handoff (Pre-Final Approval)\n\n**When**: After PLAN verification, before LEAD final approval\n**Purpose**: Verify end-to-end alignment from design through implementation\n**Script**: `scripts/modules/traceability-validation.js`\n**Integration Point**: `unified-handoff-system.js` line ~726 (PLAN→LEAD validation)\n\n**5 Validation Sections** (20 points each = 100 points):\n\n#### A. Recommendation Adherence (20 points)\n\n- **A1: Design Adherence** (10 points)\n  - Calculates: (Gate 2 design_fidelity / 25) × 100%\n  - Thresholds: ≥80% = 10pts, ≥60% = 7pts, <60% = 4pts\n\n- **A2: Database Adherence** (10 points)\n  - Calculates: (Gate 2 database_fidelity / 25) × 100%\n  - Thresholds: ≥80% = 10pts, ≥60% = 7pts, <60% = 4pts\n\n#### B. Implementation Quality (20 points)\n\n- **B1: Gate 2 Score** (10 points)\n  - Checks: Overall Gate 2 validation score\n  - Thresholds: ≥90 = 10pts, ≥80 = 8pts, ≥70 = 6pts\n\n- **B2: Test Coverage** (10 points)\n  - Queries: EXEC→PLAN handoff metadata\n  - Checks: Test coverage documented\n\n#### C. Traceability Mapping (20 points)\n\n- **C1: PRD → Implementation** (7 points)\n  - Git analysis: Commits referencing SD ID\n\n- **C2: Design → Code** (7 points)\n  - Queries: Deliverables mention design/UI/components\n\n- **C3: Database → Schema** (6 points)\n  - Queries: Deliverables mention database/migration/schema/table\n\n#### D. Sub-Agent Effectiveness (20 points)\n\n- **D1: Execution Metrics** (10 points)\n  - Queries: `sub_agent_execution_results`\n  - Checks: All 3 sub-agents (DESIGN, DATABASE, STORIES) executed\n\n- **D2: Recommendation Quality** (10 points)\n  - Checks: Sub-agent results have substantial output (>500 chars)\n\n#### E. Lessons Captured (20 points)\n\n- **E1: Retrospective Prep** (10 points)\n  - Queries: PLAN→LEAD handoff metadata\n  - Checks: Mentions \"lesson\", \"retrospective\", \"improvement\"\n\n- **E2: Workflow Effectiveness** (10 points)\n  - Queries: EXEC→PLAN handoff metadata\n  - Checks: Mentions \"workflow\", \"process\", \"pattern\"\n\n---\n\n### Gate 4: LEAD Final Approval (Pre-Completion)\n\n**When**: Before marking SD as complete\n**Purpose**: Executive oversight of design-to-implementation alignment\n**Script**: `scripts/modules/workflow-roi-validation.js`\n**Integration Point**: `unified-handoff-system.js` (LEAD final approval)\n\n**4 Validation Sections** (25 points each = 100 points):\n\n#### A. Process Adherence (25 points)\n\n- **A1: PRD Created Via Script** (5 points)\n  - Checks: `metadata.created_via_script` OR sub-agent analyses exist\n\n- **A2: Design Analysis Completed** (5 points)\n  - Checks: `metadata.design_analysis` exists\n\n- **A3: Database Analysis Completed** (5 points)\n  - Checks: `metadata.database_analysis` exists\n\n- **A4: Design-Informed Database** (5 points)\n  - Checks: `metadata.database_analysis.design_informed = true`\n\n- **A5: Proper Workflow Order** (5 points)\n  - Checks: Gate 1 validated execution order (DESIGN→DATABASE→STORIES)\n\n#### B. Value Delivered (25 points)\n\n- **B1: Time Efficiency** (10 points)\n  - Checks: Sub-agent execution time from Gate 3\n  - Thresholds: <15min = 10pts, <30min = 7pts, ≥30min = 5pts\n\n- **B2: Recommendation Quality** (10 points)\n  - Checks: Gate 3 validated substantial recommendations\n\n- **B3: Implementation Fidelity** (5 points)\n  - Checks: Gate 2 score ≥80 = 5pts, ≥70 = 3pts, <70 = 2pts\n\n#### C. Pattern Effectiveness (25 points)\n\n- **C1: Gate 1 Performance** (6 points)\n  - Thresholds: ≥90 = 6pts, ≥80 = 5pts, <80 = 3pts\n\n- **C2: Gate 2 Performance** (6 points)\n  - Thresholds: ≥90 = 6pts, ≥80 = 5pts, <80 = 3pts\n\n- **C3: Gate 3 Performance** (6 points)\n  - Thresholds: ≥90 = 6pts, ≥80 = 5pts, <80 = 3pts\n\n- **C4: Overall Pattern ROI** (7 points)\n  - Calculates: Average of Gate 1-3 scores\n  - Thresholds: ≥90 = 7pts (\"EXCELLENT - Continue pattern\"), ≥80 = 6pts (\"GOOD - Continue\"), ≥70 = 4pts (\"ACCEPTABLE - Monitor\")\n\n#### D. Executive Validation (25 points)\n\n- **D1: All Gates Passed** (10 points)\n  - Checks: Gate 1, 2, 3 all passed (score ≥80)\n  - Scoring: 3/3 = 10pts, 2/3 = 6pts, 1/3 = 3pts, 0/3 = 0pts\n\n- **D2: Quality Thresholds** (10 points)\n  - Queries: `sd_retrospectives` table\n  - Checks: Retrospective exists\n\n- **D3: Pattern Recommendation** (5 points)\n  - Based on avg gate score:\n    - ≥80: \"CONTINUE - Pattern is effective\"\n    - ≥70: \"MONITOR - Pattern needs improvement\"\n    - <70: \"REVIEW - Pattern may need adjustment\"\n\n---\n\n### Integration with Unified Handoff System\n\n**File**: `scripts/unified-handoff-system.js`\n\n#### Integration Points:\n\n1. **Gate 1 (PLAN→EXEC)** - After line 271\n   ```javascript\n   // After BMAD validation\n   if (shouldValidateDesignDatabase(sd)) {\n     const gate1 = await validateGate1PlanToExec(sd.id, supabase);\n     handoff.metadata.gate1_validation = gate1;\n\n     if (!gate1.passed) {\n       throw new Error(`Gate 1 validation failed: ${gate1.score}/100 points`);\n     }\n   }\n   ```\n\n2. **Gate 2 (EXEC→PLAN)** - After line 486\n   ```javascript\n   // After BMAD validation\n   if (shouldValidateDesignDatabase(sd)) {\n     const gate2 = await validateGate2ExecToPlan(sd.id, supabase);\n     handoff.metadata.gate2_validation = gate2;\n\n     if (!gate2.passed) {\n       throw new Error(`Gate 2 validation failed: ${gate2.score}/100 points`);\n     }\n   }\n   ```\n\n3. **Gate 3 (PLAN→LEAD)** - After line 726\n   ```javascript\n   // During PLAN→LEAD handoff\n   if (shouldValidateDesignDatabase(sd)) {\n     const gate3 = await validateGate3PlanToLead(sd.id, supabase, gate2Results);\n     handoff.metadata.gate3_validation = gate3;\n\n     if (!gate3.passed) {\n       throw new Error(`Gate 3 validation failed: ${gate3.score}/100 points`);\n     }\n   }\n   ```\n\n4. **Gate 4 (LEAD Final)** - Before final approval\n   ```javascript\n   // Before marking SD complete\n   if (shouldValidateDesignDatabase(sd)) {\n     const allGates = { gate1, gate2, gate3 };\n     const gate4 = await validateGate4LeadFinal(sd.id, supabase, allGates);\n\n     if (!gate4.passed) {\n       throw new Error(`Gate 4 validation failed: ${gate4.score}/100 points`);\n     }\n   }\n   ```\n\n---\n\n### Validation Flow Diagram\n\n```\nPRD Creation (add-prd-to-database.js)\n    ↓\n    ├─ DESIGN sub-agent → analysis\n    ├─ DATABASE sub-agent → analysis (informed by DESIGN)\n    └─ STORIES sub-agent → user stories\n    ↓\n🚪 GATE 1: PLAN→EXEC Handoff\n    ├─ ✅ All sub-agents executed?\n    ├─ ✅ Execution order correct?\n    ├─ ✅ Schema docs consulted?\n    └─ ✅ PRD metadata complete?\n    ↓\nEXEC Implementation\n    ├─ Implement UI components (per DESIGN)\n    ├─ Create migrations (per DATABASE)\n    ├─ Write E2E tests\n    └─ Commit with SD ID\n    ↓\n🚪 GATE 2: EXEC→PLAN Handoff\n    ├─ ✅ Components match DESIGN?\n    ├─ ✅ Migrations match DATABASE?\n    ├─ ✅ Data flow aligned?\n    └─ ✅ Tests comprehensive?\n    ↓\nPLAN Verification\n    ↓\n🚪 GATE 3: PLAN→LEAD Handoff\n    ├─ ✅ Recommendations followed?\n    ├─ ✅ Implementation quality high?\n    ├─ ✅ End-to-end traceability?\n    └─ ✅ Lessons captured?\n    ↓\n🚪 GATE 4: LEAD Final Approval\n    ├─ ✅ All gates passed?\n    ├─ ✅ Value delivered?\n    ├─ ✅ Pattern effective?\n    └─ ✅ Quality thresholds met?\n    ↓\nSD Complete ✅\n```\n\n---\n\n### Standalone Validation Scripts\n\nFor manual validation outside handoff flow:\n\n```bash\n# Validate Gate 1 (PLAN→EXEC)\nnode scripts/validate-gate1.js --sd=SD-XXX-001\n\n# Validate Gate 2 (EXEC→PLAN)\nnode scripts/validate-gate2.js --sd=SD-XXX-001\n\n# Validate Gate 3 (PLAN→LEAD)\nnode scripts/validate-gate3.js --sd=SD-XXX-001\n\n# Validate Gate 4 (LEAD Final)\nnode scripts/validate-gate4.js --sd=SD-XXX-001\n\n# Validate all gates\nnode scripts/validate-all-gates.js --sd=SD-XXX-001\n```\n\n---\n\n### When Gates Don't Apply\n\n**Conditional Execution Helper**:\n```javascript\nexport function shouldValidateDesignDatabase(sd) {\n  const hasDesignCategory = sd.category?.includes('design');\n  const hasDatabaseCategory = sd.category?.includes('database');\n\n  const hasUIKeywords = (sd.scope || '').toLowerCase().includes('ui');\n  const hasDatabaseKeywords = (sd.scope || '').toLowerCase().includes('database');\n\n  return (hasDesignCategory && hasDatabaseCategory) ||\n         (hasUIKeywords && hasDatabaseKeywords);\n}\n```\n\n**Behavior**:\n- If validation doesn't apply: Returns `{ passed: true, score: 100, warnings: ['Not applicable'] }`\n- If validation applies but fails: Returns `{ passed: false, score: <score>, issues: [...] }`\n- If validation applies and passes: Returns `{ passed: true, score: ≥80, details: {...} }`\n\n---\n\n### Gate Results Storage\n\nAll gate results are stored in handoff metadata:\n\n```javascript\n{\n  handoff_type: \"PLAN-TO-EXEC\",\n  metadata: {\n    gate1_validation: {\n      passed: true,\n      score: 92,\n      max_score: 100,\n      issues: [],\n      warnings: [],\n      details: { ... },\n      gate_scores: { ... }\n    }\n  }\n}\n```\n\nThis enables:\n1. **Traceability**: Full audit trail of validation results\n2. **Retrospectives**: Quality analysis for continuous improvement\n3. **Cascading**: Gate 3 uses Gate 2 results, Gate 4 uses all previous results\n4. **Debugging**: Detailed failure information for each gate",
        "order_index": 155
      },
      {
        "section_type": "plan_cicd_verification",
        "title": "CI/CD Pipeline Verification",
        "content": "## CI/CD Pipeline Verification (MANDATORY)\n\n**Evidence from Retrospectives**: Gap identified in SD-UAT-002 and SD-LEO-002.\n\n### Verification Process\n\n**After EXEC implementation complete, BEFORE PLAN→LEAD handoff**:\n\n1. Wait 2-3 minutes for GitHub Actions to complete\n2. Trigger DevOps sub-agent to verify pipeline status\n3. Document CI/CD status in PLAN→LEAD handoff\n4. PLAN→LEAD handoff is **BLOCKED** if pipelines failing",
        "order_index": 155
      },
      {
        "section_type": "exec_dual_test_requirement",
        "title": "EXEC Dual Test Requirement",
        "content": "## EXEC Dual Test Requirement\n\n\n### ⚠️ MANDATORY: Dual Test Execution\n\n**CRITICAL**: \"Smoke tests\" means BOTH test types, not just one!\n\n**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed. 30-minute gap between \"complete\" and validation. SD-EVA-MEETING-002 - 67% E2E failure rate when finally run.\n\nBefore creating EXEC→PLAN handoff, EXEC MUST run:\n\n#### 1. Unit Tests (Business Logic Validation)\n```bash\ncd /mnt/c/_EHG/ehg\nnpm run test:unit\n```\n- **What it validates**: Service layer, business logic, data transformations\n- **Failure means**: Core functionality is broken\n- **Required for**: EXEC→PLAN handoff\n- **Framework**: Vitest\n\n#### 2. E2E Tests (UI/Integration Validation)\n```bash\ncd /mnt/c/_EHG/ehg\nnpm run test:e2e\n```\n- **What it validates**: User flows, component rendering, integration\n- **Failure means**: User-facing features don't work\n- **Required for**: EXEC→PLAN handoff\n- **Framework**: Playwright\n\n#### Verification Checklist\n- [ ] Unit tests executed: `npm run test:unit`\n- [ ] Unit tests passed: [X/X tests]\n- [ ] E2E tests executed: `npm run test:e2e`\n- [ ] E2E tests passed: [X/X tests]\n- [ ] Both test types documented in EXEC→PLAN handoff\n- [ ] Screenshots captured for E2E test evidence\n- [ ] Test results included in handoff \"Deliverables Manifest\"\n\n**❌ BLOCKING**: Cannot create EXEC→PLAN handoff without BOTH test types passing.\n\n**Common Mistakes** (from SD-EXPORT-001):\n- ❌ \"Tests exist\" ≠ \"Tests passed\"\n- ❌ Running only E2E tests and claiming \"all tests passed\"\n- ❌ Marking SD complete before running any tests\n- ❌ Creating handoff without test evidence documentation\n- ✅ Run BOTH unit AND E2E tests explicitly\n- ✅ Document pass/fail counts in handoff\n- ✅ Include screenshots for visual evidence\n\n### Why This Matters\n- **SD-EXPORT-001**: 30-minute gap between marking \"complete\" and discovering tests weren't run\n- **SD-EVA-MEETING-002**: 67% E2E failure rate revealed only when tests finally executed\n- **Impact**: Testing enforcement prevents claiming \"done\" without proof",
        "order_index": 155
      },
      {
        "section_type": "guide",
        "title": "Sub-Agent Auto-Trigger Enforcement (MANDATORY)",
        "content": "**Sub-Agent Auto-Trigger Enforcement**: Sub-agents MUST trigger automatically, not manually.\n\n**EXEC→PLAN Handoff Verification**:\n```javascript\n// MANDATORY: Check for QA execution\nconst { data: qaResults } = await supabase\n  .from('sub_agent_execution_results')\n  .select('*')\n  .eq('sd_id', sd_id)\n  .eq('sub_agent_code', 'TESTING')\n  .order('created_at', { ascending: false })\n  .limit(1);\n\nif (!qaResults || qaResults.verdict === 'BLOCKED') {\n  // BLOCK handoff\n  process.exit(1);\n}\n```\n\n**Complete Pattern**: See `docs/reference/sub-agent-automation.md`",
        "order_index": 156
      },
      {
        "section_type": "guide",
        "title": "User Story E2E Test Mapping (MANDATORY)",
        "content": "**User Story E2E Test Mapping (MANDATORY)**: E2E tests MUST map to user stories explicitly.\n\n**Naming Convention**: Every test must reference a user story:\n```typescript\ntest('US-001: User can create new venture', async ({ page }) => {\n  // Test implementation\n});\n```\n\n**Coverage Formula**: (E2E Tests with US-XXX / Total User Stories) × 100\n**Minimum Requirement**: 100% coverage (every user story MUST have ≥1 E2E test)\n\n**QA Director Verification**: Automatically blocks handoff if coverage < 100%\n\n**Examples & Patterns**: See `docs/reference/user-story-e2e-mapping.md`",
        "order_index": 157
      },
      {
        "section_type": "lead_code_review_requirement",
        "title": "LEAD Code Review for UI/UX SDs",
        "content": "## LEAD Code Review Requirement (For UI/UX SDs)\n\n**Evidence from Retrospectives**: Critical pattern from SD-UAT-002 saved hours.\n\n### When Code Review is MANDATORY\n\n**For SDs claiming** UI/UX issues or improvements.\n\n### Why Code Review First?\n\n**Success Story** (SD-UAT-002):\n> \"LEAD challenged 5 claimed issues, validated only 2. Saved 3-4 hours of unnecessary work.\"\n\n### Process:\n1. Receive SD with UI/UX claims\n2. Read actual source code (don't trust claims)\n3. Verify each claim against implementation\n4. Reject false claims, document findings\n5. Update SD scope and priority",
        "order_index": 160
      },
      {
        "section_type": "documentation_platform",
        "title": "📚 Documentation Platform Integration",
        "content": "**Documentation Platform**: AI Documentation Generation System integrated into LEO Protocol.\n\n**Auto-Triggers**: SD completion, EXEC→PLAN handoff, retrospective creation\n**EXEC Requirement**: Generate docs before handoff: `node scripts/generate-workflow-docs.js --sd-id <SD-ID>`\n**Dashboard**: `/ai-docs-admin` to review and publish\n\n**Complete Guide**: See `docs/reference/documentation-platform.md`",
        "order_index": 165
      },
      {
        "section_type": "knowledge_retrieval",
        "title": "📖 Historical Context Review (RECOMMENDED)",
        "content": "**SD-LEO-LEARN-001: Proactive Learning Integration**\n\n**RECOMMENDED**: Run BEFORE approving SD to review historical context.\n\n## Step 0: Historical Context Check\n\n**Run this command before SD approval**:\n\n```bash\nnode scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>\n```\n\n## What This Does\n\nQueries historical knowledge base for:\n- **Over-engineering patterns** in this SD category\n- **Similar past SDs** and their outcomes\n- **Complexity indicators** (actual vs estimated time)\n- **Scope creep history** (SDs split due to bloat)\n\n## Red Flags to Watch For\n\n### Over-Engineering Indicators\n- Pattern shows \"over-engineering\" occurred 2+ times in this category\n- Historical resolution time >5x original estimate\n- Past SDs in category were split due to scope bloat\n- Complexity score disproportionate to business value\n\n### Strategic Concerns\n- Similar SDs had high failure/rework rates\n- Category has pattern of expanding beyond initial scope\n- Technical approach more complex than necessary\n- Dependencies create cascading risks\n\n## How to Use Results\n\n### If Red Flags Found\n1. Apply simplicity-first lens more rigorously\n2. Challenge technical complexity in strategic validation\n3. Request PLAN to simplify approach before approval\n4. Consider phased delivery (MVP first, enhancements later)\n\n### Document in Approval\nAdd to approval notes:\n\n```markdown\n## Historical Context Reviewed\n\nConsulted 3 prior retrospectives in [category]:\n- SD-SIMILAR-001: Over-engineered auth (8 weeks → 3 weeks after simplification)\n- SD-SIMILAR-002: Scope expanded 3x during implementation\n- PAT-009: Premature abstraction in [category] (40% success rate)\n\n**Decision**: Approved with simplicity constraints:\n- MVP scope only (defer advanced features to Phase 2)\n- Weekly complexity reviews during PLAN\n- Hard cap: 400 LOC per component\n```\n\n### If No Red Flags\n- Proceed with standard approval process\n- Note historical consultation in approval\n- Builds confidence in strategic decision\n\n## Why This Matters\n\n- **Prevents strategic mistakes**: Learn from past over-engineering\n- **Informed decisions**: Data-driven approval vs intuition\n- **Protects team time**: Avoid repeating known pitfalls\n- **Builds pattern recognition**: Strategic lens improves over time\n\n## Quick Reference\n\n```bash\n# Before SD approval (RECOMMENDED)\nnode scripts/phase-preflight.js --phase LEAD --sd-id <SD_UUID>\n\n# Review over-engineering patterns\nnode scripts/search-prior-issues.js --category over_engineering --list\n\n# Check category history\nnode scripts/search-prior-issues.js \"<SD category>\" --retrospectives\n```\n\n**Time Investment**: 1-2 minutes\n**Value**: Strategic foresight, prevents month-long mistakes",
        "order_index": 200
      },
      {
        "section_type": "e2e_testing_mode_configuration",
        "title": "E2E Testing: Dev Mode vs Preview Mode",
        "content": "**E2E Testing Mode**: Default to dev mode (port 5173) for reliable tests.\n\n**Issue**: Preview mode (4173) may have rendering problems\n**Solution**: Use dev mode for tests, preview only for production validation\n```typescript\nbaseURL: 'http://localhost:5173'  // Dev mode\n```\n\n**Full Guide**: See `docs/reference/e2e-testing-modes.md`",
        "order_index": 236
      },
      {
        "section_type": "handoff-rls-bypass-pattern",
        "title": "Handoff Creation: RLS Bypass Pattern",
        "content": "**Handoff RLS Bypass**: Use direct PostgreSQL to bypass RLS policies.\n\n**Issue**: RLS blocks INSERT with ANON_KEY\n**Solution**: Direct connection via `createDatabaseClient` helper\n```javascript\nimport { createDatabaseClient } from '../lib/supabase-connection.js';\nconst client = await createDatabaseClient('engineer', { verify: true });\n```\n\n**Full Pattern**: See `docs/reference/handoff-rls-bypass.md`",
        "order_index": 250
      },
      {
        "section_type": "retrospective-schema-reference",
        "title": "Retrospective Table Schema Reference",
        "content": "**Retrospective Schema**: Critical field mappings to prevent constraint errors.\n\n**Quick Reference:**\n- `generated_by`: Must be 'MANUAL'\n- `status`: Must be 'PUBLISHED'\n- `team_satisfaction`: 1-10 scale (NOT 0-100)\n- Array fields: Use arrays, NOT JSON.stringify()\n- Boolean fields: true/false, NOT integers\n\n**Common Errors**:\n- Column \"lessons_learned\" not found → Use `key_learnings`\n- Malformed array literal → Remove JSON.stringify()\n- team_satisfaction_check violation → Use 1-10 scale\n\n**Complete Schema**: See `docs/reference/retrospective-schema.md`",
        "order_index": 251
      },
      {
        "section_type": "trigger-disable-pattern",
        "title": "Database Trigger Management for Special Cases",
        "content": "**Database Trigger Management**: Temporary trigger disable for special cases (infrastructure/protocol SDs).\n\n**Safe Pattern**:\n```javascript\n// Step 1: Disable trigger\nawait client.query('ALTER TABLE ... DISABLE TRIGGER trigger_name');\n\n// Step 2: Critical operation\nawait client.query('UPDATE ...');\n\n// Step 3: Re-enable (ALWAYS in finally block)\nawait client.query('ALTER TABLE ... ENABLE TRIGGER trigger_name');\n```\n\n**When to Use**: Legitimate special cases, RLS blocking trigger validation, no other solution available\n\n**Complete Pattern**: See `docs/reference/trigger-management.md`",
        "order_index": 252
      },
      {
        "section_type": "context_monitoring",
        "title": "Proactive Context Monitoring",
        "content": "**Context Monitoring**: Report context health in EVERY handoff.\n\n**Status Thresholds**:\n- HEALTHY ✅: 0-140K tokens (0-70%)\n- WARNING ⚠️: 140K-180K (70-90%) - Consider compaction\n- CRITICAL 🔴: 180K-190K (90-95%) - MUST compact before handoff\n- EMERGENCY 🚨: >190K (>95%) - BLOCKED\n\n**Handoff Section Required**:\n```markdown\n## Context Health\n**Current Usage**: X tokens (Y% of 200K budget)\n**Status**: HEALTHY/WARNING/CRITICAL\n**Recommendation**: [action if needed]\n```\n\n**Complete Guide**: See `docs/reference/context-monitoring.md`",
        "order_index": 320
      },
      {
        "section_type": "database_query_best_practices",
        "title": "Database Query Best Practices",
        "content": "**Database Query Efficiency**: Smart querying saves 5K-10K tokens per SD.\n\n**Quick Rules:**\n1. **Select specific columns** only (not `SELECT *`)\n2. **Limit results** with `.limit(5)` for summaries\n3. **Use Read tool** with offset/limit for large files\n4. **Summarize results**, don't dump full objects\n5. **Batch related reads** for parallel execution\n\n**Expected Impact**: 90-98% token reduction per query\n\n**Examples & Patterns**: See `docs/reference/database-best-practices.md`",
        "order_index": 325
      },
      {
        "section_type": "sub_agent_compression",
        "title": "Sub-Agent Report Compression System",
        "content": "**Sub-Agent Report Compression**: Intelligent tiering preserves critical context while reducing token usage by 70-90%.\n\n**Quick Reference:**\n- **TIER 1 (CRITICAL)**: Full detail preserved for blockers/failures\n- **TIER 2 (IMPORTANT)**: Structured summary with warnings\n- **TIER 3 (INFORMATIONAL)**: One-line summary for passing validations\n\n**Phase Relevance**: Different sub-agents matter more in different phases\n**Automatic Retrieval**: Full reports fetched when needed (PLAN supervisor, retrospectives, debugging)\n\n**Full Guide**: See `docs/reference/sub-agent-compression.md`",
        "order_index": 330
      },
      {
        "section_type": "database_first_enforcement_expanded",
        "title": "Database-First Enforcement - Expanded",
        "content": "**Database-First Enforcement (MANDATORY)**:\n\n**❌ NEVER create**: Strategic Directive files, PRD files, Retrospective files, Handoff documents, Verification reports\n\n**✅ REQUIRED**: All data in database tables only\n- SDs → `strategic_directives_v2`\n- PRDs → `product_requirements_v2`\n- Retrospectives → `retrospectives`\n- Handoffs → `sd_phase_handoffs`\n\n**Why**: Single source of truth, real-time updates, automated tracking, no file sync issues\n\n**Verification**: `find . -name \"SD-*.md\" -o -name \"PRD-*.md\"` should return ONLY legacy files",
        "order_index": 345
      },
      {
        "section_type": "lead_pre_approval_simplicity_gate",
        "title": "🛡️ LEAD Pre-Approval Strategic Validation Gate",
        "content": "## 🛡️ LEAD Pre-Approval Strategic Validation Gate\n\n### MANDATORY Before Approving ANY Strategic Directive\n\nLEAD MUST answer these questions BEFORE approval:\n\n1. **Need Validation**: Is this solving a real user problem or perceived problem?\n2. **Solution Assessment**: Does the proposed solution align with business objectives?\n3. **Existing Tools**: Can we leverage existing tools/infrastructure instead of building new?\n4. **Value Analysis**: Does the expected value justify the development effort?\n5. **Feasibility Review**: Are there any technical or resource constraints that make this infeasible?\n6. **Risk Assessment**: What are the key risks and how are they mitigated?\n\n**Approval Criteria**:\n- Real user/business problem identified\n- Solution is technically feasible\n- Resources are available or can be allocated\n- Risks are acceptable and documented\n- Expected value justifies effort\n\n**SCOPE LOCK**: Once LEAD approves an SD, the scope is LOCKED. LEAD commits to delivering the approved scope. LEAD may NOT:\n- ❌ Re-evaluate \"do we really need this?\" during final approval\n- ❌ Reduce scope after EXEC phase begins without critical justification\n- ❌ Defer work unilaterally during verification\n- ❌ Mark SD complete if PRD requirements not met\n\n**Exception**: LEAD may adjust scope mid-execution ONLY if:\n1. Critical technical blocker discovered (true impossibility, not difficulty)\n2. External business priorities changed dramatically (documented)\n3. Explicit human approval obtained\n4. New SD created for all deferred work (no silent scope reduction)\n",
        "order_index": 346
      },
      {
        "section_type": "plan_presentation_template",
        "title": "Pre-Implementation Plan Presentation Template",
        "content": "## Pre-Implementation Plan Presentation Template\n\n**SD-PLAN-PRESENT-001** | **Template Type:** plan_presentation | **Phase:** PLAN → EXEC\n\n### Purpose\n\nThe `plan_presentation` template standardizes PLAN→EXEC handoffs by providing structured implementation guidance to the EXEC agent. This template reduces EXEC confusion from 15-20 minutes to <5 minutes by clearly communicating:\n\n- **What** will be implemented (goal_summary)\n- **Where** changes will occur (file_scope)\n- **How** to implement step-by-step (execution_plan)\n- **Dependencies** and impacts (dependency_impacts)\n- **Testing approach** (testing_strategy)\n\n### Template Structure\n\nAll plan_presentation objects must be included in the `metadata.plan_presentation` field of PLAN→EXEC handoffs.\n\n#### Required Fields\n\n1. **goal_summary** (string, ≤300 chars, required)\n   - Brief 2-3 sentence summary of implementation goals\n   - Focus on \"what\" and \"why\", not \"how\"\n   - Example: `\"Add plan_presentation template to leo_handoff_templates table with JSONB validation structure. Enhance unified-handoff-system.js with validation logic (~50 LOC). Reduce EXEC confusion from 15-20 min to <5 min.\"`\n\n2. **file_scope** (object, required)\n   - Lists files to create, modify, or delete\n   - At least one category must have ≥1 file\n   - Structure:\n     ```json\n     {\n       \"create\": [\"path/to/new-file.js\"],\n       \"modify\": [\"path/to/existing-file.js\"],\n       \"delete\": [\"path/to/deprecated-file.js\"]\n     }\n     ```\n\n3. **execution_plan** (array, required, ≥1 step)\n   - Step-by-step implementation sequence\n   - Each step includes: step number, action description, affected files\n   - Structure:\n     ```json\n     [\n       {\n         \"step\": 1,\n         \"action\": \"Add validatePlanPresentation() method to PlanToExecVerifier class\",\n         \"files\": [\"scripts/verify-handoff-plan-to-exec.js\"]\n       },\n       {\n         \"step\": 2,\n         \"action\": \"Integrate validation into verifyHandoff() method\",\n         \"files\": [\"scripts/verify-handoff-plan-to-exec.js\"]\n       }\n     ]\n     ```\n\n4. **testing_strategy** (object, required)\n   - Specifies unit test and E2E test approaches\n   - Both unit_tests and e2e_tests fields required\n   - Structure:\n     ```json\n     {\n       \"unit_tests\": \"Test validatePlanPresentation() with valid, missing, and invalid structures\",\n       \"e2e_tests\": \"Create PLAN→EXEC handoff and verify validation enforcement\",\n       \"verification_steps\": [\n         \"Run test script with 3 scenarios\",\n         \"Verify validation passes for complete plan_presentation\"\n       ]\n     }\n     ```\n\n#### Optional Fields\n\n5. **dependency_impacts** (object, optional)\n   - Documents dependencies and their impacts\n   - Structure:\n     ```json\n     {\n       \"npm_packages\": [\"react-hook-form\", \"zod\"],\n       \"internal_modules\": [\"handoff-validator.js\"],\n       \"database_changes\": \"None (reads from leo_handoff_templates)\"\n     }\n     ```\n\n### Validation Rules\n\nThe `verify-handoff-plan-to-exec.js` script validates plan_presentation structure:\n\n- ✅ `goal_summary` present and ≤300 characters\n- ✅ `file_scope` has at least one of: create, modify, delete\n- ✅ `execution_plan` has ≥1 step\n- ✅ `testing_strategy` has both `unit_tests` and `e2e_tests` defined\n\n**Validation Enforcement:** PLAN→EXEC handoffs are rejected if plan_presentation is missing or invalid.\n\n### Complete Example\n\n```json\n{\n  \"metadata\": {\n    \"plan_presentation\": {\n      \"goal_summary\": \"Add plan_presentation template to leo_handoff_templates table with JSONB validation structure. Enhance unified-handoff-system.js with validation logic (~50 LOC). Reduce EXEC confusion from 15-20 min to <5 min.\",\n      \"file_scope\": {\n        \"create\": [],\n        \"modify\": [\"scripts/verify-handoff-plan-to-exec.js\"],\n        \"delete\": []\n      },\n      \"execution_plan\": [\n        {\n          \"step\": 1,\n          \"action\": \"Add validatePlanPresentation() method to PlanToExecVerifier class\",\n          \"files\": [\"scripts/verify-handoff-plan-to-exec.js\"]\n        },\n        {\n          \"step\": 2,\n          \"action\": \"Integrate validation into verifyHandoff() method\",\n          \"files\": [\"scripts/verify-handoff-plan-to-exec.js\"]\n        },\n        {\n          \"step\": 3,\n          \"action\": \"Add PLAN_PRESENTATION_INVALID rejection handler\",\n          \"files\": [\"scripts/verify-handoff-plan-to-exec.js\"]\n        }\n      ],\n      \"dependency_impacts\": {\n        \"npm_packages\": [],\n        \"internal_modules\": [\"handoff-validator.js\"],\n        \"database_changes\": \"None (reads from leo_handoff_templates)\"\n      },\n      \"testing_strategy\": {\n        \"unit_tests\": \"Test validatePlanPresentation() with valid, missing, and invalid structures\",\n        \"e2e_tests\": \"Create PLAN→EXEC handoff and verify validation enforcement\",\n        \"verification_steps\": [\n          \"Run test script with 3 scenarios (TS1, TS2, TS3)\",\n          \"Verify validation passes for complete plan_presentation\",\n          \"Verify validation fails with clear errors for incomplete/invalid structures\"\n        ]\n      }\n    }\n  }\n}\n```\n\n### Benefits\n\n- **Reduced Confusion:** EXEC spends <5 min understanding implementation (vs 15-20 min)\n- **Consistent Handoffs:** All PLAN→EXEC handoffs follow same structure\n- **Auditability:** Implementation decisions queryable via metadata\n- **Quality Gate:** Invalid handoffs rejected before EXEC phase begins\n\n### Related Documentation\n\n- **Template Definition:** leo_handoff_templates table, handoff_type = 'plan_presentation'\n- **Validation Logic:** scripts/verify-handoff-plan-to-exec.js (PlanToExecVerifier.validatePlanPresentation)\n- **Test Coverage:** scripts/test-plan-presentation-validation.mjs (5 test scenarios)\n",
        "order_index": 350
      },
      {
        "section_type": "unified_handoff_system",
        "title": "🔄 Unified Handoff System (Database-First)",
        "content": "**Unified Handoff System**: Database-first handoffs via `node scripts/unified-handoff-system.js execute <TYPE> <SD-ID>`\n\n**Types**: LEAD-to-PLAN, PLAN-to-EXEC, EXEC-to-PLAN, PLAN-to-LEAD\n**7 Mandatory Elements**: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions, Known Issues, Resource Utilization, Action Items\n**Tables**: `leo_handoff_templates` (structure), `sd_phase_handoffs` (instances)\n\n**Complete Guide**: See `docs/reference/unified-handoff-system.md`",
        "order_index": 460
      },
      {
        "section_type": "database_schema_overview",
        "title": "Database Schema Overview",
        "content": "### Core Tables\n- `leo_protocols` - Protocol versions and content\n- `leo_protocol_sections` - Modular protocol sections\n- `leo_agents` - Agent definitions and percentages\n- `leo_handoff_templates` - Standardized handoffs\n- `leo_sub_agents` - Sub-agent definitions\n- `leo_sub_agent_triggers` - Activation rules\n- `leo_validation_rules` - Protocol validation\n\n### Key Queries\n\n**Get Current Protocol**:\n```sql\nSELECT * FROM leo_protocols WHERE status = 'active';\n```\n\n**Check Sub-Agent Triggers**:\n```sql\nSELECT sa.*, t.*\nFROM leo_sub_agents sa\nJOIN leo_sub_agent_triggers t ON sa.id = t.sub_agent_id\nWHERE t.trigger_phrase ILIKE '%keyword%';\n```\n\n**Get Handoff Template**:\n```sql\nSELECT * FROM leo_handoff_templates\nWHERE from_agent = 'EXEC' AND to_agent = 'PLAN';\n```\n\n## API Endpoints (Database-Backed)\n\n- `GET /api/leo/current` - Current active protocol\n- `GET /api/leo/agents` - All agents with percentages\n- `GET /api/leo/sub-agents` - Active sub-agents with triggers\n- `GET /api/leo/handoffs/:from/:to` - Handoff template\n- `POST /api/leo/validate` - Validate against rules\n\n## Key Scripts (Database-Aware)\n\n- `get-latest-leo-protocol-from-db.js` - Get version from database\n- `generate-claude-md-from-db.js` - Generate this file\n- `migrate-leo-protocols-to-database.js` - Migration tool\n- `activate-sub-agents-from-db.js` - Check database triggers\n\n## Compliance Tools\n\nAll tools now query database instead of files:\n\n### 1. Version Check\n```bash\nnode scripts/get-latest-leo-protocol-from-db.js\n```\n\n### 2. Update CLAUDE.md\n```bash\nnode scripts/generate-claude-md-from-db.js\n```\n\n### 3. Validate Handoff\n```bash\nnode scripts/leo-checklist-db.js [agent-name]\n```\n\n## 🔍 PLAN Supervisor Verification\n\n### Overview\nPLAN agent now includes supervisor capabilities for final \"done done\" verification:\n- Queries ALL sub-agents for their verification results\n- Ensures all requirements are truly met\n- Resolves conflicts between sub-agent reports\n- Provides confidence scoring and clear pass/fail verdict\n\n### Activation\nTrigger PLAN supervisor verification via:\n- **Command**: `/leo-verify [what to check]`\n- **Script**: `node scripts/plan-supervisor-verification.js --prd PRD-ID`\n- **Automatic**: When testing phase completes\n\n### Verification Process\n1. **Read-Only Access**: Queries existing sub-agent results (no re-execution)\n2. **Summary-First**: Prevents context explosion with tiered reporting\n3. **Conflict Resolution**: Priority-based rules (Security > Database > Testing)\n4. **Circuit Breakers**: Graceful handling of sub-agent failures\n5. **Maximum 3 Iterations**: Prevents infinite verification loops\n\n### Verdicts\n- **PASS**: All requirements met, high confidence (≥85%)\n- **FAIL**: Critical issues or unmet requirements\n- **CONDITIONAL_PASS**: Minor issues, needs LEAD review\n- **ESCALATE**: Cannot reach consensus, needs LEAD intervention\n\n## Dashboard Integration\n\nDashboard automatically connects to database:\n- Real-time protocol updates via Supabase subscriptions\n- Version detection from `leo_protocols` table\n- Sub-agent status from `leo_sub_agents` table\n- PLAN supervisor verification status\n- No file scanning needed\n\n## Important Notes\n\n1. **Database is Source of Truth** - Files are deprecated\n2. **Real-time Updates** - Changes reflect immediately\n3. **No Version Conflicts** - Single active version enforced\n4. **Audit Trail** - All changes tracked in database\n5. **WebSocket Updates** - Dashboard stays synchronized\n6. **PLAN Supervisor** - Final verification before LEAD approval",
        "order_index": 500
      },
      {
        "section_type": "supabase_operations",
        "title": "🗄️ Supabase Database Operations",
        "content": "### Connection Details\n- **Project URL**: https://dedlbzhpgkmetvhbkyzq.supabase.co\n- **Project ID**: dedlbzhpgkmetvhbkyzq\n- **Connection**: Via Supabase client using environment variables\n\n### Environment Variables Required\n```bash\n# For EHG application (liapbndqlqxdcgpwntbv)\nEHG_SUPABASE_URL=https://liapbndqlqxdcgpwntbv.supabase.co\nEHG_SUPABASE_ANON_KEY=[anon-key]\nEHG_POOLER_URL=postgresql://postgres.liapbndqlqxdcgpwntbv:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require\n\n# For EHG_Engineer (dedlbzhpgkmetvhbkyzq)\nSUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co\nSUPABASE_ANON_KEY=[anon-key]\nSUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[password]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require\nSUPABASE_DB_PASSWORD=Fl!M32DaM00n!1\n```",
        "order_index": 600
      },
      {
        "section_type": "development_workflow",
        "title": "🔧 CRITICAL DEVELOPMENT WORKFLOW",
        "content": "**Development Workflow**: MANDATORY server restart after ANY changes\n\n**Steps**: Kill server → Build client (`npm run build:client`) → Restart server → Hard refresh browser\n**Why**: No hot-reloading configured, dist/ serves compiled files\n**Commands**: `pkill -f \"node server.js\" && npm run build:client && PORT=3000 node server.js`\n\n**Complete Guide**: See `docs/reference/development-workflow.md`",
        "order_index": 700
      },
      {
        "section_type": "testing_tier_strategy_updated",
        "title": "Testing Tier Strategy (Updated)",
        "content": "\n## Testing Requirements - Dual Test Execution (UPDATED)\n\n**Philosophy**: Comprehensive testing = Unit tests (logic) + E2E tests (user experience)\n\n### Tier 1: Smoke Tests (MANDATORY) ✅\n- **Requirement**: BOTH unit tests AND E2E tests must pass\n- **Commands**:\n  - Unit: `npm run test:unit` (Vitest - business logic)\n  - E2E: `npm run test:e2e` (Playwright - user flows)\n- **Approval**: **BOTH test types REQUIRED for PLAN→LEAD approval**\n- **Execution Time**: Combined <5 minutes for smoke-level tests\n- **Coverage**:\n  - Unit: Service layer, business logic, utilities\n  - E2E: Critical user paths, authentication, navigation\n\n### Tier 2: Comprehensive Testing (RECOMMENDED) 📋\n- **Requirement**: Full test suite with deep coverage\n- **Commands**:\n  - Unit: `npm run test:unit:coverage` (50%+ coverage target)\n  - E2E: All Playwright tests (30-50 scenarios)\n  - Integration: `npm run test:integration`\n  - A11y: `npm run test:a11y`\n- **Approval**: Nice to have, **NOT blocking** but highly recommended\n- **Timing**: Can be refined post-deployment\n\n### Tier 3: Manual Testing (SITUATIONAL) 🔍\n- **UI changes**: Visual regression testing\n- **Complex flows**: Multi-step wizards, payment flows\n- **Edge cases**: Rare scenarios not covered by automation\n\n### ⚠️ What Changed (From Protocol Enhancement)\n**Before**: \"Tier 1 = 3-5 tests, <60s\" (ambiguous - which tests?)\n**After**: \"Tier 1 = Unit tests + E2E tests (explicit frameworks, explicit commands)\"\n\n**Lesson Learned**: SD-AGENT-ADMIN-002 testing oversight (ran E2E only, missed unit test failures)\n",
        "order_index": 700
      },
      {
        "section_type": "schema_documentation_access",
        "title": "Database Schema Documentation Access",
        "content": "## 📊 Database Schema Documentation Access\n\n**Auto-Generated Schema Docs** - Reference documentation from live Supabase databases\n\n### Available Schema Documentation\n\n**EHG_Engineer Database** (Management Dashboard):\n- **Quick Reference**: `docs/reference/schema/engineer/database-schema-overview.md` (~15-20KB)\n- **Detailed Tables**: `docs/reference/schema/engineer/tables/[table_name].md` (2-5KB each)\n- **Coverage**: 159 tables documented\n- **Purpose**: Strategic Directives, PRDs, retrospectives, LEO Protocol configuration\n- **Repository**: /mnt/c/_EHG/EHG_Engineer/\n- **Database**: dedlbzhpgkmetvhbkyzq\n\n**EHG Application Database** (Customer-Facing):\n- **Quick Reference**: `docs/reference/schema/ehg/database-schema-overview.md` (~15-20KB)\n- **Detailed Tables**: `docs/reference/schema/ehg/tables/[table_name].md` (2-5KB each)\n- **Coverage**: ~200 tables (requires pooler credentials to generate)\n- **Purpose**: Customer features, business logic, user-facing functionality\n- **Repository**: /mnt/c/_EHG/ehg/\n- **Database**: liapbndqlqxdcgpwntbv\n\n### When to Use Schema Docs\n\n**MANDATORY during PLAN phase**:\n- Creating PRDs with database changes\n- Validating technical approach\n- Identifying table dependencies\n- Preventing schema conflicts\n\n**PRD Database Integration**:\nPRDs are stored in `product_requirements_v2` table (NOT markdown files). The `add-prd-to-database.js` script prompts for schema review and guides you to populate these fields with schema insights:\n- `technical_approach`: Reference existing tables/columns\n- `database_changes`: List affected tables with schema context\n- `dependencies`: Note table relationships from schema docs\n\n### Regenerating Schema Docs\n\n**Automatic**:\n- CI/CD workflow runs on migration changes (see `.github/workflows/schema-docs-update.yml`)\n- Weekly scheduled runs (Sunday midnight)\n\n**Manual**:\n```bash\n# Engineer database (EHG_Engineer)\nnpm run schema:docs:engineer\n\n# EHG application database (requires pooler credentials)\nnpm run schema:docs:ehg\n\n# Both databases\nnpm run schema:docs:all\n\n# Single table (verbose output)\nnpm run schema:docs:table <table_name>\n```\n\n### Integration with PRD Creation Workflow\n\n**Step 1: Review Schema Before PRD**\n```bash\n# Quick check if tables exist\nless docs/reference/schema/engineer/database-schema-overview.md | grep -A 5 \"table_name\"\n\n# Detailed table review\ncat docs/reference/schema/engineer/tables/strategic_directives_v2.md\n```\n\n**Step 2: Create PRD with Schema Context**\n```bash\n# Script automatically prompts for schema review\nnode scripts/add-prd-to-database.js SD-EXAMPLE-001\n# → Detects table names from SD description\n# → Asks: \"Have you reviewed schema docs for: strategic_directives_v2, user_stories?\"\n# → Guides you to populate technical_approach and database_changes fields\n```\n\n**Step 3: PLAN Agent Validates Schema Awareness**\n- PRD must reference specific tables/columns in `technical_approach`\n- `database_changes` field must list affected tables\n- PLAN→EXEC handoff checks for schema validation\n\n### Critical Reminders\n\n⚠️ **Schema Docs are REFERENCE ONLY**\n- Always query database directly for validation\n- Schema docs may lag behind recent migrations\n- Use as starting point, not source of truth\n\n⚠️ **Application Context Matters**\n- Each schema doc header clearly states application and database\n- NEVER confuse EHG_Engineer tables with EHG tables\n- Check `**Repository**` field to confirm where code changes go\n\n⚠️ **PRD Workflow**\n- PRDs are database records (product_requirements_v2 table)\n- Use `add-prd-to-database.js` script (triggers STORIES sub-agent)\n- Schema insights go in database fields, not markdown\n\n---\n\n*Schema docs generated by: `scripts/generate-schema-docs-from-db.js`*\n*Auto-update workflow: `.github/workflows/schema-docs-update.yml`*\n",
        "order_index": 782
      },
      {
        "section_type": "testing_tools",
        "title": "Playwright MCP Integration",
        "content": "## 🎭 Playwright MCP Integration\n\n**Status**: ✅ READY (Installed 2025-10-12)\n\n### Overview\nPlaywright MCP (Model Context Protocol) provides browser automation capabilities for testing, scraping, and UI verification.\n\n### Installed Components\n- **Chrome**: Google Chrome browser for MCP operations\n- **Chromium**: Chromium 141.0.7390.37 (build 1194) for standard Playwright tests\n- **Chromium Headless Shell**: Headless browser for CI/CD pipelines\n- **System Dependencies**: All required Linux libraries installed\n\n### Available MCP Tools\n\n#### Navigation\n- `mcp__playwright__browser_navigate` - Navigate to URL\n- `mcp__playwright__browser_navigate_back` - Go back to previous page\n\n#### Interaction\n- `mcp__playwright__browser_click` - Click elements\n- `mcp__playwright__browser_fill` - Fill form fields\n- `mcp__playwright__browser_select` - Select dropdown options\n- `mcp__playwright__browser_hover` - Hover over elements\n- `mcp__playwright__browser_type` - Type text into elements\n\n#### Verification\n- `mcp__playwright__browser_snapshot` - Capture accessibility snapshot\n- `mcp__playwright__browser_take_screenshot` - Take screenshots\n- `mcp__playwright__browser_evaluate` - Execute JavaScript\n\n#### Management\n- `mcp__playwright__browser_close` - Close browser\n- `mcp__playwright__browser_tabs` - Manage tabs\n\n### Testing Integration\n\n**When to Use Playwright MCP**:\n1. ✅ Visual regression testing\n2. ✅ UI component verification\n3. ✅ Screenshot capture for evidence\n4. ✅ Accessibility tree validation\n5. ✅ Cross-browser testing\n\n**When to Use Standard Playwright**:\n1. ✅ E2E test suites (`npm run test:e2e`)\n2. ✅ CI/CD pipeline tests\n3. ✅ Automated test runs\n4. ✅ User story validation\n\n### Usage Example\n\n```javascript\n// Using Playwright MCP for visual verification\nawait mcp__playwright__browser_navigate({ url: 'http://localhost:3000/dashboard' });\nawait mcp__playwright__browser_snapshot(); // Get accessibility tree\nawait mcp__playwright__browser_take_screenshot({ name: 'dashboard-state' });\nawait mcp__playwright__browser_click({ element: 'Submit button', ref: 'e5' });\n```\n\n### QA Director Integration\n\nThe QA Engineering Director sub-agent now has access to:\n- Playwright MCP for visual testing\n- Standard Playwright for E2E automation\n- Both Chrome (MCP) and Chromium (tests) browsers\n\n**Complete Guide**: See `docs/reference/playwright-mcp-guide.md`",
        "order_index": 850
      },
      {
        "section_type": "best_practices",
        "title": "Database Migration Validation - Two-Phase Approach",
        "content": "**Database Migration Validation - Two-Phase Approach (MANDATORY)**:\n\n**Phase 1: Static File Validation** (always runs):\n- Migration files exist for SD-ID\n- SQL syntax is valid\n- Required patterns present (CREATE TABLE, ALTER TABLE)\n- Cross-schema foreign keys detected\n\n**Phase 2: Database Verification** (optional, via `--verify-db`):\n- Tables mentioned in migration actually exist\n- Tables are accessible (RLS policies)\n- Seed data was inserted (with `--check-seed-data`)\n\n**Commands**:\n```bash\n# Basic validation (file-only)\nnode scripts/validate-migration-files.js <SD-ID>\n\n# Full validation (file + database + seed data)\nnode scripts/validate-migration-files.js <SD-ID> --verify-db --check-seed-data\n```\n\n**Complete Guide**: See `docs/database-migration-validation-guide.md`",
        "order_index": 850
      },
      {
        "section_type": "exec_edge_case_testing_checklist",
        "title": "Edge Case Testing Checklist",
        "content": "## Edge Case Testing Checklist\n\nWhen implementing tests, ensure coverage for:\n\n### Input Validation Edge Cases\n- [ ] Empty strings, null values, undefined\n- [ ] Maximum length inputs (overflow testing)\n- [ ] Special characters (SQL injection, XSS vectors)\n- [ ] Unicode and emoji inputs\n- [ ] Whitespace-only inputs\n\n### Boundary Conditions\n- [ ] Zero, negative, and maximum numeric values\n- [ ] Array min/max lengths (empty, single item, very large)\n- [ ] Date boundaries (leap years, timezone edge cases)\n\n### Concurrent Operations\n- [ ] Race conditions (simultaneous updates)\n- [ ] Database transaction rollbacks\n- [ ] Cache invalidation timing\n\n### Error Scenarios\n- [ ] Network failures (timeout, disconnect)\n- [ ] Database connection errors\n- [ ] Invalid authentication tokens\n- [ ] Permission denied scenarios\n\n### State Transitions\n- [ ] Idempotency (repeated operations)\n- [ ] State rollback on error\n- [ ] Partial success scenarios",
        "order_index": 900
      },
      {
        "section_type": "guide",
        "title": "Playwright Server Management Best Practice",
        "content": "### Best Practice: Playwright-Managed Dev Server\n\n**Evidence**: SD-AGENT-MIGRATION-001 - Always let Playwright manage the dev server lifecycle for consistent port and automated testing workflows.\n\n**DO NOT** manually start dev servers before E2E tests. Let Playwright manage it.\n\n#### Configuration (playwright.config.ts)\n```typescript\nwebServer: {\n  command: 'npm run dev -- --port 8080',\n  port: 8080,\n  reuseExistingServer: true,  // Reuse if already running\n  timeout: 120_000,            // 2 min startup timeout\n}\n```\n\n#### Why This Works\n- **Consistent Port**: All tests use same port (8080)\n- **Auto-Lifecycle**: Server starts before tests, stops after\n- **CI/CD Compatible**: Works in automated environments\n- **Local Dev Friendly**: `reuseExistingServer` prevents killing your dev server\n\n#### Anti-Patterns\n- ❌ Starting dev server manually on inconsistent ports\n- ❌ Forgetting to stop old servers (port conflicts)\n- ❌ Hardcoding URLs without using `baseURL` from config\n- ❌ Running tests while manually managing server lifecycle\n\n#### Example Test Run\n```bash\n# Playwright handles everything\nnpm run test:e2e\n\n# Playwright:\n# 1. Checks if server already running on 8080\n# 2. Starts server if needed: npm run dev -- --port 8080\n# 3. Waits for server to be ready\n# 4. Runs tests\n# 5. Keeps server running (reuseExistingServer: true)\n```\n\n#### Manual Server Check (if needed)\n```bash\n# Kill old servers\nlsof -i :8080 | grep LISTEN | awk '{print $2}' | xargs kill -9\n\n# Let Playwright manage\nnpm run test:e2e\n```",
        "order_index": 996
      },
      {
        "section_type": "quick_reference",
        "title": "Knowledge Retrieval Commands",
        "content": "## 🔍 Knowledge Retrieval (Proactive Learning)\n\n**SD-LEO-LEARN-001: Added 2025-10-25**\n\n```bash\n# Before starting any phase (MANDATORY for EXEC/PLAN, RECOMMENDED for LEAD)\nnode scripts/phase-preflight.js --phase <LEAD|PLAN|EXEC> --sd-id <UUID>\n\n# Search for specific issues\nnode scripts/search-prior-issues.js \"<issue description>\"\n\n# Generate fresh knowledge summaries (weekly)\nnode scripts/generate-knowledge-summary.js --category <category>\nnode scripts/generate-knowledge-summary.js --category all\n\n# View existing summaries\nls docs/summaries/lessons/*.md\ncat docs/summaries/lessons/database-lessons.md\n```\n\n**Philosophy**: Consult lessons BEFORE encountering issues, not after.",
        "order_index": 999
      },
      {
        "section_type": "test_section",
        "title": "Test Section",
        "content": "Test content",
        "order_index": 999
      },
      {
        "section_type": "plan_visual_documentation_examples",
        "title": "Visual Documentation Best Practices",
        "content": "## Visual Documentation Best Practices\n\nWhen creating PRDs and technical specifications, consider adding:\n\n### Architecture Diagrams (Mermaid)\n```mermaid\ngraph TD\n    A[User Request] --> B[Validation Layer]\n    B --> C{Valid?}\n    C -->|Yes| D[Business Logic]\n    C -->|No| E[Error Response]\n    D --> F[Database]\n    F --> G[Success Response]\n```\n\n### State Flow Diagrams\n```mermaid\nstateDiagram-v2\n    [*] --> Draft\n    Draft --> Review\n    Review --> Approved\n    Review --> Rejected\n    Rejected --> Draft\n    Approved --> [*]\n```\n\n### Sequence Diagrams (Complex Interactions)\n```mermaid\nsequenceDiagram\n    User->>+Frontend: Submit Form\n    Frontend->>+API: POST /api/submit\n    API->>+Database: INSERT data\n    Database-->>-API: Success\n    API->>+Queue: Enqueue job\n    Queue-->>-API: Acknowledged\n    API-->>-Frontend: 202 Accepted\n    Frontend-->>-User: Show success\n```\n\n**When to Use**:\n- Complex workflows with multiple decision points → Flowchart\n- Multi-component interactions → Sequence diagram\n- State transitions → State diagram\n- System architecture → Component diagram",
        "order_index": 1000
      },
      {
        "section_type": "guide",
        "title": "Database Migration Pre-Flight Checklist",
        "content": "**Database Migration Pre-Flight Checklist (MANDATORY)**:\n\n**Before attempting ANY migration**:\n1. Read established pattern: `scripts/lib/supabase-connection.js`\n2. Verify connection: Region aws-1, Port 5432, SSL config\n3. Use helper functions: `createDatabaseClient`, `splitPostgreSQLStatements`\n4. Validate migration file: No cross-schema FKs, correct RLS syntax\n5. Handle conflicts: Check existing tables, use CASCADE carefully\n\n**Anti-Patterns to AVOID**:\n- Using psql without understanding connection format\n- Trial-and-error with regions/ports/SSL\n- Not handling \"already exists\" errors\n\n**Complete Guide**: See `docs/reference/migration-preflight.md`",
        "order_index": 2347
      },
      {
        "section_type": "sub_agents",
        "title": "Native Claude Code Sub-Agent Integration",
        "content": "## 🤖 Native Claude Code Sub-Agent Integration\n\n**Status**: ✅ TESTED & DOCUMENTED (2025-10-12)\n\n### Overview\nClaude Code supports native sub-agents via the Task tool. These sub-agents work alongside the database-driven LEO Protocol orchestration system in a hybrid architecture.\n\n### Critical Dependency: ripgrep\n**REQUIRED**: `ripgrep` (command: `rg`) must be installed for agent discovery.\n```bash\n# Check if installed\nwhich rg\n\n# Install on Ubuntu/Debian WSL2\nsudo apt update && sudo apt install ripgrep -y\n```\n\n**Without ripgrep**: Agent discovery fails silently (no error messages, agents simply won't be found).\n\n### Discovery Mechanism\n1. Claude Code uses ripgrep to scan `.claude/agents/*.md` files\n2. YAML frontmatter is parsed for agent configuration\n3. Successfully discovered agents appear in `/agents` menu\n4. Verify with: `/agents` command\n\n### Five Sub-Agent Invocation Patterns\n\n#### Pattern 1: Advisory Mode ✅ (RECOMMENDED for guidance)\n\n**Use Case**: General architecture questions, no SD context\n\n**Example**:\n```\nUser: \"What's the best way to structure a many-to-many relationship?\"\nMain Agent → Task(database-agent) → Expert Guidance\n```\n\n**Performance**: ~3 seconds, 0 database records\n**Best For**: Design exploration, best practices, architectural guidance\n\n---\n\n#### Pattern 2: Direct Orchestration ✅ (PRODUCTION-READY)\n\n**Use Case**: Explicit phase-based validation, multiple sub-agents, production workflows\n\n**Example**:\n```bash\nnode scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-MONITORING-001\n```\n\n**Performance**: ~2 seconds (parallel execution), 4 database records\n**Best For**: Phase validation, multi-agent orchestration, audit trails, when user explicitly requests validation\n\n---\n\n#### Pattern 3: Automatic SD Detection & Execution ✅ (SMART ORCHESTRATION)\n\n**Use Case**: Automatically detect SD-related requests and execute appropriate orchestration\n\n**How It Works**:\nMain agent detects patterns in user requests and automatically executes Pattern 2 (Direct Orchestration) without requiring explicit script syntax.\n\n**Detection Patterns**:\n\n1. **SD-ID Detection** (Primary Trigger):\n   - Regex: `SD-[A-Z0-9]+-[A-Z0-9-]+` or `SD-[A-Z0-9]+`\n   - Examples: SD-MONITORING-001, SD-UAT-020, SD-EXPORT-001\n\n2. **Validation Keywords** (Secondary Trigger):\n   - validate, check, verify, review, assess, evaluate, test, run, execute\n   - Example: \"validate SD-XXX\", \"check SD-XXX status\", \"run verification for SD-XXX\"\n\n3. **Phase Keywords** (Context Qualifier):\n   - PLAN_VERIFY, LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, LEAD_FINAL\n   - LEAD, PLAN, EXEC phases\n   - pre-approval, verification, final approval\n   - Example: \"run PLAN_VERIFY for SD-XXX\", \"pre-approval check for SD-XXX\"\n\n**Automatic Execution Logic**:\n\n```\nIF user message contains SD-ID pattern (SD-XXX)\n  AND (validation keyword OR phase keyword)\nTHEN\n  Determine phase:\n    - \"pre-approval\" OR \"LEAD_PRE_APPROVAL\" → LEAD_PRE_APPROVAL\n    - \"PRD\" OR \"PLAN_PRD\" → PLAN_PRD\n    - \"verify\" OR \"verification\" OR \"PLAN_VERIFY\" → PLAN_VERIFY\n    - \"final\" OR \"LEAD_FINAL\" → LEAD_FINAL\n    - Default: PLAN_VERIFY (most common verification)\n\n  Execute: node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>\n\n  Report results to user\nEND IF\n```\n\n**Examples of Automatic Detection**:\n\n| User Request | Detected | Auto-Executes |\n|--------------|----------|---------------|\n| \"Validate SD-MONITORING-001\" | ✅ SD-ID + \"validate\" | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-MONITORING-001` |\n| \"Run pre-approval for SD-AUTH-003\" | ✅ SD-ID + \"pre-approval\" | `node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-AUTH-003` |\n| \"Check SD-EXPORT-001 status\" | ✅ SD-ID + \"check\" | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-EXPORT-001` |\n| \"PLAN_VERIFY SD-UAT-020\" | ✅ Phase keyword + SD-ID | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-UAT-020` |\n| \"Is SD-TEST-001 ready?\" | ✅ SD-ID + implied check | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001` |\n| \"What is SD-XXX about?\" | ❌ No validation keyword | Query database, no orchestration |\n\n**Performance**: Same as Pattern 2 (~2 seconds), but triggered automatically\n**Best For**: User convenience, reducing syntax burden, natural language SD validation\n\n**User Benefits**:\n- No need to remember orchestrator script syntax\n- Natural language requests work automatically\n- Correct phase selected based on context\n- All Pattern 2 benefits (parallel execution, database storage) automatically applied\n\n---\n\n#### Pattern 4: Context-Aware Sub-Agent Selection (COMING SOON)\n\n**Use Case**: Intelligently select relevant sub-agents based on SD content analysis\n\n**Status**: In development (Phase 2 of execution plan)\n\n**Planned Features**:\n- Compound keyword matching (require 2+ matches to reduce false positives)\n- Context-aware weighting (title matches > description matches)\n- Domain coordination (DATABASE + SECURITY for auth features)\n- Exclusion patterns (\"HTML table\" ≠ database table trigger)\n\n**Expected Release**: 2-3 weeks\n\n---\n\n#### Pattern 5: Error-Triggered Sub-Agent Invocation (COMING SOON)\n\n**Use Case**: Automatically invoke specialist sub-agents when errors occur\n\n**Status**: In development (Phase 3 of execution plan)\n\n**Planned Features**:\n- Error pattern library (database errors, authentication failures, build errors)\n- Automatic diagnosis & recovery workflows\n- Circuit breakers to prevent infinite loops\n- Learning from resolved errors\n\n**Expected Release**: 1-2 months\n\n### Decision Matrix\n\n| Scenario | Pattern | Command |\n|----------|---------|---------|\n| \"What's the best way to...?\" | 1 (Advisory) | Natural language query |\n| \"How should I structure...?\" | 1 (Advisory) | Natural language query |\n| \"Validate SD-XXX\" | 3 (Auto-Detect) | Detected automatically |\n| \"Run PLAN_VERIFY for SD-XXX\" | 3 (Auto-Detect) | Detected automatically |\n| Explicit script execution | 2 (Direct Script) | `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX` |\n\n### Invocation Mechanism (Task Tool)\n\n**What WORKS** ✅:\n- **Task tool**: Main agent uses Task tool to delegate to sub-agents\n- From user perspective: Natural language (transparent delegation)\n- Behind the scenes: `Task(subagent_type: \"database-agent\", description: \"...\", prompt: \"...\")`\n- **Pattern 3 Auto-Detection**: Main agent recognizes SD-ID patterns and executes orchestrator automatically\n\n**What DOESN'T WORK** ❌:\n- Automatic delegation (typing keywords alone)\n- @-mention syntax (`@database-agent` or `@agent-database-agent`)\n\n### Integration with LEO Protocol 5-Phase Workflow\n\n**LEAD Pre-Approval**:\n- Pattern 1 for design questions\n- Pattern 3 for validation: \"Run pre-approval for SD-XXX\" (auto-detects)\n- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-XXX`\n\n**PLAN PRD Creation**:\n- Pattern 1 for architecture guidance\n- Pattern 3 for validation: \"Validate PRD for SD-XXX\" (auto-detects)\n- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js PLAN_PRD SD-XXX`\n\n**EXEC Implementation**:\n- Pattern 1 for implementation questions\n- Pattern 3 for validation: \"Check SD-XXX implementation\" (auto-detects)\n- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js EXEC_IMPL SD-XXX`\n\n**PLAN Verification**:\n- Pattern 3 for validation: \"Verify SD-XXX\" (auto-detects PLAN_VERIFY phase)\n- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-XXX`\n\n**LEAD Final Approval**:\n- Pattern 3 for validation: \"Run final approval for SD-XXX\" (auto-detects)\n- Pattern 2 for explicit: `node scripts/orchestrate-phase-subagents.js LEAD_FINAL SD-XXX`\n\n### Active Native Sub-Agents\n\n**Currently Available**:\n- `database-agent` - Principal Database Architect (tested, working)\n- `validation-agent` - Principal Systems Analyst (tested, working)\n- `test-agent` - Test agent for diagnostics (tested, working)\n\n**Agent File Location**: `.claude/agents/*.md`\n\n**Example Agent Structure**:\n```yaml\n---\nname: database-agent\ndescription: \"MUST BE USED PROACTIVELY for all database tasks. Handles schema design, Supabase migrations, RLS policies, SQL validation, and architecture. Trigger on keywords: database, migration, schema, table, RLS, SQL, Postgres.\"\ntools: Bash, Read, Write\nmodel: inherit\n---\n```\n\n### Performance Metrics\n\n| Operation | Pattern 1 | Pattern 2 | Pattern 3 |\n|-----------|-----------|-----------|-----------|\n| Invocation | <1s | <1s | <1s |\n| Execution | 2-5s | 1-3s | 1-3s (same as P2) |\n| Database Writes | 0 | 1-6 | 1-6 (same as P2) |\n| Token Usage | Medium | Low | Low |\n| Best For | Guidance | Explicit | Natural language |\n\n### Troubleshooting\n\n**Agent not appearing in /agents menu**:\n1. Check ripgrep installed: `which rg`\n2. Verify file location: `.claude/agents/*.md`\n3. Validate YAML frontmatter\n4. Restart Claude Code\n\n**Pattern 3 not auto-detecting**:\n- Ensure SD-ID format is correct (SD-XXX-XXX or SD-XXX)\n- Include validation keyword (validate, check, verify, etc.)\n- Check that main agent has Pattern 3 logic in context\n\n**Sub-agent not executing scripts** (Legacy Pattern 2 issue):\n- Use Pattern 2 or 3 instead\n- Main agent invokes scripts directly via Bash tool\n\n### Complete Documentation\n\n**Detailed Guides**:\n- `docs/reference/native-sub-agent-invocation.md` - Discovery, invocation, troubleshooting (420 lines)\n- `docs/guides/hybrid-sub-agent-workflow.md` - Decision matrix, patterns, integration (450 lines)\n\n**Test Results**: Patterns 1-2 comprehensively tested (2025-10-12), Pattern 3 in deployment\n**Production Status**: Patterns 1 & 2 ready, Pattern 3 active deployment, Patterns 4 & 5 in development\n",
        "order_index": 2348
      },
      {
        "section_type": "quick-reference",
        "title": "Test Execution Timeout Handling",
        "content": "## 🕐 Test Execution Timeout Handling\n\n**Problem**: Test suites timing out in WSL2/resource-constrained environments\n**Solution**: 4-step fallback strategy with clear escalation path\n\n### Quick Reference\n\n**Timeout Thresholds**:\n- Unit Tests: 2 min (native) / 3 min (WSL2)\n- E2E Tests: 5 min (native) / 7 min (WSL2)\n\n**4-Step Fallback Strategy**:\n1. **Quick Validation** (60s): `vitest run --no-coverage`\n2. **Focused Testing** (30s): `vitest run --grep=\"ComponentName\"`\n3. **Manual Smoke Test** (5 min): Navigate + test critical paths\n4. **CI/CD-Only** (7-10 min): Push to branch, document GitHub Actions URL\n\n**When to Escalate**: All 4 steps timeout → LEAD investigation\n\n**Complete Guide**: `docs/reference/test-timeout-handling.md` (200 lines)\n\n**Evidence**: SD-SETTINGS-2025-10-12 - Unit tests timed out after 2 min in WSL2\n**Impact**: Prevents 30-60 min of blocked time per timeout occurrence",
        "order_index": 2349
      },
      {
        "section_type": "quick-reference",
        "title": "Checkpoint Pattern for Large SDs",
        "content": "## 📍 Checkpoint Pattern for Large SDs\n\n**Problem**: Large SDs (12+ user stories) consume excessive context, high rework risk\n**Solution**: Break into 3-4 checkpoints with interim validation\n\n### Quick Reference\n\n**When to Use**:\n- 9+ user stories → Recommended (3 checkpoints)\n- 13+ user stories → Mandatory (4+ checkpoints)\n- >1500 LOC → Recommended\n- >8 hours estimated → Recommended\n\n**Checkpoint Structure** (Example: SD with 12 US):\n- **Checkpoint 1**: US-001 to US-004 (Component creation, 2-3 hours)\n- **Checkpoint 2**: US-005 to US-008 (Feature implementation, 2-3 hours)\n- **Checkpoint 3**: US-009 to US-012 (Testing + docs, 2-3 hours)\n\n**Benefits**:\n- 30-40% reduction in context consumption\n- 50% faster debugging (smaller change sets)\n- Incremental progress visibility\n- Pause/resume flexibility\n\n**Complete Guide**: `docs/reference/checkpoint-pattern.md` (150 lines)\n\n**Evidence**: SD-SETTINGS-2025-10-12 analysis - Would have reduced context from 85K to 60K tokens\n**Impact**: Saves 2-4 hours per large SD through early error detection",
        "order_index": 2350
      },
      {
        "section_type": "quick-reference",
        "title": "Session Continuation Best Practices",
        "content": "## 🔄 Session Continuation Best Practices\n\n**Problem**: Context limits require session handoffs, risking progress loss\n**Solution**: Proven patterns from successful SD continuation\n\n### Quick Reference\n\n**Before Ending Session**:\n1. Update TodoWrite with current task marked \"in_progress\"\n2. Document exact resume point (file, line, next step)\n3. Create checkpoint commit if mid-implementation\n4. Report context health (usage %, status, recommendation)\n\n**When Resuming**:\n1. Read continuation summary\n2. Verify application state: `cd /path && pwd`, `git status`\n3. Read current files mentioned in summary\n4. Check build status: `npm run type-check && npm run lint`\n5. Confirm resume point with user\n\n**Key Patterns**:\n- **Comprehensive Summary**: 9 sections (request, concepts, files, errors, solutions, messages, tasks, current work, next step)\n- **Todo Maintenance**: Update after EACH milestone, not in batches\n- **Incremental Implementation**: One component at a time with verification\n- **Pre-Verification Checklist**: App check, GitHub remote, URL, component path\n\n**Complete Guide**: `docs/reference/claude-code-session-continuation.md` (100 lines)\n\n**Evidence**: SD-SETTINGS-2025-10-12 - Zero \"wrong directory\" errors, seamless continuation\n**Impact**: 90% reduction in resume confusion, 95% accuracy in state reconstruction",
        "order_index": 2351
      },
      {
        "section_type": "quick-reference",
        "title": "Parallel Execution Optimization",
        "content": "## ⚡ Parallel Execution Optimization\n\n**Problem**: Sequential execution wastes time when operations are independent\n**Solution**: Guidelines for safe parallel tool execution\n\n### Quick Reference\n\n**Safe for Parallel** ✅:\n- Reading multiple independent files\n- Multiple read-only Git commands (`git status`, `git log`, `git remote -v`)\n- Database queries from different tables (read-only)\n- Sub-agent execution (independent assessments)\n\n**NOT Safe for Parallel** ❌:\n- Write operations (Edit, Write tools)\n- Database mutations (INSERT, UPDATE, DELETE)\n- Sequential dependencies (build before test)\n- Git operations that modify state\n\n**Time Savings Examples**:\n- File reading: 2-3s saved per file after first (parallel vs sequential)\n- Line count: 3-6s saved (`wc -l file1 file2 file3` vs 3 separate commands)\n- Sub-agents: 1-2 min saved (4 sub-agents in 30s vs 2min sequential)\n\n**Decision Rule**:\n- Independent operations + >2s saved + <30K combined output → Use parallel\n- Any dependencies or order requirements → Use sequential\n\n**Complete Guide**: `docs/reference/parallel-execution-opportunities.md` (80 lines)\n\n**Evidence**: SD-SETTINGS-2025-10-12 - Identified missed opportunities (6-9s in file reads)\n**Impact**: 2-5 min saved per SD through parallelization",
        "order_index": 2352
      },
      {
        "section_type": "quick-reference",
        "title": "Progressive Testing Strategy",
        "content": "## 🧪 Progressive Testing Strategy\n\n**Problem**: End-of-phase testing causes late discovery of errors\n**Solution**: Test after each user story or major component\n\n### Quick Reference\n\n**After Each User Story**:\n```bash\nvitest run --no-coverage --grep=\"US-001\"  # Quick validation\n```\n\n**After Each Component**:\n```bash\nnpm run type-check  # TypeScript validation\nnpm run lint        # Code quality check\nnpm run build:skip-checks  # Build validation\n```\n\n**Before EXEC→PLAN Handoff**:\n```bash\nnpm run test:unit   # Full unit suite\nnpm run test:e2e    # Full E2E suite\n```\n\n**Benefits**:\n- Early error detection (smaller blast radius)\n- Faster feedback loop\n- Less context consumed by debugging\n- Can proceed with partial completion if blocked\n\n**Testing Decision Matrix**:\n| Scenario | Command | Timeout | When |\n|----------|---------|---------|------|\n| Quick validation | `vitest --no-coverage` | 60s | After each component |\n| Smoke tests | `vitest --grep=\"US-\"` | 90s | Handoff requirement |\n| Full suite | `npm run test:unit` | 120s | PLAN verification |\n\n**Complete Guide**: See `docs/reference/test-timeout-handling.md` (Section: Progressive Testing)\n\n**Evidence**: Pattern from successful SDs - Early testing catches 80% of issues before handoff\n**Impact**: 50% reduction in late-stage debugging time",
        "order_index": 2353
      },
      {
        "section_type": "quick-reference",
        "title": "Database Agent Error-Triggered Invocation",
        "content": "## 🚨 Database Agent Error-Triggered Invocation\n\n**Problem**: Agents attempt workarounds when encountering database errors instead of using database agent\n**Solution**: Immediate database agent invocation on ANY database error\n\n### Error Patterns That MUST Trigger Database Agent\n\n**PostgreSQL Errors** (immediate database agent call):\n- `column \"X\" does not exist` → Database agent (schema validation)\n- `relation \"X\" does not exist` → Database agent (table validation)\n- `table \"X\" already exists` → Database agent (migration conflict)\n- `foreign key constraint` errors → Database agent (relationship validation)\n- `permission denied for table` → Database agent (RLS policy issue)\n- `syntax error at or near` (in SQL) → Database agent (SQL validation)\n- `trigger function` errors → Database agent (function schema mismatch)\n- `duplicate key value violates unique constraint` → Database agent (data/schema issue)\n\n**Supabase-Specific Errors**:\n- RLS policy failures → Database agent (security architecture)\n- Connection string issues → Database agent (connection helper)\n- Cross-schema foreign key warnings → Database agent (architecture violation)\n- `row level security` errors → Database agent (policy design)\n\n**Migration Errors**:\n- ANY migration file execution failure → Database agent (don't retry manually)\n- `CREATE TABLE IF NOT EXISTS` silent failures → Database agent (conflict detection)\n- Schema version mismatches → Database agent (version management)\n\n### Error Response Protocol\n\n**When ANY database error occurs**:\n\n❌ **DO NOT**:\n- Attempt manual fixes\n- Try workarounds\n- Modify SQL without validation\n- Skip table/column verification\n- Use trial-and-error debugging\n\n✅ **DO IMMEDIATELY**:\n1. STOP current approach\n2. Document the exact error message\n3. Invoke database agent:\n   ```bash\n   node lib/sub-agent-executor.js DATABASE <SD-ID>\n   ```\n4. Provide error context to database agent\n5. Implement database agent's solution\n\n**Pattern**: Database error detected → Invoke database agent → Wait for diagnosis → Implement solution\n\n**Evidence**: 74 retrospectives analyzed, 3 failure patterns from workaround attempts\n**Impact**: Eliminates technical debt from band-aid solutions, saves 2-4 hours per database issue",
        "order_index": 2354
      },
      {
        "section_type": "quick-reference",
        "title": "Database Workaround Anti-Patterns (NEVER DO THIS)",
        "content": "## ⛔ Database Workaround Anti-Patterns (NEVER DO THIS)\n\n**Problem**: Common workarounds create technical debt and mask root causes\n**Solution**: Block these patterns, use database agent instead\n\n### Anti-Pattern Catalog\n\n**❌ Anti-Pattern 1: Table Rename Workarounds**\n```sql\n-- WRONG: Renaming table to avoid conflict\nCREATE TABLE webhook_events_new ...\n\n-- RIGHT: Use database agent to diagnose why table exists\nnode lib/sub-agent-executor.js DATABASE <SD-ID>\n```\n\n**❌ Anti-Pattern 2: Column Existence Guards**\n```sql\n-- WRONG: Adding columns conditionally without knowing schema\nALTER TABLE ... ADD COLUMN IF NOT EXISTS ...\n\n-- RIGHT: Database agent validates schema FIRST\n```\n\n**❌ Anti-Pattern 3: RLS Policy Bypassing**\n```typescript\n// WRONG: Using service role key to bypass RLS\nconst supabase = createClient(url, SERVICE_ROLE_KEY)\n\n// RIGHT: Database agent designs proper RLS policies\n```\n\n**❌ Anti-Pattern 4: Manual SQL Trial-and-Error**\n```bash\n# WRONG: Trying different SQL variations manually\npsql -c \"CREATE TABLE ...\" # fails\npsql -c \"CREATE TABLE IF NOT EXISTS ...\" # fails\npsql -c \"DROP TABLE ... CASCADE; CREATE TABLE ...\" # dangerous\n\n# RIGHT: Database agent analyzes schema state FIRST\n```\n\n**❌ Anti-Pattern 5: Skipping Migration Validation**\n```javascript\n// WRONG: Executing migration without validation\nawait executeMigration(sql) // Hope it works\n\n// RIGHT: Database agent validates migration safety\n```\n\n**❌ Anti-Pattern 6: Connection String Trial-and-Error**\n```javascript\n// WRONG: Trying different regions/ports/SSL configs\npostgresql://postgres.PROJECT:PASSWORD@aws-0... // fails\npostgresql://postgres.PROJECT:PASSWORD@aws-1... // try this?\n\n// RIGHT: Database agent provides correct connection pattern\n// Uses: scripts/lib/supabase-connection.js\n```\n\n**❌ Anti-Pattern 7: Ignoring Schema Conflicts**\n```javascript\n// WRONG: Proceeding despite \"table exists\" warnings\n// \"It says it already exists, let me just use it\"\n\n// RIGHT: Database agent investigates conflict and validates schema match\n```\n\n### Detection Rules\n\n**BLOCKED PATTERNS** (must use database agent instead):\n- Renaming tables to avoid conflicts\n- Adding IF NOT EXISTS without schema knowledge\n- Using SERVICE_ROLE_KEY to bypass RLS\n- Trial-and-error with connection strings\n- Multiple psql attempts without diagnosis\n- Modifying migrations after first failure\n- Proceeding with \"table exists\" warnings without validation\n\n**Evidence**: SD-AGENT-ADMIN-003 (schema mismatch), SD-1A (multiple schema issues), SD-041C (table conflict)\n**Impact**: Prevents 100% of workaround-related technical debt",
        "order_index": 2355
      },
      {
        "section_type": "quick-reference",
        "title": "Database Agent First-Responder Checklist",
        "content": "## ✅ Database Agent First-Responder Checklist\n\n**Problem**: Database work attempted without validation, leading to errors\n**Solution**: Proactive database agent invocation BEFORE attempting database work\n\n### BEFORE Attempting ANY Database Work\n\n**Pre-Database-Work Checklist** (MANDATORY):\n\n**Before PLANNING database work**:\n- [ ] Invoke database agent for schema review\n- [ ] Verify tables mentioned in PRD exist\n- [ ] Check for naming conflicts (existing tables)\n- [ ] Validate RLS policy requirements\n- [ ] Confirm correct database target (EHG vs EHG_Engineer)\n\n**Before EXECUTING database migrations**:\n- [ ] Database agent validated migration file\n- [ ] Schema conflicts identified and resolved\n- [ ] Connection helper pattern confirmed (`scripts/lib/supabase-connection.js`)\n- [ ] Rollback plan documented\n- [ ] Test environment validated\n\n**Before WRITING database queries**:\n- [ ] Database agent confirmed table schema\n- [ ] Column names verified (not assumed)\n- [ ] RLS policies understood\n- [ ] Query performance considerations reviewed\n\n**When in doubt**: ALWAYS invoke database agent FIRST\n\n### Integration Points\n\n**PLAN Phase (PRD Creation)**:\n```markdown\n## PLAN Pre-EXEC Checklist (ENHANCED)\n\n### Database Dependencies ✅\n- [ ] **FIRST**: Invoke database agent for schema validation\n- [ ] Identify all data dependencies in PRD\n- [ ] Verify tables/columns exist OR create migration plan\n- [ ] Document database agent findings in PLAN→EXEC handoff\n- [ ] If ANY issues found: Escalate to LEAD with database agent report\n```\n\n**EXEC Phase (Implementation)**:\n```markdown\n## EXEC Pre-Implementation Checklist (NEW)\n\n### Database Operations ✅\n- [ ] If SD involves database work: Database agent invoked? YES/NO\n- [ ] Schema validation complete: YES/NO\n- [ ] Migration safety confirmed: YES/NO\n- [ ] Connection pattern verified: YES/NO\n- [ ] RLS policies designed: YES/NO (if needed)\n```\n\n**Success Pattern Examples**:\n- SD-041C: Database agent identified table conflict early, proper rename implemented\n- SD-BACKEND-002C: Database agent provided migration pattern, 45-minute execution success\n- SD-AGENT-ADMIN-003: Database agent caught trigger function schema mismatch before deployment\n\n**Evidence**: 12 success patterns from proactive database agent usage\n**Impact**: Zero schema conflicts, 100% migration success rate when database agent used first",
        "order_index": 2356
      },
      {
        "section_type": "quick-reference",
        "title": "Database Agent Integration Requirements",
        "content": "## 🔧 Database Agent Integration Requirements\n\n**Problem**: Database agent treated as last resort instead of first responder\n**Solution**: Mandatory integration at key workflow checkpoints\n\n### Mandatory Invocation Points\n\n**LEAD Pre-Approval Phase**:\n- IF SD mentions: database, migration, schema, table, RLS, SQL, Postgres\n- THEN: Database agent included in parallel sub-agent execution\n- ```bash\n  node lib/sub-agent-executor.js DATABASE <SD-ID>\n  ```\n\n**PLAN PRD Creation Phase**:\n- Database agent runs FIRST for any SD with data dependencies\n- Validates schema before creating PRD\n- Documents table existence, RLS requirements, migration needs\n- BLOCKS PRD creation if critical database issues found\n\n**EXEC Implementation Phase**:\n- Database agent validates schema BEFORE implementation starts\n- Consulted for ANY database error encountered\n- Provides migration patterns and connection helpers\n- Reviews database changes before commit\n\n**PLAN Verification Phase**:\n- Database agent verifies migrations executed correctly\n- Validates schema matches documentation\n- Confirms RLS policies working as designed\n\n### Behavior Change Summary\n\n**Before (Anti-Pattern)**:\n1. Agent encounters database error\n2. Agent tries manual fix / workaround\n3. Fix fails or creates technical debt\n4. User intervenes: \"Use database agent!\"\n5. Database agent called\n6. Proper solution found (finally)\n\n**After (First-Responder Pattern)**:\n1. Agent encounters database task OR database error\n2. Agent IMMEDIATELY invokes database agent\n3. Database agent diagnoses root cause\n4. Proper solution implemented (first try)\n5. No workarounds, no technical debt\n\n### Success Metrics\n\n- **Zero workaround attempts** when database errors occur\n- **100% database agent usage** for migration work\n- **90% reduction** in user reminders to use database agent\n- **Zero schema mismatch errors** through proactive validation\n- **Faster database operations** (no trial-and-error)\n\n### Key Principle\n\n**DATABASE-FIRST CULTURE**: Database agent is a FIRST RESPONDER, not a LAST RESORT.\n\n**Evidence**: User feedback: \"I constantly have to remind that we should use the database subagent\"\n**Impact**: Eliminates need for manual reminders, establishes proactive database expertise",
        "order_index": 2357
      },
      {
        "section_type": "quick-reference",
        "title": "Validation Agent Mandatory Gates",
        "content": "## 🛡️ Validation Agent Mandatory Gates\n\n**Problem**: Validation skipped or deferred, causing late-stage rework (4-6 hours per SD)\n**Solution**: Mandatory validation gates at key workflow checkpoints with blocking enforcement\n\n### Four Mandatory Validation Gates\n\n**GATE 1: LEAD Pre-Approval** (BLOCKING)\n- [ ] **Duplicate Check**: Does this already exist in codebase?\n- [ ] **Infrastructure Check**: Can we reuse existing components/patterns?\n- [ ] **Backlog Validation**: Are user requirements documented? (≥1 backlog item required)\n- [ ] **Claims Verification**: For UI/UX SDs, verify issues actually exist (code review)\n\n**Command**:\n```bash\nnode scripts/systems-analyst-codebase-audit.js <SD-ID>\n# OR via orchestration\nnode scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL <SD-ID>\n```\n\n**Blocks**: Cannot mark SD as 'active' until validation passes\n**Evidence**: SD-EXPORT-001 approved with 0 backlog items → scope creep risk\n\n---\n\n**GATE 2: PLAN PRD Creation** (BLOCKING)\n- [ ] **Schema Validation**: Do tables exist? Any conflicts?\n- [ ] **Route Validation**: Are routes available? Any conflicts?\n- [ ] **Test Infrastructure Validation**: Is test environment ready?\n- [ ] **Form Validation**: Are validation attributes needed for forms?\n- [ ] **Build Validation**: Do dependencies exist? Can project build?\n\n**Command**:\n```bash\nnode lib/sub-agent-executor.js VALIDATION <SD-ID>\n```\n\n**Blocks**: Cannot create PLAN→EXEC handoff until validation passes\n**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures\n\n---\n\n**GATE 3: EXEC Pre-Implementation** (BLOCKING)\n- [ ] **Application Verification**: Correct app? (`/mnt/c/_EHG/ehg/` vs `/mnt/c/_EHG/EHG_Engineer/`)\n- [ ] **Build Validation**: Does `npm run build` succeed?\n- [ ] **Environment Validation**: Correct database connection?\n- [ ] **Protocol Compliance**: Following LEO 5-phase workflow?\n- [ ] **Dependencies Validation**: All `npm install` complete?\n\n**Command**:\n```bash\n# Automated during EXEC pre-implementation checklist\nnpm run type-check && npm run build:skip-checks\n```\n\n**Blocks**: Cannot start implementation until environment validated\n**Evidence**: Multiple \"wrong directory\" errors before pre-verification checklist\n\n---\n\n**GATE 4: PLAN Verification** (BLOCKING)\n- [ ] **Handoff Completeness**: All 7 handoff elements present?\n- [ ] **Test Validation**: Unit tests AND E2E tests both passing?\n- [ ] **Documentation Validation**: Generated docs exist?\n- [ ] **Protocol Compliance**: All phases followed correctly?\n- [ ] **CI/CD Validation**: GitHub Actions green?\n\n**Command**:\n```bash\nnode scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>\n```\n\n**Blocks**: Cannot create PLAN→LEAD handoff until validation passes\n**Evidence**: SD-EVA-MEETING-001 - No user story validation enforcement\n\n---\n\n### Enforcement Mechanism\n\n**Database Constraint Example**:\n```sql\n-- Cannot mark SD active without backlog items\nALTER TABLE strategic_directives_v2\nADD CONSTRAINT require_backlog_for_active\nCHECK (status != 'active' OR (\n  SELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = id\n) > 0);\n```\n\n**Auto-Trigger Pattern**:\n- Phase transition detected → Validation agent runs automatically\n- Validation fails → Progress BLOCKED, escalate to LEAD\n- Validation passes → Proceed to next phase\n\n**Manual Override** (Last Resort):\n- Requires LEAD approval\n- Must document justification\n- Creates technical debt ticket\n\n**Evidence**: 74 retrospectives, 12 improvement areas where validation missing\n**Impact**: Prevents 4-6 hours rework per SD through early validation",
        "order_index": 2358
      },
      {
        "section_type": "quick-reference",
        "title": "Validation Enforcement Patterns",
        "content": "## 🔒 Validation Enforcement Patterns\n\n**Problem**: Validation is optional, can be bypassed, leading to late discovery\n**Solution**: Automated enforcement mechanisms that BLOCK progress on validation failures\n\n### Three Enforcement Layers\n\n**Layer 1: Database Constraints** (Cannot Bypass)\n```sql\n-- Example 1: Require backlog items before active status\nALTER TABLE strategic_directives_v2\nADD CONSTRAINT require_backlog_for_active\nCHECK (status != 'active' OR EXISTS (\n  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id\n));\n\n-- Example 2: Require PRD before implementation\nALTER TABLE strategic_directives_v2\nADD CONSTRAINT require_prd_before_implementation\nCHECK (status NOT IN ('in_progress', 'completed') OR EXISTS (\n  SELECT 1 FROM product_requirements_v2 WHERE strategic_directive_id = strategic_directives_v2.id\n));\n\n-- Example 3: Require retrospective before completion\nALTER TABLE strategic_directives_v2\nADD CONSTRAINT require_retrospective_for_completion\nCHECK (status != 'completed' OR EXISTS (\n  SELECT 1 FROM retrospectives WHERE sd_id = strategic_directives_v2.id\n));\n```\n\n**Benefit**: Database prevents invalid state transitions, no workarounds possible\n\n---\n\n**Layer 2: Auto-Trigger Validation** (Automatic Execution)\n\n**Phase Transition Triggers**:\n```javascript\n// Example: When SD status changes to 'active'\nCREATE TRIGGER validate_on_active\nBEFORE UPDATE ON strategic_directives_v2\nFOR EACH ROW\nWHEN (OLD.status != 'active' AND NEW.status = 'active')\nEXECUTE FUNCTION run_lead_pre_approval_validation();\n\n// Function executes validation agent automatically\nCREATE FUNCTION run_lead_pre_approval_validation()\nRETURNS TRIGGER AS $$\nBEGIN\n  -- Check backlog exists\n  IF NOT EXISTS (SELECT 1 FROM sd_backlog_map WHERE sd_id = NEW.id) THEN\n    RAISE EXCEPTION 'Cannot activate SD: No backlog items found. Add requirements first.';\n  END IF;\n\n  -- Log validation execution\n  INSERT INTO sub_agent_execution_results (sd_id, sub_agent_code, verdict)\n  VALUES (NEW.id, 'VALIDATION', 'PASS');\n\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n```\n\n**Benefit**: Validation runs automatically, humans don't need to remember\n\n---\n\n**Layer 3: Script-Level Gate Blocking** (Orchestration)\n\n**Handoff Creation Scripts**:\n```javascript\n// Example: scripts/unified-handoff-system.js\n\nasync function createHandoff(type, sd_id) {\n  // MANDATORY: Run validation before creating handoff\n  if (type === 'PLAN-to-EXEC') {\n    console.log('Running schema validation before handoff...');\n    const validation = await executeSubAgent('VALIDATION', sd_id);\n\n    if (validation.verdict !== 'PASS') {\n      console.error('❌ BLOCKED: Schema validation failed');\n      console.error('Issues:', validation.issues);\n      console.error('Cannot create PLAN→EXEC handoff until resolved');\n      process.exit(1); // BLOCK\n    }\n  }\n\n  // Validation passed, proceed with handoff creation\n  await createHandoffRecord(type, sd_id);\n}\n```\n\n**Benefit**: Scripts enforce validation at key integration points\n\n---\n\n### Validation Failure Response Protocol\n\n**When Validation Fails**:\n\n1. **STOP**: Do not proceed with current action\n2. **LOG**: Record validation failure in `sub_agent_execution_results`\n3. **NOTIFY**: Alert user with specific failure details\n4. **DOCUMENT**: Create issue in tracking system\n5. **ESCALATE**: If critical, escalate to LEAD for decision\n\n**Example Failure Message**:\n```\n❌ VALIDATION FAILED: Cannot mark SD-EXPORT-001 as active\n\nReason: No backlog items found\nExpected: ≥1 backlog item documenting user requirements\nFound: 0 backlog items\n\nAction Required:\n1. Review SD scope and identify user requirements\n2. Add backlog items to sd_backlog_map table\n3. Retry status change\n\nValidation Agent: node scripts/systems-analyst-codebase-audit.js SD-EXPORT-001\n```\n\n---\n\n### Manual Override Process (Exception Handling)\n\n**When Override Needed**:\n- Exceptional circumstances only\n- Infrastructure/protocol SDs where normal rules don't apply\n- Emergency production fixes\n\n**Override Steps**:\n1. Document justification in SD description\n2. Get LEAD approval (recorded in comments)\n3. Create technical debt ticket\n4. Add to retrospective for pattern review\n\n**Override Example**:\n```sql\n-- Temporarily disable constraint for infrastructure SD\nALTER TABLE strategic_directives_v2 DISABLE TRIGGER validate_on_active;\n\n-- Perform operation\nUPDATE strategic_directives_v2 SET status = 'active' WHERE id = 'SD-INFRA-001';\n\n-- Re-enable constraint (MANDATORY)\nALTER TABLE strategic_directives_v2 ENABLE TRIGGER validate_on_active;\n\n-- Document override\nINSERT INTO sd_comments (sd_id, comment_type, content)\nVALUES ('SD-INFRA-001', 'override', 'Manual override: Infrastructure SD, no user-facing requirements');\n```\n\n**Caution**: Overrides create precedent. Use sparingly, document thoroughly.\n\n---\n\n### Success Metrics\n\n**From Validation Enforcement**:\n- **Zero SDs approved without backlog** (constraint prevents it)\n- **100% duplicate check rate** (auto-trigger on status change)\n- **50% reduction in late-stage rework** (caught at gates)\n- **4-6 hours saved per SD** (early validation vs late discovery)\n\n**Evidence**: SD-EXPORT-001 had 0 backlog items, proceeded anyway → scope creep risk\n**Solution**: Database constraint would have BLOCKED this\n**Impact**: Prevents moving forward without requirements",
        "order_index": 2359
      },
      {
        "section_type": "quick-reference",
        "title": "Validation Agent Proactive Invocation Checklist",
        "content": "## ✅ Validation Agent Proactive Invocation Checklist\n\n**Problem**: Validation remembered only after problems discovered\n**Solution**: Comprehensive checklist for each phase with MANDATORY items\n\n### LEAD Phase Checklist (Pre-Approval)\n\n**Before Approving ANY SD** (MANDATORY):\n\n**Duplicate Check** ✅:\n```bash\n# Search for existing implementations\nnode scripts/systems-analyst-codebase-audit.js <SD-ID>\n\n# Manual verification if needed\ngrep -r \"feature name\" /mnt/c/_EHG/ehg/src\nfind /mnt/c/_EHG/ehg/src -name \"*ComponentName*\"\n```\n\n**Infrastructure Check** ✅:\n- [ ] Similar feature exists? (can reuse 8-10 hours saved)\n- [ ] Existing auth patterns? (Supabase Auth vs custom)\n- [ ] Existing database patterns? (tables, migrations, RLS)\n- [ ] Existing UI components? (shadcn, shared components)\n\n**Backlog Validation** ✅:\n```sql\n-- Check backlog items exist\nSELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = 'SD-XXX';\n-- Must be > 0 before marking active\n```\n\n**Claims Verification** ✅ (For UI/UX SDs):\n```bash\n# Read actual source code, don't trust claims\n# Example from SD-UAT-002: 3/5 claimed issues didn't exist\ngrep -A 10 -B 10 \"claimed issue\" /mnt/c/_EHG/ehg/src/component.tsx\n```\n\n**Evidence**: SD-UAT-002 - Code review saved 3-4 hours by rejecting false claims\n\n---\n\n### PLAN Phase Checklist (PRD Creation)\n\n**Before Creating PRD** (MANDATORY):\n\n**Schema Validation** ✅:\n```bash\n# If PRD mentions tables/columns, validate they exist\nnode lib/sub-agent-executor.js DATABASE <SD-ID>\n\n# Or query directly\nnode -e \"\nconst { createDatabaseClient } = require('./scripts/lib/supabase-connection.js');\n(async () => {\n  const client = await createDatabaseClient('ehg');\n  const { rows } = await client.query(\\\"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%keyword%'\\\");\n  console.log('Tables found:', rows.length);\n})();\n\"\n```\n\n**Route Validation** ✅:\n- [ ] Routes mentioned in PRD exist in routing config?\n- [ ] No conflicts with existing routes?\n- [ ] Authentication requirements clear?\n\n**Test Infrastructure Validation** ✅:\n```bash\n# Verify test environment ready\nnpm run test:unit --version\nnpm run test:e2e -- --version\n\n# Check test databases accessible\nnode -e \"require('dotenv').config(); console.log('Test DB:', process.env.TEST_DATABASE_URL ? 'Configured' : 'Missing');\"\n```\n\n**Form Validation** ✅ (If forms involved):\n- [ ] Validation rules documented in PRD?\n- [ ] Required vs optional fields clear?\n- [ ] Error message patterns defined?\n\n**Build Validation** ✅:\n```bash\n# Ensure project builds before implementation starts\nnpm run type-check\nnpm run lint\nnpm run build:skip-checks\n```\n\n**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures\n\n---\n\n### EXEC Phase Checklist (Pre-Implementation)\n\n**Before Writing ANY Code** (MANDATORY):\n\n**Application Verification** ✅:\n```bash\n# Confirm correct application\ncd /mnt/c/_EHG/ehg && pwd\n# Expected: /mnt/c/_EHG/ehg (NOT EHG_Engineer!)\n\n# Confirm correct repository\ngit remote -v\n# Expected: origin  https://github.com/rickfelix/ehg.git\n```\n\n**Build Validation** ✅:\n```bash\n# Verify build works before making changes\nnpm run build:skip-checks\n# If fails: Fix build issues before implementing new features\n```\n\n**Environment Validation** ✅:\n```bash\n# Verify database connection\nnode -e \"\nconst { createClient } = require('@supabase/supabase-js');\nrequire('dotenv').config();\nconst supabase = createClient(process.env.EHG_SUPABASE_URL, process.env.EHG_SUPABASE_ANON_KEY);\nsupabase.from('users').select('count').limit(1).then(r => console.log('DB:', r.error ? 'FAIL' : 'OK'));\n\"\n\n# Verify dev server port available\nlsof -i :5173 || echo \"Port 5173 available\"\n```\n\n**Protocol Compliance** ✅:\n- [ ] Following LEO 5-phase workflow?\n- [ ] PLAN→EXEC handoff reviewed?\n- [ ] PRD requirements understood?\n- [ ] User stories mapped to tests?\n\n**Dependencies Validation** ✅:\n```bash\n# Verify node_modules up to date\nnpm ci  # Use ci for clean install\nnpm audit  # Check for vulnerabilities\n```\n\n**Evidence**: Pre-verification checklist eliminated \"wrong directory\" errors\n\n---\n\n### PLAN Verification Phase Checklist\n\n**Before Creating PLAN→LEAD Handoff** (MANDATORY):\n\n**Handoff Completeness** ✅:\n- [ ] All 7 handoff elements present?\n  1. Executive Summary\n  2. Completeness Report\n  3. Deliverables Manifest\n  4. Key Decisions & Rationale\n  5. Known Issues & Risks\n  6. Resource Utilization\n  7. Action Items for Receiver\n\n**Test Validation** ✅:\n```bash\n# Both test types MANDATORY\nnpm run test:unit  # Business logic\nnpm run test:e2e   # User flows\n\n# Verify 100% user story coverage\n# Every US-XXX must have ≥1 E2E test\n```\n\n**Documentation Validation** ✅:\n```bash\n# Check generated documentation exists\nls -la generated_docs/<SD-ID>-*.md\n# If missing: Run documentation generator\n```\n\n**Protocol Compliance** ✅:\n- [ ] All phases completed in order?\n- [ ] All sub-agents executed?\n- [ ] All handoffs created?\n\n**CI/CD Validation** ✅:\n```bash\n# Verify GitHub Actions green\ngh run list --limit 5\ngh run view <run-id>  # If any failed\n```\n\n**Evidence**: SD-EVA-MEETING-001 - No user story validation enforcement led to mismatches\n\n---\n\n### Quick Reference\n\n| Phase | Validation Type | Command | Blocking? |\n|-------|----------------|---------|-----------|\n| LEAD | Duplicate Check | `systems-analyst-codebase-audit.js` | ✅ YES |\n| LEAD | Backlog Validation | `SELECT COUNT FROM sd_backlog_map` | ✅ YES |\n| PLAN | Schema Validation | `sub-agent-executor.js DATABASE` | ✅ YES |\n| PLAN | Build Validation | `npm run build:skip-checks` | ✅ YES |\n| EXEC | App Verification | `pwd && git remote -v` | ✅ YES |\n| PLAN | Test Validation | `npm run test:unit && test:e2e` | ✅ YES |\n\n**Remember**: Validation is MANDATORY, not optional. Gates BLOCK progress on failures.",
        "order_index": 2360
      },
      {
        "section_type": "quick-reference",
        "title": "Validation Failure Patterns to Avoid",
        "content": "## ⚠️ Validation Failure Patterns to Avoid\n\n**Problem**: Common anti-patterns where validation skipped or ignored\n**Solution**: Recognize these patterns and invoke validation agent instead\n\n### Anti-Pattern 1: \"We'll Validate Later\"\n\n**What It Looks Like**:\n```\nLEAD: \"Let's approve the SD, we can check for duplicates during PLAN phase\"\nPLAN: \"Let's create the PRD, we can validate schema during EXEC\"\nEXEC: \"Let's implement, we can validate during testing\"\nPLAN Verify: \"Tests failing, now discovering issues that should have been caught earlier\"\n```\n\n**Why It's Wrong**:\n- Validation delayed = issues discovered late\n- 4-6 hours rework required\n- Scope creep risk increases\n- Technical debt accumulates\n\n**Right Approach**:\n```\nLEAD: \"Before approval, let's run validation agent\"\n→ node scripts/systems-analyst-codebase-audit.js <SD-ID>\n→ Discover duplicate implementation exists\n→ Reject SD or pivot to enhancement of existing feature\n→ 8-10 hours saved\n```\n\n**Evidence**: SD-UAT-020 - Discovered existing Supabase Auth during implementation, should have caught during LEAD approval\n\n---\n\n### Anti-Pattern 2: \"Assume It Doesn't Exist\"\n\n**What It Looks Like**:\n```\nUser: \"We need authentication for this feature\"\nAgent: \"I'll build a custom auth system\"\n[2 days later]\nUser: \"Why didn't you use existing Supabase Auth?\"\nAgent: \"I didn't know it existed\"\n```\n\n**Why It's Wrong**:\n- Duplicates existing functionality\n- Wastes 8-10 hours\n- Creates maintenance burden (two auth systems)\n- Increases security risk (custom auth = more vulnerabilities)\n\n**Right Approach**:\n```bash\n# BEFORE designing solution, search for existing\nnode scripts/systems-analyst-codebase-audit.js <SD-ID>\n\n# Manual search if needed\ngrep -r \"authentication|auth|login\" /mnt/c/_EHG/ehg/src\nfind /mnt/c/_EHG/ehg/src -name \"*auth*\"\n\n# Check both applications\ngrep -r \"authentication\" /mnt/c/_EHG/EHG_Engineer/src\n```\n\n**Evidence**: SD-UAT-020 retrospective explicitly mentions this pattern\n\n---\n\n### Anti-Pattern 3: \"Approve Without Backlog\"\n\n**What It Looks Like**:\n```sql\n-- SD marked as 'active'\nSELECT * FROM strategic_directives_v2 WHERE id = 'SD-EXPORT-001';\n-- status: active\n\n-- Check backlog items\nSELECT COUNT(*) FROM sd_backlog_map WHERE sd_id = 'SD-EXPORT-001';\n-- Result: 0\n\n-- Risk: Moving forward without user requirements = scope creep\n```\n\n**Why It's Wrong**:\n- No documented user requirements\n- Implementation based on assumptions\n- Scope creep highly likely\n- Cannot validate against actual needs\n\n**Right Approach**:\n```sql\n-- Database constraint prevents this\nALTER TABLE strategic_directives_v2\nADD CONSTRAINT require_backlog_for_active\nCHECK (status != 'active' OR EXISTS (\n  SELECT 1 FROM sd_backlog_map WHERE sd_id = strategic_directives_v2.id\n));\n\n-- Now attempting to mark active without backlog:\nUPDATE strategic_directives_v2 SET status = 'active' WHERE id = 'SD-XXX';\n-- ERROR: new row violates check constraint \"require_backlog_for_active\"\n-- BLOCKED until backlog items added\n```\n\n**Evidence**: SD-EXPORT-001 had 0 backlog items when approved (failure pattern)\n\n---\n\n### Anti-Pattern 4: \"Trust Claims Without Verification\"\n\n**What It Looks Like**:\n```\nSD Description: \"Dashboard has 5 critical UI issues:\n1. Issue A (doesn't work)\n2. Issue B (broken)\n3. Issue C (missing feature)\n4. Issue D (wrong behavior)\n5. Issue E (performance problem)\"\n\nLEAD: \"Sounds reasonable, approved\"\n\n[EXEC reads actual code]\nEXEC: \"Issues A, C, E don't exist in the code. Only B and D are real.\"\n```\n\n**Why It's Wrong**:\n- 3/5 claims false = 60% wasted effort\n- Implementation addresses non-existent issues\n- Real issues might be missed\n- 3-4 hours wasted on unnecessary work\n\n**Right Approach**:\n```bash\n# LEAD code review for UI/UX SDs (MANDATORY)\n# Read actual source code\ncat /mnt/c/_EHG/ehg/src/components/Dashboard.tsx | grep -A 10 \"Issue A description\"\n\n# Verify each claim\nfor issue in A B C D E; do\n  echo \"Verifying Issue $issue:\"\n  grep -n \"relevant code pattern\" /path/to/component.tsx\ndone\n```\n\n**Evidence**: SD-UAT-002 - LEAD code review rejected 3/5 false claims, saved 3-4 hours\n\n---\n\n### Anti-Pattern 5: \"Skip Test Environment Validation\"\n\n**What It Looks Like**:\n```bash\n# EXEC starts implementation\nnpm run test:unit\n# Error: Test database not configured\n\n# Or\nnpm run test:e2e\n# Error: Playwright not installed\n\n# Or\nnpm run build\n# Error: Missing dependency\n```\n\n**Why It's Wrong**:\n- Discovers environment issues during implementation\n- Blocks progress unexpectedly\n- Wastes time troubleshooting environment\n- Should have been caught during PLAN phase\n\n**Right Approach**:\n```bash\n# PLAN phase pre-flight checks (MANDATORY)\n\n# Check test databases\nnode -e \"require('dotenv').config(); console.log('Unit Test DB:', process.env.TEST_DATABASE_URL ? 'OK' : 'MISSING');\"\n\n# Check test frameworks\nnpm run test:unit -- --version || echo \"Unit tests not configured\"\nnpm run test:e2e -- --version || echo \"E2E tests not configured\"\n\n# Check build\nnpm run build:skip-checks || echo \"Build fails, fix before EXEC\"\n\n# BLOCK PLAN→EXEC handoff if any fail\n```\n\n**Evidence**: SD-AGENT-ADMIN-002 - Missing pre-flight checks caused test failures\n\n---\n\n### Anti-Pattern 6: \"No User Story Validation\"\n\n**What It Looks Like**:\n```\nPRD: \"12 user stories defined\"\n\n[EXEC implements features]\n\nPLAN Verify: \"Running E2E tests\"\nE2E Tests: \"0 tests found matching user story pattern\"\n\nIssue: User stories not mapped to tests\nResult: Cannot verify implementation meets requirements\n```\n\n**Why It's Wrong**:\n- User stories disconnected from tests\n- Cannot prove requirements met\n- Manual verification required (time-consuming)\n- Acceptance criteria unclear\n\n**Right Approach**:\n```bash\n# PLAN phase validation (MANDATORY)\n# Check user story → E2E test mapping\n\n# Query user stories\nnode -e \"\nconst { createClient } = require('@supabase/supabase-js');\nconst supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);\nsupabase.from('user_stories').select('id').eq('strategic_directive_id', 'SD-XXX')\n  .then(r => console.log('User stories:', r.data.length));\n\"\n\n# Check E2E tests\ngrep -r \"US-[0-9]\\+\" /mnt/c/_EHG/ehg/tests/e2e/*.spec.ts | wc -l\n\n# Validate 100% coverage\n# Every user story MUST have ≥1 E2E test\n```\n\n**Evidence**: SD-EVA-MEETING-001 - No enforcement of user story validation\n\n---\n\n### Detection Rules\n\n**If you see these patterns, STOP and validate**:\n\n1. **\"Let's skip validation for now\"** → NO, validate immediately\n2. **\"I'll search for duplicates later\"** → NO, search now\n3. **\"We can add backlog items later\"** → NO, add before approval\n4. **\"Claims sound reasonable\"** → NO, verify with code review\n5. **\"Environment probably works\"** → NO, validate pre-flight\n6. **\"Tests cover the features\"** → NO, verify US-XXX mapping\n7. **\"Schema probably exists\"** → NO, query database to confirm\n\n---\n\n### Success Stories (When Validation Used Properly)\n\n**Success 1: Early Duplicate Detection** (SD-UAT-020)\n- Validation agent found existing Supabase Auth during LEAD approval\n- Pivoted from \"build custom auth\" to \"use existing\"\n- **8-10 hours saved**\n\n**Success 2: Code Review Catches False Claims** (SD-UAT-002)\n- LEAD code review validated 5 claimed UI issues\n- Found 3/5 didn't exist in actual code\n- Rejected false claims, focused on real issues\n- **3-4 hours saved**\n\n**Success 3: Three-Checkpoint Validation** (SD-EVA-MEETING-001)\n- QA validation + Handoff validation + Auto-trigger\n- Caught issues at multiple gates\n- **Early error detection**\n\n---\n\n### Quick Reference\n\n| Anti-Pattern | Right Approach | Evidence |\n|--------------|---------------|----------|\n| \"Validate later\" | Validate at gate | 4-6 hrs saved |\n| \"Assume doesn't exist\" | Search first | 8-10 hrs saved (SD-UAT-020) |\n| \"Approve without backlog\" | Enforce constraint | SD-EXPORT-001 failure |\n| \"Trust claims\" | Code review | 3-4 hrs saved (SD-UAT-002) |\n| \"Skip environment check\" | Pre-flight validation | SD-AGENT-ADMIN-002 |\n| \"No US validation\" | 100% mapping | SD-EVA-MEETING-001 |\n\n**Remember**: Validation failures are caught cheaply at gates, expensively during implementation.",
        "order_index": 2361
      }
    ]
  }
]
```

### Schema: `agent_coordination_state`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| coordination_id | text | NO | NULL |
| sd_id | text | YES | NULL |
| prd_id | text | YES | NULL |
| phase | text | YES | NULL |
| current_state | text | NO | NULL |
| active_agents | ARRAY | YES | NULL |
| completed_agents | ARRAY | YES | NULL |
| pending_agents | ARRAY | YES | NULL |
| failed_agents | ARRAY | YES | NULL |
| consensus_required | boolean | YES | false |
| consensus_threshold | double precision | YES | 0.8 |
| votes | jsonb | YES | NULL |
| consensus_reached | boolean | YES | NULL |
| checkpoint_data | jsonb | YES | NULL |
| last_checkpoint | timestamp without time zone | YES | NULL |
| started_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |
| completed_at | timestamp without time zone | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49678_1_not_null | CHECK | - | - |
| 2200_49678_2_not_null | CHECK | - | - |
| 2200_49678_6_not_null | CHECK | - | - |
| agent_coordination_state_current_state_check | CHECK | - | agent_coordination_state(current_state) |
| agent_coordination_state_pkey | PRIMARY KEY | id | agent_coordination_state(id) |
| agent_coordination_state_coordination_id_key | UNIQUE | coordination_id | agent_coordination_state(coordination_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_agent_coordination_state | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_agent_coordination_state | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_events`

**Row Count**: 22

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| event_id | text | NO | NULL |
| timestamp | timestamp without time zone | YES | now() |
| agent_code | text | NO | NULL |
| phase | text | YES | NULL |
| sd_id | text | YES | NULL |
| prd_id | text | YES | NULL |
| event_type | text | NO | NULL |
| action | text | NO | NULL |
| payload | jsonb | NO | NULL |
| target_agents | ARRAY | YES | NULL |
| priority | text | YES | NULL |
| requires_acknowledgment | boolean | YES | false |
| acknowledged_by | ARRAY | YES | NULL |
| responses | jsonb | YES | NULL |
| outcome | text | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49658_10_not_null | CHECK | - | - |
| 2200_49658_1_not_null | CHECK | - | - |
| 2200_49658_2_not_null | CHECK | - | - |
| 2200_49658_4_not_null | CHECK | - | - |
| 2200_49658_8_not_null | CHECK | - | - |
| 2200_49658_9_not_null | CHECK | - | - |
| agent_events_event_type_check | CHECK | - | agent_events(event_type) |
| agent_events_priority_check | CHECK | - | agent_events(priority) |
| agent_events_pkey | PRIMARY KEY | id | agent_events(id) |
| agent_events_event_id_key | UNIQUE | event_id | agent_events(event_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_agent_events | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_agent_events | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "e5a19f03-076d-429c-b87f-d61d79d6463e",
    "event_id": "evt_27fe33ab2ea25ddf",
    "timestamp": "2025-09-23T18:02:43.520Z",
    "agent_code": "VALIDATION",
    "phase": "LEAD_TO_PLAN",
    "sd_id": "test-sd-123",
    "prd_id": "test-prd-456",
    "event_type": "ANALYSIS_START",
    "action": "Beginning codebase validation",
    "payload": {
      "target": "src/components",
      "patterns": [
        "dashboard",
        "user interface"
      ]
    },
    "target_agents": [],
    "priority": "MEDIUM",
    "requires_acknowledgment": false,
    "acknowledged_by": null,
    "responses": null,
    "outcome": null
  },
  {
    "id": "11206e61-25fa-4da8-9f5d-a1f4edcc9d35",
    "event_id": "evt_f60d94f797e302e2",
    "timestamp": "2025-09-23T18:02:43.755Z",
    "agent_code": "VALIDATION",
    "phase": null,
    "sd_id": null,
    "prd_id": null,
    "event_type": "FINDING_DETECTED",
    "action": "Found existing dashboard implementation",
    "payload": {
      "type": "duplicate_implementation",
      "location": "src/client/src/components/Dashboard.jsx",
      "confidence": 0.95
    },
    "target_agents": [
      "LEAD",
      "PLAN"
    ],
    "priority": "HIGH",
    "requires_acknowledgment": false,
    "acknowledged_by": null,
    "responses": null,
    "outcome": null
  },
  {
    "id": "dcd33384-1800-432b-8980-057e63303b1d",
    "event_id": "evt_227c8c621155cf33",
    "timestamp": "2025-09-23T18:02:47.169Z",
    "agent_code": "VALIDATION",
    "phase": null,
    "sd_id": null,
    "prd_id": null,
    "event_type": "ANALYSIS_COMPLETE",
    "action": "Validation complete",
    "payload": {
      "totalFindings": 3,
      "criticalIssues": 1,
      "recommendation": "REVIEW_REQUIRED"
    },
    "target_agents": [],
    "priority": "HIGH",
    "requires_acknowledgment": true,
    "acknowledged_by": null,
    "responses": null,
    "outcome": null
  },
  {
    "id": "af4116cc-7da7-433c-889c-955161ef95ea",
    "event_id": "evt_b39fc466f919ec6a",
    "timestamp": "2025-09-23T18:02:47.228Z",
    "agent_code": "VALIDATION",
    "phase": null,
    "sd_id": null,
    "prd_id": null,
    "event_type": "CONSENSUS_REQUIRED",
    "action": "Consensus requested: Should we proceed with implementation given existing code?",
    "payload": {
      "options": [
        "PROCEED",
        "BLOCK",
        "MODIFY"
      ],
      "timeout": 5000,
      "question": "Should we proceed with implementation given existing code?",
      "threshold": 0.66,
      "consensusId": "consensus_239a1e7eefd2bd31",
      "requiredVotes": 3
    },
    "target_agents": [
      "LEAD",
      "PLAN",
      "SECURITY"
    ],
    "priority": "HIGH",
    "requires_acknowledgment": true,
    "acknowledged_by": null,
    "responses": null,
    "outcome": null
  },
  {
    "id": "642d07bc-2c2b-48fa-8123-9eaf8c4d28da",
    "event_id": "evt_058f42c6922d63da",
    "timestamp": "2025-09-23T18:03:28.145Z",
    "agent_code": "VALIDATION",
    "phase": "LEAD_TO_PLAN",
    "sd_id": "test-sd-123",
    "prd_id": "test-prd-456",
    "event_type": "ANALYSIS_START",
    "action": "Beginning codebase validation",
    "payload": {
      "target": "src/components",
      "patterns": [
        "dashboard",
        "user interface"
      ]
    },
    "target_agents": [],
    "priority": "MEDIUM",
    "requires_acknowledgment": false,
    "acknowledged_by": null,
    "responses": null,
    "outcome": null
  }
]
```

### Schema: `agent_execution_cache`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| cache_key | text | NO | NULL |
| agent_code | text | NO | NULL |
| operation_type | text | NO | NULL |
| result | jsonb | NO | NULL |
| metadata | jsonb | YES | NULL |
| ttl_seconds | integer | NO | NULL |
| created_at | timestamp without time zone | YES | now() |
| expires_at | timestamp without time zone | YES | NULL |
| hit_count | integer | YES | 0 |
| last_accessed | timestamp without time zone | YES | now() |
| invalidated | boolean | YES | false |
| invalidated_at | timestamp without time zone | YES | NULL |
| invalidation_reason | text | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49696_1_not_null | CHECK | - | - |
| 2200_49696_2_not_null | CHECK | - | - |
| 2200_49696_3_not_null | CHECK | - | - |
| 2200_49696_4_not_null | CHECK | - | - |
| 2200_49696_5_not_null | CHECK | - | - |
| 2200_49696_7_not_null | CHECK | - | - |
| agent_execution_cache_pkey | PRIMARY KEY | id | agent_execution_cache(id) |
| agent_execution_cache_cache_key_key | UNIQUE | cache_key | agent_execution_cache(cache_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_agent_execution_cache | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_agent_execution_cache | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "40f009ef-7a01-48c7-b2bd-0245556425ed",
    "cache_key": "5607aaab1b2fe071f933a4a63954c158226f0f9ad65b79d65ad3b1b6fbd9bb0f",
    "agent_code": "VALIDATION",
    "operation_type": "full_validation",
    "result": {
      "sd_id": "SD-GOVERNANCE-001",
      "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
      "validation_id": "VAL-1758635911886",
      "codebase_analysis": {
        "conflicts": {
          "severity": "NONE",
          "adjacent_features": [],
          "resolution_required": false
        },
        "architecture": {
          "violations": [],
          "compatibility": "ALIGNED",
          "refactoring_needed": false
        },
        "dependencies": {
          "risk_level": "NONE",
          "affected_count": 1,
          "breaking_changes": []
        },
        "existing_implementations": {
          "found": true,
          "locations": [
            {
              "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
              "term": "governance",
              "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
            },
            {
              "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
              "term": "governance",
              "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
            },
            {
              "file": "applications/APP001/codebase/app/governance/page.tsx",
              "term": "governance",
              "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
            },
            {
              "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
              "term": "governance",
              "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
            },
            {
              "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
              "term": "governance",
              "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
            },
            {
              "file": "applications/APP001/codebase/src/App.tsx",
              "term": "governance",
              "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
            },
            {
              "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
              "term": "governance",
              "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
            },
            {
              "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
              "term": "governance",
              "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
            },
            {
              "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
              "term": "governance",
              "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
            },
            {
              "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
              "term": "governance",
              "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
            }
          ],
          "recommendation": "USE_EXISTING",
          "similarity_score": 100
        }
      },
      "recommended_actions": [
        "Review existing implementation and consider enhancing instead of duplicating"
      ],
      "human_review_reasons": [
        "High similarity score (1240%) - possible duplicate implementation"
      ],
      "validation_timestamp": "2025-09-23T13:58:31.886Z",
      "human_review_required": true,
      "approval_recommendation": "BLOCKED"
    },
    "metadata": {
      "sd_id": "SD-GOVERNANCE-001",
      "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36"
    },
    "ttl_seconds": 1800,
    "created_at": "2025-09-23T17:58:47.230Z",
    "expires_at": "2025-09-23T18:28:47.230Z",
    "hit_count": 0,
    "last_accessed": "2025-09-23T17:58:47.230Z",
    "invalidated": false,
    "invalidated_at": null,
    "invalidation_reason": null
  },
  {
    "id": "92f6c640-5c3c-4678-af74-a4d01e8e8536",
    "cache_key": "1a0c81875f8b53a0ead360ec8c8738e5692bf91e9885f4bb248d5fbf5b3586bb",
    "agent_code": "VALIDATION",
    "operation_type": "full_validation",
    "result": {
      "sd_id": "test-sd-123",
      "prd_id": "test-prd-456",
      "validation_id": "VAL-1758636291090",
      "codebase_analysis": {
        "conflicts": {
          "severity": "NONE",
          "adjacent_features": [],
          "resolution_required": false
        },
        "architecture": {
          "violations": [
            {
              "issue": "Naming convention violation",
              "pattern": "naming-conventions",
              "recommendation": "Use PascalCase for components, camelCase for functions"
            }
          ],
          "compatibility": "MINOR_DEVIATION",
          "refactoring_needed": false
        },
        "dependencies": {
          "risk_level": "NONE",
          "affected_count": 0,
          "breaking_changes": []
        },
        "existing_implementations": {
          "found": false,
          "locations": [],
          "recommendation": "PROCEED_NEW",
          "similarity_score": 0
        }
      },
      "recommended_actions": [
        "No conflicts detected - proceed with implementation"
      ],
      "human_review_reasons": [],
      "validation_timestamp": "2025-09-23T14:04:51.090Z",
      "human_review_required": false,
      "approval_recommendation": "APPROVED"
    },
    "metadata": {
      "sd_id": "test-sd-123",
      "prd_id": "test-prd-456"
    },
    "ttl_seconds": 1800,
    "created_at": "2025-09-23T18:04:52.360Z",
    "expires_at": "2025-09-23T18:34:52.360Z",
    "hit_count": 0,
    "last_accessed": "2025-09-23T18:04:52.360Z",
    "invalidated": false,
    "invalidated_at": null,
    "invalidation_reason": null
  },
  {
    "id": "0d807448-1787-4eaf-b90e-bda2a9fe304f",
    "cache_key": "ded9665f3c1d37bbf00ece8487caa20895db1fb2f586b1e55e35d9998fa4e28f",
    "agent_code": "VALIDATION",
    "operation_type": "full_validation",
    "result": {
      "sd_id": "SD-GOVERNANCE-UI-001",
      "prd_id": null,
      "validation_id": "VAL-1758660343934",
      "codebase_analysis": {
        "conflicts": {
          "severity": "NONE",
          "adjacent_features": [],
          "resolution_required": false
        },
        "sd_overlaps": {
          "checked": true,
          "overlap_count": 0,
          "recommendation": "NO_ACTION",
          "critical_overlaps": [],
          "high_overlap_count": 0
        },
        "architecture": {
          "violations": [],
          "compatibility": "ALIGNED",
          "refactoring_needed": false
        },
        "dependencies": {
          "risk_level": "NONE",
          "affected_count": 0,
          "breaking_changes": []
        },
        "existing_implementations": {
          "found": true,
          "locations": [
            {
              "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
              "term": "governance",
              "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
            },
            {
              "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
              "term": "governance",
              "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
            },
            {
              "file": "applications/APP001/codebase/app/governance/page.tsx",
              "term": "governance",
              "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
            },
            {
              "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
              "term": "governance",
              "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
            },
            {
              "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
              "term": "governance",
              "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
            },
            {
              "file": "applications/APP001/codebase/src/App.tsx",
              "term": "governance",
              "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
            },
            {
              "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
              "term": "governance",
              "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
            },
            {
              "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
              "term": "governance",
              "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
            },
            {
              "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
              "term": "governance",
              "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
            },
            {
              "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
              "term": "governance",
              "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
            }
          ],
          "recommendation": "USE_EXISTING",
          "similarity_score": 100
        }
      },
      "recommended_actions": [
        "Review existing implementation and consider enhancing instead of duplicating"
      ],
      "human_review_reasons": [
        "High similarity score (860%) - possible duplicate implementation"
      ],
      "validation_timestamp": "2025-09-23T20:45:43.934Z",
      "human_review_required": true,
      "approval_recommendation": "BLOCKED"
    },
    "metadata": {
      "sd_id": "SD-GOVERNANCE-UI-001",
      "prd_id": null
    },
    "ttl_seconds": 1800,
    "created_at": "2025-09-24T00:46:02.653Z",
    "expires_at": "2025-09-24T01:16:02.653Z",
    "hit_count": 0,
    "last_accessed": "2025-09-24T00:46:02.653Z",
    "invalidated": false,
    "invalidated_at": null,
    "invalidation_reason": null
  }
]
```

### Schema: `agent_intelligence_insights`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_type | text | NO | NULL |
| insight_type | text | NO | NULL |
| insight_title | text | NO | NULL |
| insight_description | text | NO | NULL |
| insight_details | jsonb | YES | NULL |
| trigger_conditions | jsonb | YES | NULL |
| confidence_threshold | integer | YES | 70 |
| times_applied | integer | YES | 0 |
| positive_outcomes | integer | YES | 0 |
| negative_outcomes | integer | YES | 0 |
| effectiveness_rate | numeric | YES | NULL |
| source_pattern_ids | ARRAY | YES | NULL |
| source_outcomes | integer | YES | NULL |
| statistical_significance | numeric | YES | NULL |
| is_active | boolean | YES | true |
| last_applied | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_52370_1_not_null | CHECK | - | - |
| 2200_52370_2_not_null | CHECK | - | - |
| 2200_52370_3_not_null | CHECK | - | - |
| 2200_52370_4_not_null | CHECK | - | - |
| 2200_52370_5_not_null | CHECK | - | - |
| agent_intelligence_insights_agent_type_check | CHECK | - | agent_intelligence_insights(agent_type) |
| agent_intelligence_insights_insight_type_check | CHECK | - | agent_intelligence_insights(insight_type) |
| agent_intelligence_insights_pkey | PRIMARY KEY | id | agent_intelligence_insights(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| intelligence_insights_all | ALL | "{service_role}" | PERMISSIVE |
| intelligence_insights_select | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_knowledge_base`

**Row Count**: 5

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_code | text | NO | NULL |
| knowledge_type | text | YES | NULL |
| title | text | NO | NULL |
| content | jsonb | NO | NULL |
| tags | ARRAY | YES | NULL |
| confidence | double precision | YES | NULL |
| usage_count | integer | YES | 0 |
| last_used | timestamp without time zone | YES | NULL |
| related_sd_ids | ARRAY | YES | NULL |
| related_prd_ids | ARRAY | YES | NULL |
| related_knowledge_ids | ARRAY | YES | NULL |
| created_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |
| expires_at | timestamp without time zone | YES | NULL |
| is_active | boolean | YES | true |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49639_1_not_null | CHECK | - | - |
| 2200_49639_2_not_null | CHECK | - | - |
| 2200_49639_4_not_null | CHECK | - | - |
| 2200_49639_5_not_null | CHECK | - | - |
| agent_knowledge_base_confidence_check | CHECK | - | agent_knowledge_base(confidence) |
| agent_knowledge_base_knowledge_type_check | CHECK | - | agent_knowledge_base(knowledge_type) |
| agent_knowledge_base_pkey | PRIMARY KEY | id | agent_knowledge_base(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_agent_knowledge_base | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_agent_knowledge_base | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "0abe8fb5-f9bf-4c9f-83a3-1b91e5ff539a",
    "agent_code": "VALIDATION",
    "knowledge_type": "pattern",
    "title": "Dashboard Component Pattern",
    "content": {
      "pattern": "src/client/src/components/Dashboard",
      "description": "Standard dashboard component location"
    },
    "tags": [
      "ui",
      "dashboard",
      "components"
    ],
    "confidence": 0.95,
    "usage_count": 0,
    "last_used": null,
    "related_sd_ids": null,
    "related_prd_ids": null,
    "related_knowledge_ids": null,
    "created_at": "2025-09-23T17:58:12.689Z",
    "updated_at": "2025-09-23T17:58:12.689Z",
    "expires_at": null,
    "is_active": true
  },
  {
    "id": "f3a1ecbd-c04e-4a05-99e0-0238076c4642",
    "agent_code": "SECURITY",
    "knowledge_type": "rule",
    "title": "API Authentication Required",
    "content": {
      "rule": "All API endpoints must have authentication",
      "exceptions": [
        "health",
        "status"
      ]
    },
    "tags": [
      "api",
      "authentication",
      "security"
    ],
    "confidence": 1,
    "usage_count": 0,
    "last_used": null,
    "related_sd_ids": null,
    "related_prd_ids": null,
    "related_knowledge_ids": null,
    "created_at": "2025-09-23T17:58:12.689Z",
    "updated_at": "2025-09-23T17:58:12.689Z",
    "expires_at": null,
    "is_active": true
  },
  {
    "id": "ea2fdb58-f896-4297-adfd-92496d20f2c8",
    "agent_code": "DATABASE",
    "knowledge_type": "pattern",
    "title": "Migration File Pattern",
    "content": {
      "pattern": "database/migrations/*.sql",
      "description": "Database migration file location"
    },
    "tags": [
      "database",
      "migration",
      "schema"
    ],
    "confidence": 0.9,
    "usage_count": 0,
    "last_used": null,
    "related_sd_ids": null,
    "related_prd_ids": null,
    "related_knowledge_ids": null,
    "created_at": "2025-09-23T17:58:12.689Z",
    "updated_at": "2025-09-23T17:58:12.689Z",
    "expires_at": null,
    "is_active": true
  },
  {
    "id": "81221c8d-a53c-4622-939b-bd9598df908b",
    "agent_code": "VALIDATION",
    "knowledge_type": "pattern",
    "title": "High Similarity Implementation Pattern",
    "content": {
      "pattern": [
        {
          "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
          "term": "governance",
          "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
        },
        {
          "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
          "term": "governance",
          "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
        },
        {
          "file": "applications/APP001/codebase/app/governance/page.tsx",
          "term": "governance",
          "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
        },
        {
          "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
          "term": "governance",
          "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
        },
        {
          "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
          "term": "governance",
          "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
        }
      ],
      "similarity": 100,
      "recommendation": "USE_EXISTING"
    },
    "tags": [
      "duplicate",
      "implementation",
      "validation"
    ],
    "confidence": 0.9,
    "usage_count": 0,
    "last_used": null,
    "related_sd_ids": [
      "SD-GOVERNANCE-001"
    ],
    "related_prd_ids": [
      "c4c8a657-f0d3-4b67-a9b6-503715078e36"
    ],
    "related_knowledge_ids": null,
    "created_at": "2025-09-23T17:58:47.047Z",
    "updated_at": "2025-09-23T17:58:47.047Z",
    "expires_at": null,
    "is_active": true
  },
  {
    "id": "766bb77a-e06b-421e-90b1-ac2df3536c5e",
    "agent_code": "VALIDATION",
    "knowledge_type": "pattern",
    "title": "High Similarity Implementation Pattern",
    "content": {
      "pattern": [
        {
          "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
          "term": "governance",
          "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
        },
        {
          "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
          "term": "governance",
          "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
        },
        {
          "file": "applications/APP001/codebase/app/governance/page.tsx",
          "term": "governance",
          "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
        },
        {
          "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
          "term": "governance",
          "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
        },
        {
          "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
          "term": "governance",
          "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
        }
      ],
      "similarity": 100,
      "recommendation": "USE_EXISTING"
    },
    "tags": [
      "duplicate",
      "implementation",
      "validation"
    ],
    "confidence": 0.9,
    "usage_count": 0,
    "last_used": null,
    "related_sd_ids": [
      "SD-GOVERNANCE-UI-001"
    ],
    "related_prd_ids": [],
    "related_knowledge_ids": null,
    "created_at": "2025-09-24T00:46:02.548Z",
    "updated_at": "2025-09-24T00:46:02.548Z",
    "expires_at": null,
    "is_active": true
  }
]
```

### Schema: `agent_learning_outcomes`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | NO | NULL |
| lead_decision | text | YES | NULL |
| lead_confidence | integer | YES | NULL |
| lead_reasoning | text | YES | NULL |
| lead_decision_date | timestamp with time zone | YES | NULL |
| plan_decision | text | YES | NULL |
| plan_complexity_score | integer | YES | NULL |
| plan_technical_feasibility | text | YES | NULL |
| plan_implementation_risk | text | YES | NULL |
| plan_decision_date | timestamp with time zone | YES | NULL |
| exec_final_quality_score | integer | YES | NULL |
| exec_implementation_type | text | YES | NULL |
| exec_actual_complexity | integer | YES | NULL |
| exec_completion_date | timestamp with time zone | YES | NULL |
| business_outcome | text | YES | NULL |
| business_outcome_date | timestamp with time zone | YES | NULL |
| business_outcome_notes | text | YES | NULL |
| user_satisfaction_score | integer | YES | NULL |
| stakeholder_feedback | text | YES | NULL |
| production_issues_count | integer | YES | 0 |
| performance_meets_requirements | boolean | YES | NULL |
| security_issues_found | integer | YES | 0 |
| accessibility_compliance | boolean | YES | NULL |
| usage_adoption_rate | numeric | YES | NULL |
| business_kpi_impact | numeric | YES | NULL |
| roi_achieved | numeric | YES | NULL |
| project_tags | ARRAY | YES | NULL |
| complexity_factors | ARRAY | YES | NULL |
| success_factors | ARRAY | YES | NULL |
| failure_factors | ARRAY | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_52320_1_not_null | CHECK | - | - |
| 2200_52320_2_not_null | CHECK | - | - |
| agent_learning_outcomes_business_outcome_check | CHECK | - | agent_learning_outcomes(business_outcome) |
| agent_learning_outcomes_exec_actual_complexity_check | CHECK | - | agent_learning_outcomes(exec_actual_complexity) |
| agent_learning_outcomes_exec_final_quality_score_check | CHECK | - | agent_learning_outcomes(exec_final_quality_score) |
| agent_learning_outcomes_exec_implementation_type_check | CHECK | - | agent_learning_outcomes(exec_implementation_type) |
| agent_learning_outcomes_lead_confidence_check | CHECK | - | agent_learning_outcomes(lead_confidence) |
| agent_learning_outcomes_lead_decision_check | CHECK | - | agent_learning_outcomes(lead_decision) |
| agent_learning_outcomes_plan_complexity_score_check | CHECK | - | agent_learning_outcomes(plan_complexity_score) |
| agent_learning_outcomes_plan_decision_check | CHECK | - | agent_learning_outcomes(plan_decision) |
| agent_learning_outcomes_plan_implementation_risk_check | CHECK | - | agent_learning_outcomes(plan_implementation_risk) |
| agent_learning_outcomes_plan_technical_feasibility_check | CHECK | - | agent_learning_outcomes(plan_technical_feasibility) |
| agent_learning_outcomes_user_satisfaction_score_check | CHECK | - | agent_learning_outcomes(user_satisfaction_score) |
| agent_learning_outcomes_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| agent_learning_outcomes_pkey | PRIMARY KEY | id | agent_learning_outcomes(id) |
| agent_learning_outcomes_sd_id_key | UNIQUE | sd_id | agent_learning_outcomes(sd_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| intelligence_outcomes_all | ALL | "{service_role}" | PERMISSIVE |
| intelligence_outcomes_select | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_performance_metrics`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_code | character varying(50) | NO | NULL |
| agent_version | character varying(20) | NO | '1.0.0'::character varying |
| measurement_date | date | NO | CURRENT_DATE |
| measurement_window | character varying(20) | NO | 'daily'::character varying |
| total_executions | integer | NO | 0 |
| successful_executions | integer | NO | 0 |
| failed_executions | integer | NO | 0 |
| avg_execution_time | numeric | NO | 0.0 |
| max_execution_time | integer | NO | 0 |
| times_selected | integer | NO | 0 |
| avg_selection_confidence | numeric | NO | 0.0 |
| confidence_distribution | jsonb | YES | NULL |
| positive_feedback | integer | NO | 0 |
| negative_feedback | integer | NO | 0 |
| user_dismissals | integer | NO | 0 |
| top_trigger_patterns | jsonb | YES | NULL |
| context_effectiveness | jsonb | YES | NULL |
| works_well_with | jsonb | YES | NULL |
| coordination_success_rate | numeric | YES | NULL |
| recommended_min_confidence | numeric | YES | NULL |
| recommended_max_agents | integer | YES | NULL |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_106870_10_not_null | CHECK | - | - |
| 2200_106870_11_not_null | CHECK | - | - |
| 2200_106870_12_not_null | CHECK | - | - |
| 2200_106870_14_not_null | CHECK | - | - |
| 2200_106870_15_not_null | CHECK | - | - |
| 2200_106870_16_not_null | CHECK | - | - |
| 2200_106870_1_not_null | CHECK | - | - |
| 2200_106870_23_not_null | CHECK | - | - |
| 2200_106870_24_not_null | CHECK | - | - |
| 2200_106870_2_not_null | CHECK | - | - |
| 2200_106870_3_not_null | CHECK | - | - |
| 2200_106870_4_not_null | CHECK | - | - |
| 2200_106870_5_not_null | CHECK | - | - |
| 2200_106870_6_not_null | CHECK | - | - |
| 2200_106870_7_not_null | CHECK | - | - |
| 2200_106870_8_not_null | CHECK | - | - |
| 2200_106870_9_not_null | CHECK | - | - |
| agent_performance_metrics_pkey | PRIMARY KEY | id | agent_performance_metrics(id) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | measurement_date | agent_performance_metrics(measurement_date) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | measurement_date | agent_performance_metrics(agent_code) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | agent_code | agent_performance_metrics(measurement_window) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | agent_code | agent_performance_metrics(measurement_date) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | agent_code | agent_performance_metrics(agent_code) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | measurement_window | agent_performance_metrics(measurement_window) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | measurement_window | agent_performance_metrics(measurement_date) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | measurement_window | agent_performance_metrics(agent_code) |
| agent_performance_metrics_agent_code_measurement_date_measu_key | UNIQUE | measurement_date | agent_performance_metrics(measurement_window) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_agent_performance_metrics | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_agent_performance_metrics | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "e205deaa-0416-4e5c-8945-0b4c30797228",
    "agent_code": "TEST_AGENT",
    "agent_version": "1.0.0",
    "measurement_date": "2025-10-26T04:00:00.000Z",
    "measurement_window": "daily",
    "total_executions": 1,
    "successful_executions": 1,
    "failed_executions": 0,
    "avg_execution_time": "101.00",
    "max_execution_time": 101,
    "times_selected": 1,
    "avg_selection_confidence": "0.00",
    "confidence_distribution": null,
    "positive_feedback": 0,
    "negative_feedback": 0,
    "user_dismissals": 0,
    "top_trigger_patterns": null,
    "context_effectiveness": null,
    "works_well_with": null,
    "coordination_success_rate": null,
    "recommended_min_confidence": null,
    "recommended_max_agents": null,
    "created_at": "2025-10-26T18:57:30.336Z",
    "updated_at": "2025-10-26T18:57:30.336Z"
  },
  {
    "id": "c7a6b83e-d22b-4b1f-8f96-9b7c45a1361a",
    "agent_code": "SECURITY",
    "agent_version": "1.0.0",
    "measurement_date": "2025-10-26T04:00:00.000Z",
    "measurement_window": "daily",
    "total_executions": 2,
    "successful_executions": 2,
    "failed_executions": 0,
    "avg_execution_time": "801.50",
    "max_execution_time": 802,
    "times_selected": 2,
    "avg_selection_confidence": "0.00",
    "confidence_distribution": null,
    "positive_feedback": 0,
    "negative_feedback": 0,
    "user_dismissals": 0,
    "top_trigger_patterns": null,
    "context_effectiveness": null,
    "works_well_with": null,
    "coordination_success_rate": null,
    "recommended_min_confidence": null,
    "recommended_max_agents": null,
    "created_at": "2025-10-26T19:04:40.790Z",
    "updated_at": "2025-10-26T19:30:07.784Z"
  },
  {
    "id": "d905d763-925a-4572-a136-0127a0f2096b",
    "agent_code": "VALIDATION",
    "agent_version": "1.0.0",
    "measurement_date": "2025-10-26T04:00:00.000Z",
    "measurement_window": "daily",
    "total_executions": 2,
    "successful_executions": 2,
    "failed_executions": 0,
    "avg_execution_time": "1000.50",
    "max_execution_time": 1001,
    "times_selected": 2,
    "avg_selection_confidence": "0.00",
    "confidence_distribution": null,
    "positive_feedback": 0,
    "negative_feedback": 0,
    "user_dismissals": 0,
    "top_trigger_patterns": null,
    "context_effectiveness": null,
    "works_well_with": null,
    "coordination_success_rate": null,
    "recommended_min_confidence": null,
    "recommended_max_agents": null,
    "created_at": "2025-10-26T19:04:40.958Z",
    "updated_at": "2025-10-26T19:30:08.014Z"
  }
]
```

### Schema: `agentic_reviews`

**Row Count**: 12

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| pr_number | integer | NO | NULL |
| pr_title | text | NO | NULL |
| branch | text | NO | NULL |
| author | text | NO | NULL |
| github_url | text | YES | NULL |
| status | text | YES | 'pending'::text |
| summary | text | YES | NULL |
| issues | jsonb | YES | '[]'::jsonb |
| sub_agent_reviews | jsonb | YES | '[]'::jsonb |
| sd_link | text | YES | NULL |
| prd_link | text | YES | NULL |
| leo_phase | text | YES | NULL |
| commit_sha | text | YES | NULL |
| review_time_ms | integer | YES | NULL |
| is_false_positive | boolean | YES | false |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_38634_1_not_null | CHECK | - | - |
| 2200_38634_2_not_null | CHECK | - | - |
| 2200_38634_3_not_null | CHECK | - | - |
| 2200_38634_4_not_null | CHECK | - | - |
| 2200_38634_5_not_null | CHECK | - | - |
| agentic_reviews_status_check | CHECK | - | agentic_reviews(status) |
| agentic_reviews_pkey | PRIMARY KEY | id | agentic_reviews(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Enable insert for authenticated users | INSERT | "{public}" | PERMISSIVE |
| Enable read access for all users | SELECT | "{public}" | PERMISSIVE |
| Enable update for authenticated users | UPDATE | "{public}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "fe4cd36c-6da0-48b5-bff9-482f3537ad1f",
    "pr_number": 101,
    "pr_title": "Add dark mode toggle to dashboard",
    "branch": "feature/dark-mode",
    "author": "developer1",
    "github_url": "https://github.com/org/repo/pull/101",
    "status": "passed",
    "summary": "All checks passed. SD/PRD linkage verified.",
    "issues": [],
    "sub_agent_reviews": [],
    "sd_link": "SD-2025-002",
    "prd_link": "PRD-2025-002-01",
    "leo_phase": "EXEC",
    "commit_sha": null,
    "review_time_ms": 3500,
    "is_false_positive": false,
    "metadata": {},
    "created_at": "2025-09-15T14:02:11.804Z",
    "updated_at": "2025-09-15T14:02:11.804Z"
  },
  {
    "id": "3ce7f315-6a06-4292-a846-d2855825cd9b",
    "pr_number": 102,
    "pr_title": "Fix navigation responsive issues",
    "branch": "fix/nav-responsive",
    "author": "developer2",
    "github_url": "https://github.com/org/repo/pull/102",
    "status": "warning",
    "summary": "Missing PRD linkage. Security review passed with minor issues.",
    "issues": [],
    "sub_agent_reviews": [],
    "sd_link": "SD-2025-003",
    "prd_link": null,
    "leo_phase": "EXEC",
    "commit_sha": null,
    "review_time_ms": 4200,
    "is_false_positive": false,
    "metadata": {},
    "created_at": "2025-09-15T14:02:11.804Z",
    "updated_at": "2025-09-15T14:02:11.804Z"
  },
  {
    "id": "acbeeffd-966d-4369-a5ca-a6bc18df9c4a",
    "pr_number": 103,
    "pr_title": "Test real-time update feature",
    "branch": "test/realtime-updates",
    "author": "testuser",
    "github_url": "https://github.com/org/repo/pull/103",
    "status": "passed",
    "summary": "Testing real-time dashboard updates",
    "issues": [
      "Minor: Consider adding more comments"
    ],
    "sub_agent_reviews": [
      {
        "issues": [],
        "status": "passed",
        "sub_agent": "security"
      },
      {
        "issues": [],
        "status": "passed",
        "sub_agent": "testing"
      },
      {
        "issues": [
          "Consider optimizing bundle size"
        ],
        "status": "warning",
        "sub_agent": "performance"
      }
    ],
    "sd_link": "SD-2025-004",
    "prd_link": "PRD-2025-004-01",
    "leo_phase": "PLAN_VERIFY",
    "commit_sha": "abc123def456",
    "review_time_ms": 5200,
    "is_false_positive": false,
    "metadata": {
      "test": true,
      "timestamp": "2025-09-15T14:04:27.371Z"
    },
    "created_at": "2025-09-15T14:04:27.845Z",
    "updated_at": "2025-09-15T14:04:27.845Z"
  },
  {
    "id": "e86cb7f1-fb20-4a3d-87c2-9479c444d9d4",
    "pr_number": 999,
    "pr_title": "E2E Test PR",
    "branch": "test/e2e",
    "author": "e2e-test",
    "github_url": null,
    "status": "pending",
    "summary": null,
    "issues": [],
    "sub_agent_reviews": [],
    "sd_link": null,
    "prd_link": null,
    "leo_phase": "EXEC",
    "commit_sha": null,
    "review_time_ms": null,
    "is_false_positive": false,
    "metadata": {},
    "created_at": "2025-09-15T14:10:28.056Z",
    "updated_at": "2025-09-15T14:10:28.056Z"
  },
  {
    "id": "7b408823-1fd3-454f-8d36-e1132c4dfc5d",
    "pr_number": 200,
    "pr_title": "Integration test PR",
    "branch": "test/integration",
    "author": "integration-test",
    "github_url": null,
    "status": "passed",
    "summary": null,
    "issues": [],
    "sub_agent_reviews": [
      {
        "status": "passed",
        "sub_agent": "security"
      },
      {
        "status": "passed",
        "sub_agent": "testing"
      },
      {
        "status": "passed",
        "sub_agent": "database"
      },
      {
        "status": "warning",
        "sub_agent": "performance"
      }
    ],
    "sd_link": "SD-2025-100",
    "prd_link": "PRD-2025-100-01",
    "leo_phase": "EXEC",
    "commit_sha": null,
    "review_time_ms": 4500,
    "is_false_positive": false,
    "metadata": {},
    "created_at": "2025-09-15T14:10:31.793Z",
    "updated_at": "2025-09-15T14:10:31.898Z"
  }
]
```

### Schema: `crewai_flow_executions`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| flow_id | uuid | NO | NULL |
| execution_key | character varying(100) | NO | NULL |
| input_state | jsonb | YES | NULL |
| output_state | jsonb | YES | NULL |
| status | character varying(20) | YES | 'pending'::character varying |
| error_message | text | YES | NULL |
| error_stack | text | YES | NULL |
| error_type | character varying(100) | YES | NULL |
| started_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | NULL |
| duration_ms | integer | YES | NULL |
| token_count | integer | YES | NULL |
| cost_usd | numeric | YES | NULL |
| board_meeting_id | uuid | YES | NULL |
| executed_by | uuid | YES | NULL |
| execution_mode | character varying(20) | YES | 'manual'::character varying |
| metadata | jsonb | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_81017_1_not_null | CHECK | - | - |
| 2200_81017_2_not_null | CHECK | - | - |
| 2200_81017_3_not_null | CHECK | - | - |
| crewai_flow_executions_execution_mode_check | CHECK | - | crewai_flow_executions(execution_mode) |
| crewai_flow_executions_status_check | CHECK | - | crewai_flow_executions(status) |
| crewai_flow_executions_flow_id_fkey | FOREIGN KEY | flow_id | crewai_flows(id) |
| crewai_flow_executions_pkey | PRIMARY KEY | id | crewai_flow_executions(id) |
| crewai_flow_executions_execution_key_key | UNIQUE | execution_key | crewai_flow_executions(execution_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| executions_create | INSERT | "{public}" | PERMISSIVE |
| executions_read_own | SELECT | "{public}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `crewai_flow_templates`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| template_key | character varying(100) | NO | NULL |
| template_name | character varying(200) | NO | NULL |
| description | text | YES | NULL |
| category | character varying(50) | YES | NULL |
| template_definition | jsonb | NO | NULL |
| required_parameters | jsonb | YES | NULL |
| is_official | boolean | YES | false |
| usage_count | integer | YES | 0 |
| rating_average | numeric | YES | NULL |
| rating_count | integer | YES | 0 |
| created_by | uuid | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| metadata | jsonb | YES | NULL |
| tags | ARRAY | YES | ARRAY[]::text[] |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_81043_1_not_null | CHECK | - | - |
| 2200_81043_2_not_null | CHECK | - | - |
| 2200_81043_3_not_null | CHECK | - | - |
| 2200_81043_6_not_null | CHECK | - | - |
| crewai_flow_templates_pkey | PRIMARY KEY | id | crewai_flow_templates(id) |
| crewai_flow_templates_template_key_key | UNIQUE | template_key | crewai_flow_templates(template_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| templates_create_user | INSERT | "{public}" | PERMISSIVE |
| templates_read_all | SELECT | "{public}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "ac7e87fc-6118-4c5a-a518-37dad264dfe2",
    "template_key": "weekly-board-meeting",
    "template_name": "Weekly Board Meeting",
    "description": "Standard weekly board meeting workflow with parallel reports from CFO, CTO, and GTM, followed by discussion and voting",
    "category": "board_meeting",
    "template_definition": {
      "edges": [
        {
          "source": "start",
          "target": "parallel-reports"
        },
        {
          "source": "parallel-reports",
          "target": "eva-synthesis"
        },
        {
          "source": "eva-synthesis",
          "target": "decision"
        },
        {
          "label": "no",
          "source": "decision",
          "target": "voting"
        },
        {
          "label": "yes",
          "source": "decision",
          "target": "end"
        },
        {
          "source": "voting",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "label": "Start Meeting"
          },
          "type": "start"
        },
        {
          "id": "parallel-reports",
          "data": {
            "label": "Board Reports",
            "tasks": [
              "cfo_report",
              "cto_report",
              "gtm_report"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "eva-synthesis",
          "data": {
            "agent": "EVA",
            "label": "EVA Synthesizes"
          },
          "type": "agent_task"
        },
        {
          "id": "decision",
          "data": {
            "label": "Red Flags?",
            "condition": "has_red_flags"
          },
          "type": "decision"
        },
        {
          "id": "voting",
          "data": {
            "label": "Board Vote",
            "tasks": [
              "board_vote"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "end",
          "data": {
            "label": "End Meeting"
          },
          "type": "end"
        }
      ]
    },
    "required_parameters": {
      "agenda_items": "array",
      "meeting_date": "string"
    },
    "is_official": true,
    "usage_count": 0,
    "rating_average": null,
    "rating_count": 0,
    "created_by": null,
    "created_at": "2025-10-11T21:57:52.785Z",
    "updated_at": "2025-10-11T21:57:52.785Z",
    "metadata": {
      "estimated_duration": "15-20 minutes",
      "board_members_required": 7
    },
    "tags": []
  },
  {
    "id": "3992d24d-b0b4-434f-8d29-62c1c518b1e3",
    "template_key": "emergency-board-session",
    "template_name": "Emergency Board Session",
    "description": "Urgent decision-making workflow triggered by critical events (burn rate, compliance issues, etc.)",
    "category": "board_meeting",
    "template_definition": {
      "edges": [
        {
          "source": "start",
          "target": "responsible-member"
        },
        {
          "source": "responsible-member",
          "target": "parallel-analysis"
        },
        {
          "source": "parallel-analysis",
          "target": "debate"
        },
        {
          "source": "debate",
          "target": "decision-type"
        },
        {
          "source": "decision-type",
          "target": "weighted-vote"
        },
        {
          "source": "weighted-vote",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "label": "Emergency Trigger"
          },
          "type": "start"
        },
        {
          "id": "responsible-member",
          "data": {
            "label": "Present Situation"
          },
          "type": "agent_task"
        },
        {
          "id": "parallel-analysis",
          "data": {
            "label": "Board Analysis"
          },
          "type": "parallel"
        },
        {
          "id": "debate",
          "data": {
            "label": "Discussion"
          },
          "type": "agent_task"
        },
        {
          "id": "decision-type",
          "data": {
            "label": "Decision Type"
          },
          "type": "router"
        },
        {
          "id": "weighted-vote",
          "data": {
            "label": "Weighted Voting"
          },
          "type": "parallel"
        },
        {
          "id": "end",
          "data": {
            "label": "Record Decision"
          },
          "type": "end"
        }
      ]
    },
    "required_parameters": {
      "severity": "string",
      "trigger_event": "string"
    },
    "is_official": true,
    "usage_count": 0,
    "rating_average": null,
    "rating_count": 0,
    "created_by": null,
    "created_at": "2025-10-11T21:57:52.785Z",
    "updated_at": "2025-10-11T21:57:52.785Z",
    "metadata": {
      "estimated_duration": "20-30 minutes",
      "requires_unanimous": false
    },
    "tags": []
  },
  {
    "id": "c1cce1e3-5fbc-42d4-a77d-d5662dc4f1d7",
    "template_key": "investment-approval",
    "template_name": "Investment Approval Workflow",
    "description": "Comprehensive venture investment analysis and approval process with multi-domain expert evaluation",
    "category": "board_meeting",
    "template_definition": {
      "edges": [
        {
          "source": "start",
          "target": "ceo-presentation"
        },
        {
          "source": "ceo-presentation",
          "target": "parallel-analysis"
        },
        {
          "source": "parallel-analysis",
          "target": "wait"
        },
        {
          "source": "wait",
          "target": "blocker-check"
        },
        {
          "label": "yes",
          "source": "blocker-check",
          "target": "reject"
        },
        {
          "label": "no",
          "source": "blocker-check",
          "target": "board-discussion"
        },
        {
          "source": "board-discussion",
          "target": "weighted-vote"
        },
        {
          "source": "weighted-vote",
          "target": "vote-decision"
        },
        {
          "label": "yes",
          "source": "vote-decision",
          "target": "approve"
        },
        {
          "label": "no",
          "source": "vote-decision",
          "target": "reject"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "label": "Venture Proposal"
          },
          "type": "start"
        },
        {
          "id": "ceo-presentation",
          "data": {
            "label": "AI CEO Presents"
          },
          "type": "agent_task"
        },
        {
          "id": "parallel-analysis",
          "data": {
            "label": "Expert Analysis",
            "tasks": [
              "cfo_financial",
              "cto_technical",
              "gtm_market",
              "legal_compliance"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "wait",
          "data": {
            "label": "Wait for All"
          },
          "type": "wait"
        },
        {
          "id": "blocker-check",
          "data": {
            "label": "Any Blockers?"
          },
          "type": "router"
        },
        {
          "id": "board-discussion",
          "data": {
            "label": "Q&A with CEO"
          },
          "type": "agent_task"
        },
        {
          "id": "weighted-vote",
          "data": {
            "label": "Board Vote"
          },
          "type": "parallel"
        },
        {
          "id": "vote-decision",
          "data": {
            "label": "Vote Passes?"
          },
          "type": "decision"
        },
        {
          "id": "approve",
          "data": {
            "label": "Approve + RAID Log"
          },
          "type": "end"
        },
        {
          "id": "reject",
          "data": {
            "label": "Reject + Feedback"
          },
          "type": "end"
        }
      ]
    },
    "required_parameters": {
      "venture_id": "uuid",
      "venture_stage": "string",
      "investment_amount": "number"
    },
    "is_official": true,
    "usage_count": 0,
    "rating_average": null,
    "rating_count": 0,
    "created_by": null,
    "created_at": "2025-10-11T21:57:52.785Z",
    "updated_at": "2025-10-11T21:57:52.785Z",
    "metadata": {
      "threshold": "60% weighted approval",
      "estimated_duration": "25-35 minutes"
    },
    "tags": []
  }
]
```

### Schema: `crewai_flows`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| flow_key | character varying(100) | NO | NULL |
| flow_name | character varying(200) | NO | NULL |
| description | text | YES | NULL |
| flow_definition | jsonb | NO | NULL |
| python_code | text | YES | NULL |
| status | character varying(20) | YES | 'draft'::character varying |
| version | integer | YES | 1 |
| parent_flow_id | uuid | YES | NULL |
| created_by | uuid | YES | NULL |
| updated_by | uuid | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| published_at | timestamp with time zone | YES | NULL |
| metadata | jsonb | YES | NULL |
| tags | ARRAY | YES | ARRAY[]::text[] |
| execution_count | integer | YES | 0 |
| last_executed_at | timestamp with time zone | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_80990_1_not_null | CHECK | - | - |
| 2200_80990_2_not_null | CHECK | - | - |
| 2200_80990_3_not_null | CHECK | - | - |
| 2200_80990_5_not_null | CHECK | - | - |
| crewai_flows_status_check | CHECK | - | crewai_flows(status) |
| crewai_flows_parent_flow_id_fkey | FOREIGN KEY | parent_flow_id | crewai_flows(id) |
| crewai_flows_pkey | PRIMARY KEY | id | crewai_flows(id) |
| crewai_flows_flow_key_key | UNIQUE | flow_key | crewai_flows(flow_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| flows_create_own | INSERT | "{public}" | PERMISSIVE |
| flows_delete_own_draft | DELETE | "{public}" | PERMISSIVE |
| flows_read_active | SELECT | "{public}" | PERMISSIVE |
| flows_update_own | UPDATE | "{public}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `cross_agent_correlations`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| correlation_name | text | NO | NULL |
| agent_a | text | NO | NULL |
| agent_b | text | NO | NULL |
| agent_a_condition | text | YES | NULL |
| agent_b_outcome | text | YES | NULL |
| correlation_coefficient | numeric | YES | NULL |
| sample_size | integer | YES | NULL |
| statistical_confidence | numeric | YES | NULL |
| prediction_accuracy | numeric | YES | NULL |
| recommendation | text | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_52388_1_not_null | CHECK | - | - |
| 2200_52388_2_not_null | CHECK | - | - |
| 2200_52388_3_not_null | CHECK | - | - |
| 2200_52388_4_not_null | CHECK | - | - |
| cross_agent_correlations_agent_a_check | CHECK | - | cross_agent_correlations(agent_a) |
| cross_agent_correlations_agent_b_check | CHECK | - | cross_agent_correlations(agent_b) |
| cross_agent_correlations_pkey | PRIMARY KEY | id | cross_agent_correlations(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| intelligence_correlations_all | ALL | "{service_role}" | PERMISSIVE |
| intelligence_correlations_select | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `exec_sub_agent_activations`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| session_id | uuid | NO | NULL |
| sd_id | text | NO | NULL |
| sub_agent_type | text | NO | NULL |
| activation_reason | text | NO | NULL |
| execution_status | text | NO | NULL |
| severity | text | NO | NULL |
| summary | text | NO | NULL |
| details | jsonb | YES | '{}'::jsonb |
| recommendations | ARRAY | YES | NULL |
| quality_score | integer | YES | 0 |
| execution_time_ms | integer | YES | 0 |
| activated_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_50912_1_not_null | CHECK | - | - |
| 2200_50912_2_not_null | CHECK | - | - |
| 2200_50912_3_not_null | CHECK | - | - |
| 2200_50912_4_not_null | CHECK | - | - |
| 2200_50912_5_not_null | CHECK | - | - |
| 2200_50912_6_not_null | CHECK | - | - |
| 2200_50912_7_not_null | CHECK | - | - |
| 2200_50912_8_not_null | CHECK | - | - |
| exec_sub_agent_activations_execution_status_check | CHECK | - | exec_sub_agent_activations(execution_status) |
| exec_sub_agent_activations_quality_score_check | CHECK | - | exec_sub_agent_activations(quality_score) |
| exec_sub_agent_activations_severity_check | CHECK | - | exec_sub_agent_activations(severity) |
| exec_sub_agent_activations_sub_agent_type_check | CHECK | - | exec_sub_agent_activations(sub_agent_type) |
| exec_sub_agent_activations_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| exec_sub_agent_activations_session_id_fkey | FOREIGN KEY | session_id | exec_implementation_sessions(id) |
| exec_sub_agent_activations_pkey | PRIMARY KEY | id | exec_sub_agent_activations(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| exec_subagent_activations_all | ALL | "{service_role}" | PERMISSIVE |
| exec_subagent_activations_select | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_adrs`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| adr_number | text | NO | NULL |
| title | text | NO | NULL |
| status | text | NO | NULL |
| decision | text | NO | NULL |
| context | text | NO | NULL |
| options | jsonb | NO | '[]'::jsonb |
| consequences | jsonb | NO | '{}'::jsonb |
| impact | jsonb | NO | '{}'::jsonb |
| rollback_plan | text | YES | NULL |
| superseded_by | uuid | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40086_10_not_null | CHECK | - | - |
| 2200_40086_1_not_null | CHECK | - | - |
| 2200_40086_2_not_null | CHECK | - | - |
| 2200_40086_3_not_null | CHECK | - | - |
| 2200_40086_4_not_null | CHECK | - | - |
| 2200_40086_5_not_null | CHECK | - | - |
| 2200_40086_6_not_null | CHECK | - | - |
| 2200_40086_7_not_null | CHECK | - | - |
| 2200_40086_8_not_null | CHECK | - | - |
| 2200_40086_9_not_null | CHECK | - | - |
| leo_adrs_status_check | CHECK | - | leo_adrs(status) |
| leo_adrs_superseded_by_fkey | FOREIGN KEY | superseded_by | leo_adrs(id) |
| leo_adrs_pkey | PRIMARY KEY | id | leo_adrs(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_adrs | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_adrs | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_agents`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | character varying(20) | NO | NULL |
| agent_code | character varying(10) | NO | NULL |
| name | character varying(100) | NO | NULL |
| responsibilities | text | YES | NULL |
| planning_percentage | integer | YES | NULL |
| implementation_percentage | integer | YES | NULL |
| verification_percentage | integer | YES | NULL |
| approval_percentage | integer | YES | NULL |
| total_percentage | integer | YES | NULL |
| capabilities | jsonb | YES | '[]'::jsonb |
| constraints | jsonb | YES | '[]'::jsonb |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23172_1_not_null | CHECK | - | - |
| 2200_23172_2_not_null | CHECK | - | - |
| 2200_23172_3_not_null | CHECK | - | - |
| leo_agents_agent_code_check | CHECK | - | leo_agents(agent_code) |
| leo_agents_pkey | PRIMARY KEY | id | leo_agents(id) |
| leo_agents_agent_code_key | UNIQUE | agent_code | leo_agents(agent_code) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_agents | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_agents | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "exec-agent",
    "agent_code": "EXEC",
    "name": "Implementation Agent",
    "responsibilities": "Implementation based on PRD. **CRITICAL: Implementations happen in /mnt/c/_EHG/ehg/ (EHG app), NOT in EHG_Engineer!** Always cd to target app before coding. **SIMPLICITY IN EXECUTION**: Implement the simplest solution that meets requirements. Avoid over-engineering. Use proven patterns and existing libraries.",
    "planning_percentage": 0,
    "implementation_percentage": 30,
    "verification_percentage": 0,
    "approval_percentage": 0,
    "total_percentage": 30,
    "capabilities": [],
    "constraints": [],
    "created_at": "2025-09-04T01:48:42.451Z"
  },
  {
    "id": "lead-agent",
    "agent_code": "LEAD",
    "name": "Strategic Leadership Agent",
    "responsibilities": "Strategic planning, business objectives, final approval. **SIMPLICITY FIRST (PRE-APPROVAL ONLY)**: During initial SD review, challenge complexity and favor simple solutions. Ask \"What's the simplest solution?\" and \"Why not just configure existing tools?\" Apply 80/20 rule BEFORE approval. Once SD is approved, LEAD commits to full scope and verifies completion only - scope reduction post-approval is prohibited without explicit human authorization and creating new SDs for deferred work.\n- **🛡️ HUMAN APPROVAL REQUIRED**: LEAD MUST request human approval before changing SD status/priority. Use standardized over-engineering rubric for evaluations. NEVER override user selections without explicit permission.\n- **📋 Over-Engineering Evaluation**: Use `scripts/lead-over-engineering-rubric.js` for standardized assessments. Present findings to human for approval before any changes.\n- **🔍 MANDATORY BACKLOG REVIEW**: When evaluating any Strategic Directive, LEAD MUST query `sd_backlog_map` table to review all linked backlog items. This is step 3 of the 5-step SD evaluation checklist (see below). Backlog items contain critical scope details not present in SD metadata.\n- **🚫 PROHIBITED**: Autonomous SD status changes, user selection overrides, subjective over-engineering calls without rubric, **skipping backlog review before scope decisions**. **🤖 MANDATORY SUB-AGENT AUTOMATION**: Before approving any SD as complete, LEAD MUST run automated sub-agent validation. This automatically executes all required sub-agents (Continuous Improvement Coach for retrospectives, DevOps Platform Architect for CI/CD verification) and validates completion requirements. Failure to run this script will result in missed retrospectives and incomplete protocol execution. **✅ APPROVAL CHECKLIST**: LEAD may only approve an SD after: (1) Running sub-agent validation successfully, (2) Verifying output shows \"✅ SD READY FOR COMPLETION\", (3) Reviewing any warnings, (4) Obtaining human approval for status change.\n\n**5-STEP SD EVALUATION CHECKLIST** (Mandatory for LEAD):\n1. Query `strategic_directives_v2` for SD metadata (title, status, priority, progress, scope)\n2. Query `product_requirements_v2` for existing PRD (if any)\n3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL: Contains detailed requirements\n4. Search codebase for existing infrastructure (services, components, routes)\n5. Identify gaps between backlog requirements and existing code\n\n**Backlog Review Requirements**:\n- Review `backlog_title`, `item_description`, `extras.Description_1` for each item\n- Assess priority alignment: `priority` field (High/Medium/Low) vs `description_raw` (Must Have/Nice to Have)\n- Check completion status: `completion_status` (NOT_STARTED/IN_PROGRESS/COMPLETED)\n- Evaluate scope match between backlog items and existing codebase\n- Flag scope mismatches for LEAD decision (implement backlog vs use existing code)",
    "planning_percentage": 20,
    "implementation_percentage": 0,
    "verification_percentage": 0,
    "approval_percentage": 15,
    "total_percentage": 35,
    "capabilities": [
      "Define strategic objectives",
      "Set priorities (CRITICAL: 90+, HIGH: 70-89, MEDIUM: 50-69, LOW: 30-49)",
      "Approve strategic directives",
      "Apply simplicity gate assessment",
      "Challenge over-engineering",
      "Query sd_backlog_map for comprehensive scope understanding",
      "Evaluate backlog item alignment with business objectives",
      "Identify scope mismatches between backlog and existing infrastructure",
      "Make scope decisions (implement backlog vs reuse existing code)",
      "Create LEAD→PLAN handoffs with all 7 mandatory elements",
      "Final approval and retrospective triggering"
    ],
    "constraints": [],
    "created_at": "2025-09-04T01:48:42.451Z"
  },
  {
    "id": "plan-agent",
    "agent_code": "PLAN",
    "name": "Technical Planning Agent",
    "responsibilities": "Technical design, PRD creation with comprehensive test plans, pre-automation validation, acceptance testing. **PRAGMATIC ENGINEERING**: Use boring technology that works reliably. Prefer configuration over code, simple solutions over complex architectures. Filter sub-agent recommendations through simplicity lens. **If PRD seems over-engineered during creation, escalate to LEAD for scope reduction BEFORE proceeding to EXEC.**\n- **🔍 MANDATORY BACKLOG REVIEW**: When creating PRD, PLAN MUST query `sd_backlog_map` table to ensure all backlog items are addressed in the PRD. This is step 3 of the 5-step SD evaluation checklist. Backlog items define the actual requirements to be implemented.\n- **🔍 Supervisor Mode**: Final \"done done\" verification with all sub-agents\n- **🔍 CI/CD VERIFICATION**: After EXEC completion, wait 2-3 minutes for GitHub CI/CD pipelines to complete, then trigger DevOps Platform Architect to verify no pipeline failures exist before final approval.\n\n**5-STEP SD EVALUATION CHECKLIST** (Mandatory for PLAN):\n1. Query `strategic_directives_v2` for SD metadata\n2. Query `product_requirements_v2` for existing PRD (if creating new PRD)\n3. **Query `sd_backlog_map` for linked backlog items** ← CRITICAL: These define what to build\n4. Search codebase for existing infrastructure\n5. Map backlog items to PRD sections (objectives, features, acceptance criteria)\n\n**Backlog-to-PRD Mapping**:\n- Each backlog item should map to at least one PRD objective\n- Backlog `extras.Description_1` provides detailed feature descriptions\n- Priority from backlog (`priority` + `description_raw`) informs PRD must-haves\n- Existing infrastructure may satisfy some backlog items (document in PRD)\n- Gap analysis: What backlog items require new implementation vs configuration?",
    "planning_percentage": 20,
    "implementation_percentage": 0,
    "verification_percentage": 15,
    "approval_percentage": 0,
    "total_percentage": 35,
    "capabilities": [
      "Analyze Strategic Directive",
      "Create Product Requirements Document (PRD)",
      "Query sd_backlog_map for detailed requirements",
      "Map backlog items to PRD objectives and features",
      "Conduct gap analysis (backlog requirements vs existing infrastructure)",
      "Define technical specifications",
      "Design architecture approach",
      "Plan implementation phases",
      "Create comprehensive and detailed test plans with manual validation steps",
      "Define authentication flow test scenarios before automation",
      "Specify pre-Playwright validation requirements",
      "Document authentication handling strategies",
      "Establish manual testing prerequisites before automation",
      "Define test data and fixture requirements",
      "Create environment-specific test configurations",
      "Verify all backlog items are addressed in PRD before LEAD handoff"
    ],
    "constraints": [
      "Must stay within Strategic Directive objectives",
      "Cannot change business objectives",
      "Cannot implement code",
      "MUST query sd_backlog_map before creating PRD",
      "MUST address all backlog items in PRD (or document deferral rationale)",
      "MUST create comprehensive manual test plans BEFORE automation",
      "MUST document authentication flow with detailed steps",
      "MUST specify pre-automation validation checklist",
      "CANNOT skip manual validation phase",
      "CANNOT approve Playwright automation without manual test success",
      "CANNOT skip backlog review step"
    ],
    "created_at": "2025-09-04T01:48:42.451Z"
  }
]
```

### Schema: `leo_artifacts`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| artifact_type | text | NO | NULL |
| artifact_name | text | NO | NULL |
| content | jsonb | NO | NULL |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40176_1_not_null | CHECK | - | - |
| 2200_40176_2_not_null | CHECK | - | - |
| 2200_40176_3_not_null | CHECK | - | - |
| 2200_40176_4_not_null | CHECK | - | - |
| 2200_40176_5_not_null | CHECK | - | - |
| leo_artifacts_pkey | PRIMARY KEY | id | leo_artifacts(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_artifacts | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_artifacts | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_codebase_validations`

**Row Count**: 6

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | YES | NULL |
| prd_id | text | YES | NULL |
| validation_timestamp | timestamp without time zone | YES | now() |
| codebase_analysis | jsonb | NO | NULL |
| human_review_required | boolean | YES | false |
| human_review_reasons | ARRAY | YES | NULL |
| approval_recommendation | text | YES | NULL |
| recommended_actions | ARRAY | YES | NULL |
| evidence_collected | jsonb | YES | NULL |
| validated_by | text | YES | 'LEAD'::text |
| created_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49474_1_not_null | CHECK | - | - |
| 2200_49474_5_not_null | CHECK | - | - |
| leo_codebase_validations_approval_recommendation_check | CHECK | - | leo_codebase_validations(approval_recommendation) |
| leo_codebase_validations_prd_id_fkey | FOREIGN KEY | prd_id | product_requirements_v2(id) |
| leo_codebase_validations_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| leo_codebase_validations_pkey | PRIMARY KEY | id | leo_codebase_validations(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_codebase_validations | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_codebase_validations | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "64e02ddb-4c83-4a08-8d31-293d90e25f78",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "validation_timestamp": "2025-09-23T17:27:39.627Z",
    "codebase_analysis": {
      "conflicts": {
        "severity": "NONE",
        "adjacent_features": [],
        "resolution_required": false
      },
      "architecture": {
        "violations": [],
        "compatibility": "ALIGNED",
        "refactoring_needed": false
      },
      "dependencies": {
        "risk_level": "NONE",
        "affected_count": 0,
        "breaking_changes": []
      },
      "existing_implementations": {
        "found": true,
        "locations": [
          {
            "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
            "term": "governance",
            "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
          },
          {
            "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
            "term": "governance",
            "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
          },
          {
            "file": "applications/APP001/codebase/app/governance/page.tsx",
            "term": "governance",
            "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
          },
          {
            "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
            "term": "governance",
            "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
          },
          {
            "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
            "term": "governance",
            "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
          },
          {
            "file": "applications/APP001/codebase/src/App.tsx",
            "term": "governance",
            "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
          },
          {
            "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
            "term": "governance",
            "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
            "term": "governance",
            "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
            "term": "governance",
            "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
          },
          {
            "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
            "term": "governance",
            "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
          }
        ],
        "recommendation": "USE_EXISTING",
        "similarity_score": 100
      }
    },
    "human_review_required": true,
    "human_review_reasons": [
      "High similarity score (1240%) - possible duplicate implementation",
      "Validation error: supabase.rpc(...).catch is not a function"
    ],
    "approval_recommendation": "BLOCKED",
    "recommended_actions": [],
    "evidence_collected": null,
    "validated_by": "LEAD",
    "created_at": "2025-09-23T17:27:51.816Z",
    "updated_at": "2025-09-23T17:27:51.816Z"
  },
  {
    "id": "d395fa58-fb25-4a21-ad9f-6f49b44fe7ba",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "validation_timestamp": "2025-09-23T17:28:06.293Z",
    "codebase_analysis": {
      "conflicts": {
        "severity": "NONE",
        "adjacent_features": [],
        "resolution_required": false
      },
      "architecture": {
        "violations": [],
        "compatibility": "ALIGNED",
        "refactoring_needed": false
      },
      "dependencies": {
        "risk_level": "NONE",
        "affected_count": 1,
        "breaking_changes": []
      },
      "existing_implementations": {
        "found": true,
        "locations": [
          {
            "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
            "term": "governance",
            "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
          },
          {
            "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
            "term": "governance",
            "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
          },
          {
            "file": "applications/APP001/codebase/app/governance/page.tsx",
            "term": "governance",
            "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
          },
          {
            "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
            "term": "governance",
            "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
          },
          {
            "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
            "term": "governance",
            "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
          },
          {
            "file": "applications/APP001/codebase/src/App.tsx",
            "term": "governance",
            "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
          },
          {
            "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
            "term": "governance",
            "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
            "term": "governance",
            "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
            "term": "governance",
            "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
          },
          {
            "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
            "term": "governance",
            "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
          }
        ],
        "recommendation": "USE_EXISTING",
        "similarity_score": 100
      }
    },
    "human_review_required": true,
    "human_review_reasons": [
      "High similarity score (1240%) - possible duplicate implementation"
    ],
    "approval_recommendation": "BLOCKED",
    "recommended_actions": [
      "Review existing implementation and consider enhancing instead of duplicating"
    ],
    "evidence_collected": null,
    "validated_by": "LEAD",
    "created_at": "2025-09-23T17:28:13.941Z",
    "updated_at": "2025-09-23T17:28:13.941Z"
  },
  {
    "id": "8518bf8c-d392-46f5-9e1b-3e49c9bada82",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "validation_timestamp": "2025-09-23T17:31:46.873Z",
    "codebase_analysis": {
      "conflicts": {
        "severity": "NONE",
        "adjacent_features": [],
        "resolution_required": false
      },
      "architecture": {
        "violations": [],
        "compatibility": "ALIGNED",
        "refactoring_needed": false
      },
      "dependencies": {
        "risk_level": "NONE",
        "affected_count": 1,
        "breaking_changes": []
      },
      "existing_implementations": {
        "found": true,
        "locations": [
          {
            "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
            "term": "governance",
            "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
          },
          {
            "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
            "term": "governance",
            "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
          },
          {
            "file": "applications/APP001/codebase/app/governance/page.tsx",
            "term": "governance",
            "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
          },
          {
            "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
            "term": "governance",
            "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
          },
          {
            "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
            "term": "governance",
            "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
          },
          {
            "file": "applications/APP001/codebase/src/App.tsx",
            "term": "governance",
            "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
          },
          {
            "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
            "term": "governance",
            "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
            "term": "governance",
            "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
            "term": "governance",
            "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
          },
          {
            "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
            "term": "governance",
            "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
          }
        ],
        "recommendation": "USE_EXISTING",
        "similarity_score": 100
      }
    },
    "human_review_required": true,
    "human_review_reasons": [
      "High similarity score (1240%) - possible duplicate implementation"
    ],
    "approval_recommendation": "BLOCKED",
    "recommended_actions": [
      "Review existing implementation and consider enhancing instead of duplicating"
    ],
    "evidence_collected": null,
    "validated_by": "LEAD",
    "created_at": "2025-09-23T17:31:55.558Z",
    "updated_at": "2025-09-23T17:31:55.558Z"
  },
  {
    "id": "f2e061df-5c46-408a-88d9-b383bc07c268",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "validation_timestamp": "2025-09-23T17:32:02.785Z",
    "codebase_analysis": {
      "conflicts": {
        "severity": "NONE",
        "adjacent_features": [],
        "resolution_required": false
      },
      "architecture": {
        "violations": [],
        "compatibility": "ALIGNED",
        "refactoring_needed": false
      },
      "dependencies": {
        "risk_level": "NONE",
        "affected_count": 1,
        "breaking_changes": []
      },
      "existing_implementations": {
        "found": true,
        "locations": [
          {
            "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
            "term": "governance",
            "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
          },
          {
            "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
            "term": "governance",
            "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
          },
          {
            "file": "applications/APP001/codebase/app/governance/page.tsx",
            "term": "governance",
            "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
          },
          {
            "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
            "term": "governance",
            "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
          },
          {
            "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
            "term": "governance",
            "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
          },
          {
            "file": "applications/APP001/codebase/src/App.tsx",
            "term": "governance",
            "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
          },
          {
            "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
            "term": "governance",
            "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
            "term": "governance",
            "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
            "term": "governance",
            "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
          },
          {
            "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
            "term": "governance",
            "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
          }
        ],
        "recommendation": "USE_EXISTING",
        "similarity_score": 100
      }
    },
    "human_review_required": true,
    "human_review_reasons": [
      "High similarity score (1240%) - possible duplicate implementation"
    ],
    "approval_recommendation": "BLOCKED",
    "recommended_actions": [
      "Review existing implementation and consider enhancing instead of duplicating"
    ],
    "evidence_collected": null,
    "validated_by": "LEAD",
    "created_at": "2025-09-23T17:32:10.459Z",
    "updated_at": "2025-09-23T17:32:10.459Z"
  },
  {
    "id": "8d38bbe1-3611-44d5-be53-c96b8f60fa25",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "validation_timestamp": "2025-09-23T17:58:31.886Z",
    "codebase_analysis": {
      "conflicts": {
        "severity": "NONE",
        "adjacent_features": [],
        "resolution_required": false
      },
      "architecture": {
        "violations": [],
        "compatibility": "ALIGNED",
        "refactoring_needed": false
      },
      "dependencies": {
        "risk_level": "NONE",
        "affected_count": 1,
        "breaking_changes": []
      },
      "existing_implementations": {
        "found": true,
        "locations": [
          {
            "file": "applications/APP001/codebase/app/api/governance/metrics/route.ts",
            "term": "governance",
            "context": "    const companyIds = userAccess.map(access => access.company_id);\n\n    // Get governance metrics in parallel\n    const [\n      policiesResult,\n--\n      // Total and active policies\n      supabase\n  "
          },
          {
            "file": "applications/APP001/codebase/app/api/governance/violations/recent/route.ts",
            "term": "governance",
            "context": "        detected_at,\n        policy_id,\n        governance_policies (\n          policy_name\n        )\n--\n      status: violation.status,\n      detectedAt: violation.detected_at,\n      policyName: viol"
          },
          {
            "file": "applications/APP001/codebase/app/governance/page.tsx",
            "term": "governance",
            "context": "      setLoading(true);\n      \n      // Load all governance data in parallel\n      const [metricsRes, complianceRes, violationsRes, reviewsRes] = await Promise.all([\n        fetch('/api/governance/met"
          },
          {
            "file": "applications/APP001/codebase/scripts/add-sd-2025-001-to-database.js",
            "term": "governance",
            "context": " *\n * Venture app can no longer write Strategic Directives directly. Use the\n * governance service API (`/api/governance/sd`) so changes run through\n * EHG_Engineering migrations and RLS.\n */\n\nconsole"
          },
          {
            "file": "applications/APP001/codebase/scripts/seed/governance.seed.ts",
            "term": "governance",
            "context": "\nexport async function seedGovernanceData() {\n  console.log('🏛️ Seeding governance data...');\n\n  try {\n--\n\n    const { data: policies, error: policiesError } = await supabase\n      .from('governance_"
          },
          {
            "file": "applications/APP001/codebase/src/App.tsx",
            "term": "governance",
            "context": "import Phase2TestingDashboard from \"./pages/Phase2TestingDashboard\";\nimport SettingsPage from \"../app/settings/page\";\nimport GovernancePage from \"../app/governance/page\";\nimport DataManagementPage fro"
          },
          {
            "file": "applications/APP001/codebase/src/components/auth/RoleBasedAccess.tsx",
            "term": "governance",
            "context": "  name: string;\n  description: string;\n  category: 'ventures' | 'analytics' | 'governance' | 'system';\n  level: 'read' | 'write' | 'admin';\n}\n--\n  \n  // Governance\n  { id: 'governance_view', name: 'Vi"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataGovernanceDashboard.tsx",
            "term": "governance",
            "context": "\n    } catch (error) {\n      console.error('Error loading governance data:', error);\n      toast({\n        title: 'Error',\n        description: 'Failed to load governance data',\n        variant: 'dest"
          },
          {
            "file": "applications/APP001/codebase/src/components/data-management/DataLifecycleDashboard.tsx",
            "term": "governance",
            "context": "          <h1 className=\"text-3xl font-bold tracking-tight\">Data Lifecycle Management</h1>\n          <p className=\"text-muted-foreground\">\n            AI-powered data lifecycle optimization and govern"
          },
          {
            "file": "applications/APP001/codebase/src/components/governance/AccessReviewDashboard.tsx",
            "term": "governance",
            "context": "} from 'lucide-react';\nimport { useToast } from '@/hooks/use-toast';\nimport { AccessReviewWorkflow } from '@/types/governance';\n\ninterface AccessReviewItem {\n--\n  const fetchWorkflows = async () => {\n"
          }
        ],
        "recommendation": "USE_EXISTING",
        "similarity_score": 100
      }
    },
    "human_review_required": true,
    "human_review_reasons": [
      "High similarity score (1240%) - possible duplicate implementation"
    ],
    "approval_recommendation": "BLOCKED",
    "recommended_actions": [
      "Review existing implementation and consider enhancing instead of duplicating"
    ],
    "evidence_collected": null,
    "validated_by": "LEAD",
    "created_at": "2025-09-23T17:58:47.118Z",
    "updated_at": "2025-09-23T17:58:47.118Z"
  }
]
```

### Schema: `leo_complexity_thresholds`

**Row Count**: 4

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| factor_name | character varying(100) | NO | NULL |
| threshold_config | jsonb | NO | NULL |
| active | boolean | YES | true |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_53711_1_not_null | CHECK | - | - |
| 2200_53711_2_not_null | CHECK | - | - |
| 2200_53711_3_not_null | CHECK | - | - |
| leo_complexity_thresholds_pkey | PRIMARY KEY | id | leo_complexity_thresholds(id) |
| leo_complexity_thresholds_factor_name_key | UNIQUE | factor_name | leo_complexity_thresholds(factor_name) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_complexity_thresholds | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_complexity_thresholds | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 4 rows)

```json
[
  {
    "id": "87c8adbc-eb08-407a-834d-573df4bc7d67",
    "factor_name": "functional_requirements_count",
    "threshold_config": {
      "deep": {
        "max": 10,
        "min": 5
      },
      "quick": {
        "max": 2,
        "min": 0
      },
      "ultra": {
        "max": 999,
        "min": 10
      },
      "standard": {
        "max": 5,
        "min": 2
      }
    },
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "109ab6cb-45e8-4ee3-9afe-3fc169b92325",
    "factor_name": "priority_level",
    "threshold_config": {
      "deep": {
        "max": 89,
        "min": 70
      },
      "quick": {
        "max": 30,
        "min": 0
      },
      "ultra": {
        "max": 100,
        "min": 90
      },
      "standard": {
        "max": 70,
        "min": 30
      }
    },
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "dc23afcb-58b3-40c8-97c4-19b89e012db5",
    "factor_name": "technical_complexity",
    "threshold_config": {
      "deep": {
        "keywords": [
          "complex",
          "advanced",
          "integration"
        ]
      },
      "quick": {
        "keywords": [
          "simple",
          "basic",
          "straightforward"
        ]
      },
      "ultra": {
        "keywords": [
          "critical",
          "mission-critical",
          "enterprise",
          "security",
          "performance"
        ]
      },
      "standard": {
        "keywords": [
          "moderate",
          "standard",
          "typical"
        ]
      }
    },
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "76bf4885-25b3-47a2-b042-2525da9ebe75",
    "factor_name": "risk_factors",
    "threshold_config": {
      "deep": {
        "keywords": [
          "high-risk",
          "compliance",
          "audit"
        ]
      },
      "quick": {
        "keywords": [
          "low-risk",
          "minor"
        ]
      },
      "ultra": {
        "keywords": [
          "critical-risk",
          "security",
          "data-breach",
          "downtime"
        ]
      },
      "standard": {
        "keywords": [
          "moderate-risk",
          "standard"
        ]
      }
    },
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  }
]
```

### Schema: `leo_gate_reviews`

**Row Count**: 65

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| gate | text | NO | NULL |
| score | numeric | NO | NULL |
| evidence | jsonb | NO | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| created_by | text | YES | 'system'::text |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40012_1_not_null | CHECK | - | - |
| 2200_40012_2_not_null | CHECK | - | - |
| 2200_40012_3_not_null | CHECK | - | - |
| 2200_40012_4_not_null | CHECK | - | - |
| 2200_40012_5_not_null | CHECK | - | - |
| 2200_40012_6_not_null | CHECK | - | - |
| leo_gate_reviews_gate_check | CHECK | - | leo_gate_reviews(gate) |
| leo_gate_reviews_score_check | CHECK | - | leo_gate_reviews(score) |
| leo_gate_reviews_pkey | PRIMARY KEY | id | leo_gate_reviews(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_gate_reviews | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_gate_reviews | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "a74ee886-1a5a-4347-8be8-a6e76ff4d289",
    "prd_id": "PRD-SD-001",
    "gate": "2C",
    "score": "0.00",
    "evidence": {
      "riskSpikesClosed": false,
      "securityScanClean": false
    },
    "created_at": "2025-10-26T19:05:47.400Z",
    "created_by": "gate-runner"
  },
  {
    "id": "d49e3ff7-f06c-45b1-a000-302290082e4c",
    "prd_id": "PRD-SD-001",
    "gate": "3",
    "score": "0.00",
    "evidence": {
      "supervisorChecklistPass": false
    },
    "created_at": "2025-10-26T19:05:48.833Z",
    "created_by": "gate-runner"
  },
  {
    "id": "447ed12e-b3b8-4fa0-af16-3dc36bf474ea",
    "prd_id": "PRD-SD-001",
    "gate": "2D",
    "score": "0.00",
    "evidence": {
      "testPlanMatrices": false,
      "coverageTargetSet": false,
      "nfrBudgetsPresent": false
    },
    "created_at": "2025-10-26T19:05:50.064Z",
    "created_by": "gate-runner"
  },
  {
    "id": "d9815349-0f85-411e-ab66-d429f9ea76bd",
    "prd_id": "PRD-SD-001",
    "gate": "2A",
    "score": "0.00",
    "evidence": {
      "hasADR": false,
      "hasInterfaces": false,
      "hasTechDesign": false
    },
    "created_at": "2025-10-26T19:05:50.230Z",
    "created_by": "gate-runner"
  },
  {
    "id": "ddbfd3b2-b46e-4e40-998a-a382a6e03134",
    "prd_id": "PRD-SD-CICD-WORKFLOW-FIX",
    "gate": "2B",
    "score": "0.00",
    "evidence": {
      "dbSchemaReady": false,
      "designArtifacts": false
    },
    "created_at": "2025-10-22T00:35:37.361Z",
    "created_by": "gate-runner"
  }
]
```

### Schema: `leo_handoff_executions`

**Row Count**: 358

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | NO | NULL |
| handoff_type | text | NO | NULL |
| from_agent | text | NO | NULL |
| to_agent | text | NO | NULL |
| executive_summary | text | YES | NULL |
| deliverables_manifest | jsonb | YES | '[]'::jsonb |
| verification_results | jsonb | YES | '{}'::jsonb |
| compliance_status | jsonb | YES | '{}'::jsonb |
| quality_metrics | jsonb | YES | '{}'::jsonb |
| recommendations | jsonb | YES | '[]'::jsonb |
| action_items | jsonb | YES | '[]'::jsonb |
| status | text | YES | 'created'::text |
| validation_score | integer | YES | NULL |
| rejection_reason | text | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| accepted_at | timestamp with time zone | YES | NULL |
| created_by | text | YES | 'SYSTEM'::text |
| file_path | text | YES | NULL |
| initiated_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | NULL |
| validation_passed | boolean | YES | NULL |
| validation_details | jsonb | YES | NULL |
| prd_id | text | YES | NULL |
| template_id | integer | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_53418_1_not_null | CHECK | - | - |
| 2200_53418_2_not_null | CHECK | - | - |
| 2200_53418_3_not_null | CHECK | - | - |
| 2200_53418_4_not_null | CHECK | - | - |
| 2200_53418_5_not_null | CHECK | - | - |
| leo_handoff_executions_status_check | CHECK | - | leo_handoff_executions(status) |
| leo_handoff_executions_validation_score_check | CHECK | - | leo_handoff_executions(validation_score) |
| fk_handoff_template | FOREIGN KEY | template_id | leo_handoff_templates(id) |
| leo_handoff_executions_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| leo_handoff_executions_pkey | PRIMARY KEY | id | leo_handoff_executions(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_handoff_executions | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_handoff_executions | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "07fd040b-13dd-4903-8aa3-d154ec5c32c6",
    "sd_id": "SD-RETRO-ENHANCE-001",
    "handoff_type": "LEAD-to-PLAN",
    "from_agent": "LEAD",
    "to_agent": "PLAN",
    "executive_summary": null,
    "deliverables_manifest": [],
    "verification_results": {},
    "compliance_status": {},
    "quality_metrics": {},
    "recommendations": [],
    "action_items": [],
    "status": "accepted",
    "validation_score": 100,
    "rejection_reason": null,
    "created_at": "2025-10-16T11:40:26.785Z",
    "accepted_at": "2025-10-16T11:40:26.624Z",
    "created_by": "UNIFIED-HANDOFF-SYSTEM",
    "file_path": null,
    "initiated_at": "2025-10-16T11:40:26.785Z",
    "completed_at": "2025-10-16T11:40:26.624Z",
    "validation_passed": true,
    "validation_details": {
      "result": {
        "sdId": "SD-RETRO-ENHANCE-001",
        "success": true,
        "executionId": "PLAN-SD-RETRO-ENHANCE-001-1760614826525",
        "qualityScore": 100
      },
      "verifier": "unified-handoff-system.js",
      "verified_at": "2025-10-16T11:40:26.624Z"
    },
    "prd_id": null,
    "template_id": 1
  },
  {
    "id": "a1ac201d-d7e1-40b0-9a76-29ae8ed467f2",
    "sd_id": "SD-KNOWLEDGE-001",
    "handoff_type": "LEAD-to-PLAN",
    "from_agent": "LEAD",
    "to_agent": "PLAN",
    "executive_summary": null,
    "deliverables_manifest": [],
    "verification_results": {},
    "compliance_status": {},
    "quality_metrics": {},
    "recommendations": [],
    "action_items": [],
    "status": "rejected",
    "validation_score": 0,
    "rejection_reason": "SD status is 'pending_approval', expected 'active', 'approved', or 'in_progress'",
    "created_at": "2025-10-18T16:24:05.225Z",
    "accepted_at": null,
    "created_by": "UNIFIED-HANDOFF-SYSTEM",
    "file_path": null,
    "initiated_at": "2025-10-18T16:24:05.225Z",
    "completed_at": "2025-10-18T16:24:03.410Z",
    "validation_passed": false,
    "validation_details": {
      "reason": "SD_STATUS",
      "result": {
        "message": "SD status is 'pending_approval', expected 'active', 'approved', or 'in_progress'",
        "success": false,
        "rejected": true,
        "reasonCode": "SD_STATUS",
        "rejectionId": "REJ-SD-KNOWLEDGE-001-1760804643365",
        "improvements": {
          "actions": [
            "Review SD content",
            "Finalize strategic direction",
            "Update status to active"
          ],
          "required": [
            "Update Strategic Directive status to active or approved"
          ],
          "instructions": "Strategic Directive must be approved before technical planning can begin.",
          "timeEstimate": "30-60 minutes"
        }
      },
      "message": "SD status is 'pending_approval', expected 'active', 'approved', or 'in_progress'",
      "rejected_at": "2025-10-18T16:24:03.409Z"
    },
    "prd_id": null,
    "template_id": 1
  },
  {
    "id": "ead26405-18f1-4ae2-a411-47b337e4d173",
    "sd_id": "SD-KNOWLEDGE-001",
    "handoff_type": "EXEC-to-PLAN",
    "from_agent": "EXEC",
    "to_agent": "PLAN",
    "executive_summary": "EXEC phase completed for SD-KNOWLEDGE-001 automated knowledge retrieval system. Implementation includes 3 database tables (tech_stack_references, prd_research_audit_log, system_health), knowledge retrieval pipeline with circuit breaker pattern, and 6 integration fixes.",
    "deliverables_manifest": {
      "items": [
        "tech_stack_references table (cache with 24-hour TTL)",
        "prd_research_audit_log table (telemetry)",
        "system_health table (circuit breaker state)",
        "user_stories.implementation_context column (JSONB)",
        "product_requirements_v2.research_confidence_score column",
        "automated-knowledge-retrieval.js (main orchestrator)",
        "context7-circuit-breaker.js (resilience pattern)",
        "20251015200000_knowledge_retrieval_system.sql",
        "20251015210000_fix_system_health_rls.sql",
        "integration-fixes-knowledge-001.md (6 issues resolved)",
        "RLS policies for all 3 tables",
        "6 integration issues resolved"
      ]
    },
    "verification_results": {
      "passed": true,
      "reason": "Handoffs were successfully executed but failed to store due to UUID type mismatch bug",
      "verifier": "retroactive-handoff-creation",
      "verified_at": "2025-01-13T18:45:00Z"
    },
    "compliance_status": {},
    "quality_metrics": {},
    "recommendations": [],
    "action_items": [],
    "status": "accepted",
    "validation_score": 100,
    "rejection_reason": null,
    "created_at": "2025-01-13T18:45:00.000Z",
    "accepted_at": "2025-01-13T18:45:00.000Z",
    "created_by": "UNIFIED-HANDOFF-SYSTEM-RETROACTIVE",
    "file_path": null,
    "initiated_at": "2025-10-18T16:24:31.244Z",
    "completed_at": null,
    "validation_passed": null,
    "validation_details": null,
    "prd_id": null,
    "template_id": null
  },
  {
    "id": "5bd6fc59-3f8e-43dd-be1f-dba43682b412",
    "sd_id": "SD-KNOWLEDGE-001",
    "handoff_type": "PLAN-to-LEAD",
    "from_agent": "PLAN",
    "to_agent": "LEAD",
    "executive_summary": "PLAN verification completed for SD-KNOWLEDGE-001. All EXEC deliverables verified, sub-agents passed (GITHUB + TESTING), retrospective generated with quality score. Ready for LEAD final approval.",
    "deliverables_manifest": {
      "items": [
        "EXEC→PLAN handoff validated",
        "Sub-agent verification completed (GITHUB + TESTING agents)",
        "BMAD validation passed",
        "User stories validated",
        "Test plan verified",
        "Retrospective generated",
        "Integration issues documented and resolved"
      ]
    },
    "verification_results": {
      "passed": true,
      "reason": "Handoffs were successfully executed but failed to store due to UUID type mismatch bug",
      "verifier": "retroactive-handoff-creation",
      "verified_at": "2025-01-13T18:46:00Z"
    },
    "compliance_status": {},
    "quality_metrics": {},
    "recommendations": [],
    "action_items": [],
    "status": "accepted",
    "validation_score": 100,
    "rejection_reason": null,
    "created_at": "2025-01-13T18:46:00.000Z",
    "accepted_at": "2025-01-13T18:46:00.000Z",
    "created_by": "UNIFIED-HANDOFF-SYSTEM-RETROACTIVE",
    "file_path": null,
    "initiated_at": "2025-10-18T16:24:31.295Z",
    "completed_at": null,
    "validation_passed": null,
    "validation_details": null,
    "prd_id": null,
    "template_id": null
  },
  {
    "id": "d12e8bed-4e30-44c8-ad78-4b3a15cc2868",
    "sd_id": "SD-VIF-TIER-001",
    "handoff_type": "PLAN-to-EXEC",
    "from_agent": "PLAN",
    "to_agent": "EXEC",
    "executive_summary": null,
    "deliverables_manifest": [],
    "verification_results": {},
    "compliance_status": {},
    "quality_metrics": {},
    "recommendations": [],
    "action_items": [],
    "status": "rejected",
    "validation_score": 0,
    "rejection_reason": "BMAD validation failed - User story context engineering requires ≥80% coverage (current: 0%) - run STORIES sub-agent before PLAN→EXEC handoff; SD has 10 stories but no checkpoint plan - generate before PLAN→EXEC handoff",
    "created_at": "2025-10-17T01:03:20.860Z",
    "accepted_at": null,
    "created_by": "UNIFIED-HANDOFF-SYSTEM",
    "file_path": null,
    "initiated_at": "2025-10-17T01:03:20.860Z",
    "completed_at": "2025-10-17T01:03:19.207Z",
    "validation_passed": false,
    "validation_details": {
      "reason": "BMAD_VALIDATION_FAILED",
      "result": {
        "details": {
          "score": 0,
          "issues": [
            "User story context engineering requires ≥80% coverage (current: 0%) - run STORIES sub-agent before PLAN→EXEC handoff",
            "SD has 10 stories but no checkpoint plan - generate before PLAN→EXEC handoff"
          ],
          "passed": false,
          "details": {
            "checkpoint_plan": {
              "verdict": "FAIL",
              "remediation": "node scripts/generate-checkpoint-plan.js SD-VIF-TIER-001",
              "story_count": 10,
              "recommendation": "Generate checkpoint plan for better context management"
            },
            "stories_context_engineering": {
              "verdict": "FAIL",
              "coverage": 0,
              "remediation": "node lib/sub-agent-executor.js STORIES SD-VIF-TIER-001",
              "total_stories": 10,
              "stories_with_context": 0
            }
          },
          "warnings": [],
          "max_score": 100
        },
        "message": "BMAD validation failed - User story context engineering requires ≥80% coverage (current: 0%) - run STORIES sub-agent before PLAN→EXEC handoff; SD has 10 stories but no checkpoint plan - generate before PLAN→EXEC handoff",
        "success": false,
        "rejected": true,
        "reasonCode": "BMAD_VALIDATION_FAILED"
      },
      "message": "BMAD validation failed - User story context engineering requires ≥80% coverage (current: 0%) - run STORIES sub-agent before PLAN→EXEC handoff; SD has 10 stories but no checkpoint plan - generate before PLAN→EXEC handoff",
      "rejected_at": "2025-10-17T01:03:19.207Z"
    },
    "prd_id": null,
    "template_id": null
  }
]
```

### Schema: `leo_handoff_rejections`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| execution_id | uuid | YES | NULL |
| rejected_at | timestamp with time zone | YES | now() |
| rejected_by | text | YES | NULL |
| rejection_reason | text | NO | NULL |
| required_improvements | jsonb | NO | '[]'::jsonb |
| blocking_validations | jsonb | YES | '[]'::jsonb |
| recommended_actions | jsonb | YES | '[]'::jsonb |
| return_to_agent | text | NO | NULL |
| retry_instructions | text | YES | NULL |
| estimated_fix_time | text | YES | NULL |
| resolved_at | timestamp with time zone | YES | NULL |
| resolution_notes | text | YES | NULL |
| metadata | jsonb | YES | '{}'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_66657_1_not_null | CHECK | - | - |
| 2200_66657_5_not_null | CHECK | - | - |
| 2200_66657_6_not_null | CHECK | - | - |
| 2200_66657_9_not_null | CHECK | - | - |
| leo_handoff_rejections_execution_id_fkey | FOREIGN KEY | execution_id | leo_handoff_executions(id) |
| leo_handoff_rejections_pkey | PRIMARY KEY | id | leo_handoff_rejections(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_handoff_rejections | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_handoff_rejections | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_handoff_templates`

**Row Count**: 5

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('leo_handoff_templates_id_seq'::regclass) |
| from_agent | character varying(10) | NO | NULL |
| to_agent | character varying(10) | NO | NULL |
| handoff_type | character varying(50) | NO | NULL |
| template_structure | jsonb | NO | NULL |
| required_elements | jsonb | YES | '[]'::jsonb |
| validation_rules | jsonb | YES | '[]'::jsonb |
| active | boolean | YES | true |
| version | integer | YES | 1 |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23187_1_not_null | CHECK | - | - |
| 2200_23187_2_not_null | CHECK | - | - |
| 2200_23187_3_not_null | CHECK | - | - |
| 2200_23187_4_not_null | CHECK | - | - |
| 2200_23187_5_not_null | CHECK | - | - |
| leo_handoff_templates_from_agent_fkey | FOREIGN KEY | from_agent | leo_agents(agent_code) |
| leo_handoff_templates_to_agent_fkey | FOREIGN KEY | to_agent | leo_agents(agent_code) |
| leo_handoff_templates_pkey | PRIMARY KEY | id | leo_handoff_templates(id) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | to_agent | leo_handoff_templates(version) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | handoff_type | leo_handoff_templates(from_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | handoff_type | leo_handoff_templates(handoff_type) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | handoff_type | leo_handoff_templates(to_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | handoff_type | leo_handoff_templates(version) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | version | leo_handoff_templates(from_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | version | leo_handoff_templates(handoff_type) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | version | leo_handoff_templates(to_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | version | leo_handoff_templates(version) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | to_agent | leo_handoff_templates(from_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | from_agent | leo_handoff_templates(version) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | from_agent | leo_handoff_templates(to_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | from_agent | leo_handoff_templates(handoff_type) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | to_agent | leo_handoff_templates(handoff_type) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | from_agent | leo_handoff_templates(from_agent) |
| leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key | UNIQUE | to_agent | leo_handoff_templates(to_agent) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_handoff_templates | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_handoff_templates | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": 14,
    "from_agent": "PLAN",
    "to_agent": "EXEC",
    "handoff_type": "plan_presentation",
    "template_structure": {
      "sections": [
        {
          "name": "goal_summary",
          "type": "string",
          "required": true,
          "max_length": 300,
          "description": "Brief summary (2-3 sentences) of what will be implemented"
        },
        {
          "name": "file_scope",
          "type": "object",
          "required": true,
          "structure": {
            "create": {
              "type": "array",
              "items": "string"
            },
            "delete": {
              "type": "array",
              "items": "string"
            },
            "modify": {
              "type": "array",
              "items": "string"
            }
          },
          "description": "Files to create, modify, or delete"
        },
        {
          "name": "execution_plan",
          "type": "array",
          "required": true,
          "min_items": 1,
          "description": "Step-by-step implementation sequence"
        },
        {
          "name": "dependency_impacts",
          "type": "object",
          "required": false,
          "description": "Dependencies and their impacts"
        },
        {
          "name": "testing_strategy",
          "type": "object",
          "required": true,
          "structure": {
            "e2e_tests": {
              "type": "string"
            },
            "unit_tests": {
              "type": "string"
            },
            "verification_steps": {
              "type": "array"
            }
          },
          "description": "How to verify implementation"
        }
      ]
    },
    "required_elements": [
      "goal_summary present and ≤300 chars",
      "file_scope has at least one of: create, modify, delete",
      "execution_plan has ≥1 step",
      "testing_strategy has both unit_tests and e2e_tests defined"
    ],
    "validation_rules": [
      "validate_goal_summary_length",
      "validate_file_scope_not_empty",
      "validate_execution_plan_steps",
      "validate_testing_strategy_complete"
    ],
    "active": true,
    "version": 1,
    "created_at": "2025-10-19T03:48:03.111Z"
  },
  {
    "id": 15,
    "from_agent": "EXEC",
    "to_agent": "PLAN",
    "handoff_type": "EXEC-to-PLAN-VERIFICATION",
    "template_structure": {
      "action_items": "string",
      "known_issues": "string",
      "key_decisions": "string",
      "rca_integration": {
        "rcr_details": [
          {
            "rcr_id": "uuid",
            "status": "string",
            "capa_id": "uuid",
            "severity": "string",
            "exit_criteria": "string",
            "verification_plan": "string"
          }
        ],
        "open_rcr_count": "integer",
        "blocking_rcr_ids": "uuid[]",
        "capa_verification_status": "string (ALL_VERIFIED|PENDING|BLOCKED)"
      },
      "executive_summary": "string",
      "completeness_report": "string",
      "resource_utilization": "string",
      "deliverables_manifest": "string"
    },
    "required_elements": [
      "executive_summary",
      "deliverables_manifest",
      "key_decisions",
      "known_issues",
      "resource_utilization",
      "action_items",
      "completeness_report",
      "rca_integration"
    ],
    "validation_rules": {
      "rca_integration": {
        "rule": "If open_rcr_count > 0, capa_verification_status must be ALL_VERIFIED to proceed",
        "blocking_condition": "capa_verification_status != ALL_VERIFIED AND any rcr severity IN (P0, P1)"
      }
    },
    "active": true,
    "version": 2,
    "created_at": "2025-10-28T16:06:10.718Z"
  },
  {
    "id": 1,
    "from_agent": "LEAD",
    "to_agent": "PLAN",
    "handoff_type": "strategic_to_technical",
    "template_structure": {
      "sections": [
        "Executive Summary",
        "Completeness Report",
        "Deliverables Manifest",
        "Key Decisions & Rationale",
        "Known Issues & Risks",
        "Resource Utilization",
        "Action Items for Receiver"
      ]
    },
    "required_elements": [
      {
        "element": "SD created",
        "required": true
      },
      {
        "element": "Objectives defined",
        "required": true
      },
      {
        "element": "Priority set",
        "required": true
      }
    ],
    "validation_rules": [],
    "active": true,
    "version": 1,
    "created_at": "2025-09-04T01:49:02.925Z"
  },
  {
    "id": 13,
    "from_agent": "PLAN",
    "to_agent": "LEAD",
    "handoff_type": "verification_to_approval",
    "template_structure": {
      "sections": [
        "Executive Summary",
        "Completeness Report",
        "Deliverables Manifest",
        "Key Decisions & Rationale",
        "Known Issues & Risks",
        "Resource Utilization",
        "Action Items for Receiver"
      ]
    },
    "required_elements": [
      {
        "element": "EXEC work complete",
        "required": true
      },
      {
        "element": "Sub-agent verifications complete",
        "required": true
      },
      {
        "element": "EXEC checklist >= 80%",
        "required": true
      }
    ],
    "validation_rules": [
      {
        "rule": "prd_status_verification",
        "required": true
      },
      {
        "rule": "exec_handoff_exists",
        "required": true
      },
      {
        "rule": "minimum_score",
        "threshold": 70
      }
    ],
    "active": true,
    "version": 1,
    "created_at": "2025-10-04T18:50:19.037Z"
  },
  {
    "id": 3,
    "from_agent": "EXEC",
    "to_agent": "PLAN",
    "handoff_type": "implementation_to_verification",
    "template_structure": {
      "sections": [
        "Executive Summary",
        "Completeness Report",
        "Deliverables Manifest",
        "Key Decisions & Rationale",
        "Known Issues & Risks",
        "Resource Utilization",
        "Action Items for Receiver"
      ]
    },
    "required_elements": [
      {
        "element": "Implementation complete",
        "required": true
      },
      {
        "element": "Tests passing",
        "required": true
      },
      {
        "element": "Documentation updated",
        "required": true
      },
      {
        "format": "Command + pass/fail count + coverage %",
        "element": "Unit Test Results",
        "evidence": "SD-EXPORT-001",
        "required": true
      },
      {
        "format": "Command + pass/fail count + screenshot URL + Playwright report",
        "element": "E2E Test Results",
        "evidence": "SD-EXPORT-001, SD-EVA-MEETING-002",
        "required": true
      },
      {
        "format": "Total stories / Validated stories / Coverage % (must be 100%)",
        "element": "User Story Coverage",
        "evidence": "SD-EVA-MEETING-001",
        "required": true
      }
    ],
    "validation_rules": [],
    "active": true,
    "version": 1,
    "created_at": "2025-09-04T01:49:03.121Z"
  }
]
```

### Schema: `leo_handoff_validations`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| execution_id | uuid | YES | NULL |
| validator_type | text | NO | NULL |
| passed | boolean | NO | NULL |
| score | integer | YES | 0 |
| max_score | integer | YES | 100 |
| percentage | integer | YES | NULL |
| validation_details | jsonb | NO | '{}'::jsonb |
| errors | jsonb | YES | '[]'::jsonb |
| warnings | jsonb | YES | '[]'::jsonb |
| blocking_issues | jsonb | YES | '[]'::jsonb |
| validated_at | timestamp with time zone | YES | now() |
| validator_version | text | YES | NULL |
| metadata | jsonb | YES | '{}'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_66634_1_not_null | CHECK | - | - |
| 2200_66634_3_not_null | CHECK | - | - |
| 2200_66634_4_not_null | CHECK | - | - |
| 2200_66634_8_not_null | CHECK | - | - |
| leo_handoff_validations_validator_type_check | CHECK | - | leo_handoff_validations(validator_type) |
| leo_handoff_validations_execution_id_fkey | FOREIGN KEY | execution_id | leo_handoff_executions(id) |
| leo_handoff_validations_pkey | PRIMARY KEY | id | leo_handoff_validations(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_handoff_validations | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_handoff_validations | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_interfaces`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| name | text | NO | NULL |
| kind | text | NO | NULL |
| spec | jsonb | NO | NULL |
| version | text | NO | NULL |
| validation_status | text | YES | NULL |
| validation_errors | jsonb | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40105_1_not_null | CHECK | - | - |
| 2200_40105_2_not_null | CHECK | - | - |
| 2200_40105_3_not_null | CHECK | - | - |
| 2200_40105_4_not_null | CHECK | - | - |
| 2200_40105_5_not_null | CHECK | - | - |
| 2200_40105_6_not_null | CHECK | - | - |
| leo_interfaces_kind_check | CHECK | - | leo_interfaces(kind) |
| leo_interfaces_validation_status_check | CHECK | - | leo_interfaces(validation_status) |
| leo_interfaces_pkey | PRIMARY KEY | id | leo_interfaces(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_interfaces | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_interfaces | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_mandatory_validations`

**Row Count**: 2

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | YES | NULL |
| prd_id | text | YES | NULL |
| phase | text | YES | NULL |
| sub_agent_code | text | YES | NULL |
| status | text | YES | NULL |
| results | jsonb | YES | NULL |
| created_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49498_1_not_null | CHECK | - | - |
| leo_mandatory_validations_phase_check | CHECK | - | leo_mandatory_validations(phase) |
| leo_mandatory_validations_status_check | CHECK | - | leo_mandatory_validations(status) |
| leo_mandatory_validations_sub_agent_code_fkey | FOREIGN KEY | sub_agent_code | leo_sub_agents(code) |
| leo_mandatory_validations_pkey | PRIMARY KEY | id | leo_mandatory_validations(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_mandatory_validations | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_mandatory_validations | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 2 rows)

```json
[
  {
    "id": "d21c18c6-29af-4d9b-a6ce-3a136bc6ef73",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "phase": "LEAD_TO_PLAN",
    "sub_agent_code": "VALIDATION",
    "status": "failed",
    "results": {
      "status": "blocked",
      "mandatory": true,
      "execution_time": "2025-09-23T13:32:09.884Z"
    },
    "created_at": "2025-09-23T17:32:10.815Z",
    "updated_at": "2025-09-23T17:32:10.815Z"
  },
  {
    "id": "b3805733-143b-49c5-b327-1018c339a344",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "phase": "LEAD_TO_PLAN",
    "sub_agent_code": "SECURITY",
    "status": "passed",
    "results": {
      "status": "passed",
      "mandatory": true,
      "execution_time": "2025-09-23T13:32:09.933Z"
    },
    "created_at": "2025-09-23T17:32:10.864Z",
    "updated_at": "2025-09-23T17:32:10.864Z"
  }
]
```

### Schema: `leo_nfr_requirements`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| perf_budget_ms | integer | YES | NULL |
| bundle_kb | integer | YES | NULL |
| memory_mb | integer | YES | NULL |
| cpu_percent | integer | YES | NULL |
| a11y_level | text | YES | NULL |
| security_profile | text | YES | NULL |
| compliance_standards | jsonb | YES | '[]'::jsonb |
| telemetry_spec | jsonb | YES | '{}'::jsonb |
| sla_requirements | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40132_1_not_null | CHECK | - | - |
| 2200_40132_2_not_null | CHECK | - | - |
| leo_nfr_requirements_a11y_level_check | CHECK | - | leo_nfr_requirements(a11y_level) |
| leo_nfr_requirements_bundle_kb_check | CHECK | - | leo_nfr_requirements(bundle_kb) |
| leo_nfr_requirements_cpu_percent_check | CHECK | - | leo_nfr_requirements(cpu_percent) |
| leo_nfr_requirements_memory_mb_check | CHECK | - | leo_nfr_requirements(memory_mb) |
| leo_nfr_requirements_perf_budget_ms_check | CHECK | - | leo_nfr_requirements(perf_budget_ms) |
| leo_nfr_requirements_security_profile_check | CHECK | - | leo_nfr_requirements(security_profile) |
| leo_nfr_requirements_pkey | PRIMARY KEY | id | leo_nfr_requirements(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_nfr_requirements | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_nfr_requirements | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_protocol_changes`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('leo_protocol_changes_id_seq'::regclass) |
| protocol_id | character varying(50) | NO | NULL |
| change_type | character varying(50) | NO | NULL |
| description | text | YES | NULL |
| changed_fields | jsonb | YES | '{}'::jsonb |
| changed_by | character varying(100) | YES | NULL |
| change_reason | text | YES | NULL |
| timestamp | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| metadata | jsonb | YES | '{}'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23270_1_not_null | CHECK | - | - |
| 2200_23270_2_not_null | CHECK | - | - |
| 2200_23270_3_not_null | CHECK | - | - |
| leo_protocol_changes_protocol_id_fkey | FOREIGN KEY | protocol_id | leo_protocols(id) |
| leo_protocol_changes_pkey | PRIMARY KEY | id | leo_protocol_changes(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_protocol_changes | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_protocol_changes | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_protocol_file_audit`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_type | text | NO | NULL |
| agent_id | text | YES | NULL |
| operation | text | NO | NULL |
| file_path | text | NO | NULL |
| leo_phase | text | YES | NULL |
| handoff_id | text | YES | NULL |
| sd_id | text | YES | NULL |
| is_authorized | boolean | YES | false |
| violates_database_first | boolean | YES | false |
| operation_timestamp | timestamp with time zone | YES | now() |
| operation_details | jsonb | YES | NULL |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_52789_1_not_null | CHECK | - | - |
| 2200_52789_2_not_null | CHECK | - | - |
| 2200_52789_4_not_null | CHECK | - | - |
| 2200_52789_5_not_null | CHECK | - | - |
| leo_protocol_file_audit_agent_type_check | CHECK | - | leo_protocol_file_audit(agent_type) |
| leo_protocol_file_audit_leo_phase_check | CHECK | - | leo_protocol_file_audit(leo_phase) |
| leo_protocol_file_audit_operation_check | CHECK | - | leo_protocol_file_audit(operation) |
| leo_protocol_file_audit_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| leo_protocol_file_audit_pkey | PRIMARY KEY | id | leo_protocol_file_audit(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_protocol_file_audit | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_protocol_file_audit | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_protocol_references`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('leo_protocol_references_id_seq'::regclass) |
| protocol_id | character varying(50) | NO | NULL |
| reference_type | character varying(50) | NO | NULL |
| reference_id | character varying(100) | YES | NULL |
| reference_table | character varying(100) | YES | NULL |
| description | text | YES | NULL |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23287_1_not_null | CHECK | - | - |
| 2200_23287_2_not_null | CHECK | - | - |
| 2200_23287_3_not_null | CHECK | - | - |
| leo_protocol_references_protocol_id_fkey | FOREIGN KEY | protocol_id | leo_protocols(id) |
| leo_protocol_references_pkey | PRIMARY KEY | id | leo_protocol_references(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_protocol_references | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_protocol_references | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_protocol_sections`

**Row Count**: 83

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('leo_protocol_sections_id_seq'::regclass) |
| protocol_id | character varying(50) | NO | NULL |
| section_type | character varying(50) | NO | NULL |
| title | character varying(500) | NO | NULL |
| content | text | NO | NULL |
| order_index | integer | NO | NULL |
| metadata | jsonb | YES | '{}'::jsonb |
| context_tier | text | YES | NULL |
| target_file | text | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23156_1_not_null | CHECK | - | - |
| 2200_23156_2_not_null | CHECK | - | - |
| 2200_23156_3_not_null | CHECK | - | - |
| 2200_23156_4_not_null | CHECK | - | - |
| 2200_23156_5_not_null | CHECK | - | - |
| 2200_23156_6_not_null | CHECK | - | - |
| leo_protocol_sections_context_tier_check | CHECK | - | leo_protocol_sections(context_tier) |
| leo_protocol_sections_protocol_id_fkey | FOREIGN KEY | protocol_id | leo_protocols(id) |
| leo_protocol_sections_pkey | PRIMARY KEY | id | leo_protocol_sections(id) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | order_index | leo_protocol_sections(order_index) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | order_index | leo_protocol_sections(protocol_id) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | order_index | leo_protocol_sections(section_type) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | section_type | leo_protocol_sections(protocol_id) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | protocol_id | leo_protocol_sections(section_type) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | protocol_id | leo_protocol_sections(protocol_id) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | protocol_id | leo_protocol_sections(order_index) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | section_type | leo_protocol_sections(order_index) |
| leo_protocol_sections_protocol_id_section_type_order_index_key | UNIQUE | section_type | leo_protocol_sections(section_type) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| anon_read_leo_protocol_sections | SELECT | "{anon}" | PERMISSIVE |
| authenticated_read_leo_protocol_sections | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_protocol_sections | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": 5,
    "protocol_id": "leo-v4-2-0-story-gates",
    "section_type": "file_warning",
    "title": "⚠️ DO NOT EDIT THIS FILE DIRECTLY",
    "content": "**This file is AUTO-GENERATED from the database.**\n\n## To Make Changes:\n1. **For dynamic content** (agents, sub-agents, triggers): Update database tables directly\n2. **For static sections** (guides, examples, instructions): Add/update in `leo_protocol_sections` table\n3. **Regenerate file**: Run `node scripts/generate-claude-md-from-db.js`\n\n**Any direct edits to this file will be lost on next regeneration!**\n\nSee documentation for table structure: `database/schema/007_leo_protocol_schema_fixed.sql`",
    "order_index": 0,
    "metadata": {},
    "context_tier": "REFERENCE",
    "target_file": "docs/reference/file-warning.md"
  },
  {
    "id": 1,
    "protocol_id": "leo-v4-1-2-database-first",
    "section_type": "agents",
    "title": "Agent Responsibilities",
    "content": "LEAD: Strategic (20%) + Approval (15%)\nPLAN: Design (20%) + Verification (15%)\nEXEC: Implementation (30%)",
    "order_index": 1,
    "metadata": {},
    "context_tier": "REFERENCE",
    "target_file": "docs/reference/agents.md"
  },
  {
    "id": 2,
    "protocol_id": "leo-v4-1-2-database-first",
    "section_type": "handoffs",
    "title": "Mandatory Handoff Requirements",
    "content": "7 elements required: Executive Summary, Completeness Report, Deliverables Manifest, Key Decisions, Issues & Risks, Resource Utilization, Action Items",
    "order_index": 2,
    "metadata": {},
    "context_tier": "REFERENCE",
    "target_file": "docs/reference/handoffs.md"
  },
  {
    "id": 3,
    "protocol_id": "leo-v4-1-2-database-first",
    "section_type": "subagents",
    "title": "Sub-Agent System",
    "content": "Automatic activation on triggers. Database, Security, Design, Testing, Performance sub-agents.",
    "order_index": 3,
    "metadata": {},
    "context_tier": "REFERENCE",
    "target_file": "docs/reference/subagents.md"
  },
  {
    "id": 7,
    "protocol_id": "leo-v4-2-0-story-gates",
    "section_type": "parallel_execution",
    "title": "Parallel Execution",
    "content": "**When to Use**: Modern AI supports parallel tool execution for independent operations. Use conservatively.\n\n**Safe for Parallel Execution**:\n- ✅ Reading multiple independent files for analysis\n- ✅ Running multiple independent database queries\n- ✅ Executing multiple read-only Git commands (status, log, diff)\n- ✅ Multiple WebFetch calls to different URLs\n- ✅ Batch file searches (multiple Glob operations)\n\n**NOT Safe for Parallel Execution**:\n- ❌ Write operations (Edit, Write tools)\n- ❌ Database mutations (INSERT, UPDATE, DELETE)\n- ❌ Any operations where order matters\n- ❌ Operations that depend on each other's results\n- ❌ Git operations that modify state (commit, push, merge)\n\n**Critical Constraint**: Context sharing between parallel operations is limited. Each operation receives the same initial context but cannot see other parallel operations' results until they all complete.\n\n**Example Use Case**:\n```\n\"Read the following 3 files for analysis:\"\n- Read src/component.tsx\n- Read src/types.ts\n- Read tests/component.test.tsx\n```\n\n**Anti-Pattern**:\n```\n\"Read file A, then based on what you find, read file B\"\n(Must be sequential - second read depends on first)\n```",
    "order_index": 60,
    "metadata": {},
    "context_tier": "CORE",
    "target_file": "CLAUDE_CORE.md"
  }
]
```

### Schema: `leo_protocols`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | character varying(50) | NO | NULL |
| version | character varying(50) | NO | NULL |
| status | character varying(20) | NO | NULL |
| title | character varying(500) | NO | NULL |
| description | text | YES | NULL |
| content | text | YES | NULL |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| created_by | character varying(100) | YES | NULL |
| superseded_by | character varying(50) | YES | NULL |
| superseded_at | timestamp without time zone | YES | NULL |
| metadata | jsonb | YES | '{}'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23137_1_not_null | CHECK | - | - |
| 2200_23137_2_not_null | CHECK | - | - |
| 2200_23137_3_not_null | CHECK | - | - |
| 2200_23137_4_not_null | CHECK | - | - |
| leo_protocols_status_check | CHECK | - | leo_protocols(status) |
| leo_protocols_superseded_by_fkey | FOREIGN KEY | superseded_by | leo_protocols(id) |
| leo_protocols_pkey | PRIMARY KEY | id | leo_protocols(id) |
| leo_protocols_version_key | UNIQUE | version | leo_protocols(version) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| anon_read_active_leo_protocols | SELECT | "{anon}" | PERMISSIVE |
| authenticated_read_leo_protocols | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_protocols | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "leo-v4-1-2-database-first",
    "version": "4.1.2_database_first",
    "status": "superseded",
    "title": "LEO Protocol v4.1.2 - Database-First Enforcement",
    "description": "Database-first approach with sub-agent enforcement, 7-element handoffs, and strict phase validation",
    "content": "# LEO Protocol v4.1.2 - Database-First Enforcement\n\n## Core Principles\n- Database is the single source of truth\n- No strategic documents in filesystem\n- Sub-agents activate automatically\n- 7-element handoffs are mandatory\n- LEAD-PLAN-EXEC workflow with verification\n\n## Agent Responsibilities\n- **LEAD (35%)**: Strategic planning (20%) + Final approval (15%)\n- **PLAN (35%)**: Technical design (20%) + EXEC verification (15%)\n- **EXEC (30%)**: Implementation only (no validation)\n\n## Mandatory Handoff Elements\n1. Executive Summary (≤200 tokens)\n2. Completeness Report\n3. Deliverables Manifest\n4. Key Decisions & Rationale\n5. Known Issues & Risks\n6. Resource Utilization\n7. Action Items for Receiver\n\n## Sub-Agent Activation\nAutomatic activation on trigger phrases in PRDs and SDs.",
    "created_at": "2025-09-04T01:49:30.252Z",
    "created_by": "migration",
    "superseded_by": null,
    "superseded_at": null,
    "metadata": {
      "source": "database-first migration",
      "features": [
        "database-first",
        "sub-agent-enforcement",
        "7-element-handoffs",
        "phase-validation"
      ]
    }
  },
  {
    "id": "leo-v4-2-1-subagent-sequencing",
    "version": "v4.2.1_subagent_sequencing",
    "status": "draft",
    "title": "LEO Protocol v4.2.1 - Sub-Agent Sequencing & Verification Flow",
    "description": null,
    "content": "{\n  \"verification_phase_sequencing\": {\n    \"mandatory_order\": [\n      {\n        \"step\": 1,\n        \"sub_agent\": \"TESTING\",\n        \"purpose\": \"Execute comprehensive functional, integration, performance testing\",\n        \"prerequisites\": [\"Implementation complete\", \"Components functional\"],\n        \"outputs\": [\"Test report\", \"Bug findings\", \"Performance data\", \"Coverage metrics\"]\n      },\n      {\n        \"step\": 2,\n        \"sub_agent\": \"VALIDATION\", \n        \"purpose\": \"Validate test results against acceptance criteria and requirements\",\n        \"prerequisites\": [\"TESTING completed\", \"Test report available\"],\n        \"outputs\": [\"Validation report\", \"Acceptance criteria verification\", \"Pass/fail verdict\"]\n      }\n    ]\n  },\n  \"planning_phase_sequencing\": {\n    \"recommended_order\": [\n      {\n        \"step\": 1,\n        \"sub_agent\": \"VALIDATION\",\n        \"purpose\": \"Check for existing implementations and conflicts BEFORE design\",\n        \"rationale\": \"Prevents duplicate work and identifies reuse opportunities\",\n        \"triggers\": [\"existing implementation\", \"duplicate\", \"conflict\", \"already implemented\"]\n      },\n      {\n        \"step\": 2,\n        \"sub_agent\": \"DATABASE\",\n        \"purpose\": \"Define schema requirements early to inform technical design\",\n        \"rationale\": \"Database constraints affect all subsequent design decisions\",\n        \"triggers\": [\"schema\", \"migration\", \"database\"]\n      },\n      {\n        \"step\": 3,\n        \"sub_agent\": \"SECURITY\",\n        \"purpose\": \"Identify security requirements before architecture finalization\",\n        \"rationale\": \"Security must be designed in, not bolted on\",\n        \"triggers\": [\"authentication\", \"security\", \"permissions\"]\n      },\n      {\n        \"step\": 4,\n        \"sub_agent\": \"DESIGN\",\n        \"purpose\": \"Create UI/UX specifications informed by technical constraints\",\n        \"rationale\": \"Design benefits from knowing technical and security limitations\",\n        \"triggers\": [\"accessibility\", \"UI\", \"UX\", \"interface\"]\n      }\n    ]\n  },\n  \"implementation_phase_sequencing\": {\n    \"critical_dependencies\": [\n      {\n        \"dependency\": \"DATABASE → ALL_OTHERS\",\n        \"rationale\": \"Database schema must exist before components can interact with it\",\n        \"rule\": \"DATABASE sub-agent should complete before TESTING, SECURITY, DESIGN in implementation\"\n      },\n      {\n        \"dependency\": \"SECURITY → TESTING\",\n        \"rationale\": \"Security implementations must be in place before comprehensive testing\",\n        \"rule\": \"SECURITY sub-agent should inform TESTING sub-agent of security test requirements\"\n      }\n    ],\n    \"parallel_allowed\": [\"DESIGN\", \"PERFORMANCE\", \"DOCMON\"],\n    \"notes\": \"Some implementation sub-agents can run in parallel, but database changes affect all\"\n  },\n  \"special_sequencing_rules\": {\n    \"stories_generation\": {\n      \"trigger_sequence\": \"PRD created → USER STORY sub-agent → VALIDATION sub-agent\",\n      \"rationale\": \"User stories should be validated for completeness and conflicts\",\n      \"mandatory\": true\n    },\n    \"retrospective_timing\": {\n      \"trigger\": \"After phase completion or major failures\",\n      \"sub_agent\": \"RETROSPECTIVE\", \n      \"rule\": \"Should run after all other sub-agents in a phase to capture learnings\",\n      \"outputs\": [\"Process improvements\", \"Pattern identification\", \"Action items\"]\n    },\n    \"documentation_monitoring\": {\n      \"timing\": \"Continuous throughout all phases\",\n      \"sub_agent\": \"DOCMON\",\n      \"rule\": \"Monitors documentation consistency across all other sub-agent activities\"\n    }\n  },\n  \"enforcement_checkpoints\": {\n    \"pre_handoff_validation\": [\n      \"All mandatory sub-agents completed for phase\",\n      \"Sequential dependencies respected\", \n      \"No blocking issues from sub-agent reports\",\n      \"Critical sub-agents passed (TESTING, VALIDATION)\",\n      \"Database changes applied before dependent sub-agents\"\n    ],\n    \"quality_gates\": [\n      \"VALIDATION sub-agent must pass before PLAN creation\",\n      \"TESTING must pass before VALIDATION in verification\",\n      \"DATABASE must complete before dependent implementation sub-agents\",\n      \"SECURITY must inform TESTING requirements\"\n    ]\n  }\n}",
    "created_at": "2025-09-24T19:04:06.642Z",
    "created_by": null,
    "superseded_by": null,
    "superseded_at": null,
    "metadata": {}
  },
  {
    "id": "leo-v4-2-0-story-gates",
    "version": "v4.2.0_story_gates",
    "status": "active",
    "title": "LEO Protocol v4.2.0 - Story Gates & Automated Release Control",
    "description": "Automated release gates with user story verification, CI/CD integration, and branch protection enforcement. Enforces 80% quality threshold for all merges.",
    "content": "# LEO Protocol v4.2.0 - Story Gates & Automated Release Control\n\n## 🎯 Core Simplicity Principles\n\n**Universal Guidelines for All Agents:**\n\n1. **Occam's Razor**: The simplest solution that solves the problem wins\n2. **Boring Technology**: Use proven, reliable tools over novel, complex ones\n3. **Configuration Over Code**: Solve problems with settings before writing custom logic\n4. **80/20 Rule**: Focus on solutions that solve 80% of the problem with 20% of the effort\n5. **Maintenance Mindset**: Consider the developer who will modify this in 6 months\n\n**Complexity Justification Framework:**\n- Simple solution = Default choice, no justification needed\n- Complex solution = Requires extraordinary business/technical justification\n- Any added complexity must solve a real, measured problem\n\n**Universal Questions for All Agents:**\n- \"What's the simplest approach?\"\n- \"Can we use existing tools/patterns?\"\n- \"Why not just...?\"\n- \"What would we do with tight deadlines?\"\n- \"How do we solve this with zero new complexity?\"\n\n## Agent Responsibilities\n\n[Rest of protocol content continues...]",
    "created_at": "2025-09-17T17:51:50.360Z",
    "created_by": null,
    "superseded_by": null,
    "superseded_at": null,
    "metadata": {
      "created_at": "2025-09-17T13:51:49.118Z",
      "created_by": "add-leo-protocol-v4.2.0-story-gates.js",
      "key_features": [
        "User Story Generation",
        "Release Gates (80% threshold)",
        "Branch Protection",
        "CI/CD Webhooks",
        "Automated Merge Blocking"
      ],
      "migration_scripts": [
        "database/migrations/2025-01-17-user-stories-compat.sql",
        "database/migrations/verify-2025-01-17-user-stories.sql",
        "database/migrations/2025-01-17-prod-hardening.sql"
      ],
      "requires_migration": true,
      "backward_compatible": true
    }
  }
]
```

### Schema: `leo_reasoning_sessions`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | character varying(255) | YES | NULL |
| prd_id | character varying(255) | YES | NULL |
| depth_level | character varying(20) | NO | NULL |
| complexity_score | integer | YES | NULL |
| auto_trigger_reasons | ARRAY | YES | '{}'::text[] |
| trigger_keywords | ARRAY | YES | '{}'::text[] |
| reasoning_chain | jsonb | NO | '{}'::jsonb |
| complexity_factors | jsonb | YES | '{}'::jsonb |
| reasoning_quality_score | integer | YES | NULL |
| depth_appropriateness_score | integer | YES | NULL |
| processing_time_ms | integer | YES | NULL |
| context_tokens_used | integer | YES | NULL |
| triggered_by_agent | character varying(50) | YES | NULL |
| processed_by_agent | character varying(50) | YES | NULL |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |
| completed_at | timestamp with time zone | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_53688_1_not_null | CHECK | - | - |
| 2200_53688_4_not_null | CHECK | - | - |
| 2200_53688_8_not_null | CHECK | - | - |
| leo_reasoning_sessions_complexity_score_check | CHECK | - | leo_reasoning_sessions(complexity_score) |
| leo_reasoning_sessions_depth_appropriateness_score_check | CHECK | - | leo_reasoning_sessions(depth_appropriateness_score) |
| leo_reasoning_sessions_depth_level_check | CHECK | - | leo_reasoning_sessions(depth_level) |
| leo_reasoning_sessions_reasoning_quality_score_check | CHECK | - | leo_reasoning_sessions(reasoning_quality_score) |
| leo_reasoning_sessions_pkey | PRIMARY KEY | id | leo_reasoning_sessions(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_reasoning_sessions | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_reasoning_sessions | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_reasoning_triggers`

**Row Count**: 7

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| trigger_name | character varying(100) | NO | NULL |
| trigger_type | character varying(50) | NO | NULL |
| trigger_config | jsonb | NO | NULL |
| resulting_depth | character varying(20) | NO | NULL |
| priority | integer | YES | 50 |
| active | boolean | YES | true |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_53723_1_not_null | CHECK | - | - |
| 2200_53723_2_not_null | CHECK | - | - |
| 2200_53723_3_not_null | CHECK | - | - |
| 2200_53723_4_not_null | CHECK | - | - |
| 2200_53723_5_not_null | CHECK | - | - |
| leo_reasoning_triggers_resulting_depth_check | CHECK | - | leo_reasoning_triggers(resulting_depth) |
| leo_reasoning_triggers_pkey | PRIMARY KEY | id | leo_reasoning_triggers(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_reasoning_triggers | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_reasoning_triggers | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "d3aa12dc-e28c-4623-bbf7-05cfee15993e",
    "trigger_name": "High Priority Items",
    "trigger_type": "threshold",
    "trigger_config": {
      "field": "priority",
      "value": 90,
      "operator": ">="
    },
    "resulting_depth": "ultra",
    "priority": 90,
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "fd87d58f-fc19-453b-8756-3bbff5037eec",
    "trigger_name": "Security Requirements",
    "trigger_type": "keyword",
    "trigger_config": {
      "keywords": [
        "security",
        "authentication",
        "authorization",
        "encryption",
        "compliance"
      ]
    },
    "resulting_depth": "ultra",
    "priority": 85,
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "aa8fb56f-d952-4541-b55c-03d50c63426f",
    "trigger_name": "Performance Critical",
    "trigger_type": "keyword",
    "trigger_config": {
      "keywords": [
        "performance",
        "optimization",
        "scaling",
        "load",
        "latency"
      ]
    },
    "resulting_depth": "deep",
    "priority": 80,
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "d696da9c-4a90-4935-92cb-8b7913d64a15",
    "trigger_name": "Complex Integration",
    "trigger_type": "keyword",
    "trigger_config": {
      "keywords": [
        "integration",
        "api",
        "microservice",
        "database",
        "migration"
      ]
    },
    "resulting_depth": "deep",
    "priority": 75,
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  },
  {
    "id": "fd9dd874-e4d4-49c6-ab4c-520ece265cad",
    "trigger_name": "Many Requirements",
    "trigger_type": "threshold",
    "trigger_config": {
      "field": "functional_requirements_count",
      "value": 5,
      "operator": ">="
    },
    "resulting_depth": "deep",
    "priority": 70,
    "active": true,
    "created_at": "2025-09-24T22:46:53.784Z"
  }
]
```

### Schema: `leo_risk_spikes`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| risk_title | text | NO | NULL |
| risk_description | text | NO | NULL |
| spike_duration_days | numeric | NO | NULL |
| acceptance_criteria | jsonb | NO | '[]'::jsonb |
| status | text | NO | NULL |
| findings | text | YES | NULL |
| mitigation_plan | text | YES | NULL |
| started_at | timestamp with time zone | YES | NULL |
| completed_at | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40151_1_not_null | CHECK | - | - |
| 2200_40151_2_not_null | CHECK | - | - |
| 2200_40151_3_not_null | CHECK | - | - |
| 2200_40151_4_not_null | CHECK | - | - |
| 2200_40151_5_not_null | CHECK | - | - |
| 2200_40151_6_not_null | CHECK | - | - |
| 2200_40151_7_not_null | CHECK | - | - |
| leo_risk_spikes_spike_duration_days_check | CHECK | - | leo_risk_spikes(spike_duration_days) |
| leo_risk_spikes_status_check | CHECK | - | leo_risk_spikes(status) |
| leo_risk_spikes_pkey | PRIMARY KEY | id | leo_risk_spikes(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_risk_spikes | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_risk_spikes | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_sub_agent_handoffs`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('leo_sub_agent_handoffs_id_seq'::regclass) |
| sub_agent_id | character varying(50) | NO | NULL |
| handoff_template | jsonb | NO | NULL |
| validation_rules | jsonb | YES | '[]'::jsonb |
| required_outputs | jsonb | YES | '[]'::jsonb |
| success_criteria | jsonb | YES | '[]'::jsonb |
| version | integer | YES | 1 |
| active | boolean | YES | true |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23250_1_not_null | CHECK | - | - |
| 2200_23250_2_not_null | CHECK | - | - |
| 2200_23250_3_not_null | CHECK | - | - |
| leo_sub_agent_handoffs_pkey | PRIMARY KEY | id | leo_sub_agent_handoffs(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_sub_agent_handoffs | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_sub_agent_handoffs | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `leo_sub_agent_triggers`

**Row Count**: 235

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sub_agent_id | uuid | NO | NULL |
| trigger_phrase | text | NO | NULL |
| trigger_type | text | YES | NULL |
| priority | integer | YES | 0 |
| active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| trigger_context | character varying(50) | YES | NULL |
| metadata | jsonb | YES | '{}'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40069_1_not_null | CHECK | - | - |
| 2200_40069_2_not_null | CHECK | - | - |
| 2200_40069_3_not_null | CHECK | - | - |
| leo_sub_agent_triggers_trigger_type_check | CHECK | - | leo_sub_agent_triggers(trigger_type) |
| leo_sub_agent_triggers_sub_agent_id_fkey | FOREIGN KEY | sub_agent_id | leo_sub_agents(id) |
| leo_sub_agent_triggers_pkey | PRIMARY KEY | id | leo_sub_agent_triggers(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_sub_agent_triggers | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_sub_agent_triggers | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "60804c89-fdb4-4098-baed-c01edcef5133",
    "sub_agent_id": "9fa15da1-ccc0-4362-ae24-fea07f43f4c4",
    "trigger_phrase": "authentication",
    "trigger_type": "keyword",
    "priority": 5,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z",
    "trigger_context": null,
    "metadata": {}
  },
  {
    "id": "058fa696-3622-4df2-8eeb-233bcece8ece",
    "sub_agent_id": "9fa15da1-ccc0-4362-ae24-fea07f43f4c4",
    "trigger_phrase": "security",
    "trigger_type": "keyword",
    "priority": 5,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z",
    "trigger_context": null,
    "metadata": {}
  },
  {
    "id": "c46cfd1f-31c5-49ce-8eb8-f8359916f1e5",
    "sub_agent_id": "a0e846be-ca77-4cac-8f9b-1f72427b5813",
    "trigger_phrase": "schema",
    "trigger_type": "keyword",
    "priority": 4,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z",
    "trigger_context": null,
    "metadata": {}
  },
  {
    "id": "9fadc751-3c86-4284-b4c1-5335e7e6ab0d",
    "sub_agent_id": "a0e846be-ca77-4cac-8f9b-1f72427b5813",
    "trigger_phrase": "migration",
    "trigger_type": "keyword",
    "priority": 4,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z",
    "trigger_context": null,
    "metadata": {}
  },
  {
    "id": "d7a10070-ce14-4b08-a29f-9d22baaabde8",
    "sub_agent_id": "fc963dd4-db60-468f-90f8-a6e07222b1ac",
    "trigger_phrase": "coverage",
    "trigger_type": "keyword",
    "priority": 3,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z",
    "trigger_context": null,
    "metadata": {}
  }
]
```

### Schema: `leo_sub_agents`

**Row Count**: 15

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO | NULL |
| name | text | NO | NULL |
| description | text | YES | NULL |
| activation_type | text | YES | NULL |
| priority | integer | YES | 0 |
| script_path | text | YES | NULL |
| context_file | text | YES | NULL |
| active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| metadata | jsonb | YES | '{}'::jsonb |
| capabilities | jsonb | YES | '[]'::jsonb |
| domain_embedding | USER-DEFINED | YES | NULL |
| embedding_generated_at | timestamp with time zone | YES | NULL |
| embedding_model | character varying(100) | YES | 'text-embedding-3-small'::character varying |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40039_1_not_null | CHECK | - | - |
| 2200_40039_2_not_null | CHECK | - | - |
| 2200_40039_3_not_null | CHECK | - | - |
| leo_sub_agents_activation_type_check | CHECK | - | leo_sub_agents(activation_type) |
| leo_sub_agents_pkey | PRIMARY KEY | id | leo_sub_agents(id) |
| leo_sub_agents_code_key | UNIQUE | code | leo_sub_agents(code) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_sub_agents | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_sub_agents | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "9fa15da1-ccc0-4362-ae24-fea07f43f4c4",
    "code": "SECURITY",
    "name": "Chief Security Architect",
    "description": "Former NSA security architect with 25 years experience securing systems from startup to enterprise scale.\n\n**Mission**: Identify security vulnerabilities, enforce access control, and ensure data protection before deployment.\n\n**Repository Lessons** (4 SDs analyzed):\n- **RLS Policy Verification** (SD-SECURITY-002): Automated RLS policy verification prevents 95% of access control bugs\n- **Supabase Auth Patterns** (multiple SDs): Leverage existing auth.uid() instead of custom auth = zero vulnerabilities\n- **Edge Function Security** (SD-CREATIVE-001): Edge Functions provide proper security isolation for sensitive operations\n- **Authentication Testing** (SD-AGENT-ADMIN-002): Protected routes MUST have E2E tests validating auth enforcement\n\n**Core Philosophy**: \"Security is not a feature. It's a requirement. Test it, verify it, automate it.\"",
    "activation_type": "automatic",
    "priority": 7,
    "script_path": null,
    "context_file": null,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z",
    "metadata": {
      "sources": [
        "74+ retrospectives analyzed",
        "SD-SECURITY-002: RLS policy verification",
        "SD-CREATIVE-001: Edge Function security",
        "SD-AGENT-ADMIN-002: Authentication testing",
        "SD-RECONNECT-009: Security patterns",
        "CLAUDE.md: RLS Policy Verification section",
        "CLAUDE.md: Supabase Database Operations section",
        "CLAUDE.md: Authentication testing requirements"
      ],
      "version": "2.1.0",
      "key_metrics": {
        "capabilities_count": 12,
        "bug_prevention_rate": "95%",
        "security_rework_time": "40-60% of sprint",
        "manual_review_miss_rate": "60-80%",
        "retrospectives_analyzed": 74,
        "vulnerability_reduction": "10x (Supabase Auth vs custom)",
        "strategic_directives_analyzed": 4
      },
      "improvements": [
        {
          "title": "Proactive Learning Integration",
          "impact": "MEDIUM",
          "source": "SD-LEO-LEARN-001",
          "benefit": "Query security patterns before starting work"
        },
        {
          "title": "RLS Policy Verification",
          "impact": "CRITICAL",
          "source": "SD-SECURITY-002",
          "benefit": "95% bug prevention through automated verification"
        },
        {
          "title": "Supabase Auth Patterns",
          "impact": "CRITICAL",
          "source": "Multiple SDs",
          "benefit": "10x reduction in vulnerabilities vs custom auth"
        },
        {
          "title": "Edge Function Security",
          "impact": "HIGH",
          "source": "SD-CREATIVE-001",
          "benefit": "Proper security isolation for sensitive operations"
        },
        {
          "title": "Authentication Testing",
          "impact": "HIGH",
          "source": "SD-AGENT-ADMIN-002",
          "benefit": "Protected routes MUST have E2E tests validating auth"
        }
      ],
      "last_updated": "2025-10-26T17:19:11.987Z",
      "failure_patterns": [
        "Custom authentication instead of Supabase Auth = 10x vulnerabilities",
        "No RLS policy verification = production data leaks",
        "Protected routes without E2E tests = false security confidence",
        "Cross-schema FKs to auth.users bypass RLS policies",
        "Manual security reviews miss 60-80% of policy issues",
        "Deferring security to end of sprint requires 40-60% rework",
        "No automated verification = security regressions undetected",
        "SQL injection risks when concatenating queries (use parameterized)"
      ],
      "success_patterns": [
        "RLS policies verified automatically before deployment (95% bug prevention)",
        "Leverage Supabase auth.uid() in policies (no custom auth vulnerabilities)",
        "Edge Functions for sensitive operations (proper security isolation)",
        "Protected route E2E tests validate auth enforcement",
        "anon role SELECT-only access prevents data leaks",
        "No cross-schema foreign keys to auth.users (violates RLS)",
        "Security sub-agent runs automatically on auth/security keywords",
        "Database-first architecture enables automated security verification"
      ]
    },
    "capabilities": [
      "Proactive learning: Query security patterns before starting",
      "RLS policy verification (95% bug prevention)",
      "Supabase Auth integration patterns (auth.uid())",
      "Edge Function security isolation",
      "Protected route E2E testing",
      "Access control validation",
      "SQL injection prevention (parameterized queries)",
      "Cross-schema FK security analysis",
      "Authentication testing automation",
      "Security regression detection",
      "Data protection compliance",
      "Vulnerability assessment"
    ],
    "domain_embedding": "[-0.03506457,0.029695606,0.11384108,0.015821818,0.030930944,0.012341494,-0.018304372,0.005867852,0.018767623,0.028222704,0.010838896,-0.04494727,-0.0060460255,-0.011771338,-0.00076837384,-0.01925463,-0.008700812,0.047227893,0.016273193,0.0037891592,0.04960354,0.042476594,0.0062182597,0.049365975,-0.015429837,0.016142532,-0.004041572,0.011860425,-0.004840384,-0.0101440195,0.05088639,-0.027581278,-0.028911643,0.04245284,0.02960058,-0.023305112,-0.01480029,-0.0014654782,0.03539716,0.013624344,0.0143251605,0.018351885,-0.044590924,0.0010296952,-0.044852242,-0.003088343,-0.012590937,-0.05468743,-0.062669605,0.019694125,-0.038010377,0.0044038584,0.013172971,0.054307323,-0.009003708,0.032546386,-0.020608751,-0.007999997,-0.041930195,0.032118767,-0.03135856,-0.037155144,-0.017116547,0.0060786908,0.034423146,-0.02513436,0.012852258,-0.020442456,0.010850774,0.0044662193,0.08319521,-0.0032813645,0.027319958,0.004890866,0.025395682,-0.03432812,-0.002351892,0.042120248,0.021867845,0.010530062,-0.028222704,-0.012507789,-0.007869336,-0.03879434,-0.04473346,0.0039049722,-0.09721154,0.013814396,-0.04817815,-3.2038773e-05,0.00226429,0.031192265,-0.009627315,0.010631027,0.023198208,-0.00790497,0.01831625,0.04373569,-0.017140305,0.0067230854,0.0040059374,-0.074642874,-0.05292945,0.025561977,0.03311654,-0.016712688,0.033757966,-0.02040682,-0.014740899,-0.023210086,-0.087281324,-0.025371926,-0.027058637,0.03021825,-0.027343715,-0.038414236,-0.0046206363,-0.00059168495,0.0150853675,-0.0010163321,0.01602375,0.046538953,0.004008907,-0.057300642,0.006616181,-0.032997757,-0.029980684,-0.017591678,-0.03271268,-0.037392706,0.023875268,-0.013826274,0.048368204,-0.055542663,0.044305846,0.010328132,0.0052412744,-0.013172971,-0.030669622,-0.03884185,0.035088327,-0.027723817,0.034304366,0.03898439,-0.022936886,-0.05506753,-0.018779501,0.04102745,-0.04124126,0.037867837,-0.016142532,-0.006657755,-0.029291745,0.026868584,-0.0013199697,-0.05725313,0.010191532,0.042547863,0.0147765335,0.0055293217,0.014586481,0.041455068,-0.019112092,0.019706003,0.007210093,-0.046586465,-0.009496654,-0.002026725,-0.020858193,-0.015857454,-0.029220477,-0.03784408,0.0018678536,0.009003708,-0.0014914618,-0.002783963,-0.009265029,-0.02406532,0.020893829,-0.0325939,-0.035777267,-0.00014810683,-0.049033385,-0.0010534517,-0.020169256,-0.01925463,-0.013505561,0.0008240531,-0.035112083,0.032023743,-0.006663694,0.042357814,-0.0007980694,-0.021499619,0.028602809,-0.022865616,-0.009716403,-0.051076442,-0.011913877,0.002487007,-0.0028552325,-0.020691898,0.014871559,0.0012509275,0.008979951,0.003961394,0.011735704,0.0022672596,-0.003061617,-0.0136956135,-0.0020534513,0.031572368,0.04002968,-0.015025977,-0.048439473,0.057015564,0.05392722,0.011046765,0.030978456,-0.0010393462,-0.027652549,-0.003628803,0.016261313,0.0017668885,0.008665178,0.09246024,0.018993309,0.011943573,0.040053435,-0.06395246,-0.004035633,-0.00013734218,-0.04385447,-0.03953079,-0.02710615,-0.037606515,0.028674077,-0.019860422,-0.012133624,-0.012026721,0.028697833,0.016570149,-0.035325892,0.03648996,0.044424627,0.015619889,-0.011913877,-0.002697846,0.01351744,0.016463244,0.017567921,-0.0060935384,0.060293958,-0.017318478,0.029576823,-0.0593437,0.021891601,-0.052549344,-0.016772078,0.01162286,-0.012590937,0.010102445,-0.004587971,-0.008534517,-0.043688174,0.03074089,-0.052359294,-0.015714915,-0.001371937,-0.043403096,0.038295455,0.0773036,0.021499619,-0.020715654,-0.021060124,-0.042334057,-0.00533927,-0.02446918,-0.033710454,0.029006667,0.031572368,-0.035112083,0.04927095,-0.0012731991,0.048273176,0.05939121,0.011729765,-0.01412323,-0.027319958,0.027201176,0.021618402,0.030051954,-0.042524107,-0.010850774,0.0101321405,-0.014372674,0.00709725,0.049365975,-0.016867105,-0.030859673,0.004644393,0.050981417,-0.018767623,-0.021867845,0.015465472,0.01886265,0.026797315,-0.00037305107,0.0095204115,-0.038913123,0.028816616,-0.041550092,0.027747575,0.013683735,-0.04074237,-0.045184836,0.01818559,-0.0023414986,0.024611719,-0.062669605,0.025538221,-0.008884925,-0.003818855,-0.04703784,0.04501854,-0.010559757,-0.010868592,0.044377115,0.024350397,-0.06157681,0.019765396,-0.032285064,0.04594504,-0.04513732,-0.04311802,-0.004487006,0.04468595,0.06632811,-0.00804157,-0.011409052,-0.02710615,-0.037131388,0.0005931697,0.018470667,0.021440228,0.031168507,-0.053357065,-0.0049383794,0.032475114,0.034779493,-0.013873788,0.008296953,-0.067801006,0.018898284,-0.013054188,-0.021547131,0.006812172,-0.038437992,0.0036941334,-0.013968813,-0.019504074,-0.002142538,0.034755737,-0.00337936,0.025657004,0.050648827,-0.046657737,-0.02805641,-0.00036692634,-0.043070506,-0.0021514466,0.032902732,-0.023079425,0.0010920559,-0.026844827,0.07302743,-0.036014833,0.048368204,0.024148466,0.020703776,0.050458774,0.016095018,0.050648827,-0.007851519,0.0545924,0.019218996,-0.031477343,-0.01771046,0.01919524,-0.0028700803,0.0068656243,-0.014313282,0.014051961,-0.0143251605,-0.020276159,-0.008558273,0.04392574,-0.0061826254,0.008213805,-0.02040682,0.006942833,0.0040504807,0.0006380843,0.024350397,-0.020798802,-0.0009383811,0.006372677,0.0027958413,-0.013838152,-0.0032754254,0.03128729,-0.03418558,0.00048515198,0.012270224,-0.009110612,-0.009858942,0.045968797,-0.017924268,0.011830729,0.02945804,0.06319225,0.022877496,-0.03725017,-0.009853002,-0.0252769,0.05026872,0.040861156,-0.037131388,-0.040979937,-0.04002968,0.012816624,0.007495171,-0.009247212,-0.0038633985,-0.038010377,-0.01263845,-0.0073169973,0.0087423865,0.00709725,0.027890114,-0.022853738,-0.03451817,-0.01500222,0.01939717,-0.041930195,0.0070200413,-0.026916098,-0.021250175,0.007043798,-0.023566432,0.008492943,-0.022259826,0.023435771,0.0033734208,-0.018078685,-0.014491456,0.05616033,0.039293226,-0.016712688,0.016190045,0.006942833,0.028864129,0.00946102,0.028175192,0.04283294,-0.028080165,-0.029719362,-0.016878983,0.03325908,0.00892056,-0.0116881905,0.026535993,0.007928727,-0.027723817,0.0005731252,-0.01662954,0.019183362,-0.019218996,0.039459523,0.0018233102,0.013469927,-0.009876759,-0.038699314,0.011848547,0.004810688,0.040053435,-0.0024558266,-0.011028948,0.03846175,0.016308827,-0.017603556,0.005710465,0.057395667,-0.010886409,-0.023958415,-0.027272444,-0.039174445,-0.044210818,-0.028175192,0.0048492923,0.045850016,-0.021582767,-0.010292497,0.035967316,0.021404592,-0.015999993,-0.0048077186,0.02412471,0.0076792836,-0.009888637,-0.01223459,-0.04601631,0.02425537,0.008326648,-0.0072694845,-0.009045281,-0.02373273,0.01946844,-0.023542676,0.0005430584,0.0035723813,-0.001662954,0.025965838,-0.016261313,0.005291757,-0.017805485,-0.030146979,-0.01162286,-0.023613947,-0.0060638427,0.0051729744,-0.020371186,0.0096748285,-0.008772082,-0.002979954,0.028626565,-0.014087596,-0.007994058,-0.04102745,0.0057282825,0.0022390487,0.009912393,0.0076614665,-0.016344462,0.0012071264,0.0002260578,-0.0007899031,-0.031809933,-0.011082401,0.008873047,0.01567928,-0.020561237,-0.024540449,0.011812912,-0.0127691105,0.029695606,-0.007732736,-0.01169413,0.0057460996,-0.020276159,-0.0044097975,-0.025918325,0.021404592,-0.023031913,-0.041217502,0.0034951728,0.007952483,-0.00043578303,0.028365243,0.01681959,-0.010874531,-0.0065924246,-0.008207866,0.02318633,0.018565694,0.00014374529,-0.006527094,-0.029149206,-0.012887893,0.0074298405,-0.040552318,-0.012721597,-0.018482545,0.010666662,-0.054924995,-0.025870811,0.05601779,0.038699314,0.012709719,0.022057896,0.030930944,-0.013267997,0.0025657003,-0.0018396428,0.028127678,0.007893092,0.005520413,-0.005434296,-0.05920116,0.040718615,0.049556028,-0.029315501,-0.010785444,-0.027628792,-0.013101702,0.00223014,0.017021522,-0.016748322,0.015394202,-0.009229395,-0.0024513723,0.00783964,-0.00022271705,-0.0068299896,-0.016415732,0.05150406,-0.0031269472,-0.016878983,-0.022960642,0.020988854,0.0009695615,-0.0084394915,0.03271268,0.025086848,0.020965097,-0.003934668,-0.029505555,-0.019694125,-0.02318633,-0.019444684,0.00088567147,0.03981587,0.049033385,0.0064973985,-0.0060697817,0.036513716,-0.014146986,-0.005365996,-0.030835917,-0.033425376,0.020763168,-0.021167029,0.008481065,-0.022402365,0.014764655,-0.0119970245,-0.04523235,0.01108834,-0.038010377,-0.023566432,-0.008279135,0.0007646619,0.051314007,0.0031596124,0.016391974,0.0024231614,-0.010708235,-0.01864884,0.014610238,0.021642158,-0.01967037,0.0016852256,-0.021654036,0.023020035,-0.006616181,0.024148466,-0.005190792,-0.018102441,0.00022345944,-0.030242005,-0.090654746,0.023376381,0.0010549364,0.01480029,0.016130654,-0.0032338514,0.015025977,-0.04337934,-0.010209349,0.068038575,-0.013707492,0.037654027,-0.015417959,-0.002555307,0.01784112,-0.0068299896,0.032285064,0.021701548,0.032475114,-0.026132133,0.021262053,0.0011752036,-0.0007787673,-0.005392722,-0.00486711,0.047607996,-0.04860577,0.036323667,-0.0075783185,-0.058821056,0.013481805,0.047489215,0.0175798,-0.010749809,-0.003352634,0.0010801777,0.019610979,0.014788412,-0.026868584,-0.028650321,-0.029695606,-0.0019495166,-0.04413955,0.024005927,0.005861913,-0.02258054,0.022877496,0.0050987354,0.012484033,-0.060198933,-0.04297548,0.013612466,-0.026108377,-0.03271268,0.004893836,0.0019836666,-0.003750555,0.0018604298,-0.009538229,-0.020525603,-0.03428061,0.006408312,0.021939114,0.013410536,0.0014001478,-0.03603859,-0.033401616,0.02155901,-0.012353372,-0.0072279107,0.012377129,-0.0006933924,-0.02007423,-0.0052620615,0.055732712,-0.022283582,-0.024896797,0.022438,0.04791683,0.027866356,-0.0007913879,0.007400145,-0.012519668,-0.03304527,-0.019112092,-0.024682987,0.008302892,0.036893822,-0.019337779,0.016605783,0.008813656,0.04893836,-0.019480318,0.024184102,-0.024089076,0.0010430581,-0.0019435774,0.049461003,0.0031952471,0.023471408,0.007934666,-0.0032011864,-0.025538221,0.032332577,0.008682995,0.006913137,-0.019444684,0.023257598,-0.016130654,-0.005122492,0.004332589,-0.0060935384,-0.0056035607,0.008213805,-0.026369698,-0.0074298405,0.0015100216,0.03629991,-0.0252769,-0.027153661,0.0042731976,0.050458774,-0.0077149183,-0.033615425,-0.0075129885,-0.06461764,-0.0140044475,-0.06176686,-0.0013288783,0.024968065,0.015121003,0.0056481045,-0.015976235,0.015512984,0.025063092,0.033401616,-0.058773544,0.03831921,-0.020596873,-0.029006667,0.022117287,0.026702289,-0.049841106,0.045968797,-0.009484776,-0.03176242,0.033282835,0.041858926,-0.029505555,0.04575499,0.031216022,-0.014752777,-0.022604296,0.009401629,-0.02960058,0.012495911,-0.024754258,-0.010595392,0.018577572,0.0051937615,-0.0030764649,0.02297252,0.020573117,-0.0024914613,0.019836664,0.019361535,-0.050031155,0.018743867,-0.005526352,0.037891593,-0.019587222,0.014705264,-0.04223903,-0.0107616875,-0.0016911648,-0.020905707,0.026797315,-0.017829241,-0.0017475864,0.0051462487,-0.0073229363,-0.0043890104,0.011308087,-0.012353372,0.007049737,-0.007346693,-0.0026057893,0.008397917,-0.03428061,0.0060757212,0.017223451,0.014099474,-0.001777282,-0.0021113576,0.023768364,-0.027248688,0.040314756,0.039720844,-0.012495911,-0.0051610963,0.005912395,-0.027533766,-0.009793611,0.02663102,0.008296953,-0.00168968,-0.038770583,0.05535261,-0.0041365977,0.023602068,0.027224932,0.011361539,-0.04649144,0.02047809,0.013374901,0.006022269,-0.020394942,0.010084628,-0.024219736,0.031406075,0.027129905,0.067135826,0.029719362,0.0043414976,0.007103189,0.030051954,-0.00655679,0.0034892338,-0.013838152,-0.025015578,0.012282102,-0.00905716,0.020941341,-0.011510017,-0.002675574,-0.014740899,0.02751001,0.015714915,-0.009894576,0.02608462,-0.03506457,-0.02791387,0.012709719,-0.0006340012,0.021202663,-0.022877496,-0.02095322,0.020846315,-0.00034818097,-0.043450613,0.05872603,-0.015394202,-0.040576078,0.010126201,0.008629543,-0.012531546,-0.0028908672,-0.005244244,0.035634726,-0.02357831,-0.025870811,-0.010310315,0.021891601,0.054639917,0.013244241,-0.027557522,-0.0015857454,-0.000119710414,0.0032546385,-0.024706744,0.0126146935,-0.0060460255,0.024326641,-0.01885077,0.003400147,0.030265762,-0.013933178,0.018340006,-0.013149214,0.014859681,0.05611282,-0.043450613,-0.0065924246,-0.022770591,-0.025229387,0.0056332564,0.041668873,0.024968065,0.05136152,-0.02359019,0.019278387,-0.028151434,0.014764655,0.0038574592,-0.017995538,0.023328869,-0.0047899014,0.03912693,-0.016071262,-0.011438748,-0.023305112,0.0014743869,0.03539716,0.0038901244,-0.0102984365,0.018149955,0.022628052,-0.0060697817,-0.009039342,-0.008873047,0.036513716,0.061529297,0.01655827,-0.0055649565,-0.014158865,-0.006527094,-0.0041365977,0.02141647,0.0048077186,0.0034149948,0.011973268,-0.023982171,-0.036133613,0.016700808,-0.020264281,-0.0092175165,0.0048374142,-0.017484773,0.031002212,-0.007643649,0.009270968,-0.006426129,-0.023221964,-0.012353372,0.009591681,-0.030289518,0.033876747,-0.010565696,0.020002961,0.0062004426,0.011462504,-0.04318929,0.011539713,-0.015548619,0.023910902,-0.035515945,0.009158125,-0.024635475,-0.017461017,-0.02108388,0.014087596,-0.0022999246,0.016831469,-0.032522626,-0.049413487,-0.009639193,0.006028208,0.019836664,0.030907188,0.021309568,-0.004766145,0.026108377,-0.010227167,0.011034887,-0.0072813625,-0.006325164,0.011628799,-0.009496654,0.017449139,0.012590937,-0.01547735,-0.012590937,-0.0025686699,0.021072002,-0.013137336,0.0046829972,-0.031382315,0.019884178,-0.0033823296,0.021665914,0.0077208574,0.0018530058,-0.019563464,0.008778021,0.005942091,-0.002054936,-0.009781732,0.023328869,-0.009074978,-0.03480325,0.005704526,0.010999252,-0.0017386777,-0.041431308,0.018898284,0.0059331823,-0.0012375644,0.011848547,-0.0040237545,-0.037891593,0.00581143,-0.007857458,0.031097239,-0.018078685,-0.046443928,0.000724944,-0.014230135,-0.014812169,-0.015370445,-0.017080912,0.0014506304,0.043213047,0.018838892,0.006812172,-0.031192265,0.00797624,-0.013054188,0.040766127,0.019444684,-0.025538221,-0.02824646,-0.019266509,0.011973268,0.013683735,-0.04216776,0.05611282,-0.011587226,-0.009419446,0.014824047,0.027533766,0.04124126,0.013814396,0.0049443184,0.01358871,-0.01892204,-0.00048032642,-0.011272452,-0.008291014,-0.02148774,0.04359315,0.02717742,-0.019444684,-0.018446911,0.023934659,-0.010185593,-0.0005334073,-0.0014855227,0.004083146,0.006066812,0.012329616,0.009074978,-0.009906454,0.021606524,0.02641721,-0.03373421,-0.029743118,-0.013636222,-0.016403852,-0.0039703026,-0.038913123,-0.0032873035,-0.019753518,0.025918325,-0.02007423,-0.034161825,-0.004742388,-0.017318478,-0.01134966,-0.052739397,0.014063839,0.0037683723,0.02622716,-0.0099836625,0.0040564197,0.0022331097,-0.015417959,-0.027985139,0.02736747,0.054829966,0.002886413,0.012697841,0.001219747,0.0010438005,-0.022426121,0.029790632,-0.016095018,-0.016795835,0.002703785,0.009318481,-0.024587963,-0.014954708,-0.037772812,-0.008546395,-0.017876755,0.045208592,0.017294722,0.017175939,0.019159606,0.0026132134,0.020715654,0.0071625803,0.004884927,-0.013493683,0.005600591,0.024279127,0.032285064,0.038770583,-0.033544157,0.004100963,-0.005710465,0.0252769,0.041811414,0.0063548596,0.002054936,0.021072002,-0.008647361,0.01595248,-0.028626565,-0.011171487,0.01872011,0.007922788,0.0035070512,-0.012246468,0.004475128,0.0045642145,0.0059213038,0.01520415,0.006259834,0.022853738,-0.028008895,-0.009858942,-0.0038426113,-0.011795095,-0.009728281,-0.004650332,0.026488481,-0.021606524,-0.020002961,0.008778021,0.0002410912,0.030717134,-0.02135708,-0.015394202,-0.015501106,0.020870073,-0.030693378,-0.015845576,-0.008201926,0.017413503,0.017746095,0.015857454,0.019278387,0.046325147,0.028840372,0.02311506,-0.00056904205,-0.01655827,-0.023103181,0.015287298,-0.0005742388,-0.0030378606,0.03905566,-0.004095024,0.035112083,-0.018221224,-0.018019294,-0.029695606,0.030764649,0.0048760185,-0.005425387,0.042951725,-0.005015588,-0.010993313,-0.026488481,-0.013363022,0.0066280593,0.017556041,0.020311795,-0.041003693,0.008219744,0.05245432,-0.056587946,0.0072635454,0.005054192,0.024374153,0.0064914594,0.0058411257,0.026939854,-0.009104673,-0.0057015563,0.0009948028,0.005526352,0.010779505,-0.01784112,0.0032011864,-0.022152923,-0.047821805,0.0016377127,0.003804007,0.004350406,-0.016308827,-0.02743874,0.021273931,0.036680013,-0.004089085,0.022022262,-0.008878986,-0.002974015,0.0062479554,-0.008599848,-0.0109101655,0.04703784,-0.022746835,0.033710454,0.008760204,0.0005924273,-0.010565696,-0.03741646,0.034993302,-0.021428348,0.0009131399,0.020596873,-0.01769858,0.003893094,0.003135856,0.01939717,0.010999252,-0.034850765,-0.023613947,-0.008534517,0.020988854,-0.010025237,-0.011925755,0.014919072,0.007109128,-0.029220477,-0.0052353353,-0.02425537,-0.00074907165,0.012377129,-0.0060994774,0.014835925,-0.008433552,0.020775046,0.006966589,0.053642143,0.0101440195,-0.0020089077,-0.05250183,0.012947285,0.041431308,0.0022553813,0.022889374,0.01547735,-0.011141791,-0.0046800277,0.0017045278,-0.038342968,-0.008938378,-0.010435036,-0.034019288,0.019278387,0.050506286,-0.0092115775,0.008362283,-0.015572376,0.030337032,-0.007857458,-0.022057896,-0.007049737,-0.010553818,-0.0037149203,0.03271268,0.002797326,-0.012531546,0.009015586,-0.015227906,-0.011135852,-0.00022847057,0.03271268,-0.024730502,-0.01263845,-0.02696361,-0.006794355,-0.01088047,0.018054929,0.026512237,0.0096748285,0.014645873,0.0531195,-0.0022331097,0.017959902,0.0021336293,0.029315501,-0.00953229,0.0007899031,-0.011818851,0.0007676314,0.003135856,0.017484773,-0.010031176,0.0068715634,0.0064973985,-0.027414983,-0.018969553,-0.014693386,0.0005415736,0.0201455,0.016320705,-0.022378609,0.011818851,0.009722342,-0.011118035,-0.039459523,-0.0066933897,-0.025015578,-0.0029205629,0.009823306,-0.012020782,0.0030393454,0.021570887,0.037749056,-0.0112249395,0.055305097,0.009502594,-0.053642143,-0.0068299896,0.01967037,0.020870073,-0.008207866,-0.02203414,0.01716406,-0.023554554,-0.0046087583,-0.033710454,0.020026717,0.005698587,0.00042390477,0.009882698,0.026654776,0.0064617638,-0.023008155,0.024231615,0.016118774,0.005959908,-0.031928714,-0.018161833,-0.021606524,-0.0074357796,-0.016522635,-0.019028945,-0.049841106,-0.006936894,0.010975496,-0.0028136587,0.00036061602,-0.0046770577,-0.011913877,0.027747575,0.004195989,-0.05616033,0.020501846,0.013885666,0.010987374,0.011070522,0.027224932,0.013303632,0.03195247,0.041122474,-0.031596124,0.03967333,-0.0011804004,0.01575055,-0.0024959156,-0.01750853,0.047394186,0.040718615,0.013814396,-0.018898284,0.037155144,-0.0013303631,0.026108377,0.03501706,-0.022152923,0.019884178,-0.013814396,-0.018019294,0.027129905,-0.02256866,0.0027409045,-0.014206378,0.018530058,0.0030170735,0.002121751,0.011521895,-0.0017757972,0.04539864,-0.0028849281,-0.0046414235,0.011646616,0.03128729,0.11156046,0.0075426837,-0.048700795,0.020240525,0.030313274,-0.02534817,0.033330347,-0.0016867104,0.050126184,-0.009769854,-0.008207866,0.010886409,-0.007441719,0.063334785,-0.008813656,0.0068775024,-0.0069844066,-0.0147765335,0.0041306587,-0.015631767,-0.0053541176,-0.010458793,0.01223459,0.0087423865,-0.006111356,0.0012680024,0.020371186,0.005858943,-0.0048077186,0.015346689,-0.024374153,-0.0278426,0.016368218,-0.025870811,0.010417218,-0.058345925,-0.0059509994,-0.017211573,-0.030384544,-0.006954711,0.029576823,0.009270968,-0.018328128,-0.019515952,0.015441715,0.008201926,0.013873788,-0.015382324,0.003412025,0.011444687,-0.006675572,-0.024754258,-0.014146986,0.020549359,-0.030835917,0.030812161,0.015988115,-0.0351596,0.046871543,0.002337044,0.019991081,0.0086533,-0.031524856,-0.017853,-0.022936886]",
    "embedding_generated_at": null,
    "embedding_model": "text-embedding-3-small"
  },
  {
    "id": "c20fd520-7232-49c3-ac5f-f911dd97e03c",
    "code": "RETRO",
    "name": "Continuous Improvement Coach",
    "description": "## Continuous Improvement Coach v4.0.0 - Quality-First Edition\n\n**🆕 NEW in v4.0.0**: Proactive learning integration, automated quality validation, pattern recognition over time\n\n### Overview\n**Mission**: Capture learnings, identify patterns, and drive continuous improvement across all strategic directives.\n\n**Philosophy**: **Comprehensive retrospectives = organizational learning at scale.**\n\n**Core Expertise**:\n- Retrospective generation and analysis\n- Pattern recognition across SDs\n- Quality score validation (70+ requirement)\n- Organizational learning at scale\n- Database-driven validation\n\n---\n\n## 🔍 PROACTIVE LEARNING INTEGRATION (SD-LEO-LEARN-001)\n\n### Before Generating ANY Retrospective\n\n**MANDATORY**: Query prior retrospectives for patterns:\n\n```bash\n# Search for retrospective-related patterns\nnode scripts/search-prior-issues.js \"retrospective quality\"\n\n# Query retrospectives table for similar SDs\nnode -e \"\nimport { createDatabaseClient } from './lib/supabase-connection.js';\n(async () => {\n  const client = await createDatabaseClient('engineer', { verify: false });\n  const result = await client.query(\\`\n    SELECT sd_id, quality_score, key_learnings\n    FROM retrospectives\n    WHERE quality_score >= 70\n    ORDER BY created_at DESC\n    LIMIT 5\n  \\`);\n  console.log('High-Quality Retrospectives:');\n  result.rows.forEach(r => {\n    console.log(\\`\\n\\${r.sd_id} (Score: \\${r.quality_score})\\`);\n    console.log('Learnings:', JSON.stringify(r.key_learnings, null, 2));\n  });\n  await client.end();\n})();\n\"\n```\n\n**Why**: Consult prior retrospectives to identify recurring patterns and ensure quality.\n\n---\n\n## ✅ QUALITY SCORE REQUIREMENTS (SD-A11Y-ONBOARDING-001, SD-VIF-TIER-001)\n\n### Automated Quality Validation Trigger\n\n**Trigger**: `auto_validate_retrospective_quality()` enforces minimum content standards\n\n**Requirements for 70+ Quality Score**:\n- ≥5 items in `what_went_well`\n- ≥5 items in `key_learnings`\n- ≥3 items in `action_items`\n- ≥3 items in `what_needs_improvement`\n\n### Quality Scoring Criteria\n\n**Quantity** (40% of score):\n- Number of items per section (minimum thresholds above)\n- Comprehensive coverage of all sections\n\n**Quality** (60% of score):\n- Avoid generic phrases (\"testing went well\")\n- Include specific metrics (e.g., \"108 violations fixed, 99.7% test pass\")\n- Reference specific SDs with evidence\n- Provide time estimates and concrete examples\n\n**Evidence**: SD-A11Y-FEATURE-BRANCH-001 - Quality score calculation trigger ensures comprehensive retrospectives\n\n**Example High-Quality Learning**:\n> \"10x scope estimation error: estimated 30 files (2.5 hours), actual 300+ files (10-20 hours). Prevention: Always run \\`npm run lint\\` to extract full file list before estimating.\" - SD-A11Y-FEATURE-BRANCH-001\n\n**Example Low-Quality Learning** (AVOID):\n> \"Testing could be improved\"\n\n---\n\n## 🗄️ DATABASE-DRIVEN VALIDATION (SD-A11Y-ONBOARDING-001, SD-VIF-TIER-001)\n\n### Database Constraints + Trigger Functions\n\n**Pattern**: Database constraints work in tandem with trigger functions to ensure data quality at insert time\n\n**Benefits**:\n- Enforces minimum content standards automatically\n- Prevents low-quality retrospectives from being stored\n- Triggers quality recalculation on insert/update\n- Maintains data integrity through constraints\n\n**Example Architecture**:\n```sql\n-- Schema-level constraint\nALTER TABLE retrospectives\nADD CONSTRAINT min_key_learnings\nCHECK (array_length(key_learnings, 1) >= 5);\n\n-- Trigger-level business logic\nCREATE TRIGGER auto_validate_retrospective_quality\nAFTER INSERT OR UPDATE ON retrospectives\nFOR EACH ROW EXECUTE FUNCTION validate_quality();\n```\n\n**Impact**:\n- Clear separation between constraint validation (schema) and business logic (trigger)\n- Automated quality enforcement (no manual review needed)\n- Data integrity guaranteed at database level\n\n---\n\n## 📚 COMPREHENSIVE RETROSPECTIVE CONTENT (SD-A11Y-ONBOARDING-001)\n\n### Better Insights Through Specific Content\n\n**Anti-Pattern**: Generic template responses\n```\n❌ \"Testing went well\"\n❌ \"Need to improve documentation\"\n❌ \"Database was challenging\"\n```\n\n**Best Practice**: Comprehensive content with metrics\n```\n✅ \"Fixed 108 jsx-a11y violations across 50+ components, achieved 99.7% test pass rate (398/399 tests)\" - SD-A11Y-FEATURE-BRANCH-001\n\n✅ \"10x scope estimation error: estimated 30 files (2.5 hours), actual 300+ files (10-20 hours)\" - SD-A11Y-FEATURE-BRANCH-001\n\n✅ \"Quality score calculation: Trigger requires ≥5 items per section for 70+ score\" - SD-A11Y-FEATURE-BRANCH-001\n```\n\n**Impact**: Comprehensive retrospectives provide better insights for continuous improvement than generic template responses\n\n---\n\n## 📋 RETROSPECTIVES REQUIRED FOR ALL SDs (SD-VIF-PARENT-001)\n\n**Critical Lesson**: Retrospectives required even for non-implementation SDs\n\n**Why**:\n- Captures architectural decisions\n- Documents blockers and workarounds\n- Identifies process improvements\n- Feeds pattern recognition across SD types\n\n**Example**: Parent SDs without code changes still need retrospectives to document:\n- Child SD orchestration patterns\n- Progress aggregation strategies\n- Parallel execution learnings\n- Architectural decision rationale\n\n**Evidence**: SD-VIF-PARENT-001 explicitly noted \"Retrospectives required even for non-implementation SDs\"\n\n---\n\n## 🔍 PATTERN RECOGNITION OVER TIME (Repository Lessons)\n\n### Pattern Emergence Timeline\n\n**From 74+ Retrospectives Analyzed**:\n\n**3-5 SDs**: Success/failure patterns start to emerge\n- Individual patterns visible but not yet actionable\n- Early trends detected\n\n**8-10 SDs**: Patterns become actionable\n- Recurring issues identified\n- Solutions can be systematized\n- Process improvements possible\n\n**20+ SDs**: System-wide improvements possible\n- Cross-cutting concerns addressed\n- Architectural patterns emerge\n- Organization-level changes justified\n\n**50+ SDs**: Organizational learning at scale\n- Cultural patterns identified\n- Strategic direction informed by data\n- Continuous improvement becomes culture\n\n### Example Patterns Identified\n\n**From Pattern Analysis Across 74+ Retrospectives**:\n1. **Database-first architecture** prevents technical debt (13+ SDs)\n2. **Component sizing 300-600 LOC** enables optimal testability (50+ components analyzed)\n3. **Accessibility-first design** prevents retrofitting (SD-A11Y: 108 violations)\n4. **Proactive sub-agent invocation** saves 30-60 min per SD (SD-VWC-PRESETS-001)\n5. **Quality validation triggers** ensure comprehensive retrospectives (v4.0.0)\n\n---\n\n## 🎯 INVOCATION COMMANDS\n\n**For comprehensive retrospective generation** (RECOMMENDED):\n```bash\nnode scripts/generate-comprehensive-retrospective.js <SD-ID>\n```\n\n**For targeted sub-agent execution**:\n```bash\nnode lib/sub-agent-executor.js RETRO <SD-ID>\n```\n\n**For phase-based orchestration**:\n```bash\nnode scripts/orchestrate-phase-subagents.js LEAD_FINAL <SD-ID>\n```\n\n---\n\n## 📊 RETROSPECTIVE SCHEMA\n\n**Required Fields** (Database Table: `retrospectives`):\n- `sd_id`: Strategic Directive ID\n- `title`: Clear, descriptive title\n- `success_patterns`: Array of what worked well (≥5 items)\n- `failure_patterns`: Array of what didn't work (≥3 items)\n- `key_learnings`: Array of lessons extracted (≥5 items)\n- `what_went_well`: Array of successes (≥5 items)\n- `what_needs_improvement`: Array of improvement areas (≥3 items)\n- `action_items`: Array with `text` and `category` (≥3 items)\n- `quality_score`: 1-100 (target ≥70, auto-calculated by trigger)\n- `generated_by`: 'MANUAL' or 'AUTOMATED'\n- `status`: 'PUBLISHED'\n\n**Database-First**: All retrospectives stored in database, NOT markdown files\n\n---\n\n## ✅ SUCCESS PATTERNS\n\n**From 74+ Retrospectives Analyzed**:\n1. **Quality validation** enforces comprehensive content (70+ score requirement)\n2. **Database-driven validation** ensures data quality at insert time\n3. **Specific metrics** in retrospectives enable pattern recognition\n4. **Pattern emergence** after 8-10 SDs enables systemic improvements\n5. **Retrospectives for all SD types** (even non-implementation)\n6. **Comprehensive content** provides better insights than generic responses\n7. **Automated triggers** maintain quality standards without manual review\n\n---\n\n## ❌ FAILURE PATTERNS TO AVOID\n\n**Anti-Patterns**:\n- **Generic template responses** (no specific metrics or examples)\n- **Skipping retrospectives** for non-implementation SDs\n- **Low-quality content** (fails minimum thresholds < 70 score)\n- **Missing specific SD references** (no learning transfer)\n- **Incomplete action items** (no category or actionability)\n- **Ignoring quality triggers** (bypassing validation)\n\n---\n\n## 📊 KEY METRICS\n\n**Evidence Base**:\n- 74+ retrospectives analyzed\n- Quality score requirement: ≥70 (enforced by trigger)\n- Pattern recognition timeline established (3-5, 8-10, 20+, 50+ SDs)\n- 100% database compliance (no markdown files)\n\n**Success Metrics**:\n- Quality validation: Automated via database trigger\n- Content standards: ≥5 learnings, ≥3 improvements, ≥3 actions\n- Pattern emergence: After 8-10 SDs\n- Organizational learning: At 50+ SDs scale\n\n---\n\n**Remember**: You are an **Intelligent Trigger** for retrospective generation. Comprehensive analysis logic, pattern recognition, and quality scoring live in scripts and database triggers—not in this prompt.\n\n**When in doubt**: Generate the retrospective. Every completed SD deserves a retrospective to capture learnings. Missing retrospectives = lost organizational knowledge.\n\n**Database-First**: All retrospectives stored in `retrospectives` table, NOT markdown files.\n",
    "activation_type": "automatic",
    "priority": 85,
    "script_path": "scripts/retrospective-sub-agent.js",
    "context_file": "retrospective-context.md",
    "active": true,
    "created_at": "2025-09-24T12:46:03.827Z",
    "metadata": {
      "sources": [
        "74+ retrospectives analyzed",
        "SD-A11Y-FEATURE-BRANCH-001: Quality score calculation patterns",
        "SD-A11Y-ONBOARDING-001: Database-driven validation",
        "SD-VIF-TIER-001: Automated quality validation triggers",
        "SD-VIF-PARENT-001: Retrospectives for non-implementation SDs",
        "Pattern recognition timeline established (3-5, 8-10, 20+, 50+ SDs)",
        "Repository lessons: Success/failure patterns across all SDs"
      ],
      "version": "4.0.0",
      "key_metrics": {
        "min_action_items": 3,
        "min_improvements": 3,
        "min_key_learnings": 5,
        "pattern_emergence_sds": "8-10",
        "retrospectives_analyzed": 74,
        "organizational_scale_sds": "50+",
        "quality_score_requirement": 70
      },
      "improvements": [
        {
          "title": "Proactive Learning Integration",
          "impact": "MEDIUM",
          "source": "SD-LEO-LEARN-001",
          "benefit": "Query prior retrospectives to identify recurring patterns"
        },
        {
          "title": "Automated Quality Validation",
          "impact": "HIGH",
          "source": "SD-A11Y-ONBOARDING-001, SD-VIF-TIER-001",
          "benefit": "Trigger enforces 70+ score, ≥5 learnings, ≥3 improvements"
        },
        {
          "title": "Database-Driven Validation",
          "impact": "HIGH",
          "source": "SD-A11Y-ONBOARDING-001",
          "benefit": "Constraints + triggers ensure data quality at insert"
        },
        {
          "title": "Comprehensive Content Requirement",
          "impact": "HIGH",
          "source": "SD-A11Y-ONBOARDING-001",
          "benefit": "Better insights than generic template responses"
        },
        {
          "title": "Pattern Recognition Timeline",
          "impact": "MEDIUM",
          "source": "Repository lessons (74+ retrospectives)",
          "benefit": "Actionable patterns after 8-10 SDs, org learning at 50+"
        },
        {
          "title": "Retrospectives for All SD Types",
          "impact": "MEDIUM",
          "source": "SD-VIF-PARENT-001",
          "benefit": "Captures architectural decisions, not just code changes"
        }
      ],
      "last_updated": "2025-10-26T17:00:28.482Z",
      "failure_patterns": [
        "Generic template responses (no specific metrics)",
        "Skipping retrospectives for non-implementation SDs",
        "Low-quality content (< 70 score)",
        "Missing specific SD references (no learning transfer)",
        "Incomplete action items (no category)",
        "Bypassing quality validation triggers"
      ],
      "success_patterns": [
        "Quality validation enforces 70+ score requirement (automated)",
        "Database constraints + triggers ensure data quality at insert",
        "Specific metrics enable pattern recognition (not generic phrases)",
        "Pattern emergence after 8-10 SDs enables systemic improvements",
        "Retrospectives for all SD types capture all learning",
        "Comprehensive content > generic template responses",
        "Organizational learning at scale (50+ SDs analyzed)"
      ]
    },
    "capabilities": [
      "Proactive learning: Query prior retrospectives for patterns",
      "Quality score validation: 70+ requirement (automated trigger)",
      "Database-driven validation: Constraints + trigger functions",
      "Comprehensive content generation: ≥5 learnings, ≥3 improvements",
      "Pattern recognition over time: 3-5 SDs (emerge), 8-10 SDs (actionable)",
      "Retrospectives for all SD types: Implementation + non-implementation",
      "Specific metrics requirement: Avoid generic phrases",
      "Action item categorization: Clear next steps with categories",
      "Database-first storage: retrospectives table (NOT markdown)",
      "Automated retrospective generation via scripts",
      "Quality trigger enforcement: Minimum content standards",
      "Organizational learning at scale: 50+ SDs analyzed"
    ],
    "domain_embedding": "[-0.011633096,0.07301528,0.0672278,0.015424672,-0.026353711,0.00035525835,-0.02362791,0.00853266,0.019080603,0.038161207,0.052733257,-0.07709752,0.019300217,-0.0383679,0.023175763,0.059166666,0.013196234,0.0022122907,-0.012840975,0.030901019,0.05921834,0.0039143013,0.0044374997,0.044852983,0.005826237,-0.03865211,-0.02782642,0.03165029,-0.010987172,-0.0006923501,0.018331332,-0.030177582,-0.039298035,0.012666576,-0.024855167,0.053689227,-0.0028275335,-0.02782642,0.03283879,-0.018383006,0.0324254,-0.043044396,0.015075873,0.050485443,0.014106986,-0.014094068,0.0062137917,0.009527383,-0.019726528,0.037515283,-0.045602255,-0.010095797,0.001035901,0.013758187,0.038703784,0.0064043393,-0.010044123,0.009695323,-0.025888646,0.017181586,0.047901746,-0.037489444,0.03190866,-0.065057494,-0.014882095,-0.01997198,-0.047643375,-0.0189385,-0.03165029,-0.024286753,0.053689227,-0.004569914,-0.028704876,-0.022439409,0.020269103,-0.0050026835,0.020204512,0.045498908,0.0011570118,0.039530568,0.015024199,-0.0072989445,-0.021690138,-0.02114756,-0.024868086,-0.0324254,-0.04862518,-0.040486533,-0.06066521,0.017259097,-0.043535296,0.015011281,-0.030074235,0.021134643,0.041933406,0.0067434497,-0.0027144968,-0.0067240717,0.032451235,0.043199416,0.03847125,-0.04462045,-0.030074235,0.04051237,0.042811863,-0.03046179,0.012776382,-0.024984352,-0.022077693,-0.013758187,-0.06547089,-0.055239446,-0.02668959,0.029014919,-0.032890465,0.008145105,-0.016328966,-0.009294851,-0.010941957,-0.016445233,-0.007796306,0.045757275,-0.0046441955,-0.023834607,0.031159388,-0.028937409,-0.012156295,-0.019093523,0.014520378,-0.03139192,0.065367535,-0.03327802,0.05056295,-0.068778016,0.0073958333,-0.011826874,-0.04498217,0.020785844,-0.06268049,-0.04387118,0.011574963,0.017594978,-0.030048398,0.009223799,-0.0047410843,-0.0032473844,0.044723798,0.015825145,0.0081580235,0.04511135,-0.022762371,0.0014387964,-0.034363173,0.009876182,0.010192685,0.0009632346,-0.0047120177,-0.006016785,-0.01356441,-0.019752365,0.036817685,0.040641557,-0.044827145,0.008435771,0.021535115,-0.03984061,-0.036740173,0.037076056,-0.038342066,-0.03079767,-0.05415429,-0.07518559,0.007286026,0.008978347,0.018615538,-0.0028937408,-0.028239809,-0.015566776,-0.036481805,0.021496361,-0.058908295,-0.020798761,-0.04725582,0.012950782,-0.026663754,-0.028704876,-0.030022562,0.0042760186,0.011168031,0.0131187225,-0.0056679854,0.019338973,0.034931585,0.019997817,0.0028905112,-0.0044665663,0.03428566,0.0048993356,-0.026224526,-0.021961426,-0.04702329,-0.037747815,0.046739083,-0.023744177,0.0007944869,0.0013943891,0.008500364,0.034259826,0.016845705,-0.03387227,-0.000496958,-0.0026143785,0.029040756,0.06655604,-0.012556768,0.007783388,0.024390101,0.028601527,0.00036575462,0.041571688,0.0017633733,-0.03643013,0.023072416,0.015540939,-0.0016939364,0.10174599,0.018124636,-0.014068231,-0.0051577054,-0.07446215,-0.0067692865,-0.0073570777,-0.06299054,-0.004505322,0.031340245,-0.019726528,-0.0054322234,-0.008461609,0.019661935,-0.015075873,0.059425034,0.014378275,-0.008455149,-0.02772307,-0.00067055016,0.02566903,-0.04265684,-0.026767103,-0.013538573,-0.006281614,0.040667392,-0.050898835,0.005674445,0.007951328,0.030410115,-0.06789956,0.001651144,-0.06944978,-0.016677765,0.024235079,0.01723326,-0.024958514,0.017388282,-0.004886417,-0.046558224,0.009113992,-0.024971433,0.036481805,-0.015993085,-0.0033394285,-0.027309678,0.04128748,0.004479485,0.051312227,0.025707787,-0.027180495,0.014236172,-0.016690684,-7.7157674e-05,-0.049684495,0.029919213,0.0050575873,0.0063494355,0.01629021,0.010186226,0.025824053,-0.004973617,0.058546577,0.009856804,0.02183224,-0.048418485,-0.02867904,0.014727074,-0.07544395,0.018124636,-0.018150473,0.0067176125,0.0076735807,0.008842704,-0.011478075,0.028084788,-0.037954513,-0.07415211,-0.0064883097,0.013538573,0.0114264,-0.006007096,-0.047229983,0.010315411,-0.016354803,0.007634825,-0.028704876,0.01629021,-0.015553857,-0.050485443,-0.005393468,0.058494903,0.0028888963,0.059011642,-0.07957787,-0.004305085,-0.05358588,0.04291521,0.0074345884,0.012175673,-0.02269778,-0.011271379,-0.019597342,0.03898799,0.0026822006,0.028446505,-0.016006004,0.0019506913,0.0121175395,-0.026999636,-0.001595433,-0.015308405,-0.012111081,-0.036378454,-0.029583333,-0.058804948,-0.030901019,-0.04087409,-0.01603184,0.033303857,0.02482933,-0.031107714,0.024092976,-0.02491976,0.016832788,0.019442322,-0.007835061,-0.023382459,0.010476892,-0.0060426216,-0.0060103256,-0.028317321,-0.01202711,-0.025281476,0.0042889374,-0.024028383,0.0077510914,0.05051128,-0.021173399,0.04250182,0.06257714,-0.022839883,0.00052118016,-0.005399927,-0.022555675,0.029919213,0.030074235,-0.035499997,0.03046179,-0.045188863,0.03583588,0.026314955,0.017556222,0.013202692,0.043199416,0.017969614,-0.018060043,-0.0032183179,0.012737627,0.050020378,0.05399927,-0.0032554583,-0.001894173,-0.034337334,-0.0131187225,-0.015424672,-0.027697233,0.0047927583,-0.016936135,0.016561499,-0.021909751,-0.02073417,0.03761863,0.06252547,-0.009159206,0.01918395,-0.012924945,-0.045240536,-0.0027500226,-0.001774677,0.012789301,-0.027490538,0.03710189,0.04436208,-0.0015639442,0.059580058,-0.035629183,-0.003762509,-0.009527383,-0.01902893,-0.05092467,0.0057810224,-0.005903748,0.050898835,0.02653457,0.023137009,-0.017194504,0.015812228,-0.039375544,0.006116903,0.05637627,0.0029680221,0.012821597,0.009230258,-0.06665938,-0.045757275,0.020449962,0.07404876,0.018990174,-0.03413064,0.0007710721,0.029221615,0.00023172534,0.0014105372,0.026767103,0.00021900871,-0.0069307676,0.0012789301,0.03239956,-0.039013825,0.00023475311,-0.037877,-0.008041757,-0.031960335,-0.020411208,0.009030022,0.08593377,0.039788935,-0.0018974026,-0.028963245,-0.04795342,0.0035461243,-0.030745996,0.039453056,0.0055904747,-0.035499997,0.024545124,0.04684243,0.009462791,0.06417904,0.00622994,-0.015321325,0.008745815,0.0018376546,-0.021444686,-0.015088791,0.018886827,-0.020372452,0.0044665663,-0.01305413,0.039711427,-0.008351801,-0.019597342,-0.01843468,-0.00013221263,-0.018809315,-0.031262737,-0.018835152,0.043406114,0.005571097,0.037954513,-0.03542249,-0.03482824,0.02705131,0.025346069,-0.0030955921,0.008642467,0.036972705,-0.013551491,-0.04369032,-0.022981986,-0.01936481,0.02516521,-0.013461062,0.023059497,-0.014804585,-0.002252661,-0.002438364,0.040538207,0.06304221,-0.017543303,0.0032990584,0.009030022,0.03643013,0.03973726,0.004589292,-0.026818777,0.018240903,0.0006814501,0.026237445,0.01604476,-0.045059677,-0.013073508,-0.014132824,0.010715884,-0.03531914,-0.0015962404,-0.004363219,-0.01228548,0.014662481,-0.040538207,0.005041439,-0.039478894,-0.01356441,0.013047671,0.018667212,0.021883914,-0.014287845,0.02516521,-0.017504549,-0.030255094,-0.023072416,-0.016161026,-0.0520615,0.014920851,-0.0056195413,0.0141199045,0.009482169,-0.020359533,-0.024480531,-0.0119754365,-0.03490575,-0.016677765,0.008164483,0.016884461,-0.034776565,-0.036998544,0.006698235,-0.03128857,0.01117449,0.021741811,0.0024254457,-0.006756368,-0.012724709,-0.025384825,0.013015375,-0.025449418,-0.002720956,-0.025048943,-0.012195051,0.023912117,0.013067048,-0.04888355,0.02184516,0.01920979,0.016083514,-0.033303857,0.007841521,-0.0721885,-0.0063623544,-0.009178584,0.011032387,-0.030151745,-0.007990084,-0.0035041394,-0.007783388,-0.032218702,-0.020747088,0.036223434,-0.012937863,-0.0067757457,0.0121175395,0.014727074,0.020127,0.011478075,0.040305674,-0.020721251,0.0030552219,0.031572778,0.019907387,-0.019571505,-0.007286026,0.013926128,0.008254913,0.028033115,0.02108297,-0.0108321505,0.019067684,-0.025656113,0.00069033157,0.03283879,-0.02481641,-0.034233987,-0.025720704,-0.003659161,0.004556996,0.019713609,0.0015389146,-0.018589702,-0.0004913062,-0.026973799,0.027671397,0.041261643,0.03710189,-0.014520378,-0.018615538,-0.024454694,0.069398105,0.009947234,0.07208515,-0.014081149,-0.03208952,-0.029324962,0.010683588,-0.047979258,-0.017620815,0.026069505,0.0026321416,-0.019222707,0.010935498,0.012905567,0.0016648698,-0.016574416,0.005135098,0.01015393,0.052319866,-0.013318959,0.004208197,-0.0068145012,0.051234715,-0.03823872,-0.0020508096,0.010547943,-0.012272562,0.018693049,-0.048160113,-0.058753274,0.015075873,0.020411208,0.019545669,0.047152475,0.006591657,-0.001995906,-0.009165666,0.0014565593,-0.0070599522,-0.0015405294,0.008241994,0.0047023287,-0.032632094,0.047824234,0.007919032,-0.021393012,0.0054838974,0.019778201,-0.06986317,0.022232713,0.020023653,-0.008377638,-0.0018295805,-0.012136918,0.0066917758,-0.042217612,0.016729439,0.059114993,0.013951965,0.007970706,-0.040331513,0.014197416,3.5677225e-05,-0.021858077,0.018744722,0.008545578,0.038936317,-0.01057378,0.00021557724,-0.03710189,-0.0122402655,0.004621588,-0.013603166,0.021612627,0.006853257,0.017207423,-0.0024690456,-0.08267831,0.012298399,0.015566776,0.0026822006,-0.015230895,-0.008338883,-0.020282023,0.015424672,0.020966703,-0.0005449986,-0.038703784,-0.0070341155,0.005383779,-0.01484334,0.020243267,-0.03764447,0.0028146151,-0.012905567,0.022452328,0.022749454,-0.029324962,-0.026508734,0.015889738,-0.040383186,0.006023244,0.0050995722,-0.012195051,0.0054806676,0.03524163,0.021961426,-0.004495633,-0.038626272,0.029040756,0.020721251,-0.009675946,-0.009611353,0.008681223,-0.04761754,0.0015259961,0.011381186,-0.009456332,-0.0259274,-0.029247452,-0.0057713334,0.026185771,0.023679584,-0.0238992,-0.014442867,0.054981075,0.00039482123,0.0155280195,0.01706532,0.011252001,-0.00089137553,-0.012356532,0.04102911,-0.03725691,-0.006136281,-0.022659024,0.0047313953,0.039608076,0.03498326,0.00046022105,0.017814592,-0.0077252546,0.008965429,0.018331332,-0.00078883505,0.021470523,-0.020927947,0.006594887,0.01193668,-0.004870269,-0.024790574,0.0015050035,0.014804585,0.005512964,0.0039175306,0.015605531,-0.040719066,0.034337334,-0.002286572,-0.009269014,0.011206786,0.030901019,-0.04529221,-0.026482895,0.024222162,0.012776382,-0.033639736,-0.01731077,0.0093206875,-0.0024851938,0.01800837,-0.02790393,-0.021535115,-0.017685408,-0.0010036048,-0.06882969,-0.0011093749,0.022478165,0.0009487013,0.023356622,0.018912664,0.026289118,0.0044665663,0.02679294,-0.030332604,0.024041303,-0.030229257,0.028110625,-0.016587336,0.018240903,0.017439956,0.0009608124,-0.0141199045,-0.002748408,0.016264373,0.0013394855,-0.010244359,0.035164118,0.049348615,-0.013538573,0.005083424,0.007835061,-0.0015292257,0.031546943,0.019532751,0.010186226,-0.01807296,-0.039272197,0.022723617,-0.0004537618,0.013215611,-0.0030665256,0.040486533,-0.02277529,-0.020669578,-0.025617357,-0.0013499818,0.042424306,0.007964247,0.07921615,0.01049627,-0.023550399,0.01391321,-0.018202147,0.026922124,-0.010903202,0.011058223,-8.210303e-05,-0.012182132,0.033562224,0.005978029,0.008965429,-0.035861716,0.016070597,0.004037027,-0.0019313137,-0.005638919,0.0077769286,0.0056809043,-0.0075896103,0.007789847,0.0003074196,-0.013448143,-0.010386462,0.012188591,0.038626272,-0.02586281,-0.048599344,0.020747088,-0.016432313,-0.025346069,0.038936317,-0.04105495,-0.014895014,-0.0341048,0.026922124,0.0061007547,0.0093013095,0.034518193,-0.010476892,-0.0023608534,0.020282023,0.01654858,-0.022659024,0.063145556,0.018744722,0.017775837,0.045033842,-0.004314774,-0.0031181995,0.02782642,-0.0025627047,0.0039788936,0.024105895,0.0007565388,-0.022193959,0.030177582,-0.009740538,0.008403475,-0.008493904,0.016186863,0.0076025287,0.0057035116,-0.014817503,-0.0055904747,0.0057454966,-0.0007218204,0.028162299,-0.0055388007,-0.003694687,0.017362446,0.020411208,0.009113992,-0.0062493174,-0.021883914,0.028213972,0.020127,-0.06526419,-0.0045246994,-0.0042695594,0.007738173,-0.006378502,0.0021735353,0.017956695,0.022336062,0.052423216,0.036895197,-0.0071439226,0.056686316,-0.03387227,0.008952511,0.035629183,-0.02013992,-0.03839374,0.014313682,-0.0020362763,-0.0038044942,0.019532751,-0.013577329,0.014546215,-0.029324962,-0.032218702,0.018460516,0.02218104,0.0018021287,0.032347888,0.039401382,0.009049399,0.03725691,-0.031366084,0.02482933,-0.014778748,-0.04027984,-0.011497452,-0.0020427355,0.028446505,0.026663754,-0.0055258824,-0.031030202,-0.001573633,0.0058004,-0.0061556585,-0.016677765,0.025346069,0.0033103619,0.031753637,-0.013189774,-0.015838064,-0.011045305,-0.0017246179,0.04232096,0.006808042,-0.0028646742,0.028782386,0.0052093794,-0.03557751,0.011872089,-0.006378502,0.04702329,0.016419396,0.0133835515,-0.02577238,-0.014210334,-0.008151565,0.006071688,0.016367722,0.03725691,0.031882823,0.027335515,-0.058753274,-0.012705331,-0.011581423,-0.0029696368,-0.003946597,0.0014355667,-0.03072016,0.070276566,0.03183115,0.006388191,0.030875182,0.029324962,0.017439956,0.013086426,-0.01782751,0.01834425,-0.0016341885,0.02457096,-0.005700282,0.012673034,-0.01919687,0.0074345884,-0.0010512418,0.015050036,-0.028627364,0.010347707,-0.050821323,-0.03764447,-0.047049124,0.017956695,-0.0058553037,-0.021612627,-0.013151019,-0.02968668,0.004821825,0.0038238717,-0.017349526,0.051803127,-0.010250819,-0.005861763,0.007583151,-0.012589064,-0.008054676,-0.012311317,0.019920304,0.00041944708,-0.0075508547,0.016522743,-0.00058415777,0.0023188682,-0.023059497,0.0066207238,0.021108806,0.0020588837,0.014455786,-0.017892104,-0.009656568,0.00989556,0.039013825,-0.014985443,-0.043638647,-0.039711427,-0.010948417,0.025449418,0.017439956,0.015011281,-0.014184497,-0.04443959,-0.00972762,-0.01603184,-0.02209061,0.019171033,-0.0023220978,0.00955968,0.0042953966,-0.0005429801,-0.011038846,0.01630313,-0.00631391,0.0048573506,0.0011521674,-0.011071143,0.0014428333,-0.019597342,-0.012375909,-0.02764556,-0.011697689,0.02073417,0.0028614446,0.04666157,0.028937409,-0.03958224,0.0074022925,-0.0030810589,0.004980076,0.0042857076,-0.01109052,0.018370086,-0.024247998,0.016225617,0.001404078,0.00571643,0.0013653225,-0.0065238355,0.053172488,-0.0021525426,-0.03984061,0.01193668,0.02712882,-0.030513464,-0.004896106,0.008894377,-0.031004366,-0.02218104,0.015838064,0.01245988,-0.03994396,0.0025530157,0.011710607,0.06092358,0.00272903,-0.005315957,0.011968977,-0.033768922,-0.04358697,-0.012343613,0.006840338,-0.008655385,0.005742267,0.0076219067,-0.018060043,-0.02586281,-0.016703602,-0.02603075,-0.020850437,0.0033103619,-0.031004366,0.006943686,-0.039065503,-0.019765284,-0.0017779066,0.026637917,-0.004188819,-0.013473981,0.026973799,0.00862309,0.014972525,-0.0056679854,-0.01228548,-0.008752274,0.022361899,-0.03614592,-0.01732369,-0.019765284,-0.025578601,0.015424672,0.07384206,0.013073508,-0.013125181,0.029583333,-0.017388282,0.015062954,-0.0049122544,0.02405422,0.00047636917,-0.0039207605,-0.04384534,0.013021833,0.04172671,-0.004172671,-0.010618995,-0.009508005,-0.022659024,0.03934971,0.021548035,-0.00384002,0.04139083,0.019093523,0.018731805,0.021961426,0.010354166,0.022736534,0.008952511,-0.00809989,0.015140465,0.03542249,0.013667758,-0.035267465,-0.014597889,0.016729439,0.013512736,-0.0004852506,0.004673262,0.015205057,0.011736444,-0.0050123725,0.017749999,-0.011684771,-0.010315411,-0.0037980347,-0.03131441,0.034156475,0.03575837,0.03079767,-0.00070405746,-0.009882642,0.0070793303,0.039814774,-0.01040584,-0.002414142,-0.0033911024,-0.0033103619,-0.0066659385,0.03128857,0.011904385,-0.042553492,-0.024028383,-0.011484534,-0.0034104802,-0.025901563,-0.008797489,-0.013758187,-0.009675946,-0.007990084,0.0018554175,0.004879958,-0.013525655,0.033045486,0.013577329,0.030125909,0.009624272,0.024622634,0.0077187954,0.015295487,-0.001740766,-0.02857569,-0.01732369,0.0021218613,-0.019687772,-0.030022562,-0.001868336,0.018215066,0.042941045,-0.008074054,-0.004301856,0.015876818,0.005709971,0.009307769,0.019571505,0.008003002,-0.009294851,0.010670669,0.026069505,-0.027568048,-0.029919213,-0.0067692865,0.041933406,-0.0020152838,-0.008397016,0.031546943,-0.022710698,-0.025901563,0.0022623497,0.0012684339,-0.018628456,0.010806314,0.018460516,0.022284389,-0.0102185225,-0.016910298,-0.013590247,0.038497087,0.013021833,-0.013344795,-0.024596797,-0.031004366,0.03557751,0.02379585,0.0012506709,-0.0018570323,-0.016238537,0.031236898,0.006246088,-0.05051128,-0.025242722,-0.008222616,0.032296214,0.009772834,0.029454147,-0.009843886,0.013267285,-0.013041211,0.0077640098,0.012769924,0.02414465,-0.029557496,-0.012111081,0.023434132,-0.0042308043,-0.022917394,0.006210562,-0.02883406,-0.0038497087,-0.005726119,0.040176492,0.036404293,-0.02003657,-0.0065206056,-0.00044407294,0.019700691,0.0055420306,-0.0079319505,0.00025069938,0.0044568777,0.0075637735,0.029014919,-0.019416485,0.0001977134,0.0065206056,-0.011213246,0.008836244,-0.020372452,0.0066723977,0.027516374,0.044413753,0.010360626,-0.03449236,-0.00784798,0.0077252546,0.006491539,-0.020772925,0.016716521,0.005451601,-0.018680131,0.0045279292,-0.004831514,0.0022720387,0.03206368,0.027774744,-0.009598435,-0.01630313,0.010095797,-0.0040047304,-0.015372998,-0.016858624,-0.025242722,-0.0016317662,0.017698325,0.012983078,-0.005496816,0.007583151,0.034414846,0.013835698,-0.027361352,-0.011419942,0.027955603,-0.0033329693,-0.015062954,-0.018705968,0.019687772,-0.023020742,-0.006917849,-0.003949827,-0.015295487,-0.0026805857,0.040202327,-0.017168667,0.017168667,-0.013654839,-0.005186772,-0.0037237536,0.04539556,-0.01816339,-0.007634825,0.010108715,0.03710189,-0.028937409,0.004143604,7.993313e-05,-0.021341339,0.001936158,0.06051019,-0.007447507,-0.006039392,-0.034569867,0.00102379,0.016574416,-0.017336607,-0.006578739,7.0345195e-05,-0.026896287,-0.00014926906,-0.054205965,0.021134643,-0.021987263,0.004324463,-0.0050285207,-0.020630822,0.018550945,-0.016587336,0.015644286,0.03746361,0.048056766,-0.010909662,-0.032709606,-0.008461609,-0.0074087516,0.005357942,0.027077146,-0.029040756,0.0024496678,-0.00972762,-0.01715575,-0.023098253,-0.0022930312,0.03521579,0.014210334,-0.00041177674,-0.006885553,0.0010326714,-0.020114083,0.021612627,-0.05128639,0.01988155,-0.012614901,0.017698325,-0.02772307,0.024545124,-0.0072472706,-0.026663754,-0.027258005,0.015114629,0.0039788936,0.013131641,0.013758187,-0.035680857,0.018563865,0.00056276156,-0.028885733,-0.0072537297,-0.004298626,-0.018486353,0.008112809,-0.011762281,0.022581514,-0.0078092245,0.03898799,0.029919213,-0.0022219797,0.012291939,0.03146943,0.0042275744,-0.032735445,-0.033407204,0.0030988217,0.010296033,0.010702966,0.0128732715,0.0067111533,-0.0305393,0.036972705,0.028808223,-0.010160389,-0.0036656202,-0.01526965,-0.018202147,0.031081878,0.011962518,-0.010360626,0.0021670759,0.03128857,-0.0058940593,0.008377638,-0.018331332,-0.010890284,0.017930858,0.026198689,0.022310225,-0.005306268,0.008881459,0.049917027,0.01799545,-0.034776565,0.016522743,0.013021833,-0.022994904,0.024235079,0.028446505,0.00784798,0.018654294,-0.011129276,-0.005709971,0.014636644,0.021974344,-0.015192139,-0.013525655,0.00056276156,0.002338246,0.012718249,-0.036223434,0.0035655021,0.002013669,-0.008552037,0.029970886,0.011620178,-0.0019248544,-0.00072747224,0.016845705,0.0011303675,0.008248453,0.015011281,-0.012782842,0.03258042,-0.011387645,-0.0071891374,-0.00529012,-0.017762918,0.013176856,-0.0018731804,-0.007783388,-0.017646652,-0.0018877137,-0.01356441,-0.0025094158,-0.012912027,-0.016884461,-0.017749999,0.010631914,0.0021735353,0.004708788,-0.022581514,-0.03684352,0.0021735353,0.0035719613,-0.03539665,-0.044387918,-0.014313682,-0.059786752,0.02431259,-0.005341794,-0.0023414756,0.0024464382,0.0041791303,0.00225912,-0.0329163]",
    "embedding_generated_at": null,
    "embedding_model": "text-embedding-3-small"
  },
  {
    "id": "aa25f235-89bd-4263-9c5a-9583d9178f62",
    "code": "GITHUB",
    "name": "DevOps Platform Architect",
    "description": "# DevOps Platform Architect Sub-Agent\n\n**Identity**: You are a DevOps Platform Architect with 20 years automating workflows. Helped GitHub design Actions, built CI/CD at GitLab.\n\n## Core Directive\n\nWhen invoked for CI/CD or GitHub-related tasks, you serve as an intelligent router to the project's GitHub verification system AND enforce refactoring safety protocols.\n\nYour dual role:\n1. **CI/CD Verification**: Validate pipeline status and deployment readiness\n2. **Refactoring Safety**: Prevent feature loss during code reorganization\n\n## Invocation Commands\n\n### For GitHub Actions Verification\n```bash\nnode scripts/github-actions-verifier.js <SD-ID>\n```\n\n**When to use**:\n- PLAN verification phase (validating CI/CD status)\n- After EXEC implementation (before PLAN→LEAD handoff)\n- Deployment readiness check\n- Pipeline status validation\n- **NEW**: After large refactorings (>200 LOC delta in single file)\n\n### For Targeted Sub-Agent Execution\n```bash\nnode lib/sub-agent-executor.js GITHUB <SD-ID>\n```\n\n**When to use**:\n- Quick pipeline status check\n- Part of sub-agent orchestration\n- Single verification needed\n\n### For Phase-Based Orchestration\n```bash\nnode scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>\n```\n\n**When to use**:\n- Multi-agent verification workflow\n- Automated handoff validation\n- GITHUB runs alongside TESTING, DATABASE, etc.\n\n---\n\n## 🚨 CRITICAL: Refactoring Safety Protocol (NEW)\n\n**Evidence**: 2 critical incidents in 48 hours (2025-10-26)\n- **Browse Button Missing**: 7 user stories (24 story points) lost during refactoring\n- **Disconnected Dialog**: Full feature inaccessible despite being 100% complete\n- **Root Cause**: 17 E2E tests existed but were NOT run during refactoring\n\n### Refactoring Detection Threshold\n\n**Trigger refactoring safety checks when**:\n- LOC delta > 200 in single file\n- Component extraction (file split into multiple files)\n- File rename with significant changes\n- Keywords: \"refactor\", \"reorganize\", \"extract\", \"split\"\n\n### Pre-Refactoring Checklist (MANDATORY)\n\n```markdown\n## Pre-Refactoring Safety Checklist\n\n**MANDATORY before ANY refactoring > 200 LOC delta**:\n\n1. [ ] **Feature Inventory Created**\n   - List ALL user-facing features in the component\n   - List ALL integration points (props, state, navigation, URL params)\n   - List ALL event handlers (onClick, onChange, onSubmit)\n   - List ALL API calls and data fetching\n\n2. [ ] **Cross-SD Dependencies Identified**\n   - Run: `grep -r \"SD-\" <file-path>`\n   - Check if file contains code from multiple SDs\n   - Document SDs that will be affected: `docs/sd-dependencies.md`\n\n3. [ ] **Existing E2E Tests Identified**\n   - Find tests: `find tests/e2e -name \"*<component>*\"`\n   - Count tests covering this component\n   - **CRITICAL**: Note the count for post-refactoring validation\n\n4. [ ] **Manual Testing Checklist Created**\n   - Screenshot/video ALL features working (before state)\n   - List manual testing steps to verify each feature\n   - Include edge cases and error states\n\n5. [ ] **Integration Points Documented**\n   - URL parameters used by component\n   - Query parameters and deep links\n   - Navigation paths (where component can navigate to)\n   - Event handlers that trigger external actions\n   - State management (context, Redux, local state)\n```\n\n### Post-Refactoring Verification (MANDATORY)\n\n```markdown\n## Post-Refactoring Verification Checklist\n\n**MANDATORY after refactoring - BLOCKS PR approval**:\n\n1. [ ] **Run ALL E2E Tests**\n   - Execute: `npm run test:e2e` or `npx playwright test`\n   - **BLOCKING**: All tests MUST pass\n   - If tests fail: STOP, fix before proceeding\n\n2. [ ] **Feature Parity Validation**\n   - Verify EVERY feature from inventory still works\n   - Screenshot/video ALL features working (after state)\n   - Compare before/after screenshots\n   - **BLOCKING**: Any missing feature = refactoring incomplete\n\n3. [ ] **Integration Points Preserved**\n   - Test ALL URL parameters still work\n   - Test ALL navigation paths still work\n   - Test ALL event handlers still trigger\n   - Test ALL API calls still execute\n\n4. [ ] **Git Diff Review**\n   - Review: `git diff HEAD~1 <file-path>`\n   - Look for removed imports related to features\n   - Look for removed state variables\n   - Look for removed useEffect hooks\n   - **WARNING**: Any feature-related removal needs investigation\n\n5. [ ] **Manual Testing Completed**\n   - Execute manual testing checklist from pre-refactoring\n   - Verify edge cases still work\n   - Verify error handling still works\n   - **BLOCKING**: Manual testing must match pre-refactoring behavior\n```\n\n---\n\n## Issue Patterns from Database\n\n### PAT-002: Test Path Errors After Component Rename/Refactoring\n\n**Pattern**: Test path errors after component rename or refactoring\n- **Category**: testing\n- **Severity**: medium\n- **Occurrences**: 3 times\n- **Trend**: stable\n\n**Root Cause**: Import paths in tests not updated after file rename/move\n\n**Proven Solution**:\n1. Search for old component name in tests: `grep -r \"OldComponentName\" tests/`\n2. Update import paths to new component location\n3. Run tests to verify: `npm run test`\n4. Check test file paths match new component structure\n\n**Prevention**:\n- [ ] After file rename: Search ALL test files for old filename\n- [ ] Use IDE refactoring tools (auto-update imports)\n- [ ] Run test suite immediately after rename\n- [ ] Update test file names to match component names\n\n---\n\n### PAT-008: CI/CD Pipeline Failures (Environment/Dependencies)\n\n**Pattern**: CI/CD pipeline failures due to environment variable or dependency issues\n- **Category**: deployment\n- **Severity**: high\n- **Occurrences**: 2 times\n- **Trend**: stable\n\n**Root Cause**: Environment variables or dependencies not properly configured in CI/CD\n\n**Proven Solution**:\n1. Check GitHub Actions secrets: Settings → Secrets → Actions\n2. Verify .env.example matches required variables\n3. Check package.json dependencies are installed in CI\n4. Review GitHub Actions workflow file for missing steps\n\n**Prevention**:\n- [ ] Add .env.example validation to CI/CD\n- [ ] Document required environment variables in README\n- [ ] Use `npm ci` instead of `npm install` in CI (faster, more reliable)\n- [ ] Add dependency cache to GitHub Actions workflow\n\n**Example Fix**:\n```yaml\n# .github/workflows/ci.yml\n- name: Install dependencies\n  run: npm ci\n\n- name: Validate environment variables\n  run: |\n    if [ ! -f .env.example ]; then\n      echo \"Missing .env.example\"\n      exit 1\n    fi\n```\n\n---\n\n### PAT-010: Testing Coverage for Edge Cases\n\n**Pattern**: Testing coverage could be expanded to include edge cases\n- **Category**: testing\n- **Severity**: low\n- **Occurrences**: 1 time\n- **Trend**: stable\n\n**Prevention**:\n- [ ] Add edge case tests to test plan\n- [ ] Test boundary conditions (empty arrays, null values, max values)\n- [ ] Test error states (network failures, validation errors)\n- [ ] Test race conditions (async operations)\n\n---\n\n## Key Success Patterns\n\nFrom retrospectives and lessons learned:\n\n### 1. **CI/CD Verification Prevents Broken Deployments**\n- **Pattern**: Wait 2-3 minutes for GitHub Actions to complete before approval\n- **Verification**: All checks must be green (no yellow, no red)\n- **Command**: `gh run list --limit 5` to check status\n- **BLOCKING**: Failed pipelines BLOCK PLAN→LEAD handoff\n- **ROI**: 120:1 ratio (preventing production incidents)\n\n### 2. **E2E Test Execution During Refactoring is MANDATORY**\n- **Pattern**: Run E2E tests BEFORE committing refactoring\n- **Evidence**: 17 E2E tests existed but were NOT run during refactoring\n- **Impact**: 7 user stories (24 story points) lost, full feature inaccessible\n- **Time Saved**: 10-20 hours per prevented incident\n- **Command**: `npm run test:e2e` or `npx playwright test`\n\n### 3. **Feature Inventory Prevents Feature Loss**\n- **Pattern**: Create systematic list of features before refactoring\n- **Impact**: Would have caught Browse Button removal\n- **Template**: See Pre-Refactoring Checklist above\n\n### 4. **Cross-SD Dependencies Must Be Visible**\n- **Pattern**: Document which SDs contributed code to a file\n- **Location**: `docs/sd-dependencies.md`\n- **Command**: `grep -r \"SD-\" <file-path>` to find references\n- **Impact**: Prevents accidental removal of other SD's features\n\n---\n\n## GitHub CLI Commands\n\n**List Recent Runs**:\n```bash\ngh run list --limit 5\n```\n\n**View Specific Run**:\n```bash\ngh run view [run-id]\n```\n\n**Check Workflow Status**:\n```bash\ngh run list --workflow=[workflow-name]\n```\n\n**Wait for Workflow Completion**:\n```bash\n# Wait up to 5 minutes for workflow to complete\ngh run watch [run-id]\n```\n\n**Re-run Failed Workflow**:\n```bash\ngh run rerun [run-id]\n```\n\n---\n\n## Refactoring Incident Prevention Template\n\n**Use this template when detecting large refactorings**:\n\n```markdown\n# Refactoring Safety Report\n\n**Component**: [component name]\n**File**: [file path]\n**LOC Delta**: [number] (>200 triggers safety checks)\n**SD Context**: [SD-ID if applicable]\n\n## Pre-Refactoring State\n\n### Feature Inventory\n- [ ] Feature 1: [description]\n- [ ] Feature 2: [description]\n- [ ] Feature 3: [description]\n\n### Cross-SD Dependencies\n- [ ] SD-XXX: [feature/code description]\n- [ ] SD-YYY: [feature/code description]\n\n### E2E Tests\n- Count: [number] tests covering this component\n- Location: [test file paths]\n- Baseline: All tests passing ✅\n\n### Integration Points\n- URL params: [list]\n- Event handlers: [list]\n- API calls: [list]\n- Navigation: [list]\n\n## Post-Refactoring Verification\n\n### E2E Test Results\n- [ ] All [number] E2E tests passing\n- [ ] Test execution time: [time]\n- [ ] Screenshots: [before/after links]\n\n### Feature Parity\n- [ ] Feature 1: ✅ Working\n- [ ] Feature 2: ✅ Working\n- [ ] Feature 3: ✅ Working\n\n### Integration Points Preserved\n- [ ] URL params: ✅ All working\n- [ ] Event handlers: ✅ All working\n- [ ] API calls: ✅ All working\n- [ ] Navigation: ✅ All working\n\n### Git Diff Review\n- [ ] No feature-related removals detected\n- [ ] All imports preserved\n- [ ] All state variables preserved\n- [ ] All hooks preserved\n\n## Verdict\n\n**Refactoring Safe to Merge**: ✅ YES / ❌ NO\n\n**Blockers** (if NO):\n- Issue 1: [description]\n- Issue 2: [description]\n```\n\n---\n\n## Advisory Mode (No SD Context)\n\nIf the user asks general CI/CD questions without an SD context, provide expert guidance based on project patterns:\n\n**Key CI/CD Patterns**:\n- **Wait for Completion**: 2-3 minutes for GitHub Actions to finish\n- **All Green Required**: All checks must pass before PLAN→LEAD handoff\n- **Pipeline Verification**: Check via `gh run list --limit 5`\n- **Workflow Status**: Use `gh run view [run-id]` for details\n- **Blocking Failures**: Failed pipelines BLOCK handoff approval\n- **Refactoring Detection**: LOC delta > 200 triggers E2E test requirement\n\n**Refactoring Safety**:\n- **Pre-Refactoring**: Feature inventory, Cross-SD deps, E2E tests identified\n- **Post-Refactoring**: Run ALL E2E tests, verify feature parity, review git diff\n- **Blocking**: E2E test failures = STOP, do not proceed\n- **Time Investment**: 15-30 minutes pre-work saves 10-20 hours of incident response\n\n---\n\n## Remember\n\nYou are an **Intelligent Trigger** for:\n1. **CI/CD Verification**: The pipeline status logic, workflow validation, and deployment checks live in the scripts—not in this prompt.\n2. **Refactoring Safety**: The feature preservation logic, test execution, and parity verification are enforced through checklists—not automated.\n\nYour value is in:\n- Recognizing when GitHub Actions verification is needed\n- **NEW**: Detecting large refactorings (>200 LOC delta)\n- **NEW**: Enforcing pre/post-refactoring checklists\n- **NEW**: Preventing feature loss through systematic verification\n- Routing to the appropriate validation system\n\n**When in doubt**:\n- **CI/CD**: Verify pipeline status before any approval or deployment decision\n- **Refactoring**: Run E2E tests before committing any refactoring >200 LOC\n- **Feature Loss**: Create feature inventory before touching any component\n\n**Failed CI/CD checks = non-negotiable blockers**\n**Missing features after refactoring = incomplete refactoring**\n\n---\n\n## Lessons Learned Integration\n\n**Evidence from Recent Incidents (2025-10-26)**:\n\n1. **Browse Button Missing**:\n   - **What Happened**: 7 user stories (24 story points) lost during refactoring\n   - **Root Cause**: 17 E2E tests existed but were NOT executed\n   - **Prevention**: MANDATORY E2E test execution for refactorings >200 LOC\n   - **Time Lost**: Unknown (user-reported, could be days/weeks)\n\n2. **Disconnected Venture Dialog**:\n   - **What Happened**: Full feature (309 LOC) built but never connected to UI\n   - **Root Cause**: No UI integration verification in final checks\n   - **Prevention**: See validation-agent GATE 4 (UI Integration Verification)\n   - **Time Lost**: Unknown (user-reported, could be days/weeks)\n\n**Common Thread**: Both incidents preventable with systematic verification\n\n**Prevention Strategy**:\n- Feature inventory before refactoring\n- E2E test execution during refactoring\n- UI integration verification after implementation\n- Cross-SD dependency documentation\n- Git diff review for removed functionality\n\n**Impact**: These protocols prevent 10-20 hours of incident response per incident\n\n---\n\n**Version**: 2.0.0 (Enhanced with Lessons Learned)\n**Last Updated**: 2025-10-26\n**Enhancements**: 7 new patterns, 2 mandatory checklists, 3 issue patterns integrated\n**Database Patterns**: PAT-002, PAT-008, PAT-010\n**Lesson Integration**: Browse Button incident, Disconnected Dialog incident\n",
    "activation_type": "automatic",
    "priority": 90,
    "script_path": "scripts/github-deployment-subagent.js",
    "context_file": null,
    "active": true,
    "created_at": "2025-09-24T17:26:13.926Z",
    "metadata": {
      "sources": [
        "74+ retrospectives analyzed",
        "PAT-002: CI/CD pipeline failures",
        "PAT-008: Dependency management in CI",
        "PAT-010: Refactoring safety patterns",
        "SD-SUBAGENT-IMPROVE-001: DevOps platform integration",
        "browse-button-2025-10-26: Incident lessons",
        "disconnected-dialog-2025-10-26: Incident lessons",
        "GitHub Actions expertise and best practices"
      ],
      "version": "2.1.0",
      "key_metrics": {
        "roi_ratio": "120:1",
        "version_evolution": "v2.0 → v2.1",
        "wait_time_seconds": 180,
        "capabilities_count": 11,
        "retrospectives_analyzed": 74,
        "time_saved_per_incident": "10-20 hours",
        "issue_patterns_integrated": "PAT-002, PAT-008, PAT-010"
      },
      "improvements": [
        {
          "title": "Proactive Learning Integration",
          "impact": "MEDIUM",
          "source": "SD-LEO-LEARN-001",
          "benefit": "Query issue_patterns before CI/CD work"
        },
        {
          "title": "Refactoring Safety Protocol",
          "impact": "CRITICAL",
          "source": "PAT-010, browse-button-2025-10-26",
          "benefit": "Prevents functionality loss during refactoring (10-20 hours saved)"
        },
        {
          "title": "CI/CD Pipeline Verification",
          "impact": "HIGH",
          "source": "PAT-002, SD-SUBAGENT-IMPROVE-001",
          "benefit": "Prevents production failures, 120:1 ROI"
        },
        {
          "title": "Feature Inventory Creation",
          "impact": "HIGH",
          "source": "PAT-010, incident lessons",
          "benefit": "Tracks all functionality before refactoring"
        },
        {
          "title": "E2E Test Enforcement",
          "impact": "HIGH",
          "source": "PAT-010, refactoring safety protocol",
          "benefit": "MANDATORY pre-refactoring requirement"
        },
        {
          "title": "GitHub Actions Expertise",
          "impact": "MEDIUM",
          "source": "GitHub Actions best practices",
          "benefit": "Automation reduces manual work"
        }
      ],
      "last_updated": "2025-10-26T17:18:11.805Z",
      "failure_patterns": [
        "Refactoring without pre-existing E2E tests (PAT-010)",
        "No feature inventory before refactoring (lost functionality)",
        "Skipping CI/CD verification (deploy broken code)",
        "Missing post-refactoring validation (regressions)",
        "No cross-SD dependency checks (conflicts)",
        "Manual deployments without automation (errors)",
        "Pull requests without automated checks (quality issues)",
        "Pipeline failures ignored (cascading issues)",
        "No release automation (inconsistent deploys)",
        "Deployment workflows not tested (production failures)",
        "GitHub Actions misconfigured (failed builds)",
        "Status checks not required (merge broken code)"
      ],
      "success_patterns": [
        "CI/CD pipeline verification prevents production failures",
        "Pre-refactoring checklist ensures E2E tests exist",
        "Post-refactoring validation catches regressions",
        "Feature inventory creation tracks all functionality",
        "Cross-SD dependency tracking prevents conflicts",
        "E2E test enforcement for refactoring (MANDATORY)",
        "Feature parity validation ensures nothing lost",
        "GitHub Actions automation reduces manual work",
        "Pull request automation streamlines reviews",
        "Pipeline status checking before deployment",
        "Release automation ensures consistent deployments",
        "Deployment workflow management prevents errors"
      ]
    },
    "capabilities": [
      "CI/CD pipeline verification",
      "Pull request automation",
      "Deployment workflow management",
      "GitHub Actions expertise",
      "Pipeline status checking",
      "Release automation",
      "Refactoring safety verification",
      "Feature inventory creation",
      "Cross-SD dependency tracking",
      "E2E test enforcement for refactoring",
      "Feature parity validation"
    ],
    "domain_embedding": "[0.014060695,0.011944873,0.054630723,-0.0009221733,-0.0014469306,-0.03817434,0.0041728695,0.023173278,-0.010942937,0.03994312,0.02619588,-0.017732596,-0.032733656,-0.026016762,0.029442377,0.043279175,-0.004643052,-0.004727013,0.0058884756,0.03246498,0.044712115,-2.4007642e-05,0.036092103,0.06291489,-0.046033103,-0.015292125,-0.024001695,0.05355602,-0.042316422,-0.05315301,0.04533902,-0.032845605,-0.04435388,0.051988747,0.043413512,0.02693474,-0.0039993497,0.0038090376,0.022490395,0.050779708,-0.028681131,-0.008155427,-0.03624883,0.014844332,-0.0032213095,-0.018359507,-0.007506127,-0.03313667,-0.016545944,0.0032968747,-0.074423164,0.018986415,-0.00795392,0.03548758,0.026352607,0.022389641,-0.005950047,0.019691689,-0.015527216,0.0008850905,0.02816617,-0.070572145,-0.0047494024,0.004505915,-0.014844332,0.030673807,-0.009051013,-0.02438232,-0.016568335,-0.04545097,0.035420414,0.024180813,-0.021617198,-0.015157787,0.028479623,0.012224744,-0.013691265,0.06242232,-0.008155427,0.009543585,-0.016064567,-0.016198905,-0.011474691,-0.028613962,-0.050152797,-0.01925509,-0.041846238,-0.051540952,-0.047824275,-0.009761884,-0.012885238,0.010640677,-0.023173278,0.0066833077,0.04247315,0.0069519836,0.024718164,-0.011687392,0.05292911,0.049570665,0.06555687,-0.032912772,-0.01629966,0.053376906,0.046525676,-0.038823638,0.037592206,-0.009633143,0.040458083,-0.017508699,-0.049884122,-0.06685547,-0.014956281,0.02155003,-0.03439049,-0.0047829873,0.043794136,-0.017643036,-0.0071143084,-0.0026503738,-0.028905027,0.0055358387,0.019411819,-0.028322896,0.0015490833,-0.07361714,0.008060271,-0.05369036,-0.033629242,-0.04925721,0.02373302,-0.019893195,0.041577563,-0.035151735,0.010993314,0.025367463,-0.043458294,9.235727e-05,-0.04791383,0.0068848147,0.0035235698,-0.020632055,0.03439049,0.027069077,-0.0029582314,-0.0382639,-0.06390004,-0.03293516,-0.02693474,0.006672113,-0.0059164627,0.009028623,-0.04547336,-0.020419354,0.0028168967,0.0017715803,-0.032241084,0.052078307,0.03421137,-0.0076460624,0.011732172,0.046346556,-0.038286287,0.015840672,-0.0050712535,-0.0587952,0.010192884,0.011709782,-0.028994584,-0.015639164,-0.039584886,-0.028031832,0.0035067776,0.02090073,0.040099848,-0.01614293,-0.021314938,-0.03324862,-0.04871986,-0.015986204,-0.024024084,-0.014385344,-0.10075338,-0.032173913,-0.017956492,-0.04574204,-0.023956915,0.007836374,-0.029509546,0.0598699,-0.0061515537,0.039696835,0.002611192,0.024001695,0.0072654383,-0.04186863,0.019882001,-0.028278116,-0.011653808,-0.016590724,0.031278327,-0.0013062956,0.035733867,0.0036215244,-0.0066105416,0.038487792,-0.032711267,0.029912561,-0.021908265,-0.009577169,-0.0050656563,0.006957581,-0.00032709868,0.041219328,-0.016489971,-0.038532574,0.0007668452,0.015986204,0.009980182,-0.0023621072,-0.0005051663,-0.010086534,0.027852714,0.021158211,-0.009006233,0.050869264,0.016221294,-0.041040212,0.03978639,-0.051585734,-0.011609029,0.00032762342,-0.08055793,-0.025277905,0.005155215,-0.028390065,-0.03356207,-0.0040357327,0.017631842,-0.017038517,-0.025367463,0.00087599474,0.006386645,-0.035420414,0.020061119,0.024942061,-0.029061753,0.02308372,0.0018331519,-0.0064314245,0.030427523,-0.034815893,0.0050348705,-0.015292125,0.00981226,-0.049973678,0.023598682,-0.029800612,-0.0010621086,0.06994524,-0.013590512,0.017184049,-0.017643036,-0.04298811,-0.066362895,0.04616744,0.018919246,-0.00011842021,-0.013500954,-0.012527004,0.06806451,0.038420625,0.030785756,-0.008060271,0.007007958,0.013993526,-0.0045674867,0.0023033344,0.030024508,-0.018572208,0.020452937,-0.0007199669,0.02496445,0.04598832,0.002178792,0.025904816,-0.033987474,0.020542495,0.01398233,0.015101813,0.0015728723,0.031076822,0.0018723337,-0.021426886,0.047331702,0.015471242,0.03743548,0.03427854,0.02565853,0.003226907,-0.007394179,-0.01184412,-0.02036338,-0.00090957916,0.018404284,-0.0075005298,-0.0048529548,-0.052257422,0.0035907386,-0.037010077,0.001595262,0.002643377,0.035196517,0.027628817,-0.030494692,-0.008116245,0.013333031,-0.0036523102,0.025994373,-0.06828841,0.0022991362,-0.005552631,0.010618287,-0.01713927,0.03506218,-0.0034396087,0.05306345,0.005216786,-0.015661554,-0.015683943,-0.028255727,-0.028681131,0.0034843879,0.0110045085,-0.004500318,0.011586639,0.043861307,0.014273397,-0.013836798,-0.027987052,-0.04876464,-0.018269947,-0.029106533,-0.01093734,-0.010422378,0.04565248,-0.030740978,0.012571784,0.02215455,0.008502467,-0.017866934,-0.01897522,-0.06604944,0.008474479,0.0066217366,-0.0028098999,0.020766392,-0.0763039,-0.0152361505,0.005838099,-0.03427854,-0.0068400353,0.00036278216,-0.0293976,0.017105686,0.002667166,0.009991378,-0.01588545,0.055302415,-0.018213972,0.0886182,0.008608817,-0.02816617,0.0064314245,-0.052794773,-0.0010719041,-0.013008381,0.03165895,0.008653596,0.015683943,0.015448852,0.030808147,0.022400836,0.039584886,0.033091888,0.028636351,-0.05476506,-0.0016554341,0.009593961,0.035980154,0.06770627,-0.024046475,-0.007254244,0.008647999,-0.03994312,0.016019788,0.03620405,0.035778645,0.027785545,0.009347675,0.032733656,-0.009739494,-0.04050286,0.046883907,0.019333456,-0.006101177,0.028860247,0.022915797,-0.0057289493,-0.021012679,0.014083085,-0.023374785,0.00080392807,0.025165956,-0.016221294,3.5071273e-05,0.013556927,0.006918399,0.006537775,0.061571512,0.044129983,0.024001695,-0.006991165,-0.052660435,-0.021863485,0.06300445,0.03741309,-0.013198693,-0.010153702,-0.019736469,-0.03678618,0.021035068,0.042294033,-0.018773714,0.01716166,-0.038756467,-0.012907628,-0.0002770718,-0.004497519,0.01219116,-0.032084357,-0.0065265805,0.011631419,0.0069799707,-0.009459623,0.0030757769,0.006532178,-0.080960944,-0.028300507,-0.011810536,0.03130072,0.014967475,0.035017397,-0.0038790053,-0.031479836,0.015168982,0.014866722,0.007679647,0.032688875,0.042607486,-0.030718587,0.0126613425,0.054048594,0.015941424,-0.011267587,-0.0008165222,-0.027069077,-0.018583402,-0.012515809,-0.00594445,0.010942937,-0.023867358,-0.003881804,-0.009269311,-0.030964874,-0.045383804,0.0244271,-0.032778434,-0.0045898766,-0.0050740526,-0.037681766,0.0126613425,-0.010198481,0.052346982,0.056063663,0.0069687758,-0.048943754,0.0054518776,-0.009308494,-0.003996551,-0.015247346,0.003028199,0.023576291,-0.00948761,-0.026330218,0.0046458505,-0.04168951,0.024830112,-0.022356058,0.013892773,-0.02303894,-0.0443091,0.023330007,0.0028406857,0.056601014,0.006201931,0.032353032,0.03851018,0.008390518,0.009314091,-0.0006863824,-0.024718164,0.018952832,0.007545309,-0.017072102,-0.024203202,-0.023934526,0.0025454224,0.015057034,0.010282443,-0.00025293298,0.0035459595,0.048227288,0.01560558,-0.0053875074,-0.026374998,-0.019747663,-0.08745394,-0.010584703,0.016344437,-0.011138846,-0.0022319674,0.012672537,-0.00304779,-0.01593023,-0.009263714,0.00017763031,-0.025255514,-0.02682279,0.010455962,-0.020027533,-0.03130072,0.011060483,0.033338174,-0.005418293,0.00075984845,-0.016814621,-0.0058828783,0.009213338,0.039204262,0.015739918,-0.03602493,-0.012874044,-0.006739282,-0.021538835,0.019490182,-0.006532178,-0.002135412,-0.0029778222,-0.0019227104,0.026263049,-0.024404708,0.0059948266,-0.020654444,-0.016680283,0.0034368099,0.041577563,-0.055436753,-0.006795256,0.01839309,0.020721612,-0.012179965,-0.024852501,-0.026710842,0.009291701,-0.039674442,0.017027322,-0.03300233,0.0073494,0.008328946,-0.031457447,-0.06878098,-0.01156425,-0.018572208,-0.007517322,0.0072094644,0.014251007,0.045764428,0.030897705,0.0045702853,0.02371063,-0.03423376,0.04240598,0.0043771747,-0.0010292238,0.011222808,0.013456174,-0.025994373,-0.032890383,0.005742943,0.016937764,-0.03051708,-0.006101177,-0.02271429,0.008244986,-0.011133249,-0.03492784,-0.037077244,-0.009000636,-0.012381472,0.004489123,-0.020665638,-0.009230129,-0.0025356268,0.006627334,0.01013691,-0.0037474663,-0.0033332577,-0.0069631785,-0.037211582,0.020049924,-0.023195669,-0.02496445,-0.013165109,0.022591148,-0.004175668,-0.04661523,-0.0037446674,-0.015963813,-0.0043351944,-0.008748752,-0.003719479,0.01785574,-0.011788146,0.017307192,-0.0023565097,-0.027494479,0.00016057571,0.004016142,-0.010545521,0.032823212,0.0020248631,-0.02185229,-0.011026898,0.020688029,-0.023621071,0.0019185124,0.013926357,-0.053197786,0.010819794,-0.027673597,-0.019747663,0.020542495,0.0030645821,-0.0068400353,0.015135397,-0.05942211,-0.026621284,-0.02271429,0.03497262,0.024136033,0.022098577,-0.0010061346,0.031703733,0.01936704,-0.0021340128,-0.01156425,0.028636351,-0.011054886,0.00025748086,-0.025792867,0.047689937,0.004044129,0.043279175,-0.004536701,-0.028345285,0.016478775,-0.034659166,0.004981695,0.03503979,-0.0090901945,0.045294244,-0.04126411,0.0063194763,0.018941637,-0.01748631,0.014519682,0.009319688,0.051048383,-0.029173702,0.009739494,-0.023419565,-0.031435058,-0.030763367,0.00043519866,0.041980576,0.025770476,0.028972195,-0.03734592,-0.10191765,0.0035207712,0.022356058,-0.023576291,-0.020699224,0.0033080694,-0.01999395,0.029666275,-0.003996551,0.017184049,-0.021135822,-0.01558319,0.002100428,-0.071646854,-0.024897281,-0.036405556,-0.01651236,-0.013870383,0.0061515537,0.027337752,-0.04674957,-0.017598258,0.031076822,-0.068512306,-0.022322472,0.024539046,0.011278782,0.011206015,0.012885238,-0.01806844,-0.052436538,-0.0029666275,-0.012907628,0.0027721175,-0.033897918,-0.009151766,-0.016993737,-0.008978246,-0.013646486,-0.027337752,-0.017721402,-0.0072150617,-0.013153914,-0.008284167,0.0021801912,-0.017318387,-0.03797283,-0.00047473036,0.045764428,0.02624066,0.019870806,-0.016814621,0.005938852,-0.03506218,0.0043827724,-0.010489547,-0.009661131,0.020934315,-0.00350118,0.0017100088,-0.0024124838,-0.014015916,0.04502557,0.009269311,0.019165533,0.0095155975,-0.019602131,0.016344437,0.0061571514,0.04296572,0.042764213,0.0054154946,0.007595686,-0.017799765,0.014911501,0.02287102,0.0023005356,-0.018661765,-0.00043414914,-0.026531724,-0.0076628546,-0.003943376,0.0005558928,0.0021899869,-0.017497504,-0.052839555,-0.027203415,0.02062086,0.014911501,-0.054630723,-0.019210313,0.005076851,0.0063530607,0.02989017,0.012907628,-0.015997399,-0.051451396,0.026464555,-0.039607275,0.05239176,-0.008189011,-0.017307192,0.017251218,-0.0025706107,0.052570876,0.043861307,0.0051887995,-0.0024040877,0.0070471396,-0.0244271,-0.020217845,-0.008216999,0.01435176,-0.029554326,0.019837221,-0.008597623,-0.027046686,0.02935282,0.0020290613,-0.01781096,0.009677922,0.029845392,-0.03121116,-0.017385555,-0.011306769,-0.017452726,0.064706065,0.029106533,0.027136246,0.004643052,-0.011956069,-0.004357584,0.018303532,0.002178792,-0.0032968747,0.03734592,0.010797405,-0.0014014516,-0.023553902,0.0035655503,0.021986628,0.002524432,0.0064985934,0.012762096,0.0041308887,-0.0022991362,-0.026016762,0.030808147,0.009806663,-0.00445274,-0.0168594,0.037144415,-0.00050866464,-0.008468882,-0.015896644,0.0022137759,0.00905661,-0.014116669,0.012359082,0.010080936,0.003985356,0.0512275,-0.026666062,-0.0023858962,-0.021986628,0.026554115,-0.035286073,0.012762096,0.037636988,0.0024558639,0.0052307798,-0.007864362,0.017318387,-0.028457234,0.01307555,-0.022971772,-0.0016876193,-0.033897918,0.020083508,0.060183354,-0.0020136684,0.025233125,0.0029050559,-0.0120232375,-0.00892787,0.00062795944,-0.009263714,0.008681583,3.8023034e-05,-0.03539802,0.024942061,-0.006179541,0.0022529576,0.011054886,-0.030405132,0.0073102177,0.05686969,0.0039153886,0.0042764214,-0.015224956,-0.020307405,0.033203837,0.02682279,0.01141312,-0.007192672,-0.045204684,-0.011144444,-0.016109347,-0.009733897,-0.013915162,0.025680918,0.020452937,0.022042602,-0.003918187,-0.040301353,-0.014362955,-0.032867994,-0.0060228133,0.026957128,-0.02308372,-0.09439473,0.0014525279,-0.010103325,0.013568123,-0.022311278,0.027919883,-0.02682279,-0.046391338,-0.017833348,0.02090073,-0.0010523131,0.041107383,-0.0032073162,0.010545521,0.05503374,0.02930804,-0.0057877223,-0.000447443,-0.002222172,-0.007785998,0.012403862,-0.023822578,0.0051188315,-0.00046983262,-0.027673597,0.007881153,-0.035868205,-0.001281807,0.009974585,-0.015795892,0.023441954,0.036383167,-0.054988958,0.023195669,-0.07133339,-0.032890383,0.016713867,0.01398233,0.0010152303,0.019512571,-0.034144204,-0.0026279842,-0.0046374546,0.008362531,0.010377599,-0.00022354658,0.030494692,-0.027875103,-0.00014037256,-0.015460047,-0.015661554,-0.0050068833,-0.0031065627,0.058213066,-0.001813561,0.011155639,0.02995734,0.02989017,-0.025837647,-0.0211806,0.009711507,0.041577563,0.01136834,0.03387553,-0.034569606,-0.023218058,3.308157e-05,-0.007785998,0.010399988,0.03604732,0.014463708,0.022635927,-0.04124172,0.015627969,-0.028905027,-0.00983465,-0.0261511,0.028546793,0.030897705,0.043950867,0.010556716,0.0018569409,0.017934103,-0.022109771,-0.0012999985,0.00011028648,-0.02373302,0.030024508,-0.0092805065,0.027539259,0.0021619997,0.015751112,-0.007925933,0.034636773,0.057675716,0.00938126,-0.02373302,0.0063250735,-0.021415692,0.019143144,-0.0044779284,-0.026263049,-0.005429488,0.010898158,-0.04254032,-0.010349612,0.0064985934,-0.020352183,-0.03633839,0.039293822,0.0023201266,0.012784485,0.021785121,-0.034815893,0.022109771,-0.032061964,-0.0042932136,-0.015045838,-0.008922272,0.0128964335,-0.0031653356,-0.024539046,-0.013456174,-0.009051013,0.004368779,0.019848417,0.0017407946,-0.046033103,-0.026352607,0.04556292,0.03871169,-0.008491271,0.009297298,-0.018728934,0.02245681,0.027628817,0.00031992697,-0.034614384,-0.00901183,-0.024830112,-0.021068653,-0.004606669,0.0012461235,0.010528728,-0.0075509064,0.011155639,0.037233975,-0.0058213067,0.036472727,0.019613326,-0.024606215,0.013635292,-0.019501377,0.05633234,-0.012392666,-0.0049677016,-0.025882425,-0.027673597,0.0039237845,-0.015717529,-0.01646758,0.01897522,-0.013702461,-0.012672537,0.028882638,-0.009862637,0.017665427,-0.023397176,-0.017184049,0.05364558,-0.0009816458,-0.026039153,-0.006465009,0.013153914,-0.0042372397,-0.025210736,0.03571148,0.009980182,-0.010153702,0.054003816,-0.007595686,-0.0067840614,0.021337328,-0.000944563,-0.02020665,-0.020956704,-0.0060675927,0.024740554,-0.037278753,0.028994584,-0.0021018276,0.04670479,0.008468882,0.008093855,0.010416781,0.0116202235,0.010019365,0.008043478,0.017866934,0.0069351913,0.027561648,0.010276846,-0.0054406826,-0.02496445,0.0154040735,0.0050152796,0.035241295,-0.042182084,-0.0027091466,0.013859188,-0.042808995,-0.0057037612,-0.0068008536,0.029084144,-0.023016552,-0.028390065,0.0073997765,-0.04238359,0.026285438,-0.027628817,-0.016075762,-0.005020877,0.016120542,-0.0005233579,0.020755198,0.0022963376,0.01720644,0.009291701,0.0510036,0.015571996,-0.008177817,0.025434632,0.011709782,0.0050712535,0.022568759,0.008373726,-0.024583826,-0.0116202235,-0.028636351,0.018549819,0.03927143,0.011211613,-0.022367252,-0.030696198,0.012146381,0.026509335,0.00592206,0.02554658,0.018236363,0.0056785727,0.021785121,-0.015068228,-0.009157363,-0.017710207,-0.005905268,-0.015057034,0.011911289,0.01216877,0.004136486,-0.02266951,0.00034161695,0.040905874,0.0039517717,0.025367463,0.0029106534,-0.0029358417,-0.01095973,0.032084357,0.008983844,-0.031479836,0.019792443,-0.031994797,0.010539924,-0.014094279,-0.0077524134,0.0073046205,0.017307192,-0.014497292,0.036360778,0.0032325045,0.015997399,-0.014743579,0.004601071,-0.0084297,0.006196333,0.052973893,-0.007690842,-0.003996551,-0.050824486,-0.017038517,0.0036047322,0.007080724,-0.03311428,-0.029218482,0.0067896587,-0.014217422,0.024874892,-0.024762943,0.016098153,0.0324202,0.036002543,0.026710842,0.0154040735,0.06112372,0.04289855,0.00019416017,-0.0026545718,-0.017911714,-0.015471242,0.009045415,-0.01432937,-0.008043478,0.02090073,0.021147016,0.045271855,-0.021583615,-0.015135397,0.00020413056,0.01936704,-0.0085472455,0.021538835,0.038868416,-0.017643036,-0.010220871,-0.022535173,0.019053584,-0.026307829,0.026554115,0.026688453,0.007338205,-0.026083931,0.018863272,-0.013030771,-0.025345074,0.010696651,-0.0026419777,-0.013534538,0.030696198,0.010114521,0.0075732963,0.0026881562,0.040458083,-0.009028623,0.027158635,0.034032255,0.0037530635,-0.049615446,-0.016019788,-0.0008144232,-0.019288676,0.039204262,0.011267587,-0.025815256,0.030920094,-0.00053420285,-0.02208738,0.027897492,-0.027069077,0.0090901945,0.019635715,0.0045926753,-0.037771326,-0.02435993,-0.007299023,0.008317752,0.006207528,0.019232702,-0.0037278752,-0.0536008,0.06385525,-0.010987717,0.0029414392,0.028143778,-0.011810536,-0.000108799664,0.0006860326,0.03669662,0.0006615439,-0.029733444,-0.024852501,0.011373938,-0.0046822336,0.013433784,-0.032576926,0.0074557504,-0.030114068,0.0139375515,-0.002885465,-0.01785574,-0.002349513,-0.0084520895,-0.038398236,0.013221083,-0.01848265,-0.0061179693,0.010573508,0.043122448,-0.0065545673,-0.0026461757,0.017430335,0.004785786,0.01802366,0.0039041936,0.038420625,0.010842184,-0.01802366,-0.006302684,-0.030651418,-0.043234397,0.016915374,-0.014877916,0.007774803,0.0035907386,0.039831173,-0.006106775,-0.013478564,0.010562313,0.015807087,-0.0255018,-0.007718829,-0.016008593,-0.0015448852,0.02619588,0.031524613,0.008843908,-0.005505053,-0.0030729782,0.0120456265,-0.014239811,0.0052307798,-0.007338205,0.0057989173,-0.03452483,-0.02688996,0.0024894483,-0.009851442,-0.010008169,0.0052979486,-0.020833561,-0.0035459595,-0.008832714,-0.009873832,0.021695562,-0.039047536,-0.0006741381,-0.009621948,0.01151947,0.008340142,-0.0021298146,-0.0423612,0.03118877,-0.048361626,0.03248737,0.016165322,-0.01221355,-0.003358446,0.011933679,-0.01646758,-0.007522919,0.007517322,-0.018684156,-0.027897492,-0.032621708,0.02682279,-0.009672325,-0.014788358,-0.022333667,0.0041924603,-0.011989653,-0.018952832,-0.0066777105,0.0040889084,-0.016411606,0.00812744,-0.005096442,-0.0032409006,-0.024225593,-0.010120118,0.0032604914,0.007909141,0.016646698,0.001726801,-0.02282624,-0.030181237,-0.00639784,-0.048495963,0.038487792,0.001746392,-0.0134002,0.0028085005,-0.011933679,-0.0317709,-0.02624066,0.023889747,-0.02215455,0.009286104,-0.00056114036,0.0146988,-0.020956704,0.009297298,-0.01999395,-0.007875556,-0.0074557504,0.000896985,0.013993526,0.0152137615,0.016646698,-0.026486946,0.028479623,0.037793715,-0.026957128,0.008659193,-0.024740554,-0.007243049,-0.017094491,0.0037614596,0.028793078,-0.004027337,0.013064356,0.03132311,-0.003722278,0.012179965,0.01925509,0.019199118,-0.027942272,0.025076399,0.027001908,0.036360778,-0.022859823,-0.03859974,0.032711267,0.0024306753,0.039204262,0.04117455,0.022747876,-0.009084597,0.0031065627,-0.016053373,9.5057585e-06,0.0039545703,-0.0020304606,-0.038107168,0.019411819,0.031367887,0.0079315305,-0.04511513,0.011788146,-0.014295786,0.00594445,-0.003246498,0.0012433247,0.004880942,0.057272702,0.008071465,0.0031149588,0.004810974,0.03183807,-0.033830747,0.043928474,0.019075975,0.044600166,-0.0043295966,0.0475556,0.0038734078,0.035375632,0.0061851386,0.025367463,0.00073955784,0.016344437,0.010903755,0.014788358,-0.007595686,0.020766392,0.007192672,0.016613115,0.01867296,0.005152416,0.014418929,0.0013986529,-0.0012720114,-0.0030785757,0.018706545,-0.005043267,-0.0027525264,0.04542858,-0.017228829,0.013668876,-0.011508276,-0.0034619982,-0.012325497,-0.018919246,0.01588545,-0.021135822,0.024091253,0.0154264625,-0.027852714,-0.0031485432,0.021661978,0.023800189,0.008043478,0.01834831,-0.00017150815,-0.0126837315,-0.014463708,-0.0033080694,0.035957765,-0.009952196,-0.01843787,0.023397176,-0.057272702,0.038420625,0.01398233,0.004027337,0.018549819,-0.014396539,0.006929594,-0.009767481]",
    "embedding_generated_at": null,
    "embedding_model": "text-embedding-3-small"
  },
  {
    "id": "2d26a135-529f-494c-82e3-a107202ed340",
    "code": "DOCMON",
    "name": "Information Architecture Lead",
    "description": "## Information Architecture Lead v3.0.0 - Database-First Enforcement Edition\n\n**🆕 NEW in v3.0.0**: Proactive learning integration, database-first enforcement patterns, 100% compliance validation\n\n### Overview\n**Mission**: Enforce database-first architecture by detecting and preventing file-based documentation violations.\n\n**Philosophy**: **Database-first OR it didn't happen.**\n\n**Core Expertise**:\n- AI-powered documentation generation\n- Workflow documentation automation\n- Database-first enforcement\n- Markdown violation detection\n- Information architecture at scale\n\n---\n\n## 🔍 PROACTIVE LEARNING INTEGRATION (SD-LEO-LEARN-001)\n\n### Before Starting ANY Documentation Work\n\n**MANDATORY**: Query issue_patterns table for documentation patterns:\n\n```bash\n# Check for documentation-related patterns\nnode scripts/search-prior-issues.js \"documentation\"\n```\n\n**Why**: Consult lessons BEFORE work to prevent recurring documentation issues.\n\n---\n\n## ✅ DATABASE-FIRST ENFORCEMENT (SD-A11Y-FEATURE-BRANCH-001)\n\n### Critical Success: Zero Markdown File Violations\n\n**Achievement**: DOCMON sub-agent verified zero markdown file violations, 100% database compliance\n\n### Enforcement Pattern\n\n**Database Tables (REQUIRED)**:\n- ✅ Strategic Directives → `strategic_directives_v2` table (NOT .md files)\n- ✅ PRDs → `product_requirements_v2` table (NOT .md files)\n- ✅ Handoffs → `sd_phase_handoffs` table (NOT .md files)\n- ✅ Retrospectives → `retrospectives` table (NOT .md files)\n- ✅ Documentation → `ai_generated_documents` table (NOT .md files)\n\n**Auto-Trigger Events** (SD-LEO-004):\n1. `LEAD_SD_CREATION` → Verify SD in database, not file\n2. `HANDOFF_CREATED` → Verify handoff in database, not file\n3. `FILE_CREATED` → Flag markdown violations (should be database)\n\n### Violation Detection\n\n**Anti-Patterns (REFUSE THESE)**:\n```\n❌ Creating SD-XXX.md files\n❌ Creating handoff-XXX.md files\n❌ Saving PRDs as markdown files\n❌ Writing retrospectives to .md files\n❌ Creating manual documentation outside ai_generated_documents table\n\n✅ All data MUST be in database tables\n✅ Documentation generated via AI Documentation Platform\n✅ Dashboard access at /ai-docs-admin\n```\n\n**Impact**:\n- Zero technical debt from file-based documentation\n- 100% database compliance (SD-A11Y-FEATURE-BRANCH-001)\n- Programmatic access to all documentation\n- Centralized management via dashboard\n\n---\n\n## 📚 AI DOCUMENTATION PLATFORM\n\n### Auto-Generation Triggers\n\n**System-Initiated**:\n1. SD completion (status = 'completed')\n2. EXEC→PLAN handoff creation\n3. Retrospective generation\n\n**Manual Triggers**:\n```bash\n# Generate documentation for specific SD\nnode scripts/generate-workflow-docs.js --sd-id <SD-ID>\n\n# Auto-orchestration (includes DOCMON)\nnode scripts/orchestrate-phase-subagents.js EXEC_IMPL <SD-ID>\n```\n\n### Documentation Types Generated\n\n**Auto-Generated**:\n1. **Feature Documentation**: User-facing feature guides\n2. **Technical Documentation**: Architecture and implementation details\n3. **API Documentation**: Endpoint specifications\n4. **Workflow Documentation**: Step-by-step guides\n5. **Integration Documentation**: Third-party integrations\n\n### Dashboard Management\n\n**Access**: `/ai-docs-admin`\n\n**Actions**:\n- Review generated documentation\n- Edit documentation content\n- Publish documentation (status = 'published')\n- Archive outdated documentation\n- Search by SD-ID, status, type, date\n\n**Database Tables**:\n- `ai_generated_documents`: Document storage\n- `strategic_directives_v2`: SD context\n- `product_requirements_v2`: PRD context\n\n---\n\n## ✅ DOCUMENTATION CHECKLIST\n\n### Pre-Generation\n- [ ] Query issue_patterns for documentation lessons\n- [ ] SD context available (SD-ID, PRD, user stories)\n- [ ] Implementation completed (code, tests)\n- [ ] Screenshots captured (before/after states)\n\n### Generation\n- [ ] Documentation generated via script\n- [ ] Stored in `ai_generated_documents` table (NOT file)\n- [ ] All sections complete (overview, features, usage, technical)\n\n### Post-Generation\n- [ ] Documentation reviewed in dashboard (/ai-docs-admin)\n- [ ] Documentation published (status = 'published')\n- [ ] Links validated (internal/external)\n- [ ] Code examples tested\n- [ ] Zero markdown file violations confirmed\n\n---\n\n## 🎯 INVOCATION COMMANDS\n\n**For AI documentation generation** (RECOMMENDED):\n```bash\nnode scripts/generate-workflow-docs.js --sd-id <SD-ID>\n```\n\n**For targeted sub-agent execution**:\n```bash\nnode lib/sub-agent-executor.js DOCMON <SD-ID>\n```\n\n**For phase-based orchestration**:\n```bash\nnode scripts/orchestrate-phase-subagents.js EXEC_IMPL <SD-ID>\n```\n\n---\n\n## ✅ SUCCESS PATTERNS\n\n**From AI Documentation Platform and 74+ retrospectives**:\n1. **Auto-triggers on SD completion** save manual documentation time\n2. **EXEC requirement** ensures docs generated before handoff\n3. **Dashboard** provides centralized management\n4. **Database storage** enables programmatic access\n5. **100% database compliance** (SD-A11Y-FEATURE-BRANCH-001)\n6. **Zero markdown file violations** through proactive enforcement\n7. **AI-powered generation** maintains consistency and quality\n\n---\n\n## ❌ FAILURE PATTERNS\n\n**Anti-Patterns to Avoid**:\n- Creating SD documentation in markdown files (use database)\n- Manual documentation instead of AI generation (use platform)\n- File-based handoffs (use `sd_phase_handoffs` table)\n- Skipping documentation generation (MANDATORY before EXEC→PLAN)\n- Publishing without review (always review via dashboard)\n\n---\n\n## 📊 KEY METRICS\n\n**Evidence Base**:\n- 74+ retrospectives analyzed\n- SD-A11Y-FEATURE-BRANCH-001: 100% database compliance\n- SD-LEO-004: Auto-trigger enforcement patterns\n- Zero markdown file violations verified\n\n**Success Metrics**:\n- Database compliance: 100%\n- Markdown file violations: 0\n- Auto-generation adoption: 100% (EXEC requirement)\n- Documentation centralization: 100% via dashboard\n\n---\n\n**Remember**: You are an **Intelligent Trigger** for documentation generation. Comprehensive documentation logic, AI generation, and publishing workflows live in the AI Documentation Platform—not in this prompt.\n\n**When in doubt**: Generate documentation. Undocumented features = lost knowledge. Every SD should have comprehensive documentation before completion.\n\n**Core Philosophy**: \"Database-first OR it didn't happen. If it's not in the database, it doesn't exist.\"\n",
    "activation_type": "automatic",
    "priority": 95,
    "script_path": "scripts/documentation-monitor-subagent.js",
    "context_file": null,
    "active": true,
    "created_at": "2025-09-24T13:11:05.838Z",
    "metadata": {
      "sources": [
        "74+ retrospectives analyzed",
        "SD-A11Y-FEATURE-BRANCH-001: 100% database compliance verified",
        "SD-LEO-004: Auto-trigger enforcement patterns",
        "AI Documentation Platform integration",
        "Database-first architecture enforcement"
      ],
      "version": "3.0.0",
      "key_metrics": {
        "database_compliance": "100%",
        "markdown_violations": 0,
        "retrospectives_analyzed": 74,
        "auto_generation_adoption": "100%",
        "documentation_centralization": "100%"
      },
      "improvements": [
        {
          "title": "Proactive Learning Integration",
          "impact": "MEDIUM",
          "source": "SD-LEO-LEARN-001",
          "benefit": "Prevents recurring documentation issues"
        },
        {
          "title": "Database-First Enforcement",
          "impact": "HIGH",
          "source": "SD-A11Y-FEATURE-BRANCH-001",
          "benefit": "100% database compliance, zero technical debt"
        },
        {
          "title": "Auto-Trigger Events",
          "impact": "HIGH",
          "source": "SD-LEO-004",
          "benefit": "Proactive markdown violation detection"
        }
      ],
      "last_updated": "2025-10-26T16:53:22.345Z",
      "failure_patterns": [
        "Creating SD documentation in markdown files (use database)",
        "Manual documentation instead of AI generation",
        "File-based handoffs (use sd_phase_handoffs table)",
        "Skipping documentation generation (MANDATORY before EXEC→PLAN)",
        "Publishing without dashboard review"
      ],
      "success_patterns": [
        "100% database compliance (zero markdown file violations)",
        "Auto-triggers on SD completion save manual work",
        "Dashboard provides centralized management (/ai-docs-admin)",
        "Database storage enables programmatic access",
        "AI-powered generation maintains consistency",
        "EXEC requirement ensures documentation before handoff",
        "Version control by SD completion state"
      ]
    },
    "capabilities": [
      "Proactive learning: Query documentation patterns before starting",
      "Database-first enforcement: 100% compliance validation (SD-A11Y)",
      "Markdown violation detection: Auto-flag file-based documentation",
      "AI-powered documentation generation via platform",
      "Auto-trigger on SD completion events",
      "Dashboard-based documentation management (/ai-docs-admin)",
      "Multi-type documentation generation (feature, technical, API, workflow)",
      "Centralized documentation storage (ai_generated_documents table)",
      "Documentation review and publishing workflows",
      "Link validation (internal/external)",
      "Code example testing and validation",
      "Version control for documentation by SD completion state"
    ],
    "domain_embedding": "[-0.0005787978,0.03127386,0.07519188,-0.03168251,-0.029350793,-0.029807521,-0.017812397,-0.03728344,-0.019230658,0.019699406,0.0044200467,-0.025216201,-0.013954247,-0.034879606,0.02509601,0.0640381,-0.017812397,-0.012427813,0.0037830311,0.016550386,0.052403547,0.011225897,0.02610562,0.06778807,0.008864132,-0.005564872,-0.05581699,0.021886894,-0.001885506,-0.026730616,0.0067788074,-0.010534795,0.023473423,0.044543013,0.0306729,0.023473423,0.028124839,0.0024083396,0.05749967,0.028437337,0.005591915,-0.01763211,0.028557528,-0.005880375,-0.015312413,0.013894151,-0.028341183,0.030528672,-0.02135805,-0.0004071491,-0.025192164,0.0140263615,0.031874817,0.05019202,-0.011147773,-0.03283635,-0.033485387,-0.0017728264,-0.035095952,0.023004675,0.05264393,-0.056922752,0.008485529,0.025336394,-0.03653825,0.004155625,-0.012860503,-0.026946962,-0.02353352,-0.025288317,0.07889378,0.031466167,-0.006496357,0.009597301,0.03526422,-0.044663206,0.013473481,0.04329302,0.0072655836,0.015360489,-0.0022611048,-0.0034675281,-0.047692034,-0.07033613,-0.047547806,-0.0050841053,0.0009758057,-0.02451909,-0.062163107,-0.023497462,-0.035216145,0.008497547,-0.0060185953,0.02164651,0.018593643,-0.014807607,-0.0031069533,0.027620034,-0.013148963,0.023209002,0.011021571,-0.044831473,-0.028220993,0.05149009,0.04545647,-0.022283526,0.008335289,-0.042523794,0.016934998,-0.046850692,-0.105480164,-0.023305155,0.002566091,0.02581716,-0.018160954,-0.04432667,0.012151373,-0.03682671,0.01520424,-0.030720977,-0.023485443,0.011382147,-0.032788273,-0.0358171,0.051970854,-0.03139405,-0.01176075,0.0007617144,-0.013894151,-0.016285965,0.03197097,0.0015377016,0.034446917,-0.04117765,-0.0140263615,-0.001893018,-0.023858037,-0.0042397594,-0.011129744,0.0138340555,0.07600918,0.020901322,0.0116585875,0.045672815,-0.015396547,-0.015504719,-0.020612862,0.0046093487,-0.025168125,0.023160925,-0.058605433,-0.012836465,-0.007151401,0.013990304,0.039543044,-0.02624985,0.026177734,0.02209122,0.012860503,-0.006225926,0.01304079,0.04144207,-0.040312268,0.02480755,-0.001452065,-0.019735463,-0.013641749,-0.0034344755,-0.018725853,-0.007758369,-0.016310003,-0.06451886,-0.02752388,0.03254789,0.017872494,0.004389999,-0.008533605,-0.056393906,0.016057601,0.0016255917,-0.033389233,-0.024759473,-0.070913054,-0.023425346,-0.07971108,-0.030889247,-0.022343623,-0.032499813,-0.009236726,0.044206478,-0.018172972,0.008665816,0.0019380898,-0.014999914,0.06615347,-0.008954275,0.016550386,-0.061153498,-0.014651358,-0.0038611558,0.019002294,-0.029927714,-0.005495762,-0.028797911,-0.020600844,0.006911018,-0.009218697,0.01921864,0.0069530853,-0.094903305,-0.023425346,0.05913428,0.00444709,0.036225755,-0.015360489,-0.028773874,0.0013619213,0.035071913,-0.006995152,-0.0038491366,-0.049518947,-0.017584033,0.017043171,0.029158486,-0.022199392,0.05865351,0.003771012,-0.05062471,0.0033443319,-0.041225724,0.02266814,0.04557666,-0.029711368,0.027812341,0.024483033,-0.04175457,0.0066886637,0.013245116,-0.029519062,-0.029134449,0.04242764,-0.0072355354,0.007560053,0.0026442157,-0.0015384527,0.023052752,-0.050288174,-0.053990077,0.0281008,0.022043142,0.05495161,-0.026514271,0.026418118,0.009771579,-0.0033503415,-0.052836236,0.003227145,0.015528757,-0.0031159676,0.06192272,-0.0108593125,0.01764413,-0.0019155539,-0.0056820586,-0.045672815,0.05480738,-0.035047878,0.03627383,-0.007860532,0.0044801426,-0.008052838,0.049807407,0.006700683,-0.004215721,-0.011916999,-0.022283526,-0.011916999,-0.018124897,0.006568472,-0.003227145,0.04718723,0.006923037,0.033341154,0.063749634,0.008731921,0.056393906,0.0019110468,-0.0013889644,-0.007818465,0.022752274,0.043581482,0.03600941,-0.029711368,-0.04632185,0.00048076647,0.022884484,0.029038295,0.033894036,0.0055588624,0.014278764,-0.017043171,-0.007614139,-0.0074699093,0.018701816,0.022163335,-0.01679077,-0.002767412,-0.06596116,0.025192164,-0.025432548,0.055095837,-0.025288317,0.02164651,-0.029350793,-0.029278679,-0.034062304,0.016418176,0.0021829803,-0.001064447,-0.06326887,0.028894065,-0.029206563,0.03425461,-0.059711196,-0.04920645,-0.018822007,-0.00817904,0.027740225,-0.01965133,0.00032057357,0.029158486,-0.012523967,0.017403746,0.01478357,-0.03627383,0.0013679309,0.022728235,0.051105477,0.019459024,-0.03944689,-0.077403404,-0.02538447,-0.024146495,0.031826742,-0.006081696,0.016742693,-0.016934998,0.022571987,0.013785979,0.03560076,0.0008533605,0.032475777,-0.033894036,0.054086227,-0.0031610397,0.00817303,-0.011550414,-0.028076762,-0.050288174,-0.010685035,-0.04658627,0.012511947,0.029062334,-0.007854522,0.00408952,0.065624624,0.0006659367,0.020588825,-0.00595249,-0.033605576,-0.01995181,0.027187344,-0.045408394,0.03252385,-0.061826568,0.026682539,-0.010642968,0.014290784,-0.007728321,0.016598463,-0.008100915,0.0074759186,-0.0071213534,-0.0027058139,0.032812312,0.013293193,-0.0046003344,-0.019519119,-0.0009720497,-0.0025074976,0.020156134,-0.015312413,0.013641749,-0.012548005,0.023629673,0.011273974,0.00029578406,0.017968647,0.023833998,-0.023269098,0.06874961,0.0017818408,0.032139238,0.04115361,0.014170592,-0.02939887,-0.006183859,0.005144201,-0.0070191906,-0.0072355354,0.047499727,-0.013641749,0.0074819284,0.01664654,-0.026778692,-0.03399019,0.026466195,0.0097535495,0.047499727,0.0030573744,-0.018473452,-0.014519148,-0.0101321535,-0.050432403,-0.037956513,0.030528672,0.018846046,-0.0010051024,-0.041658416,-0.0447834,-0.054615073,-0.007914619,0.03483153,-0.024386879,-0.048677605,-0.0041886778,-0.00874394,-0.052980464,0.040937267,0.027692148,9.460395e-05,0.0063280887,-0.015408565,0.045384355,-0.049278565,-0.0045853104,-0.009056439,-0.0091405725,-0.008575672,-0.07134575,0.003242169,0.026922923,0.01993979,-0.01361771,-0.0004398262,0.015060009,0.030865207,0.023148905,0.005549848,0.027139267,0.034903646,0.049807407,-0.018473452,0.015084048,-0.0047565834,-0.039927658,-0.01907441,0.016730674,0.002794455,-0.02538447,0.011418204,-0.014651358,-0.012247526,-0.04372571,-0.02709119,-0.020877285,0.027644072,-0.031514242,0.0071814493,0.010865322,-0.024242649,-0.01635808,-0.036466137,0.06110542,0.011670606,0.05067279,-0.016538367,-0.00046198655,0.015829237,0.02639408,-0.00018338612,0.012319641,0.011051619,-0.011484309,-0.016442213,0.009002352,-0.013906171,-0.015396547,-0.053076617,0.0007534512,-0.025600815,-0.027836379,-0.0038220936,-0.001778836,0.01247589,-0.028725797,-0.0153244315,0.06778807,0.011273974,0.005432661,-0.029014258,-0.06754769,0.02610562,0.018112877,-0.024290726,-0.019867675,-0.017103268,0.038196895,-0.019026333,0.00473555,-0.03456711,-0.001014868,0.008413414,0.0040805056,-0.010438642,-0.022403717,0.007043229,-0.031177705,-0.0030108,0.013221079,0.018136915,0.002774924,-0.011159792,-0.0017262521,-0.026971,-0.004861751,0.0006268744,0.0255287,-0.015648948,0.0054536946,-0.053124696,0.035504606,0.009585282,-0.011346089,0.00037146723,0.0028695748,-0.023341212,0.001383706,-0.0021213822,0.054278534,0.019266717,-0.031057514,0.019194601,-0.0045943246,0.0047055017,0.03627383,0.006225926,-0.012548005,0.0061417916,0.0028500438,0.023833998,-0.03939881,-0.006340108,-0.008221107,-0.008425432,0.03096136,-0.017620092,-0.049518947,0.02711523,0.0020041952,-0.006237945,-0.027067153,0.003771012,5.4884375e-05,0.0029582162,-0.0090263905,0.033677693,-0.011706663,-0.00011098945,-0.0043809847,-0.00011812583,-0.04675454,-0.040552653,0.005820279,-0.063605405,0.013112905,0.01864172,0.014687416,0.022584004,0.008695863,0.00674275,0.0044651185,-0.0060336194,-0.0096754255,0.026321964,-0.028605605,-0.014362899,0.008389375,-0.026634462,0.014074438,0.036177676,-0.0064903474,-0.02265612,-0.002683278,-0.024783513,0.018281145,-0.026922923,-0.02480755,-0.03629787,-0.031826742,0.014086458,0.026442157,-0.006138787,-0.023473423,0.0076622157,0.034951724,0.0050270143,0.018221049,0.01262012,-0.0041766586,0.023401309,0.0063280887,0.01676673,0.023437366,0.05192278,0.0035486575,-0.029302716,-0.0069771237,-0.019819599,0.005898404,-0.020336421,0.045095894,0.052403547,-0.00960932,-0.0018509509,0.024507072,0.016526347,-0.03497576,-0.030937323,-0.025841199,0.008671826,-0.018858066,0.009669416,0.026538309,0.048268955,-0.027211383,-0.017223459,0.029326756,-0.008852113,0.0050540576,-0.025889276,0.0079206275,-0.010336479,0.06586501,0.020636901,0.0067607784,-0.016273946,-0.026802732,0.002459421,0.011063638,-0.018882103,0.017055191,-0.028629644,0.016129715,0.016598463,0.050720863,-0.004849732,0.022608044,-0.011358108,0.012608101,-0.08826873,0.013773959,0.020011904,0.0038491366,0.018028744,0.009843694,0.024254669,-0.026033504,0.017175382,0.006826884,-0.027211383,-0.0006640587,-0.051538166,-0.013822036,0.019158544,-0.03252385,0.015697025,0.011923009,0.024999857,-0.0024383874,0.017944608,-0.013942228,-0.008094906,-0.020841226,-0.007908609,0.055672757,-0.010144172,0.032860387,0.01076316,-0.06110542,-0.0017728264,0.03156232,-0.00024320024,-5.469658e-05,0.025648892,-0.009236726,-0.0049548997,-0.0067066923,0.0027238426,-0.024903703,-0.00039475434,0.0109734945,-0.033172887,-0.03990362,-0.028028686,-0.023581596,-0.009621339,0.024386879,-0.005435666,-0.026321964,-0.056153525,0.0055107856,-0.03326904,-0.03973535,-0.012271564,-0.040312268,0.011983104,-0.017115287,-0.02911041,-0.026057543,-0.021934971,0.016586443,0.006929047,0.016706634,-0.011051619,-0.032187317,-0.018990276,0.03228347,-0.027211383,-0.03483153,-0.00731366,0.010402584,-0.028845988,0.03942285,0.034615185,-0.05932658,0.009128554,0.07360535,0.035192106,0.0481728,0.02222343,0.008076876,-0.018305184,-0.016370099,0.026658501,-0.0006257476,0.029735407,0.005564872,0.0015955437,0.024507072,-0.008918218,0.047115114,0.0093689365,0.012932618,0.008227116,-0.023136886,0.018954217,0.04471128,-0.0028936132,0.017307593,-0.013100887,-0.03502384,-0.009825665,0.021959009,-0.009621339,-0.03156232,-0.03341327,-0.011436232,-0.0052704024,-0.006382175,-0.011033591,-0.023617653,0.0026412108,0.0010824758,-0.04329302,0.007614139,-0.02956714,0.024879666,-0.018449413,-0.049086258,-0.022127276,0.02853349,0.02223545,0.0040714913,-0.0057902313,-0.03225943,-0.01777634,-0.048124723,-0.011490319,-0.0013934716,-0.00096829375,0.016057601,0.013004733,0.036946904,0.008569662,0.029326756,-0.029951751,0.001322859,-0.014651358,-0.0075300047,-0.01691096,0.013425404,-0.02824503,0.004612353,-0.026610425,-0.0007527,0.0064602997,0.013437423,-0.025504662,0.049278565,0.02134603,-0.024122458,-0.032884426,0.0117367115,-0.011652578,0.05235547,-0.0073016407,0.008305241,0.009212688,-0.0021829803,0.005531819,0.02480755,0.045095894,0.0019471042,0.030528672,-0.009909799,-0.04634589,0.011285993,0.003698897,0.007878561,0.023497462,0.016297983,0.0004142855,-0.010841284,0.0070612575,-0.039615158,0.004329903,-0.0005382331,-0.0041886778,0.0016721659,0.0025675935,0.026153697,-0.0037229354,-0.024398899,-0.021814778,0.028653681,0.001193653,0.014927799,0.00035512866,-0.019038353,-0.012151373,-0.005751169,-0.017535957,0.021177763,-0.010907389,-0.06033619,0.026634462,0.036201715,0.02209122,0.00845548,0.010889361,0.006526405,-0.021285936,0.024507072,-0.018581625,0.01706721,-0.04317283,0.0007557048,0.0019140516,0.011862913,0.03911035,0.025600815,0.012884541,0.0062559736,-0.0104747,-0.016730674,0.04932664,0.0063340985,-0.011430223,0.0056910734,-0.004732545,-0.014819627,0.0039933664,-0.038677663,-0.0117367115,0.01634606,-0.01664654,0.0028785893,0.006138787,-0.0081850495,0.0070191906,0.0021904923,0.051826626,-0.004402018,-0.04507186,-0.033124812,0.036249794,0.009669416,0.02164651,0.007499957,0.0036057485,-0.0140624195,-0.0038401221,0.039663233,0.026346004,-0.01234368,0.0022220425,0.02336525,-0.0038281032,-0.052067008,0.017055191,-0.014507129,-0.005249369,0.00874394,0.029062334,0.005522805,0.004359951,0.011219888,0.031153668,0.0019831618,0.01076316,-0.008112934,-0.0032091162,0.058749665,0.03682671,-0.05134586,-0.023196982,0.011977095,-0.013353289,-0.020516708,-0.020925362,0.009356918,-0.0027088185,-0.0118508935,0.034230575,0.013160982,-0.012355698,0.014963857,0.01647827,0.0109734945,0.037019018,-0.0066165486,-0.030360403,-0.042283412,-0.038196895,0.0042818263,0.019531138,-0.016742693,0.02008402,-0.012139354,0.00789058,0.021129686,0.026057543,0.014495109,-0.022043142,0.012752331,-0.011285993,0.043653596,0.0011696147,-0.017848456,-0.009050429,0.00083683414,0.030192135,0.027187344,0.019555176,0.018870084,0.033172887,-0.03771613,-0.033389233,-0.013437423,0.0028635652,0.022175353,0.0001895835,0.022067182,0.007644187,0.03055271,0.0025525696,0.0016030557,0.017728264,0.008557644,0.018894123,-0.0418988,0.0067727976,0.0358171,-0.0046243723,-0.008527596,0.024855627,0.008725911,0.07014383,-0.017535957,-0.017980667,0.03399019,-0.016045582,0.0071934685,0.034615185,-0.035216145,0.022620063,-0.02135805,0.023353232,0.005922442,0.033389233,-0.019110467,-0.0102463355,0.034687303,0.029230602,0.00068509224,-0.036442097,-0.01319704,-0.028461376,-0.025168125,-0.019843636,-0.026370041,-0.026538309,-0.041634377,-0.012169401,-0.0069530853,0.005775207,0.005769198,0.020829208,0.02596139,0.0041285823,0.06254772,-0.003383394,0.0019531138,0.014218668,-0.01635808,-0.013557615,-0.002782436,0.019459024,0.035744987,0.0060276096,-0.04834107,0.019903732,0.0017262521,0.06634577,-0.008028801,-0.047163192,0.0014685914,-0.0038791846,0.043677635,-0.015084048,0.01117782,-0.034807492,0.026490232,0.018870084,0.014398956,0.001577515,0.015564815,-0.04317283,-0.019002294,-0.009669416,-0.021886894,0.033509422,-0.031778663,0.022487853,0.027908495,0.007986733,0.006868951,-0.010300422,0.010709073,0.0069530853,-0.0053545367,0.026490232,-0.024591206,-0.04865357,-0.005090115,-0.0044380757,-0.010721092,0.027571958,-0.003755988,0.038461316,0.0075239954,-0.036634404,-0.0019290755,0.0031370013,-0.002531536,-0.001330371,-0.008275193,0.00218899,-0.055672757,-0.033773843,-0.010967486,0.012211468,-0.021334013,-0.00087364286,0.04348533,-0.00011784412,0.008978314,0.033894036,0.039350737,-0.047427613,0.02106959,0.016983075,0.032043085,-0.05091317,-0.008353317,0.010486719,-0.017031152,0.02495178,-0.02152632,0.043533403,0.028293107,-0.025047934,-0.010264364,0.006352127,0.00645429,-0.0034615186,0.041321877,-0.018160954,0.017716244,-0.00036902583,-0.033677693,-0.0041285823,-0.0077824076,-0.013701845,-0.016009524,-0.015829237,-0.010408594,-0.029879637,-0.032740198,-0.0053335032,-0.021934971,0.0042097117,-0.03817286,-0.028605605,-0.0009953368,-0.021971028,0.006538424,-0.023353232,-0.02709119,-0.0074218325,0.050240096,0.0004454602,0.012776369,-0.0023782917,0.0010434135,-0.001706721,0.04562474,0.0070492383,-0.015745101,-0.011562434,0.015360489,0.02997579,0.013846074,0.032812312,-0.0149037605,-0.029038295,-0.010576863,0.003873175,0.016934998,-0.013401366,-0.024999857,-0.024783513,-0.0026967993,-0.0032782264,0.02222343,-0.021898912,0.057307363,-0.010594891,-0.012379737,0.004945885,0.0023257078,-0.007998752,-0.0102463355,-0.0006971114,0.014002324,0.01907441,0.012253536,-0.023882074,-0.021406127,-0.0006674391,-0.007758369,0.0013611701,0.014795588,-0.032211352,-0.05067279,-0.025120048,0.030312326,-0.013677807,0.0029296707,-0.0010328967,0.02395419,0.007986733,0.016394136,0.012860503,0.0030498623,-0.019675368,-0.018377298,0.017427785,0.027331574,-0.005005981,0.031802703,-0.028437337,-0.015841255,0.0017367689,0.01018624,0.015528757,-0.014519148,-0.0067848167,0.030769054,-0.014975876,-0.02711523,0.008431442,-0.019110467,0.02567293,-0.014350879,0.011400175,0.0023827988,0.027547918,0.013124925,0.042668026,0.018846046,0.04805261,0.03302866,-0.03153828,0.028076762,-0.0060967198,-0.029038295,0.011478299,0.021718625,-0.007734331,-0.007908609,0.0016361084,0.036249794,0.016165772,-0.01907441,-0.027764264,0.043509368,0.0009224707,0.019471042,0.053942,-0.022884484,0.0078425035,-0.00023080547,-0.027836379,0.001714233,0.015817218,0.020925362,-0.018221049,-0.010270374,0.08355721,-0.014663378,-0.020901322,0.011117725,0.018701816,-0.020011904,0.014651358,-0.002687785,-0.0070732767,0.020035943,-0.0063160695,-0.009537205,0.025889276,0.006382175,-0.0016901946,-0.02567293,-0.008293222,0.013545595,0.026850808,-0.0027208377,-0.008671826,-0.016057601,0.010883351,0.023461403,-0.03872574,0.021946989,-0.005033024,-0.002896618,0.0025645886,-0.007043229,-0.018341241,0.014555205,-0.0036508203,0.0127282925,0.006526405,-0.01776432,-0.03358154,-0.049951635,0.047812227,-0.0104747,0.0003771012,0.024591206,-0.03858151,-0.0040684864,0.027836379,0.029735407,0.024446975,-0.026297927,-0.0072475546,0.020973438,0.03658633,-0.017944608,-0.0117367115,-0.03040848,0.011051619,-0.0076501966,0.026201773,-0.010240326,0.005712107,0.007932647,-0.018509509,-0.0005750418,-0.04331706,-0.012511947,0.030624826,0.040240154,-0.009771579,-0.0032091162,-0.009188649,0.0057151113,0.026490232,-0.0111237345,0.0014610793,0.002732857,-0.0013078351,0.018341241,0.0031610397,-6.779558e-05,0.017824417,0.020877285,0.017391726,0.004383989,0.015144144,-0.017391726,-0.01119585,-0.0028305126,0.044663206,0.020492671,0.009909799,0.017103268,-0.012812426,0.0020402528,0.03353346,0.000575793,-0.04444686,0.0010088584,0.002713326,0.0050510527,-0.015528757,0.00033127816,-0.0044681234,-0.033076733,-0.030023867,-0.0037169259,0.0124999285,0.0140624195,0.028220993,-0.004489157,-0.00494889,-0.015396547,-0.0052884314,0.013317231,-0.0034194516,-0.009717492,-0.019807579,-0.0029942738,-0.00030630082,0.0030228193,0.015096067,-0.011634549,-0.02152632,0.017559996,0.04548051,-0.004047453,-0.01765615,-0.008990333,0.022187373,-0.0053875893,-0.01563693,-0.029927714,0.006120758,0.0068028457,0.010799217,-0.053990077,-0.011502338,0.011802817,-0.010835274,-0.028773874,-0.010084077,-0.023701787,0.00063401076,-0.009645377,0.009489128,0.025288317,-0.017451823,-0.013245116,-0.0043809847,-0.0035666863,0.010096096,0.0090263905,0.0010088584,-0.022175353,0.0039062276,0.017403746,-0.029927714,-0.009008362,0.027547918,0.013822036,-0.017415766,-0.01735567,0.0069350563,-0.008094906,0.038461316,-0.024603225,0.00024639282,0.0005596422,0.018449413,-0.011255945,0.016995095,0.009266774,-0.03026425,0.013076848,-0.012632139,0.029086372,0.015444623,0.02682677,-0.018858066,0.0022040138,0.02337727,0.0082631735,0.0068929894,-0.010480709,-0.021790741,-0.044110324,-0.00831125,0.022427756,-0.001079471,0.028701758,0.04689877,-0.0057301354,0.020035943,0.027499843,0.017403746,-0.036634404,0.0026847804,0.021454204,0.034038268,-0.023124868,-0.041249763,0.02280035,0.011556424,0.048749723,0.05980735,-0.014242707,-0.0031279868,-0.018858066,-0.0031009438,0.010673015,0.01679077,0.017343652,-0.017475862,0.029278679,0.020480651,0.006568472,-0.0021078605,0.014471071,0.017259516,0.0045913197,0.015408565,0.0037619977,0.020576805,0.06384579,0.0071874587,-0.03425461,0.0074338517,0.018581625,-0.005766193,0.02509601,0.01175474,0.035961334,-0.021045553,0.028629644,-0.0135696335,-0.006971114,0.040240154,-0.008834084,0.008822065,0.004888794,-0.0033232982,0.007734331,-0.00053485273,-0.0023257078,0.0060877055,-0.0056309775,0.012217478,0.015949428,0.025889276,-0.007271593,0.01462732,0.026658501,-0.03413442,0.054615073,-0.0045522577,-0.0015685007,-0.027547918,0.0011065141,-0.00049391243,-0.0007955183,0.02323304,-0.011364117,0.012127334,-0.0068389033,0.03598537,-0.0022926552,-0.0064602997,0.030023867,0.02567293,-0.007439861,0.032499813,0.01290858,-0.013930209,0.0056880685,0.007554043,0.021285936,0.015949428,0.0048377127,-0.0023212007,0.026682539,-0.031370014,-0.0063160695,0.012439833,0.015312413,0.032595966,-0.0016856875,-0.0044741333,-0.007614139]",
    "embedding_generated_at": null,
    "embedding_model": "text-embedding-3-small"
  },
  {
    "id": "02958c6b-d1ab-442c-8426-797a8195ccd5",
    "code": "STORIES",
    "name": "User Story Context Engineering Sub-Agent",
    "description": "## User Story Context Engineering v2.0.0 - Lessons Learned Edition\n\n**🆕 NEW in v2.0.0**: 5 critical improvements from lessons learned and root cause analyses\n\n**Mission**: Create hyper-detailed, testable, and automatically validated user stories that reduce EXEC confusion and ensure 100% E2E test coverage.\n\n**Core Philosophy**: \"A well-written user story with rich context is worth 10 hours of EXEC debugging.\"\n\n---\n\n## 🚨 IMPROVEMENT #1: AUTOMATED E2E TEST MAPPING (CRITICAL)\n\n### The Mapping Gap (SD-VIF-INTEL-001)\n\n**Problem**: All 26 user stories had `e2e_test_path = NULL` despite E2E tests existing and passing (93.5% pass rate). Tests followed US-XXX naming convention but weren't linked back to database.\n\n**Root Cause**: Missing automated script to map actual E2E tests to user stories.\n\n**Impact**:\n- Handoff validation fails (unmapped stories = not validated)\n- Progress calculation stuck (PLAN_verification at 0%)\n- 100% coverage requirement not enforced\n- Manual workaround required (risky)\n\n### NEW: Automated E2E Test Mapping\n\n**Tool**: `scripts/map-e2e-tests-to-user-stories.js` (to be created)\n\n**Functionality**:\n1. Scan all E2E test files (`tests/e2e/**/*.spec.ts`)\n2. Extract US-XXX references from test names: `test('US-001: ...')`\n3. Map each US-XXX to its file path\n4. Update `user_stories` table:\n   ```sql\n   UPDATE user_stories\n   SET\n     e2e_test_path = 'tests/e2e/customer-intelligence.spec.ts',\n     e2e_test_status = 'created'\n   WHERE story_key = 'US-XXX';\n   ```\n\n**Integration**: Run automatically during EXEC→PLAN handoff\n\n**Enforcement**:\n```javascript\n// In unified-handoff-system.js: executeExecToPlan()\nconst mappingResult = await mapE2ETestsToUserStories(sdId);\n\nif (mappingResult.unmappedStories.length > 0) {\n  return {\n    success: false,\n    rejected: true,\n    reasonCode: 'INCOMPLETE_E2E_COVERAGE',\n    message: `${mappingResult.unmappedStories.length} user stories have no E2E tests`\n  };\n}\n```\n\n**Expected Impact**:\n- 100% E2E test coverage enforced automatically\n- Zero unmapped user stories\n- Accurate progress calculation\n- Prevents manual validation workarounds\n\n**Evidence**: ROOT_CAUSE_USER_STORY_MAPPING_GAP.md (339 lines), SD-VIF-INTEL-001\n\n---\n\n## ⚠️ IMPROVEMENT #2: AUTOMATIC VALIDATION ON EXEC COMPLETION (HIGH)\n\n### The Validation Gap (SD-TEST-MOCK-001)\n\n**Problem**: PLAN_verification showed 0% progress despite all deliverables complete. User stories were created during PLAN phase but never marked as `validated` after EXEC completion.\n\n**Root Cause**: No automatic validation of user stories when deliverables are marked complete.\n\n**Impact**:\n- Progress stuck at 85% (should be 100%)\n- PLAN_verification blocked\n- 30+ minutes debugging\n- `can_complete: false` prevents SD completion\n\n### NEW: Auto-Validation on EXEC Completion\n\n**Tool**: `scripts/auto-validate-user-stories-on-exec-complete.js`\n\n**When it runs**:\n- Triggered during EXEC→PLAN handoff creation\n- Before PLAN verification begins\n\n**What it checks**:\n1. Do user stories exist for this SD?\n2. Are all deliverables marked complete?\n3. Are any user stories still 'pending'?\n\n**What it does**:\n- Auto-validates user stories if deliverables complete\n- Logs validation actions for audit trail\n- Returns validation status to handoff system\n\n**Integration**:\n```javascript\n// In unified-handoff-system.js, EXEC→PLAN flow\nimport { autoValidateUserStories } from './auto-validate-user-stories-on-exec-complete.js';\n\n// After deliverables check, before PLAN handoff\nconst validationResult = await autoValidateUserStories(sdId);\nif (!validationResult.validated) {\n  console.warn('⚠️  User stories not validated, may block PLAN_verification');\n}\n```\n\n**MANDATORY Step in EXEC→PLAN Handoff**:\n```\nEXEC→PLAN Handoff Checklist:\n✓ 1. All deliverables marked complete\n✓ 2. Tests passed (unit + E2E)\n✓ 3. Git commit created with SD reference\n✓ 4. User stories auto-validated ← NEW\n✓ 5. E2E tests auto-mapped to stories ← NEW (Improvement #1)\n✓ 6. Create handoff in database\n✓ 7. Trigger PLAN_VERIFY sub-agents\n```\n\n**Expected Impact**:\n- Zero blocked handoffs due to validation status\n- Progress calculation accurate (100% when complete)\n- 15-20 minutes saved per SD (automatic validation)\n- 100% prevention of similar issues\n\n**Evidence**: user-story-validation-gap.md (156 lines), SD-TEST-MOCK-001\n\n---\n\n## 📋 IMPROVEMENT #3: INVEST CRITERIA ENFORCEMENT (MEDIUM)\n\n### The Quality Problem\n\n**Current State**: User stories created without enforced quality standards\n\n**INVEST Criteria** (Industry Standard):\n- **I**ndependent - Story can be developed independently\n- **N**egotiable - Details can be negotiated between team and stakeholder\n- **V**aluable - Delivers value to end user\n- **E**stimable - Can be estimated for effort\n- **S**mall - Can be completed in one sprint/iteration\n- **T**estable - Has clear acceptance criteria that can be tested\n\n### NEW: INVEST Validation During Creation\n\n**Automatic Checks**:\n1. **Independent**: Check for dependencies on other stories\n2. **Valuable**: Requires user persona and benefit statement\n3. **Estimable**: Requires complexity field (S/M/L or story points)\n4. **Small**: Warn if acceptance criteria > 5 (may need splitting)\n5. **Testable**: Requires at least one acceptance criterion in Given-When-Then format\n\n**Validation Script**:\n```javascript\nfunction validateINVESTCriteria(userStory) {\n  const issues = [];\n\n  // Independent\n  if (userStory.depends_on?.length > 2) {\n    issues.push('Too many dependencies - consider merging or reordering');\n  }\n\n  // Valuable\n  if (!userStory.user_persona || !userStory.benefit) {\n    issues.push('Missing user persona or benefit statement');\n  }\n\n  // Estimable\n  if (!userStory.complexity) {\n    issues.push('Missing complexity/effort estimate');\n  }\n\n  // Small\n  if (userStory.acceptance_criteria?.length > 5) {\n    issues.push('Too many acceptance criteria (>5) - consider splitting story');\n  }\n\n  // Testable\n  const hasGWT = userStory.acceptance_criteria?.some(ac =>\n    ac.includes('Given') && ac.includes('When') && ac.includes('Then')\n  );\n  if (!hasGWT) {\n    issues.push('No Given-When-Then format in acceptance criteria');\n  }\n\n  return {\n    valid: issues.length === 0,\n    issues,\n    score: calculateINVESTScore(userStory)\n  };\n}\n```\n\n**Integration**: Run during user story creation in PLAN phase\n\n**Expected Impact**:\n- Higher quality user stories\n- Fewer EXEC clarification questions\n- Better testability\n- Standardized format across all SDs\n\n**Evidence**: docs/02_api/14_development_preparation.md (RR-002: User story quality)\n\n---\n\n## 🎯 IMPROVEMENT #4: ACCEPTANCE CRITERIA TEMPLATES (MEDIUM)\n\n### The Clarity Problem\n\n**Current State**: Acceptance criteria vary widely in format and completeness\n\n**Problem Examples**:\n- Vague criteria: \"User can see the data\"\n- Missing edge cases: \"Form submits successfully\" (but what about validation errors?)\n- No Given-When-Then format\n- Incomplete coverage\n\n### NEW: Structured Acceptance Criteria Templates\n\n**Template Format**:\n```javascript\n{\n  story_key: 'US-001',\n  acceptance_criteria: [\n    {\n      id: 'AC-001-1',\n      scenario: 'Happy path - successful creation',\n      given: 'User is on the Ventures page AND user is authenticated',\n      when: 'User clicks \"Create Venture\" button AND fills all required fields AND clicks \"Submit\"',\n      then: 'Venture is created in database AND user sees success message AND venture appears in list',\n      test_data: {\n        venture_name: 'Test Venture',\n        category: 'Technology',\n        description: 'Test description'\n      }\n    },\n    {\n      id: 'AC-001-2',\n      scenario: 'Error path - validation failure',\n      given: 'User is on the Create Venture form',\n      when: 'User leaves required field empty AND clicks \"Submit\"',\n      then: 'Form shows validation error AND venture NOT created AND user stays on form',\n      expected_error: 'Venture name is required'\n    },\n    {\n      id: 'AC-001-3',\n      scenario: 'Edge case - duplicate name',\n      given: 'A venture with name \"Test Venture\" already exists',\n      when: 'User tries to create another venture with same name',\n      then: 'System shows duplicate error AND suggests alternative name',\n      expected_error: 'Venture name already exists'\n    }\n  ]\n}\n```\n\n**Coverage Requirements**:\n- **Minimum**: 1 happy path + 1 error path per user story\n- **Recommended**: Happy path + 2-3 error paths + 1-2 edge cases\n- **Complete**: All user journeys covered (success, validation, errors, edge cases, security)\n\n**Generation Tool**: `scripts/generate-acceptance-criteria-template.js`\n- Analyzes user story title\n- Suggests common scenarios (CRUD → create success, validation errors, duplicates, etc.)\n- Provides template for Given-When-Then format\n- EXEC fills in specific details\n\n**Expected Impact**:\n- Clearer acceptance criteria\n- Better E2E test coverage\n- Fewer implementation gaps\n- Standardized testing scenarios\n\n---\n\n## 🔗 IMPROVEMENT #5: RICH IMPLEMENTATION CONTEXT (LOW - ENHANCEMENT)\n\n### The Context Gap\n\n**Current State**: BMAD enhancement provides basic context fields, but often underutilized\n\n**Context Engineering Fields** (Current):\n1. implementation_context\n2. architecture_references\n3. example_code_patterns\n4. testing_scenarios\n5. edge_cases\n6. integration_points\n\n### NEW: Context Enrichment Guidelines\n\n**Enhanced Context Requirements**:\n\n**1. Architecture References** (MANDATORY)\n```javascript\n{\n  architecture_references: {\n    similar_components: [\n      'src/components/ventures/CreateVentureDialog.tsx',\n      'src/components/ventures/UpdateFinancialsDialog.tsx'\n    ],\n    patterns_to_follow: [\n      'Dialog pattern (shadcn/ui)',\n      'Form validation (react-hook-form)',\n      'Supabase mutation pattern'\n    ],\n    integration_points: [\n      'src/lib/supabase.ts - Database client',\n      'src/hooks/useVentures.ts - Data fetching',\n      'src/components/layout/Navigation.tsx - Menu entry'\n    ]\n  }\n}\n```\n\n**2. Example Code Patterns** (RECOMMENDED)\n```javascript\n{\n  example_code_patterns: {\n    database_query: `\n      const { data, error } = await supabase\n        .from('ventures')\n        .insert({ name, description, category })\n        .select()\n        .single();\n    `,\n    form_validation: `\n      const schema = z.object({\n        name: z.string().min(3, 'Name must be at least 3 characters'),\n        category: z.enum(['Technology', 'Healthcare', 'Finance'])\n      });\n    `,\n    error_handling: `\n      if (error) {\n        toast.error('Failed to create venture: ' + error.message);\n        return;\n      }\n      toast.success('Venture created successfully');\n    `\n  }\n}\n```\n\n**3. Testing Scenarios** (MANDATORY - Links to Improvement #1)\n```javascript\n{\n  testing_scenarios: {\n    e2e_test_location: 'tests/e2e/ventures/US-001-create-venture.spec.ts',\n    test_cases: [\n      { id: 'TC-001', scenario: 'Happy path', priority: 'P0' },\n      { id: 'TC-002', scenario: 'Validation error', priority: 'P1' },\n      { id: 'TC-003', scenario: 'Duplicate name', priority: 'P2' }\n    ]\n  }\n}\n```\n\n**Context Quality Score**:\n- **Bronze (50%)**: Basic title + acceptance criteria\n- **Silver (75%)**: + Architecture references + Testing scenarios\n- **Gold (90%)**: + Example code patterns + Integration points\n- **Platinum (100%)**: + Edge cases + Security considerations + Performance notes\n\n**Expected Impact**:\n- Reduced EXEC confusion\n- Faster implementation (clear examples)\n- Better code consistency\n- Fewer \"where do I put this?\" questions\n\n---\n\n## Core Capabilities (NEW - v2.0.0)\n\n**Original BMAD Enhancement**:\n1. implementation_context field\n2. architecture_references field\n3. example_code_patterns field\n4. testing_scenarios field\n5. edge_cases field\n6. integration_points field\n\n**NEW Capabilities (v2.0.0)**:\n7. **🚨 CRITICAL**: Automated E2E test mapping (scans tests, updates user_stories table)\n8. **⚠️ HIGH**: Automatic validation on EXEC completion (auto-validates when deliverables done)\n9. **📋 MEDIUM**: INVEST criteria enforcement (validates quality during creation)\n10. **🎯 MEDIUM**: Acceptance criteria templates (Given-When-Then format with happy/error/edge paths)\n11. **🔗 LOW**: Rich implementation context enrichment (architecture refs, code examples, test scenarios)\n12. **Coverage enforcement**: 100% E2E test mapping required (blocks handoff if incomplete)\n13. **Quality scoring**: Context quality score (Bronze/Silver/Gold/Platinum)\n14. **Validation gates**: Auto-validation prevents progress calculation issues\n\n---\n\n## Integration with LEO Protocol\n\n### PLAN Phase (User Story Creation)\n- **BEFORE**: Stories created with basic info\n- **NOW**: Stories validated against INVEST criteria\n- **NOW**: Acceptance criteria use templates (Given-When-Then)\n- **NOW**: Implementation context enriched with architecture references\n\n### EXEC Phase (Implementation)\n- **BEFORE**: EXEC reads stories, implements features\n- **NOW**: EXEC uses rich context (examples, references, patterns)\n- **NOW**: E2E tests follow US-XXX naming convention\n\n### EXEC→PLAN Handoff (Validation)\n- **BEFORE**: Manual validation required\n- **NOW**: Auto-validate user stories when deliverables complete (Improvement #2)\n- **NOW**: Auto-map E2E tests to user stories (Improvement #1)\n- **NOW**: Block handoff if coverage < 100%\n\n### PLAN Verification (Final Check)\n- **BEFORE**: Check deliverables, run sub-agents\n- **NOW**: Verify user story validation_status = 'validated'\n- **NOW**: Verify e2e_test_path populated for all stories\n- **NOW**: Progress calculation uses accurate data\n\n---\n\n## Lessons Learned Integration\n\n**Success Patterns**:\n- **US-XXX Naming Convention**: Made retrospective mapping possible (Improvement #1)\n- **Database-First Tracking**: Protocol correctly requires it, now automated (Improvement #1, #2)\n- **Given-When-Then Format**: Clear testability (Improvement #4)\n- **Context Engineering**: Reduced EXEC confusion (Improvement #5)\n\n**Failure Patterns**:\n- **Validation Gap** (SD-TEST-MOCK-001): 30 min debugging, progress stuck at 85%\n- **Mapping Gap** (SD-VIF-INTEL-001): 26 user stories unmapped, manual workaround needed\n- **Quality Variance**: User stories vary widely in quality and completeness\n- **Context Underutilization**: Rich context fields often empty or minimal\n\n---\n\n## Expected Impact Summary\n\n| Improvement | Priority | Time Savings | Quality Impact |\n|-------------|----------|--------------|----------------|\n| #1: E2E Test Mapping | 🚨 CRITICAL | 15-20 min per SD | 100% coverage enforced |\n| #2: Auto-Validation | ⚠️ HIGH | 15-20 min per SD | Zero blocked handoffs |\n| #3: INVEST Criteria | 📋 MEDIUM | 10-15 min per SD | Higher story quality |\n| #4: AC Templates | 🎯 MEDIUM | 10-15 min per SD | Clearer acceptance criteria |\n| #5: Rich Context | 🔗 LOW | 20-30 min per SD | Reduced EXEC confusion |\n\n**Total Expected Impact per SD**:\n- **Time Savings**: 70-100 minutes per SD (automation + clearer context)\n- **Quality**: 100% E2E coverage, zero validation blocks, standardized format\n- **EXEC Efficiency**: 25-30% reduction in clarification questions\n- **Test Coverage**: 100% automated enforcement (vs manual checking)\n\n**Annual Impact** (assuming 50 SDs/year):\n- **Time Savings**: 58-83 hours/year\n- **Issues Prevented**: 100+ validation/mapping failures\n- **Quality Score**: +15-20% improvement in user story completeness\n\n---\n\n## Tools to Create (Future Work)\n\n1. `scripts/map-e2e-tests-to-user-stories.js` - Automated E2E test mapping (CRITICAL)\n2. `scripts/auto-validate-user-stories-on-exec-complete.js` - Auto-validation (HIGH)\n3. `scripts/validate-invest-criteria.js` - INVEST quality checker (MEDIUM)\n4. `scripts/generate-acceptance-criteria-template.js` - AC template generator (MEDIUM)\n5. `scripts/enrich-user-story-context.js` - Context enrichment tool (LOW)\n\n---\n\n## Version History\n\n- **v1.0.0**: Initial BMAD enhancement - Context engineering fields\n- **v2.0.0** (2025-10-26): Lessons Learned Edition - 5 critical improvements from user story validation gaps, E2E test mapping issues, and quality analysis\n\n---\n\n**BOTTOM LINE**: STORIES v2.0.0 adds automation (E2E mapping, auto-validation), quality enforcement (INVEST criteria, AC templates), and rich context to eliminate user story validation gaps (30 min saved), mapping gaps (15-20 min saved), and EXEC confusion (20-30 min saved). Well-written stories with automated validation prevent 70-100 minutes of rework per SD.",
    "activation_type": "automatic",
    "priority": 50,
    "script_path": null,
    "context_file": null,
    "active": true,
    "created_at": "2025-10-13T11:56:10.646Z",
    "metadata": {
      "version": "2.0.0",
      "enhanced": "2025-10-26",
      "improvements": {
        "4_ac_templates": {
          "impact": "Clearer acceptance criteria, 10-15 min saved per SD, better testability",
          "source": "Best practices analysis, Given-When-Then format",
          "priority": "MEDIUM",
          "tools_to_create": [
            "scripts/generate-acceptance-criteria-template.js"
          ]
        },
        "5_rich_context": {
          "impact": "Reduced EXEC confusion, 20-30 min saved per SD, better code consistency",
          "source": "BMAD enhancement underutilization analysis",
          "priority": "LOW",
          "tools_to_create": [
            "scripts/enrich-user-story-context.js"
          ]
        },
        "2_auto_validation": {
          "impact": "Zero blocked handoffs, 15-20 min saved per SD, prevents SD-TEST-MOCK-001 issues",
          "source": "user-story-validation-gap.md (156 lines), SD-TEST-MOCK-001",
          "priority": "HIGH",
          "tools_to_create": [
            "scripts/auto-validate-user-stories-on-exec-complete.js"
          ]
        },
        "3_invest_criteria": {
          "impact": "Higher story quality, 10-15 min saved per SD, standardized format",
          "source": "docs/02_api/14_development_preparation.md (RR-002)",
          "priority": "MEDIUM",
          "tools_to_create": [
            "scripts/validate-invest-criteria.js"
          ]
        },
        "1_e2e_test_mapping": {
          "impact": "100% E2E coverage enforced, 15-20 min saved per SD, prevents SD-VIF-INTEL-001 issues",
          "source": "ROOT_CAUSE_USER_STORY_MAPPING_GAP.md (339 lines), SD-VIF-INTEL-001",
          "priority": "CRITICAL",
          "tools_to_create": [
            "scripts/map-e2e-tests-to-user-stories.js"
          ]
        }
      },
      "failure_patterns": [
        "User stories not validated after EXEC completion (SD-TEST-MOCK-001)",
        "E2E tests exist but not linked to user stories (SD-VIF-INTEL-001 - 26 stories)",
        "Acceptance criteria incomplete or missing Given-When-Then",
        "INVEST criteria not enforced during creation",
        "Implementation context underutilized (fields empty or minimal)",
        "Manual validation workarounds bypass quality gates"
      ],
      "original_feature": "BMAD Enhancement - Context Engineering",
      "success_patterns": [
        "US-XXX naming convention makes retrospective mapping possible",
        "Database-first tracking with automated updates",
        "Given-When-Then format provides clear testability",
        "Context engineering reduces EXEC confusion",
        "Auto-validation prevents progress calculation issues",
        "100% coverage enforcement catches gaps early"
      ],
      "quality_improvement": "+15-20% improvement in user story completeness",
      "time_savings_potential": "58-83 hours/year (50 SDs × 70-100 min each)",
      "lessons_learned_sources": [
        "user-story-validation-gap.md: SD-TEST-MOCK-001 (30 min debugging, progress blocked)",
        "ROOT_CAUSE_USER_STORY_MAPPING_GAP.md: SD-VIF-INTEL-001 (26 unmapped stories, CRITICAL gap)",
        "validation-agent-proactive-gates.md: SD-EVA-MEETING-001 (user story validation requirements)",
        "docs/02_api/14_development_preparation.md: RR-002 (user story quality criteria)"
      ],
      "issues_prevented_annually": "100+ validation/mapping failures"
    },
    "capabilities": [
      "Context engineering fields: implementation_context, architecture_references, example_code_patterns, testing_scenarios, edge_cases, integration_points",
      "🚨 CRITICAL: Automated E2E test mapping (scans tests, links to user_stories table, enforces 100% coverage)",
      "⚠️ HIGH: Automatic validation on EXEC completion (auto-validates when deliverables done, unblocks progress)",
      "📋 MEDIUM: INVEST criteria enforcement (validates quality during creation: Independent, Negotiable, Valuable, Estimable, Small, Testable)",
      "🎯 MEDIUM: Acceptance criteria templates (Given-When-Then format with happy/error/edge paths)",
      "🔗 LOW: Rich implementation context enrichment (architecture refs, code examples, test scenarios, integration points)",
      "Coverage enforcement: 100% E2E test mapping required (blocks EXEC→PLAN handoff if incomplete)",
      "Quality scoring: Context quality score (Bronze/Silver/Gold/Platinum based on completeness)",
      "Validation gates: Auto-validation prevents progress calculation issues (SD-TEST-MOCK-001 prevention)",
      "Automated mapping: Scans E2E test files, extracts US-XXX references, updates database (SD-VIF-INTEL-001 prevention)"
    ],
    "domain_embedding": "[-0.0009928321,0.021804364,0.041230988,-0.01770656,-0.01188869,-0.031517677,-0.00060154876,0.0023097575,0.015986495,0.031871807,0.03948563,-0.020236067,-0.03437602,0.006753788,0.064198926,0.030278217,-0.0053878534,-0.011287932,-0.01770656,0.0008371092,0.07573348,0.02337266,0.030961184,0.06263063,-0.0012671257,0.01611297,-0.03349069,0.058178697,-0.020678733,-0.023448544,-0.01425378,-0.022158494,-0.034603678,-0.00027370072,0.04669473,0.023903856,0.00972596,-0.0008212998,0.032453593,0.019173674,-0.008865927,-0.02800166,-0.0061846483,-0.013520223,-0.007183804,0.0313912,-0.0026370126,0.032352414,-0.019692224,0.006450247,-0.020716675,-0.0023635095,0.044848185,-0.0018417984,-0.0058210315,0.01884484,0.016201502,-0.007607497,-0.039055612,0.018035395,0.0180101,-0.06470483,0.025813635,-0.0037752916,-0.014279076,0.007866772,0.0020979112,-0.012432534,-0.03923268,-0.036146678,0.06455306,0.019780757,-0.001770656,0.042951055,0.08827985,0.006829673,-0.003345275,0.057166893,-0.020476371,-0.017580085,0.011812805,-0.0283052,-0.024713298,-0.033338923,-0.059949353,-0.05291732,-0.05322086,-0.013558166,-0.05296791,-0.04520232,-0.041787483,0.010168624,0.0042527365,-0.01795951,0.03473015,0.04044684,-0.016479747,0.025421562,0.014696444,0.043204006,0.035893727,-0.07912303,-0.009536247,0.01237562,0.07198981,-0.016973002,-0.029114643,-0.012596953,0.0014022962,-0.03288361,-0.076289974,-0.013431691,-0.015354116,0.034881923,0.017845683,-0.0040914803,0.029620545,-0.050817825,0.01395024,0.0025895843,0.013039617,0.009365506,0.014177895,-0.023145003,0.03953622,-0.057875156,-0.024080921,0.003150819,0.025560685,0.0070889476,0.031492382,-0.0062700193,0.024574175,-0.055092696,-0.016441805,0.014380256,-0.039814465,-0.005112769,-0.02429593,0.0076960297,0.004932542,-0.009460362,-0.011850747,-0.0007821715,0.01395024,-0.006602017,-0.0019461407,0.072495714,-0.014418199,0.007955304,-0.008543415,-0.050413106,-0.054738566,-0.0048566563,0.049730137,-0.03510958,-0.02666102,0.018338937,0.003405351,-0.018693069,0.0622765,-0.017010946,-0.025206553,0.019477217,0.017529495,-0.03227653,0.0026907646,0.025548037,-0.0442664,-0.0075189644,-0.02635748,-0.06961208,-0.038777366,0.028988168,0.03387012,-0.035387825,0.019110437,-0.04353284,-0.015290879,0.005115931,-0.052512597,-0.008303111,-0.072394535,-0.026306888,-0.05317027,0.0005074827,0.012811961,0.003376894,-0.0028646684,-0.03849912,0.0046606194,0.02825461,-0.019578395,-0.0036298449,0.04833891,-0.051551383,0.046214122,-0.029848201,-0.03999153,0.01698565,0.014949395,0.0029832392,0.06576722,0.02270234,-0.0129890265,-0.008119723,-0.016037084,0.0108579155,0.00014238367,-0.04391227,-0.03566607,0.047074154,0.017061535,0.036526103,-0.044924073,-0.019426625,0.0052076257,0.00808178,-0.02666102,-0.010959095,-0.04302694,-0.0102951,0.017795093,0.004831361,-0.008505473,0.044797596,0.021374347,-0.04864245,0.03804381,-0.055193875,-0.022095257,-0.009827141,-0.047883596,0.0026401745,-0.021424938,-0.042116318,-0.012445182,0.010940124,-0.021728478,0.0015603906,0.012976379,0.0017643322,0.009371829,0.031239431,0.001797532,0.032807726,-0.0313912,-0.023612963,-0.005305644,0.008834309,0.066020176,-0.03953622,0.037537906,0.019477217,0.0069055585,-0.05099489,0.046188828,-0.021260519,0.023840617,-0.0049104085,0.01145235,-0.0401433,0.01663152,0.02974702,-0.013709936,0.024131512,0.024890363,0.012027813,-0.0031429143,0.0020362544,0.0035855784,0.029949382,0.009555219,0.0089987265,-0.012830932,-0.061315287,0.025206553,-0.018123928,-0.008189284,-0.02120993,0.017668618,0.0040535373,0.021349052,0.056863353,0.00033950747,0.03467956,0.012445182,0.011534559,0.023941798,0.040421546,-0.008581358,0.010604965,-0.003563445,-0.038271464,0.0040630233,-0.023663552,-0.0031350097,0.020602847,-0.010560698,0.0078478,0.043102827,-0.030227628,-0.0012236497,-0.025244495,0.003509693,-0.023537077,0.024561528,-0.06951089,0.01165471,-0.029999971,-0.00043120215,-0.03361717,0.044999957,0.013292568,0.0024409757,-0.051551383,0.0034243222,-0.019123085,-2.4751636e-05,-0.05913991,0.01663152,-0.038397938,0.0009216897,-0.0060613346,-0.018465413,-0.0120404605,0.021880249,0.0069687963,-0.0015098004,0.0018497031,-0.021450233,-0.025927462,-0.019262208,-0.016707404,0.0011058695,0.032504186,-0.021386994,0.03665258,0.0076201446,-0.024725946,-0.06187178,-0.04745358,-0.040548023,-0.03731025,0.019363388,0.040800974,-0.008644596,-0.031871807,0.026180413,0.018705716,0.020489018,0.018351585,-0.03197299,0.04451935,0.0044329637,-0.022525273,-0.014532027,0.03392071,-0.0034432935,-0.019945174,0.028760511,-0.020311953,-0.020274011,0.0308853,-0.0014402389,0.069156766,-0.016795937,0.03402189,-0.014127305,-0.015973847,0.028583447,-0.0053309393,-0.043052234,0.011913985,-0.01425378,0.040548023,-0.026686314,0.009258001,-0.033288334,0.034502495,0.023549724,0.0252192,0.006747464,-0.037917335,0.015758839,0.0005169683,-0.001881322,0.009264325,0.007879419,-0.009732285,-0.026079234,-0.0029927248,0.054637384,0.028128136,0.03799322,0.010927477,0.039510924,0.03958681,0.015316174,-0.045252908,0.009972587,-0.013671993,-0.019312797,-0.027596937,-0.019198969,0.011243666,-0.03948563,-0.00497997,-0.035438415,-0.013241977,0.01868042,-0.0065640747,0.0024646898,0.017504198,-0.0011762215,-0.022462036,0.019388683,0.008524444,0.048617154,0.04009271,-0.040522728,-0.021298463,0.008714157,0.018022748,0.0006813864,0.022171142,0.03093589,0.003427484,0.015935903,-0.037133187,-0.02506743,0.061922368,0.049123056,0.005862136,-0.035286643,-0.008758423,0.051273137,0.02151347,0.01594855,0.042748693,-0.033667758,0.0051633595,-0.008290464,0.03098648,-0.0133811,0.020881092,-0.029519364,0.0025959082,-0.023435896,-0.03159356,0.03467956,-0.008809013,0.033591874,0.032959495,-0.054485615,0.009245354,0.021070806,-0.0076138205,0.026736906,0.052462008,-0.01472174,0.06870145,0.02243674,0.040725086,0.054384433,-0.030278217,-0.046239417,0.021892896,-0.037234366,0.013785821,0.03313656,-0.0127171045,0.018920723,-0.01663152,-0.012837256,-0.010231862,0.0064597325,-0.015923256,-0.010358337,-0.006798054,-0.0060486873,0.0038638243,-0.031492382,0.047200628,0.020400487,0.038271464,-0.021677889,-0.06146706,0.025598627,0.071736865,-0.051500794,-0.0012916303,0.032251235,-0.013001674,-0.028861692,-0.013456985,0.018642478,0.010699821,-0.023802675,0.02079256,-7.381027e-05,-0.0044645825,-0.022651749,0.03227653,-0.031669445,-0.04082627,-0.03237771,0.0023477,-0.040674496,0.0021959296,-0.014380256,-0.0018165034,0.0015121718,-0.014683797,-0.019363388,-0.014734387,0.014317018,0.0111488085,-0.011420731,-0.0049293796,-0.041762184,-0.0026591457,0.0102951,0.008176636,0.013697289,-0.020489018,0.009985235,-0.051703155,-0.0036140354,0.02253792,-0.02161465,-0.01832629,-0.016732698,0.022664396,-0.05949404,-0.0049578366,-0.010952772,-0.013444338,0.013431691,0.02573775,-0.011812805,0.01472174,0.03892914,0.012103698,-0.0077023534,0.021956135,-0.029848201,-0.011566178,0.0035824166,-0.006602017,0.008878575,-0.023840617,0.048060663,-0.0026654697,0.0077908863,0.029822906,-0.014304371,-0.030910594,-0.06399657,-0.02774871,0.0009983655,-0.018806895,0.025472151,-0.039435036,-0.02949407,-0.00011817548,-0.004341269,-0.05327145,0.032251235,0.013735231,-0.012002518,-0.03392071,-0.0105859935,-0.027040446,0.03983976,-0.0213617,0.022322914,-0.0053024823,0.0151391085,0.006007583,-0.0073735174,-0.0048029046,-0.01121837,0.004651134,-0.049806025,-0.033693053,-0.007828829,0.009213734,0.008012218,0.060151715,-0.005994935,-0.038625594,0.0110666,0.033010088,0.010314072,0.010212891,-0.00254848,0.009321239,-0.0111677805,0.008587682,0.018553944,-0.031517677,0.0020662923,0.006798054,-0.021424938,0.013001674,-0.029468775,-0.025927462,-0.029772315,-0.008189284,0.038954433,0.008296788,-0.0065387795,-0.011996195,-0.0018180843,-0.010155977,-0.007721325,-0.02392915,0.013052264,-0.0117305955,0.0099283215,0.005337263,0.02706574,0.00977655,0.03660199,0.007664411,-0.01816187,0.025459504,0.025408912,-0.008612976,-0.0064945132,0.0375632,0.037664384,0.004945189,-0.022373503,-0.026028642,-0.0030575434,0.015164404,-0.026256299,-0.009409772,0.030531168,-0.03129002,0.016555633,0.009542571,-0.0025642894,-0.023043822,-0.025623921,0.020476371,-0.034881923,0.009586837,-0.022980586,-0.03591902,0.044848185,0.0059411833,0.013570813,0.009080935,-0.022069963,-0.00084659486,-0.0042274413,0.00464481,0.005526976,0.028456971,-0.029266413,0.008157665,0.02223438,0.0072596897,0.001740618,0.04596117,0.0015311431,0.0011240504,-0.053423222,0.050210744,-0.021349052,0.0075063165,0.018604536,0.033440102,0.017529495,-0.024422405,0.002899449,0.048060663,-0.016694756,-0.013140797,-0.00890387,-0.018553944,0.028482266,-0.0360202,-0.006453409,-0.022677043,0.05271496,0.0042211176,0.010174948,-0.045278203,0.010990715,-0.020236067,-0.011774862,-0.0028915445,-0.0069371774,0.011003362,-0.023410602,-0.066829614,-0.010617612,0.031517677,-0.03455309,0.002935811,-0.029999971,-0.039308563,0.013482281,-0.004872466,0.031365905,0.015341469,-0.02094433,0.042040434,-0.031467088,-0.039207384,-0.017504198,-0.022993233,-0.01997047,-0.0005608395,0.024422405,-0.011060276,-0.04694768,0.01817452,-0.033642463,0.002630689,-0.01656828,-0.028912283,0.024574175,0.008600329,-0.00092564203,0.00020206426,0.0010616031,0.02429593,0.033212446,0.04034566,-0.033212446,-0.0030290864,-0.0056249946,-0.00923903,-0.02238615,-0.010807325,-0.025421562,-0.030505873,-0.025054783,0.03288361,0.009536247,-0.027192216,0.0029389728,0.04798478,-0.028684627,0.0014212676,-0.008859604,0.009978911,-0.015809428,-0.0205902,0.030961184,-0.043735202,0.0229047,0.010933801,-0.0062542097,0.017630674,0.004723857,0.025193905,-0.02691397,-0.010035825,0.0074051362,0.019881938,0.032453593,0.03478074,0.028330496,-0.015151756,-0.020362543,-0.015012633,-0.015126461,0.013494928,-0.003405351,-0.026534544,-0.0142284855,0.032504186,-0.024903012,0.021994077,-0.014544674,0.0037310252,0.015316174,-0.03326304,-0.06662726,0.005112769,-0.018427469,0.028558152,-0.010421575,-0.04262222,-0.0023872238,0.0071521853,0.010864239,0.022424093,-0.03351599,-0.042596925,-0.018313643,-0.04803537,0.027217511,0.006168839,-0.0053752055,0.0034780742,-0.01790892,0.039713286,0.0008876994,0.01626474,-0.012653867,0.0067158453,-0.02650925,-0.032731842,-0.007247042,0.02017283,-0.01894602,-0.00073395274,-0.0014244295,-0.034932513,0.0026512411,0.044494055,-0.02805225,-0.009150498,0.0064344374,-0.014974691,-0.040623907,-0.008676214,0.015923256,0.03129002,-0.019363388,-0.016871821,-0.0036930824,-0.023435896,0.024586823,0.039966237,0.032807726,-0.005827355,0.045682926,-0.020855797,-0.03510958,0.02439711,0.0114397025,0.02337266,-0.029165234,0.028279906,-0.03268125,0.0019002933,0.030075857,-0.030480579,0.032605365,-0.02260116,-0.01011171,0.016694756,-0.0039744903,0.0052360827,-0.045227613,-0.0010260319,-0.021842306,-0.0019097789,0.050843123,0.007215423,-0.04585999,0.005609185,-0.0067854067,0.010642908,-0.0029200015,0.007335575,0.0064755417,-0.021703184,0.034249544,0.013962887,0.0021674726,-0.0065703983,0.011749567,0.011098219,-0.015341469,-0.0087647475,0.0027492596,-0.007272337,-0.034983102,0.026838087,0.023537077,0.01198987,0.05337263,-0.011016009,0.01703624,0.023018528,0.030354103,-0.022664396,0.06010112,0.012742399,0.015657658,0.019477217,-3.9369183e-06,0.0045278203,0.0049578366,-0.0051032836,-0.010099063,0.023423249,0.006424952,-0.017440962,0.014089363,-0.0067917304,0.0011959833,-0.015682952,0.032959495,0.052816138,-0.022525273,-0.021336405,0.019312797,-0.0011785929,0.018832192,0.0042970027,0.01961634,-0.06763906,0.017567437,0.044139925,0.013494928,-0.0145193795,-0.015556478,-0.0024441376,0.024978897,-0.036981415,-0.0148482155,-0.0038037484,-0.004012433,-0.010105386,0.047175333,0.0013453823,-0.005157036,0.03164415,0.057723384,0.0126412185,-0.04601176,0.0063743615,0.005858974,0.047023565,0.011344845,-0.05903873,-0.009706989,0.0014592103,-0.025864225,0.021121396,0.0057483083,0.006383847,-0.015986495,-0.013520223,0.028634036,0.024068274,-0.0071015954,-0.011231018,0.012192232,0.00268286,0.027849888,-0.025649216,-0.007904714,-0.032706544,-0.012875198,0.008556062,-0.032706544,-0.028229315,0.00995994,-0.014089363,-0.0025800988,0.000104836276,0.0064881896,-9.62399e-05,-0.009080935,0.03134061,-0.047529466,-0.027521053,-0.01039628,0.003014858,-0.035337236,0.037462022,0.059898764,0.03202358,0.01425378,0.00017736203,0.006747464,-0.006861292,-0.01410201,-0.009997883,0.021146692,0.021488175,0.0024393948,-0.0118064815,-0.0324283,0.0024156806,0.0055649187,0.045632333,0.013811117,0.0203246,-0.03222594,-0.0504384,0.0047934186,-0.0021658917,-0.0133811,0.005245568,0.016049732,-0.029392889,0.08397968,0.03113825,0.02706574,0.0031018099,0.038878545,0.013406395,-0.0061024395,-0.0710286,0.0052107875,0.018123928,0.038144987,-0.0006829673,0.050311927,-0.0133178625,0.013305215,0.020375192,-0.018553944,0.019983118,-0.03480604,-0.02176642,-0.0038069102,-0.048364203,-0.008891223,-0.0052234353,0.018313643,-0.014038772,-0.009175792,0.013887002,0.004815552,-0.061416466,0.021639945,0.013722584,-0.012653867,0.022424093,-0.0030006296,0.006469218,0.0035318262,0.016492397,-0.030177036,-0.0013374776,-0.008056485,0.005255054,0.0229047,-0.025750397,0.04765594,0.016049732,0.027445167,-0.0024567852,-0.024865068,-0.026736906,-0.0015730382,0.065514274,-0.021349052,0.0059064026,-0.02974702,-0.012672838,-0.008581358,0.0195531,0.033465397,0.0071015954,-0.020337248,-0.0047206953,0.013798469,-0.022107905,0.0025769367,-0.011591473,0.021096101,0.020564904,-0.0039586807,-0.011743244,0.021108748,0.013241977,-0.010592317,0.010187596,0.01755479,-0.020919036,-0.029974677,0.024561528,0.008771071,-0.027015151,0.026155118,0.02491566,0.03361717,0.006276343,-0.07198981,0.0005908774,-0.034831334,-0.018516002,-0.011053952,0.006172001,-0.0052139494,-0.009169469,-0.0027919451,-0.012685485,0.0066209887,-0.015657658,0.009017698,0.043709908,-0.0013825345,-0.006696874,-0.010339366,-0.010541727,-0.0013809536,0.042192202,-0.0057040416,0.00486298,0.00026619126,-0.005697718,0.002325567,-0.02377738,-0.032352414,0.0066273124,0.06344008,0.02347384,-0.010130682,0.017352428,0.004815552,0.0031776952,-0.01091483,0.007904714,-0.0018844838,0.0030780956,0.0069498247,-0.057217482,-0.0108579155,0.001524029,-0.02944348,-0.01130058,0.0010536984,-0.014013478,-0.029671134,-0.01088321,-0.023600314,-0.036551397,-0.010927477,-0.022171142,-0.037133187,0.009700665,-0.0048029046,0.021943487,-0.007974275,-0.026104528,-0.034907218,0.026408069,-0.00013032898,-0.013558166,-0.015973847,-0.0047902567,0.040118005,0.054586794,0.021184634,-0.026332185,0.021134043,0.008511797,-0.0013572394,-0.012615924,0.012837256,-0.0111677805,-0.013140797,-0.008790042,0.019338094,0.021032864,0.013849059,-0.0105480505,0.0046859146,-0.025181258,0.017845683,0.026686314,-0.039055612,0.033338923,-0.019578395,0.005255054,0.0007881,-0.0038891195,0.012128994,0.017137421,0.024207396,0.0040819943,0.026408069,0.011433379,0.005887431,-0.034881923,0.019603692,0.0026354317,0.009321239,0.020299306,0.01554383,-0.0024852422,0.0004770495,0.005530138,-0.024005037,0.037816152,0.0039239,0.0057293368,0.023562372,0.031998284,0.0024868231,0.0069245296,0.011964575,-0.013924944,0.017289191,0.005245568,-0.010415251,0.017731855,-0.03890384,-0.018591888,0.003516017,0.04869304,-0.020286659,-0.021096101,-0.0029848202,0.014886158,-0.00076122396,-0.013646699,0.01991988,-0.023903856,-0.0019856642,0.001825989,-0.0133178625,0.001547743,0.020274011,0.026003348,0.019211618,0.0052645397,0.054536205,0.03422425,0.009662722,-0.0061846483,-0.0067158453,-0.028608741,-0.01884484,0.026256299,-0.002153244,0.0252192,-0.0048787897,0.06172001,0.026787495,-0.0154300025,-0.0132799195,-0.0010671364,-0.0012528972,0.029266413,0.022158494,-0.0040819943,0.0027587453,0.0006434437,-0.014784978,-0.0021216252,-0.036500808,0.048870105,-0.014114657,0.0138617065,0.06182119,-0.030607054,-0.028709922,0.0021959296,0.026964562,0.0026907646,-0.0035666071,0.003651978,0.02193084,0.009403448,0.011294256,0.006911882,0.025459504,-0.0071205664,-0.016226796,-0.010978067,-0.029544659,0.008347378,0.036197267,0.013760527,-0.025725102,-0.01946457,0.03720907,-0.02208261,-0.028760511,0.037664384,-0.032807726,0.0087647475,0.022462036,-0.027419873,-0.015999142,0.0076201446,0.009112555,-0.021121396,0.006140382,0.004009271,-0.007948981,-0.048161842,0.026964562,-0.048085958,-0.035261348,-0.014860863,-0.018364232,0.015897961,0.0014884577,0.008404292,0.008929165,-0.0051001217,-0.020514315,0.022411445,0.02974702,-0.022626454,0.030252922,-0.04596117,0.022980586,-0.010611288,0.03510958,0.003949195,-3.2483435e-06,0.01852865,-0.036576692,0.031998284,-0.020754617,0.016391216,0.025307734,0.026787495,-0.0076517635,-0.024182102,-0.043204006,0.052310236,0.01626474,0.003399027,0.008480177,0.026028642,0.007948981,0.044645827,-0.009479334,-0.0054921955,0.016909765,0.0051633595,0.03710789,0.0055206525,0.02516861,-0.015708247,-0.004840847,0.004502525,0.012698133,0.006842321,0.0008639853,-0.002573775,-0.00010463865,0.00038219293,0.023107061,-0.0038132342,-0.05903873,0.0030385721,-0.0025674512,0.0267622,-0.03134061,-0.0032314472,-0.0017864654,-0.020122241,-0.026003348,0.007752944,0.0026923458,-0.011243666,0.03129002,0.010174948,-0.020982273,0.0013438014,0.007051005,0.017023593,0.007525288,-0.021741126,-0.02537097,0.00608663,0.0005636061,0.015910609,-0.0016070284,-0.00375632,-0.052816138,0.022841463,0.03940974,-0.007677058,-0.019262208,-0.005413148,-0.018983962,-0.009264325,-0.012236497,-0.017491551,0.0024093569,-0.0004193451,0.03351599,-0.07467109,-0.01284358,-0.0068170256,-0.015050576,0.014354961,-0.0043444308,-0.031112956,0.0076960297,0.01068085,0.010813649,0.04957837,0.010503784,-0.0148482155,-0.0077150012,0.0036045497,0.020628143,-0.0031650476,-0.014835567,0.0071521853,-0.016454453,-0.0073418985,-0.04502525,-0.0044930396,0.014784978,-0.008043837,0.0068929107,0.03103707,-0.018832192,0.002823564,-0.0075189644,-0.03571666,-0.0059253736,-0.002077359,0.025383618,0.0049262177,0.029089348,0.004094642,-0.0054036626,-0.013849059,0.0014188963,0.00962478,0.0050147506,0.004278031,-0.012590629,-0.014329666,0.021817012,-0.015910609,-0.023145003,-0.010946448,-0.028735217,-0.018300995,0.007240718,0.035868432,0.006962472,0.039561514,0.038094398,0.011155133,0.0043886974,0.042849876,-0.0102381855,-0.053676173,-0.016505044,0.024156807,-0.00508115,-0.0064028185,-0.042495742,0.0114966165,-0.016075026,0.048768926,0.0039586807,0.018655125,-0.008821661,0.0030860004,-0.022980586,-0.012514744,-0.03516017,-0.0021421777,-0.021602003,0.027242808,0.0059601543,-0.022892052,-0.003430646,0.024308577,-0.001411782,0.012976379,-0.011983546,-7.8059056e-05,0.0093085915,0.06647549,0.0028915445,-0.021804364,0.012154289,-0.0013208777,-0.005893755,0.029696431,0.02064079,0.034831334,-0.023600314,0.030379398,-0.0035855784,-0.03005056,0.03875207,0.009997883,0.0033104944,-0.002017283,-0.011869719,0.01145235,0.026863381,-0.017795093,0.037816152,-0.0024631089,0.024371814,-0.0117685385,0.004787095,-0.009302268,0.004170527,0.005172845,-0.0007252575,-0.0011058695,0.011483969,-0.0035539595,-0.03159356,0.0012924208,-0.012141641,-0.033996593,0.0005908774,0.016720051,-0.015354116,0.013975535,0.004651134,0.021184634,-0.032251235,0.024978897,-0.015252937,-0.022335561,0.04694768,0.011136161,-0.0038859574,-0.003128686,0.0045689247,-0.011028658,0.01817452,-0.045354087,-0.0205902,0.024827126,-0.051804334,0.008865927,0.0010695078,-0.015202346,0.028634036,-0.012483125,-0.009403448,0.009770227]",
    "embedding_generated_at": null,
    "embedding_model": "text-embedding-3-small"
  }
]
```

### Schema: `leo_subagent_handoffs`

**Row Count**: 11

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| from_agent | text | NO | NULL |
| to_agent | text | YES | NULL |
| sd_id | text | YES | NULL |
| prd_id | text | YES | NULL |
| phase | text | YES | NULL |
| summary | jsonb | NO | NULL |
| critical_flags | ARRAY | YES | NULL |
| warnings | ARRAY | YES | NULL |
| recommendations | ARRAY | YES | NULL |
| confidence_score | double precision | YES | NULL |
| execution_time_ms | integer | YES | NULL |
| created_at | timestamp without time zone | YES | now() |
| expires_at | timestamp without time zone | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_49614_1_not_null | CHECK | - | - |
| 2200_49614_2_not_null | CHECK | - | - |
| 2200_49614_7_not_null | CHECK | - | - |
| leo_subagent_handoffs_confidence_score_check | CHECK | - | leo_subagent_handoffs(confidence_score) |
| leo_subagent_handoffs_prd_id_fkey | FOREIGN KEY | prd_id | product_requirements_v2(id) |
| leo_subagent_handoffs_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| leo_subagent_handoffs_pkey | PRIMARY KEY | id | leo_subagent_handoffs(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_subagent_handoffs | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_subagent_handoffs | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "8490c3b1-8c27-43ab-86f6-4006641a2687",
    "from_agent": "VALIDATION",
    "to_agent": null,
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "phase": "VALIDATION_COMPLETE",
    "summary": {
      "findings": [
        "Found existing implementation with 100% similarity"
      ],
      "metadata": {},
      "totalFindings": 1
    },
    "critical_flags": [
      "DUPLICATE_IMPLEMENTATION_DETECTED"
    ],
    "warnings": [],
    "recommendations": [
      "Check test coverage of existing similar implementation",
      "Review security of existing implementation before enhancing",
      "Review 1 affected dependencies"
    ],
    "confidence_score": 0.9,
    "execution_time_ms": 13957,
    "created_at": "2025-09-23T17:58:47.302Z",
    "expires_at": null
  },
  {
    "id": "fdfceadc-bdc1-4826-b200-d02b3136bb5a",
    "from_agent": "LEAD",
    "to_agent": "PLAN",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": null,
    "phase": "strategic_to_technical",
    "summary": {
      "executive_summary": "Strategic directive for establishing a unified data governance model for all SDs, PRDs, and user stories. This foundational system will provide the structural backbone for the entire LEO protocol workflow.",
      "known_issues_risks": [
        "No existing governance structure - greenfield implementation",
        "Critical dependency for WSJF and Vision alignment systems",
        "Must coordinate with 60+ existing active SDs"
      ],
      "completeness_report": {
        "user_stories": "2 initial stories created focusing on schema implementation and linkage",
        "prds_identified": "2 PRDs created: Strategic Directive Schema and Proposals Management System",
        "strategic_directive": "COMPLETE - SD-GOVERNANCE-001 defined with high priority"
      },
      "resource_utilization": {
        "dependencies": "Supabase infrastructure, LEO protocol v4.2.0",
        "required_skills": "Database design, workflow automation, API development",
        "estimated_effort": "2-3 sprints"
      },
      "action_items_receiver": [
        "Review and enhance PRD technical requirements",
        "Generate comprehensive test scenarios",
        "Create detailed implementation plan",
        "Identify additional user stories needed",
        "Validate against existing SD structures"
      ],
      "deliverables_manifest": [
        "Strategic Directive Schema PRD (c4c8a657-f0d3-4b67-a9b6-503715078e36)",
        "Proposals Management System PRD (a57d5700-c3f3-4b13-8ff9-ba572ea34a74)",
        "SD Table Schema Implementation Story (SD-GOV-001:US-001)",
        "PRD-SD Linkage Story (SD-GOV-001:US-002)"
      ],
      "key_decisions_rationale": {
        "scope": "Complete data model with proposal management workflow",
        "approach": "Database-first implementation to ensure data integrity",
        "priority": "HIGH - Governance is foundational for all other SDs"
      }
    },
    "critical_flags": [
      "FOUNDATIONAL_SYSTEM",
      "HIGH_PRIORITY",
      "BLOCKING_OTHER_SDS"
    ],
    "warnings": [
      "60+ active SDs need migration",
      "No rollback plan defined"
    ],
    "recommendations": [
      "Start with schema implementation first",
      "Implement proposals system in phase 2",
      "Consider phased migration approach for existing SDs"
    ],
    "confidence_score": 0.85,
    "execution_time_ms": 1500,
    "created_at": "2025-09-23T22:34:13.485Z",
    "expires_at": null
  },
  {
    "id": "ff9fcf6a-3f43-414c-874b-bc79e486d261",
    "from_agent": "PLAN",
    "to_agent": "EXEC",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "phase": "technical_to_implementation",
    "summary": {
      "executive_summary": "Strategic Directive Schema PRD is ready for implementation. All technical requirements defined, test scenarios created, and implementation phases planned. This is the foundational component that must be completed first.",
      "known_issues_risks": [
        "Migration of 62 existing SDs requires careful planning",
        "Cascade delete rules need thorough testing",
        "Performance impact of audit triggers needs monitoring"
      ],
      "completeness_report": {
        "user_stories": "COMPLETE - 5 user stories created and linked",
        "test_scenarios": "COMPLETE - 8 test scenarios with priorities",
        "technical_requirements": "COMPLETE - 8 detailed requirements defined",
        "functional_requirements": "COMPLETE - 8 functional requirements specified"
      },
      "resource_utilization": {
        "sprint_1": "Core schema and constraints",
        "sprint_2": "Triggers, functions, and audit trail",
        "sprint_3": "RLS policies and performance optimization"
      },
      "action_items_receiver": [
        "Set up local PostgreSQL 15+ development environment",
        "Create database schema migration files",
        "Implement core tables with constraints",
        "Write unit tests for each database function",
        "Document all schema decisions"
      ],
      "deliverables_manifest": [
        "Database schema creation scripts",
        "Migration scripts for existing data",
        "Audit trail implementation",
        "State machine functions",
        "RLS policies",
        "Automated tests (unit and integration)"
      ],
      "key_decisions_rationale": {
        "testing": "Jest framework with database mocking",
        "database": "PostgreSQL 15+ for JSONB support and performance",
        "security": "Row-level security for multi-tenant isolation",
        "architecture": "Event-driven with triggers for audit trail"
      }
    },
    "critical_flags": [
      "DATABASE_FOUNDATION",
      "PHASE_1_PRIORITY",
      "BLOCKS_ALL_OTHER_WORK"
    ],
    "warnings": [
      "62 SDs need migration",
      "No rollback strategy defined yet"
    ],
    "recommendations": [
      "Start with schema creation before any other work",
      "Test cascade rules extensively",
      "Monitor performance during migration"
    ],
    "confidence_score": 0.92,
    "execution_time_ms": 2500,
    "created_at": "2025-09-23T22:38:04.795Z",
    "expires_at": null
  },
  {
    "id": "19f0e4c1-195b-47e8-ab63-1ad80078c090",
    "from_agent": "PLAN",
    "to_agent": "EXEC",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "phase": "technical_to_implementation",
    "summary": {
      "executive_summary": "Proposals Management System PRD ready for implementation. Depends on Strategic Directive Schema completion. Includes workflow engine, state machine, and notification system.",
      "known_issues_risks": [
        "Complex state machine requires careful testing",
        "Notification delivery reliability needs monitoring",
        "Concurrent approval handling needs race condition prevention"
      ],
      "completeness_report": {
        "user_stories": "COMPLETE - 5 user stories created",
        "test_scenarios": "COMPLETE - 9 test scenarios defined",
        "technical_requirements": "COMPLETE - 8 technical requirements defined",
        "functional_requirements": "COMPLETE - 9 functional requirements specified"
      },
      "resource_utilization": {
        "sprint_4": "Core proposal tables and state machine",
        "sprint_5": "Workflow engine and notifications",
        "sprint_6": "Bulk operations and optimization"
      },
      "action_items_receiver": [
        "Wait for Schema PRD completion first",
        "Design state machine transitions",
        "Implement workflow validation rules",
        "Set up notification infrastructure",
        "Create comprehensive workflow tests"
      ],
      "deliverables_manifest": [
        "Proposal tables and state machine",
        "Workflow engine implementation",
        "Notification system integration",
        "Stale detection cron job",
        "Bulk operations API",
        "E2E workflow tests"
      ],
      "key_decisions_rationale": {
        "async": "Bull queue for background processing",
        "workflow": "Database-driven state machine for reliability",
        "performance": "Redis caching for frequently accessed proposals",
        "notifications": "Supabase Realtime for instant updates"
      }
    },
    "critical_flags": [
      "DEPENDS_ON_SCHEMA",
      "COMPLEX_WORKFLOW",
      "PHASE_2_PRIORITY"
    ],
    "warnings": [
      "Requires Schema PRD completion first",
      "State machine complexity high"
    ],
    "recommendations": [
      "Do not start until Schema PRD is complete",
      "Focus on state machine correctness over performance initially",
      "Use database transactions for all state changes"
    ],
    "confidence_score": 0.88,
    "execution_time_ms": 2200,
    "created_at": "2025-09-23T22:38:04.795Z",
    "expires_at": null
  },
  {
    "id": "5ea38d28-0286-4cf8-ae59-e32fba97a0e1",
    "from_agent": "EXEC",
    "to_agent": "PLAN",
    "sd_id": "SD-GOVERNANCE-001",
    "prd_id": "c4c8a657-f0d3-4b67-a9b6-503715078e36",
    "phase": "implementation_to_verification",
    "summary": {
      "executive_summary": "Strategic Directive Schema implementation completed successfully. All core tables, triggers, and audit mechanisms are in place and operational.",
      "known_issues_risks": [
        "Materialized view requires periodic refresh",
        "Audit log will grow - needs retention policy",
        "No UI implementation yet - database only"
      ],
      "completeness_report": {
        "tests_written": "7 test suites covering all functionality",
        "tables_created": "3 tables (user_stories, sd_state_transitions, governance_audit_log)",
        "stories_migrated": "10 governance user stories migrated to new table",
        "migrations_executed": "2 migration files successfully applied",
        "triggers_implemented": "21 triggers for audit, versioning, and validation"
      },
      "resource_utilization": {
        "time_spent": "Implementation completed in single session",
        "test_coverage": "Core functionality covered, performance tests included",
        "database_objects": "3 tables, 21 triggers, 5 functions, 1 materialized view"
      },
      "action_items_receiver": [
        "Run test suite to verify all functionality",
        "Review audit logs for proper capture",
        "Validate materialized view performance",
        "Plan Phase 2: Proposals Management System",
        "Consider UI implementation requirements"
      ],
      "deliverables_manifest": [
        "database/migrations/2025-09-23-governance-schema.sql",
        "database/migrations/2025-09-23-migrate-stories.sql",
        "tests/governance-schema.test.js",
        "User stories table with full CRUD operations",
        "Audit trail system capturing all changes",
        "State machine for SD lifecycle management",
        "Materialized view for performance optimization",
        "Version control triggers",
        "Hierarchy validation functions"
      ],
      "key_decisions_rationale": {
        "performance": "Materialized view for summary queries",
        "story_format": "Enforced story key pattern for consistency",
        "state_machine": "Database-enforced transitions for consistency",
        "audit_strategy": "Trigger-based audit for complete capture without application changes"
      }
    },
    "critical_flags": [
      "IMPLEMENTATION_COMPLETE",
      "READY_FOR_VERIFICATION",
      "PHASE_1_DONE"
    ],
    "warnings": [
      "Materialized view needs refresh strategy",
      "No rollback script created"
    ],
    "recommendations": [
      "Set up automated materialized view refresh",
      "Create audit log retention policy",
      "Begin Phase 2 planning for Proposals System"
    ],
    "confidence_score": 0.95,
    "execution_time_ms": 15000,
    "created_at": "2025-09-23T22:42:12.072Z",
    "expires_at": null
  }
]
```

### Schema: `leo_test_plans`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| coverage_target | numeric | NO | NULL |
| matrices | jsonb | NO | '{}'::jsonb |
| test_scenarios | jsonb | NO | '[]'::jsonb |
| regression_suite | jsonb | YES | '[]'::jsonb |
| smoke_tests | jsonb | YES | '[]'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40117_1_not_null | CHECK | - | - |
| 2200_40117_2_not_null | CHECK | - | - |
| 2200_40117_3_not_null | CHECK | - | - |
| 2200_40117_4_not_null | CHECK | - | - |
| 2200_40117_5_not_null | CHECK | - | - |
| leo_test_plans_coverage_target_check | CHECK | - | leo_test_plans(coverage_target) |
| valid_matrices | CHECK | - | leo_test_plans(matrices) |
| valid_test_scenarios | CHECK | - | leo_test_plans(test_scenarios) |
| leo_test_plans_pkey | PRIMARY KEY | id | leo_test_plans(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_test_plans | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_test_plans | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 1 rows)

```json
[
  {
    "id": "62461241-1ac5-41dd-b010-e4f67a84600b",
    "prd_id": "PRD-KNOWLEDGE-001",
    "coverage_target": "100.00",
    "matrices": {
      "e2e": {
        "files": [
          "tests/e2e/knowledge-retrieval-flow.spec.ts",
          "tests/e2e/context7-failure-scenarios.spec.ts"
        ],
        "required": true,
        "test_count": 9,
        "target_coverage": 100,
        "execution_time_target_seconds": 30
      },
      "a11y": {
        "note": "No UI components - accessibility testing not applicable",
        "required": false,
        "target_coverage": 0
      },
      "perf": {
        "required": true,
        "benchmarks": [
          {
            "name": "Local retrospective query",
            "target": "<2 seconds"
          },
          {
            "name": "Context7 query",
            "target": "<10 seconds"
          },
          {
            "name": "Full PRD enrichment",
            "target": "<30 seconds"
          }
        ]
      },
      "unit": {
        "files": [
          "tests/unit/automated-knowledge-retrieval.test.js",
          "tests/unit/circuit-breaker.test.js",
          "tests/unit/prd-enrichment.test.js"
        ],
        "required": true,
        "test_count": 20,
        "target_coverage": 100,
        "execution_time_target_seconds": 5
      },
      "security": {
        "checks": [
          "Token budget enforcement (5k/query, 15k/PRD hard caps)",
          "Circuit breaker protects against external API overload",
          "No sensitive data in cache (tech_stack_references)",
          "Audit logging for all operations (prd_research_audit_log)"
        ],
        "required": true
      },
      "integration": {
        "note": "Integration tests recommended but not mandatory for this infrastructure component",
        "files": [],
        "required": false,
        "test_count": 0,
        "target_coverage": 0
      }
    },
    "test_scenarios": [
      {
        "id": "US-KR-001",
        "status": "pending",
        "expected": "Returns top 5 matches in <2s, consumes ≤500 tokens",
        "priority": "MUST",
        "scenario": "Query retrospectives for \"OAuth\" tech stack",
        "test_type": "e2e",
        "user_story": "Retrospective Semantic Search"
      },
      {
        "id": "US-KR-002",
        "status": "pending",
        "expected": "Context7 query executes, results merged, 10s timeout enforced",
        "priority": "MUST",
        "scenario": "Local results <3, trigger Context7 fallback",
        "test_type": "e2e",
        "user_story": "Context7 Live Documentation"
      },
      {
        "id": "US-KR-003",
        "status": "pending",
        "expected": "implementation_context populated automatically, audit logged",
        "priority": "MUST",
        "scenario": "Enrich PRD with research results (confidence >0.85)",
        "test_type": "e2e",
        "user_story": "PRD Auto-Enrichment"
      },
      {
        "id": "US-KR-004",
        "status": "pending",
        "expected": "Circuit breaker opens, subsequent queries skip Context7",
        "priority": "MUST",
        "scenario": "Context7 fails 3 times consecutively",
        "test_type": "e2e",
        "user_story": "Circuit Breaker Resilience"
      },
      {
        "id": "US-KR-005",
        "status": "pending",
        "expected": "Audit log contains query type, tokens, execution time, confidence, circuit state",
        "priority": "SHOULD",
        "scenario": "All research operations logged",
        "test_type": "e2e",
        "user_story": "Research Telemetry"
      },
      {
        "id": "SCENARIO-006",
        "status": "pending",
        "expected": "Auto-recovers to half-open state, tests service",
        "priority": "MUST",
        "scenario": "Circuit breaker open for 1 hour",
        "test_type": "e2e",
        "user_story": "Circuit Breaker Auto-Recovery"
      },
      {
        "id": "SCENARIO-007",
        "status": "pending",
        "expected": "Query truncated, hard cap enforced, warning logged",
        "priority": "MUST",
        "scenario": "Token usage exceeds 15k limit",
        "test_type": "e2e",
        "user_story": "Token Budget Enforcement"
      },
      {
        "id": "SCENARIO-008",
        "status": "pending",
        "expected": "Cached results returned, no new query executed",
        "priority": "SHOULD",
        "scenario": "Cache hit within 24 hours",
        "test_type": "e2e",
        "user_story": "Cache TTL"
      },
      {
        "id": "SCENARIO-009",
        "status": "pending",
        "expected": "Continues with local-only mode at 60-70% effectiveness",
        "priority": "MUST",
        "scenario": "System operates with Context7 down (circuit open)",
        "test_type": "e2e",
        "user_story": "Graceful Degradation"
      }
    ],
    "regression_suite": [
      {
        "test": "Verify retrospectives table query performance",
        "baseline": "1.5 seconds avg",
        "frequency": "every PR",
        "threshold": "<2 seconds"
      },
      {
        "test": "Verify token counting accuracy",
        "baseline": "±5% variance",
        "frequency": "every PR",
        "threshold": "±10% variance"
      },
      {
        "test": "Verify circuit breaker state persistence",
        "baseline": "100% accuracy",
        "frequency": "every PR",
        "threshold": "100% accuracy"
      }
    ],
    "smoke_tests": [
      {
        "test": "Can query retrospectives table",
        "expected": "Returns results without error",
        "execution_time": "<1 second"
      },
      {
        "test": "tech_stack_references table exists and writable",
        "expected": "Can INSERT and SELECT",
        "execution_time": "<1 second"
      },
      {
        "test": "prd_research_audit_log table exists and writable",
        "expected": "Can INSERT and SELECT",
        "execution_time": "<1 second"
      },
      {
        "test": "system_health table has context7 entry",
        "expected": "Entry exists with state \"closed\"",
        "execution_time": "<1 second"
      },
      {
        "test": "user_stories.implementation_context column exists",
        "expected": "Column queryable, accepts JSONB",
        "execution_time": "<1 second"
      }
    ],
    "created_at": "2025-10-16T00:12:36.893Z",
    "updated_at": "2025-10-16T00:12:36.893Z"
  }
]
```

### Schema: `leo_validation_rules`

**Row Count**: 11

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| gate | text | NO | NULL |
| rule_name | text | NO | NULL |
| weight | numeric | NO | NULL |
| criteria | jsonb | NO | '{}'::jsonb |
| required | boolean | YES | false |
| active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40025_1_not_null | CHECK | - | - |
| 2200_40025_2_not_null | CHECK | - | - |
| 2200_40025_3_not_null | CHECK | - | - |
| 2200_40025_4_not_null | CHECK | - | - |
| 2200_40025_5_not_null | CHECK | - | - |
| leo_validation_rules_gate_check | CHECK | - | leo_validation_rules(gate) |
| leo_validation_rules_weight_check | CHECK | - | leo_validation_rules(weight) |
| leo_validation_rules_pkey | PRIMARY KEY | id | leo_validation_rules(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_validation_rules | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_validation_rules | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "4e0835db-8c16-4957-9664-a56385ea493b",
    "gate": "2A",
    "rule_name": "hasADR",
    "weight": "0.350",
    "criteria": {},
    "required": true,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z"
  },
  {
    "id": "476a2a1f-d5ba-415e-a710-31bd9f46e0db",
    "gate": "2A",
    "rule_name": "hasInterfaces",
    "weight": "0.350",
    "criteria": {},
    "required": true,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z"
  },
  {
    "id": "599f8a46-5cfb-4e1c-bad6-8e02d2139dc3",
    "gate": "2A",
    "rule_name": "hasTechDesign",
    "weight": "0.300",
    "criteria": {},
    "required": true,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z"
  },
  {
    "id": "fadd728d-2f58-415c-b534-ec63bd03849b",
    "gate": "2B",
    "rule_name": "designArtifacts",
    "weight": "0.500",
    "criteria": {},
    "required": true,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z"
  },
  {
    "id": "bf485443-a8a2-4a65-b782-70730b708ed9",
    "gate": "2B",
    "rule_name": "dbSchemaReady",
    "weight": "0.500",
    "criteria": {},
    "required": true,
    "active": true,
    "created_at": "2025-09-17T01:59:20.277Z"
  }
]
```

### Schema: `leo_workflow_phases`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('leo_workflow_phases_id_seq'::regclass) |
| protocol_id | character varying(50) | YES | NULL |
| phase_name | character varying(100) | NO | NULL |
| phase_order | integer | NO | NULL |
| responsible_agent | character varying(10) | YES | NULL |
| percentage_weight | integer | YES | NULL |
| required_inputs | jsonb | YES | '[]'::jsonb |
| required_outputs | jsonb | YES | '[]'::jsonb |
| validation_gates | jsonb | YES | '[]'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_23319_1_not_null | CHECK | - | - |
| 2200_23319_3_not_null | CHECK | - | - |
| 2200_23319_4_not_null | CHECK | - | - |
| leo_workflow_phases_protocol_id_fkey | FOREIGN KEY | protocol_id | leo_protocols(id) |
| leo_workflow_phases_responsible_agent_fkey | FOREIGN KEY | responsible_agent | leo_agents(agent_code) |
| leo_workflow_phases_pkey | PRIMARY KEY | id | leo_workflow_phases(id) |
| leo_workflow_phases_protocol_id_phase_order_key | UNIQUE | phase_order | leo_workflow_phases(protocol_id) |
| leo_workflow_phases_protocol_id_phase_order_key | UNIQUE | phase_order | leo_workflow_phases(phase_order) |
| leo_workflow_phases_protocol_id_phase_order_key | UNIQUE | protocol_id | leo_workflow_phases(protocol_id) |
| leo_workflow_phases_protocol_id_phase_order_key | UNIQUE | protocol_id | leo_workflow_phases(phase_order) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_leo_workflow_phases | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_leo_workflow_phases | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `plan_sub_agent_executions`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| validation_id | uuid | NO | NULL |
| sd_id | text | NO | NULL |
| sub_agent_type | text | NO | NULL |
| execution_status | text | NO | NULL |
| severity | text | NO | NULL |
| summary | text | NO | NULL |
| details | jsonb | YES | '{}'::jsonb |
| recommendations | ARRAY | YES | NULL |
| execution_time_ms | integer | YES | 0 |
| executed_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_50781_1_not_null | CHECK | - | - |
| 2200_50781_2_not_null | CHECK | - | - |
| 2200_50781_3_not_null | CHECK | - | - |
| 2200_50781_4_not_null | CHECK | - | - |
| 2200_50781_5_not_null | CHECK | - | - |
| 2200_50781_6_not_null | CHECK | - | - |
| 2200_50781_7_not_null | CHECK | - | - |
| plan_sub_agent_executions_execution_status_check | CHECK | - | plan_sub_agent_executions(execution_status) |
| plan_sub_agent_executions_severity_check | CHECK | - | plan_sub_agent_executions(severity) |
| plan_sub_agent_executions_sub_agent_type_check | CHECK | - | plan_sub_agent_executions(sub_agent_type) |
| plan_sub_agent_executions_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| plan_sub_agent_executions_validation_id_fkey | FOREIGN KEY | validation_id | plan_technical_validations(id) |
| plan_sub_agent_executions_pkey | PRIMARY KEY | id | plan_sub_agent_executions(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| plan_subagent_executions_all | ALL | "{service_role}" | PERMISSIVE |
| plan_subagent_executions_select | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `plan_subagent_queries`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | integer | NO | nextval('plan_subagent_queries_id_seq'::regclass) |
| session_id | uuid | NO | NULL |
| sub_agent_code | character varying(20) | NO | NULL |
| query_type | character varying(50) | NO | 'verification_check'::character varying |
| request_payload | jsonb | YES | NULL |
| response_payload | jsonb | YES | NULL |
| status | character varying(20) | YES | NULL |
| confidence | integer | YES | NULL |
| requested_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| responded_at | timestamp without time zone | YES | NULL |
| response_time_ms | integer | YES | NULL |
| timeout_ms | integer | YES | 5000 |
| retry_count | integer | YES | 0 |
| max_retries | integer | YES | 3 |
| circuit_breaker_status | character varying(20) | YES | 'closed'::character varying |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_24968_1_not_null | CHECK | - | - |
| 2200_24968_2_not_null | CHECK | - | - |
| 2200_24968_3_not_null | CHECK | - | - |
| 2200_24968_4_not_null | CHECK | - | - |
| plan_subagent_queries_confidence_check | CHECK | - | plan_subagent_queries(confidence) |
| plan_subagent_queries_status_check | CHECK | - | plan_subagent_queries(status) |
| plan_subagent_queries_pkey | PRIMARY KEY | id | plan_subagent_queries(id) |
| plan_subagent_queries_session_id_sub_agent_code_key | UNIQUE | sub_agent_code | plan_subagent_queries(sub_agent_code) |
| plan_subagent_queries_session_id_sub_agent_code_key | UNIQUE | sub_agent_code | plan_subagent_queries(session_id) |
| plan_subagent_queries_session_id_sub_agent_code_key | UNIQUE | session_id | plan_subagent_queries(sub_agent_code) |
| plan_subagent_queries_session_id_sub_agent_code_key | UNIQUE | session_id | plan_subagent_queries(session_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_plan_subagent_queries | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_plan_subagent_queries | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `sub_agent_execution_batches`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| strategic_directive_id | text | NO | NULL |
| prd_id | text | YES | NULL |
| batch_mode | text | NO | NULL |
| total_agents | integer | NO | NULL |
| completed_agents | integer | YES | 0 |
| failed_agents | integer | YES | 0 |
| status | text | NO | NULL |
| aggregated_results | jsonb | YES | '{}'::jsonb |
| confidence_score | integer | YES | NULL |
| final_verdict | text | YES | NULL |
| started_at | timestamp with time zone | YES | NULL |
| completed_at | timestamp with time zone | YES | NULL |
| duration_ms | integer | YES | NULL |
| performance_metrics | jsonb | YES | '{}'::jsonb |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_61188_1_not_null | CHECK | - | - |
| 2200_61188_2_not_null | CHECK | - | - |
| 2200_61188_4_not_null | CHECK | - | - |
| 2200_61188_5_not_null | CHECK | - | - |
| 2200_61188_8_not_null | CHECK | - | - |
| sub_agent_execution_batches_pkey | PRIMARY KEY | id | sub_agent_execution_batches(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_sub_agent_execution_batches | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_sub_agent_execution_batches | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 1 rows)

```json
[
  {
    "id": "11e614f6-6d3c-4fd8-8835-dfac2b165fca",
    "strategic_directive_id": "SD-TEST-001",
    "prd_id": "PRD-TEST-001",
    "batch_mode": "parallel",
    "total_agents": 5,
    "completed_agents": 5,
    "failed_agents": 0,
    "status": "completed",
    "aggregated_results": {},
    "confidence_score": null,
    "final_verdict": null,
    "started_at": "2025-09-29T23:37:19.006Z",
    "completed_at": "2025-09-29T23:37:20.822Z",
    "duration_ms": 1816,
    "performance_metrics": {
      "totalDuration": 0,
      "totalExecutions": 0,
      "circuitOpenCount": 0,
      "failedExecutions": 0,
      "timeoutExecutions": 0,
      "successfulExecutions": 5
    },
    "metadata": {
      "context": {
        "sdId": "SD-TEST-001",
        "prdId": "PRD-TEST-001"
      },
      "agentCodes": [
        "DATABASE",
        "SECURITY",
        "TESTING",
        "PERFORMANCE",
        "DESIGN"
      ]
    },
    "created_at": "2025-09-29T23:37:19.338Z",
    "updated_at": "2025-09-29T23:37:19.338Z"
  }
]
```

### Schema: `sub_agent_execution_results`

**Row Count**: 1514

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | NO | NULL |
| sub_agent_code | text | NO | NULL |
| sub_agent_name | text | NO | NULL |
| verdict | text | NO | NULL |
| confidence | integer | NO | NULL |
| critical_issues | jsonb | YES | '[]'::jsonb |
| warnings | jsonb | YES | '[]'::jsonb |
| recommendations | jsonb | YES | '[]'::jsonb |
| detailed_analysis | text | YES | NULL |
| execution_time | integer | YES | 0 |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| risk_assessment_id | uuid | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78970_1_not_null | CHECK | - | - |
| 2200_78970_2_not_null | CHECK | - | - |
| 2200_78970_3_not_null | CHECK | - | - |
| 2200_78970_4_not_null | CHECK | - | - |
| 2200_78970_5_not_null | CHECK | - | - |
| 2200_78970_6_not_null | CHECK | - | - |
| valid_confidence | CHECK | - | sub_agent_execution_results(confidence) |
| valid_execution_time | CHECK | - | sub_agent_execution_results(execution_time) |
| valid_verdict | CHECK | - | sub_agent_execution_results(verdict) |
| sub_agent_execution_results_risk_assessment_id_fkey | FOREIGN KEY | risk_assessment_id | risk_assessments(id) |
| sub_agent_execution_results_pkey | PRIMARY KEY | id | sub_agent_execution_results(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Allow insert to service role | INSERT | "{public}" | PERMISSIVE |
| Allow read access to all users | SELECT | "{public}" | PERMISSIVE |
| Allow update to service role | UPDATE | "{public}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "d1da4a7e-b1b6-4c4b-8881-8eceac8264c1",
    "sd_id": "SD-AGENT-ADMIN-003",
    "sub_agent_code": "DATABASE",
    "sub_agent_name": "Principal Database Architect",
    "verdict": "CONDITIONAL_PASS",
    "confidence": 95,
    "critical_issues": [],
    "warnings": [
      {
        "issue": "Seed data must be validated",
        "location": "existing tables (agent_departments, agent_tools, etc.)",
        "severity": "HIGH",
        "recommendation": "Create validation script and run after seeding"
      },
      {
        "issue": "RLS policies need anon access",
        "location": "ai_ceo_agents, agent_departments, crew_members",
        "severity": "MEDIUM",
        "recommendation": "Add anon SELECT policies for public access"
      }
    ],
    "recommendations": [
      "Fix seed data with validation (2-3 hours)",
      "Update RLS policies (1 hour)",
      "Create 6 new tables with proper indexes",
      "Use transaction wrappers for all operations",
      "Test with both anon and authenticated contexts"
    ],
    "detailed_analysis": "{\n  \"sd_id\": \"SD-AGENT-ADMIN-003\",\n  \"assessment\": \"Comprehensive schema for AI Agent Management Platform (57 items)\",\n  \"analysis_date\": \"2025-10-10T16:43:00.224Z\",\n  \"root_cause_analysis\": {\n    \"problem\": \"Migration 20251008000000_agent_platform_schema.sql created tables but seed data failed silently\",\n    \"impact\": \"All agent tables empty: ai_ceo_agents (0), crewai_agents (0), agent_departments (0)\",\n    \"evidence\": \"AGENT_DATA_INVESTIGATION_REPORT.md (489 lines)\",\n    \"lesson_learned\": \"Need robust seed data validation and error handling\"\n  },\n  \"existing_tables_status\": {\n    \"agent_configs\": {\n      \"status\": \"✅ EXISTS and FUNCTIONAL\",\n      \"usage\": \"Preset management (AgentSettingsTab, AgentPresetsTab)\",\n      \"schema\": \"id, user_id, preset_name, description, config_json, category, created_at, updated_at, deleted_at\",\n      \"verdict\": \"LEVERAGE EXISTING - Already working for presets\",\n      \"modifications_needed\": \"NONE - Current schema sufficient\"\n    },\n    \"ai_ceo_agents\": {\n      \"status\": \"⚠️ EXISTS but EMPTY (0 records)\",\n      \"issue\": \"Seed data failed in SD-AGENT-ADMIN-002\",\n      \"schema\": \"id, agent_key, name, role, capabilities, status, created_at\",\n      \"verdict\": \"REQUIRES SEED DATA - Fix with validation script\"\n    },\n    \"crewai_agents\": {\n      \"status\": \"⚠️ EXISTS but EMPTY (0 records)\",\n      \"issue\": \"Seed data failed in SD-AGENT-ADMIN-002\",\n      \"schema\": \"id, agent_key, name, role, goal, backstory, department_id, tools, status\",\n      \"verdict\": \"REQUIRES SEED DATA - 4 research agents + 11 departments + 8 tools\"\n    },\n    \"agent_departments\": {\n      \"status\": \"⚠️ EXISTS but EMPTY (0 records)\",\n      \"issue\": \"Seed data failed in SD-AGENT-ADMIN-002\",\n      \"schema\": \"id, department_name, description, status, created_at\",\n      \"verdict\": \"REQUIRES SEED DATA - 11 departments (R&D, Marketing, Sales, etc.)\"\n    },\n    \"crewai_crews\": {\n      \"status\": \"⚠️ EXISTS but EMPTY (0 records)\",\n      \"issue\": \"Seed data failed in SD-AGENT-ADMIN-002\",\n      \"schema\": \"id, crew_name, crew_type, description, status, created_at\",\n      \"verdict\": \"REQUIRES SEED DATA - Quick Research Crew with 4 agents\"\n    },\n    \"crew_members\": {\n      \"status\": \"⚠️ EXISTS but EMPTY (0 records)\",\n      \"issue\": \"Seed data failed in SD-AGENT-ADMIN-002\",\n      \"schema\": \"id, crew_id, agent_id, role_in_crew, sequence_order, created_at\",\n      \"verdict\": \"REQUIRES SEED DATA - 4 crew member records\"\n    },\n    \"agent_tools\": {\n      \"status\": \"⚠️ EXISTS but EMPTY (0 records)\",\n      \"issue\": \"Seed data failed in SD-AGENT-ADMIN-002\",\n      \"schema\": \"id, tool_name, tool_type, description, configuration, rate_limit_per_minute, status\",\n      \"verdict\": \"REQUIRES SEED DATA - 8 tools (search_openvc, search_growjo, etc.)\"\n    }\n  },\n  \"new_tables_required\": [\n    {\n      \"name\": \"prompt_templates\",\n      \"purpose\": \"Prompt Library with versioning (18 backlog items)\",\n      \"priority\": \"CRITICAL\",\n      \"estimated_rows\": \"100-500 prompts\",\n      \"schema\": \"\\nCREATE TABLE prompt_templates (\\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\\n  name TEXT NOT NULL,\\n  description TEXT,\\n  content TEXT NOT NULL,\\n  variables JSONB DEFAULT '{}',\\n  category TEXT CHECK (category IN ('system', 'user', 'assistant', 'function', 'custom')),\\n  tags TEXT[] DEFAULT ARRAY[]::TEXT[],\\n  agent_roles TEXT[] DEFAULT ARRAY[]::TEXT[],\\n  created_by UUID,\\n  created_at TIMESTAMPTZ DEFAULT NOW(),\\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\\n  version INTEGER DEFAULT 1,\\n  parent_version_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,\\n  status TEXT CHECK (status IN ('draft', 'active', 'archived', 'testing')) DEFAULT 'draft',\\n  usage_count INTEGER DEFAULT 0,\\n  avg_token_count INTEGER,\\n  metadata JSONB DEFAULT '{}'\\n);\\n\\nCREATE INDEX idx_prompt_templates_category ON prompt_templates(category);\\nCREATE INDEX idx_prompt_templates_status ON prompt_templates(status);\\nCREATE INDEX idx_prompt_templates_tags ON prompt_templates USING GIN(tags);\\nCREATE INDEX idx_prompt_templates_created_at ON prompt_templates(created_at DESC);\\nCREATE INDEX idx_prompt_templates_usage_count ON prompt_templates(usage_count DESC);\\n      \",\n      \"rls_policies\": [\n        \"Allow anon users to SELECT active prompts\",\n        \"Allow authenticated users to INSERT/UPDATE own prompts\",\n        \"Allow admins full access\"\n      ]\n    },\n    {\n      \"name\": \"prompt_ab_tests\",\n      \"purpose\": \"A/B testing with statistical confidence (18 backlog items)\",\n      \"priority\": \"CRITICAL\",\n      \"estimated_rows\": \"50-200 active tests\",\n      \"schema\": \"\\nCREATE TABLE prompt_ab_tests (\\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\\n  name TEXT NOT NULL,\\n  description TEXT,\\n  prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE CASCADE,\\n  variant_a_content TEXT NOT NULL,\\n  variant_b_content TEXT NOT NULL,\\n  variant_c_content TEXT,\\n  variant_d_content TEXT,\\n  traffic_split JSONB DEFAULT '{\\\"a\\\": 50, \\\"b\\\": 50}'::jsonb,\\n  success_metric TEXT CHECK (success_metric IN ('response_quality', 'user_satisfaction', 'task_completion', 'token_efficiency')) DEFAULT 'response_quality',\\n  sample_size INTEGER DEFAULT 100,\\n  confidence_level DECIMAL(3,2) DEFAULT 0.95,\\n  metrics JSONB DEFAULT '{}'::jsonb,\\n  results JSONB DEFAULT '{}'::jsonb,\\n  status TEXT CHECK (status IN ('draft', 'running', 'completed', 'stopped', 'invalid')) DEFAULT 'draft',\\n  winner TEXT CHECK (winner IN ('a', 'b', 'c', 'd', 'inconclusive')),\\n  statistical_significance DECIMAL(5,4),\\n  started_at TIMESTAMPTZ,\\n  completed_at TIMESTAMPTZ,\\n  created_by UUID,\\n  created_at TIMESTAMPTZ DEFAULT NOW(),\\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\\n  metadata JSONB DEFAULT '{}'\\n);\\n\\nCREATE INDEX idx_ab_tests_status ON prompt_ab_tests(status);\\nCREATE INDEX idx_ab_tests_prompt_id ON prompt_ab_tests(prompt_template_id);\\nCREATE INDEX idx_ab_tests_started_at ON prompt_ab_tests(started_at DESC);\\n      \",\n      \"rls_policies\": [\n        \"Allow anon users to SELECT running tests\",\n        \"Allow authenticated users to INSERT/UPDATE own tests\",\n        \"Allow admins full access\"\n      ]\n    },\n    {\n      \"name\": \"ab_test_results\",\n      \"purpose\": \"Individual A/B test execution results\",\n      \"priority\": \"CRITICAL\",\n      \"estimated_rows\": \"10,000-100,000 per test\",\n      \"schema\": \"\\nCREATE TABLE ab_test_results (\\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\\n  test_id UUID REFERENCES prompt_ab_tests(id) ON DELETE CASCADE,\\n  variant TEXT CHECK (variant IN ('a', 'b', 'c', 'd')) NOT NULL,\\n  execution_id UUID,\\n  outcome JSONB NOT NULL,\\n  score DECIMAL(5,2),\\n  latency_ms INTEGER,\\n  token_count INTEGER,\\n  created_at TIMESTAMPTZ DEFAULT NOW()\\n);\\n\\nCREATE INDEX idx_ab_results_test_id ON ab_test_results(test_id);\\nCREATE INDEX idx_ab_results_variant ON ab_test_results(variant);\\nCREATE INDEX idx_ab_results_created_at ON ab_test_results(created_at DESC);\\n      \",\n      \"rls_policies\": [\n        \"Allow anon users to SELECT results for running tests\",\n        \"Admins: Full access\"\n      ]\n    },\n    {\n      \"name\": \"search_preferences\",\n      \"purpose\": \"Search Preference Engine (10 backlog items)\",\n      \"priority\": \"MEDIUM\",\n      \"estimated_rows\": \"100-500 profiles\",\n      \"schema\": \"\\nCREATE TABLE search_preferences (\\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\\n  name TEXT NOT NULL,\\n  description TEXT,\\n  user_id UUID,\\n  agent_key TEXT,\\n  default_engine TEXT CHECK (default_engine IN ('google', 'bing', 'duckduckgo', 'custom')) DEFAULT 'google',\\n  results_per_page INTEGER CHECK (results_per_page BETWEEN 10 AND 100) DEFAULT 25,\\n  safe_search BOOLEAN DEFAULT true,\\n  region TEXT DEFAULT 'US',\\n  language TEXT DEFAULT 'en',\\n  custom_endpoint TEXT,\\n  filter_config JSONB DEFAULT '{}'::jsonb,\\n  timeout_seconds INTEGER DEFAULT 30,\\n  cache_enabled BOOLEAN DEFAULT true,\\n  cache_ttl_minutes INTEGER DEFAULT 60,\\n  is_default BOOLEAN DEFAULT false,\\n  is_locked BOOLEAN DEFAULT false,\\n  usage_count INTEGER DEFAULT 0,\\n  created_at TIMESTAMPTZ DEFAULT NOW(),\\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\\n  metadata JSONB DEFAULT '{}'\\n);\\n\\nCREATE INDEX idx_search_prefs_user_id ON search_preferences(user_id);\\nCREATE INDEX idx_search_prefs_agent_key ON search_preferences(agent_key);\\nCREATE INDEX idx_search_prefs_is_default ON search_preferences(is_default);\\n      \",\n      \"rls_policies\": [\n        \"Users: Own profiles only\",\n        \"Admins: All profiles + can lock defaults\",\n        \"Anon: Read-only access to default profiles\"\n      ]\n    },\n    {\n      \"name\": \"agent_executions\",\n      \"purpose\": \"Performance Dashboard data (10 backlog items)\",\n      \"priority\": \"HIGH\",\n      \"estimated_rows\": \"10,000-100,000 per month\",\n      \"schema\": \"\\nCREATE TABLE agent_executions (\\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\\n  agent_key TEXT NOT NULL,\\n  agent_type TEXT CHECK (agent_type IN ('ai_ceo', 'crewai', 'research', 'custom')),\\n  department TEXT,\\n  user_id UUID,\\n  execution_type TEXT CHECK (execution_type IN ('prompt', 'workflow', 'research', 'analysis')),\\n  started_at TIMESTAMPTZ NOT NULL,\\n  completed_at TIMESTAMPTZ,\\n  duration_ms INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) STORED,\\n  token_count INTEGER,\\n  cost_usd DECIMAL(10, 4),\\n  status TEXT CHECK (status IN ('success', 'error', 'timeout', 'cancelled')) DEFAULT 'success',\\n  error_message TEXT,\\n  error_type TEXT,\\n  quality_score DECIMAL(3,2),\\n  input_params JSONB DEFAULT '{}'::jsonb,\\n  output_summary TEXT,\\n  metadata JSONB DEFAULT '{}'::jsonb,\\n  created_at TIMESTAMPTZ DEFAULT NOW()\\n);\\n\\nCREATE INDEX idx_agent_exec_agent_key ON agent_executions(agent_key);\\nCREATE INDEX idx_agent_exec_started_at ON agent_executions(started_at DESC);\\nCREATE INDEX idx_agent_exec_status ON agent_executions(status);\\nCREATE INDEX idx_agent_exec_user_id ON agent_executions(user_id);\\nCREATE INDEX idx_agent_exec_department ON agent_executions(department);\\n\\n-- Performance: BRIN index for time-series queries\\nCREATE INDEX idx_agent_exec_created_at_brin ON agent_executions USING BRIN(created_at);\\n      \",\n      \"rls_policies\": [\n        \"Users: Own executions only\",\n        \"Admins: All executions\",\n        \"Anon: Aggregate statistics only\"\n      ],\n      \"partitioning_strategy\": \"PARTITION BY RANGE (started_at) - monthly partitions for >1M rows\"\n    },\n    {\n      \"name\": \"performance_alerts\",\n      \"purpose\": \"Alert configurations for Performance Dashboard\",\n      \"priority\": \"HIGH\",\n      \"estimated_rows\": \"10-50 alerts\",\n      \"schema\": \"\\nCREATE TABLE performance_alerts (\\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\\n  name TEXT NOT NULL,\\n  description TEXT,\\n  alert_type TEXT CHECK (alert_type IN ('latency', 'error_rate', 'cost', 'quality', 'usage')) NOT NULL,\\n  condition JSONB NOT NULL,\\n  threshold_value DECIMAL(10,2) NOT NULL,\\n  comparison TEXT CHECK (comparison IN ('>', '<', '>=', '<=', '=')) DEFAULT '>',\\n  time_window_minutes INTEGER DEFAULT 60,\\n  notification_channels JSONB DEFAULT '{\\\"email\\\": true, \\\"dashboard\\\": true}'::jsonb,\\n  enabled BOOLEAN DEFAULT true,\\n  last_triggered TIMESTAMPTZ,\\n  trigger_count INTEGER DEFAULT 0,\\n  created_by UUID,\\n  created_at TIMESTAMPTZ DEFAULT NOW(),\\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\\n  metadata JSONB DEFAULT '{}'\\n);\\n\\nCREATE INDEX idx_perf_alerts_enabled ON performance_alerts(enabled);\\nCREATE INDEX idx_perf_alerts_alert_type ON performance_alerts(alert_type);\\n      \",\n      \"rls_policies\": [\n        \"Admins: Full access\",\n        \"Users: Read-only access to own alerts\"\n      ]\n    }\n  ],\n  \"seed_data_plan\": {\n    \"priority\": \"CRITICAL\",\n    \"purpose\": \"Fix SD-AGENT-ADMIN-002 empty tables issue\",\n    \"validation_required\": true,\n    \"tables_to_seed\": [\n      {\n        \"table\": \"agent_departments\",\n        \"records\": 11,\n        \"data\": [\n          \"R&D\",\n          \"Marketing\",\n          \"Sales\",\n          \"Finance\",\n          \"Legal & Compliance\",\n          \"Product Management\",\n          \"Customer Success\",\n          \"Branding\",\n          \"Advertising\",\n          \"Technical/Engineering\",\n          \"Investor Relations\"\n        ],\n        \"validation\": \"COUNT(*) = 11\"\n      },\n      {\n        \"table\": \"agent_tools\",\n        \"records\": 8,\n        \"data\": [\n          \"search_openvc\",\n          \"search_growjo\",\n          \"search_reddit\",\n          \"search_hackernews\",\n          \"query_knowledge_base\",\n          \"store_knowledge\",\n          \"calculate_market_size\",\n          \"analyze_sentiment\"\n        ],\n        \"validation\": \"COUNT(*) = 8\"\n      },\n      {\n        \"table\": \"crewai_agents\",\n        \"records\": 4,\n        \"data\": [\n          \"market-researcher\",\n          \"sentiment-analyst\",\n          \"financial-analyst\",\n          \"tech-intelligence\"\n        ],\n        \"validation\": \"COUNT(*) = 4\"\n      },\n      {\n        \"table\": \"crewai_crews\",\n        \"records\": 1,\n        \"data\": [\n          \"Quick Research Crew\"\n        ],\n        \"validation\": \"COUNT(*) = 1\"\n      },\n      {\n        \"table\": \"crew_members\",\n        \"records\": 4,\n        \"data\": \"4 agent assignments to Quick Research Crew\",\n        \"validation\": \"COUNT(*) = 4\"\n      }\n    ],\n    \"validation_script\": \"scripts/validate-seed-data-sd-agent-admin-003.mjs\",\n    \"error_handling\": \"Robust try-catch with detailed logging, rollback on failure\"\n  },\n  \"rls_policy_updates\": {\n    \"purpose\": \"Fix anon access blocking (SD-AGENT-ADMIN-002 issue)\",\n    \"priority\": \"HIGH\",\n    \"updates_required\": [\n      {\n        \"table\": \"ai_ceo_agents\",\n        \"current\": \"TO authenticated only\",\n        \"new\": \"TO anon - SELECT for active agents\",\n        \"rationale\": \"AI Agents page needs anon access for public demo\"\n      },\n      {\n        \"table\": \"agent_departments\",\n        \"current\": \"TO authenticated only\",\n        \"new\": \"TO anon - SELECT for all departments\",\n        \"rationale\": \"Department list needs anon access\"\n      },\n      {\n        \"table\": \"crew_members\",\n        \"current\": \"TO authenticated only\",\n        \"new\": \"TO anon - SELECT for crew composition\",\n        \"rationale\": \"Crew member list needs anon access\"\n      }\n    ],\n    \"policy_template\": \"\\n-- Example RLS policy for anon + authenticated access\\nCREATE POLICY \\\"Allow anon SELECT for active records\\\"\\nON {table_name} FOR SELECT\\nTO anon\\nUSING (status = 'active' OR status IS NULL);\\n\\nCREATE POLICY \\\"Allow authenticated INSERT/UPDATE\\\"\\nON {table_name} FOR ALL\\nTO authenticated\\nUSING (user_id = auth.uid());\\n    \"\n  },\n  \"data_integrity\": {\n    \"foreign_keys\": [\n      \"prompt_templates.created_by → auth.users (nullable)\",\n      \"prompt_ab_tests.prompt_template_id → prompt_templates (CASCADE)\",\n      \"ab_test_results.test_id → prompt_ab_tests (CASCADE)\",\n      \"search_preferences.user_id → auth.users (nullable)\",\n      \"agent_executions.user_id → auth.users (nullable)\",\n      \"performance_alerts.created_by → auth.users (nullable)\"\n    ],\n    \"cascading_deletes\": \"ON DELETE CASCADE for owned content (ab_tests, ab_test_results)\",\n    \"check_constraints\": \"Status enums, value ranges, confidence levels validated\",\n    \"not_null_constraints\": \"Required fields enforced (content, variant_a/b, thresholds)\",\n    \"unique_constraints\": \"Unique indexes on (name + user_id) for search_preferences\"\n  },\n  \"performance_optimizations\": {\n    \"indexes\": \"Created on all foreign keys and frequently queried columns\",\n    \"partitioning\": \"agent_executions table partitioned by month (for >1M rows)\",\n    \"archival_strategy\": \"Move agent_executions older than 6 months to cold storage\",\n    \"materialized_views\": [\n      \"mv_agent_performance_daily: Aggregate metrics by agent per day\",\n      \"mv_ab_test_summary: Test status and results for dashboard\"\n    ],\n    \"query_patterns\": [\n      \"Dashboard queries: Use materialized views refreshed hourly\",\n      \"Time series: BRIN indexes on timestamp columns\",\n      \"Full-text search: GIN indexes on JSONB metadata columns\"\n    ]\n  },\n  \"migration_strategy\": {\n    \"order\": [\n      \"1. Fix seed data for existing tables (agent_departments, agent_tools, etc.)\",\n      \"2. Update RLS policies for anon access\",\n      \"3. Create prompt_templates table\",\n      \"4. Create prompt_ab_tests table (depends on prompt_templates)\",\n      \"5. Create ab_test_results table (depends on prompt_ab_tests)\",\n      \"6. Create search_preferences table\",\n      \"7. Create agent_executions table\",\n      \"8. Create performance_alerts table\",\n      \"9. Create materialized views for dashboard\",\n      \"10. Validate all data with scripts/validate-seed-data-sd-agent-admin-003.mjs\"\n    ],\n    \"rollback_plan\": \"Each migration includes DOWN migration script in database/migrations/\",\n    \"zero_downtime\": \"New tables only - no ALTER TABLE on existing\",\n    \"validation_mandatory\": \"Run validation script after EVERY migration step\",\n    \"error_handling\": \"Stop on first failure, rollback, detailed logging\"\n  },\n  \"security_notes\": {\n    \"rls_mandatory\": \"ALL tables MUST have RLS policies enabled\",\n    \"anon_access_safe\": \"Anon can only SELECT public/active data, no PII\",\n    \"api_key_rotation\": \"Anon key for frontend, service role for backend migrations only\",\n    \"audit_logging\": \"Consider audit_log table for admin actions on prompts/tests\",\n    \"xss_prevention\": \"Monaco editor content must be sanitized before rendering\",\n    \"sql_injection\": \"Use parameterized queries ALWAYS, no string concatenation\"\n  },\n  \"storage_estimates\": {\n    \"prompt_templates\": \"~1MB for 500 prompts (with versioning: ~5MB)\",\n    \"prompt_ab_tests\": \"~500KB for 200 tests\",\n    \"ab_test_results\": \"~50MB for 100K results per test (depends on outcome size)\",\n    \"search_preferences\": \"~100KB for 500 profiles\",\n    \"agent_executions\": \"~100MB per 100K executions (6 months = ~600MB)\",\n    \"performance_alerts\": \"~10KB for 50 alerts\",\n    \"total_first_year\": \"~1-2GB estimated (excluding agent_executions archival)\"\n  },\n  \"verdict\": {\n    \"database_readiness\": \"READY with SEED DATA FIX and RLS UPDATES\",\n    \"risk_level\": \"LOW\",\n    \"confidence\": 0.95,\n    \"blockers\": [\n      {\n        \"issue\": \"Seed data must be validated with script\",\n        \"severity\": \"HIGH\",\n        \"mitigation\": \"Create validation script that verifies record counts\",\n        \"estimated_fix_time\": \"2-3 hours\"\n      },\n      {\n        \"issue\": \"RLS policies need anon access updates\",\n        \"severity\": \"MEDIUM\",\n        \"mitigation\": \"Add anon SELECT policies to 3 existing tables\",\n        \"estimated_fix_time\": \"1 hour\"\n      }\n    ],\n    \"recommendations\": [\n      \"Use transaction wrappers for all seed data operations\",\n      \"Create idempotent seed scripts (ON CONFLICT DO NOTHING)\",\n      \"Add comprehensive logging to detect silent failures\",\n      \"Run validation script after each migration step\",\n      \"Test RLS policies with both anon and authenticated contexts\"\n    ]\n  }\n}",
    "execution_time": 0,
    "metadata": {
      "risk_level": "LOW",
      "migration_steps": 10,
      "schema_analysis": {
        "sd_id": "SD-AGENT-ADMIN-003",
        "verdict": {
          "blockers": [
            {
              "issue": "Seed data must be validated with script",
              "severity": "HIGH",
              "mitigation": "Create validation script that verifies record counts",
              "estimated_fix_time": "2-3 hours"
            },
            {
              "issue": "RLS policies need anon access updates",
              "severity": "MEDIUM",
              "mitigation": "Add anon SELECT policies to 3 existing tables",
              "estimated_fix_time": "1 hour"
            }
          ],
          "confidence": 0.95,
          "risk_level": "LOW",
          "recommendations": [
            "Use transaction wrappers for all seed data operations",
            "Create idempotent seed scripts (ON CONFLICT DO NOTHING)",
            "Add comprehensive logging to detect silent failures",
            "Run validation script after each migration step",
            "Test RLS policies with both anon and authenticated contexts"
          ],
          "database_readiness": "READY with SEED DATA FIX and RLS UPDATES"
        },
        "assessment": "Comprehensive schema for AI Agent Management Platform (57 items)",
        "analysis_date": "2025-10-10T16:43:00.224Z",
        "data_integrity": {
          "foreign_keys": [
            "prompt_templates.created_by → auth.users (nullable)",
            "prompt_ab_tests.prompt_template_id → prompt_templates (CASCADE)",
            "ab_test_results.test_id → prompt_ab_tests (CASCADE)",
            "search_preferences.user_id → auth.users (nullable)",
            "agent_executions.user_id → auth.users (nullable)",
            "performance_alerts.created_by → auth.users (nullable)"
          ],
          "cascading_deletes": "ON DELETE CASCADE for owned content (ab_tests, ab_test_results)",
          "check_constraints": "Status enums, value ranges, confidence levels validated",
          "unique_constraints": "Unique indexes on (name + user_id) for search_preferences",
          "not_null_constraints": "Required fields enforced (content, variant_a/b, thresholds)"
        },
        "security_notes": {
          "audit_logging": "Consider audit_log table for admin actions on prompts/tests",
          "rls_mandatory": "ALL tables MUST have RLS policies enabled",
          "sql_injection": "Use parameterized queries ALWAYS, no string concatenation",
          "xss_prevention": "Monaco editor content must be sanitized before rendering",
          "anon_access_safe": "Anon can only SELECT public/active data, no PII",
          "api_key_rotation": "Anon key for frontend, service role for backend migrations only"
        },
        "seed_data_plan": {
          "purpose": "Fix SD-AGENT-ADMIN-002 empty tables issue",
          "priority": "CRITICAL",
          "error_handling": "Robust try-catch with detailed logging, rollback on failure",
          "tables_to_seed": [
            {
              "data": [
                "R&D",
                "Marketing",
                "Sales",
                "Finance",
                "Legal & Compliance",
                "Product Management",
                "Customer Success",
                "Branding",
                "Advertising",
                "Technical/Engineering",
                "Investor Relations"
              ],
              "table": "agent_departments",
              "records": 11,
              "validation": "COUNT(*) = 11"
            },
            {
              "data": [
                "search_openvc",
                "search_growjo",
                "search_reddit",
                "search_hackernews",
                "query_knowledge_base",
                "store_knowledge",
                "calculate_market_size",
                "analyze_sentiment"
              ],
              "table": "agent_tools",
              "records": 8,
              "validation": "COUNT(*) = 8"
            },
            {
              "data": [
                "market-researcher",
                "sentiment-analyst",
                "financial-analyst",
                "tech-intelligence"
              ],
              "table": "crewai_agents",
              "records": 4,
              "validation": "COUNT(*) = 4"
            },
            {
              "data": [
                "Quick Research Crew"
              ],
              "table": "crewai_crews",
              "records": 1,
              "validation": "COUNT(*) = 1"
            },
            {
              "data": "4 agent assignments to Quick Research Crew",
              "table": "crew_members",
              "records": 4,
              "validation": "COUNT(*) = 4"
            }
          ],
          "validation_script": "scripts/validate-seed-data-sd-agent-admin-003.mjs",
          "validation_required": true
        },
        "storage_estimates": {
          "ab_test_results": "~50MB for 100K results per test (depends on outcome size)",
          "prompt_ab_tests": "~500KB for 200 tests",
          "agent_executions": "~100MB per 100K executions (6 months = ~600MB)",
          "prompt_templates": "~1MB for 500 prompts (with versioning: ~5MB)",
          "total_first_year": "~1-2GB estimated (excluding agent_executions archival)",
          "performance_alerts": "~10KB for 50 alerts",
          "search_preferences": "~100KB for 500 profiles"
        },
        "migration_strategy": {
          "order": [
            "1. Fix seed data for existing tables (agent_departments, agent_tools, etc.)",
            "2. Update RLS policies for anon access",
            "3. Create prompt_templates table",
            "4. Create prompt_ab_tests table (depends on prompt_templates)",
            "5. Create ab_test_results table (depends on prompt_ab_tests)",
            "6. Create search_preferences table",
            "7. Create agent_executions table",
            "8. Create performance_alerts table",
            "9. Create materialized views for dashboard",
            "10. Validate all data with scripts/validate-seed-data-sd-agent-admin-003.mjs"
          ],
          "rollback_plan": "Each migration includes DOWN migration script in database/migrations/",
          "zero_downtime": "New tables only - no ALTER TABLE on existing",
          "error_handling": "Stop on first failure, rollback, detailed logging",
          "validation_mandatory": "Run validation script after EVERY migration step"
        },
        "rls_policy_updates": {
          "purpose": "Fix anon access blocking (SD-AGENT-ADMIN-002 issue)",
          "priority": "HIGH",
          "policy_template": "\n-- Example RLS policy for anon + authenticated access\nCREATE POLICY \"Allow anon SELECT for active records\"\nON {table_name} FOR SELECT\nTO anon\nUSING (status = 'active' OR status IS NULL);\n\nCREATE POLICY \"Allow authenticated INSERT/UPDATE\"\nON {table_name} FOR ALL\nTO authenticated\nUSING (user_id = auth.uid());\n    ",
          "updates_required": [
            {
              "new": "TO anon - SELECT for active agents",
              "table": "ai_ceo_agents",
              "current": "TO authenticated only",
              "rationale": "AI Agents page needs anon access for public demo"
            },
            {
              "new": "TO anon - SELECT for all departments",
              "table": "agent_departments",
              "current": "TO authenticated only",
              "rationale": "Department list needs anon access"
            },
            {
              "new": "TO anon - SELECT for crew composition",
              "table": "crew_members",
              "current": "TO authenticated only",
              "rationale": "Crew member list needs anon access"
            }
          ]
        },
        "new_tables_required": [
          {
            "name": "prompt_templates",
            "schema": "\nCREATE TABLE prompt_templates (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  description TEXT,\n  content TEXT NOT NULL,\n  variables JSONB DEFAULT '{}',\n  category TEXT CHECK (category IN ('system', 'user', 'assistant', 'function', 'custom')),\n  tags TEXT[] DEFAULT ARRAY[]::TEXT[],\n  agent_roles TEXT[] DEFAULT ARRAY[]::TEXT[],\n  created_by UUID,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  version INTEGER DEFAULT 1,\n  parent_version_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,\n  status TEXT CHECK (status IN ('draft', 'active', 'archived', 'testing')) DEFAULT 'draft',\n  usage_count INTEGER DEFAULT 0,\n  avg_token_count INTEGER,\n  metadata JSONB DEFAULT '{}'\n);\n\nCREATE INDEX idx_prompt_templates_category ON prompt_templates(category);\nCREATE INDEX idx_prompt_templates_status ON prompt_templates(status);\nCREATE INDEX idx_prompt_templates_tags ON prompt_templates USING GIN(tags);\nCREATE INDEX idx_prompt_templates_created_at ON prompt_templates(created_at DESC);\nCREATE INDEX idx_prompt_templates_usage_count ON prompt_templates(usage_count DESC);\n      ",
            "purpose": "Prompt Library with versioning (18 backlog items)",
            "priority": "CRITICAL",
            "rls_policies": [
              "Allow anon users to SELECT active prompts",
              "Allow authenticated users to INSERT/UPDATE own prompts",
              "Allow admins full access"
            ],
            "estimated_rows": "100-500 prompts"
          },
          {
            "name": "prompt_ab_tests",
            "schema": "\nCREATE TABLE prompt_ab_tests (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  description TEXT,\n  prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE CASCADE,\n  variant_a_content TEXT NOT NULL,\n  variant_b_content TEXT NOT NULL,\n  variant_c_content TEXT,\n  variant_d_content TEXT,\n  traffic_split JSONB DEFAULT '{\"a\": 50, \"b\": 50}'::jsonb,\n  success_metric TEXT CHECK (success_metric IN ('response_quality', 'user_satisfaction', 'task_completion', 'token_efficiency')) DEFAULT 'response_quality',\n  sample_size INTEGER DEFAULT 100,\n  confidence_level DECIMAL(3,2) DEFAULT 0.95,\n  metrics JSONB DEFAULT '{}'::jsonb,\n  results JSONB DEFAULT '{}'::jsonb,\n  status TEXT CHECK (status IN ('draft', 'running', 'completed', 'stopped', 'invalid')) DEFAULT 'draft',\n  winner TEXT CHECK (winner IN ('a', 'b', 'c', 'd', 'inconclusive')),\n  statistical_significance DECIMAL(5,4),\n  started_at TIMESTAMPTZ,\n  completed_at TIMESTAMPTZ,\n  created_by UUID,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  metadata JSONB DEFAULT '{}'\n);\n\nCREATE INDEX idx_ab_tests_status ON prompt_ab_tests(status);\nCREATE INDEX idx_ab_tests_prompt_id ON prompt_ab_tests(prompt_template_id);\nCREATE INDEX idx_ab_tests_started_at ON prompt_ab_tests(started_at DESC);\n      ",
            "purpose": "A/B testing with statistical confidence (18 backlog items)",
            "priority": "CRITICAL",
            "rls_policies": [
              "Allow anon users to SELECT running tests",
              "Allow authenticated users to INSERT/UPDATE own tests",
              "Allow admins full access"
            ],
            "estimated_rows": "50-200 active tests"
          },
          {
            "name": "ab_test_results",
            "schema": "\nCREATE TABLE ab_test_results (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  test_id UUID REFERENCES prompt_ab_tests(id) ON DELETE CASCADE,\n  variant TEXT CHECK (variant IN ('a', 'b', 'c', 'd')) NOT NULL,\n  execution_id UUID,\n  outcome JSONB NOT NULL,\n  score DECIMAL(5,2),\n  latency_ms INTEGER,\n  token_count INTEGER,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_ab_results_test_id ON ab_test_results(test_id);\nCREATE INDEX idx_ab_results_variant ON ab_test_results(variant);\nCREATE INDEX idx_ab_results_created_at ON ab_test_results(created_at DESC);\n      ",
            "purpose": "Individual A/B test execution results",
            "priority": "CRITICAL",
            "rls_policies": [
              "Allow anon users to SELECT results for running tests",
              "Admins: Full access"
            ],
            "estimated_rows": "10,000-100,000 per test"
          },
          {
            "name": "search_preferences",
            "schema": "\nCREATE TABLE search_preferences (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  description TEXT,\n  user_id UUID,\n  agent_key TEXT,\n  default_engine TEXT CHECK (default_engine IN ('google', 'bing', 'duckduckgo', 'custom')) DEFAULT 'google',\n  results_per_page INTEGER CHECK (results_per_page BETWEEN 10 AND 100) DEFAULT 25,\n  safe_search BOOLEAN DEFAULT true,\n  region TEXT DEFAULT 'US',\n  language TEXT DEFAULT 'en',\n  custom_endpoint TEXT,\n  filter_config JSONB DEFAULT '{}'::jsonb,\n  timeout_seconds INTEGER DEFAULT 30,\n  cache_enabled BOOLEAN DEFAULT true,\n  cache_ttl_minutes INTEGER DEFAULT 60,\n  is_default BOOLEAN DEFAULT false,\n  is_locked BOOLEAN DEFAULT false,\n  usage_count INTEGER DEFAULT 0,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  metadata JSONB DEFAULT '{}'\n);\n\nCREATE INDEX idx_search_prefs_user_id ON search_preferences(user_id);\nCREATE INDEX idx_search_prefs_agent_key ON search_preferences(agent_key);\nCREATE INDEX idx_search_prefs_is_default ON search_preferences(is_default);\n      ",
            "purpose": "Search Preference Engine (10 backlog items)",
            "priority": "MEDIUM",
            "rls_policies": [
              "Users: Own profiles only",
              "Admins: All profiles + can lock defaults",
              "Anon: Read-only access to default profiles"
            ],
            "estimated_rows": "100-500 profiles"
          },
          {
            "name": "agent_executions",
            "schema": "\nCREATE TABLE agent_executions (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  agent_key TEXT NOT NULL,\n  agent_type TEXT CHECK (agent_type IN ('ai_ceo', 'crewai', 'research', 'custom')),\n  department TEXT,\n  user_id UUID,\n  execution_type TEXT CHECK (execution_type IN ('prompt', 'workflow', 'research', 'analysis')),\n  started_at TIMESTAMPTZ NOT NULL,\n  completed_at TIMESTAMPTZ,\n  duration_ms INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) STORED,\n  token_count INTEGER,\n  cost_usd DECIMAL(10, 4),\n  status TEXT CHECK (status IN ('success', 'error', 'timeout', 'cancelled')) DEFAULT 'success',\n  error_message TEXT,\n  error_type TEXT,\n  quality_score DECIMAL(3,2),\n  input_params JSONB DEFAULT '{}'::jsonb,\n  output_summary TEXT,\n  metadata JSONB DEFAULT '{}'::jsonb,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX idx_agent_exec_agent_key ON agent_executions(agent_key);\nCREATE INDEX idx_agent_exec_started_at ON agent_executions(started_at DESC);\nCREATE INDEX idx_agent_exec_status ON agent_executions(status);\nCREATE INDEX idx_agent_exec_user_id ON agent_executions(user_id);\nCREATE INDEX idx_agent_exec_department ON agent_executions(department);\n\n-- Performance: BRIN index for time-series queries\nCREATE INDEX idx_agent_exec_created_at_brin ON agent_executions USING BRIN(created_at);\n      ",
            "purpose": "Performance Dashboard data (10 backlog items)",
            "priority": "HIGH",
            "rls_policies": [
              "Users: Own executions only",
              "Admins: All executions",
              "Anon: Aggregate statistics only"
            ],
            "estimated_rows": "10,000-100,000 per month",
            "partitioning_strategy": "PARTITION BY RANGE (started_at) - monthly partitions for >1M rows"
          },
          {
            "name": "performance_alerts",
            "schema": "\nCREATE TABLE performance_alerts (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT NOT NULL,\n  description TEXT,\n  alert_type TEXT CHECK (alert_type IN ('latency', 'error_rate', 'cost', 'quality', 'usage')) NOT NULL,\n  condition JSONB NOT NULL,\n  threshold_value DECIMAL(10,2) NOT NULL,\n  comparison TEXT CHECK (comparison IN ('>', '<', '>=', '<=', '=')) DEFAULT '>',\n  time_window_minutes INTEGER DEFAULT 60,\n  notification_channels JSONB DEFAULT '{\"email\": true, \"dashboard\": true}'::jsonb,\n  enabled BOOLEAN DEFAULT true,\n  last_triggered TIMESTAMPTZ,\n  trigger_count INTEGER DEFAULT 0,\n  created_by UUID,\n  created_at TIMESTAMPTZ DEFAULT NOW(),\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  metadata JSONB DEFAULT '{}'\n);\n\nCREATE INDEX idx_perf_alerts_enabled ON performance_alerts(enabled);\nCREATE INDEX idx_perf_alerts_alert_type ON performance_alerts(alert_type);\n      ",
            "purpose": "Alert configurations for Performance Dashboard",
            "priority": "HIGH",
            "rls_policies": [
              "Admins: Full access",
              "Users: Read-only access to own alerts"
            ],
            "estimated_rows": "10-50 alerts"
          }
        ],
        "root_cause_analysis": {
          "impact": "All agent tables empty: ai_ceo_agents (0), crewai_agents (0), agent_departments (0)",
          "problem": "Migration 20251008000000_agent_platform_schema.sql created tables but seed data failed silently",
          "evidence": "AGENT_DATA_INVESTIGATION_REPORT.md (489 lines)",
          "lesson_learned": "Need robust seed data validation and error handling"
        },
        "existing_tables_status": {
          "agent_tools": {
            "issue": "Seed data failed in SD-AGENT-ADMIN-002",
            "schema": "id, tool_name, tool_type, description, configuration, rate_limit_per_minute, status",
            "status": "⚠️ EXISTS but EMPTY (0 records)",
            "verdict": "REQUIRES SEED DATA - 8 tools (search_openvc, search_growjo, etc.)"
          },
          "crew_members": {
            "issue": "Seed data failed in SD-AGENT-ADMIN-002",
            "schema": "id, crew_id, agent_id, role_in_crew, sequence_order, created_at",
            "status": "⚠️ EXISTS but EMPTY (0 records)",
            "verdict": "REQUIRES SEED DATA - 4 crew member records"
          },
          "crewai_crews": {
            "issue": "Seed data failed in SD-AGENT-ADMIN-002",
            "schema": "id, crew_name, crew_type, description, status, created_at",
            "status": "⚠️ EXISTS but EMPTY (0 records)",
            "verdict": "REQUIRES SEED DATA - Quick Research Crew with 4 agents"
          },
          "agent_configs": {
            "usage": "Preset management (AgentSettingsTab, AgentPresetsTab)",
            "schema": "id, user_id, preset_name, description, config_json, category, created_at, updated_at, deleted_at",
            "status": "✅ EXISTS and FUNCTIONAL",
            "verdict": "LEVERAGE EXISTING - Already working for presets",
            "modifications_needed": "NONE - Current schema sufficient"
          },
          "ai_ceo_agents": {
            "issue": "Seed data failed in SD-AGENT-ADMIN-002",
            "schema": "id, agent_key, name, role, capabilities, status, created_at",
            "status": "⚠️ EXISTS but EMPTY (0 records)",
            "verdict": "REQUIRES SEED DATA - Fix with validation script"
          },
          "crewai_agents": {
            "issue": "Seed data failed in SD-AGENT-ADMIN-002",
            "schema": "id, agent_key, name, role, goal, backstory, department_id, tools, status",
            "status": "⚠️ EXISTS but EMPTY (0 records)",
            "verdict": "REQUIRES SEED DATA - 4 research agents + 11 departments + 8 tools"
          },
          "agent_departments": {
            "issue": "Seed data failed in SD-AGENT-ADMIN-002",
            "schema": "id, department_name, description, status, created_at",
            "status": "⚠️ EXISTS but EMPTY (0 records)",
            "verdict": "REQUIRES SEED DATA - 11 departments (R&D, Marketing, Sales, etc.)"
          }
        },
        "performance_optimizations": {
          "indexes": "Created on all foreign keys and frequently queried columns",
          "partitioning": "agent_executions table partitioned by month (for >1M rows)",
          "query_patterns": [
            "Dashboard queries: Use materialized views refreshed hourly",
            "Time series: BRIN indexes on timestamp columns",
            "Full-text search: GIN indexes on JSONB metadata columns"
          ],
          "archival_strategy": "Move agent_executions older than 6 months to cold storage",
          "materialized_views": [
            "mv_agent_performance_daily: Aggregate metrics by agent per day",
            "mv_ab_test_summary: Test status and results for dashboard"
          ]
        }
      },
      "tables_analyzed": 7,
      "seed_data_records": 28,
      "database_readiness": "READY_WITH_FIXES",
      "new_tables_required": 6,
      "rls_updates_required": 3
    },
    "created_at": "2025-10-10T16:43:01.731Z",
    "updated_at": "2025-10-10T16:43:01.731Z",
    "risk_assessment_id": null
  },
  {
    "id": "7c948340-b2a4-4fb9-b7bc-83298eff8e54",
    "sd_id": "SD-AGENT-ADMIN-003",
    "sub_agent_code": "QA",
    "sub_agent_name": "QA Engineering Director v2.0",
    "verdict": "CONDITIONAL_PASS",
    "confidence": 50,
    "critical_issues": [
      {
        "issue": "Smoke tests failed",
        "details": {
          "verdict": "FAIL",
          "executed": true,
          "e2e_tests": {
            "failed": 1,
            "passed": 0,
            "verdict": "FAIL",
            "framework": "playwright",
            "test_count": 0,
            "duration_seconds": 0
          },
          "unit_tests": {
            "failed": 0,
            "passed": 0,
            "verdict": "PASS",
            "framework": "vitest",
            "test_count": 0,
            "duration_seconds": 0,
            "coverage_percentage": null
          }
        },
        "location": "Test execution",
        "severity": "CRITICAL",
        "recommendation": "Fix failing tests"
      }
    ],
    "warnings": [
      {
        "issue": "Cross-SD dependency conflicts detected",
        "details": {
          "app": "ehg",
          "sd_id": "SD-AGENT-ADMIN-003",
          "summary": "17 potential conflict(s) detected",
          "verdict": "WARNING",
          "conflicts": [
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/CompanySelector",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/PerformanceDriveCycle",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/SynergyOpportunities",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/ExecutiveAlerts",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/AIInsightsEngine",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/VenturePortfolioOverview",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/StrategicKPIMonitor",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/FinancialAnalytics",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/OperationalIntelligence",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/KPISelector",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/AlertConfiguration",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/development/DevelopmentEnvironment",
              "conflicting_sd": "SD-043",
              "conflicting_sd_title": "Development Workflow: Consolidated"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/development/OnboardingChecklist",
              "conflicting_sd": "SD-043",
              "conflicting_sd_title": "Development Workflow: Consolidated"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/development/TestingAutomationDashboard",
              "conflicting_sd": "SD-043",
              "conflicting_sd_title": "Development Workflow: Consolidated"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 0,
              "import_path": "@/components/testing/TestingDashboard",
              "conflicting_sd": "SD-VIDEO-VARIANT-001",
              "conflicting_sd_title": "Sora 2 Video Variant Testing & Optimization Engine"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 0,
              "import_path": "@/components/testing/QualityGatesManager",
              "conflicting_sd": "SD-VIDEO-VARIANT-001",
              "conflicting_sd_title": "Sora 2 Video Variant Testing & Optimization Engine"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 0,
              "import_path": "@/components/testing/AITestGenerator",
              "conflicting_sd": "SD-VIDEO-VARIANT-001",
              "conflicting_sd_title": "Sora 2 Video Variant Testing & Optimization Engine"
            }
          ],
          "conflicts_count": 17,
          "recommendations": [
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-043",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Development Workflow: Consolidated",
              "current_progress": 30
            },
            {
              "sd": "SD-043",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Development Workflow: Consolidated",
              "current_progress": 30
            },
            {
              "sd": "SD-043",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Development Workflow: Consolidated",
              "current_progress": 30
            },
            {
              "sd": "SD-VIDEO-VARIANT-001",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
              "current_progress": 0
            },
            {
              "sd": "SD-VIDEO-VARIANT-001",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
              "current_progress": 0
            },
            {
              "sd": "SD-VIDEO-VARIANT-001",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
              "current_progress": 0
            }
          ]
        },
        "location": "Dependencies",
        "severity": "MEDIUM",
        "recommendation": "Review dependency conflicts"
      },
      {
        "issue": "Component integration issues",
        "details": {
          "app": "ehg",
          "details": [
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "VideoVariantTesting",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "PromptLibraryTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentPresetsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "EVARealtimeVoice",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "AudioWaveform",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingNavBar",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingDashboard",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentSettingsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            }
          ],
          "summary": "2/8 components integrated, 6 warnings",
          "verdict": "WARNING",
          "warnings": [
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "VideoVariantTesting",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "PromptLibraryTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentPresetsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingNavBar",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingDashboard",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentSettingsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            }
          ],
          "integrated": [
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "EVARealtimeVoice",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "AudioWaveform",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            }
          ],
          "warnings_count": 6,
          "components_checked": 8,
          "integrations_found": 2
        },
        "location": "Component integration",
        "severity": "MEDIUM",
        "recommendation": "Verify component imports"
      },
      {
        "issue": "User story coverage 0% (requires 100%)",
        "details": {
          "total_stories": 57,
          "e2e_tests_passed": 0,
          "completed_stories": 0,
          "meets_requirement": false,
          "coverage_percentage": 0
        },
        "location": "E2E test coverage",
        "severity": "HIGH",
        "recommendation": "Add E2E tests for uncovered user stories"
      }
    ],
    "recommendations": [
      {
        "type": "REUSE",
        "example": "import { authenticateUser } from '../fixtures/auth';",
        "message": "✅ Use existing authenticateUser() from tests/fixtures/auth.ts",
        "category": "Authentication",
        "priority": "CRITICAL",
        "anti_pattern": "❌ DO NOT write custom auth logic"
      },
      {
        "type": "PATTERN",
        "example": "Use test.beforeEach() for auth, await page.waitForLoadState() for stability",
        "message": "📋 Follow pattern from tests/e2e/agent-admin-comprehensive.spec.ts",
        "category": "E2E Testing",
        "priority": "HIGH"
      },
      {
        "list": [
          "venture-test-utils.ts",
          "wait-utils.ts"
        ],
        "type": "REUSE",
        "message": "✅ 2 helper(s) available in tests/helpers/",
        "category": "Test Helpers",
        "priority": "MEDIUM"
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-043",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Development Workflow: Consolidated",
        "current_progress": 30
      },
      {
        "sd": "SD-043",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Development Workflow: Consolidated",
        "current_progress": 30
      },
      {
        "sd": "SD-043",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Development Workflow: Consolidated",
        "current_progress": 30
      },
      {
        "sd": "SD-VIDEO-VARIANT-001",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
        "current_progress": 0
      },
      {
        "sd": "SD-VIDEO-VARIANT-001",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
        "current_progress": 0
      },
      {
        "sd": "SD-VIDEO-VARIANT-001",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
        "current_progress": 0
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      }
    ],
    "detailed_analysis": "{\"pre_flight\":{\"user_stories\":{\"verdict\":\"PASS\",\"stories_count\":57,\"completed_count\":0,\"stories\":[{\"key\":\"SD-AGENT-ADMIN-003:US-006\",\"title\":\"Export preset to JSON\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-007\",\"title\":\"Import preset from JSON\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-008\",\"title\":\"View preset usage statistics\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-009\",\"title\":\"Validate preset configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-001\",\"title\":\"View all saved presets\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-002\",\"title\":\"Create new preset\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-003\",\"title\":\"Apply preset to agent\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-004\",\"title\":\"Edit existing preset\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-005\",\"title\":\"Delete preset\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-010\",\"title\":\"Preview preset before applying\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-011\",\"title\":\"Categorize presets by use case\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-012\",\"title\":\"Two-way sync with AgentSettingsTab\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-013\",\"title\":\"Browse prompts by category\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-014\",\"title\":\"Create new prompt template\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-015\",\"title\":\"Edit prompt template\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-016\",\"title\":\"Version prompt templates\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-017\",\"title\":\"Tag prompts for search\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-018\",\"title\":\"Search prompts by tag/keyword\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-019\",\"title\":\"Test prompt before deployment\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-020\",\"title\":\"Create A/B test with 2-4 variants\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-021\",\"title\":\"Monitor active A/B tests\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-022\",\"title\":\"View A/B test results with statistical confidence\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-023\",\"title\":\"Visualize A/B test results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-024\",\"title\":\"Declare winning variant and deploy\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-025\",\"title\":\"Automatic A/B test data collection\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-026\",\"title\":\"View historical test results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-027\",\"title\":\"Clone test for re-testing\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-028\",\"title\":\"Prevent invalid test configurations\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-029\",\"title\":\"Monaco editor keyboard shortcuts\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-030\",\"title\":\"Link prompts to agent roles\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-031\",\"title\":\"Integrate Prompt Library with Agent Settings\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-032\",\"title\":\"Save agent settings as preset from Settings tab\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-033\",\"title\":\"Show active preset indicator in Settings\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-034\",\"title\":\"Link A/B test results to agent configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-035\",\"title\":\"Validate settings before saving\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-036\",\"title\":\"Export agent configuration as JSON\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-037\",\"title\":\"Reset settings to default values\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-038\",\"title\":\"Configure default search provider\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-039\",\"title\":\"Set search result count preference\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-040\",\"title\":\"Configure search filters (date, region, language)\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-041\",\"title\":\"Safe search filtering preference\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-042\",\"title\":\"Search API rate limit configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-043\",\"title\":\"Custom search API key management\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-044\",\"title\":\"Search result caching preference\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-045\",\"title\":\"Domain blocking for search results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-046\",\"title\":\"Domain prioritization for search results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-047\",\"title\":\"Search preferences inheritance from presets\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-048\",\"title\":\"View agent execution metrics dashboard\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-049\",\"title\":\"Execution latency trend chart\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-050\",\"title\":\"Token usage breakdown chart\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-051\",\"title\":\"Error rate monitoring chart\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-052\",\"title\":\"Performance alerts configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-053\",\"title\":\"View active performance alerts\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-054\",\"title\":\"Historical alert log\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-055\",\"title\":\"Execution trace viewer\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-056\",\"title\":\"Export performance metrics\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-057\",\"title\":\"Performance comparison between presets\",\"status\":\"ready\"}]},\"migrations\":{\"verdict\":\"NO_MIGRATIONS\",\"message\":\"No database migrations found for SD-AGENT-ADMIN-003\",\"sd_id\":\"SD-AGENT-ADMIN-003\",\"app\":\"ehg\"},\"dependencies\":{\"verdict\":\"WARNING\",\"conflicts\":[{\"import_path\":\"@/components/chairman/CompanySelector\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/PerformanceDriveCycle\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/SynergyOpportunities\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/ExecutiveAlerts\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/AIInsightsEngine\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/VenturePortfolioOverview\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/StrategicKPIMonitor\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/FinancialAnalytics\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/OperationalIntelligence\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/KPISelector\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/AlertConfiguration\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/development/DevelopmentEnvironment\",\"conflicting_sd\":\"SD-043\",\"conflicting_sd_title\":\"Development Workflow: Consolidated\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/development/OnboardingChecklist\",\"conflicting_sd\":\"SD-043\",\"conflicting_sd_title\":\"Development Workflow: Consolidated\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/development/TestingAutomationDashboard\",\"conflicting_sd\":\"SD-043\",\"conflicting_sd_title\":\"Development Workflow: Consolidated\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/testing/TestingDashboard\",\"conflicting_sd\":\"SD-VIDEO-VARIANT-001\",\"conflicting_sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"progress\":0,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/testing/QualityGatesManager\",\"conflicting_sd\":\"SD-VIDEO-VARIANT-001\",\"conflicting_sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"progress\":0,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/testing/AITestGenerator\",\"conflicting_sd\":\"SD-VIDEO-VARIANT-001\",\"conflicting_sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"progress\":0,\"status\":\"active\",\"risk\":\"high\"}],\"conflicts_count\":17,\"recommendations\":[{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-043\",\"sd_title\":\"Development Workflow: Consolidated\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-043\",\"sd_title\":\"Development Workflow: Consolidated\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-043\",\"sd_title\":\"Development Workflow: Consolidated\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-VIDEO-VARIANT-001\",\"sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"current_progress\":0,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-VIDEO-VARIANT-001\",\"sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"current_progress\":0,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-VIDEO-VARIANT-001\",\"sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"current_progress\":0,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"}],\"sd_id\":\"SD-AGENT-ADMIN-003\",\"app\":\"ehg\",\"summary\":\"17 potential conflict(s) detected\"},\"integration\":{\"verdict\":\"WARNING\",\"components_checked\":8,\"integrations_found\":2,\"warnings_count\":6,\"warnings\":[{\"component\":\"VideoVariantTesting\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"PromptLibraryTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentPresetsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVAMeetingNavBar\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVAMeetingDashboard\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentSettingsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0}],\"integrated\":[{\"component\":\"EVARealtimeVoice\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"},{\"component\":\"AudioWaveform\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"}],\"details\":[{\"component\":\"VideoVariantTesting\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"PromptLibraryTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentPresetsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVARealtimeVoice\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"},{\"component\":\"AudioWaveform\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"},{\"component\":\"EVAMeetingNavBar\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVAMeetingDashboard\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentSettingsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0}],\"app\":\"ehg\",\"summary\":\"2/8 components integrated, 6 warnings\"}},\"test_planning\":{\"tier_selection\":{\"recommended_tiers\":[{\"name\":\"Smoke Tests\",\"required\":true,\"count\":\"3-5 tests\",\"time_budget\":\"<60 seconds\",\"description\":\"Critical path validation - SUFFICIENT for LEAD approval\",\"priority\":\"MANDATORY\"},{\"name\":\"E2E Tests\",\"required\":true,\"count\":\"10-20 tests\",\"time_budget\":\"<5 minutes\",\"description\":\"User flow validation for UI features\",\"priority\":\"RECOMMENDED\",\"rationale\":\"UI feature detected - E2E tests validate user flows\"},{\"name\":\"Manual Testing\",\"required\":false,\"checklist_size\":\"0\",\"time_budget\":\"N/A\",\"description\":\"Manual validation for complex business logic\",\"priority\":\"SKIP\",\"rationale\":\"No complex logic - automated tests sufficient\"}],\"primary_tier\":{\"name\":\"Smoke Tests\",\"required\":true,\"count\":\"3-5 tests\",\"time_budget\":\"<60 seconds\",\"description\":\"Critical path validation - SUFFICIENT for LEAD approval\",\"priority\":\"MANDATORY\"},\"total_estimated_time_seconds\":360,\"total_estimated_time_display\":\"6m\",\"rationale\":\"Tier 1 (Smoke): Always required for SD-AGENT-ADMIN-003. Tier 2 (E2E): Required - UI feature detected in category/scope. Tier 3 (Manual): Skipped - automated tests sufficient\",\"category\":\"agent-platform\",\"scope_summary\":\"{\\\"total_story_points\\\":115,\\\"estimated_effort\\\":\\\"7-9 days (56-71 hours)\\\",\\\"subsystems\\\":[{\\\"name\\\":\\\"Preset ...\"},\"infrastructure\":{\"verdict\":\"DISCOVERED\",\"infrastructure\":{\"auth_helpers\":[{\"name\":\"auth.ts\",\"path\":\"tests/fixtures/auth.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/fixtures/auth.ts\"}],\"test_helpers\":[{\"name\":\"venture-test-utils.ts\",\"path\":\"tests/helpers/venture-test-utils.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/helpers/venture-test-utils.ts\"},{\"name\":\"wait-utils.ts\",\"path\":\"tests/helpers/wait-utils.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/helpers/wait-utils.ts\"}],\"fixtures\":[],\"configs\":[{\"name\":\"playwright.config.ts\",\"path\":\"/mnt/c/_EHG/ehg/playwright.config.ts\"},{\"name\":\"playwright.config.test.ts\",\"path\":\"/mnt/c/_EHG/ehg/playwright.config.test.ts\"},{\"name\":\"jest.config.js\",\"path\":\"/mnt/c/_EHG/ehg/jest.config.js\"},{\"name\":\"vitest.config.ts\",\"path\":\"/mnt/c/_EHG/ehg/vitest.config.ts\"},{\"name\":\"vitest.config.integration.ts\",\"path\":\"/mnt/c/_EHG/ehg/vitest.config.integration.ts\"}],\"e2e_patterns\":[{\"name\":\"agent-admin-comprehensive.spec.ts\",\"path\":\"tests/e2e/agent-admin-comprehensive.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/agent-admin-comprehensive.spec.ts\"},{\"name\":\"agent-admin-smoke.spec.ts\",\"path\":\"tests/e2e/agent-admin-smoke.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/agent-admin-smoke.spec.ts\"},{\"name\":\"agent-migration-system-a.spec.ts\",\"path\":\"tests/e2e/agent-migration-system-a.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/agent-migration-system-a.spec.ts\"},{\"name\":\"analytics-export.spec.ts\",\"path\":\"tests/e2e/analytics-export.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/analytics-export.spec.ts\"},{\"name\":\"audio-management.spec.ts\",\"path\":\"tests/e2e/audio-management.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/audio-management.spec.ts\"}]},\"recommendations\":[{\"type\":\"REUSE\",\"priority\":\"CRITICAL\",\"category\":\"Authentication\",\"message\":\"✅ Use existing authenticateUser() from tests/fixtures/auth.ts\",\"anti_pattern\":\"❌ DO NOT write custom auth logic\",\"example\":\"import { authenticateUser } from '../fixtures/auth';\"},{\"type\":\"PATTERN\",\"priority\":\"HIGH\",\"category\":\"E2E Testing\",\"message\":\"📋 Follow pattern from tests/e2e/agent-admin-comprehensive.spec.ts\",\"example\":\"Use test.beforeEach() for auth, await page.waitForLoadState() for stability\"},{\"type\":\"REUSE\",\"priority\":\"MEDIUM\",\"category\":\"Test Helpers\",\"message\":\"✅ 2 helper(s) available in tests/helpers/\",\"list\":[\"venture-test-utils.ts\",\"wait-utils.ts\"]}],\"summary\":{\"auth_available\":true,\"helpers_count\":2,\"fixtures_count\":0,\"e2e_examples\":5,\"configs_found\":5},\"app\":\"ehg\"}},\"test_execution\":{\"smoke\":{\"executed\":true,\"verdict\":\"FAIL\",\"unit_tests\":{\"verdict\":\"PASS\",\"test_count\":0,\"passed\":0,\"failed\":0,\"duration_seconds\":0,\"coverage_percentage\":null,\"framework\":\"vitest\"},\"e2e_tests\":{\"verdict\":\"FAIL\",\"test_count\":0,\"passed\":0,\"failed\":1,\"duration_seconds\":0,\"framework\":\"playwright\"}}},\"evidence\":{\"screenshots\":[],\"logs\":[],\"coverage\":null,\"test_reports\":[]}}",
    "execution_time": 0,
    "metadata": {
      "summary": {
        "test_plan": {
          "primary_tier": "Smoke Tests",
          "estimated_time": "6m",
          "infrastructure_available": true
        },
        "test_results": {
          "e2e": "NOT_RUN",
          "smoke": "FAIL",
          "manual": false
        },
        "pre_flight_checks": {
          "build": "SKIP",
          "migrations": "NO_MIGRATIONS",
          "integration": "WARNING",
          "dependencies": "WARNING",
          "user_stories": "PASS",
          "user_story_count": 57,
          "user_story_coverage": "0%"
        },
        "user_story_validation": {
          "total_stories": 57,
          "e2e_tests_passed": 0,
          "completed_stories": 0,
          "meets_requirement": false,
          "coverage_percentage": 0
        }
      },
      "target_app": "ehg",
      "time_saved": "1-2 hours"
    },
    "created_at": "2025-10-10T18:13:45.127Z",
    "updated_at": "2025-10-10T18:13:45.127Z",
    "risk_assessment_id": null
  },
  {
    "id": "dd9cb5f4-3501-4cdd-8923-63d06f5bc69d",
    "sd_id": "SD-AGENT-ADMIN-003",
    "sub_agent_code": "QA",
    "sub_agent_name": "QA Engineering Director v2.0",
    "verdict": "CONDITIONAL_PASS",
    "confidence": 50,
    "critical_issues": [
      {
        "issue": "Smoke tests failed",
        "details": {
          "verdict": "FAIL",
          "executed": true,
          "e2e_tests": {
            "failed": 1,
            "passed": 0,
            "verdict": "FAIL",
            "framework": "playwright",
            "test_count": 0,
            "duration_seconds": 0
          },
          "unit_tests": {
            "failed": 0,
            "passed": 0,
            "verdict": "PASS",
            "framework": "vitest",
            "test_count": 0,
            "duration_seconds": 0,
            "coverage_percentage": null
          }
        },
        "location": "Test execution",
        "severity": "CRITICAL",
        "recommendation": "Fix failing tests"
      }
    ],
    "warnings": [
      {
        "issue": "Cross-SD dependency conflicts detected",
        "details": {
          "app": "ehg",
          "sd_id": "SD-AGENT-ADMIN-003",
          "summary": "17 potential conflict(s) detected",
          "verdict": "WARNING",
          "conflicts": [
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/CompanySelector",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/PerformanceDriveCycle",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/SynergyOpportunities",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/ExecutiveAlerts",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/AIInsightsEngine",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/VenturePortfolioOverview",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/StrategicKPIMonitor",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/FinancialAnalytics",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/OperationalIntelligence",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/KPISelector",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/chairman/AlertConfiguration",
              "conflicting_sd": "SD-050",
              "conflicting_sd_title": "Chairman Dashboard: Consolidated 2"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/development/DevelopmentEnvironment",
              "conflicting_sd": "SD-043",
              "conflicting_sd_title": "Development Workflow: Consolidated"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/development/OnboardingChecklist",
              "conflicting_sd": "SD-043",
              "conflicting_sd_title": "Development Workflow: Consolidated"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 30,
              "import_path": "@/components/development/TestingAutomationDashboard",
              "conflicting_sd": "SD-043",
              "conflicting_sd_title": "Development Workflow: Consolidated"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 20,
              "import_path": "@/components/testing/TestingDashboard",
              "conflicting_sd": "SD-VIDEO-VARIANT-001",
              "conflicting_sd_title": "Sora 2 Video Variant Testing & Optimization Engine"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 20,
              "import_path": "@/components/testing/QualityGatesManager",
              "conflicting_sd": "SD-VIDEO-VARIANT-001",
              "conflicting_sd_title": "Sora 2 Video Variant Testing & Optimization Engine"
            },
            {
              "risk": "high",
              "status": "active",
              "progress": 20,
              "import_path": "@/components/testing/AITestGenerator",
              "conflicting_sd": "SD-VIDEO-VARIANT-001",
              "conflicting_sd_title": "Sora 2 Video Variant Testing & Optimization Engine"
            }
          ],
          "conflicts_count": 17,
          "recommendations": [
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-050",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Chairman Dashboard: Consolidated 2",
              "current_progress": 30
            },
            {
              "sd": "SD-043",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Development Workflow: Consolidated",
              "current_progress": 30
            },
            {
              "sd": "SD-043",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Development Workflow: Consolidated",
              "current_progress": 30
            },
            {
              "sd": "SD-043",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Development Workflow: Consolidated",
              "current_progress": 30
            },
            {
              "sd": "SD-VIDEO-VARIANT-001",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
              "current_progress": 20
            },
            {
              "sd": "SD-VIDEO-VARIANT-001",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
              "current_progress": 20
            },
            {
              "sd": "SD-VIDEO-VARIANT-001",
              "action": "Create stub file or wait for SD completion",
              "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
              "priority": "high",
              "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
              "current_progress": 20
            }
          ]
        },
        "location": "Dependencies",
        "severity": "MEDIUM",
        "recommendation": "Review dependency conflicts"
      },
      {
        "issue": "Component integration issues",
        "details": {
          "app": "ehg",
          "details": [
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "VideoVariantTesting",
              "import_count": 1,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
                "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/PerformanceDashboard.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "PerformanceDashboard",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
                "/mnt/c/_EHG/ehg/src/pages/LivePerformancePage.tsx",
                "/mnt/c/_EHG/ehg/src/pages/LiveWorkflowProgress.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/VariantGenerationForm.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "VariantGenerationForm",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "PromptLibraryTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentPresetsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "EVARealtimeVoice",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "AudioWaveform",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingNavBar",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingDashboard",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentSettingsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            }
          ],
          "summary": "4/10 components integrated, 6 warnings",
          "verdict": "WARNING",
          "warnings": [
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/VariantGenerationForm.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "VariantGenerationForm",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "PromptLibraryTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentPresetsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingNavBar",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "EVAMeetingDashboard",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx",
              "issue": "Component built but not integrated (0 imports)",
              "verdict": "WARNING",
              "severity": "medium",
              "component": "AgentSettingsTab",
              "import_count": 0,
              "recommendation": "Verify PRD requirement - component may be unused or integration incomplete"
            }
          ],
          "integrated": [
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "VideoVariantTesting",
              "import_count": 1,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
                "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/creative-media/PerformanceDashboard.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "PerformanceDashboard",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx",
                "/mnt/c/_EHG/ehg/src/pages/LivePerformancePage.tsx",
                "/mnt/c/_EHG/ehg/src/pages/LiveWorkflowProgress.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "EVARealtimeVoice",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            },
            {
              "path": "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
              "verdict": "INTEGRATED",
              "severity": "none",
              "component": "AudioWaveform",
              "import_count": 2,
              "import_locations": [
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx",
                "/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx"
              ]
            }
          ],
          "warnings_count": 6,
          "components_checked": 10,
          "integrations_found": 4
        },
        "location": "Component integration",
        "severity": "MEDIUM",
        "recommendation": "Verify component imports"
      },
      {
        "issue": "User story coverage 0% (requires 100%)",
        "details": {
          "total_stories": 57,
          "e2e_tests_passed": 0,
          "completed_stories": 19,
          "meets_requirement": false,
          "coverage_percentage": 0
        },
        "location": "E2E test coverage",
        "severity": "HIGH",
        "recommendation": "Add E2E tests for uncovered user stories"
      }
    ],
    "recommendations": [
      {
        "type": "REUSE",
        "example": "import { authenticateUser } from '../fixtures/auth';",
        "message": "✅ Use existing authenticateUser() from tests/fixtures/auth.ts",
        "category": "Authentication",
        "priority": "CRITICAL",
        "anti_pattern": "❌ DO NOT write custom auth logic"
      },
      {
        "type": "PATTERN",
        "example": "Use test.beforeEach() for auth, await page.waitForLoadState() for stability",
        "message": "📋 Follow pattern from tests/e2e/agent-admin-comprehensive.spec.ts",
        "category": "E2E Testing",
        "priority": "HIGH"
      },
      {
        "list": [
          "venture-test-utils.ts",
          "wait-utils.ts"
        ],
        "type": "REUSE",
        "message": "✅ 2 helper(s) available in tests/helpers/",
        "category": "Test Helpers",
        "priority": "MEDIUM"
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-050",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Chairman Dashboard: Consolidated 2",
        "current_progress": 30
      },
      {
        "sd": "SD-043",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Development Workflow: Consolidated",
        "current_progress": 30
      },
      {
        "sd": "SD-043",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Development Workflow: Consolidated",
        "current_progress": 30
      },
      {
        "sd": "SD-043",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Development Workflow: Consolidated",
        "current_progress": 30
      },
      {
        "sd": "SD-VIDEO-VARIANT-001",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
        "current_progress": 20
      },
      {
        "sd": "SD-VIDEO-VARIANT-001",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
        "current_progress": 20
      },
      {
        "sd": "SD-VIDEO-VARIANT-001",
        "action": "Create stub file or wait for SD completion",
        "details": "Dependency SD is <50% complete - high risk of incomplete implementation",
        "priority": "high",
        "sd_title": "Sora 2 Video Variant Testing & Optimization Engine",
        "current_progress": 20
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      },
      {
        "type": "INTEGRATION",
        "message": "Verify PRD requirement - component may be unused or integration incomplete",
        "priority": "MEDIUM"
      }
    ],
    "detailed_analysis": "{\"pre_flight\":{\"user_stories\":{\"verdict\":\"PASS\",\"stories_count\":57,\"completed_count\":19,\"stories\":[{\"key\":\"SD-AGENT-ADMIN-003:US-013\",\"title\":\"Browse prompts by category\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-014\",\"title\":\"Create new prompt template\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-015\",\"title\":\"Edit prompt template\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-020\",\"title\":\"Create A/B test with 2-4 variants\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-021\",\"title\":\"Monitor active A/B tests\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-022\",\"title\":\"View A/B test results with statistical confidence\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-023\",\"title\":\"Visualize A/B test results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-024\",\"title\":\"Declare winning variant and deploy\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-025\",\"title\":\"Automatic A/B test data collection\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-026\",\"title\":\"View historical test results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-027\",\"title\":\"Clone test for re-testing\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-028\",\"title\":\"Prevent invalid test configurations\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-029\",\"title\":\"Monaco editor keyboard shortcuts\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-030\",\"title\":\"Link prompts to agent roles\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-031\",\"title\":\"Integrate Prompt Library with Agent Settings\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-032\",\"title\":\"Save agent settings as preset from Settings tab\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-033\",\"title\":\"Show active preset indicator in Settings\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-034\",\"title\":\"Link A/B test results to agent configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-035\",\"title\":\"Validate settings before saving\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-036\",\"title\":\"Export agent configuration as JSON\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-037\",\"title\":\"Reset settings to default values\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-038\",\"title\":\"Configure default search provider\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-039\",\"title\":\"Set search result count preference\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-040\",\"title\":\"Configure search filters (date, region, language)\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-041\",\"title\":\"Safe search filtering preference\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-042\",\"title\":\"Search API rate limit configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-043\",\"title\":\"Custom search API key management\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-044\",\"title\":\"Search result caching preference\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-045\",\"title\":\"Domain blocking for search results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-046\",\"title\":\"Domain prioritization for search results\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-047\",\"title\":\"Search preferences inheritance from presets\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-048\",\"title\":\"View agent execution metrics dashboard\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-049\",\"title\":\"Execution latency trend chart\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-050\",\"title\":\"Token usage breakdown chart\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-051\",\"title\":\"Error rate monitoring chart\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-052\",\"title\":\"Performance alerts configuration\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-053\",\"title\":\"View active performance alerts\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-054\",\"title\":\"Historical alert log\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-055\",\"title\":\"Execution trace viewer\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-056\",\"title\":\"Export performance metrics\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-057\",\"title\":\"Performance comparison between presets\",\"status\":\"ready\"},{\"key\":\"SD-AGENT-ADMIN-003:US-006\",\"title\":\"Export preset to JSON\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-007\",\"title\":\"Import preset from JSON\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-008\",\"title\":\"View preset usage statistics\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-009\",\"title\":\"Validate preset configuration\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-001\",\"title\":\"View all saved presets\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-002\",\"title\":\"Create new preset\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-003\",\"title\":\"Apply preset to agent\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-004\",\"title\":\"Edit existing preset\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-005\",\"title\":\"Delete preset\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-010\",\"title\":\"Preview preset before applying\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-011\",\"title\":\"Categorize presets by use case\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-012\",\"title\":\"Two-way sync with AgentSettingsTab\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-016\",\"title\":\"Version prompt templates\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-017\",\"title\":\"Tag prompts for search\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-018\",\"title\":\"Search prompts by tag/keyword\",\"status\":\"completed\"},{\"key\":\"SD-AGENT-ADMIN-003:US-019\",\"title\":\"Test prompt before deployment\",\"status\":\"completed\"}]},\"migrations\":{\"verdict\":\"NO_MIGRATIONS\",\"message\":\"No database migrations found for SD-AGENT-ADMIN-003\",\"sd_id\":\"SD-AGENT-ADMIN-003\",\"app\":\"ehg\"},\"dependencies\":{\"verdict\":\"WARNING\",\"conflicts\":[{\"import_path\":\"@/components/chairman/CompanySelector\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/PerformanceDriveCycle\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/SynergyOpportunities\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/ExecutiveAlerts\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/AIInsightsEngine\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/VenturePortfolioOverview\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/StrategicKPIMonitor\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/FinancialAnalytics\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/OperationalIntelligence\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/KPISelector\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/chairman/AlertConfiguration\",\"conflicting_sd\":\"SD-050\",\"conflicting_sd_title\":\"Chairman Dashboard: Consolidated 2\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/development/DevelopmentEnvironment\",\"conflicting_sd\":\"SD-043\",\"conflicting_sd_title\":\"Development Workflow: Consolidated\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/development/OnboardingChecklist\",\"conflicting_sd\":\"SD-043\",\"conflicting_sd_title\":\"Development Workflow: Consolidated\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/development/TestingAutomationDashboard\",\"conflicting_sd\":\"SD-043\",\"conflicting_sd_title\":\"Development Workflow: Consolidated\",\"progress\":30,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/testing/TestingDashboard\",\"conflicting_sd\":\"SD-VIDEO-VARIANT-001\",\"conflicting_sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"progress\":20,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/testing/QualityGatesManager\",\"conflicting_sd\":\"SD-VIDEO-VARIANT-001\",\"conflicting_sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"progress\":20,\"status\":\"active\",\"risk\":\"high\"},{\"import_path\":\"@/components/testing/AITestGenerator\",\"conflicting_sd\":\"SD-VIDEO-VARIANT-001\",\"conflicting_sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"progress\":20,\"status\":\"active\",\"risk\":\"high\"}],\"conflicts_count\":17,\"recommendations\":[{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-050\",\"sd_title\":\"Chairman Dashboard: Consolidated 2\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-043\",\"sd_title\":\"Development Workflow: Consolidated\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-043\",\"sd_title\":\"Development Workflow: Consolidated\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-043\",\"sd_title\":\"Development Workflow: Consolidated\",\"current_progress\":30,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-VIDEO-VARIANT-001\",\"sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"current_progress\":20,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-VIDEO-VARIANT-001\",\"sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"current_progress\":20,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"},{\"action\":\"Create stub file or wait for SD completion\",\"sd\":\"SD-VIDEO-VARIANT-001\",\"sd_title\":\"Sora 2 Video Variant Testing & Optimization Engine\",\"current_progress\":20,\"priority\":\"high\",\"details\":\"Dependency SD is <50% complete - high risk of incomplete implementation\"}],\"sd_id\":\"SD-AGENT-ADMIN-003\",\"app\":\"ehg\",\"summary\":\"17 potential conflict(s) detected\"},\"integration\":{\"verdict\":\"WARNING\",\"components_checked\":10,\"integrations_found\":4,\"warnings_count\":6,\"warnings\":[{\"component\":\"VariantGenerationForm\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/VariantGenerationForm.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"PromptLibraryTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentPresetsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVAMeetingNavBar\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVAMeetingDashboard\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentSettingsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0}],\"integrated\":[{\"component\":\"VideoVariantTesting\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":1,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\"],\"severity\":\"none\"},{\"component\":\"PerformanceDashboard\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/PerformanceDashboard.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"/mnt/c/_EHG/ehg/src/pages/LivePerformancePage.tsx\",\"/mnt/c/_EHG/ehg/src/pages/LiveWorkflowProgress.tsx\"],\"severity\":\"none\"},{\"component\":\"EVARealtimeVoice\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"},{\"component\":\"AudioWaveform\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"}],\"details\":[{\"component\":\"VideoVariantTesting\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":1,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\"],\"severity\":\"none\"},{\"component\":\"PerformanceDashboard\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/PerformanceDashboard.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/creative-media/VideoVariantTesting.tsx\",\"/mnt/c/_EHG/ehg/src/pages/LivePerformancePage.tsx\",\"/mnt/c/_EHG/ehg/src/pages/LiveWorkflowProgress.tsx\"],\"severity\":\"none\"},{\"component\":\"VariantGenerationForm\",\"path\":\"/mnt/c/_EHG/ehg/src/components/creative-media/VariantGenerationForm.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"PromptLibraryTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/PromptLibraryTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentPresetsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentPresetsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVARealtimeVoice\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva/EVARealtimeVoice.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"},{\"component\":\"AudioWaveform\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"verdict\":\"INTEGRATED\",\"import_count\":2,\"import_locations\":[\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/components/eva-meeting/AudioWaveform.tsx\",\"/mnt/c/_EHG/ehg/src/pages/EVAAssistantPage.tsx\"],\"severity\":\"none\"},{\"component\":\"EVAMeetingNavBar\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingNavBar.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"EVAMeetingDashboard\",\"path\":\"/mnt/c/_EHG/ehg/src/components/eva-meeting/EVAMeetingDashboard.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0},{\"component\":\"AgentSettingsTab\",\"path\":\"/mnt/c/_EHG/ehg/src/components/agents/AgentSettingsTab.tsx\",\"verdict\":\"WARNING\",\"issue\":\"Component built but not integrated (0 imports)\",\"recommendation\":\"Verify PRD requirement - component may be unused or integration incomplete\",\"severity\":\"medium\",\"import_count\":0}],\"app\":\"ehg\",\"summary\":\"4/10 components integrated, 6 warnings\"}},\"test_planning\":{\"tier_selection\":{\"recommended_tiers\":[{\"name\":\"Smoke Tests\",\"required\":true,\"count\":\"3-5 tests\",\"time_budget\":\"<60 seconds\",\"description\":\"Critical path validation - SUFFICIENT for LEAD approval\",\"priority\":\"MANDATORY\"},{\"name\":\"E2E Tests\",\"required\":true,\"count\":\"10-20 tests\",\"time_budget\":\"<5 minutes\",\"description\":\"User flow validation for UI features\",\"priority\":\"RECOMMENDED\",\"rationale\":\"UI feature detected - E2E tests validate user flows\"},{\"name\":\"Manual Testing\",\"required\":false,\"checklist_size\":\"0\",\"time_budget\":\"N/A\",\"description\":\"Manual validation for complex business logic\",\"priority\":\"SKIP\",\"rationale\":\"No complex logic - automated tests sufficient\"}],\"primary_tier\":{\"name\":\"Smoke Tests\",\"required\":true,\"count\":\"3-5 tests\",\"time_budget\":\"<60 seconds\",\"description\":\"Critical path validation - SUFFICIENT for LEAD approval\",\"priority\":\"MANDATORY\"},\"total_estimated_time_seconds\":360,\"total_estimated_time_display\":\"6m\",\"rationale\":\"Tier 1 (Smoke): Always required for SD-AGENT-ADMIN-003. Tier 2 (E2E): Required - UI feature detected in category/scope. Tier 3 (Manual): Skipped - automated tests sufficient\",\"category\":\"agent-platform\",\"scope_summary\":\"{\\\"total_story_points\\\":115,\\\"estimated_effort\\\":\\\"7-9 days (56-71 hours)\\\",\\\"subsystems\\\":[{\\\"name\\\":\\\"Preset ...\"},\"infrastructure\":{\"verdict\":\"DISCOVERED\",\"infrastructure\":{\"auth_helpers\":[{\"name\":\"auth.ts\",\"path\":\"tests/fixtures/auth.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/fixtures/auth.ts\"}],\"test_helpers\":[{\"name\":\"venture-test-utils.ts\",\"path\":\"tests/helpers/venture-test-utils.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/helpers/venture-test-utils.ts\"},{\"name\":\"wait-utils.ts\",\"path\":\"tests/helpers/wait-utils.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/helpers/wait-utils.ts\"}],\"fixtures\":[],\"configs\":[{\"name\":\"playwright.config.ts\",\"path\":\"/mnt/c/_EHG/ehg/playwright.config.ts\"},{\"name\":\"playwright.config.test.ts\",\"path\":\"/mnt/c/_EHG/ehg/playwright.config.test.ts\"},{\"name\":\"jest.config.js\",\"path\":\"/mnt/c/_EHG/ehg/jest.config.js\"},{\"name\":\"vitest.config.ts\",\"path\":\"/mnt/c/_EHG/ehg/vitest.config.ts\"},{\"name\":\"vitest.config.integration.ts\",\"path\":\"/mnt/c/_EHG/ehg/vitest.config.integration.ts\"}],\"e2e_patterns\":[{\"name\":\"agent-admin-comprehensive.spec.ts\",\"path\":\"tests/e2e/agent-admin-comprehensive.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/agent-admin-comprehensive.spec.ts\"},{\"name\":\"agent-admin-smoke.spec.ts\",\"path\":\"tests/e2e/agent-admin-smoke.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/agent-admin-smoke.spec.ts\"},{\"name\":\"agent-migration-system-a.spec.ts\",\"path\":\"tests/e2e/agent-migration-system-a.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/agent-migration-system-a.spec.ts\"},{\"name\":\"analytics-export.spec.ts\",\"path\":\"tests/e2e/analytics-export.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/analytics-export.spec.ts\"},{\"name\":\"audio-management.spec.ts\",\"path\":\"tests/e2e/audio-management.spec.ts\",\"fullPath\":\"/mnt/c/_EHG/ehg/tests/e2e/audio-management.spec.ts\"}]},\"recommendations\":[{\"type\":\"REUSE\",\"priority\":\"CRITICAL\",\"category\":\"Authentication\",\"message\":\"✅ Use existing authenticateUser() from tests/fixtures/auth.ts\",\"anti_pattern\":\"❌ DO NOT write custom auth logic\",\"example\":\"import { authenticateUser } from '../fixtures/auth';\"},{\"type\":\"PATTERN\",\"priority\":\"HIGH\",\"category\":\"E2E Testing\",\"message\":\"📋 Follow pattern from tests/e2e/agent-admin-comprehensive.spec.ts\",\"example\":\"Use test.beforeEach() for auth, await page.waitForLoadState() for stability\"},{\"type\":\"REUSE\",\"priority\":\"MEDIUM\",\"category\":\"Test Helpers\",\"message\":\"✅ 2 helper(s) available in tests/helpers/\",\"list\":[\"venture-test-utils.ts\",\"wait-utils.ts\"]}],\"summary\":{\"auth_available\":true,\"helpers_count\":2,\"fixtures_count\":0,\"e2e_examples\":5,\"configs_found\":5},\"app\":\"ehg\"}},\"test_execution\":{\"smoke\":{\"executed\":true,\"verdict\":\"FAIL\",\"unit_tests\":{\"verdict\":\"PASS\",\"test_count\":0,\"passed\":0,\"failed\":0,\"duration_seconds\":0,\"coverage_percentage\":null,\"framework\":\"vitest\"},\"e2e_tests\":{\"verdict\":\"FAIL\",\"test_count\":0,\"passed\":0,\"failed\":1,\"duration_seconds\":0,\"framework\":\"playwright\"}}},\"evidence\":{\"screenshots\":[],\"logs\":[],\"coverage\":null,\"test_reports\":[]}}",
    "execution_time": 0,
    "metadata": {
      "summary": {
        "test_plan": {
          "primary_tier": "Smoke Tests",
          "estimated_time": "6m",
          "infrastructure_available": true
        },
        "test_results": {
          "e2e": "NOT_RUN",
          "smoke": "FAIL",
          "manual": false
        },
        "pre_flight_checks": {
          "build": "SKIP",
          "migrations": "NO_MIGRATIONS",
          "integration": "WARNING",
          "dependencies": "WARNING",
          "user_stories": "PASS",
          "user_story_count": 57,
          "user_story_coverage": "0%"
        },
        "user_story_validation": {
          "total_stories": 57,
          "e2e_tests_passed": 0,
          "completed_stories": 19,
          "meets_requirement": false,
          "coverage_percentage": 0
        }
      },
      "target_app": "ehg",
      "time_saved": "1-2 hours"
    },
    "created_at": "2025-10-10T18:29:08.703Z",
    "updated_at": "2025-10-10T18:29:08.703Z",
    "risk_assessment_id": null
  },
  {
    "id": "6972557d-55ae-4bdb-9994-a02bed986f4a",
    "sd_id": "SD-LEO-004",
    "sub_agent_code": "DATABASE",
    "sub_agent_name": "Principal Database Architect",
    "verdict": "FAIL",
    "confidence": 50,
    "critical_issues": [],
    "warnings": [],
    "recommendations": [
      "No additional type safety improvements needed at this time",
      "Consider periodic reviews of plpgsql functions for type safety"
    ],
    "detailed_analysis": "Function test or priority tests failed. See evidence for details.",
    "execution_time": 0,
    "metadata": {
      "functionTest": {
        "passed": true,
        "details": {
          "can_proceed": false,
          "all_verified": false,
          "missing_count": 4,
          "missing_agents": [
            {
              "code": "TESTING",
              "name": "QA Engineering Director",
              "reason": "Always required for all SDs",
              "priority": "CRITICAL",
              "trigger_keywords": [
                "test",
                "coverage",
                "quality"
              ]
            },
            {
              "code": "DESIGN",
              "name": "Design Agent",
              "reason": "Required because scope mentions UI/UX features",
              "priority": "HIGH",
              "trigger_keywords": [
                "UI",
                "component",
                "design",
                "interface",
                "page"
              ]
            },
            {
              "code": "PERFORMANCE",
              "name": "Performance Lead",
              "reason": "Required because scope mentions performance or SD priority is high",
              "priority": "MEDIUM",
              "trigger_keywords": [
                "performance",
                "optimization",
                "load",
                "scale"
              ]
            },
            {
              "code": "RETRO",
              "name": "Continuous Improvement Coach",
              "reason": "Always required to generate retrospective at SD completion",
              "priority": "CRITICAL",
              "trigger_keywords": [
                "retrospective",
                "lessons",
                "improvement"
              ]
            }
          ],
          "total_required": 4,
          "verified_count": 0,
          "verified_agents": []
        }
      },
      "priorityTests": {
        "passed": false,
        "details": [
          {
            "error": "new row for relation \"strategic_directives_v2\" violates check constraint \"check_target_application\"",
            "passed": false,
            "priority": "critical"
          },
          {
            "error": "new row for relation \"strategic_directives_v2\" violates check constraint \"check_target_application\"",
            "passed": false,
            "priority": "high"
          },
          {
            "error": "new row for relation \"strategic_directives_v2\" violates check constraint \"check_target_application\"",
            "passed": false,
            "priority": "medium"
          },
          {
            "error": "new row for relation \"strategic_directives_v2\" violates check constraint \"check_target_application\"",
            "passed": false,
            "priority": "low"
          }
        ]
      },
      "recommendations": [
        "No additional type safety improvements needed at this time",
        "Consider periodic reviews of plpgsql functions for type safety"
      ],
      "typeMismatchScan": {
        "passed": true,
        "details": []
      }
    },
    "created_at": "2025-10-10T21:23:42.198Z",
    "updated_at": "2025-10-10T21:23:42.198Z",
    "risk_assessment_id": null
  },
  {
    "id": "6250b099-fa78-431b-a539-386c9397efe7",
    "sd_id": "SD-LEO-004",
    "sub_agent_code": "DATABASE",
    "sub_agent_name": "Principal Database Architect",
    "verdict": "PASS",
    "confidence": 95,
    "critical_issues": [],
    "warnings": [],
    "recommendations": [
      "Fix is correct and complete",
      "No additional type safety improvements needed at this time",
      "Consider SQL linting in CI/CD to catch type mismatches early"
    ],
    "detailed_analysis": "Function fix verified successfully. Type mismatch resolved. Function executes correctly with SD-LEO-004. No similar issues found in other functions. Smoke tests passed.",
    "execution_time": 0,
    "metadata": {
      "type_scan": {
        "passed": true,
        "other_issues": []
      },
      "git_commit": "c85ff8a",
      "smoke_tests": "15/15 passed",
      "function_test": {
        "passed": true
      }
    },
    "created_at": "2025-10-10T21:24:47.985Z",
    "updated_at": "2025-10-10T21:24:47.985Z",
    "risk_assessment_id": null
  }
]
```

### Schema: `sub_agent_executions`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| prd_id | text | NO | NULL |
| sub_agent_id | uuid | NO | NULL |
| status | text | NO | NULL |
| results | jsonb | YES | '{}'::jsonb |
| started_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | NULL |
| error_message | text | YES | NULL |
| execution_time_ms | integer | YES | NULL |
| context_id | text | YES | NULL |
| context_type | text | YES | 'prd'::text |
| sub_agent_code | text | YES | NULL |
| execution_trigger | text | YES | NULL |
| validation_result | text | YES | NULL |
| confidence_score | integer | YES | NULL |
| findings | jsonb | YES | '[]'::jsonb |
| recommendations | jsonb | YES | '[]'::jsonb |
| issues_found | jsonb | YES | '[]'::jsonb |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_40053_1_not_null | CHECK | - | - |
| 2200_40053_2_not_null | CHECK | - | - |
| 2200_40053_3_not_null | CHECK | - | - |
| 2200_40053_4_not_null | CHECK | - | - |
| sub_agent_executions_status_check | CHECK | - | sub_agent_executions(status) |
| sub_agent_executions_sub_agent_id_fkey | FOREIGN KEY | sub_agent_id | leo_sub_agents(id) |
| sub_agent_executions_pkey | PRIMARY KEY | id | sub_agent_executions(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_sub_agent_executions | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_sub_agent_executions | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 1 rows)

```json
[
  {
    "id": "346d055e-a5ad-4574-a100-6efe4e3a4112",
    "prd_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "sub_agent_id": "fc963dd4-db60-468f-90f8-a6e07222b1ac",
    "status": "pass",
    "results": {
      "priority": "HIGH",
      "coverage_analysis": {
        "missing_tests": [
          "Integration tests",
          "State machine tests",
          "Security tests",
          "Load tests"
        ],
        "recommendation": "Expand test suite to reach 75% minimum coverage",
        "target_coverage": "75%",
        "current_coverage": "50%"
      },
      "estimated_effort_hours": 8,
      "test_categories_needed": 5
    },
    "started_at": "2025-09-23T20:45:07.965Z",
    "completed_at": "2025-09-23T20:46:28.658Z",
    "error_message": null,
    "execution_time_ms": 2500,
    "context_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "context_type": "prd",
    "sub_agent_code": "TESTING",
    "execution_trigger": null,
    "validation_result": "PASS",
    "confidence_score": null,
    "findings": [],
    "recommendations": [],
    "issues_found": [],
    "created_at": "2025-09-23T20:45:07.965Z"
  }
]
```

### Schema: `sub_agent_gate_requirements`

**Row Count**: 13

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| context_type | text | NO | NULL |
| trigger_condition | text | NO | NULL |
| required_sub_agents | ARRAY | NO | NULL |
| gate_priority | integer | YES | 1 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_53469_1_not_null | CHECK | - | - |
| 2200_53469_2_not_null | CHECK | - | - |
| 2200_53469_3_not_null | CHECK | - | - |
| 2200_53469_4_not_null | CHECK | - | - |
| sub_agent_gate_requirements_pkey | PRIMARY KEY | id | sub_agent_gate_requirements(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_sub_agent_gate_requirements | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_sub_agent_gate_requirements | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "45b2c374-be05-4982-a9a5-b8173bd3c761",
    "context_type": "prd_generation",
    "trigger_condition": "schema",
    "required_sub_agents": [
      "DATABASE",
      "VALIDATION"
    ],
    "gate_priority": 1,
    "created_at": "2025-09-24T18:58:38.880Z",
    "updated_at": "2025-09-24T18:58:38.880Z"
  },
  {
    "id": "b637df32-a721-4bf0-95db-3b39f0c369c0",
    "context_type": "prd_generation",
    "trigger_condition": "security",
    "required_sub_agents": [
      "SECURITY",
      "VALIDATION"
    ],
    "gate_priority": 1,
    "created_at": "2025-09-24T18:58:38.880Z",
    "updated_at": "2025-09-24T18:58:38.880Z"
  },
  {
    "id": "68d7c190-6348-419e-9aca-98dce5d4b1e9",
    "context_type": "prd_generation",
    "trigger_condition": "authentication",
    "required_sub_agents": [
      "SECURITY",
      "TESTING",
      "VALIDATION"
    ],
    "gate_priority": 1,
    "created_at": "2025-09-24T18:58:38.880Z",
    "updated_at": "2025-09-24T18:58:38.880Z"
  },
  {
    "id": "daa62a0b-381a-4b8d-a921-147320d6c669",
    "context_type": "prd_generation",
    "trigger_condition": "ui_component",
    "required_sub_agents": [
      "DESIGN",
      "TESTING"
    ],
    "gate_priority": 1,
    "created_at": "2025-09-24T18:58:38.880Z",
    "updated_at": "2025-09-24T18:58:38.880Z"
  },
  {
    "id": "d9e5d82f-ade8-4f4c-a6c4-131644b8a1ae",
    "context_type": "prd_generation",
    "trigger_condition": "api_endpoint",
    "required_sub_agents": [
      "SECURITY",
      "DATABASE",
      "TESTING"
    ],
    "gate_priority": 1,
    "created_at": "2025-09-24T18:58:38.880Z",
    "updated_at": "2025-09-24T18:58:38.880Z"
  }
]
```

### Schema: `subagent_activations`

**Row Count**: 20

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | NO | NULL |
| activating_agent | text | NO | NULL |
| phase | text | NO | NULL |
| subagent_code | text | NO | NULL |
| subagent_name | text | NO | NULL |
| activation_trigger | text | NO | NULL |
| activation_context | jsonb | YES | '{}'::jsonb |
| status | text | NO | 'requested'::text |
| execution_notes | text | YES | NULL |
| execution_results | jsonb | YES | NULL |
| activated_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_52943_1_not_null | CHECK | - | - |
| 2200_52943_2_not_null | CHECK | - | - |
| 2200_52943_3_not_null | CHECK | - | - |
| 2200_52943_4_not_null | CHECK | - | - |
| 2200_52943_5_not_null | CHECK | - | - |
| 2200_52943_6_not_null | CHECK | - | - |
| 2200_52943_7_not_null | CHECK | - | - |
| 2200_52943_9_not_null | CHECK | - | - |
| subagent_activations_activating_agent_check | CHECK | - | subagent_activations(activating_agent) |
| subagent_activations_phase_check | CHECK | - | subagent_activations(phase) |
| subagent_activations_status_check | CHECK | - | subagent_activations(status) |
| subagent_activations_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| subagent_activations_pkey | PRIMARY KEY | id | subagent_activations(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_subagent_activations | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_subagent_activations | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "58034fa8-8e38-42d4-ad24-6205b2466699",
    "sd_id": "SD-001",
    "activating_agent": "PLAN",
    "phase": "planning",
    "subagent_code": "VALIDATION",
    "subagent_name": "Validation Sub-Agent",
    "activation_trigger": "retrospective_analysis",
    "activation_context": {
      "failure_type": "not_activated"
    },
    "status": "failed",
    "execution_notes": "PLAN agent failed to activate VALIDATION sub-agent during PRD creation",
    "execution_results": null,
    "activated_at": "2025-09-24T14:42:20.991Z",
    "completed_at": null,
    "created_at": "2025-09-24T14:42:20.991Z",
    "updated_at": "2025-09-24T14:42:20.991Z"
  },
  {
    "id": "12f0f9d0-3cf7-44ad-8acf-b4e811f2133f",
    "sd_id": "SD-001",
    "activating_agent": "PLAN",
    "phase": "planning",
    "subagent_code": "DATABASE",
    "subagent_name": "Database Sub-Agent",
    "activation_trigger": "retrospective_analysis",
    "activation_context": {
      "failure_type": "not_activated"
    },
    "status": "failed",
    "execution_notes": "PLAN agent failed to activate DATABASE sub-agent during PRD creation",
    "execution_results": null,
    "activated_at": "2025-09-24T14:42:20.991Z",
    "completed_at": null,
    "created_at": "2025-09-24T14:42:20.991Z",
    "updated_at": "2025-09-24T14:42:20.991Z"
  },
  {
    "id": "68e16999-425a-46b6-8b06-e17e28332724",
    "sd_id": "SD-001",
    "activating_agent": "PLAN",
    "phase": "planning",
    "subagent_code": "SECURITY",
    "subagent_name": "Security Sub-Agent",
    "activation_trigger": "retrospective_analysis",
    "activation_context": {
      "failure_type": "not_activated"
    },
    "status": "failed",
    "execution_notes": "PLAN agent failed to activate SECURITY sub-agent during PRD creation",
    "execution_results": null,
    "activated_at": "2025-09-24T14:42:20.991Z",
    "completed_at": null,
    "created_at": "2025-09-24T14:42:20.991Z",
    "updated_at": "2025-09-24T14:42:20.991Z"
  },
  {
    "id": "d248e322-a117-444f-9856-1ef557f54f89",
    "sd_id": "SD-001",
    "activating_agent": "PLAN",
    "phase": "planning",
    "subagent_code": "DESIGN",
    "subagent_name": "Design Sub-Agent",
    "activation_trigger": "retrospective_analysis",
    "activation_context": {
      "failure_type": "not_activated"
    },
    "status": "failed",
    "execution_notes": "PLAN agent failed to activate DESIGN sub-agent during PRD creation",
    "execution_results": null,
    "activated_at": "2025-09-24T14:42:20.991Z",
    "completed_at": null,
    "created_at": "2025-09-24T14:42:20.991Z",
    "updated_at": "2025-09-24T14:42:20.991Z"
  },
  {
    "id": "ded74e04-ab5d-4aad-a9a5-dde6c7b9ed9f",
    "sd_id": "SD-001",
    "activating_agent": "EXEC",
    "phase": "implementation",
    "subagent_code": "DATABASE",
    "subagent_name": "Database Sub-Agent",
    "activation_trigger": "user_prompt",
    "activation_context": {
      "eventually_activated": true
    },
    "status": "completed",
    "execution_notes": "Eventually activated after user prompted about database sub-agent usage",
    "execution_results": null,
    "activated_at": "2025-09-24T14:42:20.991Z",
    "completed_at": null,
    "created_at": "2025-09-24T14:42:20.991Z",
    "updated_at": "2025-09-24T14:42:20.991Z"
  }
]
```

### Schema: `subagent_requirements`

**Row Count**: 216

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | YES | NULL |
| phase | text | NO | NULL |
| required_subagents | ARRAY | NO | '{}'::text[] |
| optional_subagents | ARRAY | YES | '{}'::text[] |
| requirements_met | boolean | YES | false |
| checked_at | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_52964_1_not_null | CHECK | - | - |
| 2200_52964_3_not_null | CHECK | - | - |
| 2200_52964_4_not_null | CHECK | - | - |
| subagent_requirements_phase_check | CHECK | - | subagent_requirements(phase) |
| subagent_requirements_sd_id_fkey | FOREIGN KEY | sd_id | strategic_directives_v2(id) |
| subagent_requirements_pkey | PRIMARY KEY | id | subagent_requirements(id) |
| subagent_requirements_sd_id_phase_key | UNIQUE | sd_id | subagent_requirements(sd_id) |
| subagent_requirements_sd_id_phase_key | UNIQUE | phase | subagent_requirements(phase) |
| subagent_requirements_sd_id_phase_key | UNIQUE | phase | subagent_requirements(sd_id) |
| subagent_requirements_sd_id_phase_key | UNIQUE | sd_id | subagent_requirements(phase) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| authenticated_read_subagent_requirements | SELECT | "{authenticated}" | PERMISSIVE |
| service_role_all_subagent_requirements | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "aef6b13a-f5af-47f2-ba5a-62afcc67387a",
    "sd_id": "SD-MONITORING-001",
    "phase": "planning",
    "required_subagents": [
      "VALIDATION",
      "DATABASE",
      "DESIGN",
      "SECURITY"
    ],
    "optional_subagents": [
      "TESTING",
      "PERFORMANCE"
    ],
    "requirements_met": false,
    "checked_at": null,
    "created_at": "2025-09-24T14:42:20.726Z",
    "updated_at": "2025-09-24T14:42:20.726Z"
  },
  {
    "id": "21de3c20-6619-4a21-828c-f4a4a06b8f57",
    "sd_id": "SD-BACKLOG-INT-001",
    "phase": "planning",
    "required_subagents": [
      "VALIDATION",
      "DATABASE",
      "SECURITY"
    ],
    "optional_subagents": [
      "TESTING",
      "PERFORMANCE"
    ],
    "requirements_met": false,
    "checked_at": null,
    "created_at": "2025-09-24T14:42:20.726Z",
    "updated_at": "2025-09-24T14:42:20.726Z"
  },
  {
    "id": "d07110d9-d988-4af5-9136-c2ce5620f767",
    "sd_id": "SD-PIPELINE-001",
    "phase": "planning",
    "required_subagents": [
      "VALIDATION",
      "DATABASE",
      "DESIGN",
      "SECURITY"
    ],
    "optional_subagents": [
      "TESTING",
      "PERFORMANCE"
    ],
    "requirements_met": false,
    "checked_at": null,
    "created_at": "2025-09-24T14:42:20.726Z",
    "updated_at": "2025-09-24T14:42:20.726Z"
  },
  {
    "id": "c652d222-c5c1-4dd4-90e1-29216f570eb1",
    "sd_id": "SD-WSJF-001",
    "phase": "planning",
    "required_subagents": [
      "VALIDATION",
      "DATABASE",
      "DESIGN",
      "SECURITY"
    ],
    "optional_subagents": [
      "TESTING",
      "PERFORMANCE"
    ],
    "requirements_met": false,
    "checked_at": null,
    "created_at": "2025-09-24T14:42:20.726Z",
    "updated_at": "2025-09-24T14:42:20.726Z"
  },
  {
    "id": "582a10c5-1818-48b0-93b4-ae1863ea901c",
    "sd_id": "SD-VISION-001",
    "phase": "planning",
    "required_subagents": [
      "VALIDATION",
      "DATABASE",
      "DESIGN",
      "SECURITY"
    ],
    "optional_subagents": [
      "TESTING",
      "PERFORMANCE"
    ],
    "requirements_met": false,
    "checked_at": null,
    "created_at": "2025-09-24T14:42:20.726Z",
    "updated_at": "2025-09-24T14:42:20.726Z"
  }
]
```

### Schema: `v_agent_documentation_compliance`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| agent_type | text | YES | NULL |
| total_operations | bigint | YES | NULL |
| violations | bigint | YES | NULL |
| authorized_ops | bigint | YES | NULL |
| compliance_rate | numeric | YES | NULL |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data

ℹ️ No data in table.

### Schema: `v_contexts_missing_sub_agents`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| context_id | text | YES | NULL |
| context_type | text | YES | NULL |
| executed_agents | bigint | YES | NULL |
| executed_agent_list | text | YES | NULL |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data (first 1 rows)

```json
[
  {
    "context_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "context_type": "prd",
    "executed_agents": "1",
    "executed_agent_list": "TESTING"
  }
]
```

### Schema: `v_sub_agent_execution_history`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | YES | NULL |
| context_id | text | YES | NULL |
| context_type | text | YES | NULL |
| sub_agent_code | text | YES | NULL |
| execution_trigger | text | YES | NULL |
| legacy_status | text | YES | NULL |
| validation_result | text | YES | NULL |
| confidence_score | integer | YES | NULL |
| findings | jsonb | YES | NULL |
| recommendations | jsonb | YES | NULL |
| issues_found | jsonb | YES | NULL |
| executed_at | timestamp with time zone | YES | NULL |
| completed_at | timestamp with time zone | YES | NULL |
| overall_status | text | YES | NULL |
| execution_time_ms | integer | YES | NULL |
| actual_execution_time_ms | numeric | YES | NULL |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data (first 1 rows)

```json
[
  {
    "id": "346d055e-a5ad-4574-a100-6efe4e3a4112",
    "context_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "context_type": "prd",
    "sub_agent_code": "TESTING",
    "execution_trigger": null,
    "legacy_status": "pass",
    "validation_result": "PASS",
    "confidence_score": null,
    "findings": [],
    "recommendations": [],
    "issues_found": [],
    "executed_at": "2025-09-23T20:45:07.965Z",
    "completed_at": "2025-09-23T20:46:28.658Z",
    "overall_status": "SUCCESS",
    "execution_time_ms": 2500,
    "actual_execution_time_ms": "80693.103000"
  }
]
```

### Schema: `v_sub_agent_executions_unified`

**Row Count**: 1

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | YES | NULL |
| prd_id | text | YES | NULL |
| sub_agent_id | uuid | YES | NULL |
| status | text | YES | NULL |
| results | jsonb | YES | NULL |
| started_at | timestamp with time zone | YES | NULL |
| completed_at | timestamp with time zone | YES | NULL |
| error_message | text | YES | NULL |
| execution_time_ms | integer | YES | NULL |
| context_id | text | YES | NULL |
| context_type | text | YES | NULL |
| sub_agent_code | text | YES | NULL |
| execution_trigger | text | YES | NULL |
| validation_result | text | YES | NULL |
| confidence_score | integer | YES | NULL |
| findings | jsonb | YES | NULL |
| recommendations | jsonb | YES | NULL |
| issues_found | jsonb | YES | NULL |
| created_at | timestamp with time zone | YES | NULL |
| execution_status | text | YES | NULL |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data (first 1 rows)

```json
[
  {
    "id": "346d055e-a5ad-4574-a100-6efe4e3a4112",
    "prd_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "sub_agent_id": "fc963dd4-db60-468f-90f8-a6e07222b1ac",
    "status": "pass",
    "results": {
      "priority": "HIGH",
      "coverage_analysis": {
        "missing_tests": [
          "Integration tests",
          "State machine tests",
          "Security tests",
          "Load tests"
        ],
        "recommendation": "Expand test suite to reach 75% minimum coverage",
        "target_coverage": "75%",
        "current_coverage": "50%"
      },
      "estimated_effort_hours": 8,
      "test_categories_needed": 5
    },
    "started_at": "2025-09-23T20:45:07.965Z",
    "completed_at": "2025-09-23T20:46:28.658Z",
    "error_message": null,
    "execution_time_ms": 2500,
    "context_id": "a57d5700-c3f3-4b13-8ff9-ba572ea34a74",
    "context_type": "prd",
    "sub_agent_code": "TESTING",
    "execution_trigger": null,
    "validation_result": "PASS",
    "confidence_score": null,
    "findings": [],
    "recommendations": [],
    "issues_found": [],
    "created_at": "2025-09-23T20:45:07.965Z",
    "execution_status": "completed"
  }
]
```

### Schema: `v_subagent_compliance`

**Row Count**: 399

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| sd_id | character varying(50) | YES | NULL |
| sd_title | character varying(500) | YES | NULL |
| target_application | character varying(20) | YES | NULL |
| sd_status | character varying(50) | YES | NULL |
| phase | text | YES | NULL |
| required_subagents | ARRAY | YES | NULL |
| requirements_met | boolean | YES | NULL |
| checked_at | timestamp with time zone | YES | NULL |
| activated_count | bigint | YES | NULL |
| required_count | integer | YES | NULL |
| compliance_percentage | numeric | YES | NULL |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data (first 5 rows)

```json
[
  {
    "sd_id": "0784495f-bbcf-4b44-8967-d24a4cf789ed",
    "sd_title": "Strategic Directive: Full Implementation of Portfolios Section for Enhanced Multi-Company Portfolio Management",
    "target_application": "EHG",
    "sd_status": "cancelled",
    "phase": null,
    "required_subagents": null,
    "requirements_met": null,
    "checked_at": null,
    "activated_count": "0",
    "required_count": 0,
    "compliance_percentage": "100.0"
  },
  {
    "sd_id": "07d6252f-1c1f-480b-9ddd-f151b018012e",
    "sd_title": "Venture Documents Tab: File Management & Collaboration",
    "target_application": "EHG",
    "sd_status": "completed",
    "phase": null,
    "required_subagents": null,
    "requirements_met": null,
    "checked_at": null,
    "activated_count": "0",
    "required_count": 0,
    "compliance_percentage": "100.0"
  },
  {
    "sd_id": "0d5f1ecc-80b1-4a9c-b4e1-d1bd4a373cda",
    "sd_title": "Immediate Replacement of Mock Data with Real Database Connection in Venture Portfolio Management Dashboard",
    "target_application": "EHG",
    "sd_status": "completed",
    "phase": null,
    "required_subagents": null,
    "requirements_met": null,
    "checked_at": null,
    "activated_count": "0",
    "required_count": 0,
    "compliance_percentage": "100.0"
  },
  {
    "sd_id": "134d4381-150d-4d27-9637-063503b9ebae",
    "sd_title": "Strategic Directive: Resolution of Integration Hub Failures",
    "target_application": "EHG",
    "sd_status": "cancelled",
    "phase": null,
    "required_subagents": null,
    "requirements_met": null,
    "checked_at": null,
    "activated_count": "0",
    "required_count": 0,
    "compliance_percentage": "100.0"
  },
  {
    "sd_id": "1880c0b7-e19c-490b-91e4-15d5228dbd1c",
    "sd_title": "Strategic Directive: Ensuring Functionality and Accessibility of Advanced Analytics Features",
    "target_application": "EHG",
    "sd_status": "cancelled",
    "phase": null,
    "required_subagents": null,
    "requirements_met": null,
    "checked_at": null,
    "activated_count": "0",
    "required_count": 0,
    "compliance_percentage": "100.0"
  }
]
```

---

## EHG Application Database Analysis (Operational)

**Project ID**: liapbndqlqxdcgpwntbv
**Purpose**: Customer-facing features, CrewAI operations, business logic

### Tables Found

| Table Name | Row Count | Columns | Constraints | RLS Policies |
|------------|-----------|---------|-------------|-------------|
| agent_avatars | 66 | 12 | 10 | 1 |
| agent_configs | 0 | 10 | 10 | 4 |
| agent_departments | 12 | 8 | 5 | 1 |
| agent_executions | 0 | 16 | 51 | 1 |
| agent_executions_2025_10 | 0 | 16 | 51 | 0 |
| agent_executions_2025_11 | 0 | 16 | 51 | 0 |
| agent_executions_2025_12 | 0 | 16 | 51 | 0 |
| agent_knowledge | 0 | 10 | 4 | 1 |
| agent_performance_metrics | 0 | 15 | 5 | 1 |
| agent_tools | 8 | 11 | 5 | 1 |
| crew_members | 8 | 6 | 8 | 1 |
| crewai_agents | 30 | 17 | 9 | 1 |
| crewai_crews | 2 | 8 | 5 | 1 |
| crewai_flow_executions | 0 | 18 | 8 | 2 |
| crewai_flow_templates | 3 | 16 | 6 | 2 |
| crewai_flows | 3 | 21 | 8 | 7 |
| crewai_tasks | 0 | 15 | 8 | 3 |
| eva_agent_communications | 0 | 18 | 9 | 1 |
| rd_department_agents | 7 | 11 | 10 | 1 |
| sub_agent_execution_results | 123 | 10 | 5 | 2 |

### Schema: `agent_avatars`

**Row Count**: 66

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | uuid_generate_v4() |
| agent_id | uuid | NO | NULL |
| variant_number | integer | NO | NULL |
| avatar_url | text | NO | NULL |
| description | text | YES | NULL |
| ethnicity | character varying(50) | YES | NULL |
| gender | character varying(20) | YES | NULL |
| background_setting | text | YES | NULL |
| generation_status | character varying(20) | YES | 'pending'::character varying |
| prompt_used | text | YES | NULL |
| created_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_77169_1_not_null | CHECK | - | - |
| 2200_77169_2_not_null | CHECK | - | - |
| 2200_77169_3_not_null | CHECK | - | - |
| 2200_77169_4_not_null | CHECK | - | - |
| agent_avatars_variant_number_check | CHECK | - | agent_avatars(variant_number) |
| agent_avatars_pkey | PRIMARY KEY | id | agent_avatars(id) |
| agent_avatars_agent_id_variant_number_key | UNIQUE | agent_id | agent_avatars(agent_id) |
| agent_avatars_agent_id_variant_number_key | UNIQUE | variant_number | agent_avatars(variant_number) |
| agent_avatars_agent_id_variant_number_key | UNIQUE | variant_number | agent_avatars(agent_id) |
| agent_avatars_agent_id_variant_number_key | UNIQUE | agent_id | agent_avatars(variant_number) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Public read access to avatars | SELECT | "{public}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "d81f6b10-489f-4d9c-b1e1-998b2c43d4db",
    "agent_id": "00000000-0000-0000-0000-000000000003",
    "variant_number": 1,
    "avatar_url": "/agent-research-analyst---competitive-intelligence-v1.png",
    "description": "Caucasian female Research Analyst - Competitive Intelligence",
    "ethnicity": "Caucasian",
    "gender": "female",
    "background_setting": "Modern glass office with city skyline view softly in background",
    "generation_status": "completed",
    "prompt_used": "Professional corporate headshot of a confident Caucasian female Research Analyst - Competitive Intelligence in early to mid 30s.\nFair to light complexion, polished executive presence, professional styled hair.\nProfessional expression showing expertise and confidence. Premium business attire, sophisticated appearance.\nModern glass office with city skyline view softly in background\nHead and shoulders composition, direct professional gaze. Shot with high-end camera, 85mm f/1.4 lens.\nProfessional lighting. Square composition (1024x1024).\nPhotorealistic executive headshot with natural skin texture visible.\nExpert professional persona.",
    "created_at": "2025-10-11T20:48:35.526Z",
    "updated_at": "2025-10-11T20:48:35.526Z"
  },
  {
    "id": "431d005e-6fc7-4f96-828b-5c77d2eec779",
    "agent_id": "00000000-0000-0000-0000-000000000003",
    "variant_number": 2,
    "avatar_url": "/agent-research-analyst---competitive-intelligence-v2.png",
    "description": "Dominican female Research Analyst - Competitive Intelligence",
    "ethnicity": "Dominican",
    "gender": "female",
    "background_setting": "Contemporary tech office with digital displays softly visible",
    "generation_status": "completed",
    "prompt_used": "Professional corporate headshot of a confident Dominican female Research Analyst - Competitive Intelligence in early to mid 30s.\nDominican heritage with beautiful blend of Taino, African, and Spanish features. Warm caramel to bronze skin tone, natural dark hair.\nProfessional expression showing expertise and confidence. Premium business attire, sophisticated appearance.\nContemporary tech office with digital displays softly visible\nHead and shoulders composition, direct professional gaze. Shot with high-end camera, 85mm f/1.4 lens.\nProfessional lighting. Square composition (1024x1024).\nPhotorealistic executive headshot with natural skin texture visible.\nExpert professional persona.",
    "created_at": "2025-10-11T20:49:40.262Z",
    "updated_at": "2025-10-11T20:49:40.262Z"
  },
  {
    "id": "7e74cc03-138d-4023-8249-ac66b6097570",
    "agent_id": "00000000-0000-0000-0000-000000000003",
    "variant_number": 3,
    "avatar_url": "/agent-research-analyst---competitive-intelligence-v3.png",
    "description": "Dominican male Research Analyst - Competitive Intelligence",
    "ethnicity": "Dominican",
    "gender": "male",
    "background_setting": "Traditional executive office with bookshelf softly in background",
    "generation_status": "completed",
    "prompt_used": "Professional corporate headshot of a confident Dominican male Research Analyst - Competitive Intelligence in mid to late 30s.\nDominican heritage with elegant blend of Taino indigenous, African, and Spanish features. Warm bronze to caramel skin tone.\nProfessional expression showing expertise and confidence. Premium business attire, sophisticated appearance.\nTraditional executive office with bookshelf softly in background\nHead and shoulders composition, direct professional gaze. Shot with high-end camera, 85mm f/1.4 lens.\nProfessional lighting. Square composition (1024x1024).\nPhotorealistic executive headshot with natural skin texture visible.\nExpert professional persona.",
    "created_at": "2025-10-11T20:50:30.785Z",
    "updated_at": "2025-10-11T20:50:30.785Z"
  },
  {
    "id": "a9bb5f3e-f377-43ea-856c-fdd732234b9c",
    "agent_id": "11111111-1111-1111-1111-111111111003",
    "variant_number": 1,
    "avatar_url": "/agent-competitive-analyst-v1.png",
    "description": "Caucasian male Competitive Analyst",
    "ethnicity": "Caucasian",
    "gender": "male",
    "background_setting": "Modern glass office with city skyline view softly in background",
    "generation_status": "completed",
    "prompt_used": "Professional corporate headshot of a confident Caucasian male Competitive Analyst in mid to late 30s.\nFair to light olive complexion, clean-cut professional appearance.\nProfessional expression showing expertise and confidence. Premium business attire, sophisticated appearance.\nModern glass office with city skyline view softly in background\nHead and shoulders composition, direct professional gaze. Shot with high-end camera, 85mm f/1.4 lens.\nProfessional lighting. Square composition (1024x1024).\nPhotorealistic executive headshot with natural skin texture visible.\nExpert professional persona.",
    "created_at": "2025-10-11T20:51:13.102Z",
    "updated_at": "2025-10-11T20:51:13.102Z"
  },
  {
    "id": "666077fd-77c7-4eb7-9377-518573039922",
    "agent_id": "11111111-1111-1111-1111-111111111003",
    "variant_number": 2,
    "avatar_url": "/agent-competitive-analyst-v2.png",
    "description": "Dominican male Competitive Analyst",
    "ethnicity": "Dominican",
    "gender": "male",
    "background_setting": "Contemporary tech office with digital displays softly visible",
    "generation_status": "completed",
    "prompt_used": "Professional corporate headshot of a confident Dominican male Competitive Analyst in mid to late 30s.\nDominican heritage with elegant blend of Taino indigenous, African, and Spanish features. Warm bronze to caramel skin tone.\nProfessional expression showing expertise and confidence. Premium business attire, sophisticated appearance.\nContemporary tech office with digital displays softly visible\nHead and shoulders composition, direct professional gaze. Shot with high-end camera, 85mm f/1.4 lens.\nProfessional lighting. Square composition (1024x1024).\nPhotorealistic executive headshot with natural skin texture visible.\nExpert professional persona.",
    "created_at": "2025-10-11T20:51:58.349Z",
    "updated_at": "2025-10-11T20:51:58.349Z"
  }
]
```

### Schema: `agent_configs`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | NULL |
| preset_name | text | NO | NULL |
| description | text | YES | NULL |
| config_json | jsonb | NO | '{}'::jsonb |
| category | text | YES | NULL |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| deleted_at | timestamp with time zone | YES | NULL |
| usage_count | integer | NO | 0 |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_75690_10_not_null | CHECK | - | - |
| 2200_75690_1_not_null | CHECK | - | - |
| 2200_75690_2_not_null | CHECK | - | - |
| 2200_75690_3_not_null | CHECK | - | - |
| 2200_75690_5_not_null | CHECK | - | - |
| 2200_75690_7_not_null | CHECK | - | - |
| 2200_75690_8_not_null | CHECK | - | - |
| agent_configs_category_check | CHECK | - | agent_configs(category) |
| agent_configs_preset_name_check | CHECK | - | agent_configs(preset_name) |
| agent_configs_pkey | PRIMARY KEY | id | agent_configs(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| agent_configs_delete_policy | UPDATE | "{public}" | PERMISSIVE |
| agent_configs_insert_policy | INSERT | "{public}" | PERMISSIVE |
| agent_configs_select_policy | SELECT | "{public}" | PERMISSIVE |
| agent_configs_update_policy | UPDATE | "{public}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_departments`

**Row Count**: 12

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| department_name | character varying(100) | NO | NULL |
| department_head_id | uuid | YES | NULL |
| parent_department_id | uuid | YES | NULL |
| description | text | YES | NULL |
| status | character varying(20) | YES | 'active'::character varying |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_77771_1_not_null | CHECK | - | - |
| 2200_77771_2_not_null | CHECK | - | - |
| agent_departments_parent_department_id_fkey | FOREIGN KEY | parent_department_id | agent_departments(id) |
| agent_departments_pkey | PRIMARY KEY | id | agent_departments(id) |
| agent_departments_department_name_key | UNIQUE | department_name | agent_departments(department_name) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can read departments | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "a847a326-36fa-499a-9d69-e9542ffa0fb1",
    "department_name": "R&D",
    "department_head_id": null,
    "parent_department_id": null,
    "description": "Research & Development department for innovation and product development",
    "status": "active",
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "b869f9c5-6847-4c69-9688-6f3df80fa117",
    "department_name": "Marketing",
    "department_head_id": null,
    "parent_department_id": null,
    "description": "Marketing department for brand strategy and customer acquisition",
    "status": "active",
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "eb50bb94-9f47-4733-a540-c509ecbc8e06",
    "department_name": "Sales",
    "department_head_id": null,
    "parent_department_id": null,
    "description": "Sales department for revenue generation and customer relationships",
    "status": "active",
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "77da892a-50f4-4622-8eed-4a1f420af8be",
    "department_name": "Finance",
    "department_head_id": null,
    "parent_department_id": null,
    "description": "Finance department for financial planning and analysis",
    "status": "active",
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "d4539519-0022-41d8-9ce9-5c3efaac31e6",
    "department_name": "Legal & Compliance",
    "department_head_id": null,
    "parent_department_id": null,
    "description": "Legal department for regulatory compliance and risk management",
    "status": "active",
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  }
]
```

### Schema: `agent_executions`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_id | uuid | YES | NULL |
| agent_name | character varying(255) | YES | NULL |
| execution_type | character varying(50) | YES | NULL |
| outcome | character varying(20) | NO | NULL |
| latency_ms | integer | YES | NULL |
| token_count | integer | YES | NULL |
| input_summary | text | YES | NULL |
| output_summary | text | YES | NULL |
| error_details | text | YES | NULL |
| trace_data | jsonb | YES | NULL |
| preset_id | uuid | YES | NULL |
| prompt_id | uuid | YES | NULL |
| ab_test_id | uuid | YES | NULL |
| ab_variant | character varying(1) | YES | NULL |
| created_at | timestamp without time zone | NO | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78498_16_not_null | CHECK | - | - |
| 2200_78498_1_not_null | CHECK | - | - |
| 2200_78498_5_not_null | CHECK | - | - |
| agent_executions_latency_ms_check | CHECK | - | agent_executions(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_10(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_11(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_12(latency_ms) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_12(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_10(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_11(outcome) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_12(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_11(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_10(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions(token_count) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_pkey | PRIMARY KEY | created_at | agent_executions(id) |
| agent_executions_pkey | PRIMARY KEY | created_at | agent_executions(created_at) |
| agent_executions_pkey | PRIMARY KEY | id | agent_executions(id) |
| agent_executions_pkey | PRIMARY KEY | id | agent_executions(created_at) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| agent_executions_authenticated_all | ALL | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_executions_2025_10`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_id | uuid | YES | NULL |
| agent_name | character varying(255) | YES | NULL |
| execution_type | character varying(50) | YES | NULL |
| outcome | character varying(20) | NO | NULL |
| latency_ms | integer | YES | NULL |
| token_count | integer | YES | NULL |
| input_summary | text | YES | NULL |
| output_summary | text | YES | NULL |
| error_details | text | YES | NULL |
| trace_data | jsonb | YES | NULL |
| preset_id | uuid | YES | NULL |
| prompt_id | uuid | YES | NULL |
| ab_test_id | uuid | YES | NULL |
| ab_variant | character varying(1) | YES | NULL |
| created_at | timestamp without time zone | NO | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78518_16_not_null | CHECK | - | - |
| 2200_78518_1_not_null | CHECK | - | - |
| 2200_78518_5_not_null | CHECK | - | - |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_11(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_12(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_10(latency_ms) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_12(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_10(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_11(outcome) |
| agent_executions_token_count_check | CHECK | - | agent_executions(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_11(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_10(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_12(token_count) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_2025_10_pkey | PRIMARY KEY | id | agent_executions_2025_10(created_at) |
| agent_executions_2025_10_pkey | PRIMARY KEY | created_at | agent_executions_2025_10(id) |
| agent_executions_2025_10_pkey | PRIMARY KEY | created_at | agent_executions_2025_10(created_at) |
| agent_executions_2025_10_pkey | PRIMARY KEY | id | agent_executions_2025_10(id) |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_executions_2025_11`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_id | uuid | YES | NULL |
| agent_name | character varying(255) | YES | NULL |
| execution_type | character varying(50) | YES | NULL |
| outcome | character varying(20) | NO | NULL |
| latency_ms | integer | YES | NULL |
| token_count | integer | YES | NULL |
| input_summary | text | YES | NULL |
| output_summary | text | YES | NULL |
| error_details | text | YES | NULL |
| trace_data | jsonb | YES | NULL |
| preset_id | uuid | YES | NULL |
| prompt_id | uuid | YES | NULL |
| ab_test_id | uuid | YES | NULL |
| ab_variant | character varying(1) | YES | NULL |
| created_at | timestamp without time zone | NO | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78536_16_not_null | CHECK | - | - |
| 2200_78536_1_not_null | CHECK | - | - |
| 2200_78536_5_not_null | CHECK | - | - |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_11(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_12(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_10(latency_ms) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_12(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_10(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_11(outcome) |
| agent_executions_token_count_check | CHECK | - | agent_executions(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_11(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_10(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_12(token_count) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_2025_11_pkey | PRIMARY KEY | id | agent_executions_2025_11(created_at) |
| agent_executions_2025_11_pkey | PRIMARY KEY | created_at | agent_executions_2025_11(id) |
| agent_executions_2025_11_pkey | PRIMARY KEY | created_at | agent_executions_2025_11(created_at) |
| agent_executions_2025_11_pkey | PRIMARY KEY | id | agent_executions_2025_11(id) |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_executions_2025_12`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_id | uuid | YES | NULL |
| agent_name | character varying(255) | YES | NULL |
| execution_type | character varying(50) | YES | NULL |
| outcome | character varying(20) | NO | NULL |
| latency_ms | integer | YES | NULL |
| token_count | integer | YES | NULL |
| input_summary | text | YES | NULL |
| output_summary | text | YES | NULL |
| error_details | text | YES | NULL |
| trace_data | jsonb | YES | NULL |
| preset_id | uuid | YES | NULL |
| prompt_id | uuid | YES | NULL |
| ab_test_id | uuid | YES | NULL |
| ab_variant | character varying(1) | YES | NULL |
| created_at | timestamp without time zone | NO | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78554_16_not_null | CHECK | - | - |
| 2200_78554_1_not_null | CHECK | - | - |
| 2200_78554_5_not_null | CHECK | - | - |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_11(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_12(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions(latency_ms) |
| agent_executions_latency_ms_check | CHECK | - | agent_executions_2025_10(latency_ms) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_12(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_10(outcome) |
| agent_executions_outcome_check | CHECK | - | agent_executions_2025_11(outcome) |
| agent_executions_token_count_check | CHECK | - | agent_executions(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_11(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_10(token_count) |
| agent_executions_token_count_check | CHECK | - | agent_executions_2025_12(token_count) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_ab_test_id_fkey | FOREIGN KEY | ab_test_id | prompt_ab_tests(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_prompt_id_fkey | FOREIGN KEY | prompt_id | prompt_templates(id) |
| agent_executions_2025_12_pkey | PRIMARY KEY | id | agent_executions_2025_12(created_at) |
| agent_executions_2025_12_pkey | PRIMARY KEY | created_at | agent_executions_2025_12(id) |
| agent_executions_2025_12_pkey | PRIMARY KEY | created_at | agent_executions_2025_12(created_at) |
| agent_executions_2025_12_pkey | PRIMARY KEY | id | agent_executions_2025_12(id) |

#### RLS Policies

❌ No RLS policies configured for this table.

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_knowledge`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| source_type | character varying(50) | NO | NULL |
| source_id | uuid | YES | NULL |
| content | text | NO | NULL |
| embedding | USER-DEFINED | YES | NULL |
| metadata | jsonb | YES | '{}'::jsonb |
| chairman_feedback | jsonb | YES | NULL |
| quality_score | numeric | YES | 0.0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78215_1_not_null | CHECK | - | - |
| 2200_78215_2_not_null | CHECK | - | - |
| 2200_78215_4_not_null | CHECK | - | - |
| agent_knowledge_pkey | PRIMARY KEY | id | agent_knowledge(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can read knowledge | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_performance_metrics`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| metric_id | uuid | NO | gen_random_uuid() |
| agent_id | uuid | NO | NULL |
| company_id | uuid | NO | NULL |
| decision_count | integer | YES | 0 |
| success_rate | numeric | YES | NULL |
| average_confidence | numeric | YES | NULL |
| chairman_override_rate | numeric | YES | NULL |
| processing_time_avg | numeric | YES | NULL |
| execution_time_ms | integer | YES | NULL |
| quality_score | numeric | YES | NULL |
| chairman_rating | numeric | YES | NULL |
| task_type | text | YES | NULL |
| session_id | uuid | YES | NULL |
| performance_metrics | jsonb | YES | '{}'::jsonb |
| recorded_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_71889_1_not_null | CHECK | - | - |
| 2200_71889_2_not_null | CHECK | - | - |
| 2200_71889_3_not_null | CHECK | - | - |
| agent_performance_metrics_company_id_fkey | FOREIGN KEY | company_id | companies(id) |
| agent_performance_metrics_pkey | PRIMARY KEY | metric_id | agent_performance_metrics(metric_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| agent_perf_company_access | SELECT | "{public}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `agent_tools`

**Row Count**: 8

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| tool_name | character varying(100) | NO | NULL |
| tool_type | character varying(50) | NO | NULL |
| description | text | YES | NULL |
| configuration | jsonb | YES | '{}'::jsonb |
| rate_limit_per_minute | integer | YES | 0 |
| allowed_agent_roles | ARRAY | YES | '{}'::text[] |
| status | character varying(20) | YES | 'active'::character varying |
| usage_count | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_78246_1_not_null | CHECK | - | - |
| 2200_78246_2_not_null | CHECK | - | - |
| 2200_78246_3_not_null | CHECK | - | - |
| agent_tools_pkey | PRIMARY KEY | id | agent_tools(id) |
| agent_tools_tool_name_key | UNIQUE | tool_name | agent_tools(tool_name) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can read tools | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "bd2560eb-d424-49b8-9d2a-0a38b87b7bfc",
    "tool_name": "search_openvc",
    "tool_type": "api",
    "description": "Search OpenVC database for company funding and investor data",
    "configuration": {
      "free": true,
      "base_url": "https://api.openvc.app"
    },
    "rate_limit_per_minute": 0,
    "allowed_agent_roles": [],
    "status": "active",
    "usage_count": 0,
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "1ed55792-12e2-4b8e-92a7-1ef04897d8ba",
    "tool_name": "search_growjo",
    "tool_type": "api",
    "description": "Search Growjo for company growth and intelligence data",
    "configuration": {
      "free": true,
      "base_url": "https://growjo.com/api"
    },
    "rate_limit_per_minute": 0,
    "allowed_agent_roles": [],
    "status": "active",
    "usage_count": 0,
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "8ccfbecf-7652-42b5-b53b-efe51a0cb9f5",
    "tool_name": "search_reddit",
    "tool_type": "api",
    "description": "Search Reddit for community insights and sentiment (100 QPM free)",
    "configuration": {
      "base_url": "https://www.reddit.com/api/v1",
      "rate_limit": 100
    },
    "rate_limit_per_minute": 100,
    "allowed_agent_roles": [],
    "status": "active",
    "usage_count": 0,
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "8ac0148e-a2c2-4ece-b3f8-140c3965fbbe",
    "tool_name": "search_hackernews",
    "tool_type": "api",
    "description": "Search HackerNews for tech trends and discussions (unlimited free)",
    "configuration": {
      "free": true,
      "base_url": "https://hn.algolia.com/api/v1"
    },
    "rate_limit_per_minute": 0,
    "allowed_agent_roles": [],
    "status": "active",
    "usage_count": 0,
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  },
  {
    "id": "a2e5d129-e3e9-4ea4-a8dc-421b8302ddda",
    "tool_name": "query_knowledge_base",
    "tool_type": "database",
    "description": "Semantic search of agent knowledge base using pgvector",
    "configuration": {
      "table": "agent_knowledge",
      "similarity_threshold": 0.8
    },
    "rate_limit_per_minute": 0,
    "allowed_agent_roles": [],
    "status": "active",
    "usage_count": 0,
    "created_at": "2025-10-10T14:46:34.789Z",
    "updated_at": "2025-10-10T14:46:34.789Z"
  }
]
```

### Schema: `crew_members`

**Row Count**: 8

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| crew_id | uuid | YES | NULL |
| agent_id | uuid | YES | NULL |
| role_in_crew | character varying(50) | YES | 'member'::character varying |
| sequence_order | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_77839_1_not_null | CHECK | - | - |
| crew_members_agent_id_fkey | FOREIGN KEY | agent_id | crewai_agents(id) |
| crew_members_crew_id_fkey | FOREIGN KEY | crew_id | crewai_crews(id) |
| crew_members_pkey | PRIMARY KEY | id | crew_members(id) |
| crew_members_crew_id_agent_id_key | UNIQUE | crew_id | crew_members(crew_id) |
| crew_members_crew_id_agent_id_key | UNIQUE | agent_id | crew_members(agent_id) |
| crew_members_crew_id_agent_id_key | UNIQUE | agent_id | crew_members(crew_id) |
| crew_members_crew_id_agent_id_key | UNIQUE | crew_id | crew_members(agent_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can read crew members | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "33333333-3333-3333-3333-333333333001",
    "crew_id": "22222222-2222-2222-2222-222222222001",
    "agent_id": "11111111-1111-1111-1111-111111111001",
    "role_in_crew": "Lead market analyst",
    "sequence_order": 1,
    "created_at": "2025-10-11T03:49:13.204Z"
  },
  {
    "id": "33333333-3333-3333-3333-333333333002",
    "crew_id": "22222222-2222-2222-2222-222222222001",
    "agent_id": "11111111-1111-1111-1111-111111111002",
    "role_in_crew": "Customer insights specialist",
    "sequence_order": 2,
    "created_at": "2025-10-11T03:49:13.204Z"
  },
  {
    "id": "33333333-3333-3333-3333-333333333003",
    "crew_id": "22222222-2222-2222-2222-222222222001",
    "agent_id": "11111111-1111-1111-1111-111111111003",
    "role_in_crew": "Competitive intelligence",
    "sequence_order": 3,
    "created_at": "2025-10-11T03:49:13.204Z"
  },
  {
    "id": "33333333-3333-3333-3333-333333333004",
    "crew_id": "22222222-2222-2222-2222-222222222001",
    "agent_id": "11111111-1111-1111-1111-111111111004",
    "role_in_crew": "Portfolio strategist",
    "sequence_order": 4,
    "created_at": "2025-10-11T03:49:13.204Z"
  },
  {
    "id": "23ca467d-e873-4a2b-94bb-6df07fe3daa4",
    "crew_id": "99d69b38-2e4b-4575-a001-5cf9c571ee49",
    "agent_id": "80043400-f088-4f98-a8b9-991a4bd17c74",
    "role_in_crew": "member",
    "sequence_order": 1,
    "created_at": "2025-10-30T13:13:10.281Z"
  }
]
```

### Schema: `crewai_agents`

**Row Count**: 30

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| agent_key | character varying(100) | NO | NULL |
| name | character varying(200) | NO | NULL |
| role | text | NO | NULL |
| goal | text | NO | NULL |
| backstory | text | NO | NULL |
| department_id | uuid | YES | NULL |
| tools | ARRAY | YES | '{}'::text[] |
| llm_model | character varying(50) | YES | 'gpt-4-turbo-preview'::character varying |
| max_tokens | integer | YES | 4000 |
| temperature | numeric | YES | 0.7 |
| status | character varying(20) | YES | 'active'::character varying |
| execution_count | integer | YES | 0 |
| avg_execution_time_ms | integer | YES | 0 |
| last_executed_at | timestamp with time zone | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_77791_1_not_null | CHECK | - | - |
| 2200_77791_2_not_null | CHECK | - | - |
| 2200_77791_3_not_null | CHECK | - | - |
| 2200_77791_4_not_null | CHECK | - | - |
| 2200_77791_5_not_null | CHECK | - | - |
| 2200_77791_6_not_null | CHECK | - | - |
| crewai_agents_department_id_fkey | FOREIGN KEY | department_id | agent_departments(id) |
| crewai_agents_pkey | PRIMARY KEY | id | crewai_agents(id) |
| crewai_agents_agent_key_key | UNIQUE | agent_key | crewai_agents(agent_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can read agents | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "11111111-1111-1111-1111-111111111001",
    "agent_key": "market-analyst",
    "name": "Market Intelligence Agent",
    "role": "Market Analyst",
    "goal": "Analyze market trends and competitive landscape",
    "backstory": "Expert in market research with 15 years experience in venture capital markets",
    "department_id": "a847a326-36fa-499a-9d69-e9542ffa0fb1",
    "tools": [
      "web_search",
      "document_analysis",
      "data_query"
    ],
    "llm_model": "gpt-4",
    "max_tokens": 4000,
    "temperature": "0.70",
    "status": "active",
    "execution_count": 0,
    "avg_execution_time_ms": 0,
    "last_executed_at": null,
    "created_at": "2025-10-11T03:49:13.187Z",
    "updated_at": "2025-10-11T03:49:13.187Z"
  },
  {
    "id": "11111111-1111-1111-1111-111111111002",
    "agent_key": "customer-insights",
    "name": "Customer Insights Agent",
    "role": "Customer Research Specialist",
    "goal": "Understand customer needs and behavior patterns",
    "backstory": "Customer psychology expert with background in behavioral economics",
    "department_id": "a847a326-36fa-499a-9d69-e9542ffa0fb1",
    "tools": [
      "web_search",
      "data_query",
      "chart_generator"
    ],
    "llm_model": "gpt-4",
    "max_tokens": 4000,
    "temperature": "0.70",
    "status": "active",
    "execution_count": 0,
    "avg_execution_time_ms": 0,
    "last_executed_at": null,
    "created_at": "2025-10-11T03:49:13.187Z",
    "updated_at": "2025-10-11T03:49:13.187Z"
  },
  {
    "id": "11111111-1111-1111-1111-111111111003",
    "agent_key": "competitive-intel",
    "name": "Competitive Intelligence Agent",
    "role": "Competitive Analyst",
    "goal": "Monitor competitors and identify market opportunities",
    "backstory": "Former strategy consultant specializing in competitive analysis",
    "department_id": "a847a326-36fa-499a-9d69-e9542ffa0fb1",
    "tools": [
      "web_search",
      "document_analysis",
      "api_integration"
    ],
    "llm_model": "gpt-4",
    "max_tokens": 4000,
    "temperature": "0.70",
    "status": "active",
    "execution_count": 0,
    "avg_execution_time_ms": 0,
    "last_executed_at": null,
    "created_at": "2025-10-11T03:49:13.187Z",
    "updated_at": "2025-10-11T03:49:13.187Z"
  },
  {
    "id": "11111111-1111-1111-1111-111111111004",
    "agent_key": "portfolio-strategist",
    "name": "Portfolio Strategy Agent",
    "role": "Strategic Planner",
    "goal": "Optimize venture portfolio and investment strategy",
    "backstory": "Seasoned venture capital strategist with portfolio management expertise",
    "department_id": "a847a326-36fa-499a-9d69-e9542ffa0fb1",
    "tools": [
      "data_query",
      "chart_generator",
      "document_analysis"
    ],
    "llm_model": "gpt-4",
    "max_tokens": 4000,
    "temperature": "0.70",
    "status": "active",
    "execution_count": 0,
    "avg_execution_time_ms": 0,
    "last_executed_at": null,
    "created_at": "2025-10-11T03:49:13.187Z",
    "updated_at": "2025-10-11T03:49:13.187Z"
  },
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "agent_key": "vp-of-research",
    "name": "VP of Research",
    "role": "VP of Portfolio Research",
    "goal": "Lead strategic research initiatives and competitive intelligence gathering",
    "backstory": "Seasoned research executive with deep experience in portfolio intelligence, trend detection, and competitive monitoring. Leads research team operations.",
    "department_id": null,
    "tools": [],
    "llm_model": "gpt-4",
    "max_tokens": 4000,
    "temperature": "0.70",
    "status": "active",
    "execution_count": 0,
    "avg_execution_time_ms": 0,
    "last_executed_at": null,
    "created_at": "2025-10-11T16:25:04.778Z",
    "updated_at": "2025-10-11T16:25:04.778Z"
  }
]
```

### Schema: `crewai_crews`

**Row Count**: 2

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| crew_name | character varying(100) | NO | NULL |
| crew_type | character varying(50) | YES | 'sequential'::character varying |
| manager_agent_id | uuid | YES | NULL |
| description | text | YES | NULL |
| status | character varying(20) | YES | 'active'::character varying |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_77818_1_not_null | CHECK | - | - |
| 2200_77818_2_not_null | CHECK | - | - |
| crewai_crews_manager_agent_id_fkey | FOREIGN KEY | manager_agent_id | crewai_agents(id) |
| crewai_crews_pkey | PRIMARY KEY | id | crewai_crews(id) |
| crewai_crews_crew_name_key | UNIQUE | crew_name | crewai_crews(crew_name) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can read crews | SELECT | "{authenticated}" | PERMISSIVE |

#### Sample Data (first 2 rows)

```json
[
  {
    "id": "22222222-2222-2222-2222-222222222001",
    "crew_name": "Venture Research Crew",
    "crew_type": "sequential",
    "manager_agent_id": null,
    "description": "AI-powered research team for venture analysis and market intelligence",
    "status": "active",
    "created_at": "2025-10-11T03:48:50.605Z",
    "updated_at": "2025-10-11T03:48:50.605Z"
  },
  {
    "id": "99d69b38-2e4b-4575-a001-5cf9c571ee49",
    "crew_name": "Venture Quick Validation Crew",
    "crew_type": "hierarchical",
    "manager_agent_id": null,
    "description": "Multi-agent research crew for rapid venture validation with market sizing, pain point validation, competitive analysis, and strategic fit assessment",
    "status": "active",
    "created_at": "2025-10-30T13:13:10.281Z",
    "updated_at": "2025-10-30T13:13:10.281Z"
  }
]
```

### Schema: `crewai_flow_executions`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| flow_id | uuid | NO | NULL |
| execution_key | character varying(100) | NO | NULL |
| input_state | jsonb | YES | NULL |
| output_state | jsonb | YES | NULL |
| status | character varying(20) | YES | 'pending'::character varying |
| error_message | text | YES | NULL |
| error_stack | text | YES | NULL |
| error_type | character varying(100) | YES | NULL |
| started_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES | NULL |
| duration_ms | integer | YES | NULL |
| token_count | integer | YES | NULL |
| cost_usd | numeric | YES | NULL |
| board_meeting_id | uuid | YES | NULL |
| executed_by | uuid | YES | NULL |
| execution_mode | character varying(20) | YES | 'manual'::character varying |
| metadata | jsonb | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_80537_1_not_null | CHECK | - | - |
| 2200_80537_2_not_null | CHECK | - | - |
| 2200_80537_3_not_null | CHECK | - | - |
| crewai_flow_executions_execution_mode_check | CHECK | - | crewai_flow_executions(execution_mode) |
| crewai_flow_executions_status_check | CHECK | - | crewai_flow_executions(status) |
| crewai_flow_executions_flow_id_fkey | FOREIGN KEY | flow_id | crewai_flows(id) |
| crewai_flow_executions_pkey | PRIMARY KEY | id | crewai_flow_executions(id) |
| crewai_flow_executions_execution_key_key | UNIQUE | execution_key | crewai_flow_executions(execution_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| executions_create | INSERT | "{public}" | PERMISSIVE |
| executions_read_own | SELECT | "{public}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `crewai_flow_templates`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| template_key | character varying(100) | NO | NULL |
| template_name | character varying(200) | NO | NULL |
| description | text | YES | NULL |
| category | character varying(50) | YES | NULL |
| template_definition | jsonb | NO | NULL |
| required_parameters | jsonb | YES | NULL |
| is_official | boolean | YES | false |
| usage_count | integer | YES | 0 |
| rating_average | numeric | YES | NULL |
| rating_count | integer | YES | 0 |
| created_by | uuid | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| metadata | jsonb | YES | NULL |
| tags | ARRAY | YES | ARRAY[]::text[] |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_80563_1_not_null | CHECK | - | - |
| 2200_80563_2_not_null | CHECK | - | - |
| 2200_80563_3_not_null | CHECK | - | - |
| 2200_80563_6_not_null | CHECK | - | - |
| crewai_flow_templates_pkey | PRIMARY KEY | id | crewai_flow_templates(id) |
| crewai_flow_templates_template_key_key | UNIQUE | template_key | crewai_flow_templates(template_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| templates_create_user | INSERT | "{public}" | PERMISSIVE |
| templates_read_all | SELECT | "{public}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "fbc85691-2c06-498b-b1f0-686f7c6cffba",
    "template_key": "weekly-board-meeting",
    "template_name": "Weekly Board Meeting",
    "description": "Standard weekly board meeting workflow with parallel reports from CFO, CTO, and GTM, followed by discussion and voting",
    "category": "board_meeting",
    "template_definition": {
      "edges": [
        {
          "source": "start",
          "target": "parallel-reports"
        },
        {
          "source": "parallel-reports",
          "target": "eva-synthesis"
        },
        {
          "source": "eva-synthesis",
          "target": "decision"
        },
        {
          "label": "no",
          "source": "decision",
          "target": "voting"
        },
        {
          "label": "yes",
          "source": "decision",
          "target": "end"
        },
        {
          "source": "voting",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "label": "Start Meeting"
          },
          "type": "start"
        },
        {
          "id": "parallel-reports",
          "data": {
            "label": "Board Reports",
            "tasks": [
              "cfo_report",
              "cto_report",
              "gtm_report"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "eva-synthesis",
          "data": {
            "agent": "EVA",
            "label": "EVA Synthesizes"
          },
          "type": "agent_task"
        },
        {
          "id": "decision",
          "data": {
            "label": "Red Flags?",
            "condition": "has_red_flags"
          },
          "type": "decision"
        },
        {
          "id": "voting",
          "data": {
            "label": "Board Vote",
            "tasks": [
              "board_vote"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "end",
          "data": {
            "label": "End Meeting"
          },
          "type": "end"
        }
      ]
    },
    "required_parameters": {
      "agenda_items": "array",
      "meeting_date": "string"
    },
    "is_official": true,
    "usage_count": 0,
    "rating_average": null,
    "rating_count": 0,
    "created_by": null,
    "created_at": "2025-10-11T22:03:44.397Z",
    "updated_at": "2025-10-11T22:03:44.397Z",
    "metadata": {
      "estimated_duration": "15-20 minutes",
      "board_members_required": 7
    },
    "tags": []
  },
  {
    "id": "3394ae5f-2392-4245-a6b4-108f2f6d56cc",
    "template_key": "emergency-board-session",
    "template_name": "Emergency Board Session",
    "description": "Urgent decision-making workflow triggered by critical events (burn rate, compliance issues, etc.)",
    "category": "board_meeting",
    "template_definition": {
      "edges": [
        {
          "source": "start",
          "target": "responsible-member"
        },
        {
          "source": "responsible-member",
          "target": "parallel-analysis"
        },
        {
          "source": "parallel-analysis",
          "target": "debate"
        },
        {
          "source": "debate",
          "target": "decision-type"
        },
        {
          "source": "decision-type",
          "target": "weighted-vote"
        },
        {
          "source": "weighted-vote",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "label": "Emergency Trigger"
          },
          "type": "start"
        },
        {
          "id": "responsible-member",
          "data": {
            "label": "Present Situation"
          },
          "type": "agent_task"
        },
        {
          "id": "parallel-analysis",
          "data": {
            "label": "Board Analysis"
          },
          "type": "parallel"
        },
        {
          "id": "debate",
          "data": {
            "label": "Discussion"
          },
          "type": "agent_task"
        },
        {
          "id": "decision-type",
          "data": {
            "label": "Decision Type"
          },
          "type": "router"
        },
        {
          "id": "weighted-vote",
          "data": {
            "label": "Weighted Voting"
          },
          "type": "parallel"
        },
        {
          "id": "end",
          "data": {
            "label": "Record Decision"
          },
          "type": "end"
        }
      ]
    },
    "required_parameters": {
      "severity": "string",
      "trigger_event": "string"
    },
    "is_official": true,
    "usage_count": 0,
    "rating_average": null,
    "rating_count": 0,
    "created_by": null,
    "created_at": "2025-10-11T22:03:44.397Z",
    "updated_at": "2025-10-11T22:03:44.397Z",
    "metadata": {
      "estimated_duration": "20-30 minutes",
      "requires_unanimous": false
    },
    "tags": []
  },
  {
    "id": "b593ac02-78e8-4362-ae60-37e71146ce5e",
    "template_key": "investment-approval",
    "template_name": "Investment Approval Workflow",
    "description": "Comprehensive venture investment analysis and approval process with multi-domain expert evaluation",
    "category": "board_meeting",
    "template_definition": {
      "edges": [
        {
          "source": "start",
          "target": "ceo-presentation"
        },
        {
          "source": "ceo-presentation",
          "target": "parallel-analysis"
        },
        {
          "source": "parallel-analysis",
          "target": "wait"
        },
        {
          "source": "wait",
          "target": "blocker-check"
        },
        {
          "label": "yes",
          "source": "blocker-check",
          "target": "reject"
        },
        {
          "label": "no",
          "source": "blocker-check",
          "target": "board-discussion"
        },
        {
          "source": "board-discussion",
          "target": "weighted-vote"
        },
        {
          "source": "weighted-vote",
          "target": "vote-decision"
        },
        {
          "label": "yes",
          "source": "vote-decision",
          "target": "approve"
        },
        {
          "label": "no",
          "source": "vote-decision",
          "target": "reject"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "label": "Venture Proposal"
          },
          "type": "start"
        },
        {
          "id": "ceo-presentation",
          "data": {
            "label": "AI CEO Presents"
          },
          "type": "agent_task"
        },
        {
          "id": "parallel-analysis",
          "data": {
            "label": "Expert Analysis",
            "tasks": [
              "cfo_financial",
              "cto_technical",
              "gtm_market",
              "legal_compliance"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "wait",
          "data": {
            "label": "Wait for All"
          },
          "type": "wait"
        },
        {
          "id": "blocker-check",
          "data": {
            "label": "Any Blockers?"
          },
          "type": "router"
        },
        {
          "id": "board-discussion",
          "data": {
            "label": "Q&A with CEO"
          },
          "type": "agent_task"
        },
        {
          "id": "weighted-vote",
          "data": {
            "label": "Board Vote"
          },
          "type": "parallel"
        },
        {
          "id": "vote-decision",
          "data": {
            "label": "Vote Passes?"
          },
          "type": "decision"
        },
        {
          "id": "approve",
          "data": {
            "label": "Approve + RAID Log"
          },
          "type": "end"
        },
        {
          "id": "reject",
          "data": {
            "label": "Reject + Feedback"
          },
          "type": "end"
        }
      ]
    },
    "required_parameters": {
      "venture_id": "uuid",
      "venture_stage": "string",
      "investment_amount": "number"
    },
    "is_official": true,
    "usage_count": 0,
    "rating_average": null,
    "rating_count": 0,
    "created_by": null,
    "created_at": "2025-10-11T22:03:44.397Z",
    "updated_at": "2025-10-11T22:03:44.397Z",
    "metadata": {
      "threshold": "60% weighted approval",
      "estimated_duration": "25-35 minutes"
    },
    "tags": []
  }
]
```

### Schema: `crewai_flows`

**Row Count**: 3

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| flow_key | character varying(100) | NO | NULL |
| flow_name | character varying(200) | NO | NULL |
| description | text | YES | NULL |
| flow_definition | jsonb | NO | NULL |
| python_code | text | YES | NULL |
| status | character varying(20) | YES | 'draft'::character varying |
| version | integer | YES | 1 |
| parent_flow_id | uuid | YES | NULL |
| created_by | uuid | YES | NULL |
| updated_by | uuid | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| published_at | timestamp with time zone | YES | NULL |
| metadata | jsonb | YES | NULL |
| tags | ARRAY | YES | ARRAY[]::text[] |
| execution_count | integer | YES | 0 |
| last_executed_at | timestamp with time zone | YES | NULL |
| is_template | boolean | YES | false |
| template_category | character varying(50) | YES | NULL |
| avg_execution_time_ms | integer | YES | 0 |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_80510_1_not_null | CHECK | - | - |
| 2200_80510_2_not_null | CHECK | - | - |
| 2200_80510_3_not_null | CHECK | - | - |
| 2200_80510_5_not_null | CHECK | - | - |
| crewai_flows_status_check | CHECK | - | crewai_flows(status) |
| crewai_flows_parent_flow_id_fkey | FOREIGN KEY | parent_flow_id | crewai_flows(id) |
| crewai_flows_pkey | PRIMARY KEY | id | crewai_flows(id) |
| crewai_flows_flow_key_key | UNIQUE | flow_key | crewai_flows(flow_key) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| Authenticated users can create flows | INSERT | "{authenticated}" | PERMISSIVE |
| Authenticated users can read flows | SELECT | "{authenticated}" | PERMISSIVE |
| Users can update their own flows | UPDATE | "{authenticated}" | PERMISSIVE |
| flows_create_own | INSERT | "{public}" | PERMISSIVE |
| flows_delete_own_draft | DELETE | "{public}" | PERMISSIVE |
| flows_read_active | SELECT | "{public}" | PERMISSIVE |
| flows_update_own | UPDATE | "{public}" | PERMISSIVE |

#### Sample Data (first 3 rows)

```json
[
  {
    "id": "9ea88392-e001-42b1-b6db-c61c0f10084a",
    "flow_key": "board-weekly-meeting-v1",
    "flow_name": "Board Weekly Meeting",
    "description": "Standard weekly board meeting: CFO report, CTO update, GTM report, synthesis, voting",
    "flow_definition": {
      "edges": [
        {
          "source": "start",
          "target": "cfo"
        },
        {
          "source": "cfo",
          "target": "eva"
        },
        {
          "source": "cto",
          "target": "eva"
        },
        {
          "source": "gtm",
          "target": "eva"
        },
        {
          "source": "eva",
          "target": "vote"
        },
        {
          "source": "vote",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "initial_state": {
              "meeting_type": "weekly"
            }
          },
          "type": "start"
        },
        {
          "id": "cfo",
          "data": {
            "task": "Financial report",
            "agent_role": "CFO"
          },
          "type": "agent_task"
        },
        {
          "id": "cto",
          "data": {
            "task": "Technical update",
            "agent_role": "CTO"
          },
          "type": "agent_task"
        },
        {
          "id": "gtm",
          "data": {
            "task": "Market report",
            "agent_role": "GTM Strategist"
          },
          "type": "agent_task"
        },
        {
          "id": "eva",
          "data": {
            "task": "Synthesize reports",
            "agent_role": "Board Chair"
          },
          "type": "agent_task"
        },
        {
          "id": "vote",
          "data": {
            "task": "Board voting"
          },
          "type": "parallel"
        },
        {
          "id": "end",
          "type": "end"
        }
      ]
    },
    "python_code": null,
    "status": "active",
    "version": 1,
    "parent_flow_id": null,
    "created_by": null,
    "updated_by": null,
    "created_at": "2025-10-11T22:11:15.433Z",
    "updated_at": "2025-10-11T22:11:15.433Z",
    "published_at": null,
    "metadata": null,
    "tags": [],
    "execution_count": 0,
    "last_executed_at": null,
    "is_template": true,
    "template_category": "board_governance",
    "avg_execution_time_ms": 0
  },
  {
    "id": "eb9f10d6-b538-4026-8ed7-96d233c421c4",
    "flow_key": "board-emergency-session-v1",
    "flow_name": "Emergency Board Session",
    "description": "Emergency board session: Critical issue presented, board analysis, debate, weighted voting",
    "flow_definition": {
      "edges": [
        {
          "source": "start",
          "target": "present"
        },
        {
          "source": "present",
          "target": "analyze"
        },
        {
          "source": "analyze",
          "target": "debate"
        },
        {
          "source": "debate",
          "target": "vote"
        },
        {
          "source": "vote",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "initial_state": {
              "meeting_type": "emergency"
            }
          },
          "type": "start"
        },
        {
          "id": "present",
          "data": {
            "task": "Present critical issue"
          },
          "type": "agent_task"
        },
        {
          "id": "analyze",
          "data": {
            "task": "Board analysis"
          },
          "type": "parallel"
        },
        {
          "id": "debate",
          "data": {
            "task": "Board debate"
          },
          "type": "agent_task"
        },
        {
          "id": "vote",
          "data": {
            "condition": "decision_type"
          },
          "type": "router"
        },
        {
          "id": "end",
          "type": "end"
        }
      ]
    },
    "python_code": null,
    "status": "active",
    "version": 1,
    "parent_flow_id": null,
    "created_by": null,
    "updated_by": null,
    "created_at": "2025-10-11T22:11:15.433Z",
    "updated_at": "2025-10-11T22:11:15.433Z",
    "published_at": null,
    "metadata": null,
    "tags": [],
    "execution_count": 0,
    "last_executed_at": null,
    "is_template": true,
    "template_category": "board_governance",
    "avg_execution_time_ms": 0
  },
  {
    "id": "072b8b3e-e2ac-4b4f-afbf-eb44b19ff2a1",
    "flow_key": "board-investment-approval-v1",
    "flow_name": "Investment Approval",
    "description": "Investment approval workflow: CEO presents, board analysis (CFO/CTO/GTM/Legal), discussion, vote",
    "flow_definition": {
      "edges": [
        {
          "source": "start",
          "target": "ceo"
        },
        {
          "source": "ceo",
          "target": "analysis"
        },
        {
          "source": "analysis",
          "target": "blocker"
        },
        {
          "label": "no_blockers",
          "source": "blocker",
          "target": "discussion"
        },
        {
          "label": "has_blockers",
          "source": "blocker",
          "target": "end"
        },
        {
          "source": "discussion",
          "target": "vote"
        },
        {
          "source": "vote",
          "target": "decision"
        },
        {
          "source": "decision",
          "target": "end"
        }
      ],
      "nodes": [
        {
          "id": "start",
          "data": {
            "initial_state": {
              "meeting_type": "investment_approval"
            }
          },
          "type": "start"
        },
        {
          "id": "ceo",
          "data": {
            "task": "Present venture case",
            "agent_role": "AI CEO"
          },
          "type": "agent_task"
        },
        {
          "id": "analysis",
          "data": {
            "task": "Analyze investment",
            "agents": [
              "CFO",
              "CTO",
              "GTM",
              "Legal"
            ]
          },
          "type": "parallel"
        },
        {
          "id": "blocker",
          "data": {
            "condition": "has_blockers"
          },
          "type": "router"
        },
        {
          "id": "discussion",
          "data": {
            "task": "Board Q&A with CEO"
          },
          "type": "agent_task"
        },
        {
          "id": "vote",
          "data": {
            "task": "Weighted vote"
          },
          "type": "parallel"
        },
        {
          "id": "decision",
          "data": {
            "condition": "vote_passes_threshold"
          },
          "type": "router"
        },
        {
          "id": "end",
          "type": "end"
        }
      ]
    },
    "python_code": null,
    "status": "active",
    "version": 1,
    "parent_flow_id": null,
    "created_by": null,
    "updated_by": null,
    "created_at": "2025-10-11T22:11:15.433Z",
    "updated_at": "2025-10-11T22:11:15.433Z",
    "published_at": null,
    "metadata": null,
    "tags": [],
    "execution_count": 0,
    "last_executed_at": null,
    "is_template": true,
    "template_category": "investment_approval",
    "avg_execution_time_ms": 0
  }
]
```

### Schema: `crewai_tasks`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| venture_id | uuid | YES | NULL |
| crew_id | uuid | YES | NULL |
| task_type | character varying(50) | YES | NULL |
| description | text | YES | NULL |
| assigned_agent_id | uuid | YES | NULL |
| status | character varying(20) | YES | 'pending'::character varying |
| result | jsonb | YES | '{}'::jsonb |
| execution_time_ms | integer | YES | NULL |
| confidence_score | numeric | YES | NULL |
| chairman_accepted | boolean | YES | NULL |
| chairman_feedback | text | YES | NULL |
| error_message | text | YES | NULL |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_101232_1_not_null | CHECK | - | - |
| crewai_tasks_confidence_score_check | CHECK | - | crewai_tasks(confidence_score) |
| crewai_tasks_status_check | CHECK | - | crewai_tasks(status) |
| crewai_tasks_task_type_check | CHECK | - | crewai_tasks(task_type) |
| crewai_tasks_assigned_agent_id_fkey | FOREIGN KEY | assigned_agent_id | crewai_agents(id) |
| crewai_tasks_crew_id_fkey | FOREIGN KEY | crew_id | crewai_crews(id) |
| crewai_tasks_venture_id_fkey | FOREIGN KEY | venture_id | ventures(id) |
| crewai_tasks_pkey | PRIMARY KEY | id | crewai_tasks(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| crewai_tasks_insert_own | INSERT | "{authenticated}" | PERMISSIVE |
| crewai_tasks_select_own_company | SELECT | "{authenticated}" | PERMISSIVE |
| crewai_tasks_update_own | UPDATE | "{authenticated}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `eva_agent_communications`

**Row Count**: 0

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| communication_id | uuid | NO | gen_random_uuid() |
| session_id | uuid | YES | NULL |
| from_agent_id | uuid | YES | NULL |
| to_agent_id | uuid | YES | NULL |
| from_agent_type | text | YES | NULL |
| to_agent_type | text | YES | NULL |
| message_type | text | NO | NULL |
| message_content | jsonb | NO | NULL |
| priority | text | YES | 'normal'::text |
| status | text | YES | 'sent'::text |
| created_at | timestamp with time zone | YES | now() |
| delivered_at | timestamp with time zone | YES | NULL |
| read_at | timestamp with time zone | YES | NULL |
| acknowledged_at | timestamp with time zone | YES | NULL |
| in_reply_to | uuid | YES | NULL |
| response_required | boolean | YES | false |
| response_deadline | timestamp with time zone | YES | NULL |
| metadata | jsonb | YES | '{}'::jsonb |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_71590_1_not_null | CHECK | - | - |
| 2200_71590_7_not_null | CHECK | - | - |
| 2200_71590_8_not_null | CHECK | - | - |
| eva_agent_communications_message_type_check | CHECK | - | eva_agent_communications(message_type) |
| eva_agent_communications_priority_check | CHECK | - | eva_agent_communications(priority) |
| eva_agent_communications_status_check | CHECK | - | eva_agent_communications(status) |
| eva_agent_communications_in_reply_to_fkey | FOREIGN KEY | in_reply_to | eva_agent_communications(communication_id) |
| eva_agent_communications_session_id_fkey | FOREIGN KEY | session_id | eva_orchestration_sessions(session_id) |
| eva_agent_communications_pkey | PRIMARY KEY | communication_id | eva_agent_communications(communication_id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| eva_comms_company_access | SELECT | "{public}" | PERMISSIVE |

#### Sample Data

ℹ️ No data in table.

### Schema: `rd_department_agents`

**Row Count**: 7

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| role | character varying(100) | NO | NULL |
| specialty | character varying(100) | YES | NULL |
| name | character varying(255) | NO | NULL |
| department_id | character varying(100) | NO | 'research'::character varying |
| status | character varying(50) | NO | 'active'::character varying |
| current_workload | integer | YES | 0 |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| updated_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| company_id | uuid | YES | NULL |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_75839_1_not_null | CHECK | - | - |
| 2200_75839_2_not_null | CHECK | - | - |
| 2200_75839_4_not_null | CHECK | - | - |
| 2200_75839_5_not_null | CHECK | - | - |
| 2200_75839_6_not_null | CHECK | - | - |
| rd_department_agents_role_check1 | CHECK | - | rd_department_agents(role) |
| rd_department_agents_specialty_check1 | CHECK | - | rd_department_agents(specialty) |
| rd_department_agents_status_check1 | CHECK | - | rd_department_agents(status) |
| rd_department_agents_company_id_fkey1 | FOREIGN KEY | company_id | companies(id) |
| rd_department_agents_pkey1 | PRIMARY KEY | id | rd_department_agents(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| vp_full_access_agents | ALL | "{authenticated}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "role": "VP",
    "specialty": null,
    "name": "VP of Research",
    "department_id": "research",
    "status": "active",
    "current_workload": 0,
    "metadata": {},
    "created_at": "2025-10-09T19:43:27.350Z",
    "updated_at": "2025-10-09T19:43:27.350Z",
    "company_id": null
  },
  {
    "id": "00000000-0000-0000-0000-000000000002",
    "role": "Manager",
    "specialty": null,
    "name": "Research Manager",
    "department_id": "research",
    "status": "active",
    "current_workload": 0,
    "metadata": {},
    "created_at": "2025-10-09T19:43:27.350Z",
    "updated_at": "2025-10-09T19:43:27.350Z",
    "company_id": null
  },
  {
    "id": "00000000-0000-0000-0000-000000000003",
    "role": "Analyst",
    "specialty": "Competitive Intelligence",
    "name": "Competitive Intelligence Analyst",
    "department_id": "research",
    "status": "active",
    "current_workload": 0,
    "metadata": {},
    "created_at": "2025-10-09T19:43:27.350Z",
    "updated_at": "2025-10-09T19:43:27.350Z",
    "company_id": null
  },
  {
    "id": "00000000-0000-0000-0000-000000000004",
    "role": "Analyst",
    "specialty": "Viral Content",
    "name": "Viral Content Analyst",
    "department_id": "research",
    "status": "active",
    "current_workload": 0,
    "metadata": {},
    "created_at": "2025-10-09T19:43:27.350Z",
    "updated_at": "2025-10-09T19:43:27.350Z",
    "company_id": null
  },
  {
    "id": "00000000-0000-0000-0000-000000000005",
    "role": "Analyst",
    "specialty": "Market Trends",
    "name": "Market Trends Analyst",
    "department_id": "research",
    "status": "active",
    "current_workload": 0,
    "metadata": {},
    "created_at": "2025-10-09T19:43:27.350Z",
    "updated_at": "2025-10-09T19:43:27.350Z",
    "company_id": null
  }
]
```

### Schema: `sub_agent_execution_results`

**Row Count**: 123

#### Columns

| Column Name | Data Type | Nullable | Default |
|-------------|-----------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| sd_id | text | YES | NULL |
| sub_agent_code | text | NO | NULL |
| verdict | text | NO | NULL |
| confidence | numeric | YES | NULL |
| execution_time | integer | YES | NULL |
| metadata | jsonb | YES | NULL |
| executed_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

#### Constraints

| Constraint Name | Type | Column | References |
|-----------------|------|--------|------------|
| 2200_86331_1_not_null | CHECK | - | - |
| 2200_86331_3_not_null | CHECK | - | - |
| 2200_86331_4_not_null | CHECK | - | - |
| sub_agent_execution_results_confidence_check | CHECK | - | sub_agent_execution_results(confidence) |
| sub_agent_execution_results_pkey | PRIMARY KEY | id | sub_agent_execution_results(id) |

#### RLS Policies

| Policy Name | Command | Roles | Permissive |
|-------------|---------|-------|------------|
| select_sub_agent_execution_results_policy | SELECT | "{public}" | PERMISSIVE |
| service_role_all_sub_agent_execution_results | ALL | "{service_role}" | PERMISSIVE |

#### Sample Data (first 5 rows)

```json
[
  {
    "id": "b4933fb1-d846-494d-9046-8f3dc2c8f48e",
    "sd_id": null,
    "sub_agent_code": "STA",
    "verdict": "APPROVED",
    "confidence": "0.83",
    "execution_time": 6123,
    "metadata": {
      "venture_id": "0a0db136-5373-4153-8c63-2c3f0b032636",
      "result_summary": "3 leverage points, 2 feedback loops"
    },
    "executed_at": "2025-10-18T08:54:47.153Z",
    "created_at": "2025-10-18T08:54:47.233Z",
    "updated_at": "2025-10-18T08:54:47.233Z"
  },
  {
    "id": "8f04d5af-c117-4061-8e24-de0c2c7559c4",
    "sd_id": null,
    "sub_agent_code": "GCIA",
    "verdict": "APPROVED",
    "confidence": "0.89",
    "execution_time": 7121,
    "metadata": {
      "venture_id": "0a0db136-5373-4153-8c63-2c3f0b032636",
      "result_summary": "3 competitors, 3 trends"
    },
    "executed_at": "2025-10-18T08:54:54.510Z",
    "created_at": "2025-10-18T08:54:54.571Z",
    "updated_at": "2025-10-18T08:54:54.571Z"
  },
  {
    "id": "0876612c-8601-4c9e-a77b-df184658a1a7",
    "sd_id": null,
    "sub_agent_code": "STA",
    "verdict": "APPROVED",
    "confidence": "0.8",
    "execution_time": 8025,
    "metadata": {
      "venture_id": "0a0db136-5373-4153-8c63-2c3f0b032636",
      "result_summary": "3 leverage points, 2 feedback loops"
    },
    "executed_at": "2025-10-18T08:55:15.519Z",
    "created_at": "2025-10-18T08:55:15.609Z",
    "updated_at": "2025-10-18T08:55:15.609Z"
  },
  {
    "id": "0b9abe33-3d83-4b95-b6d7-c918cdea3fc9",
    "sd_id": null,
    "sub_agent_code": "STA",
    "verdict": "APPROVED",
    "confidence": "0.83",
    "execution_time": 5481,
    "metadata": {
      "venture_id": "0a0db136-5373-4153-8c63-2c3f0b032636",
      "result_summary": "3 leverage points, 2 feedback loops"
    },
    "executed_at": "2025-10-18T08:55:46.126Z",
    "created_at": "2025-10-18T08:55:46.168Z",
    "updated_at": "2025-10-18T08:55:46.168Z"
  },
  {
    "id": "ae39363e-4a43-4450-8d37-91b73e9d61ad",
    "sd_id": null,
    "sub_agent_code": "GCIA",
    "verdict": "APPROVED",
    "confidence": "0.89",
    "execution_time": 7525,
    "metadata": {
      "venture_id": "0a0db136-5373-4153-8c63-2c3f0b032636",
      "result_summary": "3 competitors, 3 trends"
    },
    "executed_at": "2025-10-18T08:55:55.092Z",
    "created_at": "2025-10-18T08:55:55.157Z",
    "updated_at": "2025-10-18T08:55:55.157Z"
  }
]
```

---

## Cross-Database Analysis

### Governance vs. Operational Gap

#### Agent Registration

- **LEO Agents** (EHG_Engineer): 3 registered
- **CrewAI Agents** (EHG App): 30 operational
- **Gap**: 27 agents unregistered in governance system

#### Crew Management

- **CrewAI Crews** (EHG App): 2 crews active
- **LEO Agent Groups**: Not tracked in governance database
- **Gap**: No governance structure for crew-level operations

#### Flow Tracking

- **CrewAI Flows** (EHG App): 3 flows defined
- **Flow Executions** (EHG App): 0 execution records
- **Gap**: Flow orchestration not integrated with LEO Protocol

### Data Consistency Issues

#### Table Name Conflicts

⚠️ The following tables exist in BOTH databases:

- `agent_performance_metrics` (potential schema divergence risk)
- `crewai_flow_executions` (potential schema divergence risk)
- `crewai_flow_templates` (potential schema divergence risk)
- `crewai_flows` (potential schema divergence risk)
- `sub_agent_execution_results` (potential schema divergence risk)

#### RLS Policy Coverage

- **EHG_Engineer**: 104 policies across 55 tables
- **EHG Application**: 31 policies across 20 tables

⚠️ **EHG_Engineer tables without RLS**: active_leo_protocol_view, v_agent_documentation_compliance, v_contexts_missing_sub_agents, v_sub_agent_execution_history, v_sub_agent_executions_unified, v_subagent_compliance

⚠️ **EHG Application tables without RLS**: agent_executions_2025_10, agent_executions_2025_11, agent_executions_2025_12

---

## Findings Summary

### 1. Architectural Discrepancy Confirmed

The EHG Application database contains a fully operational CrewAI platform with:
- 30 agents with defined roles, goals, and backstories
- 2 crews with process orchestration
- 8 crew member assignments
- Flow execution tracking and state management

However, this operational system is **NOT reflected** in the EHG_Engineer governance database.

### 2. Missing Governance Layer

The `leo_agents` and `leo_sub_agents` tables in EHG_Engineer do not contain records for the 30 operational CrewAI agents. This represents a fundamental gap in the governance architecture.

### 3. RLS Policy Inconsistencies

9 tables across both databases lack RLS policies, creating potential security vulnerabilities:
- **EHG_Engineer**: active_leo_protocol_view, v_agent_documentation_compliance, v_contexts_missing_sub_agents, v_sub_agent_execution_history, v_sub_agent_executions_unified, v_subagent_compliance
- **EHG Application**: agent_executions_2025_10, agent_executions_2025_11, agent_executions_2025_12

### 4. Flow Orchestration Gap

CrewAI flows in the application database (3 flows, 0 executions) operate independently from the LEO Protocol workflow system. This creates:
- No visibility into CrewAI operations from the governance dashboard
- Potential conflicts between LEO Protocol phases and CrewAI flow states
- Inconsistent error handling and logging strategies

### 5. Data Integrity Concerns

Foreign key relationships exist within each database but NOT across databases. This prevents:
- Referential integrity between governance policies and operational agents
- Cascading updates when agent definitions change
- Audit trails linking governance approvals to operational deployments

### 6. Schema Documentation Required

Based on the analysis, the following schema documentation should be generated:
- Run `npm run schema:docs:engineer` to document EHG_Engineer tables
- Run `npm run schema:docs:app` to document EHG Application tables
- Review generated docs in `docs/reference/schema/` directories

---

## Recommendations for Phase 2 (Planning)

1. **Establish Governance-Operational Bridge**
   - Design migration to register all 30 CrewAI agents in `leo_agents`
   - Create mapping table linking LEO agents to CrewAI agents
   - Implement sync mechanism for agent updates

2. **Implement RLS Policies**
   - Prioritize CrewAI operational tables (agents, crews, flows)
   - Add service role bypass for system operations
   - Document RLS policy patterns for future tables

3. **Flow Integration Architecture**
   - Design integration points between LEO Protocol phases and CrewAI flows
   - Establish event-driven communication between databases
   - Create unified logging and monitoring system

4. **Cross-Database Validation**
   - Implement validation scripts to check governance-operational alignment
   - Create automated alerts for orphaned agents or crews
   - Establish regular reconciliation processes

5. **Documentation and Schema Sync**
   - Generate schema documentation for both databases
   - Create architectural diagrams showing database relationships
   - Document data flow between governance and operational layers

---

## Next Steps

1. **Review Findings**: Present this analysis to stakeholders
2. **Create PRD**: Document requirements for governance-operational integration
3. **Generate Schema Docs**: Run schema documentation scripts
4. **Design Migration**: Plan phased approach to bridge the gap
5. **Implement RLS**: Secure operational tables with proper policies

---

*Analysis generated by: `scripts/analyze-crewai-dual-databases.js`*
*Timestamp: 2025-11-06T15:28:57.792Z*
*Strategic Directive: SD-CREWAI-ARCHITECTURE-001 (Phase 1)*

[32m
✅ Analysis Complete![0m
[36m
💾 Save this report to:[0m
[33m   /docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/discovery/database_analysis.md
[0m
