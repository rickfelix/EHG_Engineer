#!/usr/bin/env node

/**
 * LEO Protocol Context Monitor
 * Tracks token usage and provides warnings for context management
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


class ContextMonitor {
  constructor() {
    this.config = {
      totalTokens: 200000,
      safetyMargin: 20000,
      usableTokens: 180000,
      warningThreshold: 0.7,  // 70%
      criticalThreshold: 0.9, // 90%
      
      allocation: {
        systemPrompt: 5000,
        claudeMdFiles: 10000,
        currentSd: 5000,
        currentPrd: 10000,
        codeContext: 50000,
        conversation: 100000
      }
    };
    
    this.stateFile = path.join(__dirname, '..', '.leo-context-state.json');
  }

  /**
   * Estimate token count for text (rough approximation)
   * Generally 1 token ≈ 4 characters or 0.75 words
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Load current context state
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading context state:', error);
    }
    
    return {
      currentUsage: {},
      lastCheck: new Date().toISOString(),
      warnings: []
    };
  }

  /**
   * Save context state
   */
  saveState(state) {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Error saving context state:', error);
    }
  }

  /**
   * Check specific file/directory for token usage
   */
  checkPath(filepath) {
    let tokens = 0;
    
    try {
      const stats = fs.statSync(filepath);
      
      if (stats.isDirectory()) {
        const files = fs.readdirSync(filepath);
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.txt')) {
            const content = fs.readFileSync(path.join(filepath, file), 'utf8');
            tokens += this.estimateTokens(content);
          }
        }
      } else {
        const content = fs.readFileSync(filepath, 'utf8');
        tokens += this.estimateTokens(content);
      }
    } catch (_error) {
      // File doesn't exist or can't be read
    }
    
    return tokens;
  }

  /**
   * Calculate current context usage
   */
  calculateUsage() {
    const usage = {
      systemPrompt: this.config.allocation.systemPrompt, // Fixed estimate
      claudeMdFiles: 0,
      currentSd: 0,
      currentPrd: 0,
      codeContext: 0,
      conversation: 0
    };
    
    // Check CLAUDE.md files
    const claudePaths = [
      path.join(process.cwd(), 'CLAUDE.md'),
      path.join(process.cwd(), 'CLAUDE.local.md'),
      path.join(process.env.HOME || '', '.claude', 'CLAUDE.md')
    ];
    
    for (const claudePath of claudePaths) {
      usage.claudeMdFiles += this.checkPath(claudePath);
    }
    
    // Check current SD and PRD
    usage.currentSd = this.checkPath(path.join(process.cwd(), 'docs', 'strategic-directives'));
    usage.currentPrd = this.checkPath(path.join(process.cwd(), 'docs', 'prds'));
    
    // Estimate code context (check recently modified files)
    const srcPath = path.join(process.cwd(), 'src');
    if (fs.existsSync(srcPath)) {
      usage.codeContext = Math.min(this.checkPath(srcPath), this.config.allocation.codeContext);
    }
    
    // Calculate total
    const total = Object.values(usage).reduce((sum, val) => sum + val, 0);
    const percentage = (total / this.config.usableTokens) * 100;
    
    return {
      usage,
      total,
      percentage,
      remaining: this.config.usableTokens - total
    };
  }

  /**
   * Generate status report
   */
  getStatus() {
    const result = this.calculateUsage();
    const state = this.loadState();
    
    let status = 'NORMAL';
    let action = 'Continue normally';
    
    if (result.percentage >= this.config.criticalThreshold * 100) {
      status = 'CRITICAL';
      action = 'IMMEDIATE: Run /compact or archive to files';
    } else if (result.percentage >= this.config.warningThreshold * 100) {
      status = 'WARNING';
      action = 'RECOMMENDED: Run /compact focus: "[current work]"';
    }
    
    // Update state
    state.currentUsage = result.usage;
    state.lastCheck = new Date().toISOString();
    state.status = status;
    
    // Add warning if needed
    if (status !== 'NORMAL' && !state.warnings.find(w => w.status === status)) {
      state.warnings.push({
        status,
        percentage: result.percentage,
        timestamp: new Date().toISOString()
      });
    }
    
    this.saveState(state);
    
    return {
      status,
      action,
      ...result
    };
  }

  /**
   * Display formatted report
   */
  displayReport() {
    const report = this.getStatus();
    
    console.log('\n' + '='.repeat(60));
    console.log('LEO PROTOCOL CONTEXT MONITOR');
    console.log('='.repeat(60));
    
    // Status indicator
    const statusColors = {
      NORMAL: '\x1b[32m',   // Green
      WARNING: '\x1b[33m',  // Yellow
      CRITICAL: '\x1b[31m'  // Red
    };
    const reset = '\x1b[0m';
    
    console.log(`\nStatus: ${statusColors[report.status]}${report.status}${reset}`);
    console.log(`Action: ${report.action}`);
    
    // Usage bar
    const barLength = 40;
    const filledLength = Math.round((report.percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    console.log(`\nContext Usage: [${bar}] ${report.percentage.toFixed(1)}%`);
    console.log(`Tokens Used: ${report.total.toLocaleString()} / ${this.config.usableTokens.toLocaleString()}`);
    console.log(`Remaining: ${report.remaining.toLocaleString()} tokens`);
    
    // Breakdown
    console.log('\nBreakdown:');
    console.log('-'.repeat(40));
    for (const [category, tokens] of Object.entries(report.usage)) {
      const catName = category.replace(/([A-Z])/g, ' $1').trim();
      const percentage = ((tokens / this.config.usableTokens) * 100).toFixed(1);
      console.log(`  ${catName.padEnd(20)} ${tokens.toLocaleString().padStart(8)} tokens (${percentage}%)`);
    }
    
    // Recommendations
    console.log('\n' + '='.repeat(60));
    if (report.status === 'CRITICAL') {
      console.log('⚠️  CRITICAL ACTION REQUIRED:');
      console.log('1. Run: /compact focus: "current task and blockers"');
      console.log('2. Archive completed work to files');
      console.log('3. Consider handoff to next agent');
    } else if (report.status === 'WARNING') {
      console.log('⚠️  RECOMMENDATIONS:');
      console.log('1. Consider running /compact soon');
      console.log('2. Archive verbose content to files');
      console.log('3. Prepare for handoff');
    } else {
      console.log('✅ Context usage is healthy');
      console.log('Continue with current workflow');
    }
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Monitor continuously
   */
  startMonitoring(interval = 300000) { // 5 minutes default
    console.log('Starting context monitoring...');
    this.displayReport();
    
    setInterval(() => {
      const report = this.getStatus();
      if (report.status !== 'NORMAL') {
        console.log(`\n⚠️  Context Alert: ${report.status} - ${report.percentage.toFixed(1)}% used`);
        console.log(`Action: ${report.action}`);
      }
    }, interval);
  }

  /**
   * Generate handoff summary
   */
  generateHandoffSummary(agentType) {
    const templates = {
      LEAD: {
        preserve: ['Strategic objectives', 'Success criteria', 'Constraints'],
        archive: ['Research notes', 'Brainstorming', 'Alternatives considered']
      },
      PLAN: {
        preserve: ['PRD requirements', 'Technical specs', 'Architecture decisions'],
        archive: ['Planning discussions', 'Technology evaluation', 'Risk analysis details']
      },
      EXEC: {
        preserve: ['Implementation status', 'Blockers', 'Test results'],
        archive: ['Code attempts', 'Debug logs', 'Resolved issues']
      }
    };
    
    const template = templates[agentType] || templates.EXEC;
    
    console.log('\n' + '='.repeat(60));
    console.log(`HANDOFF SUMMARY TEMPLATE - ${agentType} AGENT`);
    console.log('='.repeat(60));
    console.log('\nItems to PRESERVE in context:');
    template.preserve.forEach(item => console.log(`  ✓ ${item}`));
    
    console.log('\nItems to ARCHIVE to files:');
    template.archive.forEach(item => console.log(`  📁 ${item}`));
    
    console.log('\nSuggested summary format (500 tokens max):');
    console.log('```');
    console.log(`${agentType} Handoff Summary`);
    console.log('Completed:');
    console.log('  - [Key achievement 1]');
    console.log('  - [Key achievement 2]');
    console.log('Current State:');
    console.log('  - [Status]');
    console.log('Next Steps:');
    console.log('  - [Action 1]');
    console.log('  - [Action 2]');
    console.log('Files:');
    console.log('  - [Reference to detailed work]');
    console.log('```');
    console.log('='.repeat(60) + '\n');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const monitor = new ContextMonitor();
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'check':
      monitor.displayReport();
      break;
      
    case 'monitor':
      const interval = args[1] ? parseInt(args[1]) * 1000 : 300000;
      monitor.startMonitoring(interval);
      break;
      
    case 'handoff':
      const agentType = args[1] || 'EXEC';
      monitor.generateHandoffSummary(agentType.toUpperCase());
      break;
      
    default:
      console.log('LEO Protocol Context Monitor');
      console.log('\nUsage:');
      console.log('  node context-monitor.js check           - Check current context usage');
      console.log('  node context-monitor.js monitor [secs]  - Monitor continuously');
      console.log('  node context-monitor.js handoff [agent] - Generate handoff summary');
      console.log('\nExamples:');
      console.log('  node context-monitor.js check');
      console.log('  node context-monitor.js monitor 60      - Check every 60 seconds');
      console.log('  node context-monitor.js handoff LEAD    - Handoff summary for LEAD agent');
  }
}

export default ContextMonitor;