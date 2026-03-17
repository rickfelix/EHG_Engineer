#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkAndFixSequencing() {
    console.log('\n🔍 Checking SD Sequencing...\n');
    
    // Get all Stage-1 related SDs
    const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, sequence_rank, status, category')
        .in('id', ['SD-003', 'SD-003A', 'SD-1A'])
        .order('id');
    
    console.log('Current Sequence Rankings:');
    sds?.forEach(sd => {
        const hasRank = sd.sequence_rank !== null && sd.sequence_rank !== undefined;
        console.log(`  ${hasRank ? '✅' : '❌'} ${sd.id}: rank=${sd.sequence_rank || 'NULL'}`);
        console.log(`     Title: ${sd.title}`);
        console.log(`     Status: ${sd.status}\n`);
    });
    
    // Check nearby sequence ranks to find appropriate slot
    const { data: nearby } = await supabase
        .from('strategic_directives_v2')
        .select('id, sequence_rank')
        .gte('sequence_rank', 29)
        .lte('sequence_rank', 35)
        .order('sequence_rank');
        
    console.log('Existing Sequence Ranks (29-35):');
    nearby?.forEach(sd => console.log(`  - Rank ${sd.sequence_rank}: ${sd.id}`));
    
    // Determine what needs fixing
    const updates = [];
    
    // SD-003 should be at rank 30
    const sd003 = sds?.find(sd => sd.id === 'SD-003');
    if (!sd003?.sequence_rank || sd003.sequence_rank !== 30) {
        updates.push({ id: 'SD-003', sequence_rank: 30 });
    }
    
    // SD-003A should be at rank 31
    const sd003a = sds?.find(sd => sd.id === 'SD-003A');
    if (!sd003a?.sequence_rank || sd003a.sequence_rank !== 31) {
        updates.push({ id: 'SD-003A', sequence_rank: 31 });
    }
    
    // SD-1A should be at rank 32
    const sd1a = sds?.find(sd => sd.id === 'SD-1A');
    if (!sd1a?.sequence_rank || sd1a.sequence_rank !== 32) {
        updates.push({ id: 'SD-1A', sequence_rank: 32 });
    }
    
    if (updates.length > 0) {
        console.log('\n🔧 Fixing sequence ranks...');
        
        for (const update of updates) {
            const { error } = await supabase
                .from('strategic_directives_v2')
                .update({ sequence_rank: update.sequence_rank })
                .eq('id', update.id);
                
            if (error) {
                console.log(`  ❌ Failed to update ${update.id}: ${error.message}`);
            } else {
                console.log(`  ✅ Updated ${update.id} to sequence_rank=${update.sequence_rank}`);
            }
        }
        
        // Verify the updates
        console.log('\n📊 Final Sequence Order:');
        const { data: final } = await supabase
            .from('strategic_directives_v2')
            .select('id, title, sequence_rank')
            .in('id', ['SD-003', 'SD-003A', 'SD-1A'])
            .order('sequence_rank');
            
        final?.forEach(sd => {
            console.log(`  ${sd.sequence_rank}: ${sd.id} - ${sd.title}`);
        });
    } else {
        console.log('\n✅ All SDs have appropriate sequence ranks!');
    }
    
    console.log('\n📝 Recommended Execution Order:');
    console.log('  1. SD-003 (rank 30): Voice UI cleanup - Prerequisites');
    console.log('  2. SD-003A (rank 31): EVA integration - Core functionality');
    console.log('  3. SD-1A (rank 32): Sourcing modes - Enhanced input options');
}

checkAndFixSequencing();