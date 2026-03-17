#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function checkSDStatusValues() {
    console.log('\n🔍 Strategic Directive Status Field Analysis');
    console.log('══════════════════════════════════════════════════════════════\n');

    // Get all SDs from v2 table
    const { data: sds, error } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, metadata')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log(`📊 Found ${sds.length} Strategic Directives\n`);

    // Analyze status fields
    console.log('📋 STATUS FIELD VALUES:');
    console.log('─'.repeat(60));
    
    sds.forEach(sd => {
        console.log(`\n${sd.id}:`);
        console.log(`  Title: "${sd.title?.substring(0, 50)}..."`);
        console.log(`  status field: "${sd.status}"`);
        console.log(`  metadata.Status: "${sd.metadata?.Status || 'undefined'}"`);
        
        // Check for case mismatch
        if (sd.status && sd.metadata?.Status) {
            if (sd.status.toLowerCase() !== sd.metadata.Status.toLowerCase()) {
                console.log(`  ⚠️ MISMATCH: status="${sd.status}" vs metadata.Status="${sd.metadata.Status}"`);
            }
        }
    });

    // Summary
    console.log('\n\n📊 STATUS SUMMARY:');
    console.log('═'.repeat(60));
    
    const statusValues = {};
    const metadataStatusValues = {};
    
    sds.forEach(sd => {
        // Count direct status field
        const status = sd.status || 'null';
        statusValues[status] = (statusValues[status] || 0) + 1;
        
        // Count metadata.Status field
        const metaStatus = sd.metadata?.Status || 'undefined';
        metadataStatusValues[metaStatus] = (metadataStatusValues[metaStatus] || 0) + 1;
    });
    
    console.log('\n1. Direct "status" field values:');
    Object.entries(statusValues).forEach(([status, count]) => {
        console.log(`   • ${status}: ${count}`);
    });
    
    console.log('\n2. metadata.Status field values:');
    Object.entries(metadataStatusValues).forEach(([status, count]) => {
        console.log(`   • ${status}: ${count}`);
    });
    
    // Check what the dashboard is looking for
    console.log('\n\n🖥️ DASHBOARD FILTER LOGIC:');
    console.log('─'.repeat(60));
    console.log('Dashboard checks: sd.metadata?.Status === "Active" (capital A)');
    
    const activeByStatus = sds.filter(sd => sd.status === 'active').length;
    const activeByMetadataCapital = sds.filter(sd => sd.metadata?.Status === 'Active').length;
    const activeByMetadataLower = sds.filter(sd => sd.metadata?.Status === 'active').length;
    
    console.log('\nCounts:');
    console.log(`   • status === 'active': ${activeByStatus}`);
    console.log(`   • metadata.Status === 'Active': ${activeByMetadataCapital}`);
    console.log(`   • metadata.Status === 'active': ${activeByMetadataLower}`);
    
    console.log('\n\n🔧 PROBLEM IDENTIFIED:');
    console.log('═'.repeat(60));
    if (activeByStatus > 0 && activeByMetadataCapital === 0) {
        console.log('❌ Dashboard shows 0 active because:');
        console.log('   1. Dashboard checks metadata.Status === "Active" (capital A)');
        console.log('   2. Database has status === "active" (lowercase)');
        console.log('   3. metadata.Status is either missing or has wrong case');
        console.log('\n✅ SOLUTION:');
        console.log('   • Update DatabaseLoader to normalize status in metadata');
        console.log('   • Ensure metadata.Status matches the case expected by UI');
    } else if (activeByMetadataCapital > 0) {
        console.log('✅ Dashboard should show active SDs correctly');
    }
}

// Execute
checkSDStatusValues();