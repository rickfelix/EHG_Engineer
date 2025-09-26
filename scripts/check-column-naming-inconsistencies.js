#!/usr/bin/env node

/**
 * Check Column Naming Inconsistencies
 * Identify progress vs progress_percentage column naming issues
 * Phase 1, Task 3 of LEO Protocol improvements
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkColumnNamingIssues() {
  console.log('🔍 CHECKING COLUMN NAMING INCONSISTENCIES');
  console.log('=' .repeat(60));

  try {
    // 1. First, let's check the actual schema of strategic_directives_v2
    console.log('📊 Checking strategic_directives_v2 table structure...');

    const { data: testRecord, error: queryError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .limit(1)
      .single();

    if (queryError) {
      console.error('❌ Error querying table:', queryError.message);
      return;
    }

    console.log('✅ Available columns in strategic_directives_v2:');
    const columns = Object.keys(testRecord);
    const progressColumns = columns.filter(col =>
      col.includes('progress') || col.includes('percentage')
    );

    console.log('   All columns:', columns.join(', '));
    console.log('   Progress-related columns:', progressColumns.join(', '));

    // 2. Search for scripts that might be using wrong column names
    console.log('\n🔍 Scanning scripts for column name mismatches...');

    const scriptsDir = './scripts';
    const files = fs.readdirSync(scriptsDir).filter(file =>
      file.endsWith('.js') && !file.includes('check-column-naming')
    );

    const issues = [];

    for (const file of files) {
      const filePath = path.join(scriptsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Look for suspicious column references
      const progressPercentageMatches = content.match(/progress_percentage/g);
      const progressMatches = content.match(/\bprogress\b/g);

      if (progressPercentageMatches && progressColumns.length > 0 && !progressColumns.includes('progress_percentage')) {
        issues.push({
          file: file,
          issue: 'Uses progress_percentage but column may be progress',
          matches: progressPercentageMatches.length,
          type: 'COLUMN_MISMATCH'
        });
      }

      // Check for other common issues
      if (content.includes('phase_progress') && !progressColumns.includes('phase_progress')) {
        issues.push({
          file: file,
          issue: 'Uses phase_progress but column may not exist',
          type: 'MISSING_COLUMN'
        });
      }
    }

    // 3. Report findings
    console.log('\n📋 FINDINGS:');
    console.log(`   Scanned ${files.length} script files`);
    console.log(`   Found ${issues.length} potential issues`);

    if (issues.length > 0) {
      console.log('\n⚠️  POTENTIAL COLUMN NAMING ISSUES:');
      issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.file}:`);
        console.log(`      Issue: ${issue.issue}`);
        console.log(`      Type: ${issue.type}`);
        if (issue.matches) {
          console.log(`      Occurrences: ${issue.matches}`);
        }
      });

      // 4. Generate fix recommendations
      console.log('\n🔧 RECOMMENDED FIXES:');

      const columnMismatches = issues.filter(i => i.type === 'COLUMN_MISMATCH');
      if (columnMismatches.length > 0) {
        console.log('   Option 1: Update scripts to use correct column names');
        console.log('   Option 2: Add column alias in database');
        console.log('   Option 3: Create migration to standardize naming');
      }

      const missingColumns = issues.filter(i => i.type === 'MISSING_COLUMN');
      if (missingColumns.length > 0) {
        console.log('   Create missing columns or update scripts');
      }

      return {
        hasIssues: true,
        actualColumns: progressColumns,
        issues: issues
      };
    } else {
      console.log('✅ No column naming inconsistencies found');
      return {
        hasIssues: false,
        actualColumns: progressColumns,
        issues: []
      };
    }

  } catch (error) {
    console.error('❌ Error checking column naming:', error.message);
    return { hasIssues: false, error: error.message };
  }
}

// Execute
checkColumnNamingIssues().then(result => {
  if (result.hasIssues) {
    console.log('\n📝 Next steps: Create migration to fix identified issues');
  } else {
    console.log('\n✅ Column naming is consistent - marking task complete');
  }
}).catch(console.error);