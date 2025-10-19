#!/usr/bin/env node
/**
 * Semantic Codebase Indexer
 *
 * Scans codebase, extracts code entities, generates OpenAI embeddings,
 * and populates codebase_semantic_index table for semantic search.
 *
 * SD: SD-SEMANTIC-SEARCH-001
 * Story: US-001 - Natural Language Code Search
 *
 * Usage:
 *   node scripts/semantic-indexer.js [--application ehg|ehg_engineer] [--incremental]
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const { parseCodeEntities } = require('./modules/language-parsers');
require('dotenv').config();

// Configuration
const BATCH_SIZE = 50; // OpenAI embeddings batch size
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Application paths
const APPLICATION_PATHS = {
  ehg_engineer: process.cwd(), // Current directory (EHG_Engineer)
  ehg: path.join(process.cwd(), '../ehg') // Sibling directory
};

// Directories to scan
const SCAN_DIRECTORIES = [
  'src',
  'scripts',
  'database/functions',
  'lib',
  'tests'
];

// File extensions to process
const SUPPORTED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.sql'
];

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    application: args.includes('--application')
      ? args[args.indexOf('--application') + 1]
      : 'ehg_engineer',
    incremental: args.includes('--incremental'),
    verbose: args.includes('--verbose')
  };
}

/**
 * Scan directory recursively for code files
 */
async function scanDirectory(dirPath, fileList = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    // Skip node_modules, .git, dist, build
    if (entry.name === 'node_modules' || entry.name === '.git' ||
        entry.name === 'dist' || entry.name === 'build' ||
        entry.name === '.next') {
      continue;
    }

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: 'float'
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings in batches
 */
async function generateEmbeddingsBatch(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: 'float'
  });

  return response.data.map(item => item.embedding);
}

/**
 * Create semantic description for code entity
 */
function createSemanticDescription(entity) {
  const parts = [
    `${entity.entityType}: ${entity.entityName}`,
    entity.params ? `Parameters: ${entity.params}` : '',
    entity.returns ? `Returns: ${entity.returns}` : '',
    entity.description || '',
    entity.codeSnippet ? `Code: ${entity.codeSnippet.substring(0, 200)}` : ''
  ].filter(Boolean);

  return parts.join('. ');
}

/**
 * Process a single file and extract entities
 */
async function processFile(filePath, applicationRoot, application) {
  const relativePath = path.relative(applicationRoot, filePath);
  const fileContent = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath);

  // Determine language
  const languageMap = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.sql': 'sql'
  };
  const language = languageMap[ext] || 'javascript';

  // Parse code entities
  const entities = await parseCodeEntities(fileContent, language, relativePath);

  // Create semantic descriptions and prepare for indexing
  return entities.map(entity => ({
    filePath: relativePath,
    entityType: entity.entityType,
    entityName: entity.entityName,
    codeSnippet: entity.codeSnippet || '',
    semanticDescription: createSemanticDescription(entity),
    lineStart: entity.lineStart,
    lineEnd: entity.lineEnd,
    language,
    application
  }));
}

/**
 * Index entities with embeddings
 */
async function indexEntities(entities, options) {
  const { verbose } = options;

  if (entities.length === 0) {
    console.log('  No entities to index');
    return { indexed: 0, skipped: 0, errors: 0 };
  }

  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE);

    try {
      // Generate embeddings for batch
      const texts = batch.map(e => e.semanticDescription);
      const embeddings = await generateEmbeddingsBatch(texts);

      // Prepare database records
      const records = batch.map((entity, idx) => ({
        file_path: entity.filePath,
        entity_type: entity.entityType,
        entity_name: entity.entityName,
        code_snippet: entity.codeSnippet,
        semantic_description: entity.semanticDescription,
        embedding: embeddings[idx],
        line_start: entity.lineStart,
        line_end: entity.lineEnd,
        language: entity.language,
        application: entity.application
      }));

      // Upsert to database (update if exists, insert if new)
      const { error } = await supabase
        .from('codebase_semantic_index')
        .upsert(records, {
          onConflict: 'file_path,entity_name,entity_type',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`  ❌ Batch error: ${error.message}`);
        errors += batch.length;
      } else {
        indexed += batch.length;
        if (verbose) {
          console.log(`  ✅ Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} entities`);
        }
      }

    } catch (error) {
      console.error(`  ❌ Batch processing error: ${error.message}`);
      errors += batch.length;
    }
  }

  return { indexed, skipped, errors };
}

/**
 * Main indexing workflow
 */
async function main() {
  const options = parseArgs();
  const { application, incremental, verbose } = options;

  console.log('\n🔍 Semantic Codebase Indexer');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log(`Application: ${application}`);
  console.log(`Mode: ${incremental ? 'Incremental' : 'Full rebuild'}`);
  console.log(`Embedding model: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}D)\n`);

  // Validate application
  if (!APPLICATION_PATHS[application]) {
    console.error(`❌ Invalid application: ${application}`);
    console.log('   Valid: ehg, ehg_engineer');
    process.exit(1);
  }

  const applicationRoot = APPLICATION_PATHS[application];

  // Clear existing index if full rebuild
  if (!incremental) {
    console.log('🗑️  Clearing existing index for full rebuild...');
    const { error } = await supabase
      .from('codebase_semantic_index')
      .delete()
      .eq('application', application);

    if (error) {
      console.error(`❌ Failed to clear index: ${error.message}`);
      process.exit(1);
    }
    console.log('✅ Index cleared\n');
  }

  // Scan directories
  console.log('📂 Scanning directories...');
  let allFiles = [];

  for (const dir of SCAN_DIRECTORIES) {
    const dirPath = path.join(applicationRoot, dir);
    try {
      await fs.access(dirPath);
      const files = await scanDirectory(dirPath);
      allFiles = allFiles.concat(files);
      if (verbose) {
        console.log(`  ${dir}: ${files.length} files`);
      }
    } catch (error) {
      // Directory doesn't exist, skip
      if (verbose) {
        console.log(`  ${dir}: not found (skipping)`);
      }
    }
  }

  console.log(`✅ Found ${allFiles.length} code files\n`);

  // Process files
  console.log('⚙️  Extracting code entities...');
  let allEntities = [];

  for (const filePath of allFiles) {
    try {
      const entities = await processFile(filePath, applicationRoot, application);
      allEntities = allEntities.concat(entities);

      if (verbose) {
        const relPath = path.relative(applicationRoot, filePath);
        console.log(`  ${relPath}: ${entities.length} entities`);
      }
    } catch (error) {
      console.error(`  ⚠️  Error processing ${filePath}: ${error.message}`);
    }
  }

  console.log(`✅ Extracted ${allEntities.length} code entities\n`);

  // Index entities
  console.log('🚀 Generating embeddings and indexing...');
  const stats = await indexEntities(allEntities, options);

  // Summary
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('📊 Indexing Summary');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log(`Application: ${application}`);
  console.log(`Files processed: ${allFiles.length}`);
  console.log(`Entities extracted: ${allEntities.length}`);
  console.log(`Entities indexed: ${stats.indexed}`);
  console.log(`Errors: ${stats.errors}\n`);

  // Verify index
  const { data: indexStats } = await supabase
    .from('codebase_semantic_stats')
    .select('*')
    .eq('application', application);

  if (indexStats && indexStats.length > 0) {
    console.log('📈 Index Statistics:');
    indexStats.forEach(stat => {
      console.log(`  ${stat.entity_type} (${stat.language}): ${stat.entity_count} entities`);
    });
  }

  console.log('\n✅ Semantic indexing complete!\n');
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
