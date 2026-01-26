# Strategic Directive Parent-Child Hierarchy Schema Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, testing, e2e, unit

**Generated**: 2025-12-20
**Purpose**: Reference guide for creating E2E test orchestrator parent SD with child SDs
**Database**: dedlbzhpgkmetvhbkyzq (EHG_Engineer - CONSOLIDATED)

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Required vs Optional Fields](#required-vs-optional-fields)
3. [Parent-Child Hierarchy Fields](#parent-child-hierarchy-fields)
4. [Valid Enum Values](#valid-enum-values)
5. [Validation Profiles by SD Type](#validation-profiles-by-sd-type)
6. [Existing Parent-Child Examples](#existing-parent-child-examples)
7. [Creation Workflow](#creation-workflow)
8. [Common Patterns](#common-patterns)

---

## Schema Overview

**Table**: `strategic_directives_v2`
**Primary Key**: `id` (character varying(50)) - Human-readable format (e.g., SD-E2E-TEST-001)
**Foreign Key for Hierarchy**: `parent_sd_id` → `strategic_directives_v2.id`

### Key Hierarchy Fields

| Field | Type | Nullable | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | varchar(50) | NO | - | Primary identifier (e.g., SD-E2E-ORCHESTRATOR) |
| `parent_sd_id` | varchar(50) | YES | NULL | References parent SD's `id` field |
| `relationship_type` | text | YES | 'standalone' | Values: 'standalone', 'parent', 'child' |
| `sd_type` | varchar(50) | NO | 'feature' | Values: 'feature', 'infrastructure', 'database', 'security', 'documentation' |
| `dependency_chain` | jsonb | YES | NULL | For parent SDs: ordered child execution plan |

---

## Required vs Optional Fields

### REQUIRED FIELDS (Must provide on INSERT)

```javascript
{
  id: 'SD-E2E-ORCHESTRATOR',              // Human-readable ID
  title: 'E2E Test Execution Orchestrator', // Brief title (max 500 chars)
  category: 'infrastructure',              // SD category
  priority: 'critical',                    // critical/high/medium/low
  description: 'Full description...',      // What needs to be done
  rationale: 'Why this is needed...',      // Business justification
  scope: 'What is in/out of scope...',     // Scope boundaries
  sd_key: 'SD-2025-12-20-e2e-orchestrator', // Alternative key format
  status: 'draft',                         // draft/active/in_progress/etc
  sd_type: 'infrastructure',               // Type classification
  sequence_rank: 100                       // Execution order (auto-assigned if not provided)
}
```

**Note**: `uuid_id` and `version` have defaults, so not required.

### OPTIONAL FIELDS (Have defaults or can be NULL)

```javascript
{
  // Hierarchy fields
  parent_sd_id: null,                      // NULL for parent SDs
  relationship_type: 'parent',             // Default: 'standalone'
  dependency_chain: {                      // Only for parent SDs
    children: [
      { sd_id: 'SD-E2E-001', order: 1, depends_on: null },
      { sd_id: 'SD-E2E-002', order: 2, depends_on: ['SD-E2E-001'] }
    ]
  },

  // Metadata fields
  complexity_level: 'complex',             // Default: 'moderate'
  current_phase: 'LEAD_APPROVAL',          // Default: 'LEAD_APPROVAL'
  target_application: 'EHG_Engineer',      // Default: 'EHG'
  is_active: true,                         // Default: true
  is_working_on: false,                    // Default: false

  // Progress tracking
  progress_percentage: 0,                  // Default: 0
  phase_progress: 0,                       // Default: 0

  // JSONB arrays (all default to '[]')
  strategic_objectives: [],
  success_criteria: [],
  dependencies: [],
  risks: [],
  success_metrics: [],
  stakeholders: [],
  key_changes: [],
  key_principles: [],
  implementation_guidelines: []
}
```

---

## Parent-Child Hierarchy Fields

### 1. For PARENT (Orchestrator) SDs

```javascript
{
  id: 'SD-E2E-ORCHESTRATOR',
  relationship_type: 'parent',
  parent_sd_id: null,                    // Parent has no parent
  sd_type: 'infrastructure',             // Usually 'infrastructure' for orchestrators
  dependency_chain: {
    children: [
      {
        sd_id: 'SD-E2E-PLAYWRIGHT-SETUP',
        order: 1,
        depends_on: null               // First child has no dependencies
      },
      {
        sd_id: 'SD-E2E-CORE-FLOWS',
        order: 2,
        depends_on: ['SD-E2E-PLAYWRIGHT-SETUP']  // Depends on first child
      },
      {
        sd_id: 'SD-E2E-ADVANCED-SCENARIOS',
        order: 3,
        depends_on: ['SD-E2E-CORE-FLOWS']
      }
    ]
  }
}
```

### 2. For CHILD SDs

```javascript
{
  id: 'SD-E2E-PLAYWRIGHT-SETUP',
  parent_sd_id: 'SD-E2E-ORCHESTRATOR',   // References parent's id
  relationship_type: 'child',             // Mark as child
  sd_type: 'infrastructure',              // Can be any type
  dependency_chain: null                  // Children don't have dependency_chain
}
```

---

## Valid Enum Values

### Status Values
```sql
'draft', 'in_progress', 'active', 'pending_approval', 'completed', 'deferred', 'cancelled'
```

### Priority Values
```sql
'critical', 'high', 'medium', 'low'
```

### SD Type Values
```sql
'feature', 'infrastructure', 'database', 'security', 'documentation'
```

### Relationship Type Values
```sql
'standalone', 'parent', 'child'
```

### Complexity Level Values
```sql
'simple', 'moderate', 'complex', 'critical'
```

### Current Phase Values
```sql
'LEAD_APPROVAL', 'PLAN_PRD', 'EXEC_IMPLEMENTATION', 'PLAN_VERIFY', 'LEAD_FINAL'
```

### Target Application Values
```sql
'EHG', 'EHG_Engineer'
```

---

## Validation Profiles by SD Type

Each SD type has different requirements from `sd_type_validation_profiles`:

| SD Type | Requires PRD | Requires Deliverables | Requires E2E Tests | Required Handoffs |
|---------|--------------|----------------------|-------------------|-------------------|
| feature | true | true | true | LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN |
| infrastructure | true | true | true | LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN |
| database | true | true | true | LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN |
| security | true | true | true | LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN |
| documentation | true | true | false | LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN |

**Phase Weights** (must sum to 100):
- LEAD: 20%
- PLAN: 20%
- EXEC: 30%
- VERIFY: 15%
- FINAL: 15%

---

## Existing Parent-Child Examples

### Example 1: SD-INDUSTRIAL-2025-001 (4 children)

**Parent**:
```javascript
{
  id: 'SD-INDUSTRIAL-2025-001',
  title: 'Sovereign Industrial Expansion - Stages 7-25 Materialization',
  relationship_type: 'parent',
  sd_type: 'orchestrator',
  status: 'active'
}
```

**Children**:
```javascript
[
  {
    id: 'SD-IND-A-STAGES-7-11',
    parent_sd_id: 'SD-INDUSTRIAL-2025-001',
    relationship_type: 'child',
    title: 'Block A: GTM & Persona Fit (Stages 7-11)'
  },
  {
    id: 'SD-IND-B-STAGES-12-16',
    parent_sd_id: 'SD-INDUSTRIAL-2025-001',
    relationship_type: 'child',
    title: 'Block B: Sales & Operational Flow (Stages 12-16)'
  },
  {
    id: 'SD-IND-C-STAGES-17-21',
    parent_sd_id: 'SD-INDUSTRIAL-2025-001',
    relationship_type: 'child',
    title: 'Block C: MVP Feedback Loop (Stages 17-21)'
  },
  {
    id: 'SD-IND-D-STAGES-22-25',
    parent_sd_id: 'SD-INDUSTRIAL-2025-001',
    relationship_type: 'child',
    title: 'Block D: Infrastructure & Exit (Stages 22-25)'
  }
]
```

### Example 2: SD-HARDENING-V2-002 (3 children)

**Parent**:
```javascript
{
  id: 'SD-HARDENING-V2-002',
  title: 'Stage Transition Safety',
  relationship_type: 'child',           // Can be a child itself!
  parent_sd_id: 'SD-HARDENING-V2-000',  // Has a parent
  status: 'active'
}
```

**Children** (grandchildren of SD-HARDENING-V2-000):
```javascript
[
  {
    id: 'SD-HARDENING-V2-002A',
    parent_sd_id: 'SD-HARDENING-V2-002',
    relationship_type: 'child',
    title: 'Schema Field Alignment'
  },
  {
    id: 'SD-HARDENING-V2-002B',
    parent_sd_id: 'SD-HARDENING-V2-002',
    relationship_type: 'child',
    title: 'Gateway Enforcement'
  },
  {
    id: 'SD-HARDENING-V2-002C',
    parent_sd_id: 'SD-HARDENING-V2-002',
    relationship_type: 'child',
    title: 'Idempotency & Persistence'
  }
]
```

---

## Creation Workflow

### Step 1: Create Parent SD

```javascript
const parentSD = {
  // Required fields
  id: 'SD-E2E-TEST-ORCHESTRATOR',
  title: 'E2E Test Execution Orchestrator',
  category: 'infrastructure',
  priority: 'critical',
  status: 'draft',
  sd_type: 'infrastructure',
  sd_key: 'SD-2025-12-20-e2e-orchestrator',
  description: 'Orchestrates end-to-end test suite execution across all critical user journeys...',
  rationale: 'Ensure comprehensive E2E coverage before production deployments...',
  scope: 'IN SCOPE: Playwright setup, core flows, advanced scenarios. OUT OF SCOPE: Unit tests, integration tests.',
  sequence_rank: 100,  // Will be auto-assigned if omitted

  // Hierarchy fields
  parent_sd_id: null,
  relationship_type: 'parent',

  // Optional but recommended
  complexity_level: 'complex',
  target_application: 'EHG_Engineer',
  strategic_objectives: [
    { objective: 'Achieve 90% E2E coverage', metric: 'Critical flows tested' }
  ],
  success_criteria: [
    { criterion: 'All core flows have E2E tests', measure: 'Test count >= 20' }
  ]
};
```

### Step 2: Create Child SDs

```javascript
const childSDs = [
  {
    // Required fields
    id: 'SD-E2E-PLAYWRIGHT-SETUP',
    title: 'Playwright E2E Framework Setup',
    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'SD-2025-12-20-playwright-setup',
    description: 'Install and configure Playwright for E2E testing...',
    rationale: 'Foundation for all E2E tests...',
    scope: 'Setup, configuration, CI integration...',
    sequence_rank: 101,

    // Hierarchy fields (CRITICAL)
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    relationship_type: 'child'
  },
  {
    id: 'SD-E2E-CORE-FLOWS',
    title: 'E2E Tests for Core User Flows',
    category: 'feature',
    priority: 'high',
    status: 'draft',
    sd_type: 'feature',
    sd_key: 'SD-2025-12-20-e2e-core-flows',
    description: 'Implement E2E tests for critical paths...',
    rationale: 'Protect core functionality...',
    scope: 'Login, navigation, CRUD operations...',
    sequence_rank: 102,

    // Hierarchy fields
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    relationship_type: 'child'
  },
  {
    id: 'SD-E2E-ADVANCED-SCENARIOS',
    title: 'E2E Tests for Advanced Scenarios',
    category: 'feature',
    priority: 'medium',
    status: 'draft',
    sd_type: 'feature',
    sd_key: 'SD-2025-12-20-e2e-advanced',
    description: 'Complex user journeys and edge cases...',
    rationale: 'Comprehensive coverage...',
    scope: 'Multi-step workflows, error handling...',
    sequence_rank: 103,

    // Hierarchy fields
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    relationship_type: 'child'
  }
];
```

### Step 3: Update Parent with Dependency Chain (Optional)

```javascript
// Update parent SD after children are created
UPDATE strategic_directives_v2
SET dependency_chain = {
  "children": [
    {
      "sd_id": "SD-E2E-PLAYWRIGHT-SETUP",
      "order": 1,
      "depends_on": null
    },
    {
      "sd_id": "SD-E2E-CORE-FLOWS",
      "order": 2,
      "depends_on": ["SD-E2E-PLAYWRIGHT-SETUP"]
    },
    {
      "sd_id": "SD-E2E-ADVANCED-SCENARIOS",
      "order": 3,
      "depends_on": ["SD-E2E-CORE-FLOWS"]
    }
  ]
}
WHERE id = 'SD-E2E-TEST-ORCHESTRATOR';
```

---

## Common Patterns

### Pattern 1: Orchestrator with Sequential Children

```
SD-PARENT (orchestrator)
├── SD-CHILD-1 (must complete first)
├── SD-CHILD-2 (depends on SD-CHILD-1)
└── SD-CHILD-3 (depends on SD-CHILD-2)
```

**Use Case**: E2E testing where setup must complete before tests run.

### Pattern 2: Orchestrator with Parallel Children

```
SD-PARENT (orchestrator)
├── SD-CHILD-1 (independent)
├── SD-CHILD-2 (independent)
└── SD-CHILD-3 (independent)
```

**Use Case**: Independent feature development that can run in parallel.

### Pattern 3: Multi-Level Hierarchy

```
SD-GRANDPARENT (orchestrator)
└── SD-PARENT (child + orchestrator)
    ├── SD-CHILD-1
    ├── SD-CHILD-2
    └── SD-CHILD-3
```

**Use Case**: Complex initiatives with multiple phases, each with sub-tasks.

---

## Database Triggers & Constraints

### Auto-Assigned Fields

- `sequence_rank`: Auto-assigned if not provided (via `assign_sequence_rank()` trigger)
- `uuid_id`: Auto-generated via `gen_random_uuid()`
- `created_at`, `updated_at`: Auto-set via triggers

### Validation Triggers

- `validate_sd_hierarchy()`: Ensures parent_sd_id references valid parent
- `inherit_parent_contracts()`: Inherits data contracts from parent
- `inherit_parent_metadata()`: Inherits governance metadata from parent
- `check_contract_requirements()`: Validates contract compliance

### Important Constraints

- `strategic_directives_v2_parent_sd_id_fkey`: Foreign key ensures parent exists
- `strategic_directives_v2_relationship_type_check`: Validates relationship_type enum
- `strategic_directives_v2_status_check`: Validates status enum
- `strategic_directives_v2_priority_check`: Validates priority enum

---

## Query Examples

### Find All Parent SDs

```sql
SELECT id, title, status, relationship_type
FROM strategic_directives_v2
WHERE relationship_type = 'parent'
  AND is_active = true
ORDER BY created_at DESC;
```

### Find Children of a Parent

```sql
SELECT id, title, status, parent_sd_id
FROM strategic_directives_v2
WHERE parent_sd_id = 'SD-E2E-TEST-ORCHESTRATOR'
  AND is_active = true
ORDER BY sequence_rank;
```

### Find Full Hierarchy Tree

```sql
WITH RECURSIVE sd_tree AS (
  -- Base case: parent SD
  SELECT id, title, parent_sd_id, relationship_type, 1 as level
  FROM strategic_directives_v2
  WHERE id = 'SD-E2E-TEST-ORCHESTRATOR'

  UNION ALL

  -- Recursive case: children
  SELECT s.id, s.title, s.parent_sd_id, s.relationship_type, t.level + 1
  FROM strategic_directives_v2 s
  INNER JOIN sd_tree t ON s.parent_sd_id = t.id
)
SELECT * FROM sd_tree ORDER BY level, id;
```

---

## Best Practices

1. **ID Naming Convention**: Use hierarchical naming (e.g., SD-E2E-TEST-ORCHESTRATOR, SD-E2E-PLAYWRIGHT-SETUP)
2. **Relationship Type**: Always set explicitly ('parent', 'child', 'standalone')
3. **Dependency Chain**: Document child execution order in parent's dependency_chain
4. **Sequence Rank**: Use incremental values to maintain execution order
5. **Status Management**: Parent status should reflect child completion
6. **Scope Clarity**: Parent scope should summarize; children should have detailed scopes

---

## References

- **Schema Docs**: `/docs/reference/schema/engineer/tables/strategic_directives_v2.md`
- **Database Overview**: `/docs/reference/schema/engineer/database-schema-overview.md`
- **Migration Scripts**: `/database/migrations/`

---

**Note**: This is a reference document. Always query the database directly for current schema validation before creating new SDs.
