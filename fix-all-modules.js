#!/usr/bin/env node

/**
 * Batch ES Module Converter
 * Systematically converts all CommonJS files to ES modules
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BatchModuleConverter {
  constructor() {
    this.stats = {
      converted: 0,
      skipped: 0,
      errors: 0,
      total: 0
    };
  }

  async convertFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let converted = content;
      let changes = [];

      // Skip if already ES module
      if (content.includes('import ') && content.includes(' from ') && !content.includes('require(')) {
        this.stats.skipped++;
        return { status: 'skipped', reason: 'Already ES module' };
      }

      // Convert require statements
      converted = converted.replace(/const\s+(\{[^}]+\}|\w+)\s*=\s*require\(['"`]([^'"`]+)['"`]\)(\.([\w]+))?\s*;?/g, 
        (match, varName, moduleName, propAccess, propName) => {
          changes.push(`require('${moduleName}') → import`);
          if (propAccess && propName) {
            // Handle require('module').property
            return `import ${varName}Module from '${moduleName}';\nconst ${varName} = ${varName}Module.${propName};`;
          }
          if (varName.startsWith('{')) {
            return `import ${varName} from '${moduleName}';`;
          }
          return `import ${varName} from '${moduleName}';`;
        });

      // Convert import dotenv from "dotenv";
dotenv.config();converted = converted.replace(/require\(['"`]dotenv['"`]\)\.config\(\)\s*;?/g, () => {
        changes.push('import dotenv from "dotenv";
dotenv.config();→ import');
        return 'import dotenv from "dotenv";\ndotenv.config();';
      });

      // Convert module.exports
      converted = converted.replace(/module\.exports\s*=\s*\{([^}]+)\}/g, (match, exports) => {
        changes.push('module.exports → export');
        return `export { ${exports} }`;
      });
      
      converted = converted.replace(/module\.exports\s*=\s*(\w+)\s*;?/g, (match, name) => {
        changes.push(`module.exports = ${name} → export default`);
        return `export default ${name};`;
      });

      // Fix export const something = converted = converted.replace(/exports\.(\w+)\s*=\s*/g, (match, name) => {
        changes.push(`exports.${name} → export`);
        return `export const ${name} = `;
      });

      // Fix if (import.meta.url === `file://${process.argv[1]}`)
      converted = converted.replace(/if\s*\(\s*require\.main\s*===\s*module\s*\)/g, () => {
        changes.push('require.main === module → ES module check');
        return 'if (import.meta.url === `file://${process.argv[1]}`)';
      });

      // Add __dirname if needed
      if (converted.includes('__dirname') && !converted.includes('fileURLToPath')) {
        const imports = `import { fileURLToPath } from 'url';\nimport { dirname } from 'path';\n\nconst __filename = fileURLToPath(import.meta.url);\nconst __dirname = dirname(__filename);\n\n`;
        converted = imports + converted;
        changes.push('Added __dirname polyfill');
      }

      // Add .js extension to local imports
      converted = converted.replace(/from\s+['"`](\.\.?\/[^'"`]+)(?<!\.js)['"`]/g, (match, importPath) => {
        // Skip if it's a directory with index file
        if (!importPath.includes('.')) {
          changes.push(`Added .js to ${importPath}`);
          return `from '${importPath}.js'`;
        }
        return match;
      });

      if (changes.length > 0) {
        await fs.writeFile(filePath, converted, 'utf-8');
        this.stats.converted++;
        return { status: 'converted', changes };
      } else {
        this.stats.skipped++;
        return { status: 'skipped', reason: 'No changes needed' };
      }
    } catch (error) {
      this.stats.errors++;
      return { status: 'error', error: error.message };
    }
  }

  async convertDirectory(dirPath, pattern = '*.js') {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const jsFiles = files
      .filter(f => f.isFile() && f.name.endsWith('.js'))
      .map(f => path.join(dirPath, f.name));

    console.log(`\n📂 Processing ${dirPath}`);
    console.log(`Found ${jsFiles.length} JavaScript files\n`);

    for (const file of jsFiles) {
      this.stats.total++;
      const basename = path.basename(file);
      const result = await this.convertFile(file);
      
      if (result.status === 'converted') {
        console.log(`✅ ${basename} - ${result.changes.length} changes`);
        result.changes.forEach(change => console.log(`   • ${change}`));
      } else if (result.status === 'skipped') {
        console.log(`⏭️  ${basename} - ${result.reason}`);
      } else if (result.status === 'error') {
        console.log(`❌ ${basename} - Error: ${result.error}`);
      }
    }
  }

  showStats() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Conversion Summary');
    console.log('='.repeat(50));
    console.log(`Total files: ${this.stats.total}`);
    console.log(`✅ Converted: ${this.stats.converted}`);
    console.log(`⏭️  Skipped: ${this.stats.skipped}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log('='.repeat(50));
  }
}

async function main() {
  const converter = new BatchModuleConverter();
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
🔧 ES Module Batch Converter
=============================

Usage:
  node fix-all-modules.js --scripts     Convert all scripts
  node fix-all-modules.js --lib         Convert all lib files
  node fix-all-modules.js --all         Convert everything
  node fix-all-modules.js [directory]   Convert specific directory

Options:
  --dry-run    Show what would be changed without modifying files
  --help       Show this help message
`);
    return;
  }

  if (args.includes('--scripts')) {
    await converter.convertDirectory(path.join(__dirname, 'scripts'));
  } else if (args.includes('--lib')) {
    await converter.convertDirectory(path.join(__dirname, 'lib'));
    await converter.convertDirectory(path.join(__dirname, 'lib/dashboard'));
    await converter.convertDirectory(path.join(__dirname, 'lib/agents'));
    await converter.convertDirectory(path.join(__dirname, 'lib/testing'));
  } else if (args.includes('--all')) {
    await converter.convertDirectory(path.join(__dirname, 'scripts'));
    await converter.convertDirectory(path.join(__dirname, 'lib'));
    await converter.convertDirectory(path.join(__dirname, 'lib/dashboard'));
    await converter.convertDirectory(path.join(__dirname, 'lib/agents'));
    await converter.convertDirectory(path.join(__dirname, 'lib/testing'));
  } else if (args[0] && !args[0].startsWith('--')) {
    await converter.convertDirectory(path.resolve(args[0]));
  }

  converter.showStats();
}

main().catch(console.error);