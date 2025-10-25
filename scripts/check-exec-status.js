#!/usr/bin/env node

/**
 * Check EXEC phase checklist completion status
 * This must be 100% before handoff to PLAN
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function checkExecStatus() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  console.log('📋 Checking EXEC Phase Completion Status...\n');
  
  try {
    // Get PRD with EXEC checklist
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', 'PRD-PRD-2025-001')
      .single();
    
    if (error) throw error;
    
    const execChecklist = prd.exec_checklist || [];
    const completed = execChecklist.filter(item => item.checked).length;
    const total = execChecklist.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    console.log('🎯 SD-2025-001: OpenAI Realtime Voice Implementation');
    console.log('📊 EXEC Phase Status:\n');
    console.log(`Progress: ${completed}/${total} items (${percentage}%)`);
    console.log(`Status: ${percentage === 100 ? '✅ COMPLETE' : '⚠️  INCOMPLETE'}\n`);
    
    console.log('Checklist Items:');
    console.log('─'.repeat(60));
    
    execChecklist.forEach((item, index) => {
      const status = item.checked ? '✅' : '❌';
      console.log(`${status} ${index + 1}. ${item.task}`);
    });
    
    console.log('─'.repeat(60));
    
    if (percentage < 100) {
      console.log('\n⚠️  WARNING: EXEC phase is not complete!');
      console.log('   Cannot handoff to PLAN until all items are checked.');
      
      const remaining = execChecklist.filter(item => !item.checked);
      console.log(`\n📝 Remaining Tasks (${remaining.length}):`);
      remaining.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.task}`);
      });
      
      // Get EES status too
      const { data: eesItems } = await supabase
        .from('execution_sequences_v2')
        .select('*')
        .eq('directive_id', 'SD-2025-001')
        .order('sequence_number');
      
      const eesCompleted = eesItems.filter(e => e.status === 'completed').length;
      const eesTotal = eesItems.length;
      
      console.log(`\n📊 EES Status: ${eesCompleted}/${eesTotal} completed`);
      console.log('\nIncomplete EES Items:');
      eesItems
        .filter(e => e.status !== 'completed')
        .forEach(item => {
          console.log(`   EES-${item.sequence_number}: ${item.title} (${item.status})`);
        });
      
      return false;
    }
    
    console.log('\n✅ EXEC phase is COMPLETE! Ready for PLAN verification.');
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkExecStatus().then(isComplete => {
  process.exit(isComplete ? 0 : 1);
});