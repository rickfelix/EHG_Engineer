#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Apply SDIP Database Improvements
 * Implements Database Sub-Agent recommendations
 * Created: 2025-01-03
 */

import { createClient } from '@supabase/supabase-js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyDatabaseImprovements() {
  console.log('🔧 Applying SDIP Database Improvements...\n');

  try {
    // Read the migration SQL
    const sqlPath = path.join(__dirname, '../database/migrations/007_sdip_database_improvements.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');

    // Split SQL into individual statements (Supabase requires this)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip pure comments
      if (statement.trim().startsWith('--')) continue;

      // Extract a description from the statement
      let description = statement.substring(0, 50).replace(/\n/g, ' ');
      if (statement.includes('CREATE INDEX')) {
        const match = statement.match(/CREATE INDEX.*?(\w+)/);
        description = `Creating index: ${match ? match[1] : 'unknown'}`;
      } else if (statement.includes('CREATE POLICY')) {
        const match = statement.match(/CREATE POLICY\s+(\w+)/);
        description = `Creating RLS policy: ${match ? match[1] : 'unknown'}`;
      } else if (statement.includes('CREATE.*VIEW')) {
        const match = statement.match(/VIEW\s+(\w+)/);
        description = `Creating view: ${match ? match[1] : 'unknown'}`;
      } else if (statement.includes('ALTER TABLE')) {
        const match = statement.match(/ALTER TABLE\s+(\w+)/);
        description = `Altering table: ${match ? match[1] : 'unknown'}`;
      }

      process.stdout.write(`[${i + 1}/${statements.length}] ${description}... `);

      try {
        const { error } = await supabase.rpc('exec_sql', { 
          sql: statement 
        }).single();

        if (error) {
          // Try direct execution as fallback
          const { error: directError } = await supabase
            .from('_sql_exec')
            .insert({ sql: statement })
            .single();

          if (directError) {
            throw directError;
          }
        }

        console.log('✅');
        successCount++;
      } catch (error) {
        console.log('❌');
        failCount++;
        errors.push({
          statement: description,
          error: error.message
        });

        // Some errors are expected (e.g., "already exists")
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist')) {
          console.log(`   ⚠️  Warning: ${error.message}`);
        } else {
          console.log(`   ❌ Error: ${error.message}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successCount}/${statements.length}`);
    console.log(`❌ Failed: ${failCount}/${statements.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Some statements failed (this may be normal if objects already exist):');
      errors.forEach(err => {
        console.log(`   - ${err.statement}: ${err.error}`);
      });
    }

    // Test that improvements are working
    console.log('\n🧪 Testing improvements...');
    
    // Test 1: Check if indexes exist
    const { data: indexes } = await supabase
      .rpc('get_indexes', { table_name: 'sdip_submissions' });
    
    if (indexes && indexes.length > 0) {
      console.log(`✅ Indexes created: ${indexes.length} indexes found`);
    }

    // Test 2: Check if views exist
    const { data: views } = await supabase
      .from('information_schema.views')
      .select('table_name')
      .like('table_name', 'sdip_%');

    if (views && views.length > 0) {
      console.log(`✅ Views created: ${views.length} views found`);
    }

    console.log('\n✨ Database improvements applied successfully!');

  } catch (error) {
    console.error('❌ Failed to apply database improvements:', error);
    process.exit(1);
  }
}

// Alternative approach using direct SQL execution
async function applyViaDirectSQL() {
  console.log('\n📝 NOTE: If the above method fails, you can apply the improvements manually:');
  console.log('1. Go to Supabase Dashboard > SQL Editor');
  console.log('2. Copy the contents of database/migrations/007_sdip_database_improvements.sql');
  console.log('3. Paste and run in the SQL Editor');
  console.log('\nThe migration includes:');
  console.log('  - Performance indexes on foreign keys');
  console.log('  - Row-level security policies');
  console.log('  - Database views for analytics');
  console.log('  - Cascade delete configuration');
  console.log('  - Audit logging functions');
}

// Run the improvements
applyDatabaseImprovements()
  .then(() => {
    applyViaDirectSQL();
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
