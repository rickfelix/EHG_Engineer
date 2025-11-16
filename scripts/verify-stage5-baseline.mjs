import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Connect to EHG application database (NOT EHG_Engineer!)
const EHG_POOLER_URL = process.env.EHG_POOLER_URL;

if (!EHG_POOLER_URL) {
  console.error('ERROR: EHG_POOLER_URL not found in .env');
  console.error('This script requires connection to the EHG application database (liapbndqlqxdcgpwntbv)');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: EHG_POOLER_URL,
  ssl: { rejectUnauthorized: false }
});

async function runBaseline() {
  try {
    await client.connect();
    console.log('✅ Connected to EHG database (liapbndqlqxdcgpwntbv)');
    console.log('');

    // Baseline check
    console.log('===== BASELINE VERIFICATION =====');
    console.log('Running baseline check to establish "before" state...');
    console.log('');

    const baselineQuery = `
      SELECT
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'recursion_events' AND schemaname = 'public')
               AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'crewai_agents' AND schemaname = 'public')
               AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'crewai_crews' AND schemaname = 'public')
               AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'crewai_tasks' AND schemaname = 'public')
          THEN 'BASELINE CONFIRMED: No tables exist (ready for deployment)'
          ELSE 'WARNING: One or more tables already exist. Check current state.'
        END AS baseline_status;
    `;

    const baselineResult = await client.query(baselineQuery);
    console.log('Baseline Status:', baselineResult.rows[0].baseline_status);
    console.log('');

    // Check individual tables
    console.log('===== TABLE EXISTENCE CHECK =====');
    const tableCheck = await client.query(`
      SELECT
        to_regclass('public.recursion_events') IS NOT NULL AS recursion_events_exists,
        to_regclass('public.crewai_agents') IS NOT NULL AS crewai_agents_exists,
        to_regclass('public.crewai_crews') IS NOT NULL AS crewai_crews_exists,
        to_regclass('public.crewai_tasks') IS NOT NULL AS crewai_tasks_exists;
    `);

    console.log('Table Existence:');
    console.log('  recursion_events:', tableCheck.rows[0].recursion_events_exists ? '✅ EXISTS' : '❌ NOT FOUND');
    console.log('  crewai_agents:', tableCheck.rows[0].crewai_agents_exists ? '✅ EXISTS' : '❌ NOT FOUND');
    console.log('  crewai_crews:', tableCheck.rows[0].crewai_crews_exists ? '✅ EXISTS' : '❌ NOT FOUND');
    console.log('  crewai_tasks:', tableCheck.rows[0].crewai_tasks_exists ? '✅ EXISTS' : '❌ NOT FOUND');
    console.log('');

    // Check for existing tables in case they exist
    console.log('===== EXISTING TABLES (if any) =====');
    const existingTables = await client.query(`
      SELECT tablename, 'Table already exists' AS status
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('recursion_events','crewai_agents','crewai_crews','crewai_tasks')
      ORDER BY tablename;
    `);

    if (existingTables.rows.length > 0) {
      console.log('⚠️ WARNING: The following tables already exist:');
      existingTables.rows.forEach(row => {
        console.log('  -', row.tablename);
      });
      console.log('');
      console.log('Database agent will need to verify schema compatibility.');
    } else {
      console.log('✅ No tables exist - clean baseline confirmed.');
    }
    console.log('');

    // Save results to file
    const resultPath = path.join(__dirname, '..', 'docs', 'strategic_directives',
                                  'SD-STAGE5-DB-SCHEMA-DEPLOY-001', 'prd', 'baseline-verification.md');

    let existingTablesSection = '';
    if (existingTables.rows.length > 0) {
      const tableList = existingTables.rows.map(r => '- ' + r.tablename).join('\n');
      existingTablesSection = `## Existing Tables Found

⚠️ The following tables already exist and may need schema validation:

${tableList}

**Action Required**: Database agent must verify schema compatibility.
`;
    } else {
      existingTablesSection = `## Clean Baseline

✅ No target tables exist. Ready for deployment.
`;
    }

    const resultContent = `# SD-STAGE5-DB-SCHEMA-DEPLOY-001 Baseline Verification

**Date**: ${new Date().toISOString()}
**Database**: EHG (liapbndqlqxdcgpwntbv)
**Purpose**: Establish "before" state prior to schema deployment

## Baseline Status

${baselineResult.rows[0].baseline_status}

## Table Existence Check

| Table | Exists Before Deployment |
|-------|-------------------------|
| recursion_events | ${tableCheck.rows[0].recursion_events_exists ? 'YES ⚠️' : 'NO ✅'} |
| crewai_agents | ${tableCheck.rows[0].crewai_agents_exists ? 'YES ⚠️' : 'NO ✅'} |
| crewai_crews | ${tableCheck.rows[0].crewai_crews_exists ? 'YES ⚠️' : 'NO ✅'} |
| crewai_tasks | ${tableCheck.rows[0].crewai_tasks_exists ? 'YES ⚠️' : 'NO ✅'} |

${existingTablesSection}

## Next Steps

1. Invoke database agent: \`node lib/sub-agent-executor.js DATABASE 8be347b7-b3ea-411e-acac-87f42a3ee0b4\`
2. Database agent locates/creates migration files
3. Database agent deploys tables with RLS and indexes
4. Run post-deployment verification: \`node scripts/verify-stage5-deployment.mjs\`

---

*Generated by verify-stage5-baseline.mjs*
`;

    fs.writeFileSync(resultPath, resultContent);
    console.log('📄 Baseline verification saved to:');
    console.log('  ', resultPath);
    console.log('');

    console.log('===== NEXT STEPS =====');
    console.log('1. Invoke database agent:');
    console.log('   node lib/sub-agent-executor.js DATABASE 8be347b7-b3ea-411e-acac-87f42a3ee0b4');
    console.log('');
    console.log('2. Database agent will:');
    console.log('   - Locate migration files for all 4 tables');
    console.log('   - Deploy tables to EHG database');
    console.log('   - Configure RLS policies');
    console.log('   - Create performance indexes');
    console.log('');
    console.log('3. Run post-deployment verification:');
    console.log('   node scripts/verify-stage5-deployment.mjs');

  } catch (error) {
    console.error('❌ ERROR during baseline verification:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runBaseline();
