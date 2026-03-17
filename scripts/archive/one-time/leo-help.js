#!/usr/bin/env node
/**
 * LEO Help - Unified command discovery and help system
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-004 (V06: cli_authoritative_workflow)
 *
 * Auto-indexes commands from:
 * - package.json scripts
 * - .claude/skills/*.md
 * - .claude/commands/*.md
 *
 * Usage:
 *   npm run leo:help
 *   npm run leo:help -- sd:query
 *   npm run leo:help -- --search heal
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const ROOT = process.cwd();

// Command categories with display order
const CATEGORIES = {
  workflow: { label: 'Workflow', description: 'Core LEO workflow commands' },
  query: { label: 'Query & Status', description: 'Query and inspect data' },
  heal: { label: 'Heal & Audit', description: 'Codebase verification and healing' },
  create: { label: 'Create & Manage', description: 'Create SDs, PRDs, and resources' },
  admin: { label: 'Admin & Config', description: 'Administrative operations' },
  dev: { label: 'Development', description: 'Dev server and build tools' },
  other: { label: 'Other', description: 'Miscellaneous commands' },
};

// Known command-to-category mappings
const CATEGORY_MAP = {
  // Workflow
  'sd:next': 'workflow', 'sd:start': 'workflow', 'leo': 'workflow',
  'sd:baseline': 'workflow', 'sd:burnrate': 'workflow',
  // Query
  'sd:query': 'query', 'sd:status': 'query', 'prio:top3': 'query',
  // Heal
  'heal': 'heal', 'heal:vision': 'heal', 'heal:sd': 'heal',
  // Create
  'sd:create': 'create', 'prd:create': 'create',
  // Admin
  'leo:help': 'admin', 'decision:audit': 'admin', 'okr:sync': 'admin',
  'session:prologue': 'admin',
  // Dev
  'dev': 'dev', 'build': 'dev', 'test': 'dev', 'lint': 'dev',
};

function categorizeCommand(name) {
  if (CATEGORY_MAP[name]) return CATEGORY_MAP[name];
  if (name.startsWith('sd:')) return 'workflow';
  if (name.startsWith('heal')) return 'heal';
  if (name.startsWith('test')) return 'dev';
  if (name.startsWith('lint') || name.startsWith('build')) return 'dev';
  return 'other';
}

function loadNpmScripts() {
  const pkgPath = join(ROOT, 'package.json');
  if (!existsSync(pkgPath)) return [];

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};

  return Object.entries(scripts).map(([name, cmd]) => ({
    name: `npm run ${name}`,
    shortName: name,
    source: 'package.json',
    category: categorizeCommand(name),
    description: extractDescription(cmd),
    command: cmd,
  }));
}

function extractDescription(cmd) {
  // Extract meaningful description from command string
  if (cmd.includes('sd-next')) return 'Show intelligent SD queue';
  if (cmd.includes('sd-query')) return 'Query strategic directives';
  if (cmd.includes('leo-help')) return 'Show this help';
  if (cmd.includes('decision-audit')) return 'View decision audit trail';
  if (cmd.includes('okr-priority-sync')) return 'Sync OKR-based priorities';
  if (cmd.includes('priority-scorer')) return 'Calculate SD priority scores';
  if (cmd.includes('handoff')) return 'Execute phase handoff';
  if (cmd.includes('leo-create-sd')) return 'Create new strategic directive';
  if (cmd.includes('add-prd')) return 'Create PRD in database';
  if (cmd.includes('generate-claude-md')) return 'Regenerate CLAUDE.md from database';
  if (cmd.includes('heal-command')) return 'Run heal scoring';
  // Fallback: show truncated command
  return cmd.length > 60 ? cmd.substring(0, 57) + '...' : cmd;
}

function loadSkills() {
  const skills = [];
  const skillsDir = join(ROOT, '.claude', 'skills');
  if (!existsSync(skillsDir)) return skills;

  for (const file of readdirSync(skillsDir)) {
    if (!file.endsWith('.md')) continue;
    const content = readFileSync(join(skillsDir, file), 'utf8');
    const name = basename(file, '.md');
    const firstLine = content.split('\n').find(l => l.startsWith('#')) || '';
    const description = firstLine.replace(/^#+\s*/, '').trim() || name;

    skills.push({
      name: `/${name}`,
      shortName: name,
      source: 'skill',
      category: categorizeCommand(name),
      description,
    });
  }
  return skills;
}

function loadCommands() {
  const commands = [];
  const cmdsDir = join(ROOT, '.claude', 'commands');
  if (!existsSync(cmdsDir)) return commands;

  for (const file of readdirSync(cmdsDir)) {
    if (!file.endsWith('.md')) continue;
    const content = readFileSync(join(cmdsDir, file), 'utf8');
    const name = basename(file, '.md');
    const firstLine = content.split('\n').find(l => l.startsWith('#')) || '';
    const description = firstLine.replace(/^#+\s*/, '').trim() || name;

    commands.push({
      name: `/${name}`,
      shortName: name,
      source: 'command',
      category: categorizeCommand(name),
      description,
    });
  }
  return commands;
}

function searchCommands(allCommands, query) {
  const q = query.toLowerCase();
  return allCommands.filter(cmd =>
    cmd.name.toLowerCase().includes(q) ||
    cmd.shortName.toLowerCase().includes(q) ||
    cmd.description.toLowerCase().includes(q) ||
    (cmd.command || '').toLowerCase().includes(q)
  );
}

function showDetailedHelp(allCommands, target) {
  const cmd = allCommands.find(c =>
    c.shortName === target || c.name === target || c.name === `npm run ${target}`
  );

  if (!cmd) {
    console.log(`  Command not found: ${target}`);
    console.log(`  Try: npm run leo:help -- --search ${target}`);
    return;
  }

  console.log(`\n  ${cmd.name}`);
  console.log(`  ${'='.repeat(cmd.name.length)}`);
  console.log(`  Description: ${cmd.description}`);
  console.log(`  Source: ${cmd.source}`);
  console.log(`  Category: ${CATEGORIES[cmd.category]?.label || cmd.category}`);
  if (cmd.command) console.log(`  Runs: ${cmd.command}`);
  console.log();
}

function showGroupedHelp(allCommands) {
  console.log('\n  LEO Command Reference');
  console.log('  ' + '='.repeat(50));

  const grouped = {};
  for (const cmd of allCommands) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }

  for (const [catKey, catInfo] of Object.entries(CATEGORIES)) {
    const cmds = grouped[catKey];
    if (!cmds || cmds.length === 0) continue;

    console.log(`\n  ${catInfo.label} (${catInfo.description})`);
    console.log('  ' + '-'.repeat(46));

    for (const cmd of cmds.slice(0, 15)) {
      const nameStr = cmd.name.padEnd(30);
      const desc = cmd.description.substring(0, 45);
      console.log(`    ${nameStr} ${desc}`);
    }

    if (cmds.length > 15) {
      console.log(`    ... and ${cmds.length - 15} more`);
    }
  }

  console.log(`\n  Total: ${allCommands.length} commands indexed`);
  console.log('  Use: npm run leo:help -- <command> for details');
  console.log('  Use: npm run leo:help -- --search <query> to search\n');
}

function main() {
  const args = process.argv.slice(2);

  // Build command index
  const allCommands = [
    ...loadNpmScripts(),
    ...loadSkills(),
    ...loadCommands(),
  ];

  // Handle search
  const searchIdx = args.indexOf('--search');
  if (searchIdx >= 0 && args[searchIdx + 1]) {
    const query = args[searchIdx + 1];
    const results = searchCommands(allCommands, query);
    console.log(`\n  Search results for "${query}" (${results.length} found):\n`);
    for (const cmd of results) {
      console.log(`    ${cmd.name.padEnd(30)} ${cmd.description.substring(0, 45)}`);
    }
    if (results.length === 0) console.log('    No commands found matching query.');
    console.log();
    return;
  }

  // Handle specific command help
  const target = args.find(a => !a.startsWith('--'));
  if (target) {
    showDetailedHelp(allCommands, target);
    return;
  }

  // Default: show grouped help
  showGroupedHelp(allCommands);
}

main();
