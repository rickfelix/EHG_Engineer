#!/usr/bin/env node

/**
 * LEO Protocol v4.1.2 - Verify Database State
 * Check if all required entries exist for handoff
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

async function verifyDatabaseState() {
  console.log('🔍 LEO Protocol v4.1.2 - Database Verification');
  console.log('================================================\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const results = {
    sd: false,
    prd: false,
    ees: false,
    files: false
  };
  
  try {
    // 1. Check Strategic Directive
    console.log('Checking Strategic Directive...');
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', 'SD-2025-001')
      .single();
    
    if (sdData) {
      console.log('✅ SD-2025-001 found');
      console.log(`   Status: ${sdData.status}`);
      console.log(`   Title: ${sdData.title}`);
      results.sd = true;
    } else {
      console.log('❌ SD-2025-001 NOT FOUND');
    }
    
    // 2. Check PRD
    console.log('\nChecking Product Requirements Document...');
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title, status, directive_id')
      .eq('id', 'PRD-PRD-2025-001')
      .single();
    
    if (prdData) {
      console.log('✅ PRD-PRD-2025-001 found');
      console.log(`   Status: ${prdData.status}`);
      console.log(`   Linked to: ${prdData.directive_id}`);
      results.prd = true;
    } else {
      console.log('❌ PRD-2025-001 NOT FOUND');
    }
    
    // 3. Check EES Items
    console.log('\nChecking Execution Sequences...');
    const { data: eesData, error: eesError } = await supabase
      .from('execution_sequences_v2')
      .select('id, title, status')
      .eq('directive_id', 'SD-2025-001');
    
    if (eesData && eesData.length > 0) {
      console.log(`✅ ${eesData.length} EES items found`);
      eesData.forEach(ees => {
        console.log(`   ${ees.id}: ${ees.status}`);
      });
      results.ees = eesData.length >= 7; // We need 7 EES items
    } else {
      console.log('❌ No EES items found');
    }
    
    // 4. Check for forbidden files
    console.log('\nChecking for forbidden files...');
    import fs from 'fs';
    const forbiddenPaths = [
      '/mnt/c/_EHG/EHG_Engineer/docs/strategic-directives/',
      '/mnt/c/_EHG/EHG_Engineer/docs/prds/',
      '/mnt/c/_EHG/EHG_Engineer/handoffs/'
    ];
    
    let filesFound = false;
    for (const path of forbiddenPaths) {
      try {
        const files = fs.readdirSync(path).filter(f => f.endsWith('.md'));
        if (files.length > 0) {
          console.log(`❌ Files found in ${path}: ${files.join(', ')}`);
          filesFound = true;
        }
      } catch (e) {
        // Directory doesn't exist, that's fine
      }
    }
    
    if (!filesFound) {
      console.log('✅ No forbidden files found (database-first compliance)');
      results.files = true;
    }
    
    // Summary
    console.log('\n================================================');
    console.log('VERIFICATION SUMMARY');
    console.log('================================================');
    console.log(`Strategic Directive: ${results.sd ? '✅' : '❌'}`);
    console.log(`Product Requirements: ${results.prd ? '✅' : '❌'}`);
    console.log(`Execution Sequences: ${results.ees ? '✅' : '❌'}`);
    console.log(`No Forbidden Files: ${results.files ? '✅' : '❌'}`);
    
    const allPassed = Object.values(results).every(v => v === true);
    
    if (allPassed) {
      console.log('\n✅ ALL CHECKS PASSED - Ready for EXEC handoff');
      console.log('Progress: 40% (LEAD 20% + PLAN 20%)');
    } else {
      console.log('\n❌ VERIFICATION FAILED - Cannot proceed to EXEC');
      console.log('\nRequired actions:');
      if (!results.sd) console.log('  - Add SD-2025-001 to database');
      if (!results.prd) console.log('  - Add PRD-2025-001 to database');
      if (!results.ees) console.log('  - Add 7 EES items to database');
      if (!results.files) console.log('  - Remove forbidden files from filesystem');
    }
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    process.exit(1);
  }
}

verifyDatabaseState();