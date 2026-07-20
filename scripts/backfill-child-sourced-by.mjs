#!/usr/bin/env node
/**
 * QF-20260720-054 — one-time backfill: stamp metadata.sourced_by on decomposition children
 * created before linkChild() inherited it (Solomon Mode-B advisory d64ca850).
 *
 * For every child (parent_sd_id set) whose metadata.sourced_by is null/absent, copy the
 * PARENT's metadata.sourced_by onto the child with a companion key sourced_by_backfilled=true
 * (so a backfilled stamp is distinguishable from a natively-sourced one). Reuses the SAME
 * inheritance rule as the live path (computeInheritedSourcedBy) so the two never drift.
 *
 * DRY-RUN by default; pass --apply to write. Idempotent — a second --apply run finds nothing
 * (children now carry a stamp). Run from the shared repo root so dotenv resolves .env:
 *   node scripts/backfill-child-sourced-by.mjs            # dry-run
 *   node scripts/backfill-child-sourced-by.mjs --apply    # write
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeInheritedSourcedBy } from '../lib/sd/child-linkage.js';

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key);

const isObj = (m) => m && typeof m === 'object' && !Array.isArray(m);

// 1) Page through ALL children (PostgREST caps at 1000/req — never trust a single page).
const PAGE = 1000;
let offset = 0;
const children = [];
for (;;) {
  const { data, error } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, parent_sd_id, metadata')
    .not('parent_sd_id', 'is', null)
    .range(offset, offset + PAGE - 1);
  if (error) { console.error('child fetch failed:', error.message); process.exit(1); }
  children.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}

// 2) Candidates = children with a null/absent stamp.
const candidates = children.filter((c) => {
  const s = isObj(c.metadata) ? c.metadata.sourced_by : null;
  return s == null || s === '';
});

// Parent metadata lookup (cached). parent_sd_id stores parent.id (uuid or sd_key); try id,
// then uuid_id, then sd_key so both autonomy (id=sd_key) and generic (id=uuid) parents match.
const parentCache = new Map();
async function parentMeta(ref) {
  if (!ref) return null;
  if (parentCache.has(ref)) return parentCache.get(ref);
  let { data } = await sb.from('strategic_directives_v2').select('metadata').eq('id', ref).maybeSingle();
  if (!data) ({ data } = await sb.from('strategic_directives_v2').select('metadata').eq('uuid_id', ref).maybeSingle());
  if (!data) ({ data } = await sb.from('strategic_directives_v2').select('metadata').eq('sd_key', ref).maybeSingle());
  const meta = data?.metadata ?? null;
  parentCache.set(ref, meta);
  return meta;
}

let backfilled = 0, noParentStamp = 0, errors = 0;
const changes = [];
for (const c of candidates) {
  const inherited = computeInheritedSourcedBy(await parentMeta(c.parent_sd_id), c.metadata);
  if (inherited == null) { noParentStamp++; continue; }   // parent absent or itself unstamped
  changes.push({ sd_key: c.sd_key, sourced_by: inherited });
  if (APPLY) {
    const merged = { ...(isObj(c.metadata) ? c.metadata : {}), sourced_by: inherited, sourced_by_backfilled: true };
    const { error } = await sb.from('strategic_directives_v2').update({ metadata: merged }).eq('sd_key', c.sd_key);
    if (error) { console.error(`  ✗ ${c.sd_key}: ${error.message}`); errors++; continue; }
    backfilled++;
  }
}

console.log(`\nchildren=${children.length}  null-stamp candidates=${candidates.length}`);
console.log(`would-backfill=${changes.length}  skipped (no parent stamp)=${noParentStamp}`);
for (const ch of changes.slice(0, 25)) console.log(`  ${APPLY ? '✓' : '·'} ${ch.sd_key} ← sourced_by='${ch.sourced_by}'`);
if (changes.length > 25) console.log(`  … +${changes.length - 25} more`);
console.log(APPLY ? `\nAPPLIED: backfilled=${backfilled} errors=${errors}` : `\nDRY-RUN (no writes). Re-run with --apply to persist.`);
