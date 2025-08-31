#!/usr/bin/env node

/**
 * Query all pending Strategic Directives
 * Per LEO Protocol v3.1.5
 */

const { createClient } = require('@supabase/supabase-js');
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

async function queryPendingDirectives() {
  const timestamp = new Date().toISOString();
  console.log(`Query Timestamp (UTC): ${timestamp}`);
  console.log('=====================================\n');

  try {
    // Query directives with pending statuses
    const validPendingStatuses = ['draft', 'active', 'in_review', 'conditional_approval'];
    
    const { data: directives, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, execution_order, priority, category')
      .in('status', validPendingStatuses)
      .order('execution_order', { ascending: true });

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('⚠️  Table strategic_directives_v2 does not exist yet');
        console.log('📋 Please run "npm run setup-db" first');
        console.log('   Then manually execute SQL in Supabase dashboard if needed');
        process.exit(1);
      }
      console.error('Query error:', error);
      process.exit(1);
    }

    // Display results
    console.log('PENDING STRATEGIC DIRECTIVES');
    console.log('=============================\n');
    
    if (!directives || directives.length === 0) {
      console.log('No pending directives found.');
      console.log('✅ Database is ready for first Strategic Directive');
      return { directives: [], count: 0 };
    }

    // Output in table format
    directives.forEach((sd, index) => {
      console.log(`${index + 1}. ${sd.id}`);
      console.log(`   Title: ${sd.title}`);
      console.log(`   Status: ${sd.status}`);
      console.log(`   Priority: ${sd.priority}`);
      console.log(`   Category: ${sd.category}`);
      console.log(`   Execution Order: ${sd.execution_order}`);
      console.log('');
    });

    console.log('=============================');
    console.log(`Total Pending Directives: ${directives.length}`);
    
    return { directives, count: directives.length };
    
  } catch (error) {
    console.error('❌ Error querying directives:', error.message);
    process.exit(1);
  }
}

// Run the query
queryPendingDirectives().catch(console.error);