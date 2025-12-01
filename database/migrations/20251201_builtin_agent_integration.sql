-- Migration: Built-in Agent Integration
-- Date: 2025-12-01
-- Purpose: Add sections for Explore/Plan agent integration with LEO Protocol
-- Protocol: LEO v4.3.3 (additive, no version bump)

-- =============================================================================
-- SECTION 1: builtin_agent_integration (CLAUDE_CORE.md)
-- Three-layer agent architecture overview
-- =============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'builtin_agent_integration',
  '🤖 Built-in Agent Integration',
  '## Built-in Agent Integration

### Three-Layer Agent Architecture

LEO Protocol uses three complementary agent layers:

| Layer | Source | Agents | Purpose |
|-------|--------|--------|---------|
| **Built-in** | Claude Code | `Explore`, `Plan` | Fast discovery & multi-perspective planning |
| **Sub-Agents** | `.claude/agents/` | DATABASE, TESTING, VALIDATION, etc. | Formal validation & gate enforcement |
| **Skills** | `~/.claude/skills/` | 54 skills | Creative guidance & patterns |

### Integration Principle

> **Explore** for discovery → **Sub-agents** for validation → **Skills** for implementation patterns

Built-in agents run FIRST (fast, parallel exploration), then sub-agents run for formal validation (database-driven, deterministic).

### When to Use Each Layer

| Task | Use | Example |
|------|-----|---------|
| "Does this already exist?" | Explore agent | `Task(subagent_type="Explore", prompt="Search for existing auth implementations")` |
| "What patterns do we use?" | Explore agent | `Task(subagent_type="Explore", prompt="Find component patterns in src/")` |
| "Is this schema valid?" | Sub-agent | `node lib/sub-agent-executor.js DATABASE <SD-ID>` |
| "How should I build this?" | Skills | `skill: "schema-design"` or `skill: "e2e-patterns"` |
| "What are the trade-offs?" | Plan agent | Launch 2-3 Plan agents with different perspectives |

### Parallel Execution

Built-in agents support parallel execution. Launch multiple Explore agents in a single message:

```
Task(subagent_type="Explore", prompt="Search for existing implementations")
Task(subagent_type="Explore", prompt="Find related patterns")
Task(subagent_type="Explore", prompt="Identify affected areas")
```

This is faster than sequential exploration and provides comprehensive coverage.',
  5,
  '{"added_in": "4.3.4", "category": "agent_integration", "phase": "CORE"}'
);

-- =============================================================================
-- SECTION 2: lead_explore_integration (CLAUDE_LEAD.md)
-- Explore before validation gates in LEAD phase
-- =============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'lead_explore_integration',
  '🔍 Explore Before Validation (LEAD Phase)',
  '## Explore Before Validation

### Pattern: Discovery → Validation

Before running formal validation gates, use the built-in `Explore` agent for fast codebase discovery:

**Step 1: Launch Explore Agent(s)**
```
Task(subagent_type="Explore", prompt="Search for existing implementations of [feature]")
Task(subagent_type="Explore", prompt="Find similar patterns in the codebase")
Task(subagent_type="Explore", prompt="Identify affected areas and dependencies")
```

**Step 2: Review Explore Findings**
- Existing implementations found? → May not need new SD
- Similar patterns? → Inform PRD design, reuse existing code
- Affected areas identified? → Scope boundaries are clear

**Step 3: Run Formal Validation**
```bash
node lib/sub-agent-executor.js VALIDATION <SD-ID>
```

### Why This Order?

| Agent | Speed | Scope | Authority |
|-------|-------|-------|-----------|
| Explore | Fast (parallel) | Broad discovery | Informational |
| validation-agent | Slower | Gate enforcement | Authoritative (database-backed) |

Explore finds candidates quickly; validation-agent confirms with database-backed checks.

### When to Skip Explore

- **Trivial changes**: Typo fixes, config updates
- **Known scope**: User specifies exact files
- **Follow-up work**: Already explored in previous session
- **Emergency fixes**: Time-critical bug fixes

### Example: New Feature Discovery

```
User: "I want to add user preferences"

Claude: "Let me explore the codebase first."

Task(subagent_type="Explore", prompt="very thorough - Search for existing user preferences, settings, or configuration implementations in both EHG and EHG_Engineer codebases")

[Explore returns: Found UserSettings component in /ehg/src/components, preferences table in database, no EHG_Engineer equivalent]

Claude: "Found existing user preferences in the EHG app. Let me now run formal validation to check for duplicates."

node lib/sub-agent-executor.js VALIDATION <SD-ID>
```',
  15,
  '{"added_in": "4.3.4", "category": "agent_integration", "phase": "LEAD"}'
);

-- =============================================================================
-- SECTION 3: plan_multi_perspective (CLAUDE_PLAN.md)
-- Multi-perspective planning before PRD
-- =============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'plan_multi_perspective',
  '🎯 Multi-Perspective Planning',
  '## Multi-Perspective Planning

### When to Use Plan Agents

Before creating a PRD, consider launching multiple `Plan` agents to explore different approaches:

**Use Plan agents when**:
- Multiple valid architectures exist
- Trade-offs between simplicity/performance/extensibility
- Uncertain about best approach
- Complex feature with many moving parts

**Skip Plan agents when**:
- Approach is obvious
- Small, well-scoped changes
- Following established patterns exactly
- Trivial bug fixes

### Pattern: Perspectives → Selection → PRD

**Step 1: Launch Plan Agents (Parallel)**
```
Task(subagent_type="Plan", prompt="Design from SIMPLICITY perspective: What is the minimal viable approach that solves the problem with the least complexity?")

Task(subagent_type="Plan", prompt="Design from EXISTING PATTERNS perspective: How can we reuse existing infrastructure, components, and patterns already in the codebase?")

Task(subagent_type="Plan", prompt="Design from EXTENSIBILITY perspective: What design would best support future enhancements while avoiding over-engineering?")
```

**Step 2: Present Options to Human**
- Summarize each perspective (key trade-offs)
- Highlight pros/cons
- Recommend one approach with rationale

**Step 3: Human Selects Approach**

**Step 4: Create PRD Based on Selection**
```bash
node scripts/add-prd-to-database.js --sd-id=<SD-ID>
```

**Step 5: Validate PRD**
```bash
node lib/sub-agent-executor.js DATABASE <SD-ID>
node lib/sub-agent-executor.js DESIGN <SD-ID>
```

### Perspective Examples by Task Type

| Task Type | Perspective 1 | Perspective 2 | Perspective 3 |
|-----------|--------------|--------------|--------------|
| New feature | Simplicity | Performance | Maintainability |
| Bug fix | Root cause fix | Quick workaround | Prevention strategy |
| Refactoring | Minimal change | Clean architecture | Gradual migration |
| UI work | User experience | Developer experience | Accessibility |
| API design | RESTful purity | Client convenience | Backwards compatibility |
| Database | Normalized schema | Query performance | Migration safety |

### Quality Over Quantity

Launch 1-3 Plan agents based on complexity:
- **1 agent**: Approach is mostly clear, want sanity check
- **2 agents**: Genuine trade-off between two approaches
- **3 agents**: Complex decision with multiple valid paths

Do NOT launch 3 agents for every task—that wastes time on simple decisions.',
  5,
  '{"added_in": "4.3.4", "category": "agent_integration", "phase": "PLAN"}'
);

-- =============================================================================
-- SECTION 4: plan_verify_explore (CLAUDE_PLAN.md)
-- Scope verification before formal validation in PLAN_VERIFY
-- =============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'plan_verify_explore',
  '✅ Scope Verification with Explore (PLAN_VERIFY)',
  '## Scope Verification with Explore

### Pattern: Explore → Compare → Validate

After EXEC completes, use Explore agent to verify implementation matches plan BEFORE running formal validation:

**Step 1: Launch Explore Agent**
```
Task(subagent_type="Explore", prompt="What files were modified for SD-XXX? List all changed files and compare to the PRD scope. Flag any changes outside the expected scope.")
```

**Step 2: Compare to Plan/PRD**
- Files modified match PRD scope?
- Any unexpected changes outside scope?
- Any PRD requirements not addressed?
- Any TODO comments left unresolved?

**Step 3: Flag Deviations**
- **Scope creep detected** → Document and discuss with human before proceeding
- **Missing requirements** → Complete before validation
- **Unintended changes** → Revert or justify

**Step 4: Run Formal Validation**
```bash
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e
node scripts/github-actions-verifier.js <SD-ID>
```

### Why Explore Before Validation?

| Without Explore First | With Explore First |
|-----------------------|-------------------|
| E2E tests run on wrong/extra code | Scope verified before testing |
| Validation fails late with unclear cause | Deviations caught early |
| Wasted CI/CD cycles | Faster feedback loop |
| Scope creep goes unnoticed | Changes documented explicitly |

### Explore Questions for PLAN_VERIFY

Use these prompts to verify scope compliance:

1. **File inventory**: "List all files modified since EXEC started for this SD"
2. **Scope check**: "Which of these changes are outside the PRD scope?"
3. **Completeness check**: "Are there any PRD requirements not yet addressed?"
4. **Code quality**: "Are there any TODO comments or incomplete implementations?"
5. **Test coverage**: "Do the test files cover all PRD requirements?"

### Example Verification Flow

```
Claude: "EXEC is complete. Let me verify scope compliance before formal validation."

Task(subagent_type="Explore", prompt="List all files modified for SD-AUTH-001 and compare to PRD scope")

[Explore returns:
- Modified: src/auth/login.tsx (in scope)
- Modified: src/auth/session.ts (in scope)
- Modified: src/utils/helpers.ts (NOT in PRD)
- Created: tests/auth.spec.ts (in scope)]

Claude: "Found one file modified outside PRD scope: src/utils/helpers.ts.
This change [describe]. Options:
1. Keep change (document as necessary dependency)
2. Revert change (not needed for this SD)
3. Create follow-up SD for this change

Which do you prefer?"
```',
  100,
  '{"added_in": "4.3.4", "category": "agent_integration", "phase": "PLAN_VERIFY"}'
);

-- =============================================================================
-- SECTION 5: exec_skill_integration (CLAUDE_EXEC.md)
-- Skill usage during EXEC implementation
-- =============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index, metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'exec_skill_integration',
  '📚 Skill Integration (EXEC Phase)',
  '## Skill Integration During EXEC

### When to Invoke Skills

During EXEC, invoke Skills for creative guidance on HOW to implement:

| Task | Invoke Skill | What It Provides |
|------|-------------|------------------|
| Creating database table | `skill: "schema-design"` | Column types, constraints, naming conventions |
| Writing RLS policy | `skill: "rls-patterns"` | Policy templates, common patterns |
| Building React component | `skill: "component-architecture"` | 300-600 LOC sizing, Shadcn patterns |
| Writing E2E test | `skill: "e2e-patterns"` | Playwright structure, user story mapping |
| Handling authentication | `skill: "auth-patterns"` | Supabase Auth patterns, session management |
| Error handling | `skill: "error-handling"` | Unified error patterns, user feedback |
| API endpoints | `skill: "rest-api-design"` | RESTful patterns, status codes |

### Skill Invocation

```
skill: "schema-design"
```

Skills provide patterns, templates, and examples. Apply them to your specific implementation.

### Skills vs Sub-Agents in EXEC

| Layer | When | Purpose | Example |
|-------|------|---------|---------|
| **Skills** | During implementation | Pattern guidance (creative) | "How do I structure this component?" |
| **Sub-agents** | After implementation | Validation (verification) | "Is this migration safe?" |

**Do NOT** invoke sub-agents during EXEC implementation. Save validation for PLAN_VERIFY phase.

### Common Skill Chains by Task

| Implementation Task | Skill Chain (invoke in order) |
|--------------------|-------------------------------|
| New database feature | `schema-design` → `rls-patterns` → `migration-safety` |
| New UI component | `component-architecture` → `design-system` → `ui-testing` |
| New API endpoint | `rest-api-design` → `api-error-handling` → `input-validation` |
| Authentication flow | `auth-patterns` → `access-control` → `secret-management` |
| E2E test suite | `e2e-patterns` → `test-selectors` → `test-fixtures` |
| Performance work | `query-optimization` → `react-performance` → `bundle-optimization` |

### Skill Selection Guide

**Database work**:
- `schema-design` - Table structure, relationships
- `rls-patterns` - Row Level Security
- `migration-safety` - Safe migration practices
- `supabase-patterns` - Triggers, functions

**Frontend work**:
- `component-architecture` - Component sizing, structure
- `design-system` - Tailwind, styling conventions
- `frontend-design` - EHG design system specifics
- `accessibility-guide` - WCAG 2.1 AA patterns

**Testing work**:
- `e2e-patterns` - Playwright structure
- `test-selectors` - Resilient locators
- `test-fixtures` - Auth fixtures, test data
- `test-debugging` - Troubleshooting Arsenal

**Security work**:
- `auth-patterns` - Authentication flows
- `input-validation` - XSS, SQL injection prevention
- `access-control` - RBAC, route protection

### Remember

Skills are for **creative guidance** (how to build).
Sub-agents are for **validation** (did you build it right).
Use skills during EXEC, save sub-agents for PLAN_VERIFY.',
  50,
  '{"added_in": "4.3.4", "category": "agent_integration", "phase": "EXEC"}'
);

-- =============================================================================
-- VERIFICATION QUERY
-- Run this to confirm all 5 sections were inserted
-- =============================================================================

-- SELECT section_type, title, order_index, metadata->>'phase' as phase
-- FROM leo_protocol_sections
-- WHERE protocol_id = 'leo-v4-3-3-ui-parity'
--   AND metadata->>'added_in' = '4.3.4'
-- ORDER BY section_type;
