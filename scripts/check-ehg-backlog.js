#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkEHGBacklog() {
  console.log('🔍 Analyzing backlog tables and looking for EHG_Backlog.csv data...\n');

  // Check sd_backlog_map structure
  const { data: mapData, count: mapCount, error: mapError } = await supabase
    .from('sd_backlog_map')
    .select('*', { count: 'exact' })
    .limit(10);

  if (!mapError) {
    console.log('📊 sd_backlog_map table:');
    console.log(`   Total rows: ${mapCount}`);

    if (mapData && mapData[0]) {
      const cols = Object.keys(mapData[0]);
      console.log(`   Columns (${cols.length}):`, cols.join(', '));

      // Check for import-related columns
      const importCols = cols.filter(c =>
        c.includes('import') || c.includes('source') || c.includes('csv') ||
        c.includes('file') || c.includes('original')
      );

      if (importCols.length > 0) {
        console.log('\n   📌 Import-related columns found:', importCols.join(', '));

        // Show unique values for these columns
        for (const col of importCols) {
          const values = [...new Set(mapData.map(r => r[col]).filter(Boolean))];
          if (values.length > 0) {
            console.log(`      ${col}: ${values.slice(0, 3).join(', ')}`);
          }
        }
      }

      // Show sample data to understand the structure
      console.log('\n   📋 Sample row with data:');
      const sampleRow = mapData.find(r => r.item_description) || mapData[0];
      for (const [key, value] of Object.entries(sampleRow)) {
        if (value !== null && value !== '' && key !== 'id') {
          console.log(`      ${key}: ${String(value).substring(0, 60)}`);
        }
      }
    }
  }

  // Check strategic_directives_backlog
  const { data: sdBacklog, count: sdCount, error: sdError } = await supabase
    .from('strategic_directives_backlog')
    .select('*', { count: 'exact' })
    .limit(2);

  if (!sdError) {
    console.log('\n📊 strategic_directives_backlog table:');
    console.log(`   Total rows: ${sdCount}`);
    if (sdBacklog && sdBacklog[0]) {
      const cols = Object.keys(sdBacklog[0]);
      console.log(`   Columns:`, cols.slice(0, 15).join(', ') + (cols.length > 15 ? '...' : ''));
    }
  }

  // Check if there's any view or table with EHG in the name
  console.log('\n🔍 Checking for EHG-specific tables or views...');

  const ehgTables = [
    'ehg_import_log',
    'ehg_backlog_import',
    'backlog_import_history',
    'csv_imports'
  ];

  for (const table of ehgTables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!error) {
        console.log(`   ✅ Found: ${table} (rows: ${count})`);
      }
    } catch (e) {
      // Table doesn't exist
    }
  }

  console.log('\n💡 Summary:');
  console.log('   The EHG_Backlog.csv data appears to be imported into the sd_backlog_map table');
  console.log('   This table contains the backlog items linked to Strategic Directives');
  console.log('   The CSV import process likely transforms the data into this database structure');

  if (mapCount) {
    console.log(`\n   Total backlog items in database: ${mapCount}`);
  }
}

checkEHGBacklog().catch(console.error);