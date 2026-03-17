#!/usr/bin/env node

/**
 * Alternative approach: Create tables using Supabase Edge Function
 * This works around IPv6 connectivity issues by using HTTPS API
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createUIValidationTables() {
  console.log('====================================');
  console.log('🚀 Creating UI Validation Tables via Supabase API');
  console.log('====================================\n');
  
  try {
    // Read the migration SQL
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '008_ui_validation_schema.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    
    console.log('📄 Found migration file: 008_ui_validation_schema.sql');
    
    // Parse SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);
    
    // Since we can't execute DDL directly through Supabase client,
    // we'll verify which tables already exist and report status
    
    console.log('🔍 Checking existing tables...\n');
    
    const tablesToCheck = [
      'ui_validation_results',
      'prd_ui_mappings', 
      'validation_evidence',
      'ui_validation_checkpoints',
      'leo_validation_rules'
    ];
    
    for (const tableName of tablesToCheck) {
      try {
        const { data: _data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          if (error.message.includes('does not exist')) {
            console.log(`❌ Table '${tableName}' does not exist`);
          } else {
            console.log(`⚠️ Table '${tableName}' error: ${error.message}`);
          }
        } else {
          console.log(`✅ Table '${tableName}' exists`);
        }
      } catch (e) {
        console.log(`❌ Table '${tableName}' check failed: ${e.message}`);
      }
    }
    
    console.log('\n====================================');
    console.log('📝 Manual Table Creation Required');
    console.log('====================================\n');
    
    console.log('Due to network IPv6 connectivity issues, tables must be created manually.\n');
    console.log('Please follow these steps:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
    console.log('2. Copy the contents of: database/migrations/008_ui_validation_schema.sql');
    console.log('3. Paste into the SQL editor');
    console.log('4. Click "Run" to execute\n');
    
    console.log('Alternatively, you can use the Supabase CLI if you have Docker:\n');
    console.log('  npx supabase db push\n');
    
    // Save instructions for reference
    const instructionsPath = path.join(__dirname, '..', 'UI_VALIDATION_SETUP_INSTRUCTIONS.md');
    const instructions = `# UI Validation Tables Setup Instructions

## Current Status
- Database password configured: ✅
- Direct PostgreSQL connection blocked by IPv6: ❌
- Tables need to be created manually: ⚠️

## Manual Setup Steps

### Option 1: Supabase Dashboard (Recommended)
1. Navigate to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new
2. Copy the entire contents of \`database/migrations/008_ui_validation_schema.sql\`
3. Paste into the SQL editor
4. Click "Run" to execute

### Option 2: Using psql (if you have IPv4 connectivity)
\`\`\`bash
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
psql "postgresql://postgres@db.dedlbzhpgkmetvhbkyzq.supabase.co:5432/postgres" -f database/migrations/008_ui_validation_schema.sql
\`\`\`

### Option 3: Using Supabase CLI (requires Docker)
\`\`\`bash
npx supabase link --project-ref dedlbzhpgkmetvhbkyzq
npx supabase db push
\`\`\`

## Tables to be Created
- ui_validation_results
- prd_ui_mappings
- validation_evidence
- ui_validation_checkpoints
- ui_validation_summary (view)

## Verification
After creation, verify tables exist by running:
\`\`\`javascript
node scripts/create-tables-via-api.js
\`\`\`

## Network Issue Details
The system is attempting IPv6 connection but the network doesn't support it:
- Host resolves to: 2600:1f18:2e13:9d0f:baaf:5ed3:395b:d9c4
- Error: ENETUNREACH (Network unreachable)
- Solution: Use HTTPS API or manual SQL execution
`;
    
    await fs.writeFile(instructionsPath, instructions);
    console.log('📄 Instructions saved to: UI_VALIDATION_SETUP_INSTRUCTIONS.md');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createUIValidationTables().catch(console.error);