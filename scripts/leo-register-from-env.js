#!/usr/bin/env node

/**
 * LEO Protocol - Non-Interactive Project Registration
 * Reads configuration from .env.project-registration file
 */

import fs from 'fs/promises';
import path from 'path';
import encryption from '../lib/security/encryption';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


class EnvProjectRegistration {
  constructor() {
    this.envPath = path.join(__dirname, '../.env.project-registration');
    this.registryPath = path.join(__dirname, '../applications/registry.json');
    this.applicationsDir = path.join(__dirname, '../applications');
  }

  async run() {
    console.log(`
╔════════════════════════════════════════════════╗
║     LEO Protocol - Project Registration        ║
║         Non-Interactive Mode                   ║
╚════════════════════════════════════════════════╝
`);

    try {
      // Load environment variables
      const config = await this.loadEnvFile();
      
      // Validate required fields
      this.validateConfig(config);
      
      // Load existing registry
      const registry = await this.loadRegistry();
      
      // Generate new app ID
      const appId = this.generateAppId(registry);
      
      // Create application directory
      await this.createAppDirectory(appId);
      
      // Add to registry
      await this.registerApplication(registry, appId, config);
      
      console.log(`
✅ Project registered successfully!

   App ID: ${appId}
   Name: ${config.PROJECT_NAME}
   GitHub: ${config.GITHUB_OWNER}/${config.GITHUB_REPO}
   Environment: ${config.PROJECT_ENVIRONMENT}

🎯 Next Steps:
   1. Run: node scripts/leo.js projects
      (to see your new project in the list)
   
   2. Run: node scripts/leo.js switch ${config.PROJECT_NAME}
      (to switch to your new project)
   
   3. Run: node scripts/leo.js status
      (to verify everything is working)
`);

      // Archive the registration file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = path.join(__dirname, `../.env.project-${config.PROJECT_NAME}-${timestamp}`);
      await fs.rename(this.envPath, archivePath);
      console.log(`📁 Registration file archived to: .env.project-${config.PROJECT_NAME}-${timestamp}`);
      console.log('\n💡 To register another project, copy the template again:');
      console.log('   cp .env.project-template .env.project-registration');

    } catch (error) {
      console.error('❌ Registration failed:', error.message);
      console.log('\n💡 Make sure you filled in the .env.project-registration file');
      process.exit(1);
    }
  }

  async loadEnvFile() {
    try {
      const envContent = await fs.readFile(this.envPath, 'utf8');
      const config = {};
      
      envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          if (key && value) {
            config[key.trim()] = value;
          }
        }
      });
      
      return config;
    } catch (error) {
      throw new Error(`Could not read .env.project-registration file: ${error.message}`);
    }
  }

  validateConfig(config) {
    const required = ['PROJECT_NAME', 'GITHUB_OWNER', 'GITHUB_REPO'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields in .env file: ${missing.join(', ')}`);
    }
    
    // Set defaults for optional fields
    config.PROJECT_DESCRIPTION = config.PROJECT_DESCRIPTION || 'No description provided';
    config.PROJECT_ENVIRONMENT = config.PROJECT_ENVIRONMENT || 'development';
    config.GITHUB_BRANCH = config.GITHUB_BRANCH || 'main';
    config.SUPABASE_PROJECT_ID = config.SUPABASE_PROJECT_ID || 'not-configured';
    config.SUPABASE_URL = config.SUPABASE_URL || 'https://not-configured.supabase.co';
    config.SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || 'not-configured';
  }

  async loadRegistry() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load registry: ${error.message}`);
    }
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

  async createAppDirectory(appId) {
    const appDir = path.join(this.applicationsDir, appId);
    
    try {
      await fs.mkdir(appDir, { recursive: true });
      await fs.mkdir(path.join(appDir, 'credentials'), { recursive: true });
      await fs.mkdir(path.join(appDir, 'sync'), { recursive: true });
      await fs.mkdir(path.join(appDir, 'codebase'), { recursive: true });
      console.log(`📁 Created application directory: ${appId}`);
    } catch (error) {
      console.warn(`⚠️  Directory creation issue: ${error.message}`);
    }
  }

  async registerApplication(registry, appId, config) {
    // Create application entry
    registry.applications[appId] = {
      id: appId,
      name: config.PROJECT_NAME,
      description: config.PROJECT_DESCRIPTION,
      github_repo: `${config.GITHUB_OWNER}/${config.GITHUB_REPO}`,
      github_branch: config.GITHUB_BRANCH,
      supabase_project_id: config.SUPABASE_PROJECT_ID,
      supabase_url: config.SUPABASE_URL,
      status: 'active',
      environment: config.PROJECT_ENVIRONMENT,
      registered_at: new Date().toISOString(),
      registered_by: 'ENV_REGISTRATION'
    };

    // Store credentials if provided
    if (config.GITHUB_PAT || config.SUPABASE_ANON_KEY || config.SUPABASE_SERVICE_KEY) {
      const credentials = {};
      
      if (config.GITHUB_PAT) {
        credentials.github_pat = config.GITHUB_PAT;
      }
      if (config.SUPABASE_ANON_KEY && config.SUPABASE_ANON_KEY !== 'not-configured') {
        credentials.supabase_anon_key = config.SUPABASE_ANON_KEY;
      }
      if (config.SUPABASE_SERVICE_KEY) {
        credentials.supabase_service_key = config.SUPABASE_SERVICE_KEY;
      }

      // Encrypt and save credentials
      try {
        const encryptedCreds = encryption.encrypt(JSON.stringify(credentials));
        const credsPath = path.join(this.applicationsDir, appId, 'credentials', 'encrypted.json');
        await fs.writeFile(credsPath, JSON.stringify(encryptedCreds, null, 2));
        console.log('🔐 Credentials encrypted and saved');
      } catch (error) {
        console.warn('⚠️  Could not save credentials:', error.message);
      }
    }

    // Update registry metadata
    registry.metadata.total_apps = Object.keys(registry.applications).length;
    registry.metadata.active_apps = Object.values(registry.applications)
      .filter(app => app.status === 'active').length;
    registry.metadata.last_updated = new Date().toISOString();

    // Save registry
    await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
    console.log('✅ Registry updated successfully');
  }
}

// Run the registration
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const registration = new EnvProjectRegistration();
  registration.run().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

export default EnvProjectRegistration;