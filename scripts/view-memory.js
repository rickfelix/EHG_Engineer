#!/usr/bin/env node

/**
 * Memory Recovery UI
 * View compressed content from LEO Protocol's memory system
 *
 * Usage:
 *   npm run memory:view
 *   npm run memory:view -- --type subagents
 *   npm run memory:view -- --type handoffs
 *   npm run memory:view -- --stats
 */

import MemoryManager from '../lib/context/memory-manager.js';
import ContextMonitor from '../lib/context/context-monitor.js';
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('view-memory')
  .description('View compressed content from LEO Protocol memory')
  .option('-t, --type <type>', 'Filter by type (subagents, handoffs, all)', 'all')
  .option('-s, --stats', 'Show compression statistics only')
  .option('-f, --full', 'Show full content (no truncation)')
  .parse(process.argv);

const options = program.opts();

async function main() {
  const memory = new MemoryManager();
  const monitor = new ContextMonitor();

  try {
    // Read session state
    const state = await memory.readSessionState();
    const analysis = monitor.analyzeContextUsage(state.raw);

    console.log(chalk.blue('\n📊 LEO Protocol Memory Viewer\n'));
    console.log('='.repeat(60));

    // Show overall stats
    console.log(chalk.cyan('\nOverall Context Status:'));
    console.log(`  Status: ${getStatusColor(analysis.status)}${analysis.status}${chalk.reset()}`);
    console.log(`  Total Tokens: ${analysis.totalEstimated.toLocaleString()} (${analysis.method})`);
    console.log(`  Usage: ${analysis.percentUsed}%`);
    console.log(`  Remaining: ${analysis.tokensRemaining.toLocaleString()} tokens`);

    if (options.stats) {
      // Stats only mode
      console.log(chalk.cyan('\nMemory Statistics:'));
      console.log(`  Base Context: ${analysis.baseContextTokens.toLocaleString()} tokens`);
      console.log(`  Conversation: ${analysis.conversationTokens.toLocaleString()} tokens`);
      console.log(`  Method: ${analysis.method}`);
      console.log('\n' + '='.repeat(60) + '\n');
      return;
    }

    // Parse sections from memory
    const sections = parseSections(state.raw);

    // Filter by type
    let filteredSections = sections;
    if (options.type === 'subagents') {
      filteredSections = sections.filter(s =>
        s.title.toLowerCase().includes('sub-agent') ||
        s.title.toLowerCase().includes('verification')
      );
    } else if (options.type === 'handoffs') {
      filteredSections = sections.filter(s =>
        s.title.toLowerCase().includes('handoff')
      );
    }

    // Display sections
    console.log(chalk.cyan(`\nMemory Sections (${filteredSections.length} total):`));
    console.log('='.repeat(60));

    for (const section of filteredSections) {
      console.log(chalk.yellow(`\n## ${section.title}`));
      console.log(chalk.gray(`   Tokens: ~${monitor.estimateTokens(section.content)}`));
      console.log(chalk.gray(`   Length: ${section.content.length} chars`));

      if (section.timestamp) {
        console.log(chalk.gray(`   Updated: ${section.timestamp}`));
      }

      if (options.full) {
        console.log('\n' + section.content);
      } else {
        // Show first 300 chars
        const preview = section.content.length > 300
          ? section.content.substring(0, 300) + '...'
          : section.content;
        console.log('\n' + preview);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(chalk.blue('\n💡 Tips:'));
    console.log('  - Use --type subagents to see sub-agent reports');
    console.log('  - Use --type handoffs to see handoff documents');
    console.log('  - Use --stats to see statistics only');
    console.log('  - Use --full to see complete content (no truncation)\n');

  } catch (error) {
    console.error(chalk.red('\n❌ Error reading memory:'), error.message);
    process.exit(1);
  } finally {
    monitor.cleanup();
  }
}

function parseSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // Save previous section
      if (currentSection) {
        sections.push({
          title: currentSection,
          content: currentContent.join('\n').trim(),
          timestamp: extractTimestamp(currentContent.join('\n'))
        });
      }
      // Start new section
      currentSection = line.substring(3).trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections.push({
      title: currentSection,
      content: currentContent.join('\n').trim(),
      timestamp: extractTimestamp(currentContent.join('\n'))
    });
  }

  return sections;
}

function extractTimestamp(content) {
  const match = content.match(/timestamp['":\s]+(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/i);
  return match ? match[1] : null;
}

function getStatusColor(status) {
  const colors = {
    'HEALTHY': chalk.green,
    'WARNING': chalk.yellow,
    'CRITICAL': chalk.red,
    'EMERGENCY': chalk.bgRed.white
  };
  return colors[status] || chalk.white;
}

main();
