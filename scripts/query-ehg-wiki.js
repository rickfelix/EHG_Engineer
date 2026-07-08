#!/usr/bin/env node

/**
 * Agent-citable lookup for the EHG Wiki. Returns a stable citation_id so an
 * agent cites authoritative, DB-backed content instead of asserting from
 * in-context memory ("Wiki vs. Open Brain" — SD-LEO-INFRA-EHG-WIKI-DURABLE-001).
 *
 * Usage:
 *   node scripts/query-ehg-wiki.js <domain> --slug <slug>
 *   node scripts/query-ehg-wiki.js <domain> --search "<text>"
 *   node scripts/query-ehg-wiki.js <domain>              # list all sections in domain
 *
 * Exit code 0 with NOT_FOUND result when nothing matches — never fabricates.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function parseArgs(argv) {
  const [domain, ...rest] = argv;
  const opts = { domain, slug: null, search: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--slug') opts.slug = rest[++i];
    else if (a === '--search') opts.search = rest[++i];
  }
  return opts;
}

async function main() {
  const { domain, slug, search } = parseArgs(process.argv.slice(2));

  if (!domain) {
    console.log('❌ Usage: node scripts/query-ehg-wiki.js <domain> [--slug <slug> | --search "<text>"]');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('ehg_wiki_sections')
    .select('id, domain, slug, title, content, version, citation_id, chairman_ratified, updated_at')
    .eq('domain', domain);

  if (slug) {
    query = query.eq('slug', slug);
  } else if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.log(`❌ Query failed: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(JSON.stringify({ status: 'NOT_FOUND', domain, slug, search }, null, 2));
    return;
  }

  console.log(JSON.stringify({ status: 'FOUND', count: data.length, results: data }, null, 2));
}

main();
