#!/usr/bin/env node

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function verifyMigration() {
  try {
    const client = await createDatabaseClient('engineer', { verify: false });

    console.log('='.repeat(80));
    console.log('VERIFICATION QUERY 1: SD Type Validation Profiles');
    console.log('='.repeat(80));
    const profiles = await client.query('SELECT * FROM sd_type_validation_profiles ORDER BY sd_type;');
    console.log(`Found ${profiles.rows.length} profiles:\n`);
    profiles.rows.forEach(p => {
      console.log(`${p.sd_type.toUpperCase().padEnd(15)} | Weights: L:${p.lead_weight} P:${p.plan_weight} E:${p.exec_weight} V:${p.verify_weight} F:${p.final_weight}`);
      console.log(`${' '.repeat(15)} | PRD:${p.requires_prd} Deliv:${p.requires_deliverables} E2E:${p.requires_e2e_tests} Retro:${p.requires_retrospective} Sub:${p.requires_sub_agents} Handoffs:${p.min_handoffs}`);
      console.log(`${' '.repeat(15)} | ${p.description}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('VERIFICATION QUERY 2: Get Database Profile');
    console.log('='.repeat(80));
    const dbProfile = await client.query("SELECT get_sd_validation_profile('database') as profile;");
    console.log('Database Profile:');
    console.log(JSON.stringify(dbProfile.rows[0].profile, null, 2));
    console.log('');

    console.log('='.repeat(80));
    console.log('VERIFICATION QUERY 3: Progress Breakdown for SD-VISION-TRANSITION-001B');
    console.log('='.repeat(80));
    const breakdown = await client.query("SELECT get_progress_breakdown('SD-VISION-TRANSITION-001B') as breakdown;");
    console.log('Progress Breakdown:');
    console.log(JSON.stringify(breakdown.rows[0].breakdown, null, 2));

    await client.end();
    console.log('\n✅ All verification queries completed successfully');
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyMigration();
