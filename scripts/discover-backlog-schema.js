#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function discoverSchema() {
    console.log('\n🔍 Discovering Backlog Schema...\n');
    
    try {
        // Check if strategic_directives_backlog is a view
        let viewCheck = null;
        try {
            const { data } = await supabase.rpc('execute_sql', {
                sql: `
                    SELECT table_name, table_type 
                    FROM information_schema.tables 
                    WHERE table_name = 'strategic_directives_backlog'
                    AND table_schema = 'public'
                `
            });
            viewCheck = data;
        } catch (e) {
            // RPC might not exist, try direct query
        }
        
        console.log('strategic_directives_backlog type:', viewCheck || 'Unable to query via RPC');
        
        // List all backlog-related tables
        let tables = null;
        try {
            const { data } = await supabase.rpc('execute_sql', {
                sql: `
                    SELECT table_name, table_type
                    FROM information_schema.tables
                    WHERE table_schema = 'public' 
                    AND (table_name ILIKE '%backlog%' 
                         OR table_name ILIKE '%prd%' 
                         OR table_name ILIKE '%requirements%')
                    ORDER BY table_name
                `
            });
            tables = data;
        } catch (e) {
            // RPC might not exist
        }
        
        console.log('\n📊 Backlog-related tables found:');
        if (tables) {
            tables.forEach(t => console.log(`  - ${t.table_name} (${t.table_type})`));
        }
        
        // Check product_requirements tables
        const { data: prdTables } = await supabase
            .from('product_requirements_v3')
            .select('prd_id, sd_id, content_json')
            .limit(1);
            
        if (prdTables && prdTables.length > 0) {
            console.log('\n✅ Found product_requirements_v3 table');
            console.log('   Sample structure:', Object.keys(prdTables[0]));
            
            // Check if content_json contains backlog items
            const content = prdTables[0].content_json;
            if (content && typeof content === 'object') {
                console.log('   content_json keys:', Object.keys(content).slice(0, 5));
                if (content.backlog_items) {
                    console.log('   ✅ Has backlog_items in content_json');
                }
            }
        }
        
        // Check for sd_backlog_map
        const { data: mapCheck } = await supabase
            .from('sd_backlog_map')
            .select('*')
            .limit(1);
            
        if (mapCheck) {
            console.log('\n✅ sd_backlog_map table exists and is accessible');
            console.log('   Columns:', Object.keys(mapCheck[0] || {}));
        }
        
        // Try direct table queries
        console.log('\n📋 Checking for direct backlog tables...');
        
        // Check backlog_items
        const { data: backlogItems, error: biError } = await supabase
            .from('backlog_items')
            .select('*')
            .limit(1);
            
        if (!biError && backlogItems) {
            console.log('✅ backlog_items table exists');
            console.log('   Columns:', Object.keys(backlogItems[0] || {}));
        } else {
            console.log('❌ backlog_items not accessible:', biError?.message);
        }
        
        // Check backlog_items_v2
        const { data: backlogV2, error: bi2Error } = await supabase
            .from('backlog_items_v2')
            .select('*')
            .limit(1);
            
        if (!bi2Error && backlogV2) {
            console.log('✅ backlog_items_v2 table exists');
            console.log('   Columns:', Object.keys(backlogV2[0] || {}));
        } else {
            console.log('❌ backlog_items_v2 not accessible:', bi2Error?.message);
        }
        
        // Final recommendation
        console.log('\n🎯 RECOMMENDED PATH:');
        if (!biError || !bi2Error) {
            console.log('   Path A: Direct table insert to backlog_items or backlog_items_v2');
        } else if (prdTables) {
            console.log('   Path B: Embed in product_requirements_v3.content_json.backlog_items');
        } else {
            console.log('   Path C: Use Excel import via import-ehg-backlog-v2.js');
        }
        
    } catch (error) {
        console.error('❌ Discovery failed:', error);
    }
}

discoverSchema();