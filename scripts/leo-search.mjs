#!/usr/bin/env node

/**
 * leo-search.mjs — Cross-Table Knowledge Search Utility
 *
 * Searches across strategic_directives_v2, eva_vision_documents,
 * eva_architecture_plans, and product_requirements_v2 using keyword
 * ILIKE matching. Supports multi-term OR, recency sorting, date
 * filtering (--since), and structured JSON output (--json).
 *
 * Usage:
 *   npm run search -- auth security
 *   npm run search -- --json --since 7d "venture"
 *   npm run search -- --table sds "proving"
 *   npm run search -- --limit 5 "workflow"
 *   npm run search -- --semantic "auth" (future — not yet implemented)
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import 'dotenv/config';

// ── Config ──────────────────────────────────────────────────────────────

const TABLE_CONFIG = [
  {
    name: 'strategic_directives_v2',
    alias: 'sds',
    label: 'Strategic Directives',
    searchCols: ['title', 'description', 'strategic_intent', 'rationale', 'scope'],
    displayCols: ['sd_key', 'title', 'status', 'priority', 'current_phase'],
    titleCol: 'title',
    keyCol: 'sd_key',
    dateCol: 'updated_at',
  },
  {
    name: 'eva_vision_documents',
    alias: 'vision',
    label: 'Vision Documents',
    searchCols: ['vision_key', 'content'],
    displayCols: ['vision_key', 'status', 'created_by'],
    titleCol: 'vision_key',
    keyCol: 'vision_key',
    dateCol: 'updated_at',
  },
  {
    name: 'eva_architecture_plans',
    alias: 'arch',
    label: 'Architecture Plans',
    searchCols: ['plan_key', 'content'],
    displayCols: ['plan_key', 'status', 'created_by'],
    titleCol: 'plan_key',
    keyCol: 'plan_key',
    dateCol: 'updated_at',
  },
  {
    name: 'product_requirements_v2',
    alias: 'prds',
    label: 'PRDs',
    searchCols: ['title', 'executive_summary'],
    displayCols: ['id', 'title', 'status', 'priority', 'category'],
    titleCol: 'title',
    keyCol: 'id',
    dateCol: 'updated_at',
  },
];

const DEFAULT_LIMIT = 20;

// ── Argument parsing ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { json: false, since: null, limit: DEFAULT_LIMIT, table: null, semantic: false, terms: [] };

  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--json') { opts.json = true; }
    else if (a === '--semantic') { opts.semantic = true; }
    else if (a === '--since' && args[i + 1]) { opts.since = args[++i]; }
    else if (a === '--limit' && args[i + 1]) { opts.limit = parseInt(args[++i], 10) || DEFAULT_LIMIT; }
    else if (a === '--table' && args[i + 1]) { opts.table = args[++i]; }
    else if (!a.startsWith('--')) { opts.terms.push(a); }
    i++;
  }

  return opts;
}

// ── Date parsing ────────────────────────────────────────────────────────

function parseSince(since) {
  if (!since) return null;
  const match = since.match(/^(\d+)([dhwm])$/);
  if (!match) return null;
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  const now = new Date();
  switch (unit) {
    case 'd': now.setDate(now.getDate() - n); break;
    case 'h': now.setHours(now.getHours() - n); break;
    case 'w': now.setDate(now.getDate() - n * 7); break;
    case 'm': now.setMonth(now.getMonth() - n); break;
  }
  return now.toISOString();
}

// ── Query builder ───────────────────────────────────────────────────────

function buildOrFilter(terms, columns) {
  // Build: (col1.ilike.%term1%,col1.ilike.%term2%,col2.ilike.%term1%,...)
  const parts = [];
  for (const col of columns) {
    for (const term of terms) {
      parts.push(`${col}.ilike.%${term}%`);
    }
  }
  return parts.join(',');
}

async function searchTable(supabase, tableConfig, terms, sinceISO, limit) {
  const { name, searchCols, displayCols, dateCol } = tableConfig;

  // Select all display columns plus searchable ones for context
  const selectCols = [...new Set([...displayCols, dateCol, 'created_at'])];

  let query = supabase
    .from(name)
    .select(selectCols.join(','))
    .or(buildOrFilter(terms, searchCols))
    .order(dateCol, { ascending: false })
    .limit(limit);

  if (sinceISO) {
    query = query.gte(dateCol, sinceISO);
  }

  const { data, error } = await query;
  if (error) {
    return { table: name, error: error.message, results: [] };
  }
  return { table: name, results: data || [] };
}

// ── Output formatting ───────────────────────────────────────────────────

function formatHumanReadable(allResults, tableConfigs) {
  if (allResults.every(r => r.results.length === 0)) {
    console.log('\n  No results found.\n');
    return;
  }

  const total = allResults.reduce((s, r) => s + r.results.length, 0);
  console.log(`\n  Found ${total} result(s) across ${allResults.filter(r => r.results.length > 0).length} table(s)\n`);

  for (const result of allResults) {
    const config = tableConfigs.find(c => c.name === result.table);
    if (!config) continue;

    if (result.error) {
      console.log(`  ${config.label}: ERROR - ${result.error}`);
      continue;
    }

    if (result.results.length === 0) continue;

    console.log(`  ── ${config.label} (${result.results.length}) ──`);
    for (const row of result.results) {
      const key = row[config.keyCol] || row.id || '?';
      const title = row[config.titleCol] || key;
      const date = (row[config.dateCol] || row.created_at || '').slice(0, 10);
      const status = row.status || '';
      const extra = [];
      if (row.priority) extra.push(row.priority);
      if (row.current_phase) extra.push(row.current_phase);
      if (row.category) extra.push(row.category);

      const meta = [status, ...extra].filter(Boolean).join(' | ');
      // Truncate title for readability
      const displayTitle = title.length > 80 ? title.slice(0, 77) + '...' : title;
      console.log(`    ${key.padEnd(45)} ${date}  ${meta}`);
      if (displayTitle !== key) {
        console.log(`      ${displayTitle}`);
      }
    }
    console.log('');
  }
}

function formatJSON(allResults, tableConfigs) {
  const output = [];
  for (const result of allResults) {
    const config = tableConfigs.find(c => c.name === result.table);
    if (!config || result.error) continue;

    for (const row of result.results) {
      output.push({
        source: config.alias,
        source_table: config.name,
        key: row[config.keyCol] || row.id,
        title: row[config.titleCol] || row[config.keyCol] || row.id,
        status: row.status || null,
        date: row[config.dateCol] || row.created_at,
        ...row,
      });
    }
  }

  // Sort merged results by date descending
  output.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  console.log(JSON.stringify(output, null, 2));
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.terms.length === 0) {
    console.log(`
  Usage: npm run search -- <keywords> [options]

  Options:
    --json          Output as JSON (for Claude Code parsing)
    --since <time>  Filter by recency: 2d, 1w, 3m, 24h
    --limit <n>     Max results per table (default: ${DEFAULT_LIMIT})
    --table <alias> Search only one table: sds, vision, arch, prds
    --semantic      (Future) Semantic search via pgvector

  Examples:
    npm run search -- auth security
    npm run search -- --json --since 7d "venture"
    npm run search -- --table sds "proving"
`);
    process.exit(0);
  }

  if (opts.semantic) {
    console.log('\n  --semantic search is not yet implemented.');
    console.log('  Tier 2 feature: will use pgvector for semantic similarity search.');
    console.log('  For now, use keyword search (default).\n');
    process.exit(0);
  }

  const supabase = createSupabaseServiceClient();

  const sinceISO = parseSince(opts.since);

  // Filter tables if --table specified
  let tables = TABLE_CONFIG;
  if (opts.table) {
    tables = TABLE_CONFIG.filter(t => t.alias === opts.table || t.name === opts.table);
    if (tables.length === 0) {
      console.error(`  Unknown table alias: ${opts.table}`);
      console.error(`  Valid aliases: ${TABLE_CONFIG.map(t => t.alias).join(', ')}`);
      process.exit(1);
    }
  }

  // Search all tables in parallel
  const results = await Promise.all(
    tables.map(t => searchTable(supabase, t, opts.terms, sinceISO, opts.limit))
  );

  if (opts.json) {
    formatJSON(results, TABLE_CONFIG);
  } else {
    formatHumanReadable(results, TABLE_CONFIG);
  }
}

main().catch(err => {
  console.error('Search failed:', err.message);
  process.exit(1);
});
