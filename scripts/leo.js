#!/usr/bin/env node

/**
 * LEO Protocol - Unified User-Friendly CLI Interface
 *
 * This is a user-friendly wrapper around all existing LEO Protocol functionality.
 * It preserves all the smart features but makes them more intuitive to use.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

class LEOProtocolCLI {
  constructor() {
    this.scriptsDir = path.join(__dirname);
    this.projectRoot = path.dirname(__dirname);
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();

    try {
      switch (command) {
        // Role switching (keep existing functionality)
        case 'lead':
        case 'plan':
        case 'exec':
          await this.switchRole(command.toUpperCase());
          break;

        // Project management (wrapper around existing system)
        case 'project':
        case 'projects':
          await this.handleProject(args.slice(1));
          break;

        case 'switch':
          await this.switchProject(args[1]);
          break;

        case 'where':
        case 'status':
          await this.showFullStatus();
          break;

        case 'working':
          await this.updateSD(args[1]);
          break;

        case 'done':
          await this.markTaskComplete();
          break;

        case 'handoff':
          await this.initiateHandoff(args[1]);
          break;

        case 'validate':
          await this.runValidation(args[1]);
          break;

        case 'evidence':
          await this.captureEvidence();
          break;

        case 'add-project':
          await this.addProject();
          break;

        case 'wizard':
        case 'registration-wizard':
          await this.runRegistrationWizard();
          break;

        case 'help':
        case '--help':
        case '-h':
        case undefined:
          this.showHelp();
          break;

        default:
          console.log(`❌ Unknown command: ${command}`);
          console.log("Run 'leo help' for available commands");
          process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }

  async switchRole(role) {
    console.log(`🔄 Switching to ${role} agent role...`);
    try {
      await execAsync(`bash "${this.scriptsDir}/leo-status.sh" ${role.toLowerCase()}`);
      console.log(`✅ Now in ${role} agent mode`);
      await this.showCurrentStatus();
    } catch (error) {
      throw new Error(`Failed to switch to ${role} role: ${error.message}`);
    }
  }

  async handleProject(args) {
    const subCommand = args[0];
    
    if (!subCommand || subCommand === 'list') {
      // List all projects using existing functionality
      console.log('📁 Available projects:');
      try {
        const result = await execAsync(`node "${this.scriptsDir}/switch-context.js" list`);
        console.log(result.stdout);
      } catch (error) {
        throw new Error(`Failed to list projects: ${error.message}`);
      }
    } else {
      // Switch to specific project
      await this.switchProject(subCommand);
    }
  }

  async switchProject(projectId) {
    if (!projectId) {
      console.log('❌ Please specify a project ID');
      console.log('Run "leo projects" to see available projects');
      return;
    }

    console.log(`🔄 Switching to project: ${projectId}...`);
    try {
      await execAsync(`node "${this.scriptsDir}/switch-context.js" ${projectId}`);
      console.log(`✅ Switched to project: ${projectId}`);
      await this.showFullStatus();
    } catch (error) {
      throw new Error(`Failed to switch to project ${projectId}: ${error.message}`);
    }
  }

  async showFullStatus() {
    console.log('📊 Current LEO Protocol Status:\n');
    
    try {
      // Get current context
      const contextResult = await execAsync(`node "${this.scriptsDir}/switch-context.js" show`);
      
      // Get LEO status
      const leoResult = await execAsync(`bash "${this.scriptsDir}/leo-status.sh" show`);
      
      // Get git info
      const gitBranch = await execAsync('git branch --show-current').catch(() => ({ stdout: 'not-git-repo' }));
      const gitStatus = await execAsync('git status --porcelain').catch(() => ({ stdout: '' }));
      
      console.log('🎯 Context & Status:');
      console.log(contextResult.stdout);
      console.log('\n📈 LEO Protocol:');
      console.log(leoResult.stdout);
      console.log(`\n🌿 Git Branch: ${gitBranch.stdout.trim()}`);
      
      const changes = gitStatus.stdout.trim().split('\n').filter(line => line.trim());
      if (changes.length > 0) {
        console.log(`📝 Uncommitted Changes: ${changes.length} files`);
      } else {
        console.log('✅ No uncommitted changes');
      }
      
    } catch (error) {
      throw new Error(`Failed to get status: ${error.message}`);
    }
  }

  async showCurrentStatus() {
    try {
      const result = await execAsync(`bash "${this.scriptsDir}/leo-status.sh" show`);
      console.log(result.stdout);
    } catch (_error) {
      console.log('⚠️  Could not retrieve current status');
    }
  }

  async updateSD(sdId) {
    if (!sdId) {
      console.log('❌ Please specify a Strategic Directive ID');
      console.log('Example: leo working SD-001');
      return;
    }

    console.log(`🎯 Updating to Strategic Directive: ${sdId}...`);
    try {
      await execAsync(`bash "${this.scriptsDir}/leo-status.sh" sd ${sdId}`);
      console.log(`✅ Now working on ${sdId}`);
      await this.showCurrentStatus();
    } catch (error) {
      throw new Error(`Failed to update Strategic Directive: ${error.message}`);
    }
  }

  async markTaskComplete() {
    console.log('✅ Marking current task as complete...');
    try {
      await execAsync(`node "${this.scriptsDir}/leo-evidence-capture.js"`);
      console.log('📝 Evidence captured successfully');
    } catch (error) {
      throw new Error(`Failed to mark task complete: ${error.message}`);
    }
  }

  async initiateHandoff(toAgent) {
    if (!toAgent) {
      console.log('❌ Please specify target agent (lead, plan, or exec)');
      console.log('Example: leo handoff plan');
      return;
    }

    const toRole = toAgent.toUpperCase();
    console.log(`🤝 Initiating handoff to ${toRole} agent...`);
    
    try {
      // First capture evidence
      await execAsync(`node "${this.scriptsDir}/leo-evidence-capture.js"`);
      
      // Then update role
      await execAsync(`bash "${this.scriptsDir}/leo-status.sh" ${toAgent.toLowerCase()}`);
      
      console.log(`✅ Handoff to ${toRole} agent completed`);
      await this.showCurrentStatus();
    } catch (error) {
      throw new Error(`Failed to handoff to ${toRole}: ${error.message}`);
    }
  }

  async runValidation(type) {
    if (!type) {
      console.log('🔍 Running all validations...');
      try {
        console.log('📋 Validating Strategic Directive...');
        await execAsync(`node "${this.scriptsDir}/leo-sd-validator.js"`);
        
        console.log('📋 Validating PRD...');
        await execAsync(`node "${this.scriptsDir}/leo-prd-validator.js"`);
        
        console.log('✅ All validations completed');
      } catch (error) {
        throw new Error(`Validation failed: ${error.message}`);
      }
    } else if (type === 'sd') {
      console.log('📋 Validating Strategic Directive...');
      await execAsync(`node "${this.scriptsDir}/leo-sd-validator.js"`);
    } else if (type === 'prd') {
      console.log('📋 Validating PRD...');
      await execAsync(`node "${this.scriptsDir}/leo-prd-validator.js"`);
    } else {
      console.log('❌ Unknown validation type. Use: sd, prd, or leave blank for all');
    }
  }

  async captureEvidence() {
    console.log('📸 Capturing completion evidence...');
    try {
      await execAsync(`node "${this.scriptsDir}/leo-evidence-capture.js"`);
      console.log('✅ Evidence captured successfully');
    } catch (error) {
      throw new Error(`Failed to capture evidence: ${error.message}`);
    }
  }

  async addProject() {
    console.log(`
📁 Adding a New Project - Super Simple!

You only need 2 things:
• Your project name (like "my-app")
• Your repository name (JUST the name, not the URL)

═══════════════════════════════════════════════════

STEP 1: Copy the template
Type this and press Enter:

   cp .env.project-template .env.project-registration

═══════════════════════════════════════════════════

STEP 2: Edit 2 lines
Open .env.project-registration in any text editor

Change ONLY these 2 lines:
   PROJECT_NAME=my-app         (your project name)
   GITHUB_REPO=my-app-repo     (JUST repo name, NOT the URL!)

Save the file (Ctrl+S)

NOTE: GitHub owner defaults to "rickfelix" - no need to change!

═══════════════════════════════════════════════════

STEP 3: Register it
Type this and press Enter:

   node scripts/leo-register-from-env.js

═══════════════════════════════════════════════════

That's it! Your project is added!

To switch to it: leo switch [your-project-name]
To see all projects: leo projects

📚 Need more help? Check SIMPLE_PROJECT_SETUP.md
`);
  }

  async runRegistrationWizard() {
    console.log('🧙‍♂️ Starting LEO Project Registration Wizard...');
    try {
      await execAsync(`node "${this.scriptsDir}/leo-registration-wizard.js"`);
    } catch (error) {
      throw new Error(`Failed to run registration wizard: ${error.message}`);
    }
  }

  showHelp() {
    console.log(`
╔════════════════════════════════════════════════╗
║              LEO Protocol CLI                  ║
║           User-Friendly Interface              ║
╚════════════════════════════════════════════════╝

🎯 Agent Role Management:
  leo lead                Switch to LEAD agent role
  leo plan                Switch to PLAN agent role  
  leo exec                Switch to EXEC agent role

📁 Project Management:
  leo projects            List all registered projects
  leo project <id>        Switch to specific project
  leo switch <id>         Switch to specific project (alias)
  leo add-project         Register new project
  leo wizard              Interactive project registration guide
  
📊 Status & Context:
  leo status              Show full status (project + LEO + git)
  leo where               Show current context (alias)

🎯 Strategic Directive Management:
  leo working SD-XXX      Update current Strategic Directive
  leo validate            Run all validations (SD + PRD)
  leo validate sd         Validate Strategic Directive only
  leo validate prd        Validate PRD only

🤝 Workflow Management:
  leo done                Mark task complete + capture evidence
  leo handoff plan        Handoff to PLAN agent
  leo handoff exec        Handoff to EXEC agent
  leo handoff lead        Handoff to LEAD agent
  leo evidence            Capture completion evidence

📋 Examples:
  leo exec                # Switch to EXEC agent
  leo working SD-002      # Start working on SD-002
  leo validate            # Run all validations
  leo done                # Complete current task
  leo handoff plan        # Hand off to PLAN agent
  leo projects            # See all projects
  leo switch ehg          # Switch to 'ehg' project

💡 All commands preserve existing LEO Protocol functionality
   while providing a more intuitive interface.
`);
  }
}

// Run the CLI
const cli = new LEOProtocolCLI();
cli.run().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

export default LEOProtocolCLI;