# Database Migration Inventory

**Generated**: 2025-10-05
**Analysis Tool**: `scripts/analyze-migrations.cjs`
**Total Migrations**: 192 files

## Executive Summary

### Distribution by Database

| Database | Count | Percentage | Status |
|----------|-------|------------|--------|
| **EHG_Engineer** (dedlbzhpgkmetvhbkyzq) | 77 | 40% | ✅ Categorized |
| **EHG App** (liapbndqlqxdcgpwntbv) | 52 | 27% | ✅ Categorized |
| **Mixed** | 5 | 3% | ⚠️ Manual Review Required |
| **Unknown** | 58 | 30% | ⚠️ Manual Review Required |

### Issues Identified

1. **90+ migrations across 3+ directories** ✅ CONFIRMED
   - `database/migrations/` (47 files)
   - `applications/APP001/codebase/supabase/migrations/` (72 files)
   - `database/schema/` (32 files)
   - `db/migrations/` (35 files)
   - `supabase/migrations/` (2 files)

2. **Inconsistent naming conventions** ✅ CONFIRMED
   - Timestamp+UUID: `20250828094259_8d7885bb...`
   - Date-based: `2025-09-22-add-sd-key.sql`
   - Descriptor-based: `202509221300__eng_sd_metadata.sql`

3. **Legacy migrations archived** ✅ COMPLETED
   - 26 files moved to `archive/migrations/legacy/`

## EHG_Engineer Database (dedlbzhpgkmetvhbkyzq)

### Core Tables Managed
- `strategic_directives_v2` - Strategic directive management
- `product_requirements_v2` - PRD tracking
- `retrospectives` - Learning and improvement
- `leo_protocols` - Protocol version management
- `leo_sub_agents` - Sub-agent definitions
- `uat_test_cases` - User acceptance testing
- `directive_submissions` - SDIP processing
- `agentic_reviews` - Automated code reviews

### Migration Files (77 total)

#### High Priority Migrations (Schema Foundation)
1. `database/schema/001_initial_schema.sql` - Core SD/PRD tables
2. `database/schema/007_leo_protocol_schema_fixed.sql` - LEO Protocol v4.x
3. `database/schema/011_agentic_reviews_schema.sql` - Sub-agent system
4. `database/schema/010_ehg_backlog_schema.sql` - Backlog mapping

#### Active Migrations (database/migrations/)
- `2025-09-22-add-sd-key.sql` - SD key generation
- `2025-09-22-prd-add-sd-id.sql` - PRD-SD linking
- `create-sd-phase-handoffs-table.sql` - Phase handoff tracking
- `uat-credentials-tables.sql` - UAT test infrastructure

#### Engineering Migrations (db/migrations/eng/)
- `202509221300__eng_sd_metadata.sql` - SD governance metadata
- `202509221305__eng_prd_contract.sql` - PRD contract enforcement
- `202509221310__eng_backlog_contract.sql` - Backlog integrity

## EHG App Database (liapbndqlqxdcgpwntbv)

### Core Tables Managed
- `companies` - Company/organization management
- `portfolios` - Investment portfolio tracking
- `ventures` - Individual venture/startup tracking
- `voice_conversations` - OpenAI Realtime API integration

### Migration Files (52 total)

#### Primary Migration Path
- `applications/APP001/codebase/supabase/migrations/` (40 files)
- Timestamp-based naming: `20250828094259_*.sql`

#### Core Schemas
1. `20250828094259_8d7885bb...sql` - Companies, portfolios, ventures foundation
2. `20250828095134_d205058b...sql` - Venture stages and metrics
3. `20250829112853_b8d1062c...sql` - Portfolio analytics

#### Voice API Features
- `supabase/migrations/004_voice_conversations.sql` - SD-2025-001 implementation

## Mixed Migrations (5 files - Require Manual Review)

1. `applications/APP001/.../20250829000247_866f55bc...sql` - Unknown purpose
2. `database/migrations/2025-09-22-vh-bridge-tables.sql` - Venture History bridge
3. `database/migrations/uat-tracking-schema.sql` - UAT shared schema
4. `db/migrations/eng/legacy/2025-09-EMB-message-bus.sql` - Event message bus
5. `ops/checks/schema_compatibility_check.sql` - Cross-database check

## Unknown Migrations (58 files - Require Manual Review)

### Categories Requiring Investigation

#### APP001 Unknown Migrations (32 files)
- Range: `20250828155709` to `20250829205749`
- Likely: Utility functions, views, triggers
- Action: Manual code review needed

#### Database Migrations Unknown (13 files)
- `add-uat-sort-order.sql`
- `create-gate-integrity-view.sql`
- `create-rls-auditor-role.sql`
- `safe-delete-uat-case-function.sql`
- Action: Likely EHG_Engineer, verify table references

#### Schema Files Unknown (6 files)
- `003_vision_qa_schema.sql`
- `009_context_learning_schema.sql`
- `010_plan_supervisor_schema.sql`
- Action: Review purpose, likely EHG_Engineer

## Archived Migrations (26 files)

Located in: `archive/migrations/legacy/`

### Origin Breakdown
- `db/migrations/eng/legacy/` - 22 files
- `db/migrations/vh/legacy/` - 4 files

### Notable Archived Files
- `014_leo_gap_remediation.sql` - Early LEO Protocol fixes
- `2025-01-17-user-stories.sql` - User story schema (superseded)
- `prod-pilot-seed.sql` - Test data (no longer needed)
- `rollback-*.sql` - Historical rollback scripts

## Consolidation Plan

### Phase 1: Directory Reorganization ✅ COMPLETED

```
supabase/
├── ehg_engineer/
│   └── migrations/          # Created
└── ehg_app/
    └── migrations/          # Created

archive/
└── migrations/
    └── legacy/              # 26 files archived
```

### Phase 2: Migration Sorting (IN PROGRESS)

#### Step 1: Copy EHG_Engineer Migrations
```bash
# Schema files → ehg_engineer/migrations/
# database/migrations/* (EHG_Engineer) → ehg_engineer/migrations/
# db/migrations/eng/* → ehg_engineer/migrations/
```

#### Step 2: Copy EHG App Migrations
```bash
# applications/APP001/codebase/supabase/migrations/* → ehg_app/migrations/
# supabase/migrations/004_voice_conversations.sql → ehg_app/migrations/
```

#### Step 3: Rename for Consistency
- Target format: `YYYYMMDDHHMMSS_description.sql`
- Preserve chronological order
- Document renames in migration log

### Phase 3: Validation (PENDING)

1. **Verify Migration History**
   ```sql
   -- Check applied migrations on each database
   SELECT * FROM supabase_migrations.schema_migrations;
   ```

2. **Test Clean Migration Path**
   - Fresh database deployment
   - Verify all migrations apply successfully
   - Document any dependencies

3. **Update Documentation**
   - Migration naming convention guide
   - New migration creation workflow
   - Rollback procedures

## Migration Naming Convention (Proposed)

### Standard Format
```
YYYYMMDDHHMMSS_category_description.sql
```

### Categories
- `schema_` - Table/view/function creation
- `data_` - Data migrations
- `alter_` - Schema modifications
- `rls_` - Row-level security policies
- `trigger_` - Trigger creation/modification
- `index_` - Index creation

### Examples
- `20251005120000_schema_strategic_directives_v2.sql`
- `20251005120100_alter_add_sd_key_column.sql`
- `20251005120200_rls_enable_sd_policies.sql`

## Manual Review Queue

### Priority 1: Mixed Migrations (5 files)
- Review table references
- Determine primary database target
- Split if necessary

### Priority 2: Unknown APP001 Migrations (32 files)
- Read first 50 lines of each file
- Categorize by purpose
- Move to appropriate directory

### Priority 3: Unknown Database Migrations (21 files)
- Verify table existence in each database
- Categorize by database target
- Document any cross-database dependencies

## Automation Scripts

### Available Tools

1. **Migration Analysis** ✅ COMPLETED
   ```bash
   node scripts/analyze-migrations.cjs
   ```

2. **Migration Consolidation** (NEXT)
   ```bash
   node scripts/consolidate-migrations.cjs --dry-run
   node scripts/consolidate-migrations.cjs --execute
   ```

3. **Migration Inventory** ✅ COMPLETED
   - Output: `database/docs/migration-analysis.json`
   - Human-readable: This document

## Next Steps

1. ✅ Archive legacy migrations (26 files)
2. ✅ Analyze and categorize all migrations
3. ⏳ Manual review of mixed/unknown migrations (63 files)
4. ⏳ Create consolidation automation script
5. ⏳ Execute migration reorganization
6. ⏳ Validate against both databases
7. ⏳ Update developer documentation
8. ⏳ Establish migration governance process

## Risk Assessment

### Production Deployment Risk
- **Current**: 🔴 HIGH - 90+ migrations, unclear database targets
- **After Phase 1**: 🟡 MEDIUM - Legacy archived, categorization complete
- **After Phase 3**: 🟢 LOW - Clean migration paths, validated deployment

### Estimated Time to Completion
- **Phase 1**: ✅ 2 hours (COMPLETED)
- **Phase 2**: ⏳ 3-4 hours (manual review + automation)
- **Phase 3**: ⏳ 1-2 hours (validation + documentation)
- **Total**: 6-8 hours remaining

## References

- Detailed analysis: `database/docs/migration-analysis.json`
- Analysis script: `scripts/analyze-migrations.cjs`
- CLAUDE.md database guidance: Section "Database Operations"
