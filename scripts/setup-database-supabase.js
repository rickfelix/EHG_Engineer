#!/usr/bin/env node

/**
 * Open Supabase Dashboard for database setup
 * This script provides the SQL and instructions for setting up the database
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

async function setupSupabaseDatabase() {
  console.log('🔧 EHG_Engineer Database Setup Helper\n');
  
  // Extract project ID from URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.log('❌ Missing Supabase URL in .env file');
    process.exit(1);
  }
  
  // Extract project ID from URL (format: https://[project-id].supabase.co)
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) {
    console.log('❌ Invalid Supabase URL format');
    process.exit(1);
  }
  
  const projectId = match[1];
  const dashboardUrl = `https://supabase.com/dashboard/project/${projectId}/sql/new`;
  
  console.log('📋 Project ID:', projectId);
  console.log('🔗 Dashboard URL:', dashboardUrl);
  console.log('\n' + '='.repeat(60));
  console.log('INSTRUCTIONS:');
  console.log('='.repeat(60));
  console.log('\n1. Opening your Supabase SQL Editor...');
  console.log('2. Copy the SQL from: database/schema/001_initial_schema.sql');
  console.log('3. Paste it into the SQL Editor');
  console.log('4. Click "Run" to create all tables\n');
  console.log('='.repeat(60));
  
  // Read and display the SQL for convenience
  try {
    const sqlPath = path.join(process.cwd(), 'database', 'schema', '001_initial_schema.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');
    
    console.log('\nSQL TO EXECUTE:');
    console.log('='.repeat(60));
    console.log(sql.substring(0, 500) + '...\n');
    console.log('(Full SQL available in database/schema/001_initial_schema.sql)');
    console.log('='.repeat(60));
  } catch (error) {
    console.log('⚠️ Could not read SQL file:', error.message);
  }
  
  // Try to open the browser
  console.log('\n🌐 Opening Supabase Dashboard in your browser...');
  
  const platform = process.platform;
  let command;
  
  if (platform === 'win32') {
    command = `start ${dashboardUrl}`;
  } else if (platform === 'darwin') {
    command = `open ${dashboardUrl}`;
  } else {
    command = `xdg-open ${dashboardUrl}`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.log('\n⚠️ Could not open browser automatically.');
      console.log('Please open this URL manually:');
      console.log(dashboardUrl);
    } else {
      console.log('✅ Browser opened successfully!');
    }
    
    console.log('\n📋 After creating tables, run:');
    console.log('   npm run test-database');
    console.log('\nto verify the setup is complete.');
  });
}

setupSupabaseDatabase();