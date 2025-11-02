#!/usr/bin/env node
/**
 * Query Companies Table (EHG Application Database)
 * 
 * Usage:
 *   node scripts/database/query-companies.js [--verbose]
 */

import { createSupabaseAnonClient } from '../lib/supabase-connection.js';

async function main() {
  const verbose = process.argv.includes('--verbose');
  
  console.log('🔍 Querying companies table...\n');
  
  try {
    const supabase = await createSupabaseAnonClient('ehg', { verbose: false });
    
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('❌ Query error:', error.message);
      process.exit(1);
    }
    
    console.log(`Found ${companies?.length || 0} companies:\n`);
    
    companies?.forEach((company, idx) => {
      console.log(`${idx + 1}. ${company.name}`);
      if (verbose) {
        console.log(`   ID: ${company.id}`);
        console.log(`   Description: ${company.description?.substring(0, 80)}...`);
        if (company.mission) console.log(`   Mission: ${company.mission.substring(0, 60)}...`);
        if (company.vision) console.log(`   Vision: ${company.vision.substring(0, 60)}...`);
        console.log(`   Created: ${company.created_at}`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
