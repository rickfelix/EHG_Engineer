#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Need service role for admin operations
);

async function runMigration() {
    console.log('\n🔧 Running PRD sd_uuid Auto-Population Migration');
    console.log('==================================================\n');

    try {
        // Read migration file
        const migrationPath = path.join(__dirname, '../database/migrations/20251019_fix_prd_sd_uuid_auto_population.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Migration file loaded: 20251019_fix_prd_sd_uuid_auto_population.sql');
        console.log('📊 SQL size:', sql.length, 'characters\n');

        // Execute migration using rpc to execute raw SQL
        // Note: Supabase doesn't have a direct SQL execution method, so we'll use the postgres client
        const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

        if (error) {
            console.error('❌ Migration failed:', error.message);
            console.error('Details:', error);
            process.exit(1);
        }

        console.log('\n✅ Migration executed successfully!');
        console.log('📋 Results:', data);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
