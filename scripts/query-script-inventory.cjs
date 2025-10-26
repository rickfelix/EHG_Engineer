#!/usr/bin/env node
/**
 * Script Inventory Query CLI
 *
 * Part of Phase 1 Script Maintainability & Organization (A1.3)
 * Search and query the script inventory
 *
 * Usage:
 *   node scripts/query-script-inventory.cjs search "handoff"
 *   node scripts/query-script-inventory.cjs category handoff
 *   node scripts/query-script-inventory.cjs stats
 *   node scripts/query-script-inventory.cjs info accept-handoff.mjs
 */

const fs = require('fs').promises;
const path = require('path');

const INVENTORY_PATH = path.join(process.cwd(), 'scripts', 'SCRIPT_INVENTORY.json');

/**
 * Load inventory
 * @returns {Promise<Object>}
 */
async function loadInventory() {
  try {
    const content = await fs.readFile(INVENTORY_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load inventory: ${error.message}`);
  }
}

/**
 * Search scripts by keyword
 * @param {Object} inventory - Inventory object
 * @param {string} keyword - Search keyword
 * @returns {Array} Matching scripts
 */
function searchScripts(inventory, keyword) {
  const lowerKeyword = keyword.toLowerCase();

  return inventory.scripts.filter(script => {
    const searchable = [
      script.filename,
      script.description,
      script.category,
      ...script.dependencies,
    ].join(' ').toLowerCase();

    return searchable.includes(lowerKeyword);
  });
}

/**
 * Get scripts by category
 * @param {Object} inventory - Inventory object
 * @param {string} category - Category name
 * @returns {Array} Scripts in category
 */
function getScriptsByCategory(inventory, category) {
  return inventory.scripts.filter(s => s.category === category);
}

/**
 * Get script info
 * @param {Object} inventory - Inventory object
 * @param {string} filename - Script filename
 * @returns {Object|null} Script metadata
 */
function getScriptInfo(inventory, filename) {
  return inventory.scripts.find(s => s.filename === filename) || null;
}

/**
 * Get scripts by complexity
 * @param {Object} inventory - Inventory object
 * @param {string} complexity - Complexity level
 * @returns {Array} Scripts matching complexity
 */
function getScriptsByComplexity(inventory, complexity) {
  return inventory.scripts.filter(s => s.complexity === complexity);
}

/**
 * Get scripts by dependency
 * @param {Object} inventory - Inventory object
 * @param {string} dependency - Dependency name
 * @returns {Array} Scripts using dependency
 */
function getScriptsByDependency(inventory, dependency) {
  return inventory.scripts.filter(s => s.dependencies.includes(dependency));
}

/**
 * Display inventory statistics
 * @param {Object} inventory - Inventory object
 */
function displayStats(inventory) {
  console.log('\n📊 Script Inventory Statistics\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Total Scripts: ${inventory.totalScripts}`);
  console.log(`Total Lines of Code: ${inventory.statistics.totalLinesOfCode.toLocaleString()}`);
  console.log(`Average LOC per Script: ${inventory.statistics.averageLinesOfCode}`);
  console.log(`Generated: ${new Date(inventory.generated).toLocaleString()}\n`);

  console.log('Complexity Distribution:');
  console.log(`  Simple (<100 LOC): ${inventory.statistics.byComplexity.simple}`);
  console.log(`  Medium (100-300 LOC): ${inventory.statistics.byComplexity.medium}`);
  console.log(`  Complex (>300 LOC): ${inventory.statistics.byComplexity.complex}\n`);

  console.log('Top 10 Categories:');
  Object.entries(inventory.statistics.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cat, count], i) => {
      console.log(`  ${i + 1}. ${cat}: ${count} scripts`);
    });
  console.log('');

  console.log('Top 10 Dependencies:');
  inventory.statistics.topDependencies.slice(0, 10).forEach((dep, i) => {
    console.log(`  ${i + 1}. ${dep.dependency}: ${dep.count} scripts`);
  });
  console.log('');

  console.log(`Scripts with Database: ${inventory.statistics.withDatabase} (${((inventory.statistics.withDatabase / inventory.totalScripts) * 100).toFixed(1)}%)`);
  console.log(`Async Scripts: ${inventory.statistics.async} (${((inventory.statistics.async / inventory.totalScripts) * 100).toFixed(1)}%)`);
  console.log(`Executable Scripts: ${inventory.statistics.executable} (${((inventory.statistics.executable / inventory.totalScripts) * 100).toFixed(1)}%)\n`);

  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Display search results
 * @param {Array} scripts - Matching scripts
 * @param {string} query - Search query
 */
function displaySearchResults(scripts, query) {
  console.log(`\n🔍 Search Results for "${query}": ${scripts.length} matches\n`);

  if (scripts.length === 0) {
    console.log('No scripts found matching your query.\n');
    return;
  }

  scripts.slice(0, 20).forEach((script, i) => {
    console.log(`${i + 1}. ${script.filename}`);
    console.log(`   ${script.description}`);
    console.log(`   Category: ${script.category} | Complexity: ${script.complexity} | LOC: ${script.linesOfCode}`);
    console.log('');
  });

  if (scripts.length > 20) {
    console.log(`... and ${scripts.length - 20} more results\n`);
  }
}

/**
 * Display script info
 * @param {Object} script - Script metadata
 */
function displayScriptInfo(script) {
  console.log('\n📄 Script Information\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Filename: ${script.filename}`);
  console.log(`Path: ${script.path}`);
  console.log(`Description: ${script.description}`);
  console.log(`Category: ${script.category}`);
  console.log(`Complexity: ${script.complexity}`);
  console.log(`Lines of Code: ${script.linesOfCode}`);
  console.log(`Has Database: ${script.hasDatabase ? 'Yes' : 'No'}`);
  console.log(`Is Executable: ${script.isExecutable ? 'Yes' : 'No'}`);
  console.log(`Has Async: ${script.hasAsync ? 'Yes' : 'No'}`);
  console.log(`Size: ${script.size} bytes`);
  console.log(`Last Modified: ${new Date(script.lastModified).toLocaleString()}\n`);

  if (script.usage && script.usage.length > 0) {
    console.log('Usage:');
    script.usage.forEach(u => console.log(`  ${u}`));
    console.log('');
  }

  if (script.dependencies.length > 0) {
    console.log('Dependencies:');
    script.dependencies.forEach(d => console.log(`  - ${d}`));
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Display category listing
 * @param {Array} scripts - Scripts in category
 * @param {string} category - Category name
 */
function displayCategoryListing(scripts, category) {
  console.log(`\n📁 Category: ${category} (${scripts.length} scripts)\n`);

  if (scripts.length === 0) {
    console.log(`No scripts found in category "${category}".\n`);
    return;
  }

  scripts.forEach((script, i) => {
    console.log(`${i + 1}. ${script.filename} (${script.complexity}, ${script.linesOfCode} LOC)`);
    console.log(`   ${script.description}`);
    console.log('');
  });
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Script Inventory Query CLI

Usage:
  query-script-inventory <command> [arguments]

Commands:
  search <keyword>       Search scripts by keyword
  category <name>        List scripts in category
  stats                  Show inventory statistics
  info <filename>        Show detailed info for script
  complexity <level>     List scripts by complexity (simple|medium|complex)
  dependency <name>      List scripts using dependency
  list                   List all categories

Examples:
  node scripts/query-script-inventory.cjs search "handoff"
  node scripts/query-script-inventory.cjs category handoff
  node scripts/query-script-inventory.cjs stats
  node scripts/query-script-inventory.cjs info accept-handoff.mjs
  node scripts/query-script-inventory.cjs complexity complex
  node scripts/query-script-inventory.cjs dependency dotenv
  node scripts/query-script-inventory.cjs list
`);
    process.exit(0);
  }

  try {
    const inventory = await loadInventory();

    switch (command) {
      case 'search': {
        const keyword = args[1];
        if (!keyword) {
          console.error('Error: search requires a keyword');
          process.exit(1);
        }
        const results = searchScripts(inventory, keyword);
        displaySearchResults(results, keyword);
        break;
      }

      case 'category': {
        const category = args[1];
        if (!category) {
          console.error('Error: category requires a category name');
          process.exit(1);
        }
        const scripts = getScriptsByCategory(inventory, category);
        displayCategoryListing(scripts, category);
        break;
      }

      case 'stats': {
        displayStats(inventory);
        break;
      }

      case 'info': {
        const filename = args[1];
        if (!filename) {
          console.error('Error: info requires a filename');
          process.exit(1);
        }
        const script = getScriptInfo(inventory, filename);
        if (!script) {
          console.error(`Script "${filename}" not found in inventory`);
          process.exit(1);
        }
        displayScriptInfo(script);
        break;
      }

      case 'complexity': {
        const level = args[1];
        if (!level || !['simple', 'medium', 'complex'].includes(level)) {
          console.error('Error: complexity requires level (simple|medium|complex)');
          process.exit(1);
        }
        const scripts = getScriptsByComplexity(inventory, level);
        console.log(`\n🎯 ${level.charAt(0).toUpperCase() + level.slice(1)} Scripts: ${scripts.length}\n`);
        scripts.slice(0, 20).forEach((s, i) => {
          console.log(`${i + 1}. ${s.filename} (${s.linesOfCode} LOC)`);
        });
        if (scripts.length > 20) {
          console.log(`\n... and ${scripts.length - 20} more\n`);
        }
        break;
      }

      case 'dependency': {
        const dep = args[1];
        if (!dep) {
          console.error('Error: dependency requires a dependency name');
          process.exit(1);
        }
        const scripts = getScriptsByDependency(inventory, dep);
        console.log(`\n📦 Scripts using "${dep}": ${scripts.length}\n`);
        scripts.slice(0, 20).forEach((s, i) => {
          console.log(`${i + 1}. ${s.filename}`);
        });
        if (scripts.length > 20) {
          console.log(`\n... and ${scripts.length - 20} more\n`);
        }
        break;
      }

      case 'list': {
        console.log('\n📋 All Categories:\n');
        Object.entries(inventory.statistics.byCategory)
          .sort((a, b) => b[1] - a[1])
          .forEach(([cat, count], i) => {
            console.log(`${i + 1}. ${cat}: ${count} scripts`);
          });
        console.log('');
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run with --help for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadInventory,
  searchScripts,
  getScriptsByCategory,
  getScriptInfo,
};
