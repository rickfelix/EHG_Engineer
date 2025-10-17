#!/usr/bin/env node

/**
 * Add Phase 2 Protocol Sections to Database
 *
 * Purpose: Insert new protocol sections identified in LEO Protocol improvement analysis
 * Target: leo_protocol_sections table
 *
 * New Sections:
 * 1. Strategic Directive Execution Protocol (header)
 * 2. Execution Philosophy
 * 3. 5-Phase Workflow Structure
 * 4. Per-Phase Sub-Agent Checklists
 * 5. Context Management (upfront)
 * 6. Quick Reference
 *
 * Usage:
 *   node scripts/add-protocol-sections-phase2.js
 *
 * After running:
 *   node scripts/generate-claude-md-from-db.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const PROTOCOL_ID = 'leo-v4-2-0-story-gates';

const NEW_SECTIONS = [
  {
    section_type: 'strategic_directive_execution_protocol',
    title: 'Strategic Directive Execution Protocol',
    content: `# STRATEGIC DIRECTIVE EXECUTION PROTOCOL

**When executing a Strategic Directive, follow this structured 5-phase workflow.**

## Target Application Selection

**CRITICAL FIRST STEP**: Determine which application this SD targets:

- **EHG** (\`/mnt/c/_EHG/ehg/\`) - Customer-facing features (MOST IMPLEMENTATIONS)
  - Database: liapbndqlqxdcgpwntbv (Supabase)
  - GitHub: rickfelix/ehg.git
  - Stack: Vite + React + Shadcn + TypeScript

- **EHG_Engineer** (\`/mnt/c/_EHG/EHG_Engineer/\`) - LEO Protocol dashboard/tooling ONLY
  - Database: dedlbzhpgkmetvhbkyzq (Supabase)
  - GitHub: rickfelix/EHG_Engineer.git
  - Role: Management tool, no customer features

## Priority Tiers

- **CRITICAL** (90+): Business-critical, immediate action required
- **HIGH** (70-89): Important features, near-term priority
- **MEDIUM** (50-69): Standard enhancements, planned work
- **LOW** (30-49): Nice-to-have improvements

## Workflow Overview

Execute in order: **LEAD PRE-APPROVAL → PLAN PRD → EXEC IMPLEMENTATION → PLAN VERIFICATION → LEAD FINAL APPROVAL**

Each phase has:
- Assigned agent (LEAD/PLAN/EXEC)
- Percentage allocation
- Required sub-agents
- Exit criteria
- Mandatory handoff

See detailed phase sections below.`,
    order_index: 5,
    metadata: { category: 'workflow', is_required: true }
  },

  {
    section_type: 'execution_philosophy',
    title: 'Execution Philosophy',
    content: `## 🧠 EXECUTION PHILOSOPHY (Read First!)

These principles override default behavior and must be internalized before starting work:

### Testing-First
**Do it right, not fast.** E2E testing is MANDATORY, not optional.
- 30-60 minute investment saves 4-6 hours of rework
- 100% user story coverage required
- Both unit tests AND E2E tests must pass

### Database-First
**Zero markdown files.** Database tables are single source of truth.
- SDs → \`strategic_directives_v2\`
- PRDs → \`product_requirements_v2\`
- Handoffs → \`sd_phase_handoffs\`
- Retrospectives → \`retrospectives\`
- Sub-agent results → \`sub_agent_execution_results\`

### Simplicity-First
**Challenge complexity BEFORE approval, commit to full scope AFTER.**
- LEAD questions: Can we document instead? Solving real or imagined problems?
- After LEAD approval: SCOPE LOCK - no unilateral deferrals
- Exception: Critical blocker + human approval + new SD for deferred work

### Context-Aware
**Monitor token usage proactively throughout execution.**
- Report context health in EVERY handoff
- HEALTHY (<70%), WARNING (70-90%), CRITICAL (90-95%), EMERGENCY (>95%)
- Use \`/context-compact\` when approaching WARNING threshold

### Application-Aware
**Verify directory BEFORE writing ANY code.**
- \`cd /mnt/c/_EHG/ehg && pwd\` for customer features
- \`git remote -v\` to confirm correct repository
- Wrong directory = STOP immediately

### Evidence-Based
**Screenshot, test, verify. Claims without evidence are rejected.**
- Screenshot BEFORE and AFTER changes
- Test results with pass/fail counts
- CI/CD pipeline status (green checks required)
- Sub-agent verification results in database`,
    order_index: 6,
    metadata: { category: 'workflow', is_required: true }
  },

  {
    section_type: 'five_phase_workflow',
    title: '5-Phase Strategic Directive Workflow',
    content: `## 🎯 5-PHASE STRATEGIC DIRECTIVE WORKFLOW

Total: 100% = LEAD (35%) + PLAN (35%) + EXEC (30%)

---

### PHASE 1: LEAD PRE-APPROVAL (20% of LEAD allocation)

**Agent**: Strategic Leadership Agent (LEAD)
**Purpose**: Strategic validation, business alignment, simplicity gate
**Duration**: 1-2 hours

**Mandatory Sub-Agents**:
- Principal Systems Analyst (duplicate check, existing implementation)
- Principal Database Architect (if database keywords in scope)
- Chief Security Architect (if security keywords in scope)
- Senior Design Sub-Agent (if UI/UX keywords in scope)

**Execution**: Run in parallel to save time
\`\`\`bash
# Parallel execution
node scripts/systems-analyst-codebase-audit.js <SD-ID> &
node scripts/database-architect-schema-review.js <SD-ID> &
node scripts/security-architect-assessment.js <SD-ID> &
node scripts/design-subagent-evaluation.js <SD-ID> &
wait
\`\`\`

**Deliverables**:
- SD approved or rejected with feedback
- SIMPLICITY FIRST gate passed
- Over-engineering rubric applied (if needed)
- LEAD→PLAN handoff created

**Exit Criteria**:
- SD status = 'active'
- SIMPLICITY gate passed (6 questions answered)
- No critical blockers identified
- Handoff stored in \`sd_phase_handoffs\`

---

### PHASE 2: PLAN PRD CREATION (20% of PLAN allocation)

**Agent**: Technical Planning Agent (PLAN)
**Purpose**: Technical design, PRD creation, test planning
**Duration**: 2-4 hours

**Mandatory Sub-Agents**:
- Principal Database Architect (MANDATORY for ALL SDs - database validation)
- Product Requirements Expert (auto-generates user stories)

**Execution**: Sequential (each informs next)
\`\`\`bash
# Step 1: Database validation
node scripts/database-architect-schema-review.js <SD-ID>

# Step 2: User story generation (automatic)
# Triggered by PRD creation, stores in user_stories table

# Step 3: Component sizing (if UI/UX SD)
node scripts/design-subagent-evaluation.js <SD-ID>
\`\`\`

**Deliverables**:
- PRD created in \`product_requirements_v2\` table
- User stories in \`user_stories\` table (100% mapped to E2E tests)
- Component architecture defined (300-600 LOC per component)
- Database migrations planned (if needed)
- PLAN→EXEC handoff created

**Exit Criteria**:
- PRD exists with comprehensive test plan
- User stories generated and validated
- Database dependencies resolved or escalated
- Handoff stored in \`sd_phase_handoffs\`

---

### PHASE 3: EXEC IMPLEMENTATION (30% of EXEC allocation)

**Agent**: Implementation Agent (EXEC)
**Purpose**: Code implementation, testing, delivery
**Duration**: 4-8 hours

**Mandatory Sub-Agents**:
- None (EXEC does the work directly)

**Pre-Implementation Checklist**:
\`\`\`markdown
## EXEC Pre-Implementation Checklist
- [ ] Application: [EHG or EHG_Engineer - VERIFIED via pwd]
- [ ] GitHub remote: [verified via git remote -v]
- [ ] URL: [exact URL from PRD - accessible: YES/NO]
- [ ] Component: [path/to/component]
- [ ] Screenshot: [BEFORE state captured]
\`\`\`

**Post-Implementation Requirements**:
1. **Server Restart** (MANDATORY for UI changes)
   \`\`\`bash
   pkill -f "node server.js"
   npm run build:client  # If UI changes
   PORT=3000 node server.js
   # Hard refresh: Ctrl+Shift+R
   \`\`\`

2. **Git Commit** (Conventional Commits with SD-ID)
   \`\`\`bash
   git commit -m "feat(<SD-ID>): Brief description

   Detailed explanation.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   \`\`\`

3. **Dual Test Execution** (MANDATORY - BOTH types)
   \`\`\`bash
   npm run test:unit      # Business logic
   npm run test:e2e       # User flows
   \`\`\`

4. **Wait for CI/CD** (2-3 minutes)
   \`\`\`bash
   gh run list --limit 5  # All green ✅
   \`\`\`

**Deliverables**:
- Implementation complete
- Unit tests pass
- E2E tests pass (100% user story coverage)
- CI/CD pipelines green
- Documentation generated
- EXEC→PLAN handoff created

**Exit Criteria**:
- All PRD requirements implemented
- Both test types passing
- CI/CD green
- Documentation exists in \`generated_docs\`
- Handoff stored in \`sd_phase_handoffs\`

---

### PHASE 4: PLAN SUPERVISOR VERIFICATION (15% of PLAN allocation)

**Agent**: Technical Planning Agent (PLAN) in supervisor mode
**Purpose**: Verification, quality assurance, sub-agent orchestration
**Duration**: 1-2 hours

**Mandatory Sub-Agents**:
- QA Engineering Director (CRITICAL - E2E testing)
- DevOps Platform Architect (CRITICAL - CI/CD verification)
- Principal Database Architect (if database changes)
- Chief Security Architect (if security features)
- Performance Engineering Lead (if performance-critical)
- Senior Design Sub-Agent (if UI components)

**Automated Orchestration**:
\`\`\`bash
# Orchestrator runs automatically when creating EXEC→PLAN handoff
# All required sub-agents execute in parallel
# Results stored in sub_agent_execution_results table
# Handoff BLOCKED if CRITICAL sub-agents fail
\`\`\`

**Manual Verification** (if needed):
\`\`\`bash
# QA Director
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# GitHub Actions
gh run list --limit 5
gh run view [run-id]

# Database verification
node scripts/database-architect-schema-review.js <SD-ID>
\`\`\`

**Deliverables**:
- All sub-agents executed
- E2E tests passed (100% user stories)
- CI/CD pipelines verified green
- Integration verification complete
- PLAN→LEAD handoff created

**Exit Criteria**:
- Verdict: PASS or CONDITIONAL_PASS (≥85% confidence)
- All CRITICAL sub-agents passed
- E2E test evidence documented
- Handoff stored in \`sd_phase_handoffs\`

---

### PHASE 5: LEAD FINAL APPROVAL (15% of LEAD allocation)

**Agent**: Strategic Leadership Agent (LEAD)
**Purpose**: Final approval, retrospective, completion
**Duration**: 30-60 minutes

**Mandatory Sub-Agents**:
- Continuous Improvement Coach (RETRO - retrospective generation)

**Automated Orchestration**:
\`\`\`bash
# Orchestrator runs automatically when creating PLAN→LEAD handoff
# RETRO sub-agent executes if not already run
# Handoff BLOCKED if retrospective missing
\`\`\`

**Approval Checklist**:
- [ ] PLAN→LEAD handoff reviewed
- [ ] Verification verdict acceptable (PASS or CONDITIONAL_PASS)
- [ ] All PRD requirements met (SCOPE LOCK validation)
- [ ] CI/CD pipelines green
- [ ] E2E test evidence sufficient (100% user stories)
- [ ] Retrospective generated
- [ ] Sub-agent validation script passed
- [ ] Human approval (if required)

**Deliverables**:
- SD marked as 'completed'
- Progress = 100%
- Retrospective in \`retrospectives\` table
- All handoffs complete
- Dashboard updated

**Exit Criteria**:
- SD status = 'completed'
- progress_percentage = 100
- completed_at timestamp set
- Retrospective exists with quality_score ≥ 70`,
    order_index: 7,
    metadata: { category: 'workflow', is_required: true }
  },

  {
    section_type: 'context_management_upfront',
    title: 'Context Management Throughout Execution',
    content: `## 🧠 CONTEXT MANAGEMENT (Throughout Execution)

**Token Budget**: 200,000 tokens

### Status Thresholds

| Status | Range | Percentage | Action |
|--------|-------|------------|--------|
| 🟢 HEALTHY | 0-140K | 0-70% | Continue normally |
| 🟡 WARNING | 140K-180K | 70-90% | Consider \`/context-compact\` |
| 🔴 CRITICAL | 180K-190K | 90-95% | MUST compact before handoff |
| 🚨 EMERGENCY | >190K | >95% | BLOCKED - force handoff |

### Report in EVERY Handoff

**Mandatory section in all handoffs**:
\`\`\`markdown
## Context Health
**Current Usage**: X tokens (Y% of 200K budget)
**Status**: HEALTHY/WARNING/CRITICAL
**Recommendation**: [action if needed]
**Compaction Needed**: YES/NO
\`\`\`

### Efficiency Rules

**Always apply these practices**:

1. **Select specific columns** (not \`SELECT *\`)
   \`\`\`javascript
   // ❌ Bad
   .select('*')

   // ✅ Good
   .select('id, title, status, priority')
   \`\`\`

2. **Limit results** for large datasets
   \`\`\`javascript
   .limit(5)  // For summaries
   .limit(50) // For dashboards
   \`\`\`

3. **Summarize, don't dump**
   \`\`\`javascript
   // ❌ Bad: Full JSON dump
   console.log(results);

   // ✅ Good: Summary
   console.log(\`Found \${results.length} tests: \${passed} passed, \${failed} failed\`);
   \`\`\`

4. **Use Read tool with offset/limit** for large files
   \`\`\`javascript
   Read('file.js', { offset: 100, limit: 50 })
   \`\`\`

5. **Compress sub-agent reports** (3-tier system)
   - TIER 1 (CRITICAL): Full detail for blockers
   - TIER 2 (IMPORTANT): Structured summary for warnings
   - TIER 3 (INFORMATIONAL): One-line for passing checks

### Expected Impact

Applying these rules: **90-98% token reduction per query**

### Compaction Command

When WARNING or CRITICAL:
\`\`\`bash
/context-compact [focus area]
\`\`\`

Example:
\`\`\`bash
/context-compact database-schema
\`\`\``,
    order_index: 8,
    metadata: { category: 'workflow', is_required: true }
  },

  {
    section_type: 'quick_reference',
    title: 'Quick Reference',
    content: `## 📋 QUICK REFERENCE

### Component Sizing

| Lines of Code | Action | Rationale |
|---------------|--------|-----------|
| <200 | Consider combining | Too granular |
| **300-600** | ✅ **OPTIMAL** | Sweet spot for testing & maintenance |
| >800 | **MUST split** | Too complex, hard to test |

### Git Commits (Conventional Commits)

**Format**: \`<type>(<SD-ID>): <subject>\`

\`\`\`bash
git commit -m "feat(SD-XXX): Brief description

Detailed explanation of changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
\`\`\`

**Types**: feat, fix, docs, refactor, test, chore, perf

### Server Restart (After ANY Changes)

\`\`\`bash
# Kill
pkill -f "node server.js"

# Build (if UI changes)
npm run build:client

# Restart
PORT=3000 node server.js

# Hard refresh browser
# Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
\`\`\`

### Parallel Execution (Save Time)

**When Safe**:
- ✅ Multiple independent file reads
- ✅ Multiple database queries (read-only)
- ✅ Sub-agent execution (different domains)

**NOT Safe**:
- ❌ Write operations
- ❌ Database mutations
- ❌ Sequential dependencies

**Example**:
\`\`\`bash
# LEAD Pre-Approval: 4 sub-agents in parallel
node scripts/systems-analyst-codebase-audit.js <SD-ID> &
node scripts/database-architect-schema-review.js <SD-ID> &
node scripts/security-architect-assessment.js <SD-ID> &
node scripts/design-subagent-evaluation.js <SD-ID> &
wait

# Reduces time from 2 minutes sequential to 30 seconds parallel
\`\`\`

### Context Efficiency Patterns

\`\`\`javascript
// ❌ Inefficient
const { data } = await supabase.from('table').select('*');
console.log(data); // Dumps full JSON

// ✅ Efficient
const { data } = await supabase
  .from('table')
  .select('id, title, status')
  .limit(5);
console.log(\`Found \${data.length} items\`);
\`\`\`

### Database Operations (One at a Time)

**CRITICAL**: When manipulating Supabase tables, operate on ONE table at a time.

\`\`\`javascript
// ❌ Bad: Batch across tables
await Promise.all([
  supabase.from('table1').insert(data1),
  supabase.from('table2').insert(data2)
]);

// ✅ Good: Sequential, one table at a time
await supabase.from('table1').insert(data1);
// Verify success
await supabase.from('table2').insert(data2);
// Verify success
\`\`\`

### Sub-Agent Orchestration

**Automated** (preferred):
\`\`\`bash
# Orchestrator runs all required sub-agents for phase
node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>

# Phases: LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, PLAN_VERIFY, LEAD_FINAL
\`\`\`

**Manual** (if needed):
\`\`\`bash
# QA Director
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# GitHub Actions
node scripts/github-actions-verifier.js <SD-ID>

# Database Architect
node scripts/database-architect-schema-review.js <SD-ID>
\`\`\`

### Testing Commands

\`\`\`bash
# Unit tests (business logic)
npm run test:unit

# E2E tests (user flows)
npm run test:e2e

# Both (MANDATORY before EXEC→PLAN handoff)
npm run test:unit && npm run test:e2e
\`\`\`

### Handoff Creation

\`\`\`bash
# Unified handoff system (with auto sub-agent orchestration)
node scripts/unified-handoff-system.js execute <TYPE> <SD-ID>

# Types:
# - LEAD-to-PLAN
# - PLAN-to-EXEC
# - EXEC-to-PLAN (auto-runs PLAN_VERIFY sub-agents)
# - PLAN-to-LEAD (auto-runs LEAD_FINAL sub-agents)
\`\`\`

### Progress Verification

\`\`\`bash
# Check progress breakdown
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data } = await supabase.rpc('get_progress_breakdown', { sd_id_param: 'SD-XXX' });
  console.log(JSON.stringify(data, null, 2));
})();
"
\`\`\``,
    order_index: 100,
    metadata: { category: 'reference', is_required: false }
  }
];

async function addProtocolSections() {
  console.log('\n📝 ADDING PHASE 2 PROTOCOL SECTIONS TO DATABASE');
  console.log('═'.repeat(60));

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('✅ Connected to database\n');

  try {
    let successCount = 0;
    let skipCount = 0;

    for (const section of NEW_SECTIONS) {
      console.log(`\n📋 Processing: ${section.title}`);
      console.log(`   Type: ${section.section_type}`);
      console.log(`   Category: ${section.metadata.category}`);
      console.log(`   Order: ${section.order_index}`);

      // Check if section already exists
      const checkQuery = `
        SELECT id FROM leo_protocol_sections
        WHERE section_type = $1 AND protocol_id = $2
      `;
      const checkResult = await client.query(checkQuery, [section.section_type, PROTOCOL_ID]);

      if (checkResult.rows.length > 0) {
        console.log(`   ⏭️  SKIPPED: Section already exists (ID: ${checkResult.rows[0].id})`);
        skipCount++;
        continue;
      }

      // Insert new section
      const insertQuery = `
        INSERT INTO leo_protocol_sections (
          protocol_id,
          section_type,
          title,
          content,
          order_index,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `;

      const values = [
        PROTOCOL_ID,
        section.section_type,
        section.title,
        section.content,
        section.order_index,
        JSON.stringify(section.metadata)
      ];

      const result = await client.query(insertQuery, values);
      console.log(`   ✅ INSERTED: ID ${result.rows[0].id}`);
      successCount++;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total sections: ${NEW_SECTIONS.length}`);
    console.log(`✅ Inserted: ${successCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);

    if (successCount > 0) {
      console.log('\n🔄 NEXT STEP: Regenerate CLAUDE.md');
      console.log('   Command: node scripts/generate-claude-md-from-db.js');
    }

    await client.end();

  } catch (error) {
    console.error('\n❌ Error adding protocol sections:', error.message);
    await client.end();
    throw error;
  }
}

// Execute
addProtocolSections().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
