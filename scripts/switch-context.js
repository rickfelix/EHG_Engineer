#!/usr/bin/env node

/**
 * Context Switching Script
 * LEO Protocol v3.1.5 - Multi-Application Management
 * Switch between different application contexts
 */

import { createSupabaseClient } from '../lib/supabase-client.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

class ContextSwitcher {
  constructor() {
    this.contextPath = path.join(__dirname, '../.leo-context');
    this.registryPath = path.join(__dirname, '../applications/registry.json');
    this.envPath = path.join(__dirname, '../.env');
    this.supabase = createSupabaseClient();
  }

  async getCurrentContext() {
    try {
      const context = await fs.readFile(this.contextPath, 'utf8');
      return context.trim();
    } catch (_error) {
      return null;
    }
  }

  async loadRegistry() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Failed to load registry:', error.message);
      return { applications: {} };
    }
  }

  async validateAppId(appId) {
    const registry = await this.loadRegistry();
    
    if (!registry.applications[appId]) {
      console.error(`❌ Application ${appId} not found in registry`);
      console.log('\nAvailable applications:');
      Object.entries(registry.applications).forEach(([id, app]) => {
        console.log(`  ${id}: ${app.name} (${app.status})`);
      });
      return false;
    }
    
    if (registry.applications[appId].status !== 'active') {
      console.warn(`⚠️  Application ${appId} is ${registry.applications[appId].status}`);
    }
    
    return true;
  }

  async loadAppConfig(appId) {
    const configPath = path.join(__dirname, `../applications/${appId}/config.json`);
    try {
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to load config for ${appId}:`, error.message);
      return null;
    }
  }

  async updateEnvironmentVariables(appId, config) {
    try {
      // Load current .env
      let envContent = '';
      try {
        envContent = await fs.readFile(this.envPath, 'utf8');
      } catch (_error) {
        // .env doesn't exist, create new content
      }
      
      // Parse current env
      const envLines = envContent.split('\n');
      const envVars = {};
      
      envLines.forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key) {
            envVars[key] = valueParts.join('=');
          }
        }
      });
      
      // Update with app-specific values
      envVars['CURRENT_APP'] = appId;
      envVars['CURRENT_APP_NAME'] = config.name;
      envVars['CURRENT_APP_GITHUB_REPO'] = `${config.github.owner}/${config.github.repo}`;
      envVars['CURRENT_APP_GITHUB_BRANCH'] = config.github.branch;
      envVars['CURRENT_APP_SUPABASE_PROJECT'] = config.supabase.project_id;
      envVars['CURRENT_APP_SUPABASE_URL'] = config.supabase.url;
      envVars['CURRENT_APP_ENVIRONMENT'] = config.environment || 'development';
      
      // Rebuild .env content
      const newEnvContent = [
        '# Multi-Application Context',
        `# Current Application: ${appId}`,
        `# Switched at: ${new Date().toISOString()}`,
        '',
        ...Object.entries(envVars).map(([key, value]) => `${key}=${value}`),
        ''
      ].join('\n');
      
      await fs.writeFile(this.envPath, newEnvContent);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to update environment variables:', error.message);
      return false;
    }
  }

  async recordContextSwitch(fromApp, toApp) {
    try {
      // Record in database
      const { error } = await this.supabase
        .from('application_context')
        .insert({
          session_id: `session-${Date.now()}`,
          current_application_id: toApp,
          previous_application_id: fromApp,
          context_data: {
            timestamp: new Date().toISOString(),
            user: process.env.USER || 'unknown'
          },
          switched_by: 'HUMAN'
        });
      
      if (error) {
        console.warn('⚠️  Failed to record context switch in database:', error.message);
      }
    } catch (error) {
      // Database recording is optional, don't fail the switch
      console.warn('⚠️  Could not record context switch:', error.message);
    }
  }

  async switchContext(targetAppId) {
    console.log(`\n🔄 Switching to application: ${targetAppId}`);
    
    // Validate app exists
    const isValid = await this.validateAppId(targetAppId);
    if (!isValid) {
      return false;
    }
    
    // Get current context
    const currentContext = await this.getCurrentContext();
    
    if (currentContext === targetAppId) {
      console.log(`✅ Already in context: ${targetAppId}`);
      return true;
    }
    
    // Load app config
    const config = await this.loadAppConfig(targetAppId);
    if (!config) {
      return false;
    }
    
    // Update context file
    await fs.writeFile(this.contextPath, targetAppId);
    
    // Update environment variables
    await this.updateEnvironmentVariables(targetAppId, config);
    
    // Record switch in database
    await this.recordContextSwitch(currentContext, targetAppId);
    
    // Display new context info
    console.log(`
╔══════════════════════════════════════════════╗
║         Context Switch Complete ✅            ║
╚══════════════════════════════════════════════╝

Previous Context: ${currentContext || 'none'}
Current Context:  ${targetAppId}

Application: ${config.name}
Repository:  ${config.github.owner}/${config.github.repo}
Environment: ${config.environment}
Supabase:    ${config.supabase.project_id}

All LEO Protocol operations will now target: ${targetAppId}
    `);
    
    return true;
  }

  async showCurrentContext() {
    const current = await this.getCurrentContext();
    
    if (!current) {
      console.log('❌ No application context set');
      console.log('Run: npm run switch-context <APP-ID>');
      return;
    }
    
    const config = await this.loadAppConfig(current);
    if (!config) {
      console.log(`⚠️  Context set to ${current} but config not found`);
      return;
    }
    
    console.log(`
╔══════════════════════════════════════════════╗
║          Current Application Context          ║
╚══════════════════════════════════════════════╝

App ID:      ${current}
Name:        ${config.name}
Repository:  ${config.github.owner}/${config.github.repo}
Branch:      ${config.github.branch}
Environment: ${config.environment}
Supabase:    ${config.supabase.project_id}

Created:     ${config.created_at}
Created By:  ${config.created_by}
    `);
  }

  async listApplications() {
    const registry = await this.loadRegistry();
    const current = await this.getCurrentContext();
    
    console.log(`
╔══════════════════════════════════════════════╗
║         Registered Applications               ║
╚══════════════════════════════════════════════╝
    `);
    
    if (Object.keys(registry.applications).length === 0) {
      console.log('No applications registered yet.');
      console.log('Run: npm run register-app');
      return;
    }
    
    Object.entries(registry.applications).forEach(([id, app]) => {
      const marker = id === current ? '→' : ' ';
      const status = app.status === 'active' ? '🟢' : '🔴';
      console.log(`${marker} ${id}: ${app.name} ${status} (${app.environment})`);
      console.log(`    Repo: ${app.github_repo}`);
      console.log(`    Supabase: ${app.supabase_project_id}`);
      console.log('');
    });
    
    console.log(`Total: ${registry.metadata.total_apps} apps (${registry.metadata.active_apps} active)`);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}`) {
  const switcher = new ContextSwitcher();
  const command = process.argv[2];
  
  async function run() {
    switch (command) {
      case 'show':
      case 'current':
        await switcher.showCurrentContext();
        break;
        
      case 'list':
      case 'ls':
        await switcher.listApplications();
        break;
        
      default:
        if (command) {
          // Treat as app ID to switch to
          await switcher.switchContext(command);
        } else {
          console.log(`
Context Switching - LEO Protocol v3.1.5

Usage:
  node switch-context.js <command>
  node switch-context.js <APP-ID>

Commands:
  show/current    Show current context
  list/ls         List all applications
  <APP-ID>        Switch to application

Examples:
  node switch-context.js APP001
  node switch-context.js show
  node switch-context.js list
          `);
        }
    }
  }
  
  run().catch(console.error);
}

export default ContextSwitcher;