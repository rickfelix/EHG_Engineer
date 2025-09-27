#!/usr/bin/env node

/**
 * Application Registration Script
 * LEO Protocol v3.1.5 - Multi-Application Management
 * Interactive wizard to register new applications
 */

import fs from 'fs';.promises;
import path from 'path';
import { exec  } from 'child_process';
import { promisify  } from 'util';
import readline from 'readline';
import encryption from '../lib/security/encryption';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const execAsync = promisify(exec);

class AppRegistration {
  constructor() {
    this.registryPath = path.join(__dirname, '../applications/registry.json');
    this.applicationsDir = path.join(__dirname, '../applications');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async loadRegistry() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Failed to load registry:', error.message);
      process.exit(1);
    }
  }

  async saveRegistry(registry) {
    registry.metadata.last_updated = new Date().toISOString();
    registry.metadata.total_apps = Object.keys(registry.applications).length;
    registry.metadata.active_apps = Object.values(registry.applications)
      .filter(app => app.status === 'active').length;
    
    await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
  }

  generateAppId(registry) {
    const existingIds = Object.keys(registry.applications);
    let counter = 1;
    let appId;
    
    do {
      appId = `APP${String(counter).padStart(3, '0')}`;
      counter++;
    } while (existingIds.includes(appId));
    
    return appId;
  }

  async checkGitHubCLI() {
    try {
      await execAsync('gh --version');
      const { stdout } = await execAsync('gh auth status');
      if (!stdout.includes('Logged in')) {
        throw new Error('Not authenticated');
      }
      return true;
    } catch (error) {
      console.error('❌ GitHub CLI not authenticated. Run: gh auth login');
      return false;
    }
  }

  async checkSupabaseCLI() {
    try {
      await execAsync('supabase --version');
      return true;
    } catch (error) {
      console.warn('⚠️  Supabase CLI not found. Database sync will be limited.');
      return false;
    }
  }

  async cloneRepository(githubRepo, appDir) {
    console.log(`\n📥 Cloning repository: ${githubRepo}`);
    
    const codebaseDir = path.join(appDir, 'codebase');
    
    try {
      // Clone with depth 1 for faster initial clone
      await execAsync(`gh repo clone ${githubRepo} ${codebaseDir} -- --depth 1`);
      
      // Set up git config
      await execAsync(`git config --global --add safe.directory ${codebaseDir}`);
      
      console.log('✅ Repository cloned successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to clone repository:', error.message);
      return false;
    }
  }

  async collectAppInfo() {
    console.log('\n📝 Application Registration Wizard\n');
    
    const appInfo = {};
    
    // Basic Information
    appInfo.name = await this.question('Application Name: ');
    appInfo.description = await this.question('Description: ');
    
    // GitHub Information
    console.log('\n🔗 GitHub Configuration');
    appInfo.github_owner = await this.question('GitHub Owner/Organization: ');
    appInfo.github_repo = await this.question('Repository Name: ');
    appInfo.github_branch = (await this.question('Default Branch (main): ')) || 'main';
    
    // Supabase Information
    console.log('\n🗄️  Supabase Configuration');
    appInfo.supabase_project_id = await this.question('Supabase Project ID: ');
    appInfo.supabase_url = await this.question('Supabase URL: ');
    
    // Credentials
    console.log('\n🔐 Credentials (will be encrypted)');
    const credentials = {};
    
    const hasGitHubPAT = await this.question('Do you have a GitHub Personal Access Token? (y/n): ');
    if (hasGitHubPAT.toLowerCase() === 'y') {
      credentials.github_pat = await this.question('GitHub PAT: ');
    }
    
    credentials.supabase_anon_key = await this.question('Supabase Anon Key: ');
    
    const hasServiceKey = await this.question('Do you have a Supabase Service Key? (y/n): ');
    if (hasServiceKey.toLowerCase() === 'y') {
      credentials.supabase_service_key = await this.question('Supabase Service Key: ');
    }
    
    // Environment
    console.log('\n🌍 Environment Settings');
    const envChoices = ['development', 'staging', 'production'];
    appInfo.environment = await this.question('Environment (development/staging/production): ');
    if (!envChoices.includes(appInfo.environment)) {
      appInfo.environment = 'development';
    }
    
    return { appInfo, credentials };
  }

  async registerApplication() {
    console.log(`
╔══════════════════════════════════════════════╗
║     EHG_Engineer Application Registration     ║
║          LEO Protocol v3.1.5 Compliant        ║
╚══════════════════════════════════════════════╝
    `);
    
    // Check prerequisites
    console.log('🔍 Checking prerequisites...');
    const hasGH = await this.checkGitHubCLI();
    const hasSupabase = await this.checkSupabaseCLI();
    
    if (!hasGH) {
      console.error('\n❌ GitHub CLI is required. Please authenticate first.');
      process.exit(1);
    }
    
    // Load registry
    const registry = await this.loadRegistry();
    
    // Generate App ID
    const appId = this.generateAppId(registry);
    console.log(`\n🆔 Generated Application ID: ${appId}`);
    
    // Collect application information
    const { appInfo, credentials } = await this.collectAppInfo();
    
    // Create application directory
    const appDir = path.join(this.applicationsDir, appId);
    await fs.mkdir(appDir, { recursive: true });
    await fs.mkdir(path.join(appDir, 'directives'), { recursive: true });
    
    // Clone repository
    const githubRepo = `${appInfo.github_owner}/${appInfo.github_repo}`;
    const cloned = await this.cloneRepository(githubRepo, appDir);
    
    if (!cloned) {
      console.log('⚠️  Continuing without repository clone...');
    }
    
    // Encrypt and save credentials
    console.log('\n🔐 Encrypting credentials...');
    await encryption.encryptAppCredentials(appId, credentials);
    console.log('✅ Credentials encrypted and saved');
    
    // Create application config
    const appConfig = {
      id: appId,
      name: appInfo.name,
      description: appInfo.description,
      github: {
        owner: appInfo.github_owner,
        repo: appInfo.github_repo,
        branch: appInfo.github_branch,
        full_repo: githubRepo
      },
      supabase: {
        project_id: appInfo.supabase_project_id,
        url: appInfo.supabase_url
      },
      environment: appInfo.environment,
      settings: {
        auto_sync: false,
        ci_cd_enabled: true,
        test_on_push: true
      },
      created_at: new Date().toISOString(),
      created_by: 'HUMAN'
    };
    
    // Save application config
    const configPath = path.join(appDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(appConfig, null, 2));
    
    // Update registry
    registry.applications[appId] = {
      id: appId,
      name: appInfo.name,
      github_repo: githubRepo,
      supabase_project_id: appInfo.supabase_project_id,
      status: 'active',
      environment: appInfo.environment,
      registered_at: new Date().toISOString()
    };
    
    await this.saveRegistry(registry);
    
    // Create initial context file
    const contextPath = path.join(__dirname, '../.leo-context');
    await fs.writeFile(contextPath, appId);
    
    console.log(`
╔══════════════════════════════════════════════╗
║         Registration Complete! 🎉             ║
╚══════════════════════════════════════════════╝

Application ID: ${appId}
Name: ${appInfo.name}
Repository: ${githubRepo}
Status: Active
Context: Set to ${appId}

Next Steps:
1. Create Strategic Directives: npm run create-app-sd ${appId}
2. Sync with GitHub: npm run sync-app ${appId}
3. Deploy changes: npm run deploy-sd ${appId}-SD-YYYY-MM-DD-A

Configuration saved to: ${configPath}
Credentials encrypted in: ${appId}/.env.encrypted
    `);
    
    this.rl.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const registrar = new AppRegistration();
  registrar.registerApplication().catch(error => {
    console.error('❌ Registration failed:', error.message);
    process.exit(1);
  });
}

export default AppRegistration;