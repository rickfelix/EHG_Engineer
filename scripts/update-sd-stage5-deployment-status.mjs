#!/usr/bin/env node
/**
 * Update SD-STAGE5-DB-SCHEMA-DEPLOY-001 Deployment Status
 * Marks database schema as deployed with verification timestamp
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const SD_UUID = '8be347b7-b3ea-411e-acac-87f42a3ee0b4';

async function updateDeploymentStatus() {
  console.log('📊 Updating SD deployment status...');
  console.log('SD UUID:', SD_UUID);
  console.log('');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  // Update SD metadata
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        db_readiness: 'deployed',
        deployment_timestamp: new Date().toISOString(),
        deployment_verification_script: '/mnt/c/_EHG/EHG_Engineer/scripts/verify-stage5-schema.mjs',
        deployment_verification_doc: '/mnt/c/_EHG/EHG_Engineer/docs/strategic_directives/SD-STAGE5-DB-SCHEMA-DEPLOY-001/prd/deployment-verification.md',
        tables_deployed: [
          'recursion_events',
          'crewai_agents',
          'crewai_crews',
          'crewai_tasks'
        ],
        migration_files: [
          '20251103131938_create_recursion_events_table.sql',
          '20251106150201_sd_crewai_architecture_001_phase1_final.sql'
        ],
        database_target: 'liapbndqlqxdcgpwntbv',
        database_url: 'https://liapbndqlqxdcgpwntbv.supabase.co'
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', SD_UUID)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to update SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD metadata updated');
  console.log('   db_readiness:', sd.metadata.db_readiness);
  console.log('   deployment_timestamp:', sd.metadata.deployment_timestamp);
  console.log('   tables_deployed:', sd.metadata.tables_deployed.length);
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   1. Run E2E tests: cd /mnt/c/_EHG/ehg && npx playwright test tests/e2e/recursion-workflows.spec.ts');
  console.log('   2. Verify recursionEngine.ts integration');
  console.log('   3. Update PRD status if tests pass');
}

updateDeploymentStatus().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
