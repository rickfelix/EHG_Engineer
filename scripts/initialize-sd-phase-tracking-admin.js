#!/usr/bin/env node

/**
 * Initialize Phase Tracking for Strategic Directives (Admin Mode)
 * Uses direct PostgreSQL connection to bypass RLS policies
 * Run after applying LEO Protocol infrastructure migration
 */

import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

class PhaseTrackingInitializer {
  constructor() {
    this.initialized = 0;
    this.skipped = 0;
    this.errors = 0;
  }

  async initializeAllSDs() {
    console.log(chalk.blue('\n🔄 Initializing LEO Protocol Phase Tracking (Admin Mode)'));
    console.log(chalk.blue('=' .repeat(60)));

    // Use direct PostgreSQL connection to bypass RLS
    const { execSync } = await import('child_process');

    try {
      // First, get all SDs that need phase tracking
      const getSdsQuery = `
        SELECT id, title, status, target_application
        FROM strategic_directives_v2
        WHERE status IN ('draft', 'active', 'in_progress', 'pending_approval')
        ORDER BY created_at DESC;
      `;

      console.log('\n📊 Fetching strategic directives...');

      // Get SDs via direct postgres query
      const sdsResult = execSync(
        `source .env && echo "${getSdsQuery}" | psql "$SUPABASE_POOLER_URL" -t`,
        { encoding: 'utf8', shell: '/bin/bash' }
      );

      const sdRows = sdsResult.trim().split('\n').filter(line => line.trim());
      console.log(`Found ${sdRows.length} strategic directives requiring phase tracking\n`);

      for (const row of sdRows) {
        const parts = row.trim().split('|').map(p => p.trim());
        if (parts.length >= 3) {
          const sd = {
            id: parts[0],
            title: parts[1] || 'Untitled',
            status: parts[2] || 'draft',
            target_application: parts[3] || null
          };
          await this.initializeSDPhaseTracking(sd);
        }
      }

    } catch (error) {
      console.error(chalk.red('Error fetching SDs:', error.message));
      return;
    }

    this.generateReport();
  }

  async initializeSDPhaseTracking(sd) {
    console.log(chalk.yellow(`\n🔍 Processing ${sd.id}: ${sd.title}`));

    const { execSync } = await import('child_process');

    try {
      // Check if phases already exist
      const checkQuery = `SELECT COUNT(*) FROM sd_phase_tracking WHERE sd_id = '${sd.id}';`;
      const countResult = execSync(
        `source .env && echo "${checkQuery}" | psql "$SUPABASE_POOLER_URL" -t`,
        { encoding: 'utf8', shell: '/bin/bash' }
      );

      const existingCount = parseInt(countResult.trim());

      if (existingCount > 0) {
        console.log(chalk.green(`  ✅ Skipped - ${existingCount} phases already exist`));
        this.skipped++;
        return;
      }

      // Determine initial phase state based on SD status
      const phases = this.getPhaseConfiguration(sd.status);

      // Insert all phases at once
      const insertValues = phases.map(phase =>
        `('${sd.id}', '${phase.phase_name}', ${phase.progress}, ${phase.is_complete}, ${
          phase.is_complete || phase.progress > 0 ? 'NOW()' : 'NULL'
        }, ${phase.is_complete ? 'NOW()' : 'NULL'}, NOW(), NOW())`
      ).join(',\n    ');

      const insertQuery = `
        INSERT INTO sd_phase_tracking (
          sd_id, phase_name, progress, is_complete,
          started_at, completed_at, created_at, updated_at
        ) VALUES
          ${insertValues};
      `;

      execSync(
        `source .env && echo "${insertQuery}" | psql "$SUPABASE_POOLER_URL"`,
        { encoding: 'utf8', shell: '/bin/bash' }
      );

      console.log(chalk.green(`  🎯 Successfully initialized ${phases.length} phases`));
      this.initialized++;

    } catch (error) {
      console.error(chalk.red(`  ❌ Error initializing ${sd.id}:`, error.message));
      this.errors++;
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

    if (this.initialized === 0 && this.skipped > 0) {
      console.log(chalk.green(`\n✅ All ${this.skipped} SDs already have phase tracking configured`));
    }
  }

  async verifyInfrastructure() {
    console.log(chalk.blue('\n🔧 Verifying LEO Protocol Infrastructure'));
    console.log(chalk.blue('=' .repeat(60)));

    try {
      const { execSync } = await import('child_process');

      // Check if sd_phase_tracking table exists
      const checkQuery = `SELECT table_name FROM information_schema.tables WHERE table_name = 'sd_phase_tracking';`;
      const result = execSync(
        `source .env && echo "${checkQuery}" | psql "$SUPABASE_POOLER_URL" -t`,
        { encoding: 'utf8', shell: '/bin/bash' }
      );

      if (!result.trim().includes('sd_phase_tracking')) {
        console.log(chalk.red('\n❌ sd_phase_tracking table not found!'));
        console.log(chalk.yellow('\n📋 Required Actions:'));
        console.log('1. Apply migration: /database/migrations/2025-09-23-leo-protocol-infrastructure.sql');
        console.log('2. Use: source .env && psql "$SUPABASE_POOLER_URL" -f database/migrations/2025-09-23-leo-protocol-infrastructure.sql');
        return false;
      }

      console.log(chalk.green('\n✅ LEO Protocol infrastructure verified'));
      return true;

    } catch (error) {
      console.error(chalk.red('\n❌ Error checking infrastructure:', error.message));
      return false;
    }
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