# Architecture Plan: Venture Data Architecture Improvements

## Stack & Repository Decisions
- **Platform:** Supabase (PostgreSQL 15+) — all changes are SQL migrations + Node.js scripts
- **Repository:** EHG_Engineer (this repository) — `database/migrations/` for SQL, `scripts/` for CLI utilities
- **Language:** SQL for migrations, Node.js (CJS) for CLI scripts, leveraging existing `@supabase/supabase-js` client
- **No new dependencies required** — all work uses existing stack

## Legacy Deprecation Plan
- **Replaced:** Ad-hoc deletion scripts (e.g., `scripts/temp/delete-all-ventures.cjs`) → replaced by `scripts/venture-lifecycle.cjs`
- **Deprecated columns:** None — this is additive (new `deleted_at` column, new views)
- **Deprecated patterns:** Direct `FROM ventures` queries in application code should migrate to `FROM v_active_ventures` view over time. Not a breaking change — the view is a superset filter.

## Route & Component Structure

### CLI Module Structure
```
scripts/
├── venture-lifecycle.cjs          # Main lifecycle CLI (teardown, archive, restore, purge)
├── db-fk-audit.cjs                # FK constraint audit tool
└── modules/
    └── venture-lifecycle/
        ├── teardown.js             # Delete venture + all child data
        ├── archive.js              # Soft-delete (set deleted_at)
        ├── restore.js              # Undo soft-delete (clear deleted_at)
        ├── purge.js                # Move to cold storage
        ├── fk-registry.js          # Central registry of all venture FK relationships
        └── fk-audit.js             # Compare migrations vs live constraints
```

### FK Registry Design
The `fk-registry.js` module is the single source of truth for venture FK relationships:

```javascript
// Each entry defines: table, column, and delete policy
const VENTURE_FK_REGISTRY = [
  // Data tables — CASCADE on delete
  { table: 'venture_stage_transitions', column: 'venture_id', policy: 'CASCADE' },
  { table: 'venture_documents', column: 'venture_id', policy: 'CASCADE' },
  // ...

  // Governance tables — RESTRICT on delete (audit records preserved)
  { table: 'chairman_decisions', column: 'venture_id', policy: 'RESTRICT' },
  { table: 'governance_decisions', column: 'venture_id', policy: 'RESTRICT' },
  // ...

  // Cross-reference tables — SET NULL on delete
  { table: 'strategic_directives_v2', column: 'venture_id', policy: 'SET NULL' },
  { table: 'sd_phase_handoffs', column: 'venture_id', policy: 'SET NULL' },
  // ...
];
```

This registry is populated by the FK audit (Phase 1) and drives all lifecycle operations.

## Data Layer

### New Column: `ventures.deleted_at`
```sql
ALTER TABLE ventures ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_ventures_deleted_at ON ventures(deleted_at) WHERE deleted_at IS NOT NULL;
```

### New Views
```sql
-- Active ventures (default query target)
CREATE OR REPLACE VIEW v_active_ventures AS
SELECT * FROM ventures WHERE deleted_at IS NULL AND status != 'killed';

-- Archived ventures (soft-deleted, awaiting cold storage)
CREATE OR REPLACE VIEW v_archived_ventures AS
SELECT * FROM ventures WHERE deleted_at IS NOT NULL;
```

### Archive Tables (Phase 4)
For each child table, create a mirror:
```sql
CREATE TABLE ventures_archive (LIKE ventures INCLUDING ALL);
ALTER TABLE ventures_archive ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ventures_archive ADD COLUMN archive_source TEXT DEFAULT 'purge_job';

-- Repeat for each child table that uses CASCADE policy
CREATE TABLE venture_documents_archive (LIKE venture_documents INCLUDING ALL);
ALTER TABLE venture_documents_archive ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NOW();
```

### RLS Considerations
- Views inherit RLS from base tables — no new policies needed for `v_active_ventures`
- Archive tables need their own RLS policies (read-only for authenticated, full access for service_role)
- CASCADE deletes bypass RLS (executed as the FK owner, not the calling role) — this is expected and correct since lifecycle operations use service_role

## API Surface

### CLI Commands (npm scripts in package.json)
```json
{
  "venture:teardown": "node scripts/venture-lifecycle.cjs teardown",
  "venture:archive": "node scripts/venture-lifecycle.cjs archive",
  "venture:restore": "node scripts/venture-lifecycle.cjs restore",
  "venture:purge": "node scripts/venture-lifecycle.cjs purge",
  "db:fk-audit": "node scripts/db-fk-audit.cjs"
}
```

### RPC Functions (Optional, Phase 4)
```sql
-- For EVA/Chairman integration
CREATE OR REPLACE FUNCTION archive_venture(p_venture_id UUID)
RETURNS JSONB AS $$
  UPDATE ventures SET deleted_at = NOW(), status = 'archived'
  WHERE id = p_venture_id AND deleted_at IS NULL
  RETURNING jsonb_build_object('id', id, 'name', name, 'archived_at', deleted_at);
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION restore_venture(p_venture_id UUID)
RETURNS JSONB AS $$
  UPDATE ventures SET deleted_at = NULL, status = 'active'
  WHERE id = p_venture_id AND deleted_at IS NOT NULL
  RETURNING jsonb_build_object('id', id, 'name', name, 'restored_at', NOW());
$$ LANGUAGE SQL SECURITY DEFINER;
```

## Implementation Phases

### Phase 1: FK Audit + Teardown Utility (1 SD, ~100 LOC)
**Deliverables:**
- `scripts/db-fk-audit.cjs` — queries `information_schema.table_constraints` to compare migration-defined FKs vs live DB constraints
- `scripts/venture-lifecycle.cjs teardown` — based on the working deletion script, but driven by the FK registry
- `scripts/modules/venture-lifecycle/fk-registry.js` — central FK relationship registry populated by audit
- Audit report output classifying all 73 tables

**Acceptance criteria:**
- FK audit runs in <30 seconds, covers 100% of venture-referencing tables
- Teardown deletes all ventures + child data with zero FK errors
- FK registry is machine-readable and drives the teardown logic

### Phase 2: Soft-Delete Migration (1 SD, ~80 LOC)
**Deliverables:**
- Migration: `deleted_at` column + index + views
- `scripts/venture-lifecycle.cjs archive <id>` and `restore <id>`
- Updated RLS policies (if needed) to filter via view

**Acceptance criteria:**
- Soft-deleted ventures invisible to all existing application queries
- Restore returns venture to full functionality
- No existing query modifications required (view layer handles filtering)

### Phase 3: Selective FK Constraint Migration (1 SD, ~150 LOC migration)
**Deliverables:**
- SQL migration applying CASCADE/RESTRICT/SET NULL per FK registry classification
- Run in batches of 10-15 tables per migration file to limit blast radius
- Rollback migration for each batch

**Acceptance criteria:**
- All 73 FK constraints match their registry-defined policy
- Zero data loss during migration
- Rollback tested for each batch

### Phase 4: Cold Storage Archive (1 SD, ~200 LOC)
**Deliverables:**
- Archive table creation migration
- `scripts/venture-lifecycle.cjs purge` — moves soft-deleted ventures older than N days
- Monitoring: log entries for each purge operation
- Optional: `archive_venture()` and `restore_venture()` RPC functions

**Acceptance criteria:**
- Purge moves all data from 73+ tables to archive equivalents
- Configurable retention period (default: 90 days)
- Purge is idempotent (running twice produces same result)
- Archive data is queryable for audit purposes

## Testing Strategy

### Phase 1 Tests
- FK audit correctly identifies all 73+ tables (compare against schema docs)
- Teardown handles edge cases: no ventures, ventures with no child data, ventures with data in all 73 tables
- FK registry is complete (no table missed)

### Phase 2 Tests
- Archive sets `deleted_at` and hides venture from `v_active_ventures`
- Restore clears `deleted_at` and makes venture visible again
- Double-archive is idempotent (no error)
- Double-restore is idempotent (no error)

### Phase 3 Tests
- CASCADE tables: deleting a venture removes child records automatically
- RESTRICT tables: deleting a venture with governance records is blocked (must archive instead)
- SET NULL tables: deleting a venture nulls the reference in SDs

### Phase 4 Tests
- Purge moves data correctly (row counts match before/after)
- Archive tables have identical schemas to source tables
- Purge is idempotent
- Monitoring logs capture purge operations

## Risk Mitigation

### Risk 1: CASCADE migration accidentally deletes governance data
**Severity:** Critical
**Mitigation:** Phase 1 audit classifies tables BEFORE any migration. Governance tables (chairman_decisions, governance_decisions, compliance_gate_events, risk_*) are RESTRICT by default. Phase 3 migration reviews are mandatory.

### Risk 2: View layer performance regression
**Severity:** Medium
**Mitigation:** `deleted_at IS NULL` filter uses a partial index. For the vast majority of queries (where deleted_at IS NULL for all records), the optimizer will use the existing indexes. Benchmark before/after.

### Risk 3: Schema drift between active and archive tables
**Severity:** Medium
**Mitigation:** Archive tables created with `LIKE ... INCLUDING ALL`. A CI check (or HEAL dimension) verifies schema parity on each migration.

### Risk 4: Orphaned migration artifacts cause confusion
**Severity:** Low
**Mitigation:** FK audit identifies tables that exist in migrations but not in the live DB. These are flagged in the audit report for manual review (may be renamed, dropped, or behind different schemas).
