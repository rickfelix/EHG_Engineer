import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node run-migration.mjs <migration-file.sql>');
  process.exit(1);
}

console.log('📦 Running migration:', migrationFile);
console.log('');

const sql = readFileSync(migrationFile, 'utf-8');

// Split by semicolons and execute each statement
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to execute`);
console.log('');

let successCount = 0;
let errorCount = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];

  // Skip comments
  if (statement.startsWith('--') || statement.match(/^\/\*/)) {
    continue;
  }

  console.log(`[${i + 1}/${statements.length}] Executing...`);

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });

    if (error) {
      console.error(`❌ Error:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Success`);
      successCount++;
    }
  } catch (err) {
    console.error(`❌ Error:`, err.message);
    errorCount++;
  }

  console.log('');
}

console.log('');
console.log('📊 MIGRATION SUMMARY');
console.log('='.repeat(60));
console.log(`Success: ${successCount}`);
console.log(`Errors:  ${errorCount}`);
console.log('='.repeat(60));

if (errorCount > 0) {
  console.log('');
  console.log('⚠️  Migration completed with errors');
  console.log('   Some statements may need to be run manually via Supabase SQL Editor');
  process.exit(1);
} else {
  console.log('');
  console.log('🎉 Migration completed successfully!');
}
