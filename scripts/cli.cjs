#!/usr/bin/env node
/**
 * A1.2: Unified Script Management CLI
 *
 * Part of Phase 1, Week 2 - Script Maintainability & Organization
 * Complete CLI tool for script discovery, search, and execution
 *
 * Features:
 * - Script discovery and search using inventory from A1.3
 * - Interactive mode with menu navigation
 * - Direct script execution
 * - Category browsing
 * - Complexity filtering
 * - Dependency analysis
 * - Script metadata display
 *
 * Usage:
 *   npm run cli                              # Interactive mode
 *   npm run cli search handoff               # Search scripts
 *   npm run cli run accept-handoff.mjs       # Run script
 *   npm run cli info accept-handoff.mjs      # Show script info
 *   npm run cli list                         # List all scripts
 *   npm run cli categories                   # Show categories
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

// ANSI color codes for better UX
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const INVENTORY_PATH = path.join(process.cwd(), 'scripts', 'SCRIPT_INVENTORY.json');
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

/**
 * Load script inventory
 * @returns {Promise<Object>}
 */
async function loadInventory() {
  try {
    const content = await fs.readFile(INVENTORY_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`${colors.red}✗ Script inventory not found${colors.reset}`);
      console.error(`${colors.dim}Run: node scripts/generate-script-inventory.cjs${colors.reset}`);
    } else {
      console.error(`${colors.red}✗ Failed to load inventory: ${error.message}${colors.reset}`);
    }
    process.exit(1);
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
 * Get unique categories
 * @param {Object} inventory - Inventory object
 * @returns {Array} Category names with counts
 */
function getCategories(inventory) {
  const categoryCounts = {};
  inventory.scripts.forEach(script => {
    categoryCounts[script.category] = (categoryCounts[script.category] || 0) + 1;
  });

  return Object.entries(categoryCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
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
 * Execute a script
 * @param {string} scriptName - Script filename
 * @param {Array} args - Script arguments
 * @returns {Promise<void>}
 */
async function executeScript(scriptName, args = []) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);

  // Check if script exists
  try {
    await fs.access(scriptPath);
  } catch (error) {
    console.error(`${colors.red}✗ Script not found: ${scriptName}${colors.reset}`);
    return;
  }

  console.log(`${colors.cyan}▶ Executing: ${scriptName}${colors.reset}`);
  if (args.length > 0) {
    console.log(`${colors.dim}  Args: ${args.join(' ')}${colors.reset}`);
  }
  console.log('─'.repeat(60));

  // Determine execution method based on extension
  const ext = path.extname(scriptName);
  let command, commandArgs;

  if (ext === '.mjs' || ext === '.js') {
    command = 'node';
    commandArgs = [scriptPath, ...args];
  } else if (ext === '.cjs') {
    command = 'node';
    commandArgs = [scriptPath, ...args];
  } else if (ext === '.sh') {
    command = 'bash';
    commandArgs = [scriptPath, ...args];
  } else {
    console.error(`${colors.red}✗ Unsupported script type: ${ext}${colors.reset}`);
    return;
  }

  // Execute script
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      console.log('─'.repeat(60));
      if (code === 0) {
        console.log(`${colors.green}✓ Completed successfully${colors.reset}`);
      } else {
        console.log(`${colors.red}✗ Exited with code ${code}${colors.reset}`);
      }
      resolve();
    });

    child.on('error', (error) => {
      console.error(`${colors.red}✗ Execution error: ${error.message}${colors.reset}`);
      reject(error);
    });
  });
}

/**
 * Display search results
 * @param {Array} results - Search results
 * @param {string} query - Search query
 */
function displaySearchResults(results, query) {
  if (results.length === 0) {
    console.log(`${colors.yellow}No scripts found matching: ${query}${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bright}Found ${results.length} script(s) matching: ${query}${colors.reset}\n`);

  results.forEach((script, index) => {
    console.log(`${colors.cyan}${index + 1}. ${script.filename}${colors.reset}`);
    if (script.description) {
      console.log(`   ${colors.dim}${script.description}${colors.reset}`);
    }
    console.log(`   ${colors.dim}Category: ${script.category} | Complexity: ${script.complexity} | ${script.linesOfCode} LOC${colors.reset}`);
    console.log();
  });
}

/**
 * Display script info
 * @param {Object} script - Script metadata
 */
function displayScriptInfo(script) {
  if (!script) {
    console.log(`${colors.red}✗ Script not found${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bright}📄 ${script.filename}${colors.reset}\n`);
  console.log('═'.repeat(60));

  if (script.description) {
    console.log(`${colors.bright}Description:${colors.reset}`);
    console.log(`  ${script.description}`);
    console.log();
  }

  console.log(`${colors.bright}Metadata:${colors.reset}`);
  console.log(`  Category:    ${script.category || 'uncategorized'}`);
  console.log(`  Complexity:  ${script.complexity}`);
  console.log(`  Lines:       ${script.linesOfCode.toLocaleString()} LOC`);
  console.log(`  Database:    ${script.hasDatabase ? '✓' : '✗'}`);
  console.log(`  Async:       ${script.isAsync ? '✓' : '✗'}`);
  console.log();

  if (script.dependencies && script.dependencies.length > 0) {
    console.log(`${colors.bright}Dependencies:${colors.reset}`);
    script.dependencies.forEach(dep => {
      console.log(`  • ${dep}`);
    });
    console.log();
  }

  if (script.exports && script.exports.length > 0) {
    console.log(`${colors.bright}Exports:${colors.reset}`);
    script.exports.forEach(exp => {
      console.log(`  • ${exp}`);
    });
    console.log();
  }

  console.log('═'.repeat(60));
  console.log(`${colors.dim}Path: scripts/${script.filename}${colors.reset}`);
}

/**
 * Display categories list
 * @param {Array} categories - Categories with counts
 */
function displayCategories(categories) {
  console.log(`\n${colors.bright}📁 Script Categories${colors.reset}\n`);
  console.log('═'.repeat(60));

  categories.forEach(({ name, count }) => {
    const bar = '█'.repeat(Math.ceil(count / 20));
    console.log(`${colors.cyan}${name.padEnd(20)}${colors.reset} ${colors.dim}${bar}${colors.reset} ${count}`);
  });

  console.log('\n' + '═'.repeat(60));
  console.log(`${colors.dim}Total: ${categories.length} categories${colors.reset}`);
}

/**
 * Display script list
 * @param {Array} scripts - Scripts to display
 * @param {number} limit - Max scripts to show
 */
function displayScriptList(scripts, limit = 20) {
  console.log(`\n${colors.bright}📋 Scripts (showing ${Math.min(limit, scripts.length)} of ${scripts.length})${colors.reset}\n`);

  scripts.slice(0, limit).forEach((script, index) => {
    const complexityColor = {
      simple: colors.green,
      medium: colors.yellow,
      complex: colors.red,
    }[script.complexity] || colors.reset;

    console.log(`${colors.cyan}${(index + 1).toString().padStart(3)}. ${script.filename}${colors.reset}`);
    console.log(`     ${colors.dim}${script.category} | ${complexityColor}${script.complexity}${colors.reset} | ${script.linesOfCode} LOC${colors.reset}`);
  });

  if (scripts.length > limit) {
    console.log(`\n${colors.dim}... and ${scripts.length - limit} more${colors.reset}`);
  }
}

/**
 * Interactive mode - main menu
 * @param {Object} inventory - Inventory object
 */
async function interactiveMode(inventory) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  console.clear();
  console.log(`${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}║        🛠️  EHG Engineer - Script Management CLI          ║${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  while (true) {
    console.log(`${colors.bright}Main Menu:${colors.reset}`);
    console.log(`  ${colors.cyan}1.${colors.reset} Search scripts`);
    console.log(`  ${colors.cyan}2.${colors.reset} Browse by category`);
    console.log(`  ${colors.cyan}3.${colors.reset} List all scripts`);
    console.log(`  ${colors.cyan}4.${colors.reset} View script info`);
    console.log(`  ${colors.cyan}5.${colors.reset} Run a script`);
    console.log(`  ${colors.cyan}6.${colors.reset} Show statistics`);
    console.log(`  ${colors.cyan}0.${colors.reset} Exit\n`);

    const choice = await question(`${colors.bright}Choose an option:${colors.reset} `);

    console.log();

    switch (choice.trim()) {
      case '1': {
        const keyword = await question(`${colors.bright}Enter search keyword:${colors.reset} `);
        const results = searchScripts(inventory, keyword);
        displaySearchResults(results, keyword);
        break;
      }

      case '2': {
        const categories = getCategories(inventory);
        displayCategories(categories);
        console.log();
        const categoryName = await question(`${colors.bright}Enter category name:${colors.reset} `);
        const scripts = getScriptsByCategory(inventory, categoryName.trim());
        displayScriptList(scripts);
        break;
      }

      case '3': {
        displayScriptList(inventory.scripts, 50);
        break;
      }

      case '4': {
        const filename = await question(`${colors.bright}Enter script filename:${colors.reset} `);
        const script = getScriptInfo(inventory, filename.trim());
        displayScriptInfo(script);
        break;
      }

      case '5': {
        const filename = await question(`${colors.bright}Enter script filename:${colors.reset} `);
        const args = await question(`${colors.bright}Enter arguments (optional):${colors.reset} `);
        const argArray = args.trim() ? args.trim().split(/\s+/) : [];
        console.log();
        await executeScript(filename.trim(), argArray);
        break;
      }

      case '6': {
        displayStats(inventory);
        break;
      }

      case '0':
        console.log(`${colors.green}Goodbye!${colors.reset}`);
        rl.close();
        return;

      default:
        console.log(`${colors.red}Invalid option${colors.reset}`);
    }

    console.log();
    await question(`${colors.dim}Press Enter to continue...${colors.reset}`);
    console.clear();
    console.log(`${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}║        🛠️  EHG Engineer - Script Management CLI          ║${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);
  }
}

/**
 * Display statistics
 * @param {Object} inventory - Inventory object
 */
function displayStats(inventory) {
  console.log(`\n${colors.bright}📊 Script Inventory Statistics${colors.reset}\n`);
  console.log('═'.repeat(60));

  const stats = inventory.statistics || {};

  console.log(`${colors.bright}Overview:${colors.reset}`);
  console.log(`  Total Scripts:    ${inventory.totalScripts.toLocaleString()}`);
  console.log(`  Total LOC:        ${(stats.totalLinesOfCode || 0).toLocaleString()}`);
  console.log(`  Average LOC:      ${(stats.averageLinesOfCode || 0).toLocaleString()}`);
  console.log();

  console.log(`${colors.bright}Database Usage:${colors.reset}`);
  const dbScripts = stats.withDatabase || 0;
  const dbPercent = ((dbScripts / inventory.totalScripts) * 100).toFixed(1);
  console.log(`  With Database:    ${dbScripts.toLocaleString()} (${dbPercent}%)`);
  console.log(`  Async Scripts:    ${(stats.async || 0).toLocaleString()}`);
  console.log();

  console.log(`${colors.bright}Complexity Distribution:${colors.reset}`);
  const complexityStats = stats.byComplexity || {};
  const simple = complexityStats.simple || 0;
  const medium = complexityStats.medium || 0;
  const complex = complexityStats.complex || 0;
  console.log(`  ${colors.green}Simple:${colors.reset}  ${simple} (${((simple / inventory.totalScripts) * 100).toFixed(1)}%)`);
  console.log(`  ${colors.yellow}Medium:${colors.reset}  ${medium} (${((medium / inventory.totalScripts) * 100).toFixed(1)}%)`);
  console.log(`  ${colors.red}Complex:${colors.reset} ${complex} (${((complex / inventory.totalScripts) * 100).toFixed(1)}%)`);
  console.log();

  console.log(`${colors.bright}Top Dependencies:${colors.reset}`);
  const topDeps = stats.topDependencies || [];
  topDeps.slice(0, 5).forEach(({ dependency, count }) => {
    console.log(`  ${dependency.padEnd(30)} ${count}`);
  });

  console.log('\n' + '═'.repeat(60));
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Load inventory
  const inventory = await loadInventory();

  // No command = interactive mode
  if (!command) {
    await interactiveMode(inventory);
    return;
  }

  // Command-line mode
  switch (command) {
    case 'search': {
      const keyword = args[1];
      if (!keyword) {
        console.error(`${colors.red}Usage: cli search <keyword>${colors.reset}`);
        process.exit(1);
      }
      const results = searchScripts(inventory, keyword);
      displaySearchResults(results, keyword);
      break;
    }

    case 'category': {
      const categoryName = args[1];
      if (!categoryName) {
        console.error(`${colors.red}Usage: cli category <name>${colors.reset}`);
        process.exit(1);
      }
      const scripts = getScriptsByCategory(inventory, categoryName);
      displayScriptList(scripts);
      break;
    }

    case 'categories': {
      const categories = getCategories(inventory);
      displayCategories(categories);
      break;
    }

    case 'list': {
      const limit = parseInt(args[1]) || 50;
      displayScriptList(inventory.scripts, limit);
      break;
    }

    case 'info': {
      const filename = args[1];
      if (!filename) {
        console.error(`${colors.red}Usage: cli info <filename>${colors.reset}`);
        process.exit(1);
      }
      const script = getScriptInfo(inventory, filename);
      displayScriptInfo(script);
      break;
    }

    case 'run': {
      const filename = args[1];
      if (!filename) {
        console.error(`${colors.red}Usage: cli run <filename> [args...]${colors.reset}`);
        process.exit(1);
      }
      const scriptArgs = args.slice(2);
      await executeScript(filename, scriptArgs);
      break;
    }

    case 'stats': {
      displayStats(inventory);
      break;
    }

    case 'help':
    case '--help':
    case '-h': {
      displayHelp();
      break;
    }

    default: {
      console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
      console.log(`${colors.dim}Run 'cli help' for usage information${colors.reset}`);
      process.exit(1);
    }
  }
}

/**
 * Display help information
 */
function displayHelp() {
  console.log(`
${colors.bright}EHG Engineer - Script Management CLI${colors.reset}

${colors.bright}USAGE:${colors.reset}
  npm run cli [command] [options]
  node scripts/cli.cjs [command] [options]

${colors.bright}COMMANDS:${colors.reset}
  ${colors.cyan}search <keyword>${colors.reset}         Search scripts by keyword
  ${colors.cyan}category <name>${colors.reset}          List scripts in category
  ${colors.cyan}categories${colors.reset}               Show all categories
  ${colors.cyan}list [limit]${colors.reset}             List all scripts (default limit: 50)
  ${colors.cyan}info <filename>${colors.reset}          Show detailed script information
  ${colors.cyan}run <filename> [args]${colors.reset}    Execute a script with optional arguments
  ${colors.cyan}stats${colors.reset}                    Show inventory statistics
  ${colors.cyan}help${colors.reset}                     Show this help message

${colors.bright}INTERACTIVE MODE:${colors.reset}
  Run without arguments to enter interactive mode:
  ${colors.dim}npm run cli${colors.reset}

${colors.bright}EXAMPLES:${colors.reset}
  ${colors.dim}# Search for handoff scripts${colors.reset}
  npm run cli search handoff

  ${colors.dim}# View script details${colors.reset}
  npm run cli info accept-handoff.mjs

  ${colors.dim}# Run a script${colors.reset}
  npm run cli run accept-handoff.mjs SD-123

  ${colors.dim}# Browse by category${colors.reset}
  npm run cli category handoff

  ${colors.dim}# Show statistics${colors.reset}
  npm run cli stats

  ${colors.dim}# Interactive mode${colors.reset}
  npm run cli
`);
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = {
  searchScripts,
  getScriptsByCategory,
  getScriptInfo,
  executeScript,
};
