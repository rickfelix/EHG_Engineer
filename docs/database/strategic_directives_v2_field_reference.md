# Strategic Directives v2 - Field Reference Guide


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-26
- **Tags**: database, api, e2e, migration

**Last Updated**: 2026-01-24
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Table**: `strategic_directives_v2`

---

## 🔑 Unique Identifiers (IMPORTANT)

### Primary Identifier: `id`
- **Type**: `VARCHAR(50)`
- **Usage**: **Main identifier used throughout the application**
- **Format**: `SD-{CATEGORY}-{NUMBER}` (e.g., SD-UAT-001, SD-EXPORT-001)
- **Purpose**: Human-readable ID for handoffs, PRDs, documentation, and all user-facing references
- **Required**: YES (NOT NULL)

### Internal UUID: `uuid_id`
- **Type**: `UUID`
- **Usage**: **For database foreign key relationships only**
- **Format**: Auto-generated UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Purpose**: Internal database relationships. Use this for new FK constraints.
- **Required**: YES (NOT NULL, auto-generated)
- **Sync**: Bidirectionally synced with `uuid_internal_pk` via trigger

### Internal UUID (Alias): `uuid_internal_pk`
- **Type**: `UUID`
- **Usage**: **Self-documenting alias for uuid_id**
- **Format**: Same as `uuid_id`
- **Purpose**: Provides a more descriptive column name indicating this is the internal primary key UUID. Synced bidirectionally with `uuid_id` - updating either column updates the other.
- **Required**: YES (NOT NULL)
- **Added**: 2026-01-24 (SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C)

### Legacy Identifier: `legacy_id`
- **Type**: `VARCHAR(50)`
- **Usage**: **DEPRECATED - do not use**
- **Purpose**: Old ID format from previous system versions. Kept for historical data migration.
- **Required**: NO (optional)

---

## 📋 Core Metadata Fields

| Field | Type | Purpose |
|-------|------|---------|
| `title` | VARCHAR(500) | Brief descriptive title (max 500 chars) |
| `version` | VARCHAR(20) | Semantic version (e.g., 1.0, 1.1, 2.0). Default: 1.0 |
| `status` | VARCHAR(50) | Workflow state: draft, pending_approval, active, in_progress, completed, archived, deferred |
| `sd_type` | VARCHAR(50) | **CANONICAL** - SD type for validation gates: feature, infrastructure, enhancement, bugfix, documentation, refactor, database, security, orchestrator, performance, library, fix |
| `category` | VARCHAR(50) | **⚠️ DEPRECATED (2026-01-24)** - Legacy classification. DO NOT use in code logic. Use `sd_type` instead. |
| `priority` | VARCHAR(20) | `critical`, `high`, `medium`, `low` (lowercase, see Priority Levels section) |

---

## 🎯 SD Type Classification (CANONICAL)

The `sd_type` field is the **canonical source of truth** for SD type classification, used by:
- Handoff validation gates (determines which gates apply)
- Sub-agent routing (e.g., DESIGN/DATABASE gates only for feature/database types)
- Workflow selection (infrastructure SDs skip E2E tests)

### Valid SD Types

| Type | PRD Required | Min Handoffs | Gate Threshold | Use Case |
|------|--------------|--------------|----------------|----------|
| `feature` | YES | 4 | 85% | New user-facing functionality |
| `infrastructure` | YES | 3 | 80% | Tooling, scripts, CI/CD, internal systems |
| `enhancement` | Optional | 2 | 75% | Improvements to existing features |
| `bugfix` / `fix` | NO | 1 | 70% | Bug fixes and error corrections |
| `documentation` | NO | 1 | 60% | Docs-only changes |
| `refactor` | YES | 3 | 80% | Code restructuring without behavior change |
| `database` | YES | 4 | 85% | Schema changes, migrations, RLS |
| `security` | YES | 4 | 90% | Security fixes, auth, vulnerability patches |
| `orchestrator` | YES | 4 | 85% | Parent SD coordinating child SDs |
| `performance` | Optional | 2 | 75% | Performance optimizations |
| `library` | Optional | 2 | 75% | Library/dependency updates |

### Type Locking (governance_metadata.type_locked)

When `governance_metadata.type_locked = true`:
- Auto-correction of SD type is disabled
- GPT classifier recommendations are ignored for this SD
- Use for SDs where type was explicitly chosen by user

### sd_type vs category

| Aspect | `sd_type` | `category` |
|--------|-----------|------------|
| Purpose | **Validation logic** | Display/fallback |
| Used by | Handoff gates, sub-agents | UI, legacy queries |
| Canonical | **YES** | NO |
| Auto-corrected | YES (unless locked) | NO |
| **Status** | **ACTIVE** | **DEPRECATED** (as of 2026-01-24) |

**⚠️ DEPRECATION NOTICE (2026-01-24)**:
- The `category` field is **DEPRECATED** for use in application logic
- **DO NOT** use fallback patterns like `sd.sd_type || sd.category`
- All code must use `sd.sd_type` directly (with `|| 'feature'` fallback if needed)
- The `category` field remains in the database schema for legacy UI display only
- **Migration**: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E removed all `|| sd.category` fallback patterns from codebase

**Correct Usage**:
```javascript
// ✅ CORRECT: Use sd_type with explicit fallback
const sdType = sd.sd_type || 'feature';

// ❌ INCORRECT: Do not use category fallback
const sdType = sd.sd_type || sd.category || 'feature';
```

---

## 📝 Content Fields

| Field | Type | Purpose |
|-------|------|---------|
| `description` | TEXT | Detailed description of requirements and context |
| `strategic_intent` | TEXT | High-level business objective (WHY this matters) |
| `rationale` | TEXT | Justification and business case |
| `scope` | TEXT | Boundaries, deliverables, and what's out of scope |

---

## 🎯 Structured Data (JSONB Arrays)

| Field | Type | Structure |
|-------|------|-----------|
| `key_changes` | JSONB | `[{ change: "Description", impact: "Impact" }]` |
| `strategic_objectives` | JSONB | `[{ objective: "Goal", metric: "Measure" }]` |
| `success_criteria` | JSONB | `[{ criterion: "What", measure: "How" }]` |
| `key_principles` | JSONB | `[{ principle: "Name", description: "Explanation" }]` |
| `implementation_guidelines` | JSONB | `[{ guideline: "Instruction", rationale: "Why" }]` |
| `dependencies` | JSONB | `[{ dependency: "What", type: "technical/business", status: "ready/blocked" }]` |
| `risks` | JSONB | `[{ risk: "Description", severity: "high/medium/low", mitigation: "Strategy" }]` |
| `success_metrics` | JSONB | `[{ metric: "Name", target: "Target", actual: "Current" }]` |
| `stakeholders` | JSONB | `[{ name: "Person/Team", role: "Role", contact: "Email/Slack" }]` |

### ⚠️ Handoff Validation Requirement (success_criteria / success_metrics)

**CRITICAL**: At least one of `success_criteria` OR `success_metrics` must be populated with valid entries for the LEAD-TO-PLAN handoff to pass.

**Valid Structures**:
```json
// success_criteria format (preferred)
[
  { "criterion": "Health score above threshold", "measure": ">90/100" },
  { "criterion": "All tests passing", "measure": "100% pass rate" }
]

// success_metrics format (alternative)
[
  { "metric": "Health Score", "target": ">90/100", "actual": "45/100" },
  { "metric": "Test Coverage", "target": "80%", "actual": "65%" }
]

// Legacy format (also accepted)
["Simple string criterion 1", "Simple string criterion 2"]
```

**Gate Reference**: `GATE_SD_TRANSITION_READINESS` in `scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js`

**If validation fails, you'll see**: `success_metrics AND success_criteria are both empty or have invalid structure`

### 🔒 Database Constraints (Added 2026-01-30)

**JSONB Type Validation Constraints** - Prevent string storage in JSONB array fields:

```sql
-- Ensures JSONB fields contain proper arrays, not stringified JSON
ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT success_criteria_is_array
  CHECK (success_criteria IS NULL OR jsonb_typeof(success_criteria) = 'array') NOT VALID;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT success_metrics_is_array
  CHECK (success_metrics IS NULL OR jsonb_typeof(success_metrics) = 'array') NOT VALID;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT key_principles_is_array
  CHECK (key_principles IS NULL OR jsonb_typeof(key_principles) = 'array') NOT VALID;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT key_changes_is_array
  CHECK (key_changes IS NULL OR jsonb_typeof(key_changes) = 'array') NOT VALID;

ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT key_principles_not_empty
  CHECK (key_principles IS NULL OR jsonb_array_length(key_principles) >= 1) NOT VALID;
```

**Migration**: `database/migrations/20260130_add_jsonb_type_constraints.sql`

**Quality Control Scripts**:
- `npm run data:integrity` - Check for JSONB string type issues
- `npm run data:integrity:fix` - Auto-convert strings to proper arrays
- `npm run data:heal-metrics:fix` - Add default values to empty fields

**Root Cause Fix**: PAT-JSONB-STRING-TYPE (RCA 2026-01-30)
- **Problem**: Legacy scripts called `JSON.stringify()` on JSONB fields before Supabase insert
- **Impact**: 655 SDs had ~300 fields stored as strings instead of arrays
- **Solution**: Removed JSON.stringify calls, added constraints, created healing scripts
- **Lesson**: Supabase client handles JSONB serialization automatically - never manually stringify

**Related Documentation**: See `docs/reference/database-agent-patterns.md` - Anti-Pattern 8

---

## 👥 Governance & Approval

| Field | Type | Purpose |
|-------|------|---------|
| `approved_by` | VARCHAR(100) | Name/ID of approver (LEAD agent or human). NULL if not approved |
| `approval_date` | TIMESTAMP | When directive was approved. NULL if not approved |
| `effective_date` | TIMESTAMP | When directive becomes active. Can be future-dated |
| `expiry_date` | TIMESTAMP | Expiration date for time-bound directives. NULL for indefinite |
| `review_schedule` | VARCHAR(100) | Review cadence (e.g., "quarterly", "annually") |

---

## 📊 Backlog Metrics (Computed from sd_backlog_map)

| Field | Type | Purpose |
|-------|------|---------|
| `h_count` | INTEGER | Number of HIGH priority backlog items |
| `m_count` | INTEGER | Number of MEDIUM priority backlog items |
| `l_count` | INTEGER | Number of LOW priority backlog items |
| `future_count` | INTEGER | Number of FUTURE backlog items (planned) |
| `must_have_count` | INTEGER | Number of MUST-HAVE items (critical) |
| `wish_list_count` | INTEGER | Number of WISH-LIST items (nice-to-have) |
| `must_have_pct` | NUMERIC | Percentage of MUST-HAVE items: `(must_have_count / total) * 100` |
| `rolled_triage` | TEXT | Aggregated classification: "mostly_must_have", "balanced", "mostly_wish_list" |
| `readiness` | NUMERIC | Readiness score (0-100) based on backlog completion and dependencies |
| `must_have_density` | NUMERIC | Ratio of MUST-HAVE to total scope. High = mission-critical |
| `new_module_pct` | NUMERIC | Percentage of new modules vs. enhancements. High = greenfield |

---

## 🔄 Import/Sync Fields

| Field | Type | Purpose |
|-------|------|---------|
| `import_run_id` | UUID | UUID of import batch that created/updated this record |
| `present_in_latest_import` | BOOLEAN | TRUE if present in most recent import. FALSE = may be stale |

---

## 🎯 Execution Metadata

| Field | Type | Purpose |
|-------|------|---------|
| `sequence_rank` | INTEGER | Execution order within dependency chain. Lower = higher priority |
| `sd_key` | TEXT | Alternative key format for Vision Pipeline (e.g., SD-2025-09-22-vision) |
| `parent_sd_id` | VARCHAR(50) | References parent directive if this is a sub-directive. NULL for top-level |

---

## 🏷️ Status & Archival

| Field | Type | Purpose |
|-------|------|---------|
| `is_active` | BOOLEAN | TRUE = active, FALSE = archived/soft-deleted. Default: TRUE |
| `archived_at` | TIMESTAMP | When directive was archived. NULL if active |
| `archived_by` | VARCHAR(100) | Who archived this directive. NULL if not archived |

---

## 🎯 Application Targeting

| Field | Type | Purpose |
|-------|------|---------|
| `target_application` | VARCHAR(20) | "EHG" (unified frontend with user + /admin routes) or "EHG_Engineer" (backend API only). Default: EHG. Note: As of SD-ARCH-EHG-007, all UI (user + admin) goes to EHG. |

---

## 📈 Progress Tracking

| Field | Type | Purpose |
|-------|------|---------|
| `progress` | INTEGER | **DEPRECATED** - Old progress field (0-100). Use `progress_percentage` instead |
| `progress_percentage` | INTEGER | Current completion (0-100). Calculated from LEO 5-phase workflow |
| `completion_date` | TIMESTAMP | When status changed to "completed". NULL if not complete |

---

## 🔄 LEO Protocol Workflow

| Field | Type | Purpose |
|-------|------|---------|
| `current_phase` | TEXT | LEAD_APPROVAL, PLAN_PRD, EXEC_IMPLEMENTATION, PLAN_VERIFY, LEAD_FINAL |
| `phase_progress` | INTEGER | Progress within current phase (0-100). Resets when moving to next phase |
| `is_working_on` | BOOLEAN | TRUE if agent actively working. Prevents concurrent modifications |
| `confidence_score` | INTEGER | Quality score (0-100) from sub-agent verification. NULL until verified |

---

## 🚀 BMAD Enhancements

| Field | Type | Purpose |
|-------|------|---------|
| `checkpoint_plan` | JSONB | Checkpoint breakdown for large SDs (>8 user stories). Structure: `{ checkpoints: [{ id: 1, user_stories: ["US-001"], estimated_hours: 3, milestone: "Description" }], total_checkpoints: 3 }` |

---

## 🕐 Audit Trail

| Field | Type | Purpose |
|-------|------|---------|
| `created_at` | TIMESTAMP | When record was created. Auto-set on INSERT |
| `updated_at` | TIMESTAMP | Last modification timestamp. Auto-updated on UPDATE |
| `created_by` | VARCHAR(100) | User/agent who created this (e.g., "LEAD", "human:john@example.com") |
| `updated_by` | VARCHAR(100) | User/agent who last modified this |

---

## 🗂️ Metadata Extensions

| Field | Type | Purpose |
|-------|------|---------|
| `metadata` | JSONB | Flexible JSONB for custom fields not in schema. Use sparingly |
| `governance_metadata` | JSONB | Governance-related data (compliance, approvals, audit trails) |

### governance_metadata Structure

```jsonc
{
  // Type locking (SD-LEO-INFRA-RENAME-COLUMNS-SELF-001)
  "type_locked": true,  // Prevents auto-correction of sd_type

  // Automation context
  "automation_context": {
    "bypass_governance": false,  // When true, skips certain validations
    "source": "manual" | "imported" | "generated"
  },

  // Compliance tracking
  "compliance": {
    "reviewed_by": "agent_id or user_id",
    "reviewed_at": "ISO timestamp",
    "compliance_score": 85
  }
}
```

---

## 💡 Quick Reference

### When to use `id` vs `uuid_id`?

**Use `id`** for:
- ✅ Display in UI/dashboards
- ✅ References in documentation
- ✅ Handoffs and PRDs
- ✅ User-facing communication
- ✅ Logging and error messages

**Use `uuid_id`** for:
- ✅ Foreign key constraints in database
- ✅ Internal database joins
- ✅ API responses (internal)
- ✅ New table relationships

**Never use `legacy_id`**:
- ❌ Deprecated field
- ❌ Only exists for historical data
- ❌ Will be removed in future versions

---

## 📊 Status Workflow

```
draft → pending_approval → active → in_progress → completed
                                  ↘ archived
                                  ↘ deferred
```

**Deferred Status**: Postponed due to business stage or priority mismatch

---

## 🎯 Priority Levels

⚠️ **IMPORTANT**: Use lowercase values in database - check constraint enforces this.

| Priority | DB Value | Range | Use Case |
|----------|----------|-------|----------|
| Critical | `critical` | 90+ | Business-critical, immediate action |
| High | `high` | 70-89 | Important features, near-term priority |
| Medium | `medium` | 50-69 | Standard enhancements, planned work |
| Low | `low` | 30-49 | Nice-to-have improvements |

**Valid constraint values**: `critical`, `high`, `medium`, `low` (lowercase only)

---

## 📋 LEO Protocol Phases

| Phase | Description | Percentage |
|-------|-------------|------------|
| LEAD_APPROVAL | Strategic validation | 20% of LEAD |
| PLAN_PRD | Technical planning & PRD | 20% of PLAN |
| EXEC_IMPLEMENTATION | Code implementation | 30% of EXEC |
| PLAN_VERIFY | Quality verification | 15% of PLAN |
| LEAD_FINAL | Final approval | 15% of LEAD |

**Total**: LEAD (35%) + PLAN (35%) + EXEC (30%) = 100%

---

## 🔍 Common Queries

### Get SD by human-readable ID
```sql
SELECT * FROM strategic_directives_v2 WHERE id = 'SD-UAT-001';
```

### Get SD by internal UUID
```sql
SELECT * FROM strategic_directives_v2 WHERE uuid_id = '550e8400-e29b-41d4-a716-446655440000';
```

### Get active SDs
```sql
SELECT * FROM strategic_directives_v2
WHERE status = 'active' AND is_active = true
ORDER BY sequence_rank;
```

### Get SDs in progress
```sql
SELECT * FROM strategic_directives_v2
WHERE status = 'in_progress'
ORDER BY priority DESC, sequence_rank;
```

### Get high-priority SDs for EHG app
```sql
SELECT * FROM strategic_directives_v2
WHERE priority IN ('CRITICAL', 'HIGH')
  AND target_application = 'EHG'
  AND is_active = true
ORDER BY
  CASE priority
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
  END,
  sequence_rank;
```

---

**Notes**:
- All descriptions are now stored in PostgreSQL column comments
- Use Supabase Studio or pgAdmin to view descriptions in database explorer
- Descriptions will appear in IDEs with database plugins (DataGrip, DBeaver, etc.)
- This reference document is generated from the actual database schema

## Deprecated Fields

### `category` (DEPRECATED)
- **Status**: DEPRECATED - Use `sd_type` instead
- **Reason**: `sd_type` is now the authoritative field for SD classification
- **Migration**: All new code should use `sd_type`. The `category` field will be removed in a future migration.

### `metadata.sd_type` (REMOVED)  
- **Status**: REMOVED
- **Reason**: Was a temporary workaround. Now use root `sd_type` field.
