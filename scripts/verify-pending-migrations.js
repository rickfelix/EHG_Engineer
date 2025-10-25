#!/usr/bin/env node

/**
 * Comprehensive Migration Status Check
 * Checks all migrations from 7 recent Strategic Directives
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../../ehg/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);

  return !error || !error.message.includes('does not exist');
}

async function checkColumnExists(tableName, columnName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1);

    return !error;
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 MIGRATION STATUS REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Strategic Directives in Scope:');
  console.log('1. SD-CHAIRMAN-ANALYTICS-PROMOTE-001');
  console.log('2. SD-VWC-OPPORTUNITY-BRIDGE-001');
  console.log('3. SD-CUSTOMER-INTEL-UI-001');
  console.log('4. SD-022-PROTOCOL-REMEDIATION-001');
  console.log('5. SD-022');
  console.log('6. SD-VWC-PHASE1-001');
  console.log('7. SD-GTM-INTEL-DISCOVERY-001');
  console.log('\n═══════════════════════════════════════════════════════════════\n');

  const checks = [];

  // SD-GTM-INTEL-DISCOVERY-001: nav_routes table
  console.log('1️⃣  SD-GTM-INTEL-DISCOVERY-001: Navigation routes');
  const navRoutesExists = await checkTableExists('nav_routes');
  console.log('   Table: nav_routes -', navRoutesExists ? '✅ EXISTS' : '❌ MISSING');
  checks.push({
    sd: 'SD-GTM-INTEL-DISCOVERY-001',
    migration: '001_nav_refactor_schema.sql',
    status: navRoutesExists ? 'EXECUTED' : 'PENDING',
    description: 'Creates nav_routes table for navigation management'
  });

  // SD-VWC-OPPORTUNITY-BRIDGE-001: source_blueprint_id column
  console.log('\n2️⃣  SD-VWC-OPPORTUNITY-BRIDGE-001: Venture blueprint tracking');
  const sourceBlueprintExists = await checkColumnExists('ventures', 'source_blueprint_id');
  console.log('   Column: ventures.source_blueprint_id -', sourceBlueprintExists ? '✅ EXISTS' : '❌ MISSING');
  checks.push({
    sd: 'SD-VWC-OPPORTUNITY-BRIDGE-001',
    migration: '20251024_add_source_blueprint_id_to_ventures.sql',
    status: sourceBlueprintExists ? 'EXECUTED' : 'PENDING',
    description: 'Links ventures to AI opportunity blueprints for conversion analytics'
  });

  // Check opportunity_blueprints table
  const blueprintsExists = await checkTableExists('opportunity_blueprints');
  console.log('   Table: opportunity_blueprints -', blueprintsExists ? '✅ EXISTS' : '❌ MISSING');
  if (!blueprintsExists) {
    checks.push({
      sd: 'SD-VWC-OPPORTUNITY-BRIDGE-001',
      migration: 'REQUIRED: opportunity_blueprints table',
      status: 'PENDING',
      description: 'Creates opportunity_blueprints table (prerequisite for source_blueprint_id)'
    });
  }

  // SD-CUSTOMER-INTEL-UI-001: Customer intelligence tables
  console.log('\n3️⃣  SD-CUSTOMER-INTEL-UI-001: Customer intelligence system');
  const customerPersonasExists = await checkTableExists('customer_personas');
  const icpProfilesExists = await checkTableExists('icp_profiles');
  const customerJourneysExists = await checkTableExists('customer_journeys');
  const wtpExists = await checkTableExists('willingness_to_pay');
  const marketSegmentsExists = await checkTableExists('market_segments');

  console.log('   Table: customer_personas -', customerPersonasExists ? '✅ EXISTS' : '❌ MISSING');
  console.log('   Table: icp_profiles -', icpProfilesExists ? '✅ EXISTS' : '❌ MISSING');
  console.log('   Table: customer_journeys -', customerJourneysExists ? '✅ EXISTS' : '❌ MISSING');
  console.log('   Table: willingness_to_pay -', wtpExists ? '✅ EXISTS' : '❌ MISSING');
  console.log('   Table: market_segments -', marketSegmentsExists ? '✅ EXISTS' : '❌ MISSING');

  const allCustomerIntelTablesExist = customerPersonasExists && icpProfilesExists &&
                                      customerJourneysExists && wtpExists && marketSegmentsExists;

  checks.push({
    sd: 'SD-CUSTOMER-INTEL-UI-001',
    migration: '20251011_customer_intelligence_system.sql',
    status: allCustomerIntelTablesExist ? 'EXECUTED' : 'PENDING',
    description: 'Creates 5 customer intelligence tables (personas, ICP, journeys, WTP, segments)'
  });

  // SD-VWC-PHASE1-001: Tier 0 stage cap
  console.log('\n4️⃣  SD-VWC-PHASE1-001: Tier 0 stage progression cap');
  // Unable to check function existence via RPC, mark as pending by default
  console.log('   Function: prevent_tier0_stage_progression() - ⚠️  UNABLE TO VERIFY');

  checks.push({
    sd: 'SD-VWC-PHASE1-001',
    migration: '20251023195744_prevent_tier0_stage_progression.sql',
    status: 'PENDING',
    description: 'Prevents Tier 0 ventures from progressing beyond Stage 3'
  });

  // SD-VIF-REFINE-001: Ideation experiments
  console.log('\n5️⃣  SD-VIF-REFINE-001: Recursive refinement loop');
  const ideationExperimentsExists = await checkTableExists('ideation_experiments');
  console.log('   Table: ideation_experiments -', ideationExperimentsExists ? '✅ EXISTS' : '❌ MISSING');

  checks.push({
    sd: 'SD-VIF-REFINE-001',
    migration: '20251018_create_ideation_experiments.sql',
    status: ideationExperimentsExists ? 'EXECUTED' : 'PENDING',
    description: 'Tracks venture refinement iterations and quality scores'
  });

  // SD-022 and SD-022-PROTOCOL-REMEDIATION-001
  console.log('\n6️⃣  SD-022 & SD-022-PROTOCOL-REMEDIATION-001: Protocol improvements');
  console.log('   (No database migrations - process/script changes only)');

  // SD-CHAIRMAN-ANALYTICS-PROMOTE-001
  console.log('\n7️⃣  SD-CHAIRMAN-ANALYTICS-PROMOTE-001: Navigation promotion');
  console.log('   (Uses existing nav_routes table - data-only changes)');

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 MIGRATION SUMMARY\n');

  const pendingMigrations = checks.filter(c => c.status === 'PENDING');
  const executedMigrations = checks.filter(c => c.status === 'EXECUTED');
  const unknownMigrations = checks.filter(c => c.status === 'UNKNOWN');

  console.log('✅ Executed migrations:', executedMigrations.length);
  executedMigrations.forEach(m => {
    console.log('   ✓', m.sd, '-', m.migration);
  });

  if (pendingMigrations.length > 0) {
    console.log('\n❌ Pending migrations:', pendingMigrations.length);
    pendingMigrations.forEach(m => {
      console.log('   ✗', m.sd, '-', m.migration);
      console.log('      Description:', m.description);
    });
  }

  if (unknownMigrations.length > 0) {
    console.log('\n⚠️  Unknown status:', unknownMigrations.length);
    unknownMigrations.forEach(m => {
      console.log('   ?', m.sd, '-', m.migration);
    });
  }

  // Recommendations
  if (pendingMigrations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS\n');
    console.log('Execute pending migrations in this order:\n');

    let order = 1;
    pendingMigrations.forEach(m => {
      const migrationPath = m.migration.includes('.sql')
        ? `/mnt/c/_EHG/ehg/supabase/migrations/${m.migration}`
        : 'CREATE MIGRATION FILE FIRST';

      console.log(`${order}. ${m.sd}`);
      console.log('   File:', migrationPath);
      console.log('   Command: psql [connection_string] -f', migrationPath);
      console.log('   Or use: Supabase CLI: supabase db push\n');
      order++;
    });
  } else {
    console.log('\n🎉 All migrations executed! Database is in sync.\n');
  }

  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
