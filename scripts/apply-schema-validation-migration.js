#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔧 Applying Schema Validation Functions Migration');
console.log('='.repeat(60));

// Read migration file
const migrationSQL = fs.readFileSync(
  'database/migrations/20251015_create_schema_validation_functions.sql',
  'utf8'
);

// Split by statement (semicolon followed by newline)
const statements = migrationSQL
  .split(/;[\s]*\n/)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Found ${statements.length} statements to execute\n`);

let successCount = 0;
let failedCount = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];

  // Skip empty statements or comments
  if (!statement || statement.length < 10) {
    continue;
  }

  // Extract statement type
  const statementType = statement.substring(0, 50).replace(/\n/g, ' ');
  console.log(`${i + 1}. Executing: ${statementType}...`);

  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: statement + ';'
    });

    if (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      failedCount++;
    } else {
      console.log(`   ✅ Success`);
      successCount++;
    }
  } catch (err) {
    console.error(`   ❌ Exception: ${err.message}`);
    failedCount++;
  }

  console.log('');
}

console.log('='.repeat(60));
console.log(`✅ Succeeded: ${successCount}`);
console.log(`❌ Failed: ${failedCount}`);
console.log('');

// Test the functions
console.log('🧪 Testing created functions...\n');

// Test get_table_schema
console.log('1. Testing get_table_schema()...');
const { data: schemaData, error: schemaError } = await supabase.rpc('get_table_schema', {
  table_name: 'strategic_directives'
});

if (schemaError) {
  console.error(`   ❌ Failed: ${schemaError.message}`);
} else if (schemaData && schemaData.length > 0) {
  console.log(`   ✅ Success: Found ${schemaData.length} columns for strategic_directives`);
  console.log(`   Sample columns: ${schemaData.slice(0, 3).map(c => c.column_name).join(', ')}`);
} else {
  console.log(`   ⚠️  No data returned (this may be expected)`);
}

// Test validate_uuid_format
console.log('\n2. Testing validate_uuid_format()...');
const { data: validData, error: validError } = await supabase.rpc('validate_uuid_format', {
  value: '550e8400-e29b-41d4-a716-446655440000'
});

const { data: invalidData, error: invalidError } = await supabase.rpc('validate_uuid_format', {
  value: 'not-a-uuid'
});

if (!validError && !invalidError) {
  if (validData === true && invalidData === false) {
    console.log('   ✅ Success: UUID validation working correctly');
  } else {
    console.log(`   ⚠️  Unexpected results: valid=${validData}, invalid=${invalidData}`);
  }
} else {
  console.error(`   ❌ Failed: ${validError?.message || invalidError?.message}`);
}

console.log('\n✅ Migration complete!');
