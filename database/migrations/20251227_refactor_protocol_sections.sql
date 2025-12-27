-- LEO Protocol v4.3.3: Add Refactoring Protocol Sections
-- These sections will be generated into CLAUDE_LEAD.md and CLAUDE_PLAN.md
--
-- Part of: Refactoring Workflow Enhancement
-- Created: 2025-12-27

BEGIN;

-- ============================================================================
-- Section 1: LEAD Refactoring Evaluation (for CLAUDE_LEAD.md)
-- ============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'lead_refactor_evaluation',
  'Refactoring SD Evaluation',
  E'## Refactoring SD Evaluation

When evaluating refactoring SDs, LEAD must apply specialized criteria that differ from feature development.

### SD Type Classification for Refactoring

| sd_type | Description | Documentation |
|---------|-------------|---------------|
| refactor | Code restructuring, tech debt | Intensity-based (see below) |

### Intensity Level Classification (REQUIRED for refactor SDs)

The `intensity_level` field is **REQUIRED** for all refactoring SDs. LEAD must set this during approval.

| Intensity | Scope | LOC Range | Documentation | E2E Testing | REGRESSION |
|-----------|-------|-----------|---------------|-------------|------------|
| cosmetic | Renames, formatting, comments | <50 | Refactor Brief | Optional | Optional |
| structural | Extract method, file reorg, import cleanup | 50-500 | Refactor Brief + E2E | Required | Required |
| architectural | Pattern changes, module boundaries | >500 | Full PRD + REGRESSION | Required | Required |

### Refactoring-Specific LEAD Validation Questions

Before approving a refactoring SD, LEAD must answer these questions:

1. **Code Smell Identification**: What specific code smell or technical debt does this address?
   - Valid answers: duplication, long_method, tight_coupling, deep_nesting, dead_code, other
   - If "other", describe clearly

2. **Scope Clarity**: Is the refactoring scope clearly bounded?
   - Can you list the specific files affected?
   - Are there clear boundaries for what IS and IS NOT being changed?

3. **Behavior Preservation**: Is any behavior change expected?
   - If YES: This is NOT a refactoring. Reject or reclassify as feature/bugfix.
   - If NO: Proceed with refactoring workflow.

4. **Intensity Classification** (REQUIRED): What is the intensity level?
   - cosmetic / structural / architectural
   - This MUST be set in the `intensity_level` column

5. **Regression Risk**: What could break if this refactoring goes wrong?
   - List potential impact areas
   - This informs REGRESSION-VALIDATOR scope

### Workflow Selection by Intensity

```
cosmetic:     LEAD-TO-PLAN → PLAN-TO-LEAD (skip E2E, REGRESSION optional)
structural:   LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD (E2E + REGRESSION required)
architectural: Full LEO workflow with REGRESSION-VALIDATOR mandatory
```

### Example: Approving a Refactoring SD

**SD**: "Consolidate duplicate utility functions into shared module"

**LEAD Evaluation**:
1. Code Smell: duplication
2. Scope: utility functions in 5 files, consolidating to 1 shared module
3. Behavior Change: No - same functions, different location
4. Intensity: structural (extract + consolidate, ~200 LOC)
5. Regression Risk: Breaking imports in consuming files

**Decision**: APPROVED with intensity_level=structural
**Required Sub-agents**: REGRESSION-VALIDATOR
**Documentation**: Refactor Brief (not full PRD)

### Anti-Patterns to Reject

- **Scope Creep**: "While refactoring, also add this feature..." → Split into separate SDs
- **Behavior Change Disguised**: "Refactor the auth flow" (if it changes behavior) → Reclassify as feature
- **No Clear Boundary**: "Improve code quality across the codebase" → Too vague, require specific scope
- **Missing Intensity**: Any refactor SD without intensity_level → Block until set',
  250,
  jsonb_build_object(
    'added_in_version', '4.3.3',
    'purpose', 'LEAD evaluation criteria for refactoring SDs',
    'target_file', 'CLAUDE_LEAD.md',
    'created_by', 'LEO v4.3.3 Refactoring Enhancement'
  )
)
ON CONFLICT (protocol_id, section_type)
DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata;

-- ============================================================================
-- Section 2: PLAN Refactor Brief Guide (for CLAUDE_PLAN.md)
-- ============================================================================

INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata
) VALUES (
  'leo-v4-3-3-ui-parity',
  'plan_refactor_brief_guide',
  'Refactor Brief Documentation',
  E'## Refactor Brief Documentation

For refactoring SDs with `intensity_level` of cosmetic or structural, use a Refactor Brief instead of a full PRD.

### When to Use Refactor Brief vs Full PRD

| Intensity | Documentation Type | Generator Script |
|-----------|-------------------|------------------|
| cosmetic | Refactor Brief | `node scripts/create-refactor-brief.js SD-XXX` |
| structural | Refactor Brief | `node scripts/create-refactor-brief.js SD-XXX` |
| architectural | Full PRD | `node scripts/add-prd-to-database.js SD-XXX` |

### Creating a Refactor Brief

```bash
# Basic usage
node scripts/create-refactor-brief.js SD-REFACTOR-001

# Interactive mode (prompts for details)
node scripts/create-refactor-brief.js SD-REFACTOR-001 --interactive

# With pre-specified options
node scripts/create-refactor-brief.js SD-REFACTOR-001 --files "src/a.ts,src/b.ts" --smell "duplication"
```

### Refactor Brief Structure

A Refactor Brief contains these lightweight sections:

1. **Document Information**
   - SD ID, Title, Intensity, Created Date, Status

2. **Current State**
   - Code location (primary files, related files)
   - Current implementation description
   - Code smell type being addressed

3. **Desired State**
   - Proposed structure after refactoring
   - Key changes checklist
   - Expected benefits

4. **Files Affected**
   - Table: File | Change Type | Risk Level | Notes
   - Total files and estimated LOC

5. **Risk Zones**
   - Circular dependency risk
   - Breaking import risk
   - Public API change risk
   - Test risks

6. **Verification Criteria**
   - Pre-refactor baseline (tests pass, build succeeds, lint clean)
   - Post-refactor validation (same criteria + imports resolve)
   - REGRESSION-VALIDATOR checklist

7. **Rollback Plan**
   - Git revert command
   - Manual rollback steps if needed

8. **Sign-off**
   - LEAD approval, baseline captured, validation complete, REGRESSION verdict

### REGRESSION-VALIDATOR Integration

For structural and architectural refactoring, invoke the REGRESSION sub-agent:

**Baseline Capture** (before refactoring):
```bash
# REGRESSION captures:
# - Test suite results
# - Public API signatures (exports)
# - Import dependency graph
# - Test coverage metrics
```

**Post-Refactor Validation** (after refactoring):
```bash
# REGRESSION compares:
# - Tests pass without modification
# - API signatures unchanged
# - All imports resolve
# - Coverage not decreased
```

**Verdict Types**:
- **PASS**: All checks passed, refactoring is safe
- **CONDITIONAL_PASS**: Minor issues found, document and proceed with caution
- **FAIL**: Breaking changes detected, fix before proceeding

### Refactoring Handoff Validation

When transitioning phases for refactoring SDs:

| Transition | Required for Refactoring |
|------------|--------------------------|
| LEAD-TO-PLAN | Intensity level set, code smell identified |
| PLAN-TO-EXEC | Refactor Brief stored, files identified |
| EXEC-TO-PLAN | REGRESSION baseline captured |
| PLAN-TO-LEAD | REGRESSION verdict obtained, all tests pass |

### Example: Structural Refactoring Workflow

1. **LEAD Approval**: Sets intensity_level=structural, identifies code smell
2. **PLAN Phase**:
   - Run `node scripts/create-refactor-brief.js SD-XXX --interactive`
   - Brief stored in `product_requirements_v2` with `document_type=''refactor_brief''`
3. **EXEC Phase**:
   - REGRESSION captures baseline before changes
   - Implement refactoring following brief
   - Run tests continuously
4. **VERIFY Phase**:
   - REGRESSION compares before/after
   - All tests must pass WITHOUT modification
   - Verdict: PASS required for completion
5. **LEAD Final**: Review REGRESSION verdict, approve closure',
  260,
  jsonb_build_object(
    'added_in_version', '4.3.3',
    'purpose', 'PLAN phase guide for Refactor Brief documentation',
    'target_file', 'CLAUDE_PLAN.md',
    'created_by', 'LEO v4.3.3 Refactoring Enhancement'
  )
)
ON CONFLICT (protocol_id, section_type)
DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata;

COMMIT;

-- Verification query
SELECT section_type, title, order_index
FROM leo_protocol_sections
WHERE section_type IN ('lead_refactor_evaluation', 'plan_refactor_brief_guide')
ORDER BY order_index;
