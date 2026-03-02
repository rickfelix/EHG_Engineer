#!/usr/bin/env node
/**
 * Create smart router section for CLAUDE.md
 * This section provides AI with explicit loading instructions
 */

import dotenv from 'dotenv';
import { createDatabaseClient } from './lib/supabase-connection.js';

dotenv.config();

const ROUTER_CONTENT = `# CLAUDE.md - LEO Protocol Context Router

⚠️ **THIS IS A ROUTER FILE** - Read additional files based on task context

## 📋 Loading Strategy (Follow These Steps)

**Step 1: ALWAYS read CLAUDE_CORE.md first** (15k chars)
- Essential workflow, application architecture, git guidelines
- Required for ALL sessions
- Contains: session prologue, execution philosophy, quick reference

**Step 2: Detect user's phase and load appropriate file**

| User Keywords | Load File | Size | Contents |
|--------------|-----------|------|----------|
| "approve SD", "LEAD", "over-engineering", "directive review", "simplicity" | CLAUDE_LEAD.md | 25k | LEAD operations, directive submission, simplicity enforcement |
| "create PRD", "PLAN", "schema validation", "pre-EXEC", "verification" | CLAUDE_PLAN.md | 30k | PRD creation, validation gates, testing strategy |
| "implement", "EXEC", "write code", "component", "test", "build" | CLAUDE_EXEC.md | 20k | Implementation requirements, dual testing, server restart |

**Step 3: Load reference docs ONLY when specific issues arise**

| Issue Type | Load File | Size |
|------------|-----------|------|
| Database errors, schema issues, RLS problems | docs/reference/database-agent-patterns.md | 15k |
| Validation failures, gate blocking | docs/reference/validation-enforcement.md | 12k |
| Test timeouts, E2E issues, Playwright | docs/reference/qa-director-guide.md | 8k |
| Context high (>70%) | docs/reference/context-monitoring.md | 5k |
| Sub-agent compression | docs/reference/sub-agent-compression.md | 6k |
| Handoff creation issues | docs/reference/unified-handoff-system.md | 7k |
| Database migration errors | docs/reference/database-migration-validation.md | 5k |

## 🔍 Quick Decision Tree

\`\`\`
START
  ↓
Read CLAUDE_CORE.md (always)
  ↓
User request contains:
  - "approve" OR "LEAD" OR "directive"? → Read CLAUDE_LEAD.md
  - "PRD" OR "PLAN" OR "validation"? → Read CLAUDE_PLAN.md
  - "implement" OR "EXEC" OR "code"? → Read CLAUDE_EXEC.md
  - Specific error/issue? → Read relevant docs/reference/*.md
  - General question? → CLAUDE_CORE.md is sufficient
  ↓
Proceed with task
\`\`\`

## 📊 Context Budget Tracking

After loading files, you'll have consumed:
- **Router + Core**: 3k + 15k = 18k chars (9% of 200k budget) ✅ HEALTHY
- **Router + Core + Phase**: 18k + 25k avg = 43k chars (22% of budget) ✅ HEALTHY
- **With reference doc**: 43k + 15k avg = 58k chars (29% of budget) ✅ HEALTHY
- **Old CLAUDE.md**: 123k chars (62% of budget) ❌ INEFFICIENT

## 📚 All Available Context Files

### Core Files (Generated from Database)
1. **CLAUDE_CORE.md** (15k) - Always read first
   - Session prologue
   - Application architecture (EHG vs EHG_Engineer)
   - Execution philosophy
   - Git commit guidelines
   - Communication & context best practices
   - Quick reference commands
   - Development workflow
   - Database operations overview
   - Parallel execution patterns

2. **CLAUDE_LEAD.md** (25k) - LEAD phase operations
   - LEAD agent responsibilities
   - Directive submission review process
   - Over-engineering evaluation rubric
   - Simplicity-first enforcement
   - Strategic validation gate (6 questions)
   - Code review requirements for UI/UX SDs
   - SD evaluation 6-step checklist
   - Phase 4 verification (stubbed code detection)

3. **CLAUDE_PLAN.md** (30k) - PLAN phase operations
   - PLAN pre-EXEC checklist
   - Testing tier strategy
   - CI/CD pipeline verification
   - Component sizing guidelines (300-600 LOC sweet spot)
   - BMAD enhancements (6 improvements)
   - Multi-application testing architecture
   - QA Engineering Director v2.0 guide
   - PR size guidelines
   - Database migration validation
   - Context management proactive monitoring

4. **CLAUDE_EXEC.md** (20k) - EXEC phase operations
   - EXEC implementation requirements
   - Dual test requirement (unit + E2E MANDATORY)
   - TODO comment standard
   - Strategic directive execution protocol
   - 5-phase workflow (EXEC portions)
   - Testing tier strategy (updated)
   - Playwright MCP integration
   - Sub-agent parallel execution

### Reference Documentation (Load on Demand)
5. **docs/reference/database-agent-patterns.md** (15k)
   - Error-triggered invocation patterns
   - Database workaround anti-patterns
   - First-responder checklist
   - Integration requirements

6. **docs/reference/validation-enforcement.md** (12k)
   - Mandatory validation gates (4 gates)
   - Enforcement patterns (3 layers)
   - Proactive invocation checklist
   - Validation failure patterns to avoid

7. **docs/reference/qa-director-guide.md** (8k)
   - Enhanced QA Engineering Director v2.0
   - 5-phase workflow
   - Pre-test build validation
   - E2E testing requirements

8. **docs/reference/context-monitoring.md** (5k)
   - Token budget thresholds
   - Proactive monitoring requirements
   - Compaction strategies

9. **docs/reference/sub-agent-compression.md** (6k)
   - 3-tier compression system
   - TIER 1/2/3 patterns
   - When to use each tier

10. **docs/reference/unified-handoff-system.md** (7k)
    - 7-element handoff structure
    - Database-first handoff creation
    - RLS bypass patterns

[Additional reference docs listed with descriptions...]

## 🧠 Smart Loading Examples

### Example 1: LEAD Approval Request
\`\`\`
User: "Review and approve SD-EXPORT-001"
AI thinking: Keywords "approve" detected → LEAD phase
Actions:
  1. Read CLAUDE_CORE.md (15k)
  2. Read CLAUDE_LEAD.md (25k)
Total context: 40k chars (20% of budget)
Proceed with: LEAD pre-approval process, strategic validation gate
\`\`\`

### Example 2: Database Error
\`\`\`
User: "I'm getting 'column does not exist' error when running migration"
AI thinking: Database error detected → Need database agent patterns
Actions:
  1. Read CLAUDE_CORE.md (15k)
  2. Read docs/reference/database-agent-patterns.md (15k)
Total context: 30k chars (15% of budget)
Proceed with: Database agent error-triggered invocation
\`\`\`

### Example 3: Implementation Task
\`\`\`
User: "Implement the user settings component according to PRD-SETTINGS-001"
AI thinking: Keywords "implement" detected → EXEC phase
Actions:
  1. Read CLAUDE_CORE.md (15k)
  2. Read CLAUDE_EXEC.md (20k)
Total context: 35k chars (18% of budget)
Proceed with: EXEC pre-implementation checklist, dual testing
\`\`\`

## 📏 Context Efficiency Rules

**This router system achieves**:
- **85% reduction** on session start (123k → 18k chars)
- **65% reduction** with phase loaded (123k → 43k avg)
- **On-demand reference loading** (saves 30-50k chars per session)

**Old approach**:
- Loaded full 123k chars immediately
- Consumed 62% of context budget before any work
- Wasted tokens on irrelevant sections

**New approach**:
- Load only what you need
- Start with 9% of budget (18k chars)
- Add phase-specific context as needed (22-24% total)
- Load reference docs selectively (29% max)

## ⚠️ Critical Reminder

**DO NOT** attempt to load old CLAUDE.md (deprecated)
**DO** follow this router's loading strategy
**DO** track context consumption after loading files
**DO** report context health in handoffs

---

*Router generated from database: leo_protocol_sections*
*Last updated: 2025-10-13*
*Part of LEO Protocol v4.2.0 performance optimization*`;

async function createRouterSection() {
  console.log('🔄 Creating smart router section in database...\n');

  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: true });

    // Get current protocol ID
    const { rows: protocols } = await client.query(
      "SELECT id FROM leo_protocols WHERE status = 'active'"
    );

    if (protocols.length === 0) {
      throw new Error('No active protocol found');
    }

    const protocolId = protocols[0].id;

    // Check if router section already exists
    const { rows: existing } = await client.query(
      "SELECT id FROM leo_protocol_sections WHERE section_type = 'smart_router'"
    );

    if (existing.length > 0) {
      console.log('⚠️  Router section already exists. Updating...');

      await client.query(
        `UPDATE leo_protocol_sections
         SET content = $1, context_tier = 'ROUTER', target_file = 'CLAUDE.md'
         WHERE section_type = 'smart_router'`,
        [ROUTER_CONTENT]
      );

      console.log('✅ Router section updated successfully!');
    } else {
      console.log('Creating new router section...');

      await client.query(
        `INSERT INTO leo_protocol_sections
         (protocol_id, section_type, title, content, context_tier, target_file, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          protocolId,
          'smart_router',
          'Context Router & Loading Strategy',
          ROUTER_CONTENT,
          'ROUTER',
          'CLAUDE.md',
          0 // First in order
        ]
      );

      console.log('✅ Router section created successfully!');
    }

    // Verify
    const { rows: verify } = await client.query(
      `SELECT section_type, context_tier, target_file, LENGTH(content) as content_length
       FROM leo_protocol_sections
       WHERE section_type = 'smart_router'`
    );

    console.log('\n📊 Router Section Details:');
    console.log(`   Type: ${verify[0].section_type}`);
    console.log(`   Tier: ${verify[0].context_tier}`);
    console.log(`   Target: ${verify[0].target_file}`);
    console.log(`   Size: ${verify[0].content_length} chars (~${Math.round(verify[0].content_length / 1000)}k)`);

    console.log('\n✅ Router section ready for generation!');

  } catch (error) {
    console.error('❌ Error creating router section:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createRouterSection()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { createRouterSection };
