#!/usr/bin/env node

/**
 * Add Strategic Directive to database
 * Per LEO Protocol v3.1.5
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function addSDToDatabase(sdId) {
  console.log(`📋 Adding ${sdId} to database...\n`);
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey || 
      supabaseUrl === 'your_supabase_url_here' || 
      supabaseKey === 'your_supabase_anon_key_here') {
    console.log('❌ Missing or placeholder Supabase credentials in .env file');
    console.log('Please update .env with your actual Supabase URL and API key');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Create SD entry in database
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: sdId,
        title: '[Enter Strategic Directive Title]',
        status: 'draft',
        category: 'strategic',
        priority: 'medium',
        description: 'Strategic directive created from template',
        rationale: 'To be filled in from strategic directive document',
        scope: 'To be defined in strategic directive document',
        created_by: 'LEAD',
        execution_order: 1,
        version: '1.0'
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('⚠️  Table strategic_directives_v2 does not exist');
        console.log('📋 Please run "npm run setup-db" first');
        console.log('   Then manually execute SQL in Supabase dashboard if needed');
      } else {
        console.error('❌ Database insert error:', error.message);
      }
      process.exit(1);
    }
    
    console.log(`✅ ${sdId} added to database successfully!`);
    console.log('Database record:', JSON.stringify(data, null, 2));
    
    console.log('\n📝 Next steps:');
    console.log('1. Edit the Strategic Directive file with real content');
    console.log('2. Update the database record with actual details');
    console.log('3. Create Epic Execution Sequences (EES)');
    console.log('4. Update status to "active" when ready:');
    console.log(`   npm run update-status ${sdId} active`);
    
  } catch (error) {
    console.error('❌ Error adding SD to database:', error.message);
    process.exit(1);
  }
}

// Get SD-ID from command line
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/add-sd-to-database.js <SD-ID>');
  console.log('Example: node scripts/add-sd-to-database.js SD-2025-01-15-A');
  process.exit(1);
}

const sdId = args[0];
addSDToDatabase(sdId);