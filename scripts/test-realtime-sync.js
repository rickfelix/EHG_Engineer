#!/usr/bin/env node

/**
 * Test Real-time Sync Functionality
 * Updates database records to trigger real-time sync
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function testRealtimeSync() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log('🧪 Testing real-time sync...\n');

  try {
    // Test 1: Update SD status
    console.log('📝 Test 1: Updating SD status...');
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
      .select()
      .single();

    if (sdError) {
      console.error('❌ Error updating SD:', sdError);
    } else {
      console.log('✅ SD updated successfully');
      console.log('   Status changed to:', sd.status);
    }

    // Wait for real-time propagation
    console.log('\n⏳ Waiting 3 seconds for real-time sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 2: Update PRD checklist
    console.log('\n📝 Test 2: Updating PRD checklist...');
    const { data: prd, error: prdGetError } = await supabase
      .from('product_requirements_v2')
      .select('plan_checklist')
      .eq('id', 'PRD-SD-DASHBOARD-AUDIT-2025-08-31-A')
      .single();

    if (!prdGetError && prd) {
      // Toggle first unchecked item
      const updatedChecklist = prd.plan_checklist.map((item, index) => {
        if (index === 0 && !item.checked) {
          return { ...item, checked: true };
        }
        return item;
      });

      const { error: prdUpdateError } = await supabase
        .from('product_requirements_v2')
        .update({ 
          plan_checklist: updatedChecklist,
          updated_at: new Date().toISOString()
        })
        .eq('id', 'PRD-SD-DASHBOARD-AUDIT-2025-08-31-A');

      if (prdUpdateError) {
        console.error('❌ Error updating PRD:', prdUpdateError);
      } else {
        console.log('✅ PRD checklist updated successfully');
      }
    }

    // Wait for real-time propagation
    console.log('\n⏳ Waiting 3 seconds for real-time sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 3: Create new EES
    console.log('\n📝 Test 3: Creating new Execution Sequence...');
    const { data: newEES, error: eesError } = await supabase
      .from('execution_sequences_v2')
      .insert({
        id: 'EES-TEST-' + Date.now(),
        directive_id: 'SD-DASHBOARD-AUDIT-2025-08-31-A',
        sequence_number: 999,
        title: 'Real-time Sync Test EES',
        description: 'Testing real-time sync functionality',
        status: 'pending',
        executor_role: 'EXEC',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (eesError) {
      console.error('❌ Error creating EES:', eesError);
    } else {
      console.log('✅ EES created successfully');
      console.log('   ID:', newEES.id);
    }

    console.log('\n⏳ Waiting 3 seconds for real-time sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 4: Delete the test EES
    console.log('\n📝 Test 4: Deleting test EES...');
    if (newEES) {
      const { error: deleteError } = await supabase
        .from('execution_sequences_v2')
        .delete()
        .eq('id', newEES.id);

      if (deleteError) {
        console.error('❌ Error deleting EES:', deleteError);
      } else {
        console.log('✅ Test EES deleted successfully');
      }
    }

    console.log('\n✅ Real-time sync tests completed!');
    console.log('📊 Check the dashboard server logs for real-time events');
    console.log('🌐 Visit http://localhost:3000 to see updated data');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testRealtimeSync();