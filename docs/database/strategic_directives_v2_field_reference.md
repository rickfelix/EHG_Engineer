# Strategic Directives v2 - Field Reference Guide

**Last Updated**: 2025-10-13
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
| `category` | VARCHAR(50) | Classification: infrastructure, feature, enhancement, fix, documentation |
| `priority` | VARCHAR(20) | CRITICAL (90+), HIGH (70-89), MEDIUM (50-69), LOW (30-49) |

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
| `target_application` | VARCHAR(20) | "EHG" (customer app) or "EHG_Engineer" (management dashboard). Default: EHG |

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

| Priority | Range | Use Case |
|----------|-------|----------|
| CRITICAL | 90+ | Business-critical, immediate action |
| HIGH | 70-89 | Important features, near-term priority |
| MEDIUM | 50-69 | Standard enhancements, planned work |
| LOW | 30-49 | Nice-to-have improvements |

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
