#!/usr/bin/env node

/**
 * Create a new Strategic Directive
 * Per LEO Protocol v3.1.5
 */

import { createClient  } from '@supabase/supabase-js';
import fs from 'fs';.promises;
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function createNewSD() {
  console.log('📋 Creating new Strategic Directive...\n');
  
  // Get current date for SD-ID
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  // Generate SD-ID (you may want to check for existing SDs on same date)
  const sdId = `SD-${year}-${month}-${day}-A`;
  
  console.log(`Generated SD-ID: ${sdId}`);
  console.log(`📁 File will be created at: docs/wbs_artefacts/strategic_directives/${sdId}.md`);
  
  try {
    // Read the template
    const templatePath = path.join(process.cwd(), 'docs', 'templates', 'leo_protocol', 'strategic_directive_template.md');
    const template = await fs.readFile(templatePath, 'utf-8');
    
    // Replace placeholders in template
    const sdContent = template
      .replace(/\[SD-ID\]/g, sdId)
      .replace(/SD-YYYY-MM-DD-\[A\]/g, sdId)
      .replace(/YYYY-MM-DD/g, `${year}-${month}-${day}`)
      .replace(/\[Title\]/g, '[Enter Strategic Directive Title]');
    
    // Create the SD file
    const sdPath = path.join(process.cwd(), 'docs', 'wbs_artefacts', 'strategic_directives', `${sdId}.md`);
    await fs.writeFile(sdPath, sdContent);
    
    console.log(`✅ Strategic Directive template created: ${sdPath}`);
    console.log('\n📝 Next steps:');
    console.log('1. Edit the SD file with your strategic objectives');
    console.log('2. Add the SD to the database:');
    console.log(`   npm run add-sd ${sdId}`);
    console.log('3. Create corresponding EES items');
    
  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);
    process.exit(1);
  }
}

createNewSD();