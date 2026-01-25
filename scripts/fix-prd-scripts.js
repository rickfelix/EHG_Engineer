#!/usr/bin/env node

/**
 * Automated PRD Script Fixer
 *
 * Automatically fixes common schema issues in PRD creation scripts:
 * 1. Adds sd_uuid population pattern
 * 2. Replaces strategic_directive_id with sd_uuid
 * 3. Moves invalid fields to metadata
 * 4. Renames deprecated fields
 *
 * Usage:
 *   node scripts/fix-prd-scripts.js --dry-run  # Preview changes
 *   node scripts/fix-prd-scripts.js            # Apply fixes
 *   node scripts/fix-prd-scripts.js <file>     # Fix specific file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import globPkg from 'glob';
const { glob } = globPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_FILE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;

// SD UUID population pattern to inject
const SD_UUID_FETCH_PATTERN = `
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(\`❌ Strategic Directive \${sdId} not found in database\`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(\`   SD uuid_id: \${sdUuid}\`);
`;

function detectSDIdVariable(content) {
  // Try to find the SD ID variable name
  const patterns = [
    /const\s+(\w+)\s*=\s*['"]SD-/,
    /sdId\s*=\s*['"]SD-/,
    /sd_id\s*=\s*['"]SD-/,
    /directive_id\s*=\s*['"]SD-/
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1] || 'sdId';
  }

  return 'sdId'; // Default
}

function hasSDUuidFetch(content) {
  return content.includes('sd_uuid') ||
         content.includes('uuid_id') ||
         content.includes('sdUuid') ||
         content.includes('FIX: Get SD uuid_id');
}

function findInsertLocation(content) {
  // Find where to inject SD UUID fetch
  // Look for patterns like:
  // - const prd = {
  // - const prdData = {
  // - .insert({

  const insertPattern = /const\s+prd\w*\s*=\s*\{/;
  const match = content.match(insertPattern);

  if (match) {
    return content.indexOf(match[0]);
  }

  return -1;
}

function addSDUuidFetch(content, sdIdVar) {
  const insertPos = findInsertLocation(content);

  if (insertPos === -1) {
    console.warn('   ⚠️  Could not find insert location for sd_uuid fetch');
    return content;
  }

  // Inject before the PRD object creation
  const before = content.substring(0, insertPos);
  const after = content.substring(insertPos);

  const fetchCode = SD_UUID_FETCH_PATTERN.replace(/sdId/g, sdIdVar);

  return before + fetchCode + '\n' + after;
}

function fixFieldNames(content) {
  let fixed = content;

  // Replace strategic_directive_id with sd_uuid in object literals
  // But keep directive_id for backward compatibility
  fixed = fixed.replace(
    /strategic_directive_id:\s*(\w+)/g,
    'sd_uuid: sdUuid, // FIX: Use UUID instead of string ID\n    directive_id: $1'
  );

  // Replace prd_id with id
  fixed = fixed.replace(
    /prd_id:\s*['"`]([^'"`]+)['"`]/g,
    'id: \'$1\' // FIX: Use id instead of prd_id'
  );

  // Move user_stories to comment
  fixed = fixed.replace(
    /user_stories:\s*\[/g,
    '// FIX: user_stories moved to separate table\n    // user_stories: ['
  );

  // Move invalid fields to metadata
  const invalidFields = [
    'ui_components',
    'ui_components_summary',
    'success_metrics',
    'database_changes',
    'complexity_score',
    'objectives',
    'deployment_plan',
    'documentation_requirements',
    'estimated_effort_hours'
  ];

  invalidFields.forEach(field => {
    // Comment out direct usage
    const fieldPattern = new RegExp(`^(\\s+)${field}:\\s*`, 'gm');
    fixed = fixed.replace(
      fieldPattern,
      `$1// FIX: ${field} moved to metadata\n$1// ${field}: `
    );
  });

  // Fix risks_and_mitigations -> risks
  fixed = fixed.replace(
    /risks_and_mitigations:/g,
    'risks: // FIX: Renamed from risks_and_mitigations'
  );

  // Fix technical_architecture -> system_architecture
  fixed = fixed.replace(
    /technical_architecture:/g,
  // FIX: Renamed from technical_architecture
    'system_architecture: // FIX: Renamed from technical_architecture'
  );

  // Fix target_completion_date -> planned_end
  fixed = fixed.replace(
    /target_completion_date:/g,
    'planned_end: // FIX: Renamed from target_completion_date'
  );

  // Fix problem_statement -> business_context
  fixed = fixed.replace(
    /problem_statement:/g,
    'business_context: // FIX: Renamed from problem_statement'
  );

  return fixed;
}

function addSDUuidToInsert(content) {
  // Add sd_uuid to insert objects that are missing it
  // Look for patterns like:
  //   id: 'PRD-...',
  //   directive_id: ...,
  // And add sd_uuid after directive_id if not present

  const lines = content.split('\n');
  const result = [];
  let inPRDObject = false;
  let hasSeenDirectiveId = false;
  let hasSeenSdUuid = false;
  let indentation = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    // Detect PRD object start
    if (line.match(/const\s+prd\w*\s*=\s*\{/) || line.match(/\.insert\(\{/)) {
      inPRDObject = true;
      hasSeenDirectiveId = false;
      hasSeenSdUuid = false;
    }

    if (inPRDObject) {
      // Detect indentation
      const match = line.match(/^(\s+)/);
      if (match) indentation = match[1];

      // Check for directive_id
      if (line.includes('directive_id:')) {
        hasSeenDirectiveId = true;
      }

      // Check for sd_uuid
      if (line.includes('sd_uuid:')) {
        hasSeenSdUuid = true;
      }

      // If we see closing brace and we had directive_id but no sd_uuid, inject it
      if (line.trim() === '};' || line.trim() === '})') {
        if (hasSeenDirectiveId && !hasSeenSdUuid) {
          // Insert sd_uuid before closing brace
          result.splice(result.length - 1, 0,
            `${indentation}sd_uuid: sdUuid, // FIX: Added for handoff validation`
          );
        }
        inPRDObject = false;
      }
    }
  }

  return result.join('\n');
}

function fixScript(filePath) {
  console.log(`\n📄 ${path.basename(filePath)}`);

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  const changes = [];

  // 1. Add sd_uuid fetch if missing
  if (!hasSDUuidFetch(content) && content.includes('product_requirements_v2')) {
    const sdIdVar = detectSDIdVariable(content);
    content = addSDUuidFetch(content, sdIdVar);
    changes.push('Added sd_uuid fetch pattern');
    modified = true;
  }

  // 2. Fix field names
  const beforeFix = content;
  content = fixFieldNames(content);
  if (content !== beforeFix) {
    changes.push('Fixed field names');
    modified = true;
  }

  // 3. Add sd_uuid to insert statements
  const beforeInsert = content;
  content = addSDUuidToInsert(content);
  if (content !== beforeInsert) {
    changes.push('Added sd_uuid to insert');
    modified = true;
  }

  if (modified) {
    if (changes.length > 0) {
      console.log('  Changes:');
      changes.forEach(change => console.log(`    - ${change}`));
    }

    if (!DRY_RUN) {
      // Backup original
      fs.writeFileSync(filePath + '.backup', fs.readFileSync(filePath));
      // Write fixed version
      fs.writeFileSync(filePath, content);
      console.log('  ✅ Fixed (backup created)');
    } else {
      console.log('  📋 Would fix (dry-run mode)');
    }
  } else {
    console.log('  ✓ No changes needed');
  }

  return modified;
}

function main() {
  console.log('\n🔧 PRD SCRIPT FIXER');
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified');
  }
  console.log('');

  let files = [];

  if (TARGET_FILE) {
    // Fix specific file
    files = [path.resolve(TARGET_FILE)];
  } else {
    // Fix all PRD scripts
    const scriptsDir = __dirname;
    const patterns = [
      'create-prd-*.js',
      'create-*-prd.js',
      'add-prd-*.js',
      'generate-prd-*.js',
      'update-prd-*.js',
      'insert-prd-*.js',
      'populate-prd-*.js'
    ];

    patterns.forEach(pattern => {
      const matches = glob.sync(pattern, {
        cwd: scriptsDir,
        ignore: ['fix-prd-scripts.js', 'audit-all-prd-scripts.js']
      });
      matches.forEach(f => files.push(path.join(scriptsDir, f)));
    });
  }

  files = [...new Set(files)]; // Deduplicate
  console.log(`Found ${files.length} scripts to process\n`);

  let fixedCount = 0;
  let errorCount = 0;

  files.forEach(file => {
    try {
      const wasFixed = fixScript(file);
      if (wasFixed) fixedCount++;
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      errorCount++;
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Scripts: ${files.length}`);
  console.log(`Fixed: ${fixedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Unchanged: ${files.length - fixedCount - errorCount}`);

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  } else {
    console.log('\n✅ Fixes applied! Backup files created with .backup extension');
    console.log('💡 Run audit again to verify: node scripts/audit-all-prd-scripts.js');
  }
}

main().catch(err => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
