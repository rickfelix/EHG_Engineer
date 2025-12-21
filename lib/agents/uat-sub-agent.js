/**
 * UAT Sub-Agent
 * Interactive test execution agent for guiding users through UAT testing
 */

import IntelligentBaseSubAgent from './intelligent-base-sub-agent.js';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

// Initialize Supabase client from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables');
  console.error('   Check .env file in EHG_Engineer root directory');
}

const supabase = createClient(supabaseUrl, supabaseKey);

class UATSubAgent extends IntelligentBaseSubAgent {
  constructor() {
    super('UAT Test Executor', '🧪');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Test execution context
    this.context = {
      runId: null,
      caseId: null,
      testCase: null,
      startTime: null
    };

    // Test instructions database
    this.testInstructions = {
      'TEST-AUTH-001': {
        title: 'Login with valid credentials',
        steps: [
          '1. Navigate to http://localhost:5173/login',
          '2. Enter username: admin@test.com',
          '3. Enter password: Admin123!',
          '4. Click "Sign In" button',
          '5. Verify: Dashboard page loads',
          '6. Verify: User name appears in header'
        ],
        expectedResult: 'User successfully logs in and sees dashboard'
      },
      'TEST-AUTH-002': {
        title: 'Login with invalid credentials',
        steps: [
          '1. Navigate to http://localhost:5173/login',
          '2. Enter username: invalid@test.com',
          '3. Enter password: WrongPassword',
          '4. Click "Sign In" button',
          '5. Verify: Error message appears',
          '6. Verify: User remains on login page'
        ],
        expectedResult: 'Login fails with appropriate error message'
      },
      'TEST-DASH-001': {
        title: 'Dashboard initial load',
        steps: [
          '1. Ensure you are logged in',
          '2. Navigate to http://localhost:5173/dashboard',
          '3. Verify: Page loads without errors',
          '4. Verify: Key metrics are displayed',
          '5. Verify: Charts/graphs render properly',
          '6. Check browser console for errors (F12)'
        ],
        expectedResult: 'Dashboard loads with all components visible'
      },
      'TEST-VENT-001': {
        title: 'View ventures list',
        steps: [
          '1. Navigate to http://localhost:5173/ventures',
          '2. Verify: Ventures list loads',
          '3. Verify: Table headers are visible',
          '4. Verify: At least one venture is displayed',
          '5. Check: Pagination controls if many ventures'
        ],
        expectedResult: 'Ventures list displays correctly'
      },
      'TEST-VENT-004': {
        title: 'Create new venture',
        steps: [
          '1. Navigate to http://localhost:5173/ventures',
          '2. Click "New Venture" or "+" button',
          '3. Fill in required fields:',
          '   - Name: Test Venture ' + Date.now(),
          '   - Description: Test venture description',
          '   - Category: Select any',
          '4. Click "Create" or "Save" button',
          '5. Verify: Success message appears',
          '6. Verify: New venture appears in list'
        ],
        expectedResult: 'New venture created and visible in list'
      }
    };
  }

  /**
   * Get active test for a run
   */
  async getActiveTest(runId) {
    const { data, error } = await supabase
      .from('uat_runs')
      .select('active_case_id, active_case_started_at')
      .eq('id', runId)
      .single();

    if (error || !data?.active_case_id) {
      return null;
    }

    // Get the test case details
    const { data: testCase } = await supabase
      .from('uat_cases')
      .select('*')
      .eq('id', data.active_case_id)
      .single();

    return testCase;
  }

  /**
   * Set a test as active
   */
  async setActiveTest(runId, caseId) {
    const { error } = await supabase
      .rpc('set_active_test', {
        p_run_id: runId,
        p_case_id: caseId
      });

    if (error) {
      throw new Error(`Failed to set active test: ${error.message}`);
    }
  }

  /**
   * Execute a test interactively
   */
  async executeTest(runId, caseId = null) {
    try {
      console.clear();
      console.log(chalk.cyan.bold('🧪 UAT Test Executor'));
      console.log(chalk.gray('Interactive test guidance and result recording\n'));

      this.context.runId = runId;

      // If no case ID provided, get the active test
      if (!caseId) {
        const activeTest = await this.getActiveTest(runId);
        if (!activeTest) {
          console.log(chalk.yellow('No active test found.'));
          console.log('Please select a test from the UAT Dashboard first.\n');
          return;
        }
        caseId = activeTest.id;
      }

      // Get test case details
      const { data: testCase, error } = await supabase
        .from('uat_cases')
        .select('*')
        .eq('id', caseId)
        .single();

      if (error || !testCase) {
        console.log(chalk.red(`Test case ${caseId} not found.`));
        return;
      }

      this.context.caseId = caseId;
      this.context.testCase = testCase;
      this.context.startTime = new Date();

      // Display test information
      console.log(chalk.cyan('═'.repeat(60)));
      console.log(chalk.bold(`Test ID: ${testCase.id}`));
      console.log(chalk.white(`Title: ${testCase.title}`));
      console.log(chalk.gray(`Section: ${testCase.section}`));
      console.log(chalk.yellow(`Priority: ${testCase.priority?.toUpperCase()}`));
      console.log(chalk.cyan('═'.repeat(60) + '\n'));

      // Provide instructions
      await this.provideInstructions(testCase);

      // Guide through execution
      await this.guideExecution();

    } catch (error) {
      console.error(chalk.red('Error executing test:'), error.message);
    } finally {
      this.rl.close();
    }
  }

  /**
   * Provide test instructions
   */
  async provideInstructions(testCase) {
    const instructions = this.testInstructions[testCase.id];

    if (instructions) {
      console.log(chalk.yellow('📋 Test Steps:'));
      instructions.steps.forEach(step => {
        console.log(chalk.white(step));
      });
      console.log(chalk.green(`\n✓ Expected: ${instructions.expectedResult}\n`));
    } else {
      // Generic instructions
      console.log(chalk.yellow('📋 Test Steps:'));
      console.log(chalk.white('1. Navigate to the relevant page'));
      console.log(chalk.white(`2. Perform the action: ${testCase.title}`));
      console.log(chalk.white('3. Verify the expected behavior'));
      console.log(chalk.white('4. Check for any errors or issues\n'));
    }
  }

  /**
   * Guide user through test execution
   */
  async guideExecution() {
    // Ask if ready to begin
    const ready = await this.ask(chalk.cyan('Ready to begin testing? (y/n): '));
    if (ready.toLowerCase() !== 'y') {
      console.log(chalk.yellow('Test cancelled.'));
      return;
    }

    console.log(chalk.gray('\n🚀 Starting test execution...\n'));

    // Ask for test result
    console.log(chalk.yellow('After performing the test steps, select the result:'));
    console.log('  ' + chalk.green('P') + ' - PASS (test succeeded)');
    console.log('  ' + chalk.red('F') + ' - FAIL (test failed)');
    console.log('  ' + chalk.yellow('B') + ' - BLOCKED (cannot complete)');
    console.log('  ' + chalk.gray('N') + ' - N/A (not applicable)\n');

    const result = await this.ask(chalk.cyan('Test result (P/F/B/N): '));

    let status;
    switch (result.toUpperCase()) {
      case 'P': status = 'PASS'; break;
      case 'F': status = 'FAIL'; break;
      case 'B': status = 'BLOCKED'; break;
      case 'N': status = 'NA'; break;
      default:
        console.log(chalk.red('Invalid result. Please run the test again.'));
        return;
    }

    // Collect additional information for failures
    let notes = '';
    let evidenceUrl = '';

    if (status === 'FAIL' || status === 'BLOCKED') {
      console.log(chalk.yellow('\n📝 Please provide additional details:'));

      notes = await this.ask('What went wrong? (brief description): ');

      const hasScreenshot = await this.ask('Do you have a screenshot? (y/n): ');
      if (hasScreenshot.toLowerCase() === 'y') {
        evidenceUrl = await this.ask('Screenshot URL or path: ');
      }

      // Suggest potential fixes for failures
      if (status === 'FAIL') {
        await this.suggestFixes(notes);
      }
    } else if (status === 'PASS') {
      notes = await this.ask('Any notes? (optional, press Enter to skip): ') || 'Test passed successfully';
    }

    // Record the result
    await this.recordResult(status, notes, evidenceUrl);

    // Show summary
    await this.showSummary(status);

    // Ask about next test
    const continueTest = await this.ask(chalk.cyan('\nContinue with next test? (y/n): '));
    if (continueTest.toLowerCase() === 'y') {
      await this.findNextTest();
    }
  }

  /**
   * Record test result to database
   */
  async recordResult(status, notes, evidenceUrl) {
    try {
      console.log(chalk.gray('\n💾 Recording test result...'));

      const { error } = await supabase.rpc('complete_active_test', {
        p_run_id: this.context.runId,
        p_status: status,
        p_notes: notes || null,
        p_evidence_url: evidenceUrl || null
      });

      if (error) {
        throw error;
      }

      console.log(chalk.green('✅ Result recorded successfully!'));

      // Create defect for critical failures
      if (status === 'FAIL' && this.context.testCase.priority === 'critical') {
        await this.createDefect(notes);
      }

    } catch (error) {
      console.error(chalk.red('Failed to record result:'), error.message);
    }
  }

  /**
   * Create defect for failed test
   */
  async createDefect(notes) {
    const { error } = await supabase
      .from('uat_defects')
      .insert({
        run_id: this.context.runId,
        case_id: this.context.caseId,
        severity: this.context.testCase.priority === 'critical' ? 'critical' : 'major',
        summary: `${this.context.testCase.title} failed`,
        description: notes,
        created_at: new Date().toISOString()
      });

    if (!error) {
      console.log(chalk.yellow('🐛 Defect logged for tracking'));
    }
  }

  /**
   * Suggest fixes for common failures
   */
  async suggestFixes(failureNotes) {
    const lowerNotes = failureNotes.toLowerCase();

    console.log(chalk.yellow('\n💡 Potential fixes:'));

    if (lowerNotes.includes('404') || lowerNotes.includes('not found')) {
      console.log('  • Check if the route is properly configured');
      console.log('  • Verify the URL is correct');
      console.log('  • Ensure the server is running');
    } else if (lowerNotes.includes('login') || lowerNotes.includes('auth')) {
      console.log('  • Check authentication configuration');
      console.log('  • Verify credentials are correct');
      console.log('  • Check session/token handling');
    } else if (lowerNotes.includes('timeout') || lowerNotes.includes('slow')) {
      console.log('  • Check network connectivity');
      console.log('  • Verify API endpoints are responding');
      console.log('  • Look for performance bottlenecks');
    } else if (lowerNotes.includes('error') || lowerNotes.includes('crash')) {
      console.log('  • Check browser console for errors (F12)');
      console.log('  • Review server logs');
      console.log('  • Check for missing dependencies');
    }

    console.log('');
  }

  /**
   * Show test execution summary
   */
  async showSummary(status) {
    const duration = Math.round((new Date() - this.context.startTime) / 1000);

    console.log(chalk.cyan('\n' + '═'.repeat(60)));
    console.log(chalk.bold('Test Execution Summary'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log(`Test: ${this.context.testCase.id}`);
    console.log(`Result: ${status === 'PASS' ? chalk.green(status) :
                          status === 'FAIL' ? chalk.red(status) :
                          chalk.yellow(status)}`);
    console.log(`Duration: ${duration} seconds`);
    console.log(chalk.cyan('═'.repeat(60)));
  }

  /**
   * Find next untested test
   */
  async findNextTest() {
    const { data: nextTest } = await supabase
      .from('uat_cases')
      .select('id, title')
      .not('id', 'in', `(
        SELECT case_id FROM uat_results
        WHERE run_id = '${this.context.runId}'
        AND status IS NOT NULL
      )`)
      .order('priority', { ascending: false })
      .order('section')
      .limit(1)
      .single();

    if (nextTest) {
      console.log(chalk.green(`\n📋 Next test: ${nextTest.id} - ${nextTest.title}`));

      // Set it as active
      await this.setActiveTest(this.context.runId, nextTest.id);

      // Execute it
      await this.executeTest(this.context.runId, nextTest.id);
    } else {
      console.log(chalk.green('\n🎉 All tests completed!'));

      // Show final stats
      const { data: stats } = await supabase
        .from('v_uat_run_stats')
        .select('*')
        .eq('run_id', this.context.runId)
        .single();

      if (stats) {
        console.log(chalk.cyan('\nFinal Results:'));
        console.log(`  ✅ Passed: ${stats.passed}`);
        console.log(`  ❌ Failed: ${stats.failed}`);
        console.log(`  ⚠️ Blocked: ${stats.blocked}`);
        console.log(`  📊 Pass Rate: ${stats.pass_rate}%`);
        console.log(`  🚦 Gate Status: ${stats.gate_status}`);
      }
    }
  }

  /**
   * Simple question prompt
   */
  ask(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        resolve(answer.trim());
      });
    });
  }
}

export default UATSubAgent;