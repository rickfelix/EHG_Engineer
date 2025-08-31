#!/usr/bin/env node

/**
 * Update Strategic Directive status
 * Per LEO Protocol v3.1.5
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || 
    supabaseUrl === 'your_supabase_url_here' || 
    supabaseAnonKey === 'your_supabase_anon_key_here') {
  console.log('❌ Missing or placeholder Supabase credentials in .env file');
  console.log('Please update .env with your actual Supabase URL and API key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function updateDirectiveStatus(sdId, newStatus) {
  try {
    console.log(`Updating ${sdId} status to ${newStatus}...\n`);
    
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId)
      .select('id, title, status, execution_order, priority, category, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('⚠️  Table strategic_directives_v2 does not exist yet');
        console.log('📋 Please run "npm run setup-db" first');
        process.exit(1);
      }
      console.error('Update error:', error);
      process.exit(1);
    }

    if (data) {
      console.log(`✅ ${sdId} status updated to ${newStatus}`);
      console.log('Updated record:', JSON.stringify(data, null, 2));
      
      // Create evidence file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const evidenceDir = `verification-packages/${sdId}/${timestamp}/database-evidence`;
      await fs.mkdir(evidenceDir, { recursive: true });
      
      const verification = `${sdId} DATABASE ACTIVATION VERIFICATION
=============================================
UTC Timestamp: ${new Date().toISOString()}
Protocol: LEO v3.1.5

STATUS UPDATE
-------------
Previous Status: draft
Current Status: ${newStatus}
Update Timestamp: ${data.updated_at}

DATABASE RECORD
---------------
${JSON.stringify(data, null, 2)}

VERIFICATION
------------
Strategic Directive: ${sdId}
Title: ${data.title}
Execution Order: ${data.execution_order}
Priority: ${data.priority}
Category: ${data.category}

Signed: EXEC Agent
Date: ${new Date().toISOString().split('T')[0]}
`;
      
      const verificationPath = path.join(evidenceDir, 'sd-activation-verification.txt');
      await fs.writeFile(verificationPath, verification);
      console.log(`📄 Verification evidence saved to: ${verificationPath}`);
    }
    
  } catch (error) {
    console.error('Error updating directive status:', error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node scripts/update-directive-status.js <SD-ID> <new-status>');
  console.log('Example: node scripts/update-directive-status.js SD-2025-01-01-A active');
  process.exit(1);
}

const [sdId, newStatus] = args;
updateDirectiveStatus(sdId, newStatus);