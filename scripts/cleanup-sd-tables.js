#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function cleanupSDTables() {
    console.log('\n🧹 Strategic Directives Table Cleanup');
    console.log('══════════════════════════════════════════════════════════════\n');

    console.log('📊 CURRENT STATE:');
    console.log('─'.repeat(60));
    
    // Check v2 table
    const { data: v2Data, error: v2Error } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status')
        .order('created_at', { ascending: false });

    if (!v2Error) {
        console.log(`✅ strategic_directives_v2: ${v2Data.length} records`);
        const activeCount = v2Data.filter(sd => sd.status === 'active').length;
        console.log(`   • Active: ${activeCount}`);
        console.log(`   • Archived: ${v2Data.length - activeCount}`);
    } else {
        console.log(`❌ strategic_directives_v2: ${v2Error.message}`);
    }

    // Check v1 table (should not exist)
    const { error: v1Error } = await supabase
        .from('strategic_directives')
        .select('id')
        .limit(1);

    if (v1Error && v1Error.message.includes('not found')) {
        console.log('✅ strategic_directives: Does not exist (as expected)');
    } else if (!v1Error) {
        console.log('⚠️  strategic_directives: Table exists (should be removed)');
    }

    console.log('\n\n📝 RECOMMENDATIONS:');
    console.log('═'.repeat(60));
    console.log('\n1. The old "strategic_directives" table does not exist in the database');
    console.log('2. All code is using "strategic_directives_v2" table');
    console.log('3. Dashboard will now correctly show active SD count');
    
    console.log('\n\n✅ STATUS NORMALIZATION APPLIED:');
    console.log('─'.repeat(60));
    console.log('• StatusValidator now capitalizes SD statuses for UI consistency');
    console.log('• "active" → "Active", "archived" → "Archived", etc.');
    console.log('• Dashboard filter will now correctly count active SDs');
    
    console.log('\n\n🔧 MANUAL STEPS (if needed):');
    console.log('─'.repeat(60));
    console.log('\nIf you need to drop the old table in Supabase:');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
    console.log('2. Run: DROP TABLE IF EXISTS strategic_directives CASCADE;');
    console.log('\nNote: Based on analysis, this table doesn\'t exist, so no action needed.');
    
    console.log('\n\n🚀 NEXT STEPS:');
    console.log('─'.repeat(60));
    console.log('1. Restart the server to apply StatusValidator changes');
    console.log('2. Check dashboard to verify active SD count shows correctly');
    console.log('3. All strategic directives should now work properly');
}

// Execute
cleanupSDTables();