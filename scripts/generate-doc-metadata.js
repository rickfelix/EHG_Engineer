#!/usr/bin/env node
/**
 * DOCMON Metadata Generator
 * Generates or updates YAML frontmatter metadata for documentation files
 *
 * Exit codes:
 *   0 - Success
 *   1 - Runtime error
 *   2 - Validation failed (missing required options)
 *   3 - Config/schema error
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadMetadataSchema,
  findRepoRoot,
  EXIT_CODES
} from './modules/docmon/config-loader.js';
import { getGitUser } from './modules/docmon/git-changes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    path: args.find(a => a.startsWith('--path='))?.split('=')[1],
    category: args.find(a => a.startsWith('--category='))?.split('=')[1],
    tags: args.find(a => a.startsWith('--tags='))?.split('=')[1],
    author: args.find(a => a.startsWith('--author='))?.split('=')[1],
    status: args.find(a => a.startsWith('--status='))?.split('=')[1],
    version: args.find(a => a.startsWith('--version='))?.split('=')[1],
    write: args.includes('--write'),
    overwrite: args.includes('--overwrite'),
    help: args.includes('--help') || args.includes('-h')
  };
}

function showHelp(schema) {
  const categories = schema?.properties?.Category?.enum || [];
  const statuses = schema?.properties?.Status?.enum || [];

  console.log(`
DOCMON Metadata Generator

Usage: node generate-doc-metadata.js --path=<file> [options]

Required:
  --path=<path>        Target documentation file

Options:
  --category=<cat>     Category (required if file lacks Category)
  --tags=<tags>        Comma-separated tags (e.g., "infra,docmon,automation")
  --author=<author>    Author name (default: from git config)
  --status=<status>    Document status (default: Draft)
  --version=<ver>      Version (default: 0.1.0)
  --write              Write changes to file (without this, prints to stdout)
  --overwrite          Overwrite existing non-empty fields
  --help, -h           Show this help message

Exit codes:
  0 - Success
  1 - Runtime error
  2 - Validation failed
  3 - Config/schema error

${categories.length > 0 ? `\nValid categories: ${categories.join(', ')}` : ''}
${statuses.length > 0 ? `\nValid statuses: ${statuses.join(', ')}` : ''}

Examples:
  # Print updated content to stdout
  node generate-doc-metadata.js --path=docs/guide.md --category=Guide --tags=guide,tutorial

  # Write changes to file
  node generate-doc-metadata.js --path=docs/guide.md --category=Guide --tags=guide --write

  # Overwrite existing metadata
  node generate-doc-metadata.js --path=docs/guide.md --category=API --overwrite --write
`);
}

/**
 * Parse existing YAML frontmatter
 */
function parseFrontmatter(content) {
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!yamlMatch) {
    return { metadata: {}, body: content, hasFrontmatter: false };
  }

  const yaml = yamlMatch[1];
  const body = content.slice(yamlMatch[0].length);
  const metadata = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }

      metadata[key] = value;
    }
  }

  return { metadata, body, hasFrontmatter: true };
}

/**
 * Generate YAML frontmatter string
 */
function generateFrontmatter(metadata) {
  const lines = ['---'];

  // Define field order
  const fieldOrder = ['Category', 'Status', 'Version', 'Author', 'Last Updated', 'Tags'];

  for (const field of fieldOrder) {
    if (metadata[field] !== undefined) {
      let value = metadata[field];

      // Format arrays
      if (Array.isArray(value)) {
        value = JSON.stringify(value);
      } else if (typeof value === 'string' && value.includes(',')) {
        // Keep comma-separated as-is for readability
        value = `"${value}"`;
      } else if (typeof value === 'string' && (value.includes(':') || value.includes('#'))) {
        value = `"${value}"`;
      }

      lines.push(`${field}: ${value}`);
    }
  }

  // Add any additional fields not in the standard order
  for (const [key, value] of Object.entries(metadata)) {
    if (!fieldOrder.includes(key)) {
      let formattedValue = value;
      if (Array.isArray(value)) {
        formattedValue = JSON.stringify(value);
      } else if (typeof value === 'string' && (value.includes(':') || value.includes('#'))) {
        formattedValue = `"${value}"`;
      }
      lines.push(`${key}: ${formattedValue}`);
    }
  }

  lines.push('---', '');
  return lines.join('\n');
}

/**
 * Get current date in UTC YYYY-MM-DD format
 */
function getUTCDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Infer category from file path
 */
function inferCategory(filePath, categoryMapping) {
  const lower = filePath.toLowerCase();

  for (const [keyword, category] of Object.entries(categoryMapping)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }

  // Path-based inference
  if (lower.includes('/api/') || lower.includes('\\api\\')) return 'API';
  if (lower.includes('/guides/') || lower.includes('\\guides\\')) return 'Guide';
  if (lower.includes('/reference/') || lower.includes('\\reference\\')) return 'Reference';
  if (lower.includes('/architecture/') || lower.includes('\\architecture\\')) return 'Architecture';
  if (lower.includes('/database/') || lower.includes('\\database\\')) return 'Database';
  if (lower.includes('/testing/') || lower.includes('\\testing\\')) return 'Testing';
  if (lower.includes('/features/') || lower.includes('\\features\\')) return 'Feature';
  if (lower.includes('/deployment/') || lower.includes('\\deployment\\')) return 'Deployment';
  if (lower.includes('/protocols/') || lower.includes('\\protocols\\')) return 'Protocol';
  if (lower.includes('/summaries/') || lower.includes('\\summaries\\')) return 'Report';

  return null;
}

async function main() {
  const args = parseArgs();
  const repoRoot = findRepoRoot();

  // Load schema
  const schemaResult = loadMetadataSchema(repoRoot);
  const schema = schemaResult.success ? schemaResult.config : {
    properties: {},
    defaults: { Version: '0.1.0', Status: 'Draft' },
    category_mapping: {}
  };

  if (args.help) {
    showHelp(schema);
    process.exit(EXIT_CODES.PASS);
  }

  if (!args.path) {
    console.error('Error: --path is required');
    showHelp(schema);
    process.exit(EXIT_CODES.VALIDATION_FAILED);
  }

  // Resolve file path
  const fullPath = path.resolve(repoRoot, args.path);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${args.path}`);
    process.exit(EXIT_CODES.RUNTIME_ERROR);
  }

  // Read file content
  const content = fs.readFileSync(fullPath, 'utf8');
  const { metadata: existing, body, hasFrontmatter: _hasFrontmatter } = parseFrontmatter(content);

  // Get git user for author default
  const gitUser = getGitUser();

  // Build new metadata
  const newMetadata = { ...existing };
  const defaults = schema.defaults || {};
  const categoryMapping = schema.category_mapping || {};

  // Category
  if (args.category) {
    if (args.overwrite || !newMetadata.Category) {
      newMetadata.Category = args.category;
    }
  } else if (!newMetadata.Category) {
    // Try to infer category
    const inferred = inferCategory(fullPath, categoryMapping);
    if (inferred) {
      newMetadata.Category = inferred;
    } else {
      const validCategories = schema.properties?.Category?.enum || [];
      console.error('Error: --category is required (file lacks Category and could not be inferred)');
      if (validCategories.length > 0) {
        console.error(`Valid categories: ${validCategories.join(', ')}`);
      }
      process.exit(EXIT_CODES.VALIDATION_FAILED);
    }
  }

  // Status
  if (args.status) {
    if (args.overwrite || !newMetadata.Status) {
      newMetadata.Status = args.status;
    }
  } else if (!newMetadata.Status) {
    newMetadata.Status = defaults.Status || 'Draft';
  }

  // Version
  if (args.version) {
    if (args.overwrite || !newMetadata.Version) {
      newMetadata.Version = args.version;
    }
  } else if (!newMetadata.Version) {
    newMetadata.Version = defaults.Version || '0.1.0';
  }

  // Author
  if (args.author) {
    if (args.overwrite || !newMetadata.Author) {
      newMetadata.Author = args.author;
    }
  } else if (!newMetadata.Author) {
    newMetadata.Author = gitUser.formatted || gitUser.name || 'Unknown';
  }

  // Last Updated
  if (args.overwrite || !newMetadata['Last Updated']) {
    newMetadata['Last Updated'] = getUTCDate();
  }

  // Tags
  if (args.tags) {
    const tagList = args.tags.split(',').map(t => t.trim()).filter(t => t);
    if (args.overwrite || !newMetadata.Tags) {
      newMetadata.Tags = tagList.join(', ');
    }
  } else if (!newMetadata.Tags) {
    // Default tags based on category
    const category = newMetadata.Category?.toLowerCase() || '';
    newMetadata.Tags = category;
  }

  // Generate new content
  const newFrontmatter = generateFrontmatter(newMetadata);
  const newContent = newFrontmatter + body;

  // Output
  if (args.write) {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`Updated: ${args.path}`);
    console.log(`  Category: ${newMetadata.Category}`);
    console.log(`  Status: ${newMetadata.Status}`);
    console.log(`  Version: ${newMetadata.Version}`);
    console.log(`  Author: ${newMetadata.Author}`);
    console.log(`  Last Updated: ${newMetadata['Last Updated']}`);
    console.log(`  Tags: ${newMetadata.Tags}`);
  } else {
    // Print to stdout
    console.log(newContent);
  }

  process.exit(EXIT_CODES.PASS);
}

main().catch(error => {
  console.error(`Runtime error: ${error.message}`);
  process.exit(EXIT_CODES.RUNTIME_ERROR);
});
