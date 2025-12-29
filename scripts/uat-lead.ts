#!/usr/bin/env node

/**
 * UAT Lead Agent
 * Database writer, gate keeper, and UAT orchestrator
 * Consumes payloads from UAT Wizard and manages the UAT process
 */

import * as readline from 'readline';
import chalk from 'chalk';
import {
  startUATRun,
  upsertUATResult,
  createUATDefect,
  getRunStats,
  closeUATRun,
  getOpenDefects,
  exportRunResults
} from '../api/uat/handlers';

// Types
interface ParsedPayload {
  run_id: string;
  case_id: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NA';
  evidence?: {
    url?: string;
    heading?: string;
    toast?: string;
  };
  notes?: string;
}

class UATLead {
  private rl: readline.Interface;
  private activeRun?: string;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Start the UAT Lead agent
   */
  async start() {
    console.clear();
    console.log(chalk.blue.bold('👔 UAT Lead - Test Orchestrator'));
    console.log(chalk.gray('Database writer, gate keeper, defect creator\n'));

    // Check for active run or create new
    await this.initializeRun();

    // Start command loop
    await this.commandLoop();
  }

  /**
   * Initialize or resume UAT run
   */
  private async initializeRun() {
    const action = await this.ask('Action? (1=New run, 2=Resume run, 3=Process payload): ');

    switch (action) {
      case '1':
        await this.createNewRun();
        break;
      case '2':
        this.activeRun = await this.ask('Enter Run ID to resume: ');
        console.log(chalk.green(`✓ Resumed run: ${this.activeRun}\n`));
        break;
      case '3':
        await this.processPayloadMode();
        break;
      default:
        console.log(chalk.red('Invalid option'));
        await this.initializeRun();
    }
  }

  /**
   * Create a new UAT run
   */
  private async createNewRun() {
    console.log(chalk.cyan('\nCreating new UAT run...'));

    const env_url = await this.ask('Environment URL (e.g., http://localhost:5173): ');
    const app_version = await this.ask('App version (Enter=skip): ');
    const browser = await this.ask('Browser (Chrome/Firefox/Safari/Edge): ');
    const role = await this.ask('Test role (Admin/Manager/User/Guest): ');
    const notes = await this.ask('Notes (Enter=skip): ');

    const result = await startUATRun(
      env_url,
      app_version || undefined,
      browser || undefined,
      role || undefined,
      notes || undefined
    );

    if (result.error) {
      console.log(chalk.red(`Error: ${result.error}`));
      return;
    }

    this.activeRun = result.run_id;
    console.log(chalk.green(`\n✓ Created run: ${this.activeRun}`));
    console.log(chalk.yellow(`Export UAT_RUN_ID=${this.activeRun}\n`));
  }

  /**
   * Process payload mode - wait for payloads from Wizard
   */
  private async processPayloadMode() {
    console.log(chalk.cyan('\n📡 Listening for UAT payloads...'));
    console.log(chalk.gray('Paste [UAT-RESULT] payloads below:\n'));

    let buffer = '';

    // Set up line-by-line processing
    this.rl.on('line', async (line) => {
      buffer += line + '\n';

      // Check if we have a complete payload
      if (line.includes('[/UAT-RESULT]')) {
        await this.processPayload(buffer);
        buffer = '';
      }
    });
  }

  /**
   * Process a UAT result payload
   */
  private async processPayload(payload: string) {
    try {
      // Parse payload
      const parsed = this.parsePayload(payload);
      if (!parsed) {
        console.log(chalk.red('Invalid payload format'));
        return;
      }

      // Upsert result to database
      const result = await upsertUATResult({
        run_id: parsed.run_id,
        case_id: parsed.case_id,
        status: parsed.status,
        evidence_url: parsed.evidence?.url,
        evidence_heading: parsed.evidence?.heading,
        evidence_toast: parsed.evidence?.toast,
        notes: parsed.notes
      });

      if (result.error) {
        console.log(chalk.red(`Error: ${result.error}`));
        return;
      }

      // Log success with stats
      const stats = result.stats;
      if (stats) {
        const statusIcon = parsed.status === 'PASS' ? '✓' :
                          parsed.status === 'FAIL' ? '✗' :
                          parsed.status === 'BLOCKED' ? '⚠' : '○';

        const gateColor = stats.gate_status === 'GREEN' ? chalk.green :
                         stats.gate_status === 'YELLOW' ? chalk.yellow :
                         stats.gate_status === 'RED' ? chalk.red :
                         chalk.gray;

        console.log(
          chalk.white(`${statusIcon} ${parsed.case_id}: ${parsed.status}`) +
          chalk.gray(` | Run: ${stats.passed}/${stats.executed} (${stats.pass_rate}%) `) +
          gateColor(`[${stats.gate_status}]`)
        );

        // Auto-create defect for failures
        if (parsed.status === 'FAIL') {
          await this.autoCreateDefect(parsed);
        }
      }
    } catch (err) {
      console.log(chalk.red(`Processing error: ${err}`));
    }
  }

  /**
   * Parse UAT payload into structured data
   */
  private parsePayload(payload: string): ParsedPayload | null {
    if (!payload.includes('[UAT-RESULT]') || !payload.includes('[/UAT-RESULT]')) {
      return null;
    }

    const lines = payload.split('\n');
    const result: Record<string, unknown> & { evidence: Record<string, string> } = { evidence: {} };

    for (const line of lines) {
      if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');

        if (key.startsWith('evidence.')) {
          const evidenceKey = key.replace('evidence.', '');
          result.evidence[evidenceKey] = value;
        } else {
          result[key] = value;
        }
      }
    }

    // Validate required fields
    if (!result.run_id || !result.case_id || !result.status) {
      return null;
    }

    return {
      run_id: result.run_id as string,
      case_id: result.case_id as string,
      status: result.status as 'PASS' | 'FAIL' | 'BLOCKED' | 'NA',
      evidence: Object.keys(result.evidence).length > 0 ? result.evidence : undefined,
      notes: result.notes as string | undefined
    };
  }

  /**
   * Auto-create defect for failed test
   */
  private async autoCreateDefect(payload: ParsedPayload) {
    const severity = payload.case_id.includes('AUTH') ||
                    payload.case_id.includes('SEC') ? 'critical' : 'major';

    const result = await createUATDefect({
      run_id: payload.run_id,
      case_id: payload.case_id,
      severity: severity as 'critical' | 'major' | 'minor',
      summary: `${payload.case_id} failed: ${payload.notes || payload.evidence?.toast || 'See details'}`
    });

    if (result.defect_id) {
      console.log(chalk.yellow(`  → Created defect: ${result.defect_id}`));
    }
  }

  /**
   * Command loop for interactive mode
   */
  private async commandLoop() {
    console.log(chalk.cyan('\nAvailable commands:'));
    console.log('  status   - Show run statistics');
    console.log('  cases    - List remaining test cases');
    console.log('  defects  - Show open defects');
    console.log('  close    - End run and compute gate');
    console.log('  export   - Export results');
    console.log('  payload  - Process a payload');
    console.log('  quit     - Exit\n');

    const command = await this.ask('Lead> ');

    switch (command.toLowerCase()) {
      case 'status':
        await this.showStatus();
        break;
      case 'cases':
        await this.showRemainingCases();
        break;
      case 'defects':
        await this.showDefects();
        break;
      case 'close':
        await this.closeRun();
        break;
      case 'export':
        await this.exportResults();
        break;
      case 'payload':
        await this.processManualPayload();
        break;
      case 'quit':
      case 'exit':
        process.exit(0);
      default:
        console.log(chalk.red('Unknown command'));
    }

    // Continue loop
    await this.commandLoop();
  }

  /**
   * Show current run status
   */
  private async showStatus() {
    if (!this.activeRun) {
      console.log(chalk.red('No active run'));
      return;
    }

    const stats = await getRunStats(this.activeRun);
    if (!stats) {
      console.log(chalk.red('Could not fetch stats'));
      return;
    }

    console.log(chalk.cyan('\n=== Run Status ==='));
    console.log(`Run ID: ${stats.run_id}`);
    console.log(`Executed: ${stats.executed}`);
    console.log(`Passed: ${chalk.green(stats.passed.toString())}`);
    console.log(`Failed: ${chalk.red(stats.failed.toString())}`);
    console.log(`Blocked: ${chalk.yellow(stats.blocked.toString())}`);
    console.log(`Pass Rate: ${stats.pass_rate}%`);
    console.log(`Critical Defects: ${stats.open_criticals}`);
    console.log(`Gate Status: ${
      stats.gate_status === 'GREEN' ? chalk.green(stats.gate_status) :
      stats.gate_status === 'YELLOW' ? chalk.yellow(stats.gate_status) :
      stats.gate_status === 'RED' ? chalk.red(stats.gate_status) :
      chalk.gray(stats.gate_status)
    }`);
    console.log(`Rationale: ${stats.gate_rationale}\n`);
  }

  /**
   * Show remaining test cases
   */
  private async showRemainingCases() {
    // This would need to be implemented with a query
    console.log(chalk.cyan('\nRemaining cases by section:'));
    console.log(chalk.gray('(Feature to be implemented - query unexecuted cases)\n'));
  }

  /**
   * Show open defects
   */
  private async showDefects() {
    if (!this.activeRun) {
      console.log(chalk.red('No active run'));
      return;
    }

    const defects = await getOpenDefects(this.activeRun);

    console.log(chalk.cyan(`\n=== Open Defects (${defects.length}) ===`));

    if (defects.length === 0) {
      console.log(chalk.green('No open defects\n'));
      return;
    }

    // Group by severity
    const critical = defects.filter(d => d.severity === 'critical');
    const major = defects.filter(d => d.severity === 'major');
    const minor = defects.filter(d => d.severity === 'minor');

    if (critical.length > 0) {
      console.log(chalk.red(`\nCritical (${critical.length}):`));
      critical.forEach(d => {
        console.log(`  - ${d.case_id}: ${d.summary}`);
      });
    }

    if (major.length > 0) {
      console.log(chalk.yellow(`\nMajor (${major.length}):`));
      major.forEach(d => {
        console.log(`  - ${d.case_id}: ${d.summary}`);
      });
    }

    if (minor.length > 0) {
      console.log(chalk.gray(`\nMinor (${minor.length}):`));
      minor.forEach(d => {
        console.log(`  - ${d.case_id}: ${d.summary}`);
      });
    }

    console.log();
  }

  /**
   * Close the run and show final gate status
   */
  private async closeRun() {
    if (!this.activeRun) {
      console.log(chalk.red('No active run'));
      return;
    }

    const result = await closeUATRun(this.activeRun);

    if (!result.success) {
      console.log(chalk.red(`Error: ${result.error}`));
      return;
    }

    console.log(chalk.cyan('\n=== UAT Run Complete ==='));
    console.log(`Gate Status: ${
      result.gate_status === 'GREEN' ? chalk.green.bold('GREEN - GO') :
      result.gate_status === 'YELLOW' ? chalk.yellow.bold('YELLOW - GO WITH CONDITIONS') :
      chalk.red.bold('RED - NO-GO')
    }`);
    console.log(`Recommendation: ${result.recommendation}\n`);

    this.activeRun = undefined;
  }

  /**
   * Export results
   */
  private async exportResults() {
    if (!this.activeRun) {
      console.log(chalk.red('No active run'));
      return;
    }

    const format = await this.ask('Format? (json/csv): ');
    const results = await exportRunResults(
      this.activeRun,
      format as 'json' | 'csv'
    );

    const filename = `uat-results-${this.activeRun}.${format}`;
    const fs = await import('fs');
    fs.writeFileSync(filename, results);
    console.log(chalk.green(`✓ Exported to ${filename}\n`));
  }

  /**
   * Process manual payload entry
   */
  private async processManualPayload() {
    console.log(chalk.gray('Paste payload (end with blank line):\n'));

    let payload = '';
    let line = await this.ask('');

    while (line !== '') {
      payload += line + '\n';
      if (line.includes('[/UAT-RESULT]')) {
        break;
      }
      line = await this.ask('');
    }

    await this.processPayload(payload);
  }

  /**
   * Simple question prompt
   */
  private ask(question: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(chalk.white(question), answer => {
        resolve(answer.trim());
      });
    });
  }
}

// Run if executed directly
import { fileURLToPath } from 'url';
const __filename_uat = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename_uat) {
  const lead = new UATLead();
  lead.start().catch(console.error);
}

export { UATLead };