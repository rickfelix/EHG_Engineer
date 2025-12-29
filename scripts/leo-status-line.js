#!/usr/bin/env node

/**
 * LEO Protocol Status Line Manager
 * Manages Claude status line to display contextual LEO Protocol information
 * Designed for minimal performance impact
 */

import fs from 'fs';
import path from 'path';
import { execSync  } from 'child_process';

class LEOStatusLine {
  constructor() {
    this.configPath = path.join(process.cwd(), '.leo-status.json');
    this.claudeConfigPath = path.join(process.cwd(), '.claude-code-config.json');
    this.statusCache = null;
    this.cacheTimeout = 5000; // 5 seconds cache
    this.lastUpdate = 0;
    
    // Status line templates (enhanced with project and branch info)
    this.templates = {
      default: '🏗️ {project} | {branch} | LEO v3.1.5.9',
      lead: '👑 LEAD | {project} | {branch} | {sd} | {phase}',
      plan: '📋 PLAN | {project} | {branch} | {sd} | Task: {task}',
      exec: '⚙️ EXEC | {project} | {branch} | {sd} | {task} | {status}',
      handoff: '🤝 Handoff: {from} → {to} | {project} | {artifact}',
      visionQA: '👁️ Vision QA | {project} | {appId} | {testGoal}',
      validation: '✅ Validation | {project} | {type} | Score: {score}',
      minimal: '📍 {project} | {branch} | {context}',
      debug: '🔍 Debug Mode | {project} | {info}'
    };
    
    // Load or initialize status
    this.loadStatus();
  }

  /**
   * Load current status from cache
   */
  loadStatus() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.statusCache = JSON.parse(data);
      } else {
        this.statusCache = this.getDefaultStatus();
      }
    } catch (_error) {
      this.statusCache = this.getDefaultStatus();
    }
  }

  /**
   * Save status to cache
   */
  saveStatus() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.statusCache, null, 2));
    } catch (_error) {
      // Silent fail - status line should not break workflow
    }
  }

  /**
   * Get default status
   */
  getDefaultStatus() {
    return {
      project: 'EHG_Engineer',
      leoVersion: '3.1.5.9',
      activeRole: null,
      currentSD: null,
      currentTask: null,
      phase: null,
      lastHandoff: null,
      visionQA: null,
      performance: {
        enabled: true,
        updateInterval: 5000
      }
    };
  }

  /**
   * Detect context from current files and git
   */
  async detectContext() {
    const context = { ...this.statusCache };
    
    try {
      // Detect current git branch
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      
      // Parse SD from branch name (e.g., feature/SD-001-implementation)
      const sdMatch = branch.match(/SD-(\d{3,4}[A-Z]?)/);
      if (sdMatch) {
        context.currentSD = sdMatch[0];
      }
      
      // Detect if in task branch (e.g., task/EES-001)
      const taskMatch = branch.match(/EES-(\d{3,4}[A-Z]?)/);
      if (taskMatch) {
        context.currentTask = taskMatch[0];
      }
      
      // Check for recent file modifications to infer activity
      const recentFiles = execSync('git diff --name-only HEAD~1 2>/dev/null || git diff --name-only', { encoding: 'utf8' })
        .split('\n')
        .filter(f => f);
      
      // Infer role from file patterns
      if (recentFiles.some(f => f.includes('strategic-directives') || f.includes('SD-'))) {
        context.activeRole = 'LEAD';
      } else if (recentFiles.some(f => f.includes('task-') || f.includes('decomposition'))) {
        context.activeRole = 'PLAN';
      } else if (recentFiles.some(f => f.includes('.tsx') || f.includes('.ts') || f.includes('.js'))) {
        context.activeRole = 'EXEC';
      }
      
      // Check for Vision QA activity
      if (fs.existsSync('screenshots') || recentFiles.some(f => f.includes('vision-qa'))) {
        const sessions = this.getRecentVisionQASessions();
        if (sessions.length > 0) {
          context.visionQA = sessions[0];
        }
      }
      
      // Check for active handoffs
      const handoffFiles = recentFiles.filter(f => f.includes('handoff') || f.includes('handover'));
      if (handoffFiles.length > 0) {
        context.lastHandoff = {
          file: handoffFiles[0],
          time: new Date().toISOString()
        };
      }
      
    } catch (_error) {
      // Context detection is best-effort
    }

    return context;
  }

  /**
   * Get recent Vision QA sessions
   */
  getRecentVisionQASessions() {
    try {
      const screenshotDir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(screenshotDir)) return [];
      
      const sessions = fs.readdirSync(screenshotDir)
        .filter(d => d.startsWith('TEST-'))
        .map(d => ({
          sessionId: d,
          path: path.join(screenshotDir, d),
          mtime: fs.statSync(path.join(screenshotDir, d)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 3);
      
      return sessions.map(s => s.sessionId);
    } catch {
      return [];
    }
  }

  /**
   * Update status line based on agent role
   */
  updateForRole(role, data = {}) {
    this.statusCache.activeRole = role;
    Object.assign(this.statusCache, data);
    this.saveStatus();
    
    const statusLine = this.formatStatusLine(role);
    this.setStatusLine(statusLine);
    
    return statusLine;
  }

  /**
   * Update for Strategic Directive work
   */
  updateForSD(sdId, phase = 'planning') {
    return this.updateForRole('LEAD', {
      currentSD: sdId,
      phase,
      currentTask: null
    });
  }

  /**
   * Update for task work
   */
  updateForTask(taskId, status = 'in-progress') {
    const role = this.statusCache.activeRole || 'EXEC';
    return this.updateForRole(role, {
      currentTask: taskId,
      taskStatus: status
    });
  }

  /**
   * Update for handoff
   */
  updateForHandoff(from, to, artifact = null) {
    this.statusCache.lastHandoff = {
      from,
      to,
      artifact,
      time: new Date().toISOString()
    };
    this.saveStatus();
    
    const statusLine = this.formatHandoffStatus();
    this.setStatusLine(statusLine);
    
    // Revert to normal status after 10 seconds
    setTimeout(() => {
      this.refresh();
    }, 10000);
    
    return statusLine;
  }

  /**
   * Update for Vision QA
   */
  updateForVisionQA(appId, testGoal = null) {
    this.statusCache.visionQA = {
      appId,
      testGoal,
      active: true
    };
    this.saveStatus();
    
    const statusLine = this.formatVisionQAStatus();
    this.setStatusLine(statusLine);
    
    return statusLine;
  }

  /**
   * Format status line based on current state
   */
  formatStatusLine(role = null) {
    const activeRole = role || this.statusCache.activeRole;
    
    if (!activeRole) {
      return this.templates.default;
    }
    
    let template = this.templates[activeRole.toLowerCase()] || this.templates.minimal;
    
    // Replace placeholders
    template = template
      .replace('{sd}', this.statusCache.currentSD || 'No SD')
      .replace('{task}', this.statusCache.currentTask || 'No Task')
      .replace('{phase}', this.statusCache.phase || 'Discovery')
      .replace('{status}', this.statusCache.taskStatus || 'Active')
      .replace('{verification}', this.getVerificationStatus())
      .replace('{project}', this.getCurrentProject())
      .replace('{branch}', this.getCurrentBranch())
      .replace('{context}', this.getContextSummary());
    
    return template;
  }

  /**
   * Format handoff status
   */
  formatHandoffStatus() {
    if (!this.statusCache.lastHandoff) {
      return this.templates.default;
    }
    
    const handoff = this.statusCache.lastHandoff;
    return this.templates.handoff
      .replace('{from}', handoff.from)
      .replace('{to}', handoff.to)
      .replace('{artifact}', handoff.artifact || 'Task');
  }

  /**
   * Format Vision QA status
   */
  formatVisionQAStatus() {
    if (!this.statusCache.visionQA) {
      return this.templates.default;
    }
    
    const vq = this.statusCache.visionQA;
    return this.templates.visionQA
      .replace('{appId}', vq.appId)
      .replace('{testGoal}', vq.testGoal || 'Testing UI');
  }

  /**
   * Get verification status summary
   */
  getVerificationStatus() {
    // Check for recent test results
    try {
      const testResults = execSync('npm test -- --listTests 2>/dev/null | wc -l', { encoding: 'utf8' }).trim();
      if (parseInt(testResults) > 0) {
        return `${testResults} tests`;
      }
    } catch {}
    
    return 'Pending';
  }

  /**
   * Get context summary
   */
  getContextSummary() {
    const parts = [];
    
    if (this.statusCache.activeRole) {
      parts.push(this.statusCache.activeRole);
    }
    
    if (this.statusCache.currentSD) {
      parts.push(this.statusCache.currentSD);
    }
    
    if (this.statusCache.currentTask) {
      parts.push(this.statusCache.currentTask);
    }
    
    return parts.join(' | ') || 'Ready';
  }

  /**
   * Set the actual status line (platform-specific)
   */
  setStatusLine(text) {
    // For now, we'll just output to a file that can be read
    // In the future, this could integrate with Claude's actual status line API
    
    const statusFile = path.join(process.cwd(), '.claude-status-line');
    try {
      fs.writeFileSync(statusFile, text);
      
      // Also update the Claude config if possible
      if (fs.existsSync(this.claudeConfigPath)) {
        const config = JSON.parse(fs.readFileSync(this.claudeConfigPath, 'utf8'));
        config.statusLine = text;
        fs.writeFileSync(this.claudeConfigPath, JSON.stringify(config, null, 2));
      }
      
      // Output for debugging
      if (process.env.DEBUG) {
        console.log(`📊 Status: ${text}`);
      }
      
    } catch (_error) {
      // Silent fail
    }
  }

  /**
   * Refresh status line with auto-detection
   */
  async refresh() {
    // Check cache timeout
    const now = Date.now();
    if (now - this.lastUpdate < this.cacheTimeout) {
      return this.formatStatusLine();
    }
    
    // Auto-detect context
    const context = await this.detectContext();
    this.statusCache = context;
    this.saveStatus();
    this.lastUpdate = now;
    
    const statusLine = this.formatStatusLine();
    this.setStatusLine(statusLine);
    
    return statusLine;
  }

  /**
   * Clear status and reset to default
   */
  clear() {
    this.statusCache = this.getDefaultStatus();
    this.saveStatus();
    this.setStatusLine(this.templates.default);
  }

  /**
   * Watch for changes and auto-update
   */
  watch(interval = 5000) {
    console.log('👁️ Watching for LEO Protocol context changes...');
    console.log(`📊 Update interval: ${interval}ms`);
    console.log('Press Ctrl+C to stop\n');
    
    // Initial update
    this.refresh();
    
    // Set up interval
    const timer = setInterval(async () => {
      await this.refresh();
    }, interval);
    
    // Handle shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping status line watcher');
      clearInterval(timer);
      this.clear();
      process.exit(0);
    });
  }

  /**
   * Display current status
   */
  show() {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║         LEO Protocol Status Line              ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    console.log('📊 Current Status:');
    console.log(`   Project: ${this.getCurrentProject()}`);
    console.log(`   Branch: ${this.getCurrentBranch()}`);
    console.log(`   LEO Version: ${this.statusCache.leoVersion}`);
    console.log(`   Active Role: ${this.statusCache.activeRole || 'None'}`);
    console.log(`   Current SD: ${this.statusCache.currentSD || 'None'}`);
    console.log(`   Current Task: ${this.statusCache.currentTask || 'None'}`);
    console.log(`   Phase: ${this.statusCache.phase || 'None'}`);
    
    if (this.statusCache.lastHandoff) {
      console.log('\n🤝 Last Handoff:');
      console.log(`   From: ${this.statusCache.lastHandoff.from}`);
      console.log(`   To: ${this.statusCache.lastHandoff.to}`);
      console.log(`   Time: ${this.statusCache.lastHandoff.time}`);
    }
    
    if (this.statusCache.visionQA) {
      console.log('\n👁️ Vision QA:');
      console.log(`   App ID: ${this.statusCache.visionQA.appId}`);
      console.log(`   Active: ${this.statusCache.visionQA.active}`);
    }
    
    const statusLine = this.formatStatusLine();
    console.log('\n📝 Formatted Status Line:');
    console.log(`   "${statusLine}"`);
    
    return statusLine;
  }

  /**
   * Get current project name
   */
  getCurrentProject() {
    try {
      // Try to get project from context first
      const contextFile = path.join(process.cwd(), '.leo-context');
      if (fs.existsSync(contextFile)) {
        const contextId = fs.readFileSync(contextFile, 'utf8').trim();
        const registryPath = path.join(process.cwd(), 'applications', 'registry.json');
        if (fs.existsSync(registryPath)) {
          const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
          if (registry.applications && registry.applications[contextId]) {
            return registry.applications[contextId].name;
          }
        }
      }
      
      // Fallback to directory name or package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.name) {
          return packageJson.name.replace(/^@.+\//, ''); // Remove scope if present
        }
      }
      
      // Last fallback to directory name
      return path.basename(process.cwd());
    } catch (_error) {
      return 'unknown';
    }
  }

  /**
   * Get current git branch
   */
  getCurrentBranch() {
    try {
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      return branch || 'detached';
    } catch (_error) {
      return 'no-git';
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const statusLine = new LEOStatusLine();
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: leo-status-line [command] [options]

Commands:
  show              Display current status
  refresh           Refresh status with auto-detection
  watch [interval]  Watch and auto-update (default: 5000ms)
  clear             Clear status to default
  
  role <role>       Set active role (LEAD/PLAN/EXEC)
  sd <id>           Set current Strategic Directive
  task <id>         Set current task
  handoff <from> <to> [artifact]  Update for handoff
  visionqa <appId> [goal]         Update for Vision QA
  
Examples:
  leo-status-line show
  leo-status-line refresh
  leo-status-line watch 3000
  leo-status-line role EXEC
  leo-status-line sd SD-001
  leo-status-line task EES-001
  leo-status-line handoff PLAN EXEC "Task decomposition"
  leo-status-line visionqa APP-001 "Test checkout flow"
`);
    process.exit(0);
  }
  
  const command = args[0];
  
  switch (command) {
    case 'show':
      statusLine.show();
      break;
      
    case 'refresh':
      statusLine.refresh().then(status => {
        console.log(`✅ Status refreshed: ${status}`);
      });
      break;
      
    case 'watch':
      const interval = parseInt(args[1]) || 5000;
      statusLine.watch(interval);
      break;
      
    case 'clear':
      statusLine.clear();
      console.log('✅ Status cleared');
      break;
      
    case 'role':
      if (args[1]) {
        const status = statusLine.updateForRole(args[1].toUpperCase());
        console.log(`✅ Role updated: ${status}`);
      } else {
        console.error('❌ Role required (LEAD/PLAN/EXEC)');
      }
      break;
      
    case 'sd':
      if (args[1]) {
        const status = statusLine.updateForSD(args[1], args[2]);
        console.log(`✅ SD updated: ${status}`);
      } else {
        console.error('❌ SD ID required');
      }
      break;
      
    case 'task':
      if (args[1]) {
        const status = statusLine.updateForTask(args[1], args[2]);
        console.log(`✅ Task updated: ${status}`);
      } else {
        console.error('❌ Task ID required');
      }
      break;
      
    case 'handoff':
      if (args[1] && args[2]) {
        const status = statusLine.updateForHandoff(args[1], args[2], args[3]);
        console.log(`✅ Handoff updated: ${status}`);
      } else {
        console.error('❌ From and To roles required');
      }
      break;
      
    case 'visionqa':
      if (args[1]) {
        const status = statusLine.updateForVisionQA(args[1], args[2]);
        console.log(`✅ Vision QA updated: ${status}`);
      } else {
        console.error('❌ App ID required');
      }
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run "leo-status-line --help" for usage');
  }
}

export default LEOStatusLine;