# Progressive Learning Format


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, api, testing, e2e

**Generated**: 2025-10-19
**Source**: SD-PROOF-DRIVEN-1758340937844
**Context Tier**: REFERENCE

---

## Purpose

The Progressive Learning Format provides a tiered approach to prompt engineering that balances context efficiency with comprehensive knowledge transfer. Instead of front-loading all details, learning prompts start brief and progressively reveal complexity based on need.

## Problem Statement

Traditional documentation approaches face a tension:
- **Comprehensive docs**: High value but consume significant context tokens upfront
- **Brief docs**: Low context cost but risk missing critical details
- **Result**: Either wasted context or incomplete understanding

## Solution: 3-Tier Progressive Disclosure

The Progressive Learning Format uses a tiered structure where each tier adds detail only when needed:

```
TIER 1: Essential Basics (5k chars)
   ↓ (only if needed)
TIER 2: Detailed Context (10k chars total)
   ↓ (only if needed)
TIER 3: Comprehensive Reference (15k chars total)
```

---

## Tier Definitions

### Tier 1: Essential Basics (~5k chars)

**Purpose**: Enable 80% of tasks with minimal context consumption

**Contents**:
- Core concept definition (1-2 paragraphs)
- Critical requirements or constraints (3-5 bullet points)
- Most common use case (single example)
- Quick reference commands
- Link to Tier 2 prompt

**Format**:
```markdown
# [Topic Name] - Quick Start

## What It Is
[1-2 paragraph definition]

## Critical Rules
1. [Most important rule]
2. [Second most important rule]
3. [Third most important rule]

## Common Use Case
[Single example showing 80% use case]

## Quick Reference
- Command: `[most common command]`
- File: `[most important file]`
- Doc: `[link to full docs]`

---
**Need More Details?** → Use prompt: "Load [Topic] Tier 2"
```

**Example - Session Prologue (Tier 1)**:
```markdown
# LEO Protocol - Session Prologue

## What You Need to Know
1. Follow LEAD→PLAN→EXEC workflow
2. Database-first (no markdown as source of truth)
3. Use process scripts (add-prd-to-database.js, unified-handoff-system.js)
4. Small PRs (≤100 lines target)

## Quick Commands
- Start SD: `node scripts/add-prd-to-database.js SD-XXX "Title"`
- Create handoff: `node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-XXX`

---
**Need More Details?** → "Load LEO Protocol Tier 2"
```

---

### Tier 2: Detailed Context (~10k chars total)

**Purpose**: Handle edge cases and complex scenarios

**Contents**:
- Extended concept explanation with rationale
- Complete requirements list (10-15 items)
- 3-5 common examples covering different scenarios
- Error handling patterns
- Integration points with other systems
- Link to Tier 3 prompt

**Format**:
```markdown
# [Topic Name] - Detailed Guide

## Core Concepts
[3-4 paragraphs with background and rationale]

## Complete Requirements
1. [Requirement with explanation]
2. [Requirement with explanation]
...

## Common Scenarios

### Scenario 1: [Name]
[Example with context]

### Scenario 2: [Name]
[Example with context]

### Scenario 3: [Name]
[Example with context]

## Error Handling
- **Error**: [Common error]
  **Fix**: [Solution]
  **Prevention**: [How to avoid]

## Integration
- Connects to: [System A], [System B]
- Required by: [System C]

---
**Need Complete Reference?** → "Load [Topic] Tier 3"
```

**Example - Session Prologue (Tier 2)**:
```markdown
# LEO Protocol - Detailed Workflow

## 5-Phase Workflow
LEAD → PLAN → EXEC → PLAN (verification) → LEAD (approval)

### LEAD Phase
- Strategic validation (6 questions)
- Over-engineering check (rubric)
- Resource feasibility
- Approval gate

### PLAN Phase
- PRD creation via add-prd-to-database.js
- Auto-triggers STORIES sub-agent
- User stories with implementation_context
- PLAN→EXEC handoff

### EXEC Phase
- Implementation in target application
- Dual testing (unit + E2E mandatory)
- Git workflow (feature branch)
- EXEC→PLAN handoff

### Verification (PLAN Phase)
- Test result validation
- Coverage analysis (100% E2E required)
- Quality gates

### Final Approval (LEAD Phase)
- Production readiness check
- Deployment approval

## Process Scripts

### Creating PRDs
`node scripts/add-prd-to-database.js SD-XXX "Title"`
- Triggers STORIES sub-agent automatically
- Populates implementation_context
- Enforces quality constraints (≥3 functional reqs, ≥1 test scenario)

### Creating Handoffs
`node scripts/unified-handoff-system.js execute [TYPE] SD-XXX`
- Types: LEAD-to-PLAN, PLAN-to-EXEC, EXEC-to-PLAN
- Automatic validation gates
- Rejection with improvement guidance

---
**Need Schema Details?** → "Load LEO Protocol Tier 3"
```

---

### Tier 3: Comprehensive Reference (~15k chars total)

**Purpose**: Complete system reference for rare edge cases and maintenance

**Contents**:
- Full technical specification
- All requirements and constraints
- Complete examples with variations
- Database schemas
- Error catalog with solutions
- Migration guides
- Architecture diagrams
- Performance considerations

**Format**:
```markdown
# [Topic Name] - Complete Reference

## Full Specification
[Complete technical details]

## Database Schema
[Table definitions with field descriptions]

## Complete API Reference
[All functions/methods with parameters]

## Error Catalog
[Comprehensive error list with solutions]

## Performance Tuning
[Optimization guidelines]

## Migration Guide
[Version upgrade paths]

---
**This is the complete reference. No additional tiers available.**
```

---

## When to Use Each Tier

### Use Tier 1 When:
- Starting a new session
- User is familiar with topic
- Simple, routine task
- Context budget is constrained (>70% used)
- Speed is prioritized over completeness

### Use Tier 2 When:
- Encountering edge cases not covered in Tier 1
- User explicitly requests more detail
- Complex integration required
- Debugging unusual issues
- Context budget is healthy (<70% used)

### Use Tier 3 When:
- Maintaining or modifying the system itself
- Investigating architectural decisions
- Training new team members
- Troubleshooting rare errors
- Context budget is abundant (<50% used)

---

## Implementation Pattern: Context Router

The CLAUDE.md router file implements this pattern:

```markdown
# CLAUDE.md - Router

Step 1: ALWAYS read CLAUDE_CORE.md (Tier 1, 15k chars)

Step 2: Detect phase and load Tier 2
- "approve SD" → CLAUDE_LEAD.md (25k chars)
- "create PRD" → CLAUDE_PLAN.md (30k chars)
- "implement" → CLAUDE_EXEC.md (20k chars)

Step 3: Load Tier 3 reference ONLY when specific issues arise
- Database error → docs/reference/database-agent-patterns.md
- Validation failure → docs/reference/validation-enforcement.md
- etc.
```

**Context Consumption**:
- Old approach: 123k chars upfront (62% of budget) ❌
- Tier 1 only: 18k chars (9% of budget) ✅
- Tier 1 + Tier 2: 43k chars avg (22% of budget) ✅
- Tier 1 + Tier 2 + Tier 3: 58k chars avg (29% of budget) ✅

**Efficiency Gain**: 85% reduction in initial context load

---

## Progressive Prompt Templates

### Template: Tier 1 → Tier 2 Transition

```markdown
**Current Context**: [Topic] Tier 1 loaded (5k chars)
**Issue**: [Description of what Tier 1 doesn't cover]

**Request**: Load [Topic] Tier 2 for detailed guidance on [specific aspect]

**Reason**: [Why Tier 2 is needed]
- Tier 1 covers: [what you already know]
- Tier 1 missing: [what you need]
- Context budget: X% (healthy for Tier 2 load)
```

### Template: Tier 2 → Tier 3 Transition

```markdown
**Current Context**: [Topic] Tier 2 loaded (10k chars)
**Issue**: [Complex scenario not covered]

**Request**: Load [Topic] Tier 3 for complete reference on [specific detail]

**Reason**: [Why Tier 3 is needed]
- Tier 2 covers: [what you've learned]
- Tier 2 missing: [architectural/schema/rare edge case detail]
- Context budget: X% (sufficient for Tier 3 load)
- Task: [Maintenance | Architecture | Training | Debugging rare issue]
```

---

## Benefits of Progressive Learning

### Context Efficiency
- **Before**: 123k chars loaded upfront regardless of task complexity
- **After**: 5k chars for simple tasks, 10k for complex tasks, 15k for rare cases
- **Savings**: 80-96% reduction in typical context consumption

### Cognitive Load Reduction
- Start with minimal, focused information
- Add complexity only when encountered
- Avoid overwhelming with irrelevant details

### Faster Time-to-Value
- Get started immediately with Tier 1 essentials
- No need to parse comprehensive docs before beginning
- Learn through progressive discovery

### Maintenance Benefits
- Easier to update (Tier 1 changes rarely, Tier 3 changes frequently)
- Clearer separation of essential vs. reference material
- Better tracking of what knowledge is actually used

---

## Authoring Guidelines

### Writing Tier 1 Content

1. **Identify the 80% Use Case**
   - What will most users need most of the time?
   - What is the simplest path to success?

2. **Ruthlessly Prioritize**
   - Max 5 bullet points for requirements
   - Single example only
   - Defer everything else to Tier 2

3. **Provide Clear Escape Hatch**
   - Always end with prompt to load Tier 2
   - Hint at what Tier 2 covers

4. **Target 5k Characters**
   - Short enough to load multiple Tier 1 docs
   - Long enough to be genuinely useful

### Writing Tier 2 Content

1. **Build on Tier 1**
   - Reference Tier 1 content, don't repeat it
   - Add "why" and "how" to Tier 1's "what"

2. **Cover Common Edge Cases**
   - Not all edge cases (that's Tier 3)
   - Just the ones that users commonly encounter

3. **Include Error Handling**
   - Common errors with solutions
   - Prevention strategies

4. **Target 10k Total Characters**
   - Tier 2 content: 5k additional
   - Total load: Tier 1 (5k) + Tier 2 (5k) = 10k

### Writing Tier 3 Content

1. **Complete Technical Reference**
   - No shortcuts, no assumptions
   - Include everything

2. **Assume Maintenance Context**
   - Reader may be modifying the system
   - Explain architectural decisions

3. **Include All Edge Cases**
   - Rare errors
   - Migration paths
   - Performance tuning

4. **Target 15k Total Characters**
   - Tier 3 content: 5k additional
   - Total load: Tier 1 (5k) + Tier 2 (5k) + Tier 3 (5k) = 15k

---

## Examples in Practice

### Example 1: Session Start

**User**: "Create PRD for SD-EXPORT-001"

**AI Response**:
```markdown
Loading CLAUDE_CORE.md (Tier 1, 15k chars)...
Loading CLAUDE_PLAN.md (Tier 2, 30k chars)...

Total context: 45k chars (23% of budget) ✅ HEALTHY

Proceeding with PRD creation using add-prd-to-database.js...
```

**Rationale**:
- Tier 1 (CLAUDE_CORE) provides session essentials
- Tier 2 (CLAUDE_PLAN) provides PRD creation workflow
- Tier 3 not needed (routine task)

### Example 2: Database Error

**User**: "Getting 'column does not exist' error"

**AI Response**:
```markdown
Current context: CLAUDE_CORE.md (Tier 1, 15k chars)

Error indicates database schema issue. Loading Tier 3 reference...
Loading docs/reference/database-agent-patterns.md (15k chars)...

Total context: 30k chars (15% of budget) ✅ HEALTHY

Analyzing error with database agent patterns...
```

**Rationale**:
- Skip Tier 2 (phase-specific workflow not relevant)
- Jump to Tier 3 (database reference) to debug schema issue

### Example 3: Context-Constrained Session

**User**: "Quick fix to button styling" (context at 75%)

**AI Response**:
```markdown
Context budget: 75% ⚠️ WARNING

Loading minimal context:
- CLAUDE_CORE.md: SKIPPED (session already in progress)
- CLAUDE_EXEC.md: Loading Tier 1 only (5k chars)

Total additional context: 5k chars (2.5% of budget)

Proceeding with UI fix...
```

**Rationale**:
- Context budget constrained
- Use Tier 1 only for simple task
- Avoid loading full EXEC Tier 2 (20k chars)

---

## Metrics and Success Criteria

### Context Efficiency Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Average initial load | <25k chars | Tier 1 + 1 Tier 2 doc |
| Simple task completion | <10k chars | Tier 1 only |
| Complex task completion | <50k chars | Tier 1 + 2 Tier 2 docs + 1 Tier 3 |
| Context at handoff creation | <70% budget | <140k chars used |

### Knowledge Transfer Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first action | <2 min | Time from prompt to first tool use |
| Error rate reduction | >50% | Errors before/after progressive format |
| Tier 2 load rate | 30-40% | % of sessions requiring Tier 2 |
| Tier 3 load rate | <10% | % of sessions requiring Tier 3 |

---

## Migration Guide: Converting Existing Docs

### Step 1: Analyze Current Doc

Questions to answer:
1. What is the 80% use case?
2. What information is essential vs. reference?
3. What are common errors/edge cases vs. rare ones?
4. How often is each section actually used?

### Step 2: Create Tier 1 Extract

Extract from existing doc:
- Core definition (first 1-2 paragraphs usually)
- Top 3-5 requirements
- Single most common example
- Quick reference section

Target: 5k characters

### Step 3: Create Tier 2 Enhancement

From remaining content, extract:
- Extended explanation
- Common scenarios (3-5 examples)
- Error handling
- Integration points

Target: 5k additional characters

### Step 4: Preserve as Tier 3

Remaining content becomes Tier 3:
- Complete specification
- All edge cases
- Architecture details
- Performance tuning

Target: 5k additional characters

### Step 5: Add Progressive Prompts

Add to each tier:
- Tier 1: Link to "Load Tier 2" prompt
- Tier 2: Link to "Load Tier 3" prompt
- Tier 3: "Complete reference" notice

---

## Related Documentation

- `CLAUDE.md` - Router implementation using progressive loading
- `docs/reference/context-monitoring.md` - Context budget management
- `docs/leo/sub-agents/compression.md` - Complementary compression techniques

---

*This is reference documentation, load on-demand only*
*Generated from: SD-PROOF-DRIVEN-1758340937844*
*Last updated: 2025-10-19*
