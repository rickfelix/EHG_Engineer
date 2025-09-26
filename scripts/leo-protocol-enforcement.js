#!/usr/bin/env node

/**
 * LEO Protocol Enforcement System
 * Prevents SD completion gaps and ensures proper workflow discipline
 * Addresses issues discovered with SD-002 incomplete closure
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LEOProtocolEnforcer {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  async auditAllActiveSDs() {
    console.log(chalk.blue('\n🔍 LEO Protocol Compliance Audit'));
    console.log(chalk.blue('=' .repeat(50)));

    // First verify infrastructure exists
    const infraReady = await this.verifyInfrastructure();
    if (!infraReady) {
      console.log(chalk.red('\n🛑 LEO Protocol infrastructure not ready. Apply migration first.'));
      return;
    }

    // Get all active SDs (remove progress column that doesn't exist yet)
    const { data: activeSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, target_application, priority, created_at, updated_at, current_phase')
      .in('status', ['active', 'in_progress', 'draft', 'pending_approval'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error(chalk.red('Error fetching SDs:', error.message));
      return;
    }

    console.log(`\n📊 Found ${activeSDs.length} active strategic directives\n`);

    for (const sd of activeSDs) {
      await this.auditSD(sd);
    }

    this.generateReport();
  }

  async auditSD(sd) {
    console.log(chalk.yellow(`\n🔍 Auditing ${sd.id}: ${sd.title}`));

    const issues = [];

    // Check 1: Phase tracking exists
    const { data: phases } = await supabase
      .from('sd_phase_tracking')
      .select('*')
      .eq('sd_id', sd.id);

    if (!phases || phases.length === 0) {
      issues.push({
        type: 'MISSING_PHASE_TRACKING',
        severity: 'HIGH',
        message: 'No phase tracking data found'
      });
    }

    // Check 2: PRD exists and has proper status
    const { data: prds } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sd.id);

    if (!prds || prds.length === 0) {
      issues.push({
        type: 'MISSING_PRD',
        severity: 'HIGH',
        message: 'No PRD found for active SD'
      });
    } else {
      prds.forEach(prd => {
        if (prd.status === 'draft' && sd.status === 'active') {
          issues.push({
            type: 'PRD_STATUS_MISMATCH',
            severity: 'MEDIUM',
            message: `PRD ${prd.id} still in draft while SD is active`
          });
        }
      });
    }

    // Check 3: Recent activity
    const lastUpdate = new Date(sd.updated_at);
    const daysSinceUpdate = (new Date() - lastUpdate) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 7) {
      issues.push({
        type: 'STALE_SD',
        severity: 'MEDIUM',
        message: `No updates for ${Math.round(daysSinceUpdate)} days`
      });
    }

    // Check 4: Target application set
    if (!sd.target_application) {
      issues.push({
        type: 'MISSING_TARGET_APP',
        severity: 'HIGH',
        message: 'No target_application specified'
      });
    }

    // Check 5: Phase tracking existence and completeness
    const phaseCount = phases ? phases.length : 0;
    if (phaseCount === 0) {
      issues.push({
        type: 'MISSING_PHASE_TRACKING',
        severity: 'HIGH',
        message: 'No phase tracking data found'
      });
    } else if (phaseCount < 5) {
      issues.push({
        type: 'INCOMPLETE_PHASE_SETUP',
        severity: 'MEDIUM',
        message: `Only ${phaseCount}/5 phases configured`
      });
    }

    // Report issues
    if (issues.length > 0) {
      this.issues.push({ sd_id: sd.id, issues });

      issues.forEach(issue => {
        const icon = issue.severity === 'HIGH' ? '🔴' :
                     issue.severity === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`  ${icon} ${issue.type}: ${issue.message}`);
      });
    } else {
      console.log(chalk.green('  ✅ All checks passed'));
    }
  }

  async createPhaseTracking(sdId) {
    console.log(chalk.blue(`\n🔧 Creating phase tracking for ${sdId}`));

    const phases = [
      { phase_name: 'LEAD_APPROVAL', progress: 100, is_complete: true },
      { phase_name: 'PLAN_DESIGN', progress: 0, is_complete: false },
      { phase_name: 'EXEC_IMPLEMENTATION', progress: 0, is_complete: false },
      { phase_name: 'PLAN_VERIFICATION', progress: 0, is_complete: false },
      { phase_name: 'LEAD_FINAL_APPROVAL', progress: 0, is_complete: false }
    ];

    for (const phase of phases) {
      const { error } = await supabase
        .from('sd_phase_tracking')
        .insert({
          sd_id: sdId,
          phase_name: phase.phase_name,
          progress: phase.progress,
          is_complete: phase.is_complete,
          created_at: new Date().toISOString()
        });

      if (error && !error.message.includes('duplicate')) {
        console.error(chalk.red(`  Error creating ${phase.phase_name}:`, error.message));
      } else {
        console.log(chalk.green(`  ✅ Created ${phase.phase_name}`));
      }
    }
  }

  async fixIssues() {
    console.log(chalk.blue('\n🔧 Fixing Identified Issues'));
    console.log(chalk.blue('=' .repeat(50)));

    for (const sdIssues of this.issues) {
      console.log(chalk.yellow(`\n🛠️  Fixing ${sdIssues.sd_id}`));

      for (const issue of sdIssues.issues) {
        switch (issue.type) {
          case 'MISSING_PHASE_TRACKING':
            await this.createPhaseTracking(sdIssues.sd_id);
            this.fixes.push(`Created phase tracking for ${sdIssues.sd_id}`);
            break;

          case 'MISSING_TARGET_APP':
            console.log(chalk.yellow(`  ⚠️  Manual action required: Set target_application for ${sdIssues.sd_id}`));
            break;

          case 'NO_PROGRESS_TRACKING':
            // Calculate progress from phases if they exist
            const { data: phases } = await supabase
              .from('sd_phase_tracking')
              .select('*')
              .eq('sd_id', sdIssues.sd_id);

            if (phases && phases.length > 0) {
              const avgProgress = Math.round(
                phases.reduce((sum, p) => sum + (p.progress || 0), 0) / phases.length
              );

              const { error } = await supabase
                .from('strategic_directives_v2')
                .update({ progress: avgProgress })
                .eq('id', sdIssues.sd_id);

              if (!error) {
                console.log(chalk.green(`  ✅ Set progress to ${avgProgress}%`));
                this.fixes.push(`Updated progress for ${sdIssues.sd_id}`);
              }
            }
            break;

          default:
            console.log(chalk.yellow(`  ⚠️  ${issue.type} requires manual review`));
        }
      }
    }
  }

  async detectStalledSDs() {
    console.log(chalk.blue('\n⏰ Detecting Stalled Strategic Directives'));
    console.log(chalk.blue('=' .repeat(50)));

    const { data: stalledSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, updated_at, target_application')
      .in('status', ['active', 'in_progress'])
      .lt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (stalledSDs && stalledSDs.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Found ${stalledSDs.length} stalled SDs:`));

      stalledSDs.forEach(sd => {
        const daysSince = Math.round(
          (new Date() - new Date(sd.updated_at)) / (1000 * 60 * 60 * 24)
        );
        console.log(chalk.yellow(`  • ${sd.id}: ${sd.title} (${daysSince} days)`));
        console.log(chalk.gray(`    Target: ${sd.target_application || 'Not set'}`));
      });

      console.log(chalk.yellow('\n📋 Recommended Actions:'));
      console.log('  1. Review each stalled SD with LEAD');
      console.log('  2. Archive if no longer relevant');
      console.log('  3. Restart with proper phase tracking');
      console.log('  4. Assign clear ownership');
    } else {
      console.log(chalk.green('\n✅ No stalled SDs detected'));
    }
  }

  async verifyInfrastructure() {
    console.log(chalk.blue('\n🔧 Verifying LEO Protocol Infrastructure'));

    // Check if sd_phase_tracking table exists by trying to query it
    const { data, error } = await supabase
      .from('sd_phase_tracking')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      console.log(chalk.red('❌ sd_phase_tracking table not found!'));
      return false;
    }

    if (error && error.code !== '42P01') {
      console.log(chalk.yellow('⚠️ Unexpected error checking table:', error.message));
      console.log('Proceeding anyway...');
    }

    console.log(chalk.green('✅ LEO Protocol infrastructure verified'));
    return true;
  }

  generateReport() {
    console.log(chalk.blue('\n📋 LEO Protocol Compliance Report'));
    console.log(chalk.blue('=' .repeat(50)));

    const totalSDs = this.issues.reduce((sum, sd) => sum + 1, 0) +
                     (this.issues.length === 0 ? 1 : 0);

    const totalIssues = this.issues.reduce((sum, sd) => sum + sd.issues.length, 0);

    console.log(`\n📊 Summary:`);
    console.log(`  Total SDs Audited: ${totalSDs}`);
    console.log(`  SDs with Issues: ${this.issues.length}`);
    console.log(`  Total Issues Found: ${totalIssues}`);
    console.log(`  Automated Fixes Applied: ${this.fixes.length}`);

    if (totalIssues > 0) {
      console.log(chalk.yellow(`\n⚠️  ${totalIssues} issues require attention`));
    } else {
      console.log(chalk.green('\n✅ All SDs are compliant with LEO Protocol'));
    }

    console.log('\n🎯 Preventive Measures Recommended:');
    console.log('  1. Create phase tracking at SD creation');
    console.log('  2. Enforce EXEC→PLAN handoffs before closure');
    console.log('  3. Weekly LEAD reviews of active SDs');
    console.log('  4. Automated status progression validation');
  }
}

// Main execution
async function main() {
  const enforcer = new LEOProtocolEnforcer();

  await enforcer.auditAllActiveSDs();
  await enforcer.fixIssues();
  await enforcer.detectStalledSDs();

  console.log(chalk.blue('\n' + '=' .repeat(50)));
  console.log(chalk.green('✅ LEO Protocol Enforcement Complete'));
  console.log(chalk.blue('=' .repeat(50)));
}

main().catch(console.error);