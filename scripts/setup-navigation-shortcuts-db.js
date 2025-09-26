#!/usr/bin/env node

/**
 * Setup Navigation Shortcuts Database Tables
 * SD-002 Sprint 3: Database Integration for AI Navigation
 *
 * This script provides the SQL and instructions for setting up
 * the navigation shortcuts tables in Supabase.
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

async function setupNavigationShortcutsDB() {
  console.log('🔧 Navigation Shortcuts Database Setup\n');
  console.log('SD-002 Sprint 3: Database Integration for AI Navigation\n');

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
  console.log('2. Copy the SQL below');
  console.log('3. Paste it into the SQL Editor');
  console.log('4. Click "Run" to create navigation shortcuts tables');
  console.log('5. Restart the EHG_Engineer server to enable database integration\n');
  console.log('='.repeat(60));

  // Read and display the SQL for convenience
  try {
    const sqlPath = path.join(process.cwd(), 'database', 'schema', '014_navigation_shortcuts_schema.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    console.log('\nSQL TO EXECUTE:');
    console.log('='.repeat(60));
    console.log(sql);
    console.log('='.repeat(60));

    // Try to open the browser automatically (optional)
    try {
      console.log('\n🌐 Attempting to open Supabase dashboard...');
      const { exec } = require('child_process');

      // Determine the correct command based on platform
      let openCommand;
      switch (process.platform) {
        case 'darwin':  // macOS
          openCommand = 'open';
          break;
        case 'win32':   // Windows
          openCommand = 'start';
          break;
        default:        // Linux and others
          openCommand = 'xdg-open';
      }

      exec(`${openCommand} "${dashboardUrl}"`, (error) => {
        if (error) {
          console.log('⚠️  Could not auto-open browser. Please visit the URL manually.');
        } else {
          console.log('✅ Supabase dashboard opened in browser');
        }
      });
    } catch (browserError) {
      console.log('⚠️  Could not auto-open browser. Please visit the URL manually.');
    }

    console.log('\n📋 AFTER RUNNING THE SQL:');
    console.log('='.repeat(60));
    console.log('1. Verify tables created successfully');
    console.log('2. Check that default shortcuts (1-9) are inserted');
    console.log('3. Restart your EHG_Engineer server:');
    console.log('   - Kill current server (Ctrl+C)');
    console.log('   - Run: PORT=3000 node server.js');
    console.log('4. Test shortcut customization in the application');
    console.log('5. Verify persistence across browser sessions\n');

    console.log('🎯 EXPECTED RESULTS:');
    console.log('='.repeat(60));
    console.log('- ✅ navigation_shortcuts table with 9 default shortcuts');
    console.log('- ✅ user_shortcut_preferences table (empty initially)');
    console.log('- ✅ navigation_telemetry table for usage tracking');
    console.log('- ✅ 4 database functions for shortcut management');
    console.log('- ✅ Proper indexes for performance');
    console.log('- ✅ Triggers for timestamp updates\n');

    console.log('🚀 Sprint 3 Features Enabled:');
    console.log('='.repeat(60));
    console.log('- Database persistence for user shortcut customizations');
    console.log('- Seamless fallback to localStorage when database unavailable');
    console.log('- Usage analytics and telemetry tracking');
    console.log('- Enhanced keyboard shortcuts (Cmd+1-9) with full customization');
    console.log('- Cross-device synchronization (when user authentication added)');

  } catch (error) {
    console.error('❌ Error reading SQL file:', error.message);
    console.log('\n🔍 Make sure the following file exists:');
    console.log('   database/schema/014_navigation_shortcuts_schema.sql');
    process.exit(1);
  }
}

// Run the setup
setupNavigationShortcutsDB().catch(error => {
  console.error('Failed to setup navigation shortcuts database:', error);
  process.exit(1);
});