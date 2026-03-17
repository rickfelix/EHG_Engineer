#!/usr/bin/env node

/**
 * Auto-Generate PRD Script from Template
 *
 * Automatically creates a new PRD script from template with proper naming.
 * No need to manually copy and rename!
 *
 * Usage:
 *   node scripts/generate-prd-script.js SD-AUTH-001
 *   node scripts/generate-prd-script.js SD-AUTH-001 "Authentication System PRD"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const TEMPLATE_PATH = path.join(__dirname, '../templates/prd-script-template.js');
const SCRIPTS_DIR = path.join(__dirname);

// ============================================================================
// Main Function
// ============================================================================

async function generatePRDScript() {
  console.log('\n🚀 PRD Script Generator');
  console.log('='.repeat(70));

  // Parse arguments
  const sdId = process.argv[2];
  const prdTitle = process.argv.slice(3).join(' ');

  if (!sdId || !sdId.startsWith('SD-')) {
    console.error('\n❌ Error: Invalid SD ID');
    console.error('\nUsage:');
    console.error('  node scripts/generate-prd-script.js <SD-ID> [PRD-Title]');
    console.error('\nExample:');
    console.error('  node scripts/generate-prd-script.js SD-AUTH-001');
    console.error('  node scripts/generate-prd-script.js SD-AUTH-001 "Authentication System PRD"');
    process.exit(1);
  }

  // Generate script filename
  const scriptFilename = `create-prd-${sdId.toLowerCase()}.js`;
  const scriptPath = path.join(SCRIPTS_DIR, scriptFilename);

  // Check if script already exists
  if (fs.existsSync(scriptPath)) {
    console.error(`\n❌ Error: Script already exists: ${scriptFilename}`);
    console.error('\nOptions:');
    console.error('  1. Delete existing script first');
    console.error('  2. Use a different SD ID');
    console.error(`  3. Edit existing script: ${scriptPath}`);
    process.exit(1);
  }

  console.log(`\n📋 Creating PRD script for ${sdId}...`);

  // Read template
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Fetch SD details from database (if available)
  let sdTitle = prdTitle || 'TEMPLATE PRD Title';

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    console.log('   Fetching SD details from database...');

    // Query by sd_key OR id to handle both formats
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, category, priority, description')
      .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
      .single();

    if (!sdError && sdData) {
      console.log(`   ✅ Found SD: ${sdData.title}`);
      sdTitle = prdTitle || `${sdData.title} - Technical Implementation`;

      // If we have SD data, we can pre-fill more details
      template = template.replace(
        /category: sdData\.category \|\| 'technical'/g,
        `category: '${sdData.category || 'technical'}'`
      );
      template = template.replace(
        /priority: sdData\.priority \|\| 'high'/g,
        `priority: '${sdData.priority || 'high'}'`
      );
    } else {
      console.log('   ℹ️  SD not found in database (will use template defaults)');
      if (!prdTitle) {
        sdTitle = 'TEMPLATE PRD Title - Please Update';
      }
    }
  } catch (_err) {
    console.log('   ⚠️  Could not connect to database (using template defaults)');
  }

  // Replace template placeholders
  template = template.replace(/TEMPLATE_SD_ID/g, sdId);
  template = template.replace(/TEMPLATE PRD Title/g, sdTitle);

  // Write new script
  fs.writeFileSync(scriptPath, template);

  console.log('\n✅ PRD script created successfully!');
  console.log('='.repeat(70));
  console.log(`   File: ${scriptPath}`);
  console.log(`   SD ID: ${sdId}`);
  console.log(`   Title: ${sdTitle}`);

  console.log('\n📝 Next Steps:');
  console.log(`   1. Review and edit: ${scriptFilename}`);
  console.log('      - Update TODO sections');
  console.log('      - Add requirements, architecture, test scenarios');
  console.log('      - Customize checklists');
  console.log('');
  console.log(`   2. Run script: node scripts/${scriptFilename}`);
  console.log('      - Creates PRD in database');
  console.log('      - Validates schema automatically');
  console.log('      - Provides next steps');
  console.log('');
  console.log('   3. Commit: git add scripts/' + scriptFilename);
  console.log('      - Pre-commit hook validates automatically');
  console.log('');

  console.log('💡 Tips:');
  console.log('   - Search for "TODO:" to find sections needing updates');
  console.log('   - Template includes all valid schema fields');
  console.log('   - Schema validation runs automatically before insert');
  console.log('   - See docs/PRD_DEVELOPER_GUIDE.md for help');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

generatePRDScript().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
