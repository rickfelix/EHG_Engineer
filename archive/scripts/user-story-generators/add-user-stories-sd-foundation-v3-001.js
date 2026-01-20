#!/usr/bin/env node
/**
 * Generate user stories for SD-FOUNDATION-V3-001 (Data Integrity & Schema Remediation)
 * Infrastructure SD focused on database remediation
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-FOUNDATION-V3-001';
const PRD_ID = 'PRD-SD-FOUNDATION-V3-001';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Audit uuid_id column usage across codebase',
    user_role: 'Database Administrator',
    user_want: 'Search all scripts and API endpoints for uuid_id references, document findings, and create removal checklist',
    user_benefit: 'Ensures all uuid_id references are identified and categorized before removal, preventing runtime errors and data integrity issues',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Comprehensive codebase scan',
        given: 'Codebase contains multiple files that may reference uuid_id column',
        when: 'Audit script searches all .js, .ts, .sql files for uuid_id references',
        then: 'All files with uuid_id references are identified AND documented in audit report AND categorized by usage type (SELECT, INSERT, UPDATE, FK reference)'
      },
      {
        id: 'AC-001-2',
        scenario: 'Categorization - Removable references',
        given: 'Script uses uuid_id in WHERE clause but id column exists',
        when: 'Audit categorizes usage',
        then: 'Usage is marked as "removable" AND migration notes suggest "Replace uuid_id with id (VARCHAR)"'
      },
      {
        id: 'AC-001-3',
        scenario: 'Categorization - Needs migration',
        given: 'Script uses uuid_id::text conversion for display',
        when: 'Audit categorizes usage',
        then: 'Usage is marked as "needs_migration" AND migration notes suggest "Replace uuid_id::text with id"'
      },
      {
        id: 'AC-001-4',
        scenario: 'Validation - No new uuid_id references',
        given: 'Recently modified files (last 7 days) exist in codebase',
        when: 'Audit checks recent files for uuid_id usage',
        then: 'IF uuid_id references found in new code THEN warning issued "New code contains uuid_id - use id column instead"'
      },
      {
        id: 'AC-001-5',
        scenario: 'Audit report generation',
        given: 'Audit scan complete with all findings categorized',
        when: 'Report is generated',
        then: 'Report includes: total files scanned, files with uuid_id references, breakdown by category (removable/needs_migration/external_dependency), checklist for removal'
      }
    ],
    definition_of_done: [
      'Audit script created: scripts/audit-uuid-id-usage.js',
      'Script scans all .js, .ts, .sql files for uuid_id references',
      'All findings documented in docs/validation/uuid-id-audit-report.md',
      'Each usage categorized: removable, needs_migration, external_dependency',
      'Removal checklist created with prioritized tasks',
      'No uuid_id references in code modified in last 7 days',
      'Audit report reviewed by team'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Audit should use grep/ripgrep for fast searching. Categorization logic: (1) removable = uuid_id used in WHERE/SELECT but id column exists, (2) needs_migration = uuid_id::text conversions or complex queries, (3) external_dependency = uuid_id passed to external APIs/services. Edge cases: uuid_id in comments/documentation (ignore), uuid_id in migration files (document but don\'t categorize as removal).',
    implementation_approach: 'Create audit script using Node.js with file system scanning. Use regex patterns to find uuid_id references. Parse SQL/JS to determine usage context. Generate markdown report with findings table. Include git blame to find recent changes.',
    implementation_context: 'FR-1: Audit uuid_id column usage. Critical for safe uuid_id removal. Prevents breaking changes by identifying all dependencies.',
    architecture_references: [
      'database/schema/001_initial_schema.sql - strategic_directives_v2 table definition',
      'database/migrations/20251212_deprecate_uuid_id_column.sql - uuid_id deprecation',
      'scripts/modules/handoff/db/SDRepository.js - Dual-ID lookup pattern',
      'scripts/verify-sd-state.js - Example of current uuid_id usage',
      'Database: strategic_directives_v2 - Table with uuid_id column'
    ],
    example_code_patterns: {
      audit_script: `// scripts/audit-uuid-id-usage.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function auditUuidIdUsage() {
  console.log('=== UUID_ID AUDIT ===');

  // 1. Search for uuid_id references
  const searchResults = execSync(
    'rg "uuid_id" --type js --type ts --type sql --json',
    { encoding: 'utf-8' }
  );

  const findings = [];
  for (const line of searchResults.split('\\n')) {
    if (!line) continue;
    const match = JSON.parse(line);

    if (match.type === 'match') {
      findings.push({
        file: match.data.path.text,
        line: match.data.line_number,
        content: match.data.lines.text,
        category: categorizeUsage(match.data.lines.text)
      });
    }
  }

  // 2. Categorize findings
  const categorized = {
    removable: findings.filter(f => f.category === 'removable'),
    needs_migration: findings.filter(f => f.category === 'needs_migration'),
    external_dependency: findings.filter(f => f.category === 'external')
  };

  // 3. Generate report
  generateReport(categorized, findings.length);
}

function categorizeUsage(line) {
  // Simple categorization logic
  if (line.includes('uuid_id::text')) return 'needs_migration';
  if (line.includes('WHERE uuid_id =')) return 'removable';
  if (line.includes('SELECT uuid_id')) return 'removable';
  if (line.includes('api/') || line.includes('fetch(')) return 'external';
  return 'needs_migration';
}`,
      report_format: `# UUID_ID Audit Report

**SD**: SD-FOUNDATION-V3-001
**Date**: 2025-12-17
**Total Files Scanned**: 1,247
**Files with uuid_id References**: 23

## Summary

| Category | Count | Priority |
|----------|-------|----------|
| Removable | 12 | Medium |
| Needs Migration | 9 | High |
| External Dependency | 2 | Critical |

## Findings Detail

### Removable (12 files)

1. **scripts/verify-sd-state.js:34**
   - Usage: \`SELECT uuid_id FROM strategic_directives_v2\`
   - Migration: Replace with \`SELECT id FROM strategic_directives_v2\`
   - Effort: 5 min

...

## Removal Checklist

- [ ] Update 12 removable references to use id column
- [ ] Migrate 9 complex queries with uuid_id::text
- [ ] Notify external systems about uuid_id deprecation
- [ ] Create rollback plan
- [ ] Test all modified scripts`
    },
    testing_scenarios: [
      { type: 'unit', priority: 'P0', scenario: 'Audit script finds all uuid_id references' },
      { type: 'unit', priority: 'P0', scenario: 'Categorization logic correctly classifies usage types' },
      { type: 'unit', priority: 'P1', scenario: 'Report generation includes all required sections' },
      { type: 'unit', priority: 'P1', scenario: 'Recent file check identifies new uuid_id usage' }
    ]
  },
  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Verify FK referential integrity for sd_id columns',
    user_role: 'Database Administrator',
    user_want: 'Confirm all sd_id FK columns in product_requirements_v2, retrospectives, sd_phase_handoffs correctly reference strategic_directives_v2.id',
    user_benefit: 'Ensures no orphaned records exist and all FK relationships are valid, preventing data corruption and query failures',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - 100% FK integrity verified',
        given: 'Database contains product_requirements_v2, retrospectives, sd_phase_handoffs tables with sd_id FK columns',
        when: 'Verification script runs JOIN queries to check FK integrity',
        then: 'All sd_id values in child tables match existing id values in strategic_directives_v2 AND match rate is 100% AND no orphaned records found'
      },
      {
        id: 'AC-002-2',
        scenario: 'FK integrity check for product_requirements_v2',
        given: 'product_requirements_v2 table has sd_id column',
        when: 'Query executes: SELECT COUNT(*) FROM product_requirements_v2 p LEFT JOIN strategic_directives_v2 s ON p.sd_id = s.id WHERE s.id IS NULL',
        then: 'Query returns 0 rows (no orphaned PRDs)'
      },
      {
        id: 'AC-002-3',
        scenario: 'FK integrity check for sd_phase_handoffs',
        given: 'sd_phase_handoffs table has sd_id column',
        when: 'Query executes: SELECT COUNT(*) FROM sd_phase_handoffs h LEFT JOIN strategic_directives_v2 s ON h.sd_id = s.id WHERE s.id IS NULL',
        then: 'Query returns 0 rows (no orphaned handoffs)'
      },
      {
        id: 'AC-002-4',
        scenario: 'get_progress_breakdown() returns correct prd_exists',
        given: 'SD-FOUNDATION-V3-001 has PRD in database with sd_id = "SD-FOUNDATION-V3-001"',
        when: 'Function get_progress_breakdown(\'SD-FOUNDATION-V3-001\') executes',
        then: 'Result includes prd_exists = true AND prd_id is populated'
      },
      {
        id: 'AC-002-5',
        scenario: 'Error path - Orphaned records detected',
        given: 'Test database has intentional orphaned record (sd_id points to non-existent SD)',
        when: 'Verification script runs',
        then: 'Script reports orphaned record with details: table, record_id, invalid_sd_id AND suggests remediation: "Delete orphaned record OR create missing SD"'
      }
    ],
    definition_of_done: [
      'Verification script created: scripts/verify-fk-integrity-sd-id.js',
      'Script checks FK integrity for all tables with sd_id FK',
      'All FK checks return 100% match rate',
      'get_progress_breakdown() tested and returns correct prd_exists',
      'No orphaned records in product_requirements_v2, retrospectives, sd_phase_handoffs',
      'Verification report generated: docs/validation/SD-FOUNDATION-V3-001-fk-integrity-report.md',
      'Database constraints validated (FK constraints enabled)'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'FK integrity verification checks all tables that reference strategic_directives_v2.id via sd_id column. Critical for preventing orphaned records after uuid_id removal. Edge cases: legacy records with UUID format in id column (should still work via string comparison), soft-deleted SDs (may have "orphaned" child records that are intentional).',
    implementation_approach: 'Create verification script that queries each FK table and LEFT JOINs to strategic_directives_v2. Count orphaned records (WHERE parent.id IS NULL). Test get_progress_breakdown() function. Generate report with findings.',
    implementation_context: 'FR-2: Verify FK referential integrity. Critical for ensuring uuid_id removal doesn\'t break FK relationships. Validates that sd_id migration (UUID → VARCHAR) was successful.',
    architecture_references: [
      'database/schema/001_initial_schema.sql - FK definitions for sd_id',
      'database/migrations/20251212_standardize_prd_sd_reference.sql - PRD FK migration',
      'database/functions/get_progress_breakdown.sql - Progress calculation function',
      'scripts/modules/handoff/db/SDRepository.js - SD lookup logic',
      'Database: product_requirements_v2.sd_id - FK to strategic_directives_v2.id',
      'Database: sd_phase_handoffs.sd_id - FK to strategic_directives_v2.id',
      'Database: retrospectives.sd_id - FK to strategic_directives_v2.id'
    ],
    example_code_patterns: {
      fk_verification: `// scripts/verify-fk-integrity-sd-id.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyFKIntegrity() {
  console.log('=== FK INTEGRITY VERIFICATION ===');

  const tables = [
    'product_requirements_v2',
    'sd_phase_handoffs',
    'retrospectives',
    'user_stories'
  ];

  const results = [];

  for (const table of tables) {
    // Check for orphaned records
    const { data, error } = await supabase.rpc('check_orphaned_records', {
      table_name: table
    });

    if (error) {
      console.error(\`Error checking \${table}:\`, error);
      continue;
    }

    results.push({
      table,
      total_records: data.total,
      orphaned_records: data.orphaned,
      integrity_percentage: ((data.total - data.orphaned) / data.total * 100).toFixed(2)
    });
  }

  // Generate report
  console.log('\\n=== RESULTS ===');
  results.forEach(r => {
    console.log(\`\${r.table}: \${r.integrity_percentage}% (\${r.orphaned} orphaned)\`);
  });

  return results;
}

verifyFKIntegrity().catch(console.error);`,
      integrity_check_query: `-- SQL query to check FK integrity
SELECT
  'product_requirements_v2' AS table_name,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE s.id IS NULL) AS orphaned_records,
  ROUND(
    (COUNT(*) - COUNT(*) FILTER (WHERE s.id IS NULL))::numeric / COUNT(*) * 100,
    2
  ) AS integrity_percentage
FROM product_requirements_v2 p
LEFT JOIN strategic_directives_v2 s ON p.sd_id = s.id

UNION ALL

SELECT
  'sd_phase_handoffs' AS table_name,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE s.id IS NULL) AS orphaned_records,
  ROUND(
    (COUNT(*) - COUNT(*) FILTER (WHERE s.id IS NULL))::numeric / COUNT(*) * 100,
    2
  ) AS integrity_percentage
FROM sd_phase_handoffs h
LEFT JOIN strategic_directives_v2 s ON h.sd_id = s.id;`,
      progress_breakdown_test: `// Test get_progress_breakdown() function
const { data, error } = await supabase.rpc('get_progress_breakdown', {
  p_sd_id: 'SD-FOUNDATION-V3-001'
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Progress Breakdown:');
  console.log('PRD Exists:', data.prd_exists); // Should be true
  console.log('PRD ID:', data.prd_id); // Should be PRD-SD-FOUNDATION-V3-001
}`
    },
    testing_scenarios: [
      { type: 'integration', priority: 'P0', scenario: 'FK integrity check returns 100% for all tables' },
      { type: 'integration', priority: 'P0', scenario: 'get_progress_breakdown() returns correct prd_exists' },
      { type: 'unit', priority: 'P1', scenario: 'Orphaned record detection works correctly' },
      { type: 'integration', priority: 'P1', scenario: 'Report generation includes all FK tables' }
    ]
  },
  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Standardize ID display format in scripts and terminal output',
    user_role: 'Developer',
    user_want: 'Update all console.log and display patterns to use consistent ID format (prefer legacy_id || id)',
    user_benefit: 'Human-readable terminal output with SD-XXX format instead of UUIDs, improving developer experience and reducing confusion',
    story_points: 3,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Consistent ID display in handoff executors',
        given: 'Handoff executors (LeadToPlan, PlanToExec) display SD IDs in terminal',
        when: 'Handoff executes and logs SD information',
        then: 'Terminal output shows "SD: SD-FOUNDATION-V3-001" (legacy_id format) instead of UUID AND all handoff executors use consistent format'
      },
      {
        id: 'AC-003-2',
        scenario: 'Display logic - Prefer legacy_id over UUID',
        given: 'SD record has both legacy_id (SD-XXX) and id (UUID or VARCHAR)',
        when: 'Display helper function formats SD ID for output',
        then: 'Function returns legacy_id if present, otherwise falls back to id'
      },
      {
        id: 'AC-003-3',
        scenario: 'Validation - No mixed UUID/VARCHAR display',
        given: 'All scripts that display SD IDs',
        when: 'Audit scans for inconsistent ID display patterns',
        then: 'No scripts display raw UUID format in user-facing output AND all use displaySDId() helper OR legacy_id || id pattern'
      },
      {
        id: 'AC-003-4',
        scenario: 'Error messages - Human-readable SD references',
        given: 'Error occurs with SD reference (e.g., "SD not found")',
        when: 'Error message is generated',
        then: 'Error message includes legacy_id (SD-XXX) format: "SD SD-FOUNDATION-V3-001 not found" instead of UUID'
      }
    ],
    definition_of_done: [
      'Display helper created: lib/utils/displaySDId.js',
      'All handoff executors updated to use displaySDId()',
      'All scripts in scripts/ updated for consistent ID display',
      'Error messages updated to show legacy_id format',
      'No raw UUID format in terminal output (verified via audit)',
      'Documentation updated: docs/patterns/sd-id-display-pattern.md'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'ID display standardization improves developer UX. Pattern: (1) Query both legacy_id and id, (2) Display legacy_id if present, (3) Fall back to id if legacy_id NULL. Edge cases: legacy SDs may not have legacy_id (display id as fallback), new SDs should always have legacy_id populated.',
    implementation_approach: 'Create displaySDId(sd) utility function. Update all handoff executors to use utility. Audit scripts for raw UUID display and replace with helper. Update error message templates.',
    implementation_context: 'FR-3: Standardize ID display in scripts. Improves developer experience by showing human-readable SD-XXX format instead of UUIDs. Part of uuid_id deprecation effort.',
    architecture_references: [
      'scripts/modules/handoff/executors/LeadToPlanExecutor.js - Handoff logging',
      'scripts/modules/handoff/executors/PlanToExecExecutor.js - Handoff logging',
      'scripts/verify-sd-state.js - SD state display',
      'lib/sub-agent-executor.js - Sub-agent logging',
      'scripts/modules/handoff/db/SDRepository.js - SD data fetching'
    ],
    example_code_patterns: {
      display_helper: `// lib/utils/displaySDId.js
/**
 * Display SD ID in human-readable format
 * Prefers legacy_id (SD-XXX) over UUID/VARCHAR id
 */
export function displaySDId(sd) {
  if (!sd) return 'UNKNOWN';

  // Prefer legacy_id (SD-XXX format)
  if (sd.legacy_id) {
    return sd.legacy_id;
  }

  // Fall back to id (VARCHAR or UUID)
  return sd.id || 'UNKNOWN';
}

/**
 * Display SD with title
 */
export function displaySD(sd) {
  if (!sd) return 'UNKNOWN SD';

  const sdId = displaySDId(sd);
  return sd.title ? \`\${sdId}: \${sd.title}\` : sdId;
}`,
      handoff_executor_usage: `// In LeadToPlanExecutor.js
import { displaySDId, displaySD } from '../../lib/utils/displaySDId.js';

async execute(handoffRequest) {
  // Fetch SD data
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, status')
    .eq('id', handoffRequest.sd_id)
    .single();

  // Use helper for consistent display
  console.log('=== LEAD→PLAN HANDOFF ===');
  console.log('SD:', displaySD(sd)); // Output: "SD: SD-FOUNDATION-V3-001: Data Integrity & Schema Remediation"
  console.log('Status:', sd.status);

  // ... handoff logic
}`,
      error_message_pattern: `// Error messages with human-readable SD IDs
throw new Error(\`SD \${displaySDId(sd)} not found in database\`);
// Output: "SD SD-FOUNDATION-V3-001 not found in database"

console.error(\`⚠️  PRD missing for \${displaySDId(sd)}\`);
// Output: "⚠️  PRD missing for SD-FOUNDATION-V3-001"`
    },
    testing_scenarios: [
      { type: 'unit', priority: 'P0', scenario: 'displaySDId() prefers legacy_id over id' },
      { type: 'unit', priority: 'P0', scenario: 'displaySDId() falls back to id if legacy_id is NULL' },
      { type: 'integration', priority: 'P1', scenario: 'Handoff executors show SD-XXX format in logs' },
      { type: 'unit', priority: 'P1', scenario: 'Error messages include legacy_id format' }
    ]
  },
  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create uuid_id column removal migration with rollback',
    user_role: 'Database Administrator',
    user_want: 'Create migration to drop uuid_id column AFTER verifying no external dependencies',
    user_benefit: 'Clean database schema without deprecated columns, reducing confusion and preventing accidental use of uuid_id',
    story_points: 5,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Migration creation - Drop uuid_id column',
        given: 'Audit (US-001) and FK verification (US-002) completed with no blockers',
        when: 'Migration script is created',
        then: 'Migration file created: database/migrations/YYYYMMDD_remove_uuid_id_column.sql AND migration includes DROP COLUMN statement AND migration is NOT applied automatically'
      },
      {
        id: 'AC-004-2',
        scenario: 'Pre-migration validation',
        given: 'Migration is ready to apply',
        when: 'Pre-migration checks run',
        then: 'Script verifies: (1) No uuid_id references in codebase (from US-001 audit), (2) FK integrity is 100% (from US-002 verification), (3) Backup created, (4) Rollback plan documented'
      },
      {
        id: 'AC-004-3',
        scenario: 'Migration execution - Column dropped',
        given: 'Pre-migration checks passed',
        when: 'Migration executes: ALTER TABLE strategic_directives_v2 DROP COLUMN uuid_id',
        then: 'Column uuid_id removed from strategic_directives_v2 AND no errors occur AND table remains accessible'
      },
      {
        id: 'AC-004-4',
        scenario: 'Rollback script - Restore uuid_id column',
        given: 'Migration applied but issue discovered (e.g., external dependency)',
        when: 'Rollback script executes',
        then: 'Column uuid_id restored as UUID type AND column marked as DEPRECATED (comment) AND data NOT restored (column is NULL)'
      },
      {
        id: 'AC-004-5',
        scenario: 'Documentation - External system notification',
        given: 'Migration includes external dependency notes from US-001 audit',
        when: 'Migration documentation reviewed',
        then: 'Documentation lists external systems that may need notification AND includes communication template AND specifies deprecation timeline'
      }
    ],
    definition_of_done: [
      'Migration created: database/migrations/YYYYMMDD_remove_uuid_id_column.sql',
      'Rollback script created: database/migrations/YYYYMMDD_remove_uuid_id_column_rollback.sql',
      'Pre-migration validation script created: scripts/pre-migration-uuid-id-removal.js',
      'Documentation updated: docs/database/uuid-id-removal-migration.md',
      'External systems documented (if any)',
      'Migration tested on staging database',
      'Backup and rollback procedures documented',
      'Migration NOT applied to production (awaiting approval)'
    ],
    depends_on: [],
    blocks: [],
    technical_notes: 'Migration should be created but NOT applied automatically. Requires manual approval and coordination. Pre-migration validation ensures safety. Rollback script restores column structure but NOT data (acceptable since uuid_id is deprecated). Edge cases: if external systems depend on uuid_id, migration should be postponed and external systems notified.',
    implementation_approach: 'Create migration SQL file with DROP COLUMN statement. Create rollback SQL with ADD COLUMN. Create pre-migration validation script that checks US-001 audit results and US-002 FK integrity. Document external dependencies.',
    implementation_context: 'FR-4: Create uuid_id removal migration. Final step in uuid_id deprecation process. Migration should be safe, reversible, and well-documented. Requires completion of US-001 (audit) and US-002 (FK verification) first.',
    architecture_references: [
      'database/schema/001_initial_schema.sql - strategic_directives_v2 definition',
      'database/migrations/20251212_deprecate_uuid_id_column.sql - uuid_id deprecation',
      'database/migrations/20251212_standardize_prd_sd_reference.sql - FK migration pattern',
      'scripts/run-migration.js - Migration execution pattern',
      'docs/database/migration-best-practices.md - Migration guidelines'
    ],
    example_code_patterns: {
      migration_sql: `-- database/migrations/20251217_remove_uuid_id_column.sql
-- Remove deprecated uuid_id column from strategic_directives_v2
-- Prerequisite: US-001 audit complete, US-002 FK integrity verified
-- Status: CREATED but NOT APPLIED (awaiting approval)

BEGIN;

-- 1. Verify no recent uuid_id usage (safety check)
DO $$
DECLARE
  recent_usage INTEGER;
BEGIN
  -- Check if any recent queries used uuid_id (from pg_stat_statements if available)
  -- For now, this is a manual check based on US-001 audit
  RAISE NOTICE 'Verify US-001 audit report shows zero uuid_id usage in active code';
END $$;

-- 2. Drop uuid_id column
ALTER TABLE strategic_directives_v2
  DROP COLUMN IF EXISTS uuid_id;

-- 3. Add comment documenting removal
COMMENT ON TABLE strategic_directives_v2 IS
  'Strategic directives table. Column uuid_id removed 2025-12-17 after deprecation period. Use id column (VARCHAR) for all references.';

COMMIT;

-- Verification query
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name = 'uuid_id';
-- Should return 0 rows`,
      rollback_sql: `-- database/migrations/20251217_remove_uuid_id_column_rollback.sql
-- Rollback: Restore uuid_id column structure (data NOT restored)
-- Use only if migration must be reversed due to external dependency

BEGIN;

-- 1. Restore uuid_id column (NULL values)
ALTER TABLE strategic_directives_v2
  ADD COLUMN uuid_id UUID;

-- 2. Mark as DEPRECATED
COMMENT ON COLUMN strategic_directives_v2.uuid_id IS
  'DEPRECATED: Restored during rollback on 2025-12-17. Use id column instead. Data NOT restored.';

-- 3. Log rollback event
INSERT INTO migration_log (migration_name, action, reason, timestamp)
VALUES (
  '20251217_remove_uuid_id_column',
  'ROLLBACK',
  'External dependency discovered - uuid_id restored temporarily',
  NOW()
);

COMMIT;`,
      pre_migration_validation: `// scripts/pre-migration-uuid-id-removal.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function validatePreMigration() {
  console.log('=== PRE-MIGRATION VALIDATION ===');
  console.log('Migration: remove_uuid_id_column');
  console.log('');

  const checks = [];

  // Check 1: US-001 audit completed
  console.log('Check 1: UUID_ID Audit (US-001)');
  const auditReport = fs.existsSync('docs/validation/uuid-id-audit-report.md');
  if (!auditReport) {
    checks.push({ name: 'US-001 Audit', passed: false, reason: 'Audit report not found' });
  } else {
    const content = fs.readFileSync('docs/validation/uuid-id-audit-report.md', 'utf-8');
    const hasRemovableRefs = content.includes('Removable:');
    checks.push({
      name: 'US-001 Audit',
      passed: hasRemovableRefs,
      reason: hasRemovableRefs ? 'Audit complete' : 'Audit incomplete'
    });
  }

  // Check 2: US-002 FK integrity verified
  console.log('Check 2: FK Integrity (US-002)');
  const { data: fkCheck } = await supabase.rpc('verify_fk_integrity');
  checks.push({
    name: 'US-002 FK Integrity',
    passed: fkCheck?.integrity_percentage === 100,
    reason: \`Integrity: \${fkCheck?.integrity_percentage}%\`
  });

  // Check 3: Backup created
  console.log('Check 3: Database Backup');
  // Manual check - user must confirm
  checks.push({
    name: 'Database Backup',
    passed: null,
    reason: 'MANUAL CHECK REQUIRED: Verify backup created'
  });

  // Results
  console.log('\\n=== VALIDATION RESULTS ===');
  checks.forEach(c => {
    const status = c.passed === null ? '⚠️ ' : (c.passed ? '✅' : '❌');
    console.log(\`\${status} \${c.name}: \${c.reason}\`);
  });

  const allPassed = checks.every(c => c.passed === true || c.passed === null);

  if (allPassed) {
    console.log('\\n✅ Pre-migration validation PASSED');
    console.log('Migration is safe to apply (after manual backup verification)');
  } else {
    console.log('\\n❌ Pre-migration validation FAILED');
    console.log('DO NOT apply migration - resolve issues first');
  }

  return allPassed;
}

validatePreMigration().catch(console.error);`
    },
    testing_scenarios: [
      { type: 'integration', priority: 'P0', scenario: 'Migration drops uuid_id column successfully' },
      { type: 'integration', priority: 'P0', scenario: 'Rollback restores uuid_id column structure' },
      { type: 'unit', priority: 'P0', scenario: 'Pre-migration validation checks all prerequisites' },
      { type: 'integration', priority: 'P1', scenario: 'Table remains functional after uuid_id removal' }
    ]
  }
];

async function insertUserStories() {
  console.log('=== INSERTING USER STORIES FOR SD-FOUNDATION-V3-001 ===');
  console.log(`SD: ${SD_ID}`);
  console.log(`PRD: ${PRD_ID}`);
  console.log(`Total Stories: ${userStories.length}`);
  console.log('');

  const results = [];

  for (const story of userStories) {
    console.log(`Inserting ${story.story_key}...`);

    const { data, error } = await supabase
      .from('user_stories')
      .insert([story])
      .select();

    if (error) {
      console.error(`❌ Error inserting ${story.story_key}:`, error.message);
      results.push({ story_key: story.story_key, success: false, error: error.message });
    } else {
      console.log(`✅ ${story.story_key} inserted successfully`);
      results.push({ story_key: story.story_key, success: true, id: data[0].id });
    }
  }

  // Summary
  console.log('');
  console.log('=== SUMMARY ===');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  // Story points summary
  const totalPoints = userStories.reduce((sum, s) => sum + s.story_points, 0);
  console.log(`Total Story Points: ${totalPoints}`);

  // Priority breakdown
  const critical = userStories.filter(s => s.priority === 'critical').length;
  const high = userStories.filter(s => s.priority === 'high').length;
  const medium = userStories.filter(s => s.priority === 'medium').length;
  console.log(`Priority Breakdown: ${critical} Critical, ${high} High, ${medium} Medium`);
}

insertUserStories().catch(console.error);
