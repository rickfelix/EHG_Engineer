#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function checkDirectiveStatus() {
    console.log('\n🎯 LEAD Agent - Strategic Directive Status Check');
    console.log('================================================\n');

    // Check various possible tables
    const tables = [
        'strategic_directives',
        'directive_submissions', 
        'sdip_strategic_directives',
        'prd_documents',
        'leo_protocols'
    ];

    for (const table of tables) {
        try {
            const { data: _data, error, count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (!error) {
                console.log(`✅ Table '${table}' exists - ${count || 0} records`);
                
                // Get sample data for strategic tables
                if (table.includes('directive') || table === 'prd_documents') {
                    const { data: samples } = await supabase
                        .from(table)
                        .select('*')
                        .limit(3);
                    
                    if (samples && samples.length > 0) {
                        console.log('   Sample records:');
                        samples.forEach(record => {
                            const id = record.sd_id || record.prd_id || record.id;
                            const title = record.title || record.directive_title || 'Untitled';
                            const status = record.status || 'unknown';
                            console.log(`   • ${id}: ${title} (${status})`);
                        });
                    }
                }
            } else {
                console.log(`❌ Table '${table}' not found or error: ${error.message}`);
            }
        } catch (err) {
            console.log(`❌ Error checking '${table}': ${err.message}`);
        }
    }

    // Check for any PRDs that need work
    console.log('\n📋 Checking for active work items...\n');
    
    try {
        const { data: prds } = await supabase
            .from('prd_documents')
            .select('*')
            .in('status', ['draft', 'in_progress', 'pending_review'])
            .order('created_at', { ascending: false })
            .limit(5);

        if (prds && prds.length > 0) {
            console.log('📌 PRDs requiring attention:');
            prds.forEach(prd => {
                console.log(`   • ${prd.prd_id}: ${prd.title || 'Untitled'} (${prd.status})`);
                if (prd.sd_id) {
                    console.log(`     Associated with SD: ${prd.sd_id}`);
                }
            });
        } else {
            console.log('No active PRDs found.');
        }
    } catch (err) {
        console.log('Could not query PRD documents:', err.message);
    }

    // LEAD recommendations
    console.log('\n\n🎯 LEAD Strategic Recommendations:');
    console.log('═'.repeat(50));
    console.log('\nAs the LEAD agent, I recommend:');
    console.log('1. Create a new Strategic Directive for system improvements');
    console.log('2. Define clear business objectives and priorities');
    console.log('3. Establish success metrics and KPIs');
    console.log('4. Initiate LEAD→PLAN handoff once objectives are defined');
    
    console.log('\n📝 To create a new Strategic Directive:');
    console.log('   node scripts/create-sdip-strategic-directive.js');
    console.log('\n📋 To create a PRD from a directive:');
    console.log('   node scripts/create-sdip-prd.js');
}

// Execute
checkDirectiveStatus();