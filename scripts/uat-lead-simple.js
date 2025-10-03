#!/usr/bin/env node

/**
 * UAT Lead Agent - Simplified JavaScript Version
 * Creates test runs and manages UAT process
 */

import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

class UATLead {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║             UAT LEAD - Test Run Manager               ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log('Welcome to UAT Lead! I help manage test runs.\n');

    const action = await this.prompt(
      'What would you like to do?\n' +
      '  1) Create new test run\n' +
      '  2) View active runs\n' +
      '  3) Export results\n' +
      '  4) Exit\n\n' +
      'Choice (1-4): '
    );

    switch (action) {
      case '1':
        await this.createRun();
        break;
      case '2':
        await this.viewRuns();
        break;
      case '3':
        await this.exportResults();
        break;
      default:
        process.exit(0);
    }
  }

  async createRun() {
    console.log('\n📝 Creating New UAT Test Run\n');

    const envUrl = await this.prompt('Environment URL (default: http://localhost:5173): ') || 'http://localhost:5173';
    const browser = await this.prompt('Browser (Chrome/Firefox/Safari/Edge): ') || 'Chrome';
    const role = await this.prompt('Tester role (Admin/Manager/User/Guest): ') || 'Admin';
    const notes = await this.prompt('Notes (optional): ');

    console.log('\n⏳ Creating test run...');

    const { data: run, error } = await supabase
      .from('uat_runs')
      .insert({
        app: 'EHG',
        env_url: envUrl,
        app_version: '1.0.0',
        browser,
        role,
        notes,
        started_at: new Date().toISOString(),
        created_by: 'UAT_LEAD'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating run:', error.message);
      process.exit(1);
    }

    console.log('\n✅ Test run created successfully!\n');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║                    RUN DETAILS                        ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`  Run ID:      ${run.id}`);
    console.log(`  Environment: ${run.env_url}`);
    console.log(`  Browser:     ${run.browser}`);
    console.log(`  Role:        ${run.role}`);
    console.log(`  Started:     ${new Date(run.started_at).toLocaleString()}`);
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Copy the Run ID above');
    console.log('2. Open a new terminal');
    console.log('3. Set the environment variable:');
    console.log(`   export UAT_RUN_ID=${run.id}`);
    console.log('4. Start the UAT Wizard:');
    console.log('   node scripts/uat-wizard-simple.js');
    console.log('\n5. Monitor progress at: http://localhost:3000/uat-dashboard\n');

    const continueChoice = await this.prompt('Press Enter to exit or "m" for main menu: ');
    if (continueChoice.toLowerCase() === 'm') {
      await this.start();
    } else {
      process.exit(0);
    }
  }

  async viewRuns() {
    console.log('\n📊 Fetching active runs...\n');

    const { data: runs, error } = await supabase
      .from('uat_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('❌ Error fetching runs:', error.message);
      return;
    }

    if (!runs || runs.length === 0) {
      console.log('No test runs found.\n');
    } else {
      console.log('Recent Test Runs:\n');
      runs.forEach((run, index) => {
        const status = run.ended_at ? '✅ Complete' : '🔄 Active';
        console.log(`${index + 1}. ${status} - ${run.id.slice(0, 8)}...`);
        console.log(`   Environment: ${run.env_url}`);
        console.log(`   Started: ${new Date(run.started_at).toLocaleString()}`);
        console.log('');
      });
    }

    await this.prompt('\nPress Enter to continue...');
    await this.start();
  }

  async exportResults() {
    const runId = await this.prompt('\nEnter Run ID to export: ');

    if (!runId) {
      console.log('Run ID required');
      return this.start();
    }

    console.log('\n📥 Exporting results...');

    const { data: results, error } = await supabase
      .from('uat_results')
      .select(`
        *,
        uat_cases (id, section, title, priority)
      `)
      .eq('run_id', runId);

    if (error) {
      console.error('❌ Error:', error.message);
      return this.start();
    }

    console.log(`\n✅ Exported ${results.length} test results`);
    console.log('Results can be viewed in the dashboard\n');

    await this.prompt('Press Enter to continue...');
    await this.start();
  }

  prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => resolve(answer));
    });
  }
}

// Start the UAT Lead
const lead = new UATLead();
lead.start();