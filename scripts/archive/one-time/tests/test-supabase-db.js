#!/usr/bin/env node

/**
 * Supabase Database Connection Test for EHG Project
 */

import { exec  } from 'child_process';
import { promisify  } from 'util';
const execAsync = promisify(exec);

async function testSupabaseConnection() {
  console.log(`
╔════════════════════════════════════════════════╗
║     EHG Supabase Database Connection Test     ║
╚════════════════════════════════════════════════╝

Project: ehg
Supabase URL: https://dedlbzhpgkmetvhbkyzq.supabase.co
`);

  try {
    // Check if logged in
    console.log('1. Checking Supabase login status...');
    try {
      const { stdout: whoami } = await execAsync('supabase whoami', { timeout: 5000 });
      console.log(`   ✅ Logged in as: ${whoami.trim()}`);
    } catch (_error) {
      console.log('   ❌ Not logged in. Please run: supabase login');
      return;
    }

    // List projects
    console.log('\n2. Listing Supabase projects...');
    try {
      const { stdout: projects } = await execAsync('supabase projects list --output json', { timeout: 10000 });
      const projectList = JSON.parse(projects);
      
      // Look for our EHG project
      const ehgProject = projectList.find(p => 
        p.id === 'dedlbzhpgkmetvhbkyzq' || 
        p.name?.toLowerCase().includes('ehg')
      );
      
      if (ehgProject) {
        console.log('   ✅ Found EHG project:');
        console.log(`      Name: ${ehgProject.name}`);
        console.log(`      ID: ${ehgProject.id}`);
        console.log(`      Region: ${ehgProject.region}`);
        console.log(`      Status: ${ehgProject.status || 'active'}`);
      } else {
        console.log('   ⚠️  EHG project not found in your Supabase account');
        console.log(`   Available projects: ${projectList.length}`);
      }
    } catch (_error) {
      console.log(`   ⚠️  Could not list projects: ${error.message}`);
    }

    // Link to project
    console.log('\n3. Linking to EHG project...');
    console.log('   To link this directory to the Supabase project, run:');
    console.log('   supabase link --project-ref dedlbzhpgkmetvhbkyzq');
    
    // Check if already linked
    try {
      const { stdout: status } = await execAsync('supabase status --output json', { timeout: 5000 });
      const statusData = JSON.parse(status);
      if (statusData.projectRef === 'dedlbzhpgkmetvhbkyzq') {
        console.log('   ✅ Already linked to EHG project!');
      }
    } catch {
      console.log('   ℹ️  Not currently linked to any project');
    }

    console.log('\n✅ Supabase test complete!');
    console.log('\nNext steps:');
    console.log('1. Link to project: supabase link --project-ref dedlbzhpgkmetvhbkyzq');
    console.log('2. Pull database schema: supabase db pull');
    console.log('3. Start local development: supabase start');

  } catch (_error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testSupabaseConnection();