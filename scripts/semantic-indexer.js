#!/usr/bin/env node
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
/**
 * Semantic Codebase Indexer
 *
 * Scans codebase, extracts code entities, generates embeddings via
 * centralized LLM factory, and populates codebase_semantic_index table.
 *
 * SD: SD-SEMANTIC-SEARCH-001
 * Story: US-001 - Natural Language Code Search
 *
 * Usage:
 *   node scripts/semantic-indexer.js [--application ehg|ehg_engineer] [--incremental]
 */

// SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-5a). THIS SCRIPT COULD NEVER RUN.
// It mixed an ESM `import` (line 2) with CommonJS `require` here, in a package.json `type: module`
// repo, so `node scripts/semantic-indexer.js` died on load with:
//   ReferenceError: require is not defined in ES module scope
// MEASURED BY EXECUTION, not inferred — and executing it (rather than scheduling it) is the only
// reason this was found: a cron entry would have logged that stack trace forever while
// codebase_semantic_index stayed empty and every VALIDATION duplicate search reported
// "Semantic index empty" (64 of 65 runs; 0 of 300 ever searched).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseCodeEntities } from './modules/language-parsers.js';
import 'dotenv/config';

// Configuration
const BATCH_SIZE = 50; // Embeddings batch size

/**
 * Lazy-loaded embedding client from centralized LLM factory
 * Uses dynamic import() because this is a CommonJS file and the factory is ESM
 */
let _embedder = null;
async function getEmbedder() {
  if (!_embedder) {
    const { getEmbeddingClient } = await import('../lib/llm/client-factory.js');
    _embedder = getEmbeddingClient();
  }
  return _embedder;
}

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
const supabase = createSupabaseServiceClient();

// OpenAI client removed — embeddings now handled by centralized LLM factory

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
 * Generate embedding for text using centralized LLM factory
 */
async function _generateEmbedding(text) {
  const embedder = await getEmbedder();
  const [embedding] = await embedder.embed(text);
  return embedding;
}

/**
 * Generate embeddings in batches using centralized LLM factory
 */
async function generateEmbeddingsBatch(texts) {
  const embedder = await getEmbedder();
  const embeddings = await embedder.embed(texts);
  return embeddings;
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
  // Canonical forward slashes. path.relative emits backslashes on Windows and forward
  // slashes on Linux, so the SAME entity would key differently across the seats that run
  // this (local Windows seed vs the Linux cron) — every cron run would then see 18k "new"
  // entities, re-embed the world, and write a slash-variant twin of every row.
  const relativePath = path.relative(applicationRoot, filePath).split(path.sep).join('/');
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

      // SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-5, layer 4). DE-DUPLICATE WITHIN THE
      // BATCH ON THE EXACT CONFLICT KEY. Postgres refuses an ON CONFLICT DO UPDATE that would touch
      // the same row twice in one statement ("cannot affect row a second time"), so a single
      // duplicated (file_path, entity_name, entity_type) discarded the WHOLE batch of
      // BATCH_SIZE entities, not just the offender. Measured on the first successful run of this
      // script. Real duplicates occur legitimately: overloads, re-declared types, and a name that
      // parses as two entities in one file. Last-wins matches upsert semantics.
      const deduped = [...new Map(
        records.map((r) => [`${r.file_path}::${r.entity_name}::${r.entity_type}`, r])
      ).values()];
      if (deduped.length !== records.length) {
        skipped += records.length - deduped.length;
      }

      // Upsert to database (update if exists, insert if new)
      const { error } = await supabase
        .from('codebase_semantic_index')
        .upsert(deduped, {
          onConflict: 'file_path,entity_name,entity_type',
          ignoreDuplicates: false
        });

      if (error) {
        // SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-5, layer 6): NAME THE OFFENDER.
        // A bare "Batch error: <message>" says 50 entities failed and nothing about WHICH or WHY,
        // so the operator cannot act and the run looks like noise. Control characters are the known
        // cause here: a literal NUL (U+0000) in a source file is encoded by JSON.stringify as
        //  and Postgres refuses it — reproduced with a two-sided control (plain text writes
        // fine; the same row with U+0000 fails). Reporting the file_path turns an opaque batch
        // failure into a fixable one.
        const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
        const suspects = deduped
          .filter((r) => CONTROL_CHARS.test(r.code_snippet || '') || CONTROL_CHARS.test(r.semantic_description || ''))
          .map((r) => r.file_path);
        console.error(`  ❌ Batch error: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
        if (suspects.length > 0) {
          console.error(`     ↳ ${suspects.length} record(s) carry control characters: ${[...new Set(suspects)].slice(0, 5).join(', ')}`);
        } else {
          console.error('     ↳ no control characters found in this batch — cause is NOT the known U+0000 case');
        }

        // Layer 7: DO NOT LET ONE REFUSED ROW POISON ITS BATCH. A single row Postgres
        // refuses (e.g. entity_type 'table'/'view' while the 20260809 widening migration is
        // unapplied) failed the whole 50-row statement, so 49 innocent entities vanished
        // with it — same class as layer 4, where one duplicate discarded the batch. Fall
        // back to per-row upserts: constraint-agnostic (no allowed-value list to drift from
        // the live constraint), self-healing (when the DDL applies, the same rows just
        // start landing), and it names each refused row exactly.
        let rowFailures = 0;
        const refusedByReason = new Map();
        for (const row of deduped) {
          const { error: rowError } = await supabase
            .from('codebase_semantic_index')
            .upsert(row, { onConflict: 'file_path,entity_name,entity_type', ignoreDuplicates: false });
          if (rowError) {
            rowFailures++;
            const key = `${rowError.code || '?'} ${rowError.message}`.slice(0, 120);
            if (!refusedByReason.has(key)) refusedByReason.set(key, []);
            refusedByReason.get(key).push(`${row.file_path}::${row.entity_name} (${row.entity_type})`);
          } else {
            indexed++;
          }
        }
        for (const [reason, rows] of refusedByReason) {
          console.error(`     ↳ ${rows.length} row(s) refused [${reason}]: ${rows.slice(0, 3).join(', ')}${rows.length > 3 ? ', …' : ''}`);
        }
        errors += rowFailures;
      } else {
        // Count what was actually WRITTEN, not what was offered — `batch.length` over-reports by
        // exactly the number de-duplicated above, and a seeder that inflates its own success count
        // is the same class of defect this SD exists to remove.
        indexed += deduped.length;
        if (verbose) {
          console.log(`  ✅ Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${deduped.length} entities`);
        }
      }

    } catch (batchErr) {
      // This catch previously bound `_error` but reported `error.message` — a ReferenceError
      // INSIDE the error path, which killed the whole run as "Fatal error: error is not defined"
      // and hid the real cause. Measured consequence: the 2026-08-09 seed run died partway
      // (src=100, scripts=1749, lib/tests/database=0 rows) with no usable diagnostic.
      console.error(`  ❌ Batch processing error: ${batchErr.message}`);
      errors += batch.length;
    }
  }

  return { indexed, skipped, errors };
}

/**
 * Fetch every stored (key → semantic_description) for the application, PAGINATED — a single
 * capped fetch would measure the cap, not the population, and silently un-skip everything
 * beyond row 1000.
 */
async function fetchExistingDescriptions(application) {
  const map = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('codebase_semantic_index')
      .select('file_path, entity_name, entity_type, semantic_description')
      .eq('application', application)
      .range(from, from + PAGE - 1);
    if (error) {
      // Could-not-look must not masquerade as empty: an unreadable index means NO skip
      // (everything re-embeds — wasteful but correct), stated out loud.
      console.warn(`  ⚠️  Could not read existing index for incremental skip (${error.message}) — re-embedding everything`);
      return new Map();
    }
    for (const r of data || []) {
      map.set(`${r.file_path}::${r.entity_name}::${r.entity_type}`, r.semantic_description);
    }
    if (!data || data.length < PAGE) break;
  }
  return map;
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
  const embedder = await getEmbedder();
  console.log(`Embedding model: ${embedder.model} (${embedder.dimensions}D, provider: ${embedder.provider})\n`);

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
    } catch (_error) {
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
    } catch (fileErr) {
      // Same defect as the batch catch above: `_error` bound, `error` reported — the error
      // path itself threw. A reporter that crashes on report is the class this SD removes.
      console.error(`  ⚠️  Error processing ${filePath}: ${fileErr.message}`);
    }
  }

  console.log(`✅ Extracted ${allEntities.length} code entities\n`);

  // Layer 9: --incremental must actually BE incremental. It only skipped the DELETE and then
  // re-embedded every entity, so a full pass ran ~6h at measured embed rates — which turns the
  // weekly cron (45-min job timeout) into an instrument that times out every run while its
  // data-present verify step stays green on last week's rows. Skip entities whose stored
  // semantic_description is byte-identical: the description is the exact text that gets
  // embedded, so an unchanged description means an unchanged embedding. New and changed
  // entities still embed; the skip count is reported, never folded into 'indexed'.
  let toIndex = allEntities;
  if (incremental) {
    const existing = await fetchExistingDescriptions(application);
    toIndex = allEntities.filter((e) => existing.get(`${e.filePath}::${e.entityName}::${e.entityType}`) !== e.semanticDescription);
    console.log(`↻ Incremental: ${allEntities.length - toIndex.length} unchanged entities skipped, ${toIndex.length} to embed\n`);
  }

  // Index entities
  console.log('🚀 Generating embeddings and indexing...');
  const stats = await indexEntities(toIndex, options);

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
