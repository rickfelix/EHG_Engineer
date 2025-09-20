#!/usr/bin/env node

/**
 * Fix misplaced shebangs in ES module files
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fixShebang(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Check if shebang exists but not at the start
    if (content.includes('#!/usr/bin/env node') && !content.startsWith('#!/usr/bin/env node')) {
      // Remove the misplaced shebang
      let fixed = content.replace(/\n*#!\/usr\/bin\/env node\n*/g, '\n');
      
      // Add shebang at the beginning if it doesn't exist
      if (!fixed.startsWith('#!/usr/bin/env node')) {
        fixed = '#!/usr/bin/env node\n\n' + fixed.trim() + '\n';
      }
      
      await fs.writeFile(filePath, fixed, 'utf-8');
      console.log(`✅ Fixed: ${path.basename(filePath)}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  const scriptsDir = path.join(__dirname, 'scripts');
  const files = await fs.readdir(scriptsDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  
  console.log(`Checking ${jsFiles.length} JavaScript files for shebang issues...\n`);
  
  let fixedCount = 0;
  for (const file of jsFiles) {
    const filePath = path.join(scriptsDir, file);
    if (await fixShebang(filePath)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✅ Fixed ${fixedCount} files with misplaced shebangs`);
}

main().catch(console.error);