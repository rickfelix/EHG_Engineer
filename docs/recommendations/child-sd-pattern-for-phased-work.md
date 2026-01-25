# LEO Protocol Enhancement: Child SD Pattern for Phased Work

**Date**: 2025-11-07
**Status**: RECOMMENDATION
**Learning From**: SD-CREWAI-ARCHITECTURE-001 completion challenges

---

## Problem Statement

The current LEO Protocol assumes **linear, single-session SD completion**:
- LEAD (approval) → PLAN (PRD) → EXEC (implementation) → PLAN (verification) → LEAD (final approval)
- Progress validation enforces strict phase ordering
- Multi-session phased work requires retroactive handoff creation
- Progress calculation doesn't handle parallel phases

**Real-World Reality**: Many SDs are naturally **phased across multiple sessions**:
- Infrastructure SDs with multiple subsystems
- Large features broken into phases
- Work done by different agents/people in parallel
- Implementation spread across weeks/months

---

## Proposed Solution: Child SD Pattern

### Concept

**Parent SD** = Orchestrator/Coordinator (never touches code directly)
- Defines overall scope and phases
- Tracks child SD completion
- Orchestrates dependencies between children
- Generates orchestration retrospective

**Child SDs** = Implementation Units (each goes through full LEO cycle)
- Focused scope (single phase/component)
- Complete LEAD→PLAN→EXEC→PLAN→LEAD cycle
- Own user stories, deliverables, handoffs
- Own retrospective (phase-specific lessons)

### Example: SD-CREWAI-ARCHITECTURE-001 (Refactored)

#### Current Approach (Problematic)
```
SD-CREWAI-ARCHITECTURE-001
├── Phase 2: Agent Migration (session 1)
├── Phase 6: RAG UI (pre-existing)
└── Infrastructure: RLS Fixes (session 2)

Problem: Progress validation expects linear completion
Result: 55% progress despite 100% implementation complete
```

#### Proposed Child SD Approach
```
SD-CREWAI-ARCHITECTURE-001 (Parent - Orchestrator)
├── SD-CREWAI-ARCH-001-PHASE2 (Child - Agent Migration)
│   ├── Status: completed (100%)
│   ├── User Stories: 3 stories (21 points)
│   ├── Retrospective: Migration lessons
│   └── Handoffs: Full LEAD→PLAN→EXEC→PLAN→LEAD
│
├── SD-CREWAI-ARCH-001-PHASE6 (Child - RAG UI)
│   ├── Status: completed (100%)
│   ├── User Stories: 5 stories (34 points)
│   ├── Retrospective: UI implementation lessons
│   └── Handoffs: Full cycle
│
└── SD-CREWAI-ARCH-001-INFRA (Child - RLS Fixes)
    ├── Status: completed (100%)
    ├── User Stories: 2 stories (13 points)
    ├── Retrospective: Infrastructure lessons
    └── Handoffs: Full cycle

Parent Completion: When all children = completed
Parent Retrospective: Orchestration and coordination lessons
```

---

## Implementation Guidelines

### 1. When to Use Child SDs

**Use Child SDs when**:
- Work naturally breaks into distinct phases/components
- Phases can be completed in parallel
- Implementation spans multiple sessions/weeks
- Different agents/people work on different phases
- Each phase has ≥3 user stories

**DO NOT use Child SDs when**:
- Work is inherently sequential (one PR, one session)
- Total scope < 5 user stories
- Implementation completes in single session
- No clear phase boundaries

### 2. Parent SD Responsibilities

**Parent SD MUST**:
- Define child SD scope and dependencies
- Track child SD status (blocked/in_progress/completed)
- Create PLAN→EXEC handoff when all children ready
- Generate orchestration retrospective (not implementation retro)
- Manage cross-child dependencies

**Parent SD MUST NOT**:
- Contain implementation code
- Have its own user stories (children have stories)
- Generate E2E tests (children generate tests)
- Track implementation deliverables (children track)

### 3. Child SD Responsibilities

**Each Child SD**:
- Goes through full LEO Protocol cycle (LEAD→PLAN→EXEC→PLAN→LEAD)
- Has focused scope (single phase/component)
- Generates own user stories (3-8 stories typical)
- Creates own deliverables and tests
- Produces own retrospective (phase-specific lessons)
- Links to parent SD via `parent_sd_id` field

### 4. Progress Calculation

**Parent SD Progress**:
```javascript
parent_progress = (
  sum(child.progress * child.weight) / sum(child.weight)
)

// Example:
// Child 1: 100% complete, weight: 30% (Agent Migration)
// Child 2: 100% complete, weight: 50% (RAG UI)
// Child 3: 80% complete, weight: 20% (Infrastructure)
// Parent: (100*0.3 + 100*0.5 + 80*0.2) / 1.0 = 96%
```

**Parent Status**:
- `in_progress`: At least one child not completed
- `completed`: All children completed AND parent retrospective exists

---

## Database Schema Changes

### Add `parent_sd_id` Column
```sql
ALTER TABLE strategic_directives_v2
ADD COLUMN parent_sd_id TEXT REFERENCES strategic_directives_v2(id);

CREATE INDEX idx_sd_parent ON strategic_directives_v2(parent_sd_id);
```

### Add `sd_children` View
```sql
CREATE VIEW sd_children AS
SELECT
  parent.id as parent_id,
  parent.title as parent_title,
  child.id as child_id,
  child.title as child_title,
  child.status as child_status,
  child.progress as child_progress,
  child.priority as child_weight
FROM strategic_directives_v2 parent
JOIN strategic_directives_v2 child ON child.parent_sd_id = parent.id;
```

### Update Progress Function
```sql
CREATE OR REPLACE FUNCTION calculate_parent_sd_progress(p_sd_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_child_count INTEGER;
  v_weighted_progress NUMERIC;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(progress *
           CASE priority
             WHEN 'critical' THEN 0.40
             WHEN 'high' THEN 0.30
             WHEN 'medium' THEN 0.20
             WHEN 'low' THEN 0.10
           END), 0)
  INTO v_child_count, v_weighted_progress
  FROM strategic_directives_v2
  WHERE parent_sd_id = p_sd_id;

  IF v_child_count = 0 THEN
    -- No children, use standard progress calculation
    RETURN calculate_sd_progress(p_sd_id);
  ELSE
    -- Has children, use weighted child progress
    RETURN ROUND(v_weighted_progress);
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## CLAUDE.md Integration

### Add to CLAUDE_PLAN.md (Planning Phase)

```markdown
## When to Create Child SDs

**During PLAN phase**, evaluate if the SD should be split into children:

### Decision Matrix

| Criteria | Single SD | Child SDs |
|----------|-----------|-----------|
| **Scope** | < 8 user stories | ≥ 8 user stories |
| **Phases** | 1-2 phases | 3+ distinct phases |
| **Duration** | 1-2 sessions | 3+ sessions or weeks |
| **Parallelization** | Sequential work | Parallel work possible |
| **Team** | Single agent/person | Multiple agents/people |

### Creating Child SDs

**IMPORTANT**: Child SD creation now uses AI-powered strategic field generation. See [Child SD LLM Generation Reference](../reference/child-sd-llm-generation.md) for technical details.

1. **Define Parent SD** (Orchestrator):
   - Title: "[Component] - Architecture & Orchestration"
   - Scope: Define phases, dependencies, success criteria
   - NO implementation details (children handle implementation)

2. **Create Child SDs** (Implementation):
   - Title: "[Parent] - Phase N: [Phase Name]"
   - Link: Set `parent_sd_id` to parent SD ID
   - Scope: Single phase/component (focused)
   - Stories: 3-8 user stories per child
   - **Strategic Fields**: Auto-generated by LLM based on child context, parent goals, and similar SD patterns

3. **Track Dependencies**:
   - Document in parent SD metadata
   - Block dependent children until prerequisites complete
   - Use `depends_on_child_ids: ['SD-XXX-PHASE1']` in metadata

### AI-Powered Child Creation (Recommended)

Use the async generation method for AI-powered strategic fields:

```javascript
import { generateChildSDAsync } from './modules/child-sd-template.js';

const childSD = await generateChildSDAsync(parentSD, {
  phaseNumber: 1,
  phaseTitle: 'Database Migration',
  phaseDescription: 'Detailed description of what this phase implements',
  phaseScope: 'Specific boundaries and deliverables',
  phaseObjective: 'Main goal for this phase'
});
```

The system will:
- Auto-detect SD type from keywords (database, feature, api, etc.)
- Generate strategic_objectives, key_principles, success_criteria
- Generate success_metrics with quantifiable targets
- Generate smoke_test_steps appropriate for the SD type
- Fetch context from sibling SDs and similar completed SDs
- Include implementation scope inference

See [Child SD LLM Generation Reference](../reference/child-sd-llm-generation.md) for full details on how AI generation works.

### Example

**Parent SD**: SD-PAYMENT-SYSTEM-001 (Payment System Architecture)
**Children**:
- SD-PAYMENT-SYSTEM-001-STRIPE (Stripe Integration) - 5 stories
- SD-PAYMENT-SYSTEM-001-PAYPAL (PayPal Integration) - 4 stories (depends on Stripe)
- SD-PAYMENT-SYSTEM-001-WEBHOOK (Webhook System) - 6 stories
- SD-PAYMENT-SYSTEM-001-ADMIN (Admin Dashboard) - 7 stories
```

### Add to CLAUDE_EXEC.md (Execution Phase)

```markdown
## Working with Child SDs

### Implementation Flow

1. **Start with Parent SD** (LEAD→PLAN):
   - LEAD creates parent SD
   - PLAN breaks into child SDs
   - PLAN creates PRDs for each child
   - Parent PLAN→EXEC handoff: "Child SDs created, ready for parallel execution"

2. **Execute Child SDs** (each independently):
   - Child 1: LEAD→PLAN→EXEC→PLAN→LEAD (complete cycle)
   - Child 2: LEAD→PLAN→EXEC→PLAN→LEAD (can run in parallel)
   - Child 3: LEAD→PLAN→EXEC→PLAN→LEAD (may depend on Child 1/2)

3. **Complete Parent SD** (after all children):
   - All children must be `status: completed`
   - Parent generates orchestration retrospective
   - Parent PLAN→LEAD handoff: "All children complete"

### Parent SD Orchestration Checklist

**Before marking parent SD complete**:
- [ ] All child SDs have `status: completed`
- [ ] All child retrospectives exist (phase-specific lessons)
- [ ] Parent retrospective created (orchestration lessons)
- [ ] Cross-child integration tested (if applicable)
- [ ] Parent EXEC→PLAN handoff documents child completion

### Example Session

```bash
# Check child SD status
node scripts/check-child-sd-status.js SD-PAYMENT-SYSTEM-001

# Output:
# Parent: SD-PAYMENT-SYSTEM-001 (Payment System Architecture)
# ├── SD-PAYMENT-SYSTEM-001-STRIPE: ✅ completed (100%)
# ├── SD-PAYMENT-SYSTEM-001-PAYPAL: ⏳ in_progress (65%)
# ├── SD-PAYMENT-SYSTEM-001-WEBHOOK: ✅ completed (100%)
# └── SD-PAYMENT-SYSTEM-001-ADMIN: 🔴 blocked (0%) - depends on PayPal
#
# Parent progress: 66% (2/4 children complete, 1 in progress)
# Blockers: SD-PAYMENT-SYSTEM-001-ADMIN blocked by SD-PAYMENT-SYSTEM-001-PAYPAL
```
```

---

## Migration Strategy

### For Existing Multi-Phase SDs

1. **Identify Multi-Phase SDs**:
   ```sql
   SELECT id, title, progress
   FROM strategic_directives_v2
   WHERE metadata->>'completion_approach' = 'phased_multi_session'
   AND status != 'completed';
   ```

2. **Create Retroactive Child SDs** (optional):
   - Only for SDs still in progress
   - Completed phased SDs: Leave as-is, document learning

3. **Going Forward**:
   - LEAD agents evaluate: "Should this be child SDs?"
   - PLAN phase creates children if criteria met
   - Update prompts to suggest child SD pattern

---

## Success Metrics

**This pattern succeeds when**:
- Parent SD progress = 100% when all children complete
- No retroactive handoff creation needed
- Each phase has focused retrospective
- Parallel work naturally supported
- Multi-session work flows smoothly

**Indicators this pattern is working**:
- Zero "phased implementation" workarounds
- Child SDs complete independently
- Parent orchestration is clean
- Progress validation passes naturally

---

## Recommendation

**Adopt this pattern** for:
- All SDs with ≥8 user stories
- All infrastructure SDs (typically multi-phase)
- Any SD expected to span multiple sessions
- Work involving multiple agents/people

**Update**:
1. CLAUDE_PLAN.md: Add "When to Create Child SDs" section
2. CLAUDE_EXEC.md: Add "Working with Child SDs" section
3. Database schema: Add `parent_sd_id` column and views
4. Progress calculation: Support parent/child hierarchy

---

## Learning Source

**SD**: SD-CREWAI-ARCHITECTURE-001
**Challenge**: 55% progress despite 100% implementation
**Root Cause**: Phased multi-session work doesn't fit linear validation
**Solution**: Child SD pattern would have avoided all validation issues
**Retrospective**: 3240f4c5-3838-4eef-8315-06c8c75412b2 (quality score: 90/100)

---

## Quality Improvements (2026-01-25)

### AI-Powered Strategic Field Generation

Child SDs are now created with AI-generated strategic fields instead of generic templates. This ensures:

1. **LEAD-TO-PLAN Validation**: All children meet 90% completeness threshold
2. **Context-Appropriate Fields**: Strategic objectives specific to each child's scope
3. **SD Type Awareness**: Different guidance for database vs feature vs infrastructure SDs
4. **Pattern Learning**: Similar completed SDs provide reference patterns
5. **Smoke Test Coverage**: Type-appropriate verification steps (SQL for database, curl for API, etc.)

### Context Sources

The LLM generation system uses:
- Child SD context (title, description, scope, type)
- Parent SD context (overall goal, objectives)
- Sibling SD context (other children in orchestrator)
- Similar completed SDs (pattern reference)
- Implementation scope inference (inferred technical areas)

### Result

Child SDs now pass LEAD-TO-PLAN validation automatically, enabling AUTO-PROCEED mode to flow smoothly through orchestrator children without manual intervention.

**Before Enhancement**:
```
Child SD Created → Missing strategic_objectives → LEAD-TO-PLAN FAILS (40% completeness)
```

**After Enhancement**:
```
Child SD Created → AI generates all fields → LEAD-TO-PLAN PASSES (96% completeness)
```

For technical details, see [Child SD LLM Generation Reference](../reference/child-sd-llm-generation.md).

---

**Author**: Claude Code (analyzing SD-CREWAI-ARCHITECTURE-001 completion challenges)
**Updated**: 2026-01-25 (added AI-powered generation documentation)
**Reviewed By**: [Pending human review]
**Status**: RECOMMENDATION - Ready for LEO Protocol integration
