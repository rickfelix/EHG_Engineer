#!/usr/bin/env node

/**
 * File Tree Generator for Claude Code Context
 *
 * Generates comprehensive file trees for both EHG_Engineer and EHG applications
 * to provide EXEC agent with complete directory context, eliminating routing errors.
 *
 * Features:
 * - Respects .gitignore patterns
 * - Excludes node_modules, dist, build directories
 * - Generates markdown-formatted output
 * - Caches in .claude/file-trees.md for Claude Code memory
 * - Estimates token count for context management
 *
 * Usage:
 *   node scripts/generate-file-trees.js
 *   node scripts/generate-file-trees.js --force   # Regenerate even if recent
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');
const EHG_ROOT = path.resolve(__dirname, '../../ehg');
const PARENT_DIR = path.resolve(__dirname, '../..');

class FileTreeGenerator {
  constructor() {
    this.projectRoot = EHG_ENGINEER_ROOT;
    this.outputFile = path.join(this.projectRoot, '.claude', 'file-trees.md');

    // Directories to exclude
    this.excludeDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      'out',
      'test-results',
      'playwright-report',
      '.playwright',
      'tmp',
      'temp',
      'cache'
    ]);

    // File patterns to exclude
    this.excludePatterns = [
      /\.log$/,
      /\.lock$/,
      /package-lock\.json$/,
      /\.env\..*$/,
      /\.DS_Store$/,
      /thumbs\.db$/i,
      /\.swp$/,
      /\.swo$/,
      /~$/,
      /\.min\./,
      /\.map$/,
      /\.cache/
    ];

    this.tokenEstimate = 0;
  }

  /**
   * Main execution entry point
   */
  async generate(options = {}) {
    console.log('📂 Generating file trees for Claude Code context...\n');

    try {
      // Check if regeneration is needed
      if (!options.force && await this.isRecentGeneration()) {
        console.log('✅ File trees were generated recently (within 4 hours)');
        console.log('💡 Use --force to regenerate anyway\n');
        return;
      }

      // Generate trees for both applications
      const engineerTree = await this.generateTree(
        EHG_ENGINEER_ROOT,
        'EHG_Engineer (Management Dashboard)'
      );

      const ehgTree = await this.generateTree(
        EHG_ROOT,
        'EHG (Business Application)'
      );

      // Combine and write output
      const content = this.buildMarkdownOutput(engineerTree, ehgTree);
      await this.writeOutput(content);

      console.log('\n✅ File trees generated successfully!');
      console.log(`📝 Output: ${this.outputFile}`);
      console.log(`📊 Estimated tokens: ~${Math.round(this.tokenEstimate / 100) * 100}`);
      console.log(`⏰ Next refresh: ${new Date(Date.now() + 4 * 60 * 60 * 1000).toLocaleTimeString()}\n`);

    } catch (error) {
      console.error('❌ Error generating file trees:', error.message);
      throw error;
    }
  }

  /**
   * Check if file trees were generated recently
   */
  async isRecentGeneration() {
    try {
      const stats = await fs.stat(this.outputFile);
      const age = Date.now() - stats.mtimeMs;
      const fourHours = 4 * 60 * 60 * 1000;
      return age < fourHours;
    } catch {
      return false;
    }
  }

  /**
   * Generate tree for a specific directory
   */
  async generateTree(rootPath, label) {
    console.log(`📁 Scanning ${label}...`);

    try {
      // Check if directory exists
      await fs.access(rootPath);
    } catch {
      console.log(`⚠️  Directory not found: ${rootPath}`);
      return { label, path: rootPath, tree: 'Directory not found', files: [] };
    }

    const files = [];
    const tree = await this.scanDirectory(rootPath, '', files);

    console.log(`   ✓ Found ${files.length} files`);

    return {
      label,
      path: rootPath,
      tree,
      files,
      count: files.length
    };
  }

  /**
   * Recursively scan directory and build tree
   */
  async scanDirectory(dirPath, prefix = '', files = [], depth = 0) {
    // Limit depth to prevent overly deep trees
    if (depth > 10) {
      return prefix + '... (max depth reached)\n';
    }

    let output = '';

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Sort: directories first, then files, alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const entryPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(PARENT_DIR, entryPath);

        // Skip excluded directories
        if (entry.isDirectory() && this.excludeDirs.has(entry.name)) {
          continue;
        }

        // Skip excluded file patterns
        if (entry.isFile() && this.shouldExcludeFile(entry.name)) {
          continue;
        }

        // Tree symbols
        const connector = isLast ? '└── ' : '├── ';
        const extension = isLast ? '    ' : '│   ';

        if (entry.isDirectory()) {
          output += `${prefix}${connector}📁 ${entry.name}/\n`;

          // Recursively scan subdirectory
          const subTree = await this.scanDirectory(
            entryPath,
            prefix + extension,
            files,
            depth + 1
          );
          output += subTree;
        } else {
          // Add file with appropriate icon
          const icon = this.getFileIcon(entry.name);
          output += `${prefix}${connector}${icon} ${entry.name}\n`;
          files.push(relativePath);
        }
      }
    } catch (error) {
      output += `${prefix}... (error reading directory: ${error.message})\n`;
    }

    return output;
  }

  /**
   * Check if file should be excluded
   */
  shouldExcludeFile(filename) {
    return this.excludePatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Get appropriate icon for file type
   */
  getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();

    const iconMap = {
      '.js': '📜',
      '.jsx': '⚛️',
      '.ts': '📘',
      '.tsx': '⚛️',
      '.json': '📋',
      '.md': '📝',
      '.sql': '🗄️',
      '.css': '🎨',
      '.html': '🌐',
      '.env': '🔐',
      '.yml': '⚙️',
      '.yaml': '⚙️',
      '.sh': '🔧',
      '.git': '📌',
      '.txt': '📄'
    };

    return iconMap[ext] || '📄';
  }

  /**
   * Build final markdown output
   */
  buildMarkdownOutput(engineerTree, ehgTree) {
    const _timestamp = new Date().toISOString();
    const dateStr = new Date().toLocaleString();

    let content = '# Application File Trees\n\n';
    content += `**Generated**: ${dateStr}\n`;
    content += '**Purpose**: Provide EXEC agent with complete directory context to eliminate routing errors\n\n';
    content += '---\n\n';

    // EHG_Engineer tree
    content += `## ${engineerTree.label}\n\n`;
    content += `**Path**: \`${engineerTree.path}\`\n`;
    content += '**Purpose**: LEO Protocol management dashboard\n';
    content += '**Database**: dedlbzhpgkmetvhbkyzq (Supabase)\n';
    content += `**Files**: ${engineerTree.count}\n\n`;
    content += '```\n';
    content += engineerTree.tree;
    content += '```\n\n';
    content += '---\n\n';

    // EHG app tree
    content += `## ${ehgTree.label}\n\n`;
    content += `**Path**: \`${ehgTree.path}\`\n`;
    content += '**Purpose**: Customer-facing business application (IMPLEMENTATION TARGET)\n';
    content += '**Database**: liapbndqlqxdcgpwntbv (Supabase)\n';
    content += `**Files**: ${ehgTree.count}\n\n`;
    content += '```\n';
    content += ehgTree.tree;
    content += '```\n\n';
    content += '---\n\n';

    // Usage instructions
    content += '## How to Use These Trees\n\n';
    content += '### For EXEC Agent\n';
    content += '1. **Before implementing**: Consult these trees to identify correct file paths\n';
    content += '2. **Application routing**: Match PRD requirements to correct application\n';
    content += '3. **Component location**: Find exact file paths using tree structure\n';
    content += '4. **Verification**: Cross-reference `pwd` output with tree paths\n\n';
    content += '### Critical Distinctions\n';
    content += '- **EHG_Engineer**: Dashboard, protocol management (don\'t implement features here!)\n';
    content += '- **EHG App**: All customer features go here\n\n';
    content += '### Refresh Strategy\n';
    content += '- **Auto-refresh**: Every 4 hours\n';
    content += '- **Manual refresh**: `npm run context:refresh` or `node scripts/generate-file-trees.js --force`\n';
    content += `- **Next refresh**: ${new Date(Date.now() + 4 * 60 * 60 * 1000).toLocaleString()}\n\n`;

    // Estimate tokens
    this.tokenEstimate = Math.ceil(content.length / 4);

    return content;
  }

  /**
   * Write output to file
   */
  async writeOutput(content) {
    await fs.writeFile(this.outputFile, content, 'utf8');
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const generator = new FileTreeGenerator();
  const force = process.argv.includes('--force');

  generator.generate({ force })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default FileTreeGenerator;