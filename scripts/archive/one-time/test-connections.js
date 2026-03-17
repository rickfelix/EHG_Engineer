#!/usr/bin/env node

/**
 * LEO Protocol - Connection Tester
 * Tests GitHub and Supabase connections for registered projects
 */

import fs from 'fs/promises';
import path from 'path';
import { exec  } from 'child_process';
import { promisify  } from 'util';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const execAsync = promisify(exec);

class ConnectionTester {
  constructor() {
    this.registryPath = path.join(__dirname, '../applications/registry.json');
  }

  async run() {
    console.log(`
╔════════════════════════════════════════════════╗
║      LEO Protocol - Connection Tester         ║
╚════════════════════════════════════════════════╝
`);

    try {
      const registry = await this.loadRegistry();
      const apps = registry.applications;
      
      for (const appId in apps) {
        const app = apps[appId];
        console.log('\n═══════════════════════════════════════════════');
        console.log(`Testing: ${app.name} (${appId})`);
        console.log('═══════════════════════════════════════════════');
        
        await this.testGitHub(app);
        await this.testSupabase(app);
      }
      
      console.log('\n✅ Connection tests complete!\n');
      
    } catch (_error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  }

  async loadRegistry() {
    const data = await fs.readFile(this.registryPath, 'utf8');
    return JSON.parse(data);
  }

  async testGitHub(app) {
    console.log('\n🔗 GitHub Connection Test:');
    console.log(`   Repository: ${app.github_repo}`);
    
    // Fix the repo format issues
    let repoPath = app.github_repo;
    
    // Remove any https://github.com/ prefix if present
    repoPath = repoPath.replace('https://github.com/', '');
    repoPath = repoPath.replace('github.com/', '');
    
    // Remove .git suffix if present
    repoPath = repoPath.replace('.git', '');
    
    // Handle the double URL issue in APP003
    if (repoPath.includes('/https://')) {
      const parts = repoPath.split('/https://');
      repoPath = parts[0].replace('rickfelix/', '') || 'ehg';
      repoPath = `rickfelix/${repoPath}`;
    }
    
    console.log(`   Cleaned path: ${repoPath}`);
    
    // Test 1: Check if we can access the repo via GitHub API
    try {
      const apiUrl = `https://api.github.com/repos/${repoPath}`;
      const exists = await this.checkUrl(apiUrl);
      
      if (exists) {
        console.log('   ✅ Repository exists and is accessible');
        
        // Test 2: Check if we have git installed
        try {
          await execAsync('git --version');
          console.log('   ✅ Git is installed');
          
          // Test 3: Check if we can list remote (if in a git repo)
          try {
            const { stdout } = await execAsync('git remote -v');
            if (stdout.includes(repoPath.split('/')[1])) {
              console.log('   ✅ Local repository connected to GitHub');
            } else {
              console.log('   ⚠️  Local repository not connected to this GitHub repo');
            }
          } catch {
            console.log('   ℹ️  Not in a git repository or no remote configured');
          }
        } catch {
          console.log('   ⚠️  Git is not installed');
        }
      } else {
        console.log('   ❌ Repository not accessible (may be private or not exist)');
      }
    } catch (_error) {
      console.log(`   ❌ Could not verify repository: ${error.message}`);
    }
  }

  async testSupabase(app) {
    console.log('\n🗄️  Supabase Connection Test:');
    
    // Check if this is a placeholder
    if (app.supabase_url === 'https://placeholder.supabase.co' || 
        app.supabase_url === 'https://not-used.supabase.co' ||
        app.supabase_project_id === 'placeholder-project-id' ||
        app.supabase_project_id === 'not-used') {
      console.log('   ℹ️  Placeholder values detected - skipping Supabase test');
      return;
    }
    
    console.log(`   URL: ${app.supabase_url || app.supabase_project_id}`);
    
    // Test Supabase URL
    const supabaseUrl = app.supabase_url || app.supabase_project_id;
    
    if (supabaseUrl && supabaseUrl.startsWith('https://')) {
      try {
        const exists = await this.checkUrl(supabaseUrl);
        if (exists) {
          console.log('   ✅ Supabase project URL is accessible');
          
          // Check if we have Supabase CLI
          try {
            await execAsync('supabase --version');
            console.log('   ✅ Supabase CLI is installed');
          } catch {
            console.log('   ⚠️  Supabase CLI not installed (optional)');
          }
        } else {
          console.log('   ⚠️  Supabase URL not responding (may require authentication)');
        }
      } catch (_error) {
        console.log(`   ⚠️  Could not verify Supabase: ${error.message}`);
      }
    } else {
      console.log('   ℹ️  No valid Supabase URL configured');
    }
  }

  checkUrl(url) {
    return new Promise((resolve) => {
      https.get(url, { 
        headers: { 'User-Agent': 'LEO-Protocol-Tester' },
        timeout: 5000 
      }, (res) => {
        resolve(res.statusCode < 500);
      }).on('error', () => {
        resolve(false);
      });
    });
  }
}

// Run the tester
if (import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}`) {
  const tester = new ConnectionTester();
  tester.run().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

export default ConnectionTester;