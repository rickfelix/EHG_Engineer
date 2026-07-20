#!/usr/bin/env node

/**
 * Query all pending Strategic Directives
 * Per LEO Protocol v3.1.5
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — this lists + counts EVERY pending
// SD across 4 non-terminal statuses; strategic_directives_v2 is a growing table, so a capped read
// would silently under-report the pending directive count and listing.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
dotenv.config();

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
    
    // NOTE (FR-6 batch 9): the prior PGRST116 ("relation does not exist") special-case branch
    // relied on Supabase's structured `error.code`, which fetchAllPaginated's thrown Error does
    // not carry (page errors are folded into a single message string). That branch was a
    // first-run/bootstrap nicety for a table that is now central everywhere in this repo; a
    // generic query-error exit still surfaces the underlying message.
    let directives;
    try {
      directives = await fetchAllPaginated(() => supabase
        .from('strategic_directives_v2')
        .select('id, title, status, sequence_rank, priority, category')
        .in('status', validPendingStatuses)
        .order('sequence_rank', { ascending: true })
        .order('id', { ascending: true }));
    } catch (error) {
      console.error('Query error:', error.message);
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
      console.log(`   Execution Order: ${sd.sequence_rank}`);
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