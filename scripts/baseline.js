#!/usr/bin/env node

/**
 * Baseline Issues Management CLI
 *
 * Purpose: Manage baseline issues that track pre-existing codebase problems
 * Owner: LEAD role
 *
 * Commands:
 *   list     - Show all open baseline issues
 *   assign   - Assign ownership to an SD
 *   resolve  - Mark issue as resolved
 *   summary  - Show category summary from baseline_summary view
 *   add      - Manually add a baseline issue
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

class BaselineManager {
  constructor() {
    this.command = process.argv[2] || 'help';
    this.args = process.argv.slice(3);
    this.supabase = null;
  }

  async run() {
    try {
      this.supabase = await createSupabaseServiceClient('engineer');

      switch (this.command) {
        case 'list':
          await this.listIssues();
          break;
        case 'assign':
          await this.assignIssue(this.args[0], this.args[1]);
          break;
        case 'resolve':
          await this.resolveIssue(this.args[0]);
          break;
        case 'summary':
          await this.showSummary();
          break;
        case 'add':
          await this.addIssue();
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }

  async listIssues() {
    console.log(`\n${colors.cyan}${colors.bold}BASELINE ISSUES - OPEN${colors.reset}\n`);

    const { data: issues, error } = await this.supabase
      .from('sd_baseline_issues')
      .select('*')
      .in('status', ['open', 'acknowledged', 'in_progress'])
      .order('severity', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch issues: ${error.message}`);
    }

    if (!issues || issues.length === 0) {
      console.log(`${colors.green}No open baseline issues found!${colors.reset}\n`);
      return;
    }

    // Group by severity
    const bySeverity = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    issues.forEach(issue => {
      if (bySeverity[issue.severity]) {
        bySeverity[issue.severity].push(issue);
      }
    });

    // Display by severity
    for (const [severity, severityIssues] of Object.entries(bySeverity)) {
      if (severityIssues.length === 0) continue;

      const severityColor = severity === 'critical' ? colors.red :
                           severity === 'high' ? colors.yellow :
                           severity === 'medium' ? colors.blue : colors.dim;

      console.log(`${severityColor}${colors.bold}${severity.toUpperCase()} (${severityIssues.length})${colors.reset}`);

      for (const issue of severityIssues) {
        const statusIcon = issue.status === 'in_progress' ? '🔧' :
                          issue.status === 'acknowledged' ? '👀' : '📋';

        const age = Math.floor((Date.now() - new Date(issue.created_at)) / (1000 * 60 * 60 * 24));
        const ageStr = age > 30 ? `${colors.red}${age}d${colors.reset}` :
                       age > 14 ? `${colors.yellow}${age}d${colors.reset}` :
                       `${colors.dim}${age}d${colors.reset}`;

        console.log(`  ${statusIcon} ${colors.bold}${issue.issue_key}${colors.reset} [${issue.sub_agent_code}] - ${ageStr}`);
        console.log(`     ${issue.description.substring(0, 80)}${issue.description.length > 80 ? '...' : ''}`);

        if (issue.file_path) {
          console.log(`     ${colors.dim}${issue.file_path}${issue.line_number ? `:${issue.line_number}` : ''}${colors.reset}`);
        }

        if (issue.owner_sd_id) {
          console.log(`     ${colors.cyan}Owner: ${issue.owner_sd_id}${colors.reset}`);
        } else {
          console.log(`     ${colors.yellow}⚠ No owner assigned${colors.reset}`);
        }

        console.log();
      }
    }

    // Summary stats
    const total = issues.length;
    const unassigned = issues.filter(i => !i.owner_sd_id).length;
    const stale = issues.filter(i => {
      const age = (Date.now() - new Date(i.created_at)) / (1000 * 60 * 60 * 24);
      return age > 30;
    }).length;

    console.log(`${colors.dim}Total: ${total} issues | Unassigned: ${unassigned} | Stale (>30d): ${stale}${colors.reset}\n`);
  }

  async assignIssue(issueKey, sdId) {
    if (!issueKey || !sdId) {
      console.log(`${colors.red}Usage: npm run baseline:assign <issue-key> <SD-ID>${colors.reset}`);
      console.log(`${colors.dim}Example: npm run baseline:assign BL-SEC-001 SD-HARDENING-V2-001C${colors.reset}\n`);
      return;
    }

    console.log(`\n${colors.cyan}Assigning ${colors.bold}${issueKey}${colors.reset}${colors.cyan} to ${colors.bold}${sdId}${colors.reset}\n`);

    // Verify SD exists
    const { data: sd, error: sdError } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title')
      .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
      .single();

    if (sdError || !sd) {
      console.log(`${colors.red}Error: SD "${sdId}" not found${colors.reset}\n`);
      return;
    }

    // Update issue
    const { data: updated, error } = await this.supabase
      .from('sd_baseline_issues')
      .update({
        owner_sd_id: sd.id,
        status: 'acknowledged',
        updated_at: new Date().toISOString()
      })
      .eq('issue_key', issueKey)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to assign issue: ${error.message}`);
    }

    console.log(`${colors.green}✓ Issue assigned successfully${colors.reset}`);
    console.log(`  Issue: ${updated.issue_key}`);
    console.log(`  Owner: ${sd.legacy_id || sd.id} - ${sd.title}`);
    console.log(`  Status: ${updated.status}`);
    console.log();
  }

  async resolveIssue(issueKey) {
    if (!issueKey) {
      console.log(`${colors.red}Usage: npm run baseline:resolve <issue-key>${colors.reset}`);
      console.log(`${colors.dim}Example: npm run baseline:resolve BL-SEC-001${colors.reset}\n`);
      return;
    }

    console.log(`\n${colors.cyan}Resolving ${colors.bold}${issueKey}${colors.reset}\n`);

    const { data: updated, error } = await this.supabase
      .from('sd_baseline_issues')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('issue_key', issueKey)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to resolve issue: ${error.message}`);
    }

    console.log(`${colors.green}✓ Issue resolved successfully${colors.reset}`);
    console.log(`  Issue: ${updated.issue_key}`);
    console.log(`  Category: ${updated.category}`);
    console.log(`  Description: ${updated.description.substring(0, 80)}${updated.description.length > 80 ? '...' : ''}`);
    console.log();
  }

  async showSummary() {
    console.log(`\n${colors.cyan}${colors.bold}BASELINE ISSUES - CATEGORY SUMMARY${colors.reset}\n`);

    const { data: summary, error } = await this.supabase
      .from('baseline_summary')
      .select('*')
      .order('open_count', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch summary: ${error.message}`);
    }

    if (!summary || summary.length === 0) {
      console.log(`${colors.green}No baseline issues found!${colors.reset}\n`);
      return;
    }

    // Table header
    console.log(`${colors.bold}Category          Agent      Open  Ack  InProg  Critical  Resolved  WontFix  Stale${colors.reset}`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────────${colors.reset}`);

    let totalOpen = 0;
    let totalCritical = 0;
    let totalStale = 0;

    for (const row of summary) {
      const category = row.category.padEnd(16, ' ');
      const agent = row.sub_agent_code.padEnd(10, ' ');
      const open = String(row.open_count || 0).padStart(4, ' ');
      const ack = String(row.acknowledged_count || 0).padStart(3, ' ');
      const inProg = String(row.in_progress_count || 0).padStart(6, ' ');
      const critical = String(row.critical_count || 0).padStart(8, ' ');
      const resolved = String(row.resolved_count || 0).padStart(8, ' ');
      const wontFix = String(row.wont_fix_count || 0).padStart(7, ' ');
      const stale = String(row.stale_count || 0).padStart(5, ' ');

      const criticalColor = row.critical_count > 0 ? colors.red : colors.reset;
      const staleColor = row.stale_count > 0 ? colors.yellow : colors.reset;

      console.log(`${category} ${agent} ${open} ${ack} ${inProg} ${criticalColor}${critical}${colors.reset} ${resolved} ${wontFix} ${staleColor}${stale}${colors.reset}`);

      totalOpen += row.open_count || 0;
      totalCritical += row.critical_count || 0;
      totalStale += row.stale_count || 0;
    }

    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.bold}TOTALS:${colors.reset}                 ${String(totalOpen).padStart(4)} open, ${totalCritical > 0 ? colors.red : ''}${totalCritical} critical${colors.reset}, ${totalStale > 0 ? colors.yellow : ''}${totalStale} stale${colors.reset}\n`);

    // Oldest open issue
    const oldest = summary.find(s => s.oldest_open_issue);
    if (oldest?.oldest_open_issue) {
      const age = Math.floor((Date.now() - new Date(oldest.oldest_open_issue)) / (1000 * 60 * 60 * 24));
      console.log(`${colors.dim}Oldest open issue: ${age} days ago${colors.reset}\n`);
    }
  }

  async addIssue() {
    const category = this.args[0];
    const filePath = this.args[1];
    const description = this.args[2];

    // Parse --severity flag
    let severity = 'medium'; // default
    const severityArg = this.args.find(arg => arg.startsWith('--severity='));
    if (severityArg) {
      severity = severityArg.split('=')[1];
    }

    if (!category || !description) {
      console.log(`${colors.red}Usage: npm run baseline:add <category> <file-path> <description> --severity=<level>${colors.reset}`);
      console.log(`${colors.dim}Categories: security, testing, performance, database, documentation, accessibility, code_quality, dependency, infrastructure${colors.reset}`);
      console.log(`${colors.dim}Severity: critical, high, medium, low${colors.reset}`);
      console.log(`${colors.dim}Example: npm run baseline:add security src/auth.js "Hardcoded credentials" --severity=critical${colors.reset}\n`);
      return;
    }

    // Validate category
    const validCategories = ['security', 'testing', 'performance', 'database', 'documentation', 'accessibility', 'code_quality', 'dependency', 'infrastructure'];
    if (!validCategories.includes(category)) {
      console.log(`${colors.red}Invalid category: ${category}${colors.reset}`);
      console.log(`${colors.dim}Valid categories: ${validCategories.join(', ')}${colors.reset}\n`);
      return;
    }

    // Validate severity
    const validSeverities = ['critical', 'high', 'medium', 'low'];
    if (!validSeverities.includes(severity)) {
      console.log(`${colors.red}Invalid severity: ${severity}${colors.reset}`);
      console.log(`${colors.dim}Valid severities: ${validSeverities.join(', ')}${colors.reset}\n`);
      return;
    }

    console.log(`\n${colors.cyan}Adding baseline issue...${colors.reset}\n`);

    // Generate issue key
    const { data: keyData, error: keyError } = await this.supabase
      .rpc('generate_baseline_issue_key', { p_category: category });

    if (keyError) {
      throw new Error(`Failed to generate issue key: ${keyError.message}`);
    }

    const issueKey = keyData;

    // Map category to sub-agent code
    const subAgentMap = {
      security: 'SECURITY',
      testing: 'TESTING',
      performance: 'PERFORMANCE',
      database: 'DATABASE',
      documentation: 'DOCMON',
      accessibility: 'DESIGN',
      code_quality: 'CODE_QUALITY',
      dependency: 'DEPENDENCY',
      infrastructure: 'INFRASTRUCTURE'
    };

    const subAgentCode = subAgentMap[category];

    // Insert issue
    const { data: issue, error } = await this.supabase
      .from('sd_baseline_issues')
      .insert({
        issue_key: issueKey,
        category,
        sub_agent_code: subAgentCode,
        severity,
        file_path: filePath || null,
        description,
        discovered_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        status: 'open'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add issue: ${error.message}`);
    }

    console.log(`${colors.green}✓ Baseline issue added successfully${colors.reset}`);
    console.log(`  Issue Key: ${colors.bold}${issue.issue_key}${colors.reset}`);
    console.log(`  Category: ${issue.category} (${issue.sub_agent_code})`);
    console.log(`  Severity: ${issue.severity}`);
    console.log(`  File: ${issue.file_path || 'N/A'}`);
    console.log(`  Description: ${issue.description}`);
    console.log();
  }

  showHelp() {
    console.log(`
${colors.bold}Baseline Issues Management${colors.reset}

${colors.cyan}Commands:${colors.reset}
  list      Show all open baseline issues
  assign    Assign ownership to an SD
  resolve   Mark issue as resolved
  summary   Show category summary from baseline_summary view
  add       Manually add a baseline issue

${colors.cyan}Usage:${colors.reset}
  npm run baseline:list
  npm run baseline:assign <issue-key> <SD-ID>
  npm run baseline:resolve <issue-key>
  npm run baseline:summary
  npm run baseline:add <category> <file-path> <description> --severity=<level>

${colors.cyan}Examples:${colors.reset}
  npm run baseline:list
  npm run baseline:assign BL-SEC-001 SD-HARDENING-V2-001C
  npm run baseline:resolve BL-SEC-001
  npm run baseline:summary
  npm run baseline:add security src/auth.js "Hardcoded credentials" --severity=critical

${colors.cyan}Notes:${colors.reset}
  - Issue keys are auto-generated (BL-{CAT}-{NNN})
  - Critical issues >30 days block LEAD gate
  - Use 'summary' for dashboard view
  - Use 'list' for detailed issue view
`);
  }
}

const manager = new BaselineManager();
manager.run().catch(err => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
  process.exit(1);
});
