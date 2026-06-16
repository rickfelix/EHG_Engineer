#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-3) — capture a chairman-facing one-sentence summary
 * for an SD into strategic_directives_v2.metadata.chairman_summary, so the hourly exec email's
 * "Done in the last hour" section reads in plain language (no SD-jargon titles).
 *
 * Run this at SD completion (post-completion tail). Additive + idempotent: it merges the one key
 * into existing metadata. The email already falls back to a cleaned-up title when this is absent,
 * so older SDs render fine; this just makes future hours read fully plain.
 *
 * Usage: node scripts/capture-chairman-summary.mjs --sd <SD-KEY> --summary "<one plain sentence>"
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

async function main() {
  const sdKey = arg('--sd');
  const summary = arg('--summary');
  if (!sdKey || !summary || !summary.trim()) {
    console.error('Usage: node scripts/capture-chairman-summary.mjs --sd <SD-KEY> --summary "<one plain sentence>"');
    process.exit(1);
  }
  const clean = summary.trim().slice(0, 280); // one sentence; cap for the email
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const db = createClient(url, key);

  const { data: sd, error: e0 } = await db.from('strategic_directives_v2').select('metadata').eq('sd_key', sdKey).maybeSingle();
  if (e0) { console.error('read failed:', e0.message); process.exit(1); }
  if (!sd) { console.error('SD not found:', sdKey); process.exit(1); }
  const metadata = { ...(sd.metadata || {}), chairman_summary: clean };
  const { error } = await db.from('strategic_directives_v2').update({ metadata }).eq('sd_key', sdKey);
  if (error) { console.error('update failed:', error.message); process.exit(1); }
  console.log(`OK: chairman_summary set for ${sdKey}: "${clean}"`);
}

main().catch((e) => { console.error('capture-chairman-summary failed:', e && e.message ? e.message : e); process.exit(1); });
