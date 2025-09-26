#!/usr/bin/env node

/**
 * Initialize Phase Tracking for Strategic Directives
 * Creates LEO Protocol phase tracking for SDs that don't have it
 * Run after applying LEO Protocol infrastructure migration
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class PhaseTrackingInitializer {
  constructor() {
    this.initialized = 0;
    this.skipped = 0;
    this.errors = 0;
  }

  async initializeAllSDs() {
    console.log(chalk.blue('\n🔄 Initializing LEO Protocol Phase Tracking'));
    console.log(chalk.blue('=' .repeat(60)));

    // Get all strategic directives that need phase tracking
    const { data: allSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, target_application')
      .in('status', ['draft', 'active', 'in_progress', 'pending_approval'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error(chalk.red('Error fetching SDs:', error.message));
      return;
    }

    console.log(`\n📊 Found ${allSDs.length} strategic directives requiring phase tracking\n`);

    for (const sd of allSDs) {
      await this.initializeSDPhaseTracking(sd);
    }

    this.generateReport();
  }

  async initializeSDPhaseTracking(sd) {
    console.log(chalk.yellow(`\n🔍 Processing ${sd.id}: ${sd.title}`));

    // Check if phases already exist
    const { data: existingPhases, error: checkError } = await supabase
      .from('sd_phase_tracking')
      .select('phase_name')
      .eq('sd_id', sd.id);

    if (checkError) {
      console.error(chalk.red(`  ❌ Error checking phases: ${checkError.message}`));
      this.errors++;
      return;
    }

    if (existingPhases && existingPhases.length > 0) {
      console.log(chalk.green(`  ✅ Skipped - ${existingPhases.length} phases already exist`));
      this.skipped++;
      return;
    }

    // Determine initial phase state based on SD status
    const phases = this.getPhaseConfiguration(sd.status);

    let phasesCreated = 0;
    for (const phase of phases) {
      const { error: insertError } = await supabase
        .from('sd_phase_tracking')
        .insert({
          sd_id: sd.id,
          phase_name: phase.phase_name,
          progress: phase.progress,
          is_complete: phase.is_complete,
          started_at: phase.is_complete || phase.progress > 0 ? new Date().toISOString() : null,
          completed_at: phase.is_complete ? new Date().toISOString() : null
        });

      if (insertError) {
        console.error(chalk.red(`    ❌ Error creating ${phase.phase_name}: ${insertError.message}`));
        this.errors++;
      } else {
        console.log(chalk.green(`    ✅ Created ${phase.phase_name} (${phase.progress}%)`));
        phasesCreated++;
      }
    }

    if (phasesCreated === phases.length) {
      console.log(chalk.green(`  🎯 Successfully initialized ${phasesCreated} phases`));
      this.initialized++;
    }
  }

  getPhaseConfiguration(sdStatus) {
    // Define phase configurations based on SD status
    const basePhases = [
      { phase_name: 'LEAD_APPROVAL', progress: 0, is_complete: false },
      { phase_name: 'PLAN_DESIGN', progress: 0, is_complete: false },
      { phase_name: 'EXEC_IMPLEMENTATION', progress: 0, is_complete: false },
      { phase_name: 'PLAN_VERIFICATION', progress: 0, is_complete: false },
      { phase_name: 'LEAD_FINAL_APPROVAL', progress: 0, is_complete: false }
    ];

    switch (sdStatus) {
      case 'draft':
        // Draft: Only LEAD_APPROVAL started
        return basePhases;

      case 'active':
        // Active: LEAD_APPROVAL complete, PLAN_DESIGN in progress
        basePhases[0] = { phase_name: 'LEAD_APPROVAL', progress: 100, is_complete: true };
        basePhases[1] = { phase_name: 'PLAN_DESIGN', progress: 50, is_complete: false };
        return basePhases;

      case 'in_progress':
        // In progress: LEAD and PLAN complete, EXEC in progress
        basePhases[0] = { phase_name: 'LEAD_APPROVAL', progress: 100, is_complete: true };
        basePhases[1] = { phase_name: 'PLAN_DESIGN', progress: 100, is_complete: true };
        basePhases[2] = { phase_name: 'EXEC_IMPLEMENTATION', progress: 75, is_complete: false };
        return basePhases;

      case 'pending_approval':
        // Pending approval: All except final LEAD approval complete
        basePhases[0] = { phase_name: 'LEAD_APPROVAL', progress: 100, is_complete: true };
        basePhases[1] = { phase_name: 'PLAN_DESIGN', progress: 100, is_complete: true };
        basePhases[2] = { phase_name: 'EXEC_IMPLEMENTATION', progress: 100, is_complete: true };
        basePhases[3] = { phase_name: 'PLAN_VERIFICATION', progress: 100, is_complete: true };
        basePhases[4] = { phase_name: 'LEAD_FINAL_APPROVAL', progress: 50, is_complete: false };
        return basePhases;

      default:
        return basePhases;
    }
  }

  generateReport() {
    console.log(chalk.blue('\n📋 Phase Tracking Initialization Report'));
    console.log(chalk.blue('=' .repeat(60)));

    console.log(`\n📊 Summary:`);
    console.log(`  SDs Initialized: ${this.initialized}`);
    console.log(`  SDs Skipped: ${this.skipped}`);
    console.log(`  Errors: ${this.errors}`);

    if (this.errors > 0) {
      console.log(chalk.yellow(`\n⚠️  ${this.errors} errors occurred during initialization`));
      console.log('Check the output above for details');
    }

    if (this.initialized > 0) {
      console.log(chalk.green(`\n✅ Successfully initialized phase tracking for ${this.initialized} SDs`));
      console.log('\n🎯 Next Steps:');
      console.log('  1. Run LEO Protocol enforcement: node scripts/leo-protocol-enforcement.js');
      console.log('  2. Verify dashboard shows progress correctly');
      console.log('  3. Test phase progression workflows');
    }
  }

  async verifyInfrastructure() {
    console.log(chalk.blue('\n🔧 Verifying LEO Protocol Infrastructure'));
    console.log(chalk.blue('=' .repeat(60)));

    // Check if sd_phase_tracking table exists by trying to query it
    const { data, error } = await supabase
      .from('sd_phase_tracking')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      // Table doesn't exist
      console.log(chalk.red('\n❌ sd_phase_tracking table not found!'));
      console.log(chalk.yellow('\n📋 Required Actions:'));
      console.log('1. Apply migration: /database/migrations/2025-09-23-leo-protocol-infrastructure.sql');
      console.log('2. Use Supabase Dashboard SQL Editor (DDL operations terminate pooler connections)');
      console.log('3. Dashboard: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq');
      return false;
    }

    if (error && error.code !== '42P01') {
      console.log(chalk.yellow('\n⚠️ Unexpected error checking table:', error.message));
      console.log('Proceeding anyway...');
    }

    console.log(chalk.green('\n✅ LEO Protocol infrastructure verified'));
    return true;
  }
}

// Main execution
async function main() {
  const initializer = new PhaseTrackingInitializer();

  // Verify infrastructure exists first
  const infrastructureReady = await initializer.verifyInfrastructure();

  if (!infrastructureReady) {
    console.log(chalk.red('\n🛑 Infrastructure not ready. Apply migration first.'));
    process.exit(1);
  }

  // Initialize phase tracking
  await initializer.initializeAllSDs();

  console.log(chalk.blue('\n' + '=' .repeat(60)));
  console.log(chalk.green('✅ LEO Protocol Phase Tracking Initialization Complete'));
  console.log(chalk.blue('=' .repeat(60)));
}

main().catch(console.error);