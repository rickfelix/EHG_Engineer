#!/usr/bin/env node
/**
 * Mirror golden-references/registry.json into leo_artifacts
 * SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-A
 *
 * registry.json is the source of truth; this mirror makes references queryable
 * DB-side (artifact_type='golden_reference') for the tiered orchestrator.
 *
 * LIVE COLUMN CONTRACT (RISK 370469df live probe — authoritative over the
 * stale schema/013 DDL): only {id, prd_id, artifact_type, artifact_name,
 * content, metadata, created_at, updated_at} exist. No file_path/checksum/
 * version columns and NO unique index, so:
 *  - registry fields fold into content JSONB, and
 *  - idempotency is APPLICATION-LEVEL: select by the natural key
 *    (prd_id sentinel + artifact_type + artifact_name), insert only if absent.
 * Zero new DDL by design.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
require('dotenv').config({ path: join(REPO_ROOT, '.env') });
const { createClient } = require('@supabase/supabase-js');

const SENTINEL_PRD_ID = 'GOLDEN-REFERENCES-REGISTRY';
const ARTIFACT_TYPE = 'golden_reference';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const sb = createClient(url, key);

  // Existence probe: to_regclass fails HONEST on a missing table — the
  // supabase-js head/count pattern false-positives there (known class).
  const { data: reg, error: regErr } = await sb.rpc('to_regclass', { rel: 'public.leo_artifacts' }).maybeSingle?.() ?? {};
  // Not every project exposes to_regclass as an RPC; fall back to a SELECT
  // that distinguishes missing-relation (42P01) from empty.
  if (regErr || reg === undefined) {
    const { error: probeErr } = await sb.from('leo_artifacts').select('id').limit(1);
    if (probeErr) throw new Error('leo_artifacts probe failed (missing table? ' + probeErr.code + '): ' + probeErr.message);
  } else if (reg === null) {
    throw new Error('leo_artifacts does not exist (to_regclass returned null) — refusing to no-op');
  }

  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'golden-references', 'registry.json'), 'utf8'));
  const rows = manifest.references || [];
  console.log(`registry rows: ${rows.length}`);

  let inserted = 0, existing = 0;
  for (const row of rows) {
    const { data: found, error: selErr } = await sb.from('leo_artifacts')
      .select('id')
      .eq('prd_id', SENTINEL_PRD_ID)
      .eq('artifact_type', ARTIFACT_TYPE)
      .eq('artifact_name', row.domain)
      .limit(1);
    if (selErr) throw new Error('natural-key select failed: ' + selErr.message);
    if (found && found.length) { existing++; continue; }
    const { error: insErr } = await sb.from('leo_artifacts').insert({
      prd_id: SENTINEL_PRD_ID,
      artifact_type: ARTIFACT_TYPE,
      artifact_name: row.domain,
      content: row,
      metadata: { mirrored_at: new Date().toISOString(), source: 'scripts/golden-references/mirror-registry.mjs' },
    });
    if (insErr) throw new Error(`insert failed for ${row.domain}: ` + insErr.message);
    inserted++;
  }
  console.log(`✓ mirror complete: ${inserted} inserted, ${existing} existing (idempotent)`);
}

main().catch((e) => { console.error('✗ mirror failed:', e.message); process.exit(1); });
