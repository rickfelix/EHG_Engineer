#!/usr/bin/env node
/**
 * Script Inventory Generator
 *
 * Part of Phase 1 Script Maintainability & Organization (A1.3)
 * Generates searchable JSON inventory of all scripts
 *
 * Usage:
 *   node scripts/generate-script-inventory.cjs              # Generate full inventory
 *   node scripts/generate-script-inventory.cjs --update     # Update with new scripts only
 *   node scripts/generate-script-inventory.cjs --file foo.js # Analyze single file
 */

const fs = require('fs').promises;
const path = require('path');

const SCRIPT_DIR = path.join(process.cwd(), 'scripts');
const INVENTORY_PATH = path.join(SCRIPT_DIR, 'SCRIPT_INVENTORY.json');

/**
 * Extract metadata from script file
 * @param {string} filepath - Path to script file
 * @returns {Promise<Object>} Script metadata
 */
async function extractScriptMetadata(filepath) {
  try {
    const content = await fs.readFile(filepath, 'utf8');
    const filename = path.basename(filepath);
    const ext = path.extname(filename);

    // Extract header comment block
    const headerMatch = content.match(/^\/\*\*\n([\s\S]*?)\*\//);
    const headerComment = headerMatch ? headerMatch[1] : '';

    // Extract description
    const descMatch = headerComment.match(/^\s*\*\s*(.+?)$/m);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract usage examples
    const usageMatches = [...headerComment.matchAll(/^\s*\*\s*Usage:\s*$/gm)];
    const usage = [];

    if (usageMatches.length > 0) {
      const usageStart = headerComment.indexOf('Usage:');
      const usageSection = headerComment.substring(usageStart);
      const usageLines = usageSection.split('\n')
        .filter(line => line.includes('node ') || line.includes('npm '))
        .map(line => line.replace(/^\s*\*\s*/, '').trim())
        .filter(Boolean);
      usage.push(...usageLines);
    }

    // Extract parameters (detect function signatures or process.argv usage)
    const parameters = [];
    const paramMatches = [...content.matchAll(/process\.argv\[(\d+)\]/g)];
    if (paramMatches.length > 0) {
      parameters.push({ name: 'argv', required: true, description: 'Command line arguments' });
    }

    // Check for database dependencies
    const hasSupabase = content.includes('supabase') || content.includes('createClient');
    const hasDatabase = content.includes('from(') || content.includes('.select(') || hasSupabase;

    // Check for external dependencies
    const requireMatches = [...content.matchAll(/require\(['"]([@\w\-\/]+)['"]\)/g)];
    const importMatches = [...content.matchAll(/from ['"]([@\w\-\/]+)['"]/g)];
    const dependencies = [
      ...new Set([
        ...requireMatches.map(m => m[1]),
        ...importMatches.map(m => m[1]),
      ]),
    ].filter(dep => !dep.startsWith('.') && !dep.startsWith('/')); // External only

    // Detect category from filename pattern
    const category = detectCategory(filename);

    // Check if executable
    const stats = await fs.stat(filepath);
    const isExecutable = (stats.mode & 0o111) !== 0;

    // Estimate complexity (simple heuristic based on LOC)
    const lines = content.split('\n').length;
    const complexity = lines < 100 ? 'simple' : lines < 300 ? 'medium' : 'complex';

    // Detect async operations
    const hasAsync = content.includes('async') || content.includes('await') || content.includes('Promise');

    return {
      filename,
      path: path.relative(process.cwd(), filepath),
      extension: ext,
      description: description || `Script: ${filename}`,
      usage,
      parameters,
      category,
      hasDatabase,
      dependencies,
      isExecutable,
      complexity,
      linesOfCode: lines,
      hasAsync,
      lastModified: stats.mtime.toISOString(),
      size: stats.size,
    };
  } catch (error) {
    console.error(`Error analyzing ${filepath}:`, error.message);
    return null;
  }
}

/**
 * Detect script category from filename
 * @param {string} filename - Script filename
 * @returns {string} Category name
 */
function detectCategory(filename) {
  const patterns = [
    { pattern: /^(accept|create|complete|handoff|transition)/, category: 'handoff' },
    { pattern: /^(sd-|create-sd|update-sd|complete-sd|query-sd)/, category: 'strategic-directives' },
    { pattern: /^(verify|validate|check)-/, category: 'verification' },
    { pattern: /^(test|e2e|uat|playwright)/, category: 'testing' },
    { pattern: /^(apply|migrate|migration)-/, category: 'migrations' },
    { pattern: /^(update|fix|patch)-/, category: 'updates' },
    { pattern: /^(activate|enable|setup)-/, category: 'setup' },
    { pattern: /^(sync|export|import|backup)-/, category: 'sync' },
    { pattern: /^(analyze|report|stats)-/, category: 'analytics' },
    { pattern: /^(add|create|generate)-/, category: 'generators' },
    { pattern: /^leo-/, category: 'leo-protocol' },
    { pattern: /subagent|agent/, category: 'sub-agents' },
  ];

  for (const { pattern, category } of patterns) {
    if (pattern.test(filename)) {
      return category;
    }
  }

  return 'uncategorized';
}

/**
 * Generate complete script inventory
 * @returns {Promise<Object>} Inventory object
 */
async function generateInventory() {
  console.log('📋 Generating script inventory...\n');

  try {
    // Find all script files
    const files = await fs.readdir(SCRIPT_DIR);

    const scriptFiles = files.filter(file => {
      const ext = path.extname(file);
      return ['.js', '.mjs', '.cjs', '.sh'].includes(ext);
    });

    console.log(`Found ${scriptFiles.length} script files\n`);

    // Analyze each script
    const scripts = [];
    let analyzed = 0;

    for (const file of scriptFiles) {
      const filepath = path.join(SCRIPT_DIR, file);
      const metadata = await extractScriptMetadata(filepath);

      if (metadata) {
        scripts.push(metadata);
        analyzed++;

        if (analyzed % 100 === 0) {
          console.log(`Analyzed ${analyzed}/${scriptFiles.length} scripts...`);
        }
      }
    }

    console.log(`\n✅ Analyzed ${analyzed} scripts\n`);

    // Group by category
    const byCategory = {};
    const byComplexity = { simple: 0, medium: 0, complex: 0 };
    const withDatabase = scripts.filter(s => s.hasDatabase).length;
    const executable = scripts.filter(s => s.isExecutable).length;
    const asyncScripts = scripts.filter(s => s.hasAsync).length;

    scripts.forEach(script => {
      const cat = script.category;
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(script);
      byComplexity[script.complexity]++;
    });

    // Calculate total LOC
    const totalLOC = scripts.reduce((sum, s) => sum + s.linesOfCode, 0);
    const avgLOC = Math.round(totalLOC / scripts.length);

    // Find most common dependencies
    const depCounts = {};
    scripts.forEach(script => {
      script.dependencies.forEach(dep => {
        depCounts[dep] = (depCounts[dep] || 0) + 1;
      });
    });

    const topDependencies = Object.entries(depCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([dep, count]) => ({ dependency: dep, count }));

    // Create inventory
    const inventory = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      totalScripts: scripts.length,
      statistics: {
        byCategory: Object.fromEntries(
          Object.entries(byCategory).map(([cat, scripts]) => [cat, scripts.length])
        ),
        byComplexity,
        totalLinesOfCode: totalLOC,
        averageLinesOfCode: avgLOC,
        withDatabase,
        executable,
        async: asyncScripts,
        topDependencies,
      },
      categories: Object.fromEntries(
        Object.entries(byCategory).map(([cat, scripts]) => [
          cat,
          {
            count: scripts.length,
            scripts: scripts.map(s => ({
              filename: s.filename,
              description: s.description,
              path: s.path,
              complexity: s.complexity,
              linesOfCode: s.linesOfCode,
            })),
          },
        ])
      ),
      scripts: scripts.sort((a, b) => a.filename.localeCompare(b.filename)),
    };

    // Save inventory
    await fs.writeFile(INVENTORY_PATH, JSON.stringify(inventory, null, 2), 'utf8');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('INVENTORY STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`Total Scripts: ${inventory.totalScripts}`);
    console.log(`Total Lines of Code: ${totalLOC.toLocaleString()}`);
    console.log(`Average LOC per Script: ${avgLOC}`);
    console.log(`Scripts with Database: ${withDatabase} (${((withDatabase / scripts.length) * 100).toFixed(1)}%)`);
    console.log(`Executable Scripts: ${executable} (${((executable / scripts.length) * 100).toFixed(1)}%)`);
    console.log(`Async Scripts: ${asyncScripts} (${((asyncScripts / scripts.length) * 100).toFixed(1)}%)\n`);

    console.log('Complexity Distribution:');
    console.log(`  Simple (<100 LOC): ${byComplexity.simple}`);
    console.log(`  Medium (100-300 LOC): ${byComplexity.medium}`);
    console.log(`  Complex (>300 LOC): ${byComplexity.complex}\n`);

    console.log('Top 5 Categories:');
    Object.entries(inventory.statistics.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([cat, count], i) => {
        console.log(`  ${i + 1}. ${cat}: ${count} scripts`);
      });
    console.log('');

    console.log('Top 5 Dependencies:');
    topDependencies.slice(0, 5).forEach((dep, i) => {
      console.log(`  ${i + 1}. ${dep.dependency}: ${dep.count} scripts`);
    });
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`📄 Inventory saved: ${INVENTORY_PATH}\n`);

    return inventory;
  } catch (error) {
    console.error('❌ Error generating inventory:', error.message);
    throw error;
  }
}

/**
 * Update inventory with new scripts only
 * @returns {Promise<Object>} Updated inventory
 */
async function updateInventory() {
  console.log('📋 Updating script inventory...\n');

  try {
    // Load existing inventory
    let existing = null;
    try {
      const content = await fs.readFile(INVENTORY_PATH, 'utf8');
      existing = JSON.parse(content);
      console.log(`Loaded existing inventory (${existing.totalScripts} scripts)\n`);
    } catch {
      console.log('No existing inventory found, generating from scratch\n');
      return generateInventory();
    }

    // Find all current script files
    const files = await fs.readdir(SCRIPT_DIR);
    const scriptFiles = files.filter(file => {
      const ext = path.extname(file);
      return ['.js', '.mjs', '.cjs', '.sh'].includes(ext);
    });

    // Determine which scripts are new or modified
    const existingMap = new Map(existing.scripts.map(s => [s.filename, s]));
    const newOrModified = [];

    for (const file of scriptFiles) {
      const existing = existingMap.get(file);
      if (!existing) {
        newOrModified.push(file);
      } else {
        // Check if modified
        const filepath = path.join(SCRIPT_DIR, file);
        const stats = await fs.stat(filepath);
        if (new Date(stats.mtime).getTime() > new Date(existing.lastModified).getTime()) {
          newOrModified.push(file);
        }
      }
    }

    if (newOrModified.length === 0) {
      console.log('✅ Inventory is up to date (no changes detected)\n');
      return existing;
    }

    console.log(`Found ${newOrModified.length} new or modified scripts\n`);

    // Analyze new/modified scripts
    const updatedScripts = [...existing.scripts];

    for (const file of newOrModified) {
      const filepath = path.join(SCRIPT_DIR, file);
      const metadata = await extractScriptMetadata(filepath);

      if (metadata) {
        // Remove old version if exists
        const index = updatedScripts.findIndex(s => s.filename === file);
        if (index >= 0) {
          updatedScripts[index] = metadata;
          console.log(`Updated: ${file}`);
        } else {
          updatedScripts.push(metadata);
          console.log(`Added: ${file}`);
        }
      }
    }

    // Regenerate statistics
    existing.scripts = updatedScripts;
    existing.totalScripts = updatedScripts.length;
    existing.generated = new Date().toISOString();

    // Recalculate statistics (reuse logic from generateInventory)
    const byCategory = {};
    updatedScripts.forEach(script => {
      const cat = script.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(script);
    });

    existing.statistics.byCategory = Object.fromEntries(
      Object.entries(byCategory).map(([cat, scripts]) => [cat, scripts.length])
    );

    existing.categories = Object.fromEntries(
      Object.entries(byCategory).map(([cat, scripts]) => [
        cat,
        {
          count: scripts.length,
          scripts: scripts.map(s => ({
            filename: s.filename,
            description: s.description,
            path: s.path,
            complexity: s.complexity,
            linesOfCode: s.linesOfCode,
          })),
        },
      ])
    );

    // Save updated inventory
    await fs.writeFile(INVENTORY_PATH, JSON.stringify(existing, null, 2), 'utf8');

    console.log(`\n✅ Inventory updated (${newOrModified.length} scripts changed)\n`);
    console.log(`📄 Inventory saved: ${INVENTORY_PATH}\n`);

    return existing;
  } catch (error) {
    console.error('❌ Error updating inventory:', error.message);
    throw error;
  }
}

/**
 * Analyze single script file
 * @param {string} filename - Script filename
 */
async function analyzeSingleFile(filename) {
  console.log(`📋 Analyzing ${filename}...\n`);

  try {
    const filepath = path.join(SCRIPT_DIR, filename);
    const metadata = await extractScriptMetadata(filepath);

    if (!metadata) {
      console.error('Failed to analyze file');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SCRIPT METADATA');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`Filename: ${metadata.filename}`);
    console.log(`Path: ${metadata.path}`);
    console.log(`Description: ${metadata.description}`);
    console.log(`Category: ${metadata.category}`);
    console.log(`Complexity: ${metadata.complexity}`);
    console.log(`Lines of Code: ${metadata.linesOfCode}`);
    console.log(`Has Database: ${metadata.hasDatabase ? 'Yes' : 'No'}`);
    console.log(`Is Executable: ${metadata.isExecutable ? 'Yes' : 'No'}`);
    console.log(`Has Async: ${metadata.hasAsync ? 'Yes' : 'No'}`);
    console.log(`Size: ${metadata.size} bytes`);
    console.log(`Last Modified: ${new Date(metadata.lastModified).toLocaleString()}\n`);

    if (metadata.usage.length > 0) {
      console.log('Usage:');
      metadata.usage.forEach(u => console.log(`  ${u}`));
      console.log('');
    }

    if (metadata.dependencies.length > 0) {
      console.log('Dependencies:');
      metadata.dependencies.forEach(d => console.log(`  - ${d}`));
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

    return metadata;
  } catch (error) {
    console.error('❌ Error analyzing file:', error.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Script Inventory Generator

Usage:
  node scripts/generate-script-inventory.cjs              Generate full inventory
  node scripts/generate-script-inventory.cjs --update     Update with new scripts only
  node scripts/generate-script-inventory.cjs --file <filename>  Analyze single file

Options:
  --update    Only analyze new or modified scripts
  --file      Analyze single script file
  --help, -h  Show this help message

Examples:
  node scripts/generate-script-inventory.cjs
  node scripts/generate-script-inventory.cjs --update
  node scripts/generate-script-inventory.cjs --file accept-handoff.mjs
`);
    process.exit(0);
  }

  const fileIndex = args.indexOf('--file');
  if (fileIndex >= 0) {
    const filename = args[fileIndex + 1];
    if (!filename) {
      console.error('Error: --file requires a filename');
      process.exit(1);
    }
    await analyzeSingleFile(filename);
    process.exit(0);
  }

  if (args.includes('--update')) {
    await updateInventory();
  } else {
    await generateInventory();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { generateInventory, updateInventory, extractScriptMetadata };
