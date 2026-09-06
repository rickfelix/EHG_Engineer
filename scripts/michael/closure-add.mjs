#!/usr/bin/env node
// scripts/michael/closure-add.mjs — record a closed topic in michael_closures (spec §2/§7).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-3). Upserts by closure_key; inert-refusal when
// the tables are unapplied.
//
// Usage: node scripts/michael/closure-add.mjs --key gym-membership --topic gym --text "Decided: keep" \
//          [--keywords gym,membership] [--expires 2026-12-31T00:00:00Z] [--scope personal] --source terminal:<ref> [--dry-run] [--json]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { validSource } from './rule-encode.mjs';

export async function runClosureAdd({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  if (!a.key || !a.topic || !a.text || !a.source) return refusal('MISSING_ARGS', '--key, --topic, --text and --source are required');
  if (!validSource(a.source)) return refusal('SOURCE_INVALID', 'source must be channel:ref');
  if (typeof a.expires === 'string' && !Number.isFinite(Date.parse(a.expires))) return refusal('EXPIRES_INVALID', '--expires must be an ISO timestamp');
  const row = {
    closure_key: String(a.key),
    topic: String(a.topic),
    closure_text: String(a.text),
    keywords: typeof a.keywords === 'string' ? a.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
    expires_at: typeof a.expires === 'string' ? new Date(a.expires).toISOString() : null,
    scope: typeof a.scope === 'string' ? a.scope : null,
    provenance: { source: a.source, uttered_at: now.toISOString(), encoded_by: process.env.CLAUDE_SESSION_ID || 'cli', ratification_id: typeof a.ratification === 'string' ? a.ratification : null },
  };
  if (a['dry-run']) return { ok: true, dry_run: true, would_write: row };
  const w = await writeRows(sb, 'michael_closures', (t) => t.upsert(row, { onConflict: 'closure_key' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, id: w.data ? w.data.id : null, closure_key: row.closure_key };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runClosureAdd({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-CLOSURE-ADD] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
