#!/usr/bin/env node

/**
 * Convert CommonJS scripts to ES Modules
 * Part of SD-LEO-001 implementation
 */

import fs from 'fs/promises';
import path from 'path';
import { _fileURLToPath } from 'url';
import { _dirname } from 'path';





async function convertScript(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);

    // Skip if already converted
    if (content.includes('import ') && !content.includes('require(')) {
      return { file: fileName, status: 'already converted', changed: false };
    }

    // Common conversions
    const conversions = [
      // Basic requires
      [/const\s+{\s*createClient\s*}\s*=\s*require\(['"]@supabase\/supabase-js['"]\);?/g,
       "import { createClient } from '@supabase/supabase-js';"],
      [/const\s+dotenv\s*=\s*require\(['"]dotenv['"]\);?/g,
       "import dotenv from 'dotenv';"],
      [/const\s+path\s*=\s*require\(['"]path['"]\);?/g,
       "import path from 'path';"],
      [/const\s+fs\s*=\s*require\(['"]fs['"]\);?/g,
       "import fs from 'fs';"],
      [/const\s+{\s*exec\s*}\s*=\s*require\(['"]child_process['"]\);?/g,
       "import { exec } from 'child_process';"],
      [/const\s+{\s*promisify\s*}\s*=\s*require\(['"]util['"]\);?/g,
       "import { promisify } from 'util';"],

      // Add __dirname and __filename for ES modules if missing
      [/^(#!.*\n)?(\/\*[\s\S]*?\*\/\n)?/,
       function(match) {
         if (!content.includes('__dirname') && !content.includes('__filename')) {
           return match;
         }
         if (content.includes('fileURLToPath')) {
           return match;
         }
         return match + `



`;
       }]
    ];

    let changed = false;
    for (const [pattern, replacement] of conversions) {
      const before = content;
      content = content.replace(pattern, replacement);
      if (before !== content) changed = true;
    }

    // Fix dotenv.config() calls
    content = content.replace(
      /require\(['"]dotenv['"]\)\.config\(\);?/g,
      "import dotenv from 'dotenv';\ndotenv.config();"
    );

    if (changed) {
      await fs.writeFile(filePath, content);
      return { file: fileName, status: 'converted', changed: true };
    }

    return { file: fileName, status: 'no changes needed', changed: false };

  } catch (error) {
    return { file: path.basename(filePath), status: `error: ${error.message}`, changed: false };
  }
}

async function main() {
  console.log('🔄 Converting CommonJS scripts to ES Modules');
  console.log('=' .repeat(50));

  // Priority scripts to convert (commonly used)
  const priorityScripts = [
    'check-directives-data.js',
    'update-directive-status.js',
    'add-sd-to-database.js',
    'verify-connection.js',
    'setup-database.js'
  ];

  const results = [];

  for (const script of priorityScripts) {
    const scriptPath = path.join(__dirname, script);
    try {
      await fs.access(scriptPath);
      const result = await convertScript(scriptPath);
      results.push(result);
      console.log(`${result.changed ? '✅' : '⏭️'} ${result.file}: ${result.status}`);
    } catch (_error) {
      console.log(`⏭️ ${script}: not found`);
    }
  }

  console.log('\n📊 Conversion Summary:');
  const converted = results.filter(r => r.changed).length;
  const skipped = results.filter(r => !r.changed).length;
  console.log(`  Converted: ${converted}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total: ${results.length}`);

  if (converted > 0) {
    console.log('\n✅ Scripts converted successfully!');
    console.log('🎯 Next: Test the converted scripts to ensure they work');
  } else {
    console.log('\n✅ All priority scripts already converted or not found');
  }
}

main().catch(console.error);