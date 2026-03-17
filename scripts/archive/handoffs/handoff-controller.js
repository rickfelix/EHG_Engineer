#!/usr/bin/env node

/**
 * LEO Protocol Handoff Controller
 * Enforces mandatory checklists and manages agent transitions
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


class HandoffController {
  constructor() {
    this.checklists = {
      'LEAD-to-PLAN': {
        items: [
          'SD created and saved to /docs/strategic-directives/',
          'Business objectives clearly defined',
          'Success metrics are measurable',
          'Constraints documented',
          'Risks identified',
          'Feasibility confirmed',
          'Environment health checked',
          'Context usage < 30%',
          'Summary created (500 tokens max)'
        ],
        required: 9,
        allowExceptions: true
      },
      'PLAN-to-EXEC': {
        items: [
          'PRD created and saved to /docs/prds/',
          'All SD requirements mapped to PRD items',
          'Technical specifications complete',
          'Prerequisites verified and available',
          'Test requirements defined',
          'Acceptance criteria clear',
          'Risk mitigation planned',
          'Context usage < 40%',
          'Summary created (500 tokens max)'
        ],
        required: 9,
        allowExceptions: true
      },
      'EXEC-to-COMPLETE': {
        items: [
          'All PRD requirements implemented',
          'Tests written and passing',
          'Lint checks passing (npm run lint)',
          'Type checks passing (npx tsc --noEmit)',
          'Build successful (npm run build)',
          'CI/CD pipeline green',
          'Documentation updated',
          'Context usage < 60%',
          'Summary created (500 tokens max)'
        ],
        required: 9,
        allowExceptions: true
      }
    };
    
    this.stateFile = path.join(__dirname, '..', '.leo-handoff-state.json');
    this.logFile = path.join(__dirname, '..', 'logs', 'handoff.log');
  }

  /**
   * Initialize readline interface for user input
   */
  createInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Load handoff state
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading handoff state:', error);
    }
    
    return {
      currentAgent: null,
      lastHandoff: null,
      exceptions: [],
      history: []
    };
  }

  /**
   * Save handoff state
   */
  saveState(state) {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Error saving handoff state:', error);
    }
  }

  /**
   * Log handoff event
   */
  logHandoff(event) {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${JSON.stringify(event)}\n`;
    
    fs.appendFileSync(this.logFile, logEntry);
  }

  /**
   * Validate checklist completion
   */
  async validateChecklist(handoffType, checkedItems) {
    const checklist = this.checklists[handoffType];
    if (!checklist) {
      throw new Error(`Unknown handoff type: ${handoffType}`);
    }
    
    const completedCount = checkedItems.filter(item => item).length;
    const isComplete = completedCount >= checklist.required;
    
    if (!isComplete && checklist.allowExceptions) {
      return {
        passed: false,
        completedCount,
        required: checklist.required,
        needsException: true
      };
    }
    
    return {
      passed: isComplete,
      completedCount,
      required: checklist.required,
      needsException: false
    };
  }

  /**
   * Request exception from human
   */
  async requestException(handoffType, blockedItems, justification) {
    console.log('\n' + '='.repeat(60));
    console.log('EXCEPTION REQUEST');
    console.log('='.repeat(60));
    console.log(`Handoff Type: ${handoffType}`);
    console.log('\nBlocked Items:');
    blockedItems.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });
    console.log('\nJustification:');
    console.log(`  ${justification}`);
    console.log('='.repeat(60));
    
    const rl = this.createInterface();
    
    return new Promise((resolve) => {
      rl.question('\nApprove exception? (yes/no): ', (answer) => {
        rl.close();
        const approved = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
        
        const exception = {
          handoffType,
          blockedItems,
          justification,
          approved,
          timestamp: new Date().toISOString()
        };
        
        // Log exception
        const state = this.loadState();
        state.exceptions.push(exception);
        this.saveState(state);
        this.logHandoff({ type: 'exception', ...exception });
        
        resolve(approved);
      });
    });
  }

  /**
   * Generate handoff summary
   */
  generateSummary(fromAgent, toAgent, completedWork, nextSteps, files = []) {
    const maxTokens = 500;
    const summary = {
      from: fromAgent,
      to: toAgent,
      timestamp: new Date().toISOString(),
      completed: completedWork,
      nextSteps: nextSteps,
      files: files
    };
    
    // Create markdown summary
    let markdown = `## ${fromAgent} → ${toAgent} Handoff Summary\n\n`;
    markdown += `**Date**: ${summary.timestamp}\n\n`;
    markdown += '### Completed:\n';
    completedWork.forEach(item => markdown += `- ${item}\n`);
    markdown += '\n### Next Steps:\n';
    nextSteps.forEach(item => markdown += `- ${item}\n`);
    
    if (files.length > 0) {
      markdown += '\n### Files:\n';
      files.forEach(file => markdown += `- ${file}\n`);
    }
    
    // Estimate tokens (rough)
    const estimatedTokens = Math.ceil(markdown.length / 4);
    if (estimatedTokens > maxTokens) {
      console.warn(`⚠️  Summary exceeds ${maxTokens} tokens (estimated: ${estimatedTokens})`);
      console.log('Please compress the summary');
    }
    
    return {
      summary,
      markdown,
      estimatedTokens
    };
  }

  /**
   * Archive completed work to file
   */
  archiveWork(agent, content, description) {
    const archiveDir = path.join(process.cwd(), 'archives', agent.toLowerCase());
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `${description.replace(/\s+/g, '-')}-${timestamp}.md`;
    const filepath = path.join(archiveDir, filename);
    
    fs.writeFileSync(filepath, content);
    console.log(`✅ Archived to: ${filepath}`);
    
    return filepath;
  }

  /**
   * Interactive handoff process
   */
  async performHandoff(handoffType) {
    const checklist = this.checklists[handoffType];
    if (!checklist) {
      console.error(`Unknown handoff type: ${handoffType}`);
      return false;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`LEO PROTOCOL HANDOFF: ${handoffType}`);
    console.log('='.repeat(60));
    console.log('\nMandatory Checklist:');
    console.log('-'.repeat(40));
    
    const rl = this.createInterface();
    const checkedItems = [];
    const blockedItems = [];
    
    // Check each item
    for (let i = 0; i < checklist.items.length; i++) {
      const item = checklist.items[i];
      await new Promise((resolve) => {
        rl.question(`[ ] ${item}\n    Complete? (y/n): `, (answer) => {
          const completed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
          checkedItems.push(completed);
          if (!completed) {
            blockedItems.push(item);
          }
          console.log(completed ? '    ✅ Checked' : '    ❌ Blocked');
          resolve();
        });
      });
    }
    
    rl.close();
    
    // Validate checklist
    const validation = await this.validateChecklist(handoffType, checkedItems);
    
    if (!validation.passed) {
      console.log('\n⚠️  HANDOFF BLOCKED');
      console.log(`Completed: ${validation.completedCount}/${validation.required}`);
      
      if (validation.needsException) {
        console.log('\nRequesting exception...');
        
        const rl2 = this.createInterface();
        const justification = await new Promise((resolve) => {
          rl2.question('Provide justification for exception: ', (answer) => {
            rl2.close();
            resolve(answer);
          });
        });
        
        const approved = await this.requestException(handoffType, blockedItems, justification);
        
        if (approved) {
          console.log('✅ Exception approved - Handoff allowed');
          return true;
        } else {
          console.log('❌ Exception denied - Complete checklist items and retry');
          return false;
        }
      }
    }
    
    console.log('\n✅ HANDOFF APPROVED');
    console.log('All checklist items completed');
    
    // Log successful handoff
    this.logHandoff({
      type: 'handoff',
      handoffType,
      checkedItems,
      timestamp: new Date().toISOString()
    });
    
    // Update state
    const state = this.loadState();
    const [_from, , to] = handoffType.split('-');
    state.currentAgent = to;
    state.lastHandoff = {
      type: handoffType,
      timestamp: new Date().toISOString()
    };
    state.history.push(state.lastHandoff);
    this.saveState(state);
    
    return true;
  }

  /**
   * Display current status
   */
  displayStatus() {
    const state = this.loadState();
    
    console.log('\n' + '='.repeat(60));
    console.log('LEO PROTOCOL HANDOFF STATUS');
    console.log('='.repeat(60));
    console.log(`Current Agent: ${state.currentAgent || 'None'}`);
    
    if (state.lastHandoff) {
      console.log(`Last Handoff: ${state.lastHandoff.type}`);
      console.log(`Timestamp: ${state.lastHandoff.timestamp}`);
    }
    
    if (state.exceptions.length > 0) {
      console.log(`\nExceptions Granted: ${state.exceptions.length}`);
      const recent = state.exceptions[state.exceptions.length - 1];
      console.log(`Most Recent: ${recent.timestamp}`);
    }
    
    if (state.history.length > 0) {
      console.log(`\nHandoff History: ${state.history.length} transitions`);
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const controller = new HandoffController();
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'handoff':
      const type = args[1];
      if (!type) {
        console.log('Specify handoff type:');
        console.log('  LEAD-to-PLAN');
        console.log('  PLAN-to-EXEC');
        console.log('  EXEC-to-COMPLETE');
      } else {
        controller.performHandoff(type);
      }
      break;
      
    case 'status':
      controller.displayStatus();
      break;
      
    case 'archive':
      const agent = args[1] || 'EXEC';
      const description = args[2] || 'completed-work';
      console.log(`Archive work for ${agent} agent`);
      console.log('Provide content, then press Ctrl+D when done:');
      
      let content = '';
      process.stdin.on('data', (chunk) => {
        content += chunk;
      });
      process.stdin.on('end', () => {
        controller.archiveWork(agent, content, description);
      });
      break;
      
    default:
      console.log('LEO Protocol Handoff Controller');
      console.log('\nUsage:');
      console.log('  node handoff-controller.js handoff [type]  - Perform handoff');
      console.log('  node handoff-controller.js status          - Show current status');
      console.log('  node handoff-controller.js archive [agent] [desc] - Archive work');
      console.log('\nHandoff Types:');
      console.log('  LEAD-to-PLAN     - Strategic to Planning');
      console.log('  PLAN-to-EXEC     - Planning to Execution');
      console.log('  EXEC-to-COMPLETE - Execution to Completion');
  }
}

export default HandoffController;