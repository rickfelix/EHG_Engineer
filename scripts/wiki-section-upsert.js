#!/usr/bin/env node

/**
 * Upsert an EHG Wiki section by (domain, slug).
 * Auto-increments `version` when content actually changes.
 *
 * Usage:
 *   node scripts/wiki-section-upsert.js <domain> <slug> --title "Title" --content @file.md [--ratified]
 *
 * SD: SD-LEO-INFRA-EHG-WIKI-DURABLE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { computeNextVersion } from '../lib/wiki/section-versioning.js';

dotenv.config();

function parseArgs(argv) {
  const [domain, slug, ...rest] = argv;
  const opts = { domain, slug, title: null, content: null, ratified: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--title') opts.title = rest[++i];
    else if (a === '--content') opts.content = rest[++i];
    else if (a === '--ratified') opts.ratified = true;
  }
  return opts;
}

async function main() {
  const { domain, slug, title, content, ratified } = parseArgs(process.argv.slice(2));

  if (!domain || !slug || !title || !content) {
    console.log('❌ Usage: node scripts/wiki-section-upsert.js <domain> <slug> --title "Title" --content @file.md [--ratified]');
    process.exit(1);
  }

  const contentValue = content.startsWith('@')
    ? fs.readFileSync(content.slice(1), 'utf8')
    : content;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials (need SUPABASE_SERVICE_ROLE_KEY) in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: existing, error: readError } = await supabase
    .from('ehg_wiki_sections')
    .select('id, content, version')
    .eq('domain', domain)
    .eq('slug', slug)
    .maybeSingle();

  if (readError) {
    console.log(`❌ Lookup failed: ${readError.message}`);
    process.exit(1);
  }

  if (!existing) {
    const { data, error } = await supabase
      .from('ehg_wiki_sections')
      .insert({ domain, slug, title, content: contentValue, chairman_ratified: ratified })
      .select('id, citation_id, version')
      .single();

    if (error) {
      console.log(`❌ Insert failed: ${error.message}`);
      process.exit(1);
    }

    console.log(`✅ Created ${domain}/${slug} — ${data.citation_id} (version ${data.version})`);
    return;
  }

  const contentChanged = existing.content !== contentValue;
  const nextVersion = computeNextVersion(existing, contentValue);

  const { data, error } = await supabase
    .from('ehg_wiki_sections')
    .update({
      title,
      content: contentValue,
      version: nextVersion,
      chairman_ratified: ratified,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('id, citation_id, version')
    .single();

  if (error) {
    console.log(`❌ Update failed: ${error.message}`);
    process.exit(1);
  }

  console.log(
    contentChanged
      ? `✅ Updated ${domain}/${slug} — ${data.citation_id} (version ${existing.version} -> ${data.version})`
      : `ℹ️  No content change for ${domain}/${slug} — ${data.citation_id} (version unchanged at ${data.version})`
  );
}

main();
