#!/usr/bin/env node

/**
 * LEO Protocol - EHG Project Connection Tester
 * Tests GitHub and Supabase connections specifically for the EHG project
 */

import { exec  } from 'child_process';
import { promisify  } from 'util';
import https from 'https';

const execAsync = promisify(exec);

class EHGConnectionTester {
  constructor() {
    // EHG project details - UPDATED to use correct database
    // IMPORTANT: This is the EHG project database, NOT the EHG_Engineer database
    this.project = {
      name: 'ehg',
      github_repo: 'rickfelix/ehg',
      supabase_url: 'https://liapbndqlqxdcgpwntbv.supabase.co',
      supabase_project_id: 'liapbndqlqxdcgpwntbv',
      supabase_name: 'ehg'  // The actual project database
    };
  }

  async run() {
    console.log(`
╔════════════════════════════════════════════════╗
║      EHG Project - Connection Test            ║
╚════════════════════════════════════════════════╝

Project: ${this.project.name}
GitHub: ${this.project.github_repo}
Supabase: ${this.project.supabase_url}
`);

    console.log('═══════════════════════════════════════════════\n');
    
    // Test GitHub
    await this.testGitHub();
    
    console.log('\n═══════════════════════════════════════════════\n');
    
    // Test Supabase
    await this.testSupabase();
    
    console.log('\n═══════════════════════════════════════════════\n');
    
    // Test Current Git Status
    await this.testLocalGit();
    
    console.log('\n✅ EHG connection tests complete!\n');
  }

  async testGitHub() {
    console.log('🔗 GITHUB CONNECTION TEST\n');
    
    // Test 1: Check if repository exists
    console.log('1. Checking if repository exists...');
    try {
      const apiUrl = `https://api.github.com/repos/${this.project.github_repo}`;
      const response = await this.fetchGitHubAPI(apiUrl);
      
      if (response) {
        console.log(`   ✅ Repository exists: github.com/${this.project.github_repo}`);
        console.log(`   📝 Description: ${response.description || 'No description'}`);
        console.log(`   ⭐ Stars: ${response.stargazers_count}`);
        console.log(`   🔀 Default branch: ${response.default_branch}`);
        console.log(`   📅 Last updated: ${new Date(response.updated_at).toLocaleDateString()}`);
      } else {
        console.log('   ❌ Could not access repository (may be private)');
      }
    } catch (error) {
      console.log(`   ❌ Error checking repository: ${error.message}`);
    }
    
    // Test 2: Check git CLI
    console.log('\n2. Checking Git CLI...');
    try {
      const { stdout } = await execAsync('git --version');
      console.log(`   ✅ Git installed: ${stdout.trim()}`);
    } catch {
      console.log('   ❌ Git CLI not installed');
    }
    
    // Test 3: Check GitHub CLI
    console.log('\n3. Checking GitHub CLI...');
    try {
      const { stdout } = await execAsync('gh --version');
      console.log(`   ✅ GitHub CLI installed: ${stdout.split('\n')[0]}`);
      
      // Check authentication
      try {
        await execAsync('gh auth status');
        console.log('   ✅ GitHub CLI authenticated');
      } catch {
        console.log('   ⚠️  GitHub CLI not authenticated (run: gh auth login)');
      }
    } catch {
      console.log('   ℹ️  GitHub CLI not installed (optional)');
    }
  }

  async testSupabase() {
    console.log('🗄️  SUPABASE CONNECTION TEST\n');
    
    // Test 1: Check if Supabase URL is accessible
    console.log('1. Checking Supabase project URL...');
    try {
      const exists = await this.checkUrl(this.project.supabase_url);
      if (exists) {
        console.log('   ✅ Supabase URL is accessible');
        console.log(`   📎 URL: ${this.project.supabase_url}`);
        console.log(`   🆔 Project ID: ${this.project.supabase_project_id}`);
      } else {
        console.log('   ⚠️  Supabase URL not responding (may require auth)');
      }
    } catch (error) {
      console.log(`   ❌ Error checking Supabase: ${error.message}`);
    }
    
    // Test 2: Check Supabase CLI
    console.log('\n2. Checking Supabase CLI...');
    try {
      const { stdout } = await execAsync('supabase --version');
      console.log(`   ✅ Supabase CLI installed: ${stdout.trim()}`);
      
      // Check if we're logged in
      try {
        const { stdout: projectsList } = await execAsync('supabase projects list 2>&1', { timeout: 5000 });
        if (projectsList.includes('You need to be logged in')) {
          console.log('   ⚠️  Not logged in to Supabase (run: supabase login)');
        } else {
          console.log('   ✅ Logged in to Supabase');
        }
      } catch (error) {
        if (error.message.includes('You need to be logged in')) {
          console.log('   ⚠️  Not logged in to Supabase (run: supabase login)');
        } else {
          console.log('   ℹ️  Could not check login status');
        }
      }
    } catch {
      console.log('   ❌ Supabase CLI not installed');
      console.log('   💡 Install with: wget -qO- https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar xvz && sudo mv supabase /usr/local/bin/');
    }
    
    // Test 3: Check if we can connect to the database
    console.log('\n3. Testing database connection...');
    console.log('   ℹ️  To test database connection, you need:');
    console.log('      - Supabase service role key or anon key');
    console.log('      - Database password (if using direct connection)');
  }

  async testLocalGit() {
    console.log('📁 LOCAL GIT STATUS\n');
    
    try {
      // Check current branch
      const { stdout: branch } = await execAsync('git branch --show-current');
      console.log(`   🌿 Current branch: ${branch.trim()}`);
      
      // Check remote
      const { stdout: remote } = await execAsync('git remote -v');
      if (remote.includes('rickfelix/ehg')) {
        console.log('   ✅ Connected to correct GitHub repository');
      } else if (remote) {
        console.log('   ⚠️  Connected to different repository:');
        console.log(`      ${remote.split('\n')[0]}`);
      } else {
        console.log('   ❌ No remote repository configured');
      }
      
      // Check status
      const { stdout: status } = await execAsync('git status --porcelain');
      const changes = status.trim().split('\n').filter(line => line.trim());
      if (changes.length > 0) {
        console.log(`   📝 Uncommitted changes: ${changes.length} files`);
      } else {
        console.log('   ✅ Working directory clean');
      }
      
    } catch (error) {
      console.log(`   ❌ Not a git repository or git error: ${error.message}`);
    }
  }

  fetchGitHubAPI(url) {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'LEO-Protocol-EHG-Tester',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    });
  }

  checkUrl(url) {
    return new Promise((resolve) => {
      https.get(url, { 
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
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new EHGConnectionTester();
  tester.run().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

export default EHGConnectionTester;