# Parent PRD Derivation Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-26
- **Tags**: database, api, e2e, migration

**Purpose**: Template and rules for creating parent PRDs from child SD scopes in orchestrator workflows.

**Related SD**: SD-LEO-INFRA-FORMALIZE-ORCHESTRATOR-WORKFLOW-001
**Pattern Origin**: SD-LEO-GEN-RENAME-COLUMNS-SELF-001

---

## Overview

In the orchestrator SD pattern, the **parent PRD is derived FROM child scopes** (not the reverse). This ensures:
1. Clear traceability from parent requirements to child deliverables
2. No orphaned requirements - everything maps to a child
3. Cross-cutting concerns are explicitly documented
4. Sequencing rationale is preserved

---

## Template: Parent PRD (Orchestrator)

### 1. Child Inventory

List all child SDs that will be executed as part of this orchestrator:

| Child SD ID | Title | Type | Dependencies | Status |
|-------------|-------|------|--------------|--------|
| SD-XXX-001A | Foundation - Database Schema | database | None | draft |
| SD-XXX-001B | Implementation - API Endpoints | feature | SD-XXX-001A | draft |
| SD-XXX-001C | Implementation - UI Components | feature | SD-XXX-001B | draft |
| SD-XXX-001D | Polish - Documentation & Tests | documentation | SD-XXX-001B, SD-XXX-001C | draft |

### 2. Consolidated Scope

High-level summary of what all children accomplish together:

> This orchestrator coordinates a 4-phase initiative to [describe goal].
>
> **Phase 1 (Child A)**: [scope summary]
> **Phase 2 (Child B)**: [scope summary]
> **Phase 3 (Child C)**: [scope summary]
> **Phase 4 (Child D)**: [scope summary]
>
> **Out of Scope**: [what is NOT included]

### 3. Cross-Cutting Requirements

Requirements that span multiple children or affect the orchestrator as a whole:

| Req ID | Description | Affects Children | Rationale |
|--------|-------------|------------------|-----------|
| CR-001 | Backward compatibility must be maintained | A, B, C | Existing users should not be affected |
| CR-002 | Feature flag for gradual rollout | B, C | Risk mitigation |
| CR-003 | Monitoring for new endpoints | B | Operational visibility |

### 4. Sequencing/Dependencies

Explain WHY children must execute in a specific order:

```
Dependency Graph:
SD-XXX-001A (Database)
    ↓
SD-XXX-001B (API) - Requires schema from Child A
    ↓
SD-XXX-001C (UI) - Requires endpoints from Child B
    ↓
SD-XXX-001D (Docs) - Requires B and C complete for coverage
```

**Rationale**:
- Child B cannot create API endpoints until Child A's database schema exists
- Child C's UI components depend on Child B's API contracts
- Child D's documentation must reflect final implementation state

### 5. Traceability Map

**REQUIRED**: Map each parent functional requirement to the child SD(s) that implement it.

| Parent FR ID | Description | Implementing Child(ren) |
|--------------|-------------|------------------------|
| FR-001 | User can create new resource | SD-XXX-001B (API), SD-XXX-001C (UI) |
| FR-002 | Data persisted in database | SD-XXX-001A |
| FR-003 | Resource appears in list view | SD-XXX-001B (API), SD-XXX-001C (UI) |
| FR-004 | API documented in OpenAPI spec | SD-XXX-001D |
| FR-005 | E2E tests cover happy path | SD-XXX-001D |

---

## Mapping Rules

### Rule 1: Every Parent FR Must Map to at Least One Child
- If a parent FR has no child mapping, either:
  - Create a child SD to implement it, OR
  - Remove the FR from parent scope

### Rule 2: Child Scopes Roll Up, Not Down
- **Wrong**: Parent PRD defines FRs first, then children are created to match
- **Right**: Children are defined first, parent FRs consolidate what children deliver

### Rule 3: Cross-Cutting = Documented at Parent Level
- If a requirement affects 2+ children, document it in Cross-Cutting section
- Each affected child should reference the parent CR-ID

### Rule 4: Sequencing Must Be Explicit
- Use dependency_chain field in database
- Document rationale (not just "A before B" but WHY)
- Child preflight validates dependency completion

---

## Worked Example

**SD-LEO-GEN-RENAME-COLUMNS-SELF-001** (Origin of this pattern)

### Child Inventory
| Child | Title | Type |
|-------|-------|------|
| SD-LEO-GEN-RENAME-COLUMNS-SELF-001A | Add new columns with correct naming | database |
| SD-LEO-GEN-RENAME-COLUMNS-SELF-001B | Update code references to new columns | refactor |
| SD-LEO-GEN-RENAME-COLUMNS-SELF-001C | Remove deprecated columns | database |

### Traceability Map
| Parent FR | Child(ren) |
|-----------|------------|
| New columns sd_key exists | Child A |
| Code uses sd_key instead of legacy_id | Child B |
| Deprecated legacy_id columns removed | Child C |
| No data loss during migration | Child A (migration script includes data copy) |

### Why This Order?
1. **Child A first**: Creates new columns (can't update code without them)
2. **Child B second**: Updates code to use new columns (both exist, no breaking changes)
3. **Child C last**: Removes old columns (only safe after all code uses new names)

---

## Validation Checklist

Before LEAD approves an orchestrator PRD:

- [ ] Child Inventory section lists all children with IDs
- [ ] Consolidated Scope describes what ALL children accomplish together
- [ ] Cross-Cutting Requirements section exists (even if empty with "None")
- [ ] Sequencing section documents execution order AND rationale
- [ ] Traceability Map covers ALL parent FRs
- [ ] Each FR maps to at least one child
- [ ] No orphaned children (every child appears in at least one FR mapping)

---

## Related Documentation

- **CLAUDE_CORE.md**: "Orchestrator SD Workflow Pattern" section
- **CLAUDE.md**: "Orchestrator SD Decision Guide" section
- **scripts/orchestrator-preflight.js**: Validates orchestrator artifacts
- **scripts/child-sd-preflight.js**: Validates child dependencies

---

*Created: SD-LEO-INFRA-FORMALIZE-ORCHESTRATOR-WORKFLOW-001*
*Pattern Origin: SD-LEO-GEN-RENAME-COLUMNS-SELF-001*
