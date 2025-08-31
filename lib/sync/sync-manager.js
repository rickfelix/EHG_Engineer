#!/usr/bin/env node

/**
 * Synchronization Manager for Multi-Application Management
 * LEO Protocol v3.1.5 - Orchestrates GitHub and Supabase sync
 * Uses CLI tools (gh, supabase) for synchronization
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const execAsync = promisify(exec);

class SyncManager {
  constructor() {
    this.applicationsDir = path.join(__dirname, '../../applications');
    this.registryPath = path.join(this.applicationsDir, 'registry.json');
    this.contextPath = path.join(__dirname, '../../.leo-context');
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  async getCurrentApp() {
    try {
      const context = await fs.readFile(this.contextPath, 'utf8');
      return context.trim();
    } catch (error) {
      throw new Error('No application context set. Run: npm run switch-context <APP-ID>');
    }
  }

  async loadAppConfig(appId) {
    const configPath = path.join(this.applicationsDir, appId, 'config.json');
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  }

  async recordSyncHistory(appId, syncType, status, details = {}) {
    try {
      await this.supabase
        .from('application_sync_history')
        .insert({
          application_id: appId,
          sync_type: syncType,
          sync_status: status,
          sync_details: details,
          initiated_by: process.env.USER || 'HUMAN',
          started_at: new Date().toISOString()
        });
    } catch (error) {
      console.warn('⚠️  Failed to record sync history:', error.message);
    }
  }

  /**
   * Sync with GitHub repository
   */
  async syncGitHub(appId, direction = 'pull') {
    const config = await this.loadAppConfig(appId);
    const codebasePath = path.join(this.applicationsDir, appId, 'codebase');
    
    console.log(`\n🔄 GitHub Sync: ${direction.toUpperCase()}`);
    console.log(`Repository: ${config.github.full_repo}`);
    
    try {
      // Check if codebase exists
      await fs.access(codebasePath);
    } catch (error) {
      console.error('❌ Codebase directory not found. Clone repository first.');
      return false;
    }
    
    const startTime = Date.now();
    
    try {
      if (direction === 'pull') {
        // Fetch latest changes
        console.log('📥 Fetching latest changes...');
        await execAsync(`cd ${codebasePath} && git fetch origin ${config.github.branch}`);
        
        // Check for changes
        const { stdout: status } = await execAsync(`cd ${codebasePath} && git status -uno`);
        
        if (status.includes('Your branch is behind')) {
          // Pull changes
          console.log('⬇️  Pulling changes...');
          const { stdout: pullResult } = await execAsync(
            `cd ${codebasePath} && git pull origin ${config.github.branch}`
          );
          
          // Count changed files
          const filesChanged = (pullResult.match(/\d+ file/g) || []).length;
          
          console.log(`✅ Pulled ${filesChanged} file(s) from GitHub`);
          
          await this.recordSyncHistory(appId, 'github_pull', 'success', {
            branch: config.github.branch,
            files_changed: filesChanged,
            duration_ms: Date.now() - startTime
          });
        } else {
          console.log('✅ Already up to date');
        }
        
      } else if (direction === 'push') {
        // Check for local changes
        const { stdout: status } = await execAsync(`cd ${codebasePath} && git status --porcelain`);
        
        if (status.trim()) {
          // Stage changes
          console.log('📝 Staging changes...');
          await execAsync(`cd ${codebasePath} && git add .`);
          
          // Commit
          const message = `chore: sync from EHG_Engineer [${appId}]`;
          await execAsync(`cd ${codebasePath} && git commit -m "${message}"`);
          
          // Push
          console.log('⬆️  Pushing to GitHub...');
          await execAsync(`cd ${codebasePath} && git push origin ${config.github.branch}`);
          
          console.log('✅ Pushed changes to GitHub');
          
          // Use GitHub CLI to create PR if on feature branch
          if (config.github.branch !== 'main' && config.github.branch !== 'master') {
            console.log('📋 Creating Pull Request...');
            const { stdout: prUrl } = await execAsync(
              `cd ${codebasePath} && gh pr create --title "Updates from EHG_Engineer" --body "Automated sync from ${appId}" --base main`
            );
            console.log(`✅ PR created: ${prUrl}`);
          }
          
          await this.recordSyncHistory(appId, 'github_push', 'success', {
            branch: config.github.branch,
            duration_ms: Date.now() - startTime
          });
        } else {
          console.log('✅ No changes to push');
        }
      }
      
      // Check CI status
      console.log('\n🔍 Checking CI status...');
      try {
        const { stdout: runList } = await execAsync(
          `cd ${codebasePath} && gh run list --branch ${config.github.branch} --limit 1`
        );
        console.log(runList);
      } catch (error) {
        console.log('ℹ️  No CI runs found');
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ GitHub sync failed: ${error.message}`);
      await this.recordSyncHistory(appId, `github_${direction}`, 'failed', {
        error: error.message,
        duration_ms: Date.now() - startTime
      });
      return false;
    }
  }

  /**
   * Sync with Supabase database
   */
  async syncSupabase(appId, direction = 'pull') {
    const config = await this.loadAppConfig(appId);
    
    console.log(`\n🗄️  Supabase Sync: ${direction.toUpperCase()}`);
    console.log(`Project: ${config.supabase.project_id}`);
    
    const startTime = Date.now();
    
    try {
      // Check if Supabase CLI is available
      await execAsync('supabase --version');
    } catch (error) {
      console.warn('⚠️  Supabase CLI not found. Install with: npm install -g supabase');
      return false;
    }
    
    try {
      const codebasePath = path.join(this.applicationsDir, appId, 'codebase');
      
      if (direction === 'pull') {
        // Pull database changes
        console.log('📥 Pulling database schema...');
        
        // Initialize Supabase in codebase if needed
        try {
          await execAsync(`cd ${codebasePath} && supabase init`);
        } catch (error) {
          // Already initialized
        }
        
        // Link to project
        await execAsync(
          `cd ${codebasePath} && supabase link --project-ref ${config.supabase.project_id}`
        );
        
        // Pull schema
        const { stdout } = await execAsync(`cd ${codebasePath} && supabase db pull`);
        console.log(stdout);
        
        console.log('✅ Database schema pulled');
        
        await this.recordSyncHistory(appId, 'supabase_pull', 'success', {
          project_id: config.supabase.project_id,
          duration_ms: Date.now() - startTime
        });
        
      } else if (direction === 'push') {
        // Push database changes
        console.log('⬆️  Pushing database changes...');
        
        // Check for migrations
        const migrationsPath = path.join(codebasePath, 'supabase', 'migrations');
        
        try {
          const files = await fs.readdir(migrationsPath);
          if (files.length > 0) {
            // Push migrations
            const { stdout } = await execAsync(`cd ${codebasePath} && supabase db push`);
            console.log(stdout);
            console.log('✅ Database migrations pushed');
          } else {
            console.log('ℹ️  No migrations to push');
          }
        } catch (error) {
          console.log('ℹ️  No migrations directory found');
        }
        
        await this.recordSyncHistory(appId, 'supabase_push', 'success', {
          project_id: config.supabase.project_id,
          duration_ms: Date.now() - startTime
        });
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ Supabase sync failed: ${error.message}`);
      await this.recordSyncHistory(appId, `supabase_${direction}`, 'failed', {
        error: error.message,
        duration_ms: Date.now() - startTime
      });
      return false;
    }
  }

  /**
   * Full synchronization (GitHub + Supabase)
   */
  async fullSync(appId) {
    console.log(`
╔══════════════════════════════════════════════╗
║          Full Application Sync                ║
║              ${appId.padEnd(30)}    ║
╚══════════════════════════════════════════════╝
    `);
    
    const config = await this.loadAppConfig(appId);
    
    console.log(`Application: ${config.name}`);
    console.log(`Environment: ${config.environment}`);
    console.log(`Started: ${new Date().toISOString()}\n`);
    
    let githubSuccess = false;
    let supabaseSuccess = false;
    
    // GitHub Pull
    githubSuccess = await this.syncGitHub(appId, 'pull');
    
    // Supabase Pull
    supabaseSuccess = await this.syncSupabase(appId, 'pull');
    
    // Summary
    console.log(`
╔══════════════════════════════════════════════╗
║             Sync Summary                      ║
╚══════════════════════════════════════════════╝

GitHub:   ${githubSuccess ? '✅ Success' : '❌ Failed'}
Supabase: ${supabaseSuccess ? '✅ Success' : '❌ Failed'}

Next Steps:
1. Review changes: cd applications/${appId}/codebase && git status
2. Deploy SD: npm run deploy-sd ${appId}-SD-YYYY-MM-DD-A
3. Monitor CI: gh run watch
    `);
    
    await this.recordSyncHistory(appId, 'full_sync', 
      githubSuccess && supabaseSuccess ? 'success' : 'partial',
      {
        github: githubSuccess,
        supabase: supabaseSuccess
      }
    );
    
    return githubSuccess && supabaseSuccess;
  }

  /**
   * Sync all active applications
   */
  async syncAll() {
    const registryData = await fs.readFile(this.registryPath, 'utf8');
    const registry = JSON.parse(registryData);
    
    const activeApps = Object.entries(registry.applications)
      .filter(([_, app]) => app.status === 'active')
      .map(([id, _]) => id);
    
    if (activeApps.length === 0) {
      console.log('No active applications to sync');
      return;
    }
    
    console.log(`Syncing ${activeApps.length} active application(s)...\n`);
    
    const results = {};
    
    for (const appId of activeApps) {
      console.log(`\n${'='.repeat(50)}`);
      results[appId] = await this.fullSync(appId);
    }
    
    // Final summary
    console.log(`
╔══════════════════════════════════════════════╗
║          All Applications Sync Summary        ║
╚══════════════════════════════════════════════╝
    `);
    
    Object.entries(results).forEach(([appId, success]) => {
      console.log(`${appId}: ${success ? '✅ Success' : '❌ Failed'}`);
    });
  }
}

// CLI interface
if (require.main === module) {
  const syncManager = new SyncManager();
  
  async function run() {
    const command = process.argv[2];
    const appId = process.argv[3];
    
    try {
      switch (command) {
        case 'github-pull':
          await syncManager.syncGitHub(appId || await syncManager.getCurrentApp(), 'pull');
          break;
          
        case 'github-push':
          await syncManager.syncGitHub(appId || await syncManager.getCurrentApp(), 'push');
          break;
          
        case 'supabase-pull':
          await syncManager.syncSupabase(appId || await syncManager.getCurrentApp(), 'pull');
          break;
          
        case 'supabase-push':
          await syncManager.syncSupabase(appId || await syncManager.getCurrentApp(), 'push');
          break;
          
        case 'all':
          await syncManager.syncAll();
          break;
          
        default:
          if (command) {
            // Treat as app ID for full sync
            await syncManager.fullSync(command);
          } else {
            // Sync current context
            const currentApp = await syncManager.getCurrentApp();
            await syncManager.fullSync(currentApp);
          }
      }
    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      process.exit(1);
    }
  }
  
  run();
}

module.exports = SyncManager;