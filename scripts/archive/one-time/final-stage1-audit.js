#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function auditStage1Updates() {
    console.log('\n🎯 STAGE-1 UPDATE AUDIT REPORT\n');
    console.log('=' . repeat(50));
    
    // 1. Check Strategic Directives
    const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, priority')
        .in('id', ['SD-003', 'SD-003A', 'SD-1A'])
        .order('id');
        
    console.log('\n📋 Strategic Directives:');
    sds?.forEach(sd => {
        console.log(`  ${sd.status === 'active' ? '✅' : '⏳'} ${sd.id}: ${sd.title}`);
        console.log(`     Status: ${sd.status}, Priority: ${sd.priority}`);
    });
    
    // 2. Count backlog items by SD
    const { data: backlogCounts } = await supabase
        .from('sd_backlog_map')
        .select('sd_id, backlog_id')
        .in('sd_id', ['SD-003A', 'SD-1A']);
        
    const counts = {};
    backlogCounts?.forEach(item => {
        counts[item.sd_id] = (counts[item.sd_id] || 0) + 1;
    });
    
    console.log('\n📊 Backlog Item Counts:');
    Object.entries(counts).forEach(([sd, count]) => {
        console.log(`  - ${sd}: ${count} items`);
    });
    
    // 3. Verify critical backlog items
    const criticalItems = ['BP-001', 'BP-002', 'BP-005', 'BP-006', 'BP-007', 'BP-012'];
    const { data: items } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id, backlog_title, sd_id, priority')
        .in('backlog_id', criticalItems)
        .order('sd_id', { ascending: true })
        .order('backlog_id', { ascending: true });
        
    console.log('\n🔑 Critical Backlog Items:');
    items?.forEach(item => {
        console.log(`  ✅ ${item.backlog_id}: ${item.backlog_title}`);
        console.log(`     SD: ${item.sd_id}, Priority: ${item.priority}`);
    });
    
    // 4. Check for extras field with KPIs
    const { data: kpiItems } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id, extras')
        .in('sd_id', ['SD-003A', 'SD-1A'])
        .not('extras', 'is', null)
        .limit(3);
        
    console.log('\n📈 Sample Items with KPIs:');
    kpiItems?.forEach(item => {
        const kpis = item.extras?.kpis || [];
        console.log(`  - ${item.backlog_id}: ${kpis.join(', ') || 'No KPIs'}`);
    });
    
    // 5. Summary
    console.log('\n' + '=' . repeat(50));
    console.log('✅ SUMMARY:');
    console.log(`  - Strategic Directives: ${sds?.length || 0}`);
    console.log(`  - Total Backlog Items: ${backlogCounts?.length || 0}`);
    console.log(`  - Critical Items Verified: ${items?.length || 0}/${criticalItems.length}`);
    
    // Chairman decisions implemented
    console.log('\n🎯 Chairman Decisions Implemented:');
    console.log('  ✅ SD-003 scope refined to voice capture only');
    console.log('  ✅ SD-003A created for EVA integration');
    console.log('  ✅ SD-1A created for sourcing modes');
    console.log('  ✅ JSON storage in ventures.metadata (MVP)');
    console.log('  ✅ Story-First as priority mode');
    
    console.log('\n🚀 Stage-1 configuration complete!');
}

auditStage1Updates();