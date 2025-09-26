#!/usr/bin/env node

/**
 * Check Database Constraints for Valid Status Values
 * Queries the actual database schema to find valid status values
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

async function checkDatabaseConstraints() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log('🔍 Checking database constraints for valid status values...\n');

  try {
    // Query information schema for check constraints
    const { data: constraints, error } = await supabase
      .rpc('get_check_constraints', {
        p_table_names: ['strategic_directives_v2', 'product_requirements_v2', 'execution_sequences_v2']
      })
      .select('*');

    if (error) {
      // Fallback: Try to query tables directly to infer valid values
      console.log('⚠️  Cannot query constraints directly, testing values empirically...\n');
      
      // Test SD statuses
      console.log('📋 Strategic Directives (strategic_directives_v2):');
      const sdStatuses = ['draft', 'active', 'in_progress', 'on_hold', 'completed', 'complete', 'approved', 'cancelled'];
      for (const status of sdStatuses) {
        const { error: testError } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('status', status)
          .limit(1);
        
        if (!testError) {
          console.log(`  ✅ "${status}" - Valid`);
        } else if (testError.message?.includes('violates check constraint')) {
          console.log(`  ❌ "${status}" - Invalid`);
        } else {
          console.log(`  ✓ "${status}" - Appears valid (no records to test)`);
        }
      }

      // Test PRD statuses
      console.log('\n📋 Product Requirements (product_requirements_v2):');
      const prdStatuses = ['draft', 'planning', 'ready', 'in_progress', 'testing', 'approved', 'completed', 'complete', 'rejected', 'on_hold', 'cancelled'];
      for (const status of prdStatuses) {
        const { error: testError } = await supabase
          .from('product_requirements_v2')
          .select('id')
          .eq('status', status)
          .limit(1);
        
        if (!testError) {
          console.log(`  ✅ "${status}" - Valid`);
        } else if (testError.message?.includes('violates check constraint')) {
          console.log(`  ❌ "${status}" - Invalid`);
        } else {
          console.log(`  ✓ "${status}" - Appears valid (no records to test)`);
        }
      }

      // Test EES statuses
      console.log('\n📋 Execution Sequences (execution_sequences_v2):');
      const eesStatuses = ['pending', 'in_progress', 'completed', 'failed', 'blocked', 'skipped', 'cancelled'];
      for (const status of eesStatuses) {
        const { error: testError } = await supabase
          .from('execution_sequences_v2')
          .select('id')
          .eq('status', status)
          .limit(1);
        
        if (!testError) {
          console.log(`  ✅ "${status}" - Valid`);
        } else if (testError.message?.includes('violates check constraint')) {
          console.log(`  ❌ "${status}" - Invalid`);
        } else {
          console.log(`  ✓ "${status}" - Appears valid (no records to test)`);
        }
      }
    } else {
      // Display constraint information
      console.log('📊 Database Constraints Found:');
      constraints.forEach(constraint => {
        console.log(`\nTable: ${constraint.table_name}`);
        console.log(`Constraint: ${constraint.constraint_name}`);
        console.log(`Definition: ${constraint.check_clause}`);
      });
    }

    // Also check what values are actually in use
    console.log('\n📈 Currently Used Status Values:');
    
    const { data: sdStatuses } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .order('status');
    
    const uniqueSdStatuses = [...new Set(sdStatuses?.map(s => s.status) || [])];
    console.log(`\nSD Statuses in use: ${uniqueSdStatuses.join(', ') || 'none'}`);

    const { data: prdStatuses } = await supabase
      .from('product_requirements_v2')
      .select('status')
      .order('status');
    
    const uniquePrdStatuses = [...new Set(prdStatuses?.map(s => s.status) || [])];
    console.log(`PRD Statuses in use: ${uniquePrdStatuses.join(', ') || 'none'}`);

    const { data: eesStatuses } = await supabase
      .from('execution_sequences_v2')
      .select('status')
      .order('status');
    
    const uniqueEesStatuses = [...new Set(eesStatuses?.map(s => s.status) || [])];
    console.log(`EES Statuses in use: ${uniqueEesStatuses.join(', ') || 'none'}`);

  } catch (error) {
    console.error('❌ Error checking constraints:', error);
  }
}

checkDatabaseConstraints();