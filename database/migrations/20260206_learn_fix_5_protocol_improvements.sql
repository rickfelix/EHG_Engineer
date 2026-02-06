-- SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004
-- Address 5 protocol improvements from /learn system
-- Database-only changes: leo_protocol_sections + protocol_improvement_queue status updates
-- No application code changes required

-- ============================================================
-- IMPROVEMENT 1: JSONB Field Validation Guidance
-- PIQ: fb992110-36c2-4fa2-899c-530a4079b16f
-- Evidence: acceptance_criteria string insert failure in user_stories table
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'jsonb_validation_guidance',
  'JSONB Field Validation Guidance',
  '## JSONB Field Validation Guidance

### Problem
JSONB columns in PostgreSQL accept any valid JSON, but application code often expects a specific structure (array vs object vs string). Mismatches cause runtime errors that are hard to debug.

### Common Failures
| Field | Expected | Common Mistake | Error |
|-------|----------|---------------|-------|
| `acceptance_criteria` | JSONB array `[{...}]` | Plain string `"criteria text"` | Insert fails or downstream `.map()` crashes |
| `key_changes` | JSONB array `[{...}]` | Object `{file: "x"}` | `.map is not a function` |
| `success_criteria` | JSONB array `[{...}]` | String or object | Gate validation fails silently |
| `dependencies` | JSONB array `[{...}]` | String `"none"` | Dependency resolver crashes |

### Validation Pattern
Before inserting JSONB data, validate structure at the application level:

```javascript
// Validate JSONB array fields before database insert
function validateJsonbArray(value, fieldName) {
  if (typeof value === ''string'') {
    try { value = JSON.parse(value); } catch {
      throw new Error(`${fieldName}: expected JSON array, got string`);
    }
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName}: expected array, got ${typeof value}`);
  }
  return value;
}
```

### Prevention Checklist
- [ ] Check JSONB field type expectations in schema docs before INSERT
- [ ] Use `Array.isArray()` validation before `.map()` on JSONB data
- [ ] Handle both array and object formats gracefully where possible
- [ ] Add explicit type checks in PRD creation and SD creation scripts',
  800,
  '{"source_piq": "fb992110-36c2-4fa2-899c-530a4079b16f", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004", "affected_phase": "PLAN"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 2: Infrastructure SD EXEC-TO-PLAN Skip Documentation
-- PIQ: 6c9dfdd8-d9c5-4a82-a6bf-541bd39d2c3a
-- Evidence: Infrastructure SD workflow allowed skipping EXEC-TO-PLAN
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'infrastructure_exec_skip',
  'Infrastructure SD: EXEC-TO-PLAN Skip Conditions',
  '## Infrastructure SD: When to Skip EXEC-TO-PLAN

### Overview
Infrastructure SDs (sd_type=''infrastructure'') use a reduced 4-handoff workflow that can skip the EXEC-TO-PLAN handoff. This saves ~15 minutes per SD without quality loss.

### Reduced Workflow (4 Handoffs)
```
LEAD-TO-PLAN → PLAN-TO-EXEC → [EXEC] → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL
                                    ↑ (skip EXEC-TO-PLAN)
```

### When EXEC-TO-PLAN Can Be Skipped
| Condition | Can Skip? | Reason |
|-----------|-----------|--------|
| Database-only changes (migrations, seed data) | YES | No production code to validate |
| Protocol documentation updates | YES | No runtime behavior changes |
| Configuration/env changes | YES | No code logic to test |
| CLI scripts (internal tooling) | MAYBE | Skip if no external consumers |
| Infrastructure with code changes | NO | Code needs TESTING validation |

### When EXEC-TO-PLAN MUST NOT Be Skipped
- Any changes to production application code
- New API endpoints or route modifications
- Changes to shared libraries used by runtime app
- Security-related infrastructure changes

### Gate Behavior
The handoff system automatically detects infrastructure SD type and:
1. Marks TESTING and GITHUB gates as skippable
2. Reduces gate threshold from 85% to 80%
3. Does NOT require E2E test evidence
4. Still requires unit tests if code was modified

### Reference
- SD Type Profiles: `scripts/orchestrator-preflight.js`
- Workflow Paths: CLAUDE_CORE_DIGEST.md',
  801,
  '{"source_piq": "6c9dfdd8-d9c5-4a82-a6bf-541bd39d2c3a", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004", "affected_phase": "EXEC"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 3: Enum Consistency Validation
-- PIQ: 2f49a39a-2587-4df8-930d-7871c76b8b87
-- Evidence: Enum value mismatch (pending vs pending_vetting) required migration fix
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'enum_consistency_validation',
  'Enum Value Consistency Validation',
  '## Enum Value Consistency Validation

### Problem
PostgreSQL CHECK constraints enforce enum values at the database level, but application code may use different values. This mismatch causes silent failures or INSERT errors that are hard to trace.

### Example Incident
```sql
-- Migration created constraint:
CHECK (status IN (''pending'', ''approved'', ''rejected''))

-- Application code used:
status = ''pending_vetting''  -- NOT in constraint → INSERT fails
```

### Prevention: Pre-Migration Checklist
Before applying any migration that adds/modifies CHECK constraints:

1. **Grep application code** for all values of the constrained column:
   ```bash
   # Find all status values used in code
   grep -rn "status.*=" lib/ scripts/ --include="*.js" | grep -i "<column_name>"
   ```

2. **Compare with migration values**:
   - List all values in the new CHECK constraint
   - List all values found in application code
   - Verify 100% overlap (app values ⊆ constraint values)

3. **Check existing data**:
   ```sql
   SELECT DISTINCT status FROM <table_name>;
   ```
   Ensure all existing values are in the new constraint.

### Validation Script Pattern
```javascript
// Before applying migration, validate enum consistency
const migrationEnums = [''pending'', ''approved'', ''rejected''];
const codeEnums = findEnumValuesInCode(''status'', [''lib/'', ''scripts/'']);
const missing = codeEnums.filter(v => !migrationEnums.includes(v));
if (missing.length > 0) {
  throw new Error(`Enum mismatch: ${missing.join('', '')} used in code but not in migration`);
}
```

### Key Tables with CHECK Constraints
| Table | Column | Common Mismatches |
|-------|--------|-------------------|
| `strategic_directives_v2` | `sd_type` | New types not added to constraint |
| `strategic_directives_v2` | `status` | Workflow states vs constraint values |
| `risk_assessments` | `phase` | Phase names (e.g., PLAN_PRD) not in constraint |
| `protocol_improvement_queue` | `status` | Lifecycle states mismatch |',
  802,
  '{"source_piq": "2f49a39a-2587-4df8-930d-7871c76b8b87", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004", "affected_phase": "EXEC"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 4: Environment Variable Validation for Migrations
-- PIQ: f6270356-83db-4d33-bca5-e4571800cb5e
-- Evidence: Migration failed when SUPABASE_DB_PASSWORD not set
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'env_var_migration_validation',
  'Environment Variable Validation for Migration Scripts',
  '## Environment Variable Validation for Migration Scripts

### Problem
Migration scripts fail silently or with cryptic errors when required environment variables are missing. The most common failure: `SUPABASE_DB_PASSWORD` not set, causing connection timeout.

### Required Environment Variables
| Variable | Required For | Fallback |
|----------|-------------|----------|
| `SUPABASE_URL` | All Supabase operations | `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-level access | None (fatal) |
| `SUPABASE_DB_PASSWORD` | Direct PostgreSQL connection | Use `SUPABASE_POOLER_URL` instead |
| `SUPABASE_POOLER_URL` | Pooled connection (no password needed) | Construct from SUPABASE_URL |

### Recommended Connection Strategy
```
1. Try SUPABASE_POOLER_URL (no password required)
2. If unavailable, try direct connection with SUPABASE_DB_PASSWORD
3. If neither available, use Supabase JS client (REST API)
4. If all fail, provide clear error with setup instructions
```

### Validation Pattern
```javascript
function validateMigrationEnv() {
  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(''Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'');
  }

  if (poolerUrl) return { method: ''pooler'', url: poolerUrl };
  if (dbPassword) return { method: ''direct'', password: dbPassword };
  return { method: ''rest'', url: supabaseUrl, key: serviceKey };
}
```

### DATABASE Sub-Agent Delegation
**Preferred approach**: Delegate migration execution to the DATABASE sub-agent, which handles all connection fallbacks automatically:
```
Task tool with subagent_type="database-agent":
"Execute the migration file: database/migrations/YYYYMMDD_name.sql"
```

### Reference
- Connection patterns: `lib/supabase-connection.js`
- DATABASE sub-agent: `lib/sub-agents/database/`
- Migration execution docs: `CLAUDE_EXEC_DIGEST.md`',
  803,
  '{"source_piq": "f6270356-83db-4d33-bca5-e4571800cb5e", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004", "affected_phase": "EXEC"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- IMPROVEMENT 5: PostgreSQL Function Immutability Constraints
-- PIQ: 43faf2d8-3ce1-44b1-adc1-0a43f961d95d
-- Evidence: now() cannot be used in index WHERE clause
-- ============================================================
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata, priority)
VALUES (
  'leo-v4-3-3-ui-parity',
  'postgresql_immutability_constraints',
  'PostgreSQL Function Immutability Constraints for Index Creation',
  '## PostgreSQL Function Immutability Constraints

### Problem
PostgreSQL partial indexes require IMMUTABLE expressions in their WHERE clause. Functions like `now()`, `current_timestamp`, and `clock_timestamp()` are STABLE or VOLATILE, causing index creation to fail.

### Error Example
```sql
-- This FAILS:
CREATE INDEX idx_active_sessions ON sessions (id)
WHERE created_at > now() - interval ''24 hours'';
-- ERROR: functions in index predicate must be marked IMMUTABLE

-- This also FAILS:
CREATE UNIQUE INDEX idx_unique_active ON claims (sd_id)
WHERE status = ''active'' AND expires_at > now();
-- ERROR: functions in index predicate must be marked IMMUTABLE
```

### PostgreSQL Function Volatility Categories
| Category | Can Use In Index? | Examples |
|----------|-------------------|---------|
| IMMUTABLE | YES | `lower()`, `upper()`, `length()`, math operators |
| STABLE | NO | `now()`, `current_timestamp`, `age()` |
| VOLATILE | NO | `random()`, `clock_timestamp()`, `nextval()` |

### Solutions

#### Solution 1: Remove Time-Based Predicates from Index
```sql
-- Use a status column instead of time comparison
CREATE UNIQUE INDEX idx_unique_active_claim ON claims (sd_id)
WHERE status = ''active'';
-- Application code handles expiry via queries, not index
```

#### Solution 2: Use Application-Level Filtering
```sql
-- Index on status only
CREATE INDEX idx_sessions_active ON sessions (id)
WHERE status = ''active'';

-- Application queries add time filter
SELECT * FROM sessions WHERE status = ''active'' AND created_at > now() - interval ''24h'';
```

#### Solution 3: Materialized View (for complex cases)
```sql
CREATE MATERIALIZED VIEW active_sessions AS
SELECT * FROM sessions WHERE created_at > now() - interval ''24h'';
-- Refresh periodically via cron job
```

### Key Rule
**Never use `now()`, `current_timestamp`, or any STABLE/VOLATILE function in:**
- Partial index WHERE clauses
- Generated column expressions
- Default values for computed columns used in indexes

### Reference
- PostgreSQL docs: https://www.postgresql.org/docs/current/xfunc-volatility.html
- Incident: SD that used `now()` in unique partial index for session locking',
  804,
  '{"source_piq": "43faf2d8-3ce1-44b1-adc1-0a43f961d95d", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004", "affected_phase": "ALL"}',
  'STANDARD'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- UPDATE PIQ STATUS: Mark all 5 items as APPLIED
-- ============================================================
UPDATE protocol_improvement_queue
SET
  status = 'APPLIED',
  applied_at = NOW(),
  reviewed_at = NOW(),
  reviewed_by = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004',
  assigned_sd_id = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004'
WHERE id IN (
  'fb992110-36c2-4fa2-899c-530a4079b16f',  -- JSONB validation
  '6c9dfdd8-d9c5-4a82-a6bf-541bd39d2c3a',  -- Infrastructure EXEC-TO-PLAN skip
  '2f49a39a-2587-4df8-930d-7871c76b8b87',  -- Enum consistency
  'f6270356-83db-4d33-bca5-e4571800cb5e',  -- Env var validation
  '43faf2d8-3ce1-44b1-adc1-0a43f961d95d'   -- PostgreSQL immutability
);

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 'Protocol sections inserted' AS step, count(*) AS count
FROM leo_protocol_sections
WHERE metadata::text LIKE '%SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004%';

SELECT 'PIQ items marked APPLIED' AS step, count(*) AS count
FROM protocol_improvement_queue
WHERE assigned_sd_id = 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-004'
  AND status = 'APPLIED';
