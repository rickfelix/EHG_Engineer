# SD Contract Patterns

Parent-child SD contract system for enforcing consistency across SD hierarchies.

## Overview

Contracts define boundaries that child SDs must respect:

| Contract Type | Purpose | Severity |
|--------------|---------|----------|
| **Data Contract** | Schema boundaries (tables, columns, operations) | BLOCKER |
| **UX Contract** | Component paths, cultural style, accessibility | WARNING |

## Quick Reference

```bash
# Verify contract system
node scripts/verify-contract-system.js

# Check inherited contracts for an SD
# (via Supabase RPC)
SELECT * FROM get_inherited_contracts('SD-VISION-TRANSITION-001C');

# Get contract summary
SELECT * FROM get_contract_summary('SD-VISION-TRANSITION-001C');
```

## Data Contracts

Define what database tables/columns child SDs can modify.

### Schema

```sql
CREATE TABLE sd_data_contracts (
    id UUID PRIMARY KEY,
    parent_sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
    contract_version INTEGER DEFAULT 1,

    -- What children CAN touch
    allowed_tables TEXT[],
    allowed_columns JSONB,  -- { "table": ["col1", "col2"] }

    -- What children CANNOT do
    forbidden_operations TEXT[] DEFAULT ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA'],

    -- Type constraints
    jsonb_schemas JSONB,
    column_types JSONB
);
```

### Creating a Data Contract

```sql
INSERT INTO sd_data_contracts (
    parent_sd_id,
    allowed_tables,
    allowed_columns,
    forbidden_operations,
    description,
    rationale
) VALUES (
    'SD-VISION-TRANSITION-001',
    ARRAY['lifecycle_stage_config', 'lifecycle_stage_artifacts', 'ventures'],
    '{"lifecycle_stage_config": ["stage_number", "title", "description"]}'::jsonb,
    ARRAY['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'ALTER TABLE DROP COLUMN'],
    'Vision Transition contract - stage and venture tables only',
    'This SD family manages venture lifecycle stages'
);
```

### Validation

```sql
-- Validate migration content
SELECT * FROM validate_data_contract_compliance(
    'SD-VISION-TRANSITION-001C',
    'migration',
    'ALTER TABLE lifecycle_stage_config ADD COLUMN new_col TEXT;'
);

-- Returns: { valid: true, violations: [] }

-- Invalid example (forbidden operation)
SELECT * FROM validate_data_contract_compliance(
    'SD-VISION-TRANSITION-001C',
    'migration',
    'DROP TABLE users;'
);

-- Returns: { valid: false, violations: [{ type: 'FORBIDDEN_OPERATION', ... }] }
```

## UX Contracts

Define component boundaries and design consistency requirements.

### Schema

```sql
CREATE TABLE sd_ux_contracts (
    id UUID PRIMARY KEY,
    parent_sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),
    contract_version INTEGER DEFAULT 1,

    -- Component boundaries
    component_paths TEXT[],      -- Glob patterns of allowed paths
    forbidden_paths TEXT[],      -- Children CANNOT touch these

    -- Design constraints
    cultural_design_style VARCHAR(30),  -- STRICTLY inherited
    max_component_loc INTEGER DEFAULT 600,
    min_wcag_level VARCHAR(10) DEFAULT 'AA'
);
```

### Creating a UX Contract

```sql
INSERT INTO sd_ux_contracts (
    parent_sd_id,
    component_paths,
    forbidden_paths,
    cultural_design_style,
    max_component_loc,
    min_wcag_level,
    description
) VALUES (
    'SD-VISION-TRANSITION-001',
    ARRAY['src/components/ventures/**', 'src/pages/ventures/**'],
    ARRAY['src/components/auth/**', 'src/components/admin/**'],
    'california_modern',
    600,
    'AA',
    'Vision Transition UX - ventures components only, California Modern style'
);
```

### Cultural Design Styles

Available styles (strictly inherited by children):

| Style | Description | Use Case |
|-------|-------------|----------|
| `wabi_sabi` | Japanese aesthetic, organic imperfection | Artisan, wellness |
| `swiss_minimal` | Clean, grid-based precision | Finance, enterprise |
| `bauhaus` | Geometric, functional | Manufacturing, tech |
| `california_modern` | Warm, approachable, rounded | Consumer, lifestyle |

### Validation

```sql
-- Valid path
SELECT * FROM validate_ux_contract_compliance(
    'SD-VISION-TRANSITION-001C',
    'src/components/ventures/VentureCard.tsx'
);
-- Returns: { valid: true, cultural_design_style: 'california_modern' }

-- Forbidden path
SELECT * FROM validate_ux_contract_compliance(
    'SD-VISION-TRANSITION-001C',
    'src/components/auth/LoginForm.tsx'
);
-- Returns: { valid: false, violations: [{ type: 'FORBIDDEN_PATH_VIOLATION' }] }
```

## Contract Inheritance

Contracts are automatically inherited when child SDs are created:

```
SD-VISION-TRANSITION-001 (Parent)
├── Data Contract: allowed_tables = [lifecycle_stage_config, ventures]
├── UX Contract: cultural_design_style = california_modern
│
├── SD-VISION-TRANSITION-001A (Child)
│   └── Inherits both contracts automatically
│
├── SD-VISION-TRANSITION-001B (Child)
│   └── Inherits both contracts automatically
│
└── SD-VISION-TRANSITION-001C (Child - Sub-Parent)
    ├── Inherits parent contracts
    ├── Can define MORE RESTRICTIVE contracts for its children
    │
    └── SD-VISION-TRANSITION-001C1 (Grandchild)
        └── Inherits from 001C (most restrictive applies)
```

### Manual Inheritance

For SDs that existed before contracts were created:

```sql
SELECT reinherit_contracts_for_children('SD-VISION-TRANSITION-001');
-- Updates all existing children with inherited contracts
```

## Integration Points

### 1. PLAN→EXEC Handoff Gate

`scripts/modules/handoff/executors/PlanToExecExecutor.js`

```javascript
// GATE_CONTRACT_COMPLIANCE runs after BMAD validation
gates.push({
    name: 'GATE_CONTRACT_COMPLIANCE',
    validator: async (ctx) => {
        return validateContractGate(ctx.sdId, prd);
    },
    required: true
});
```

### 2. DATABASE Sub-Agent

`lib/sub-agents/database.js`

```javascript
// After Phase 1 (Static File Validation)
const contractValidation = await validateMigrationContract(sdId, migrationFiles);

if (contractValidation.valid === false) {
    results.verdict = 'BLOCKED';
    // DATA_CONTRACT violations are blockers
}
```

### 3. DESIGN Sub-Agent

`lib/sub-agents/design.js`

```javascript
// Phase 5.5: UX Contract Compliance
const contractCompliance = await validateUxContractCompliance(sdId, repoPath);

if (contractCompliance.cultural_design_style) {
    // Report inherited style (strictly enforced)
    console.log(`Cultural Style: ${contractCompliance.cultural_design_style}`);
}

// UX violations are warnings, not blockers
```

## Completion Gate

SDs cannot complete with unresolved DATA_CONTRACT violations:

```sql
SELECT * FROM check_sd_can_complete('SD-VISION-TRANSITION-001C');

-- Returns:
-- {
--   can_complete: true/false,
--   blocking_violations: [...],
--   warning_violations: [...],
--   override_required: true/false
-- }
```

## Override Pattern

UX_CONTRACT violations can be overridden with justification:

```sql
UPDATE sd_contract_violations
SET
    overridden = true,
    override_justification = 'Component needed for cross-venture feature',
    overridden_by = 'rick@ehg.com',
    overridden_at = NOW()
WHERE id = 'violation-uuid';
```

## Best Practices

1. **Define contracts BEFORE creating children** - Inheritance only triggers on INSERT
2. **Use reinherit_contracts_for_children()** for existing SDs
3. **Be specific with allowed_tables** - Start restrictive, expand as needed
4. **Cultural style is immutable** - Choose carefully at parent level
5. **Document rationale** - Explain WHY boundaries exist
6. **Use JSONB schemas** for complex validation rules

## Troubleshooting

### Contract Not Inherited

```sql
-- Check if parent has contracts
SELECT * FROM sd_data_contracts WHERE parent_sd_id = 'SD-VISION-TRANSITION-001';
SELECT * FROM sd_ux_contracts WHERE parent_sd_id = 'SD-VISION-TRANSITION-001';

-- Check child metadata
SELECT metadata FROM strategic_directives_v2 WHERE id = 'SD-VISION-TRANSITION-001C';
-- Should have: contract_governed, inherited_data_contract_id, inherited_ux_contract_id

-- Force re-inheritance
SELECT reinherit_contracts_for_children('SD-VISION-TRANSITION-001');
```

### Validation Function Errors

```bash
# Run verification script
node scripts/verify-contract-system.js
```

## Reference

- Migration: `database/migrations/20251208_sd_contracts.sql`
- Functions: `database/migrations/20251208_contract_validation_functions.sql`
- Validation Module: `scripts/modules/contract-validation.js`
- Architecture Plan: `/home/rickf/.claude/plans/zazzy-sparking-planet.md`
