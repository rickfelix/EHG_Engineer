# LEO Protocol Sections - Deprecated UUID Pattern Audit

**Generated**: 2025-12-12
**Database**: dedlbzhpgkmetvhbkyzq (EHG_Engineer - Consolidated)
**Query**: Sections containing `sd_uuid` or `uuid_id` patterns

---

## Executive Summary

**Total Sections with Deprecated Patterns**: 4

**Impact**: These sections reference deprecated database column names that were replaced during the SD-1A schema simplification (2025-10-21):
- `sd_uuid` → `uuid_id` (consolidated into single column)
- References should use `strategic_directives_v2.uuid_id` consistently

**Files Affected** (via section-file-mapping.json):
- CLAUDE_CORE.md (1 section)
- CLAUDE_LEAD.md (2 sections)
- CLAUDE_PLAN.md (1 section)

---

## Detailed Section Breakdown

### 1. knowledge_retrieval
**ID**: 269
**Title**: 📚 Automated PRD Enrichment (MANDATORY)
**Protocol**: leo-v4-3-3-ui-parity
**Target File**: CLAUDE_LEAD.md (also in SHARED)
**Deprecated Occurrences**:
- `sd_uuid`: 4 instances
- `uuid_id`: 0 instances

**Context**: Section describes PRD enrichment scripts with command examples:
```bash
node scripts/phase-preflight.js --phase PLAN --sd-id <SD_UUID>
node scripts/enrich-prd-with-research.js <SD_UUID>
```

**Recommended Fix**: Update to use correct parameter format `--sd-id <SD_ID>` where SD_ID is the string identifier (e.g., "SD-VISION-001"), not UUID.

---

### 2. parent_child_sd_governance
**ID**: 295
**Title**: Parent-Child SD Phase Governance
**Protocol**: leo-v4-3-3-ui-parity
**Target File**: CLAUDE_LEAD.md
**Deprecated Occurrences**:
- `sd_uuid`: 2 instances
- `uuid_id`: 0 instances

**Context**: Shows SQL example for handoff creation:
```sql
VALUES (
  '<PARENT_SD_UUID>',
  'PLAN_TO_EXEC',
  ...
)
WHERE id = '<PARENT_SD_UUID>';
```

**Recommended Fix**: Update examples to use `sd_id` (string) instead of `sd_uuid`. The `leo_handoff_executions` table uses `sd_id` as foreign key to `strategic_directives_v2.id` (string), not UUID.

---

### 3. ai_quality_russian_judge
**ID**: 311
**Title**: AI-Powered Russian Judge Quality Assessment
**Protocol**: leo-v4-3-3-ui-parity
**Target File**: CLAUDE_CORE.md
**Deprecated Occurrences**:
- `sd_uuid`: 2 instances
- `uuid_id`: 1 instance

**Context**: Describes PRD validation logic:
```
PRD validation: Fetches SD via `prd.sd_uuid → strategic_directives_v2.uuid_id`
User Story validation: Fetches PRD via `user_story.prd_id`
```

**Recommended Fix**:
1. Current schema (verified 2025-12-04):
   - `product_requirements_v2.sd_uuid` → `strategic_directives_v2.uuid_id` (UUID foreign key)
   - `product_requirements_v2.sd_id` → `strategic_directives_v2.id` (string foreign key)
2. Both relationships are valid in current schema
3. However, `sd_id` (string) is preferred for consistency

---

### 4. handoff_quality_gates
**ID**: 312
**Title**: Quality Assessment Integration in Handoffs
**Protocol**: leo-v4-3-3-ui-parity
**Target File**: CLAUDE_PLAN.md
**Deprecated Occurrences**:
- `sd_uuid`: 3 instances
- `uuid_id`: 0 instances

**Context**: Describes database schema for PRD quality gates:
```
Database Schema (prds table):
- id: PRD identifier
- sd_uuid: Foreign key to parent Strategic Directive
- functional_requirements: JSONB array
```

**Recommended Fix**: Update documentation to reference current schema:
- Table name: `product_requirements_v2` (not `prds`)
- Foreign keys: Both `sd_uuid` (UUID) and `sd_id` (string) exist
- Preferred: Use `sd_id` for consistency with handoff system

---

## Schema Verification (Current State)

Queried `product_requirements_v2` table (2025-12-04 schema docs):

**Relevant Columns**:
- `sd_uuid` (uuid) - Foreign key to `strategic_directives_v2.uuid_id`
- `sd_id` (text) - Foreign key to `strategic_directives_v2.id`
- `directive_id` (text) - Redundant? (need to verify)

**Observation**: The dual foreign key pattern (UUID + string) creates ambiguity. Current LEO Protocol scripts prefer string IDs (`sd_id`, `id` fields).

---

## Recommendations

### Priority 1: Critical Updates
1. **Section 269 (knowledge_retrieval)**: Update CLI examples to use `--sd-id <SD_ID>` (string)
2. **Section 295 (parent_child_sd_governance)**: Update SQL examples to use `sd_id` (string) instead of `sd_uuid`

### Priority 2: Clarifications
3. **Section 311 (ai_quality_russian_judge)**: Clarify which foreign key relationship is canonical
4. **Section 312 (handoff_quality_gates)**: Update table name to `product_requirements_v2` and clarify foreign key usage

### Priority 3: Schema Consolidation (Future)
5. Consider deprecating dual foreign key pattern in `product_requirements_v2`:
   - Option A: Keep `sd_id` (string) only - aligns with handoff system
   - Option B: Keep `sd_uuid` (UUID) only - type safety benefits
   - Current: Both exist, causing documentation confusion

---

## Verification Query

To verify current schema state:

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'product_requirements_v2'
  AND column_name IN ('sd_uuid', 'sd_id', 'directive_id', 'id')
ORDER BY ordinal_position;
```

---

## Action Items

- [ ] Update section 269 (knowledge_retrieval) - CLI examples
- [ ] Update section 295 (parent_child_sd_governance) - SQL examples
- [ ] Clarify section 311 (ai_quality_russian_judge) - Foreign key preference
- [ ] Update section 312 (handoff_quality_gates) - Table name + FK docs
- [ ] Regenerate CLAUDE*.md files: `npm run claude:generate`
- [ ] Consider schema consolidation RFC for `product_requirements_v2` dual FK pattern

