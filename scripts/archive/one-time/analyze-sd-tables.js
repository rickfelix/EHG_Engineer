#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function analyzeSDTables() {
    console.log('\n🔍 Strategic Directives Table Analysis');
    console.log('══════════════════════════════════════════════════════════════\n');

    // 1. Get data from both tables
    const { data: v1Data, error: v1Error } = await supabase
        .from('strategic_directives')
        .select('*')
        .order('created_at', { ascending: false });

    const { data: v2Data, error: v2Error } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .order('created_at', { ascending: false });

    console.log('📊 TABLE COMPARISON:');
    console.log('─'.repeat(60));
    
    // Table 1: strategic_directives
    console.log('\n1️⃣ strategic_directives (Original):');
    if (v1Error) {
        console.log('   ❌ Error accessing table:', v1Error.message);
    } else {
        console.log(`   ✅ Records: ${v1Data ? v1Data.length : 0}`);
        if (v1Data && v1Data.length > 0) {
            // Analyze structure
            const sample = v1Data[0];
            const columns = Object.keys(sample);
            console.log(`   📋 Columns (${columns.length}):`, columns.slice(0, 10).join(', ') + (columns.length > 10 ? '...' : ''));
            
            // Check for key fields
            console.log('\n   🔑 Key Fields:');
            console.log(`      • Has 'id' field: ${columns.includes('id') ? '✅' : '❌'}`);
            console.log(`      • Has 'sd_id' field: ${columns.includes('sd_id') ? '✅' : '❌'}`);
            console.log(`      • Has 'title' field: ${columns.includes('title') ? '✅' : '❌'}`);
            console.log(`      • Has 'status' field: ${columns.includes('status') ? '✅' : '❌'}`);
            console.log(`      • Has 'priority' field: ${columns.includes('priority') ? '✅' : '❌'}`);
            console.log(`      • Has 'submission_id' field: ${columns.includes('submission_id') ? '✅' : '❌'}`);
            
            // Status distribution
            const statuses = {};
            v1Data.forEach(record => {
                const status = record.status || 'unknown';
                statuses[status] = (statuses[status] || 0) + 1;
            });
            console.log('\n   📈 Status Distribution:');
            Object.entries(statuses).forEach(([status, count]) => {
                console.log(`      • ${status}: ${count}`);
            });
            
            // Sample records
            console.log('\n   📝 Sample Records:');
            v1Data.slice(0, 3).forEach(record => {
                const id = record.sd_id || record.id || 'NO_ID';
                const title = record.title || 'Untitled';
                const status = record.status || 'unknown';
                console.log(`      • ${id}: "${title.substring(0, 50)}..." (${status})`);
            });
        }
    }

    // Table 2: strategic_directives_v2
    console.log('\n2️⃣ strategic_directives_v2 (Version 2):');
    if (v2Error) {
        console.log('   ❌ Error accessing table:', v2Error.message);
    } else {
        console.log(`   ✅ Records: ${v2Data ? v2Data.length : 0}`);
        if (v2Data && v2Data.length > 0) {
            // Analyze structure
            const sample = v2Data[0];
            const columns = Object.keys(sample);
            console.log(`   📋 Columns (${columns.length}):`, columns.slice(0, 10).join(', ') + (columns.length > 10 ? '...' : ''));
            
            // Check for key fields
            console.log('\n   🔑 Key Fields:');
            console.log(`      • Has 'id' field: ${columns.includes('id') ? '✅' : '❌'}`);
            console.log(`      • Has 'sd_id' field: ${columns.includes('sd_id') ? '✅' : '❌'}`);
            console.log(`      • Has 'title' field: ${columns.includes('title') ? '✅' : '❌'}`);
            console.log(`      • Has 'status' field: ${columns.includes('status') ? '✅' : '❌'}`);
            console.log(`      • Has 'priority' field: ${columns.includes('priority') ? '✅' : '❌'}`);
            console.log(`      • Has 'directive_id' field: ${columns.includes('directive_id') ? '✅' : '❌'}`);
            
            // Status distribution
            const statuses = {};
            v2Data.forEach(record => {
                const status = record.status || 'unknown';
                statuses[status] = (statuses[status] || 0) + 1;
            });
            console.log('\n   📈 Status Distribution:');
            Object.entries(statuses).forEach(([status, count]) => {
                console.log(`      • ${status}: ${count}`);
            });
            
            // Sample records
            console.log('\n   📝 Sample Records:');
            v2Data.slice(0, 3).forEach(record => {
                const id = record.id || record.sd_id || 'NO_ID';
                const title = record.title || 'Untitled';
                const status = record.status || 'unknown';
                console.log(`      • ${id}: "${title.substring(0, 50)}..." (${status})`);
            });
        }
    }

    // 2. Check what references each table
    console.log('\n\n🔗 TABLE REFERENCES:');
    console.log('─'.repeat(60));
    
    // Check PRD table
    const { data: prdData } = await supabase
        .from('product_requirements_v2')
        .select('*')
        .limit(1);

    console.log('\n📄 PRD Table:');
    if (prdData) {
        const sample = prdData[0];
        if (sample) {
            console.log('   • product_requirements_v2 references:');
            console.log(`     - Has 'sd_id' field: ${sample.sd_id !== undefined ? '✅' : '❌'}`);
            console.log(`     - Has 'directive_id' field: ${sample.directive_id !== undefined ? '✅' : '❌'}`);
        }
    }

    // 3. Check which table the dashboard uses
    console.log('\n\n🖥️ APPLICATION USAGE:');
    console.log('─'.repeat(60));
    console.log('\n📊 Dashboard (database-loader.js):');
    console.log('   • Queries: strategic_directives_v2');
    console.log('   • Related PRD table: product_requirements_v2');
    console.log('   • Related EES table: execution_sequences_v2');
    
    // 4. Recommendations
    console.log('\n\n🎯 RECOMMENDATIONS:');
    console.log('═'.repeat(60));
    
    const v1Count = v1Data ? v1Data.length : 0;
    const v2Count = v2Data ? v2Data.length : 0;
    
    console.log('\n📊 Data Analysis:');
    console.log(`   • strategic_directives: ${v1Count} records`);
    console.log(`   • strategic_directives_v2: ${v2Count} records`);
    
    if (v2Count > 0 && v1Count === 0) {
        console.log('\n✅ RECOMMENDATION: Keep strategic_directives_v2');
        console.log('   Reasons:');
        console.log('   1. Dashboard already uses v2 table');
        console.log('   2. v2 has data while v1 is empty');
        console.log('   3. v2 appears to be the active table');
        console.log('\n   Action: Drop strategic_directives table');
    } else if (v1Count > 0 && v2Count === 0) {
        console.log('\n⚠️ WARNING: Data mismatch!');
        console.log('   • v1 has data but dashboard uses v2');
        console.log('   • Need to migrate data from v1 to v2');
        console.log('\n   Action: Migrate data from v1 to v2, then drop v1');
    } else if (v1Count > 0 && v2Count > 0) {
        console.log('\n⚠️ WARNING: Both tables have data!');
        console.log('   • This could cause confusion and inconsistency');
        console.log('   • Dashboard uses v2, so v1 data might be orphaned');
        console.log('\n   Action: Analyze differences, merge if needed, then drop v1');
    } else {
        console.log('\n📝 Both tables are empty');
        console.log('   • Dashboard uses v2 table');
        console.log('\n   Action: Drop strategic_directives, keep v2 for consistency');
    }

    // Check for ID conflicts
    if (v1Data && v2Data && v1Data.length > 0 && v2Data.length > 0) {
        console.log('\n\n🔍 CHECKING FOR OVERLAPPING IDs:');
        const v1Ids = new Set(v1Data.map(r => r.id || r.sd_id).filter(Boolean));
        const v2Ids = new Set(v2Data.map(r => r.id || r.sd_id).filter(Boolean));
        
        const overlapping = [...v1Ids].filter(id => v2Ids.has(id));
        if (overlapping.length > 0) {
            console.log(`   ⚠️ Found ${overlapping.length} overlapping IDs:`, overlapping);
        } else {
            console.log('   ✅ No overlapping IDs found');
        }
    }
}

// Execute
analyzeSDTables();