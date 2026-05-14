#!/usr/bin/env node
/**
 * regenerate-adr-docs.mjs — Render pocock_adrs accepted rows to docs/adr/NNNN-slug.md
 *
 * Idempotent derived-view writer. Re-running produces byte-identical output for
 * the same DB state (used by smoke test TS-B-5 to prove docs/adr/ is a rendered
 * view of pocock_adrs, not the source).
 *
 * First line of each generated file carries the POCOCK-ADR-RPC-SIGNED marker
 * (sha256 of adr_number + slug + title + body + status). The commit-msg hook
 * validates this marker on every commit touching docs/adr/.
 *
 * SD: SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-B
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function findRepoRoot() {
  let dir = path.dirname(url.fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function log(level, msg, extra = {}) {
  console.error(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra }));
}

function signedMarker(row) {
  const payload = `${row.adr_number}|${row.slug}|${row.title}|${row.body}|${row.status}`;
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  return `<!-- POCOCK-ADR-RPC-SIGNED: ${sha} -->`;
}

function renderAdr(row) {
  const marker = signedMarker(row);
  return [
    marker,
    '',
    `# ADR-${String(row.adr_number).padStart(4, '0')}: ${row.title}`,
    '',
    row.body.trim(),
    '',
    '---',
    `Status: ${row.status}`,
    row.accepted_at ? `Accepted at: ${row.accepted_at}` : null,
    row.approved_by ? `Approved by: ${row.approved_by}` : null,
    '',
  ].filter(line => line !== null).join('\n');
}

async function main() {
  const repoRoot = findRepoRoot();
  const adrDir = path.join(repoRoot, 'docs', 'adr');
  if (!fs.existsSync(adrDir)) {
    fs.mkdirSync(adrDir, { recursive: true });
    log('info', 'created docs/adr/ directory', { path: adrDir });
  }

  const { data, error } = await supabase
    .from('pocock_adrs')
    .select('*')
    .eq('status', 'accepted')
    .order('adr_number', { ascending: true });

  if (error) {
    log('error', 'failed to read pocock_adrs', { error: error.message });
    process.exit(1);
  }

  const validNames = new Set();
  for (const row of data) {
    const fileName = `${String(row.adr_number).padStart(4, '0')}-${row.slug}.md`;
    validNames.add(fileName);
    const filePath = path.join(adrDir, fileName);
    const rendered = renderAdr(row);
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    if (existing === rendered) continue;
    fs.writeFileSync(filePath, rendered, 'utf8');
    log('info', 'wrote ADR file', { adr_number: row.adr_number, slug: row.slug, path: filePath });
  }

  // Remove docs/adr/*.md files that no longer correspond to an accepted ADR row
  // (only deletes generated NNNN-slug.md files; skips README.md or anything else)
  const dirEntries = fs.readdirSync(adrDir).filter(f => /^\d{4}-[a-z0-9-]+\.md$/.test(f));
  for (const f of dirEntries) {
    if (!validNames.has(f)) {
      fs.unlinkSync(path.join(adrDir, f));
      log('info', 'removed stale ADR file', { file: f });
    }
  }

  log('info', 'regenerate-adr-docs complete', { count: data.length, dir: adrDir });
}

main().catch(err => {
  log('error', 'fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
