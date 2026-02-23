#!/usr/bin/env node

// import { fileURLToPath } from 'url'; // Unused
// import { dirname } from 'path'; // Unused




/**
 * Validate Strategic Directive Completion Readiness
 *
 * Checks that all database fields required for dashboard 100% calculation are set
 * Run before completing any Strategic Directive to prevent progress display issues
 *
 * Usage: node validate-sd-completion.js SD-2025-001
 */

import { createClient } from '@supabase/supabase-js';
// import path from 'path'; // Unused
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function validateSDCompletion(sdId) {
  if (!sdId) {
    console.error('❌ Usage: node validate-sd-completion.js SD-XXXX-XXX');
    process.exit(1);
  }

  console.log(`🔍 VALIDATING COMPLETION READINESS: ${sdId}`);
  console.log('================================================\n');

  let validationPassed = true;
  const issues = [];
  const warnings = [];

  try {
    // 1. Check Strategic Directive record
    console.log('1. STRATEGIC DIRECTIVE VALIDATION:');
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      issues.push(`Strategic Directive ${sdId} not found in database`);
      validationPassed = false;
    } else {
      // Check required SD fields
      const requiredSDFields = {
        'status': 'archived',
        'metadata.completion_percentage': 100,
        'metadata.current_phase': 'COMPLETE',
        'metadata.phase_progress.LEAD': 100,
        'metadata.phase_progress.PLAN': 100,
        'metadata.phase_progress.EXEC': 100,
        'metadata.phase_progress.VERIFICATION': 100,
        'metadata.phase_progress.APPROVAL': 100
      };

      for (const [field, expectedValue] of Object.entries(requiredSDFields)) {
        const fieldPath = field.split('.');
        let actualValue = sd;
        for (const key of fieldPath) {
          actualValue = actualValue?.[key];
        }

        if (actualValue !== expectedValue) {
          issues.push(`SD ${field}: expected '${expectedValue}', got '${actualValue}'`);
          validationPassed = false;
        } else {
          console.log(`  ✅ ${field}: ${actualValue}`);
        }
      }
    }

    // 2. Check PRD record
    console.log('\n2. PRODUCT REQUIREMENTS VALIDATION:');
    const { data: prds, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId);

    if (prdError || !prds || prds.length === 0) {
      issues.push(`No PRD found for ${sdId}`);
      validationPassed = false;
    } else {
      const prd = prds[0];
      
      // Check required PRD fields for dashboard calculation
      const requiredPRDFields = {
        'status': 'approved',
        'phase': 'complete',
        'progress': 100,
        'phase_progress.PLAN': 100,
        'phase_progress.EXEC': 100,
        'phase_progress.VERIFICATION': 100,
        'phase_progress.APPROVAL': 100,
        'metadata.Status': 'Testing' // Dashboard verification calculation requirement
      };

      for (const [field, expectedValue] of Object.entries(requiredPRDFields)) {
        const fieldPath = field.split('.');
        let actualValue = prd;
        for (const key of fieldPath) {
          actualValue = actualValue?.[key];
        }

        if (actualValue !== expectedValue) {
          if (field === 'metadata.Status') {
            // This is a known dashboard bug workaround
            warnings.push(`PRD ${field}: expected '${expectedValue}' for dashboard verification calculation, got '${actualValue}'`);
          } else {
            issues.push(`PRD ${field}: expected '${expectedValue}', got '${actualValue}'`);
            validationPassed = false;
          }
        } else {
          console.log(`  ✅ ${field}: ${actualValue}`);
        }
      }

      // Check checklist fields exist (even if dashboard doesn't use them properly)
      const checklistFields = ['plan_checklist', 'exec_checklist', 'validation_checklist'];
      for (const field of checklistFields) {
        if (!prd[field] || !Array.isArray(prd[field]) || prd[field].length === 0) {
          warnings.push(`PRD ${field} is empty - may affect future dashboard improvements`);
        } else {
          const checkedItems = prd[field].filter(item => item.checked).length;
          const totalItems = prd[field].length;
          if (checkedItems !== totalItems) {
            warnings.push(`PRD ${field}: only ${checkedItems}/${totalItems} items checked`);
          } else {
            console.log(`  ✅ ${field}: ${totalItems}/${totalItems} items complete`);
          }
        }
      }
    }

    // 3. Dashboard calculation simulation
    console.log('\n3. DASHBOARD CALCULATION SIMULATION:');
    if (sd && prds && prds.length > 0) {
      const prd = prds[0];
      
      // Simulate dashboard calculation logic
      const sdProgress = 100; // Should use PRD progress per line 315 in server.js
      const prdProgress = prd.progress || 0;
      const dashboardProgress = Math.round((sdProgress + prdProgress) / 2);
      
      console.log(`  SD Progress (calculated): ${sdProgress}%`);
      console.log(`  PRD Progress (database): ${prdProgress}%`);
      console.log(`  Dashboard Calculation: (${sdProgress} + ${prdProgress}) / 2 = ${dashboardProgress}%`);
      
      if (dashboardProgress !== 100) {
        issues.push(`Dashboard will show ${dashboardProgress}% instead of 100%`);
        validationPassed = false;
      } else {
        console.log('  ✅ Dashboard will show 100%');
      }
    }

    // 4. Results
    console.log('\n📊 VALIDATION RESULTS:');
    console.log('=====================');
    
    if (issues.length > 0) {
      console.log('❌ CRITICAL ISSUES (must fix):');
      issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (recommended fixes):');
      warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    if (validationPassed) {
      console.log('\n🎉 VALIDATION PASSED');
      console.log(`${sdId} is ready for dashboard display at 100%`);
      return true;
    } else {
      console.log('\n❌ VALIDATION FAILED');
      console.log(`Fix the ${issues.length} critical issues before completing ${sdId}`);
      return false;
    }

  } catch (error) {
    console.error('❌ Validation error:', error.message);
    return false;
  }
}

// Run validation if executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const sdId = process.argv[2];
  
  validateSDCompletion(sdId)
    .then(success => {
      process.exit(success ? 0 : 1);
    });
}

export {  validateSDCompletion  };
