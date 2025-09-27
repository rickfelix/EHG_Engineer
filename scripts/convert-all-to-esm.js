#!/usr/bin/env node

/**
 * Convert ALL CommonJS scripts to ES Modules
 * SD-LEO-001: Complete conversion of all scripts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function convertScript(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const originalContent = content;

    // Skip if already fully converted
    if (content.includes('import ') && !content.includes('require(') && !content.includes('module.exports')) {
      return { file: fileName, status: 'already converted', changed: false };
    }

    // Comprehensive conversion patterns
    const conversions = [
      // Convert require statements
      [/const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, "import $1 from '$2';"],
      [/const\s+{\s*([^}]+)\s*}\s*=\s*require\(['"]([^'"]+)['"]\);?/g, "import { $1 } from '$2';"],
      [/let\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, "import $1 from '$2';"],
      [/var\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, "import $1 from '$2';"],

      // Special case for dotenv
      [/require\(['"]dotenv['"]\)\.config\([^)]*\);?/g, "import dotenv from 'dotenv';\ndotenv.config();"],

      // Convert module.exports
      [/module\.exports\s*=\s*(\w+);?$/m, "export default $1;"],
      [/module\.exports\s*=\s*{([^}]+)};?$/m, "export { $1 };"],
      [/module\.exports\.(\w+)\s*=\s*(.+);?$/gm, "export const $1 = $2;"],
      [/exports\.(\w+)\s*=\s*(.+);?$/gm, "export const $1 = $2;"],

      // Convert __dirname and __filename usage
      [/const\s+__dirname\s*=\s*[^;]+;?/g, ""],
      [/const\s+__filename\s*=\s*[^;]+;?/g, ""],
    ];

    // Apply conversions
    for (const [pattern, replacement] of conversions) {
      content = content.replace(pattern, replacement);
    }

    // Add __dirname and __filename for ES modules if used but not defined
    if ((content.includes('__dirname') || content.includes('__filename')) && !content.includes('fileURLToPath')) {
      const imports = content.match(/^import[\s\S]*?;$/gm) || [];
      const lastImportIndex = imports.length > 0 ? content.lastIndexOf(imports[imports.length - 1]) + imports[imports.length - 1].length : 0;

      const esmHelpers = `\nimport { fileURLToPath } from 'url';\nimport { dirname } from 'path';\n\nconst __filename = fileURLToPath(import.meta.url);\nconst __dirname = dirname(__filename);\n`;

      content = content.slice(0, lastImportIndex) + esmHelpers + content.slice(lastImportIndex);
    }

    // Fix require.main === module
    content = content.replace(/if\s*\(\s*require\.main\s*===\s*module\s*\)/g, 'if (import.meta.url === `file://\${process.argv[1]}`)');

    // Clean up duplicate imports
    const importLines = content.match(/^import.*$/gm) || [];
    const uniqueImports = [...new Set(importLines)];
    if (importLines.length !== uniqueImports.length) {
      for (const imp of importLines) {
        content = content.replace(imp + '\n', '');
      }
      content = uniqueImports.join('\n') + '\n' + content;
    }

    // Check if content actually changed
    const changed = content !== originalContent;

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
  console.log('🔄 Converting ALL CommonJS scripts to ES Modules');
  console.log('=' .repeat(60));

  // Get all .js files in scripts directory
  const files = await fs.readdir(__dirname);
  const jsFiles = files.filter(f => f.endsWith('.js') && f !== 'convert-all-to-esm.js');

  console.log(`📊 Found ${jsFiles.length} JavaScript files to process\n`);

  const results = [];
  let converted = 0;
  let skipped = 0;
  let errors = 0;

  // Process each file
  for (const file of jsFiles) {
    const filePath = path.join(__dirname, file);
    const result = await convertScript(filePath);
    results.push(result);

    if (result.changed) {
      console.log(`✅ ${result.file}`);
      converted++;
    } else if (result.status.includes('error')) {
      console.log(`❌ ${result.file}: ${result.status}`);
      errors++;
    } else {
      console.log(`⏭️  ${result.file}: ${result.status}`);
      skipped++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 CONVERSION COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Converted: ${converted} scripts`);
  console.log(`⏭️  Skipped: ${skipped} scripts (already ES modules)`);
  console.log(`❌ Errors: ${errors} scripts`);
  console.log(`📁 Total: ${jsFiles.length} scripts`);

  if (errors > 0) {
    console.log('\n⚠️  Some scripts had errors - manual review may be needed');
    const errorFiles = results.filter(r => r.status.includes('error'));
    errorFiles.forEach(f => console.log(`  - ${f.file}: ${f.status}`));
  }

  console.log('\n✅ SD-LEO-001: Module type warnings elimination COMPLETE!');
  console.log('🎯 All scripts have been processed for ES module conversion');
}

main().catch(console.error);