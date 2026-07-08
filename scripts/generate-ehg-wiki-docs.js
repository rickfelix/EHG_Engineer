#!/usr/bin/env node

/**
 * Generate human-readable markdown from ehg_wiki_sections.
 * DB is the source of truth (mirrors generate-claude-md-from-db.js) — generated
 * files are a read-only view, never edited directly.
 *
 * Usage: node scripts/generate-ehg-wiki-docs.js [--domain <domain>]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

function parseArgs(argv) {
  const opts = { domain: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--domain') opts.domain = argv[++i];
  }
  return opts;
}

async function main() {
  const { domain } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('ehg_wiki_sections')
    .select('domain, slug, title, content, version, citation_id, chairman_ratified, updated_at');

  if (domain) query = query.eq('domain', domain);

  const { data, error } = await query;

  if (error) {
    console.log(`❌ Query failed: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('ℹ️  No sections found — nothing generated.');
    return;
  }

  let written = 0;
  for (const section of data) {
    const dir = path.join('docs', 'wiki', section.domain);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${section.slug}.md`);

    const body = [
      '<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: ehg_wiki_sections (DB). -->',
      '<!-- Regenerate: node scripts/generate-ehg-wiki-docs.js -->',
      `<!-- ${section.citation_id} | version ${section.version} | ratified: ${section.chairman_ratified} -->`,
      '',
      `# ${section.title}`,
      '',
      section.content,
      '',
    ].join('\n');

    fs.writeFileSync(filePath, body, 'utf8');
    written++;
  }

  console.log(`✅ Generated ${written} wiki doc(s) under docs/wiki/`);
}

main();
