#!/usr/bin/env node

/**
 * Fix Column Naming Inconsistencies
 * Update all scripts to use correct column names (progress vs progress_percentage)
 * Phase 1, Task 3 of LEO Protocol improvements
 */

import fs from 'fs';
import path from 'path';

async function fixColumnNamingIssues() {
  console.log('🔧 FIXING COLUMN NAMING INCONSISTENCIES');
  console.log('=' .repeat(60));

  const filesToFix = [
    'add-sd-2025-001-complete.js',
    'add-venture-workflow-to-database.js',
    'complete-sd-2025-001.js',
    'create-sdip-tables.js',
    'generate-sd-1a-retrospective.js',
    'query-active-sds.js'
  ];

  let totalFixesApplied = 0;

  for (const fileName of filesToFix) {
    const filePath = path.join('./scripts', fileName);

    try {
      console.log(`\n🔍 Processing ${fileName}...`);

      if (!fs.existsSync(filePath)) {
        console.log(`   ⚠️  File not found: ${fileName}`);
        continue;
      }

      // Read the file
      let content = fs.readFileSync(filePath, 'utf-8');
      const originalContent = content;

      // Count occurrences before fix
      const beforeCount = (content.match(/progress_percentage/g) || []).length;

      if (beforeCount === 0) {
        console.log(`   ✅ No issues found in ${fileName}`);
        continue;
      }

      console.log(`   📊 Found ${beforeCount} occurrences of progress_percentage`);

      // Apply fixes
      let fixesInThisFile = 0;

      // Fix 1: Simple progress_percentage -> progress (but be careful about SQL context)
      content = content.replace(
        /(['"`])progress_percentage\1/g,
        (match, quote) => {
          fixesInThisFile++;
          return `${quote}progress${quote}`;
        }
      );

      // Fix 2: Object property references
      content = content.replace(
        /\.progress_percentage\b/g,
        () => {
          fixesInThisFile++;
          return '.progress';
        }
      );

      // Fix 3: Destructuring assignments
      content = content.replace(
        /\bprogress_percentage:/g,
        () => {
          fixesInThisFile++;
          return 'progress:';
        }
      );

      // Fix 4: Variable assignments
      content = content.replace(
        /\bprogress_percentage\s*=/g,
        () => {
          fixesInThisFile++;
          return 'progress =';
        }
      );

      // Fix 5: Select field references
      content = content.replace(
        /,\s*progress_percentage(?=\s*[,\)'])/g,
        () => {
          fixesInThisFile++;
          return ', progress';
        }
      );

      if (fixesInThisFile > 0) {
        // Write the fixed content back
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`   ✅ Applied ${fixesInThisFile} fixes to ${fileName}`);
        totalFixesApplied += fixesInThisFile;

        // Verify the fix worked
        const afterCount = (content.match(/progress_percentage/g) || []).length;
        if (afterCount === 0) {
          console.log(`   🎯 All progress_percentage references fixed`);
        } else {
          console.log(`   ⚠️  ${afterCount} progress_percentage references remain (may be in comments)`);
        }
      } else {
        console.log(`   ℹ️  No fixable patterns found in ${fileName}`);
      }

    } catch (error) {
      console.error(`   ❌ Error processing ${fileName}:`, error.message);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('📊 SUMMARY:');
  console.log(`   Files processed: ${filesToFix.length}`);
  console.log(`   Total fixes applied: ${totalFixesApplied}`);

  if (totalFixesApplied > 0) {
    console.log('\n✅ Column naming inconsistencies FIXED');
    console.log('   All scripts now use correct column name: progress');
    console.log('   Previous incorrect usage: progress_percentage');

    console.log('\n🔍 VERIFICATION RECOMMENDED:');
    console.log('   1. Run tests to ensure scripts still work');
    console.log('   2. Check for any remaining manual issues');
    console.log('   3. Update any documentation references');
  } else {
    console.log('\n⚠️  No fixes were applied - issues may be more complex');
  }

  return {
    filesProcessed: filesToFix.length,
    fixesApplied: totalFixesApplied
  };
}

// Execute
fixColumnNamingIssues().then(result => {
  if (result.fixesApplied > 0) {
    console.log('\n🎉 Phase 1, Task 3 COMPLETE: Column naming inconsistencies fixed');
  } else {
    console.log('\n🤔 Phase 1, Task 3 needs manual review');
  }
}).catch(console.error);