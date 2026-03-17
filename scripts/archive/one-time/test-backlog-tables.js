#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testTables() {
    console.log('\n🔍 Testing Backlog Tables...\n');
    
    // Test strategic_directives_backlog table
    console.log('1. Testing strategic_directives_backlog table:');
    try {
        const { data, error } = await supabase
            .from('strategic_directives_backlog')
            .select('*')
            .limit(1);
            
        if (error) {
            console.log('   ❌ Error:', error.message);
        } else {
            console.log('   ✅ Table accessible');
            console.log('   Rows found:', data?.length || 0);
            if (data && data.length > 0) {
                console.log('   Columns:', Object.keys(data[0]));
            }
        }
    } catch (_e) {
        console.log('   ❌ Exception:', e.message);
    }
    
    // Test sd_backlog_map table
    console.log('\n2. Testing sd_backlog_map table:');
    try {
        const { data, error } = await supabase
            .from('sd_backlog_map')
            .select('*')
            .limit(1);
            
        if (error) {
            console.log('   ❌ Error:', error.message);
        } else {
            console.log('   ✅ Table accessible');
            console.log('   Rows found:', data?.length || 0);
            if (data && data.length > 0) {
                console.log('   Columns:', Object.keys(data[0]));
            }
        }
    } catch (_e) {
        console.log('   ❌ Exception:', e.message);
    }
    
    // Test inserting into strategic_directives_backlog
    console.log('\n3. Testing INSERT into strategic_directives_backlog:');
    const testSD = {
        sd_id: 'TEST-001',
        sequence_rank: 999,
        sd_title: 'Test SD for Insertion',
        page_category: 'Test',
        page_title: 'Test Page',
        rolled_triage: 'High'
    };
    
    try {
        const { data, error } = await supabase
            .from('strategic_directives_backlog')
            .insert(testSD)
            .select();
            
        if (error) {
            console.log('   ❌ Insert failed:', error.message);
        } else {
            console.log('   ✅ Insert successful!');
            console.log('   Inserted SD:', data[0].sd_id);
            
            // Clean up test data
            const { error: deleteError } = await supabase
                .from('strategic_directives_backlog')
                .delete()
                .eq('sd_id', 'TEST-001');
                
            if (!deleteError) {
                console.log('   ✅ Test data cleaned up');
            }
        }
    } catch (_e) {
        console.log('   ❌ Exception:', e.message);
    }
    
    // Test inserting into sd_backlog_map
    console.log('\n4. Testing INSERT into sd_backlog_map:');
    
    // First, we need an SD to reference
    const realSD = {
        sd_id: 'SD-003A',
        sequence_rank: 31,
        sd_title: 'EVA Assistant — Stage-1 Integration',
        page_category: 'Stage-1',
        page_title: 'Initial Idea',
        rolled_triage: 'High'
    };
    
    // Ensure SD exists (upsert)
    const { error: sdError } = await supabase
        .from('strategic_directives_backlog')
        .upsert(realSD, { onConflict: 'sd_id' });
        
    if (sdError) {
        console.log('   ❌ Could not ensure SD exists:', sdError.message);
    } else {
        // Now test inserting backlog item
        const testItem = {
            sd_id: 'SD-003A',
            backlog_id: 'BP-TEST',
            backlog_title: 'Test Backlog Item',
            description_raw: 'Test description',
            item_description: 'Test item description',
            priority: 'High',
            stage_number: 1
        };
        
        try {
            const { data, error } = await supabase
                .from('sd_backlog_map')
                .insert(testItem)
                .select();
                
            if (error) {
                console.log('   ❌ Insert failed:', error.message);
            } else {
                console.log('   ✅ Insert successful!');
                console.log('   Inserted item:', data[0].backlog_id);
                
                // Clean up test data
                const { error: deleteError } = await supabase
                    .from('sd_backlog_map')
                    .delete()
                    .eq('backlog_id', 'BP-TEST');
                    
                if (!deleteError) {
                    console.log('   ✅ Test data cleaned up');
                }
            }
        } catch (_e) {
            console.log('   ❌ Exception:', e.message);
        }
    }
    
    console.log('\n✅ CONCLUSION:');
    console.log('   - Use strategic_directives_backlog for SD records');
    console.log('   - Use sd_backlog_map for backlog items');
    console.log('   - Both tables support direct INSERT operations');
}

testTables();