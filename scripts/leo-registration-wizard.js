#!/usr/bin/env node

/**
 * LEO Project Registration Interactive Wizard
 * 
 * This wizard guides users through the process of registering a new project
 * in a proper terminal environment with clear step-by-step instructions.
 */

import fs from 'fs';.promises;
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


class LEORegistrationWizard {
  constructor() {
    this.projectRoot = path.dirname(__dirname);
  }

  async run() {
    console.log(`
╔════════════════════════════════════════════════╗
║      LEO Project Registration Wizard          ║
║           Step-by-Step Guide                   ║
╚════════════════════════════════════════════════╝

This wizard will guide you through registering a new project with LEO Protocol.

🎯 What You'll Need:
   • A GitHub repository (owner/repo-name format)
   • Supabase project details (optional but recommended)
   • 5-10 minutes of your time

📋 Prerequisites Check:
`);

    await this.checkPrerequisites();
    await this.showInstructions();
    await this.generateTemplate();
  }

  async checkPrerequisites() {
    console.log('🔍 Checking your system...\n');

    // Check Node.js
    console.log('✅ Node.js: Available');
    
    // Check if we're in the right directory
    const packagePath = path.join(this.projectRoot, 'package.json');
    try {
      await fs.access(packagePath);
      console.log('✅ LEO Protocol: Available');
    } catch {
      console.log('❌ LEO Protocol: Not found - make sure you\'re in the EHG_Engineer directory');
      process.exit(1);
    }

    // Check registry file
    const registryPath = path.join(this.projectRoot, 'applications', 'registry.json');
    try {
      await fs.access(registryPath);
      console.log('✅ Project Registry: Available');
    } catch {
      console.log('❌ Project Registry: Not found');
      process.exit(1);
    }

    console.log('\n🟢 All prerequisites met!\n');
  }

  async showInstructions() {
    console.log(`
╔════════════════════════════════════════════════╗
║            Registration Instructions           ║
╚════════════════════════════════════════════════╝

📝 Step 1: Open a Terminal Session
   ${this.getTerminalInstructions()}

📝 Step 2: Navigate to the Project Directory
   Run: cd "${this.projectRoot}"

📝 Step 3: Run the Registration Command
   Run: node scripts/leo.js add-project

📝 Step 4: Follow the Interactive Prompts
   You'll be asked for the following information:

   🔸 Application Name
      Example: "my-awesome-app"
      
   🔸 Description  
      Example: "A revolutionary web application"
      
   🔸 GitHub Owner/Organization
      Example: "your-username" or "your-org"
      
   🔸 Repository Name
      Example: "my-awesome-repo"
      
   🔸 Default Branch (optional)
      Default: "main" (just press Enter)
      
   🔸 Supabase Project ID
      Example: "abcdefghijk123456789"
      
   🔸 Supabase URL
      Example: "https://abcdefghijk123456789.supabase.co"
      
   🔸 GitHub Personal Access Token (optional)
      Type "n" if you don't have one
      
   🔸 Supabase Anon Key
      Found in your Supabase project settings
      
   🔸 Supabase Service Key (optional)
      Type "n" unless you need it for this project
      
   🔸 Environment
      Choose: "development", "staging", or "production"

📝 Step 5: Verify Registration
   After completion, run: node scripts/leo.js projects
   Your new project should appear in the list!

🎯 Ready to proceed? See the example inputs below!
`);
  }

  getTerminalInstructions() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      return `
   Windows Options:
   • Command Prompt: Win + R, type "cmd", press Enter
   • PowerShell: Win + X, then A
   • Windows Terminal: Win + R, type "wt", press Enter
   • WSL: Win + R, type "wsl", press Enter (recommended if available)`;
    } else if (platform === 'darwin') {
      return `
   macOS Options:
   • Terminal: Cmd + Space, type "Terminal", press Enter
   • iTerm2: If installed, Cmd + Space, type "iTerm", press Enter`;
    } else {
      return `
   Linux Options:
   • Terminal: Ctrl + Alt + T
   • Or search for "Terminal" in your applications menu`;
    }
  }

  async generateTemplate() {
    const templatePath = path.join(this.projectRoot, 'tmp', 'project-registration-template.txt');
    
    // Ensure tmp directory exists
    const tmpDir = path.dirname(templatePath);
    try {
      await fs.mkdir(tmpDir, { recursive: true });
    } catch (error) {
      // Directory already exists or other error - continue
    }

    const template = `
LEO PROJECT REGISTRATION - EXAMPLE INPUTS
=========================================

When prompted, here are some example values you can use:

Application Name: my-new-project
Description: Test project for LEO protocol integration
GitHub Owner/Organization: your-github-username
Repository Name: my-new-project-repo
Default Branch (main): [just press Enter]
Supabase Project ID: your-supabase-project-id
Supabase URL: https://your-project-id.supabase.co
Do you have a GitHub Personal Access Token? (y/n): n
Supabase Anon Key: your-anon-key-here
Do you have a Supabase Service Key? (y/n): n
Environment (development/staging/production): development

NOTES:
- Replace the example values with your actual project information
- You can press Enter to use defaults where shown
- If you don't have Supabase, you can use placeholder values
- The registration will create the project structure automatically

AFTER REGISTRATION:
- Run: node scripts/leo.js projects (to see your new project)
- Run: node scripts/leo.js switch your-project-name (to switch to it)
- Run: node scripts/leo.js status (to verify everything works)
`;

    try {
      await fs.writeFile(templatePath, template);
      console.log(`
📋 Template Created!
   
   I've created an example input template at:
   ${templatePath}
   
   You can reference this file while registering your project.

🚀 Ready to Start!

   1. Open your terminal application
   2. Navigate to: ${this.projectRoot}
   3. Run: node scripts/leo.js add-project
   4. Use the template above as a reference
   5. Follow the prompts step by step

💡 Tip: Keep this template open in another window for easy reference!

🔄 After registration, come back here and I can help you verify 
   everything worked correctly.
`);
    } catch (error) {
      console.log(`
⚠️  Couldn't create template file, but that's okay!
   
   You can still use the example values shown above as a reference.
   
🚀 Ready to Start!

   1. Open your terminal application  
   2. Navigate to: ${this.projectRoot}
   3. Run: node scripts/leo.js add-project
   4. Follow the prompts using the examples above

🔄 After registration, come back and I can help verify everything worked!
`);
    }
  }
}

// Run the wizard
if (import.meta.url === `file://${process.argv[1]}`) {
  const wizard = new LEORegistrationWizard();
  wizard.run().catch(error => {
    console.error('❌ Wizard error:', error.message);
    process.exit(1);
  });
}

export default LEORegistrationWizard;