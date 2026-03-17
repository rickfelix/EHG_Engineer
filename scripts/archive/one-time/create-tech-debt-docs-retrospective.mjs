#!/usr/bin/env node

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const retrospective = {
  sd_id: 'SD-TECH-DEBT-DOCS-001',
  retro_type: 'SD_COMPLETION',
  title: 'SD Execution Retrospective: Legacy Markdown File Cleanup & Database-First Migration',
  description: 'Retrospective for the strategic directive that migrated 34 legacy markdown files (29 SD docs + 5 lessons learned) to archive and database, establishing database-first architecture patterns. Successfully reduced file clutter, preserved lessons learned in queryable database format, and documented migration patterns for future use.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['EXEC'],
  sub_agents_involved: ['DATABASE'],
  target_application: 'EHG_Engineer',
  learning_category: 'PROCESS_IMPROVEMENT', // Using valid category
  applies_to_all_apps: false,

  // Success metrics
  what_went_well: [
    'Migration script with dry-run mode prevented accidental data loss during development and testing',
    'All 5 lessons learned files preserved with proper categorization and zero data loss',
    'Archive directory structure maintained proper separation between migrated and active content',
    'Comprehensive audit report documented all 57+ legacy SD markdown files for future cleanup'
  ],

  success_patterns: [
    'Database schema validation caught issues early (invalid column names like retro_type vs type, key_learnings vs key_insights)',
    'Two-phase migration approach (directories first, then database migration) successfully reduced risk and allowed incremental verification',
    'Schema constraint validation caught invalid status values (EHG_Engineer vs EHG_engineer) before runtime errors',
    'Service role key usage pattern learned for RLS-protected tables requiring insert operations'
  ],

  failure_patterns: [
    'generate-retrospective.js script failed due to using anon key instead of service role key for RLS-protected inserts',
    'No automated validation that migrated database content is queryable and properly indexed',
    'Missing E2E test coverage for migration script - only manual testing performed',
    'Initial migration attempts failed due to schema mismatch - required multiple iterations to align with actual database schema',
    'RLS policy requirements not documented clearly in script comments, causing confusion during development'
  ],

  what_needs_improvement: [
    'The generate-retrospective.js script uses anon key and fails on RLS - should use service role',
    'No automated validation that migrated content is queryable',
    'Should have E2E test for migration script',
    'Missing documentation of RLS policy requirements in migration script templates'
  ],

  key_learnings: [
    'Always validate database schema column names and constraints BEFORE writing insert scripts - check actual schema files (007_leo_protocol_schema_fixed.sql) not assumptions',
    'RLS policies require service role key for insert operations - anon key only has SELECT permissions in most cases',
    'Migration scripts should validate queryability of migrated data as final step - insert is not enough',
    'Two-phase migrations (filesystem first, database second) provide rollback opportunities and reduce blast radius',
    'Dry-run modes are essential for destructive operations - saved significant debugging time',
    'Schema constraints (check constraints, foreign keys) are your friend - they catch issues early vs runtime failures',
    'Database-first architecture requires careful attention to column naming conventions (retro_type in schema vs type in old code)',
    'Archive directory structure should mirror original for maintainability and clear audit trail'
  ],

  action_items: [
    {
      text: 'Fix generate-retrospective.js to use service role key instead of anon key for RLS-protected inserts',
      category: 'TOOLING',
      priority: 'HIGH'
    },
    {
      text: 'Add E2E test for migration script covering dry-run mode, actual migration, and validation',
      category: 'TESTING',
      priority: 'MEDIUM'
    },
    {
      text: 'Create validation function for migrated retrospective content (queryability, indexing, RLS policy compliance)',
      category: 'TOOLING',
      priority: 'MEDIUM'
    },
    {
      text: 'Document RLS key requirements in script template comments for future migration scripts',
      category: 'DOCUMENTATION',
      priority: 'HIGH'
    },
    {
      text: 'Add schema validation helper that compares script column names against actual database schema',
      category: 'TOOLING',
      priority: 'MEDIUM'
    },
    {
      text: 'Execute phase 2 of cleanup: archive remaining 52 legacy SD markdown files from audit report',
      category: 'TECH_DEBT',
      priority: 'LOW'
    }
  ],

  // Metrics
  quality_score: 78,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  technical_debt_addressed: true, // Boolean - addressed 34 files
  technical_debt_created: false, // No new tech debt introduced
  tests_added: 0, // TODO: Add E2E tests
  bugs_found: 5, // Schema mismatches found
  bugs_resolved: 5, // All schema issues resolved

  // Additional context
  related_files: [
    'scripts/archive-legacy-sd-markdown.js',
    'scripts/migrate-lessons-to-database.mjs',
    'database/schema/007_leo_protocol_schema_fixed.sql',
    'ARCHIVE/SD-CREWAI-ARCHITECTURE-001/',
    'ARCHIVE/SD-CREWAI-COMPETITIVE-INTELLIGENCE-001/'
  ],

  affected_components: [
    'retrospectives table',
    'migration scripts',
    'archive directory structure',
    'lessons learned system'
  ],

  tags: ['migration', 'database-first', 'tech-debt', 'cleanup', 'RLS', 'schema-validation'],

  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  auto_generated: false
};

async function createRetrospective() {
  console.log('🔍 RETROSPECTIVE GENERATION: SD-TECH-DEBT-DOCS-001');
  console.log('═══════════════════════════════════════════════════\n');

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating retrospective:', error);
    process.exit(1);
  }

  console.log('✅ Retrospective created successfully!');
  console.log(`📊 Quality Score: ${retrospective.quality_score}/100`);
  console.log(`🆔 ID: ${data.id}`);
  console.log(`📝 Title: ${data.title}`);
  console.log(`\n📈 Success Patterns: ${retrospective.success_patterns.length}`);
  console.log(`📉 Failure Patterns: ${retrospective.failure_patterns.length}`);
  console.log(`🎓 Key Learnings: ${retrospective.key_learnings.length}`);
  console.log(`✅ Action Items: ${retrospective.action_items.length}`);
  console.log(`\n📦 Technical Debt Addressed: YES (34 files archived)`);
  console.log(`🐛 Schema Issues Found & Resolved: ${retrospective.bugs_found}`);
  console.log(`\nView in database:`);
  console.log(`SELECT * FROM retrospectives WHERE id = '${data.id}';`);
}

createRetrospective();
