#!/usr/bin/env node
/**
 * SD-LEO-INFRA-THREE-GAPS-APPLIED-001 — FR-1 live probe.
 *
 * Reads the live catalog and compares it to DECLARED_BOUNDARY, so the honest boundary is
 * stated somewhere an AUTOMATED reader reaches — which is the actual gap. The boundary was
 * always documented; it lived in a SQL comment nothing executes.
 *
 * Exit 0  MATCHES — live catalog equals the declaration.
 * Exit 1  DRIFTED — either a new bypass appeared, or the path was constrained and every
 *         closure claim now needs updating. Both need a human.
 * Exit 2  UNREADABLE — could not read. Never a pass.
 *
 * Read-only. This SD applies no DDL.
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  DECLARED_BOUNDARY,
  HONEST_BOUNDARY_STATEMENT,
  evaluateBoundary,
  assertsUnreachability,
} from '../lib/policy/anon-chairman-boundary.js';

const JSON_OUT = process.argv.includes('--json');

/** Files whose prose describes this boundary and must not assert unreachability. */
const CLAIM_SURFACES = [
  'database/migrations/20260802_bound_anon_feedback_ingress.sql',
  'database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier.sql',
];

/** Pull ('type','status','severity') from each INSERT INTO public.feedback VALUES block. */
function readInsertPaths(def) {
  if (typeof def !== 'string') return [];
  const out = [];
  const idxs = [...def.matchAll(/INSERT INTO public\.feedback/gi)].map((m) => m.index);
  idxs.forEach((start, n) => {
    const chunk = def.slice(start, start + 1200);
    // The trailing literal triple in the VALUES list is (type, status, severity).
    const triple = chunk.match(/'(issue|bug|task)'\s*,\s*'(\w+)'\s*,\s*'(\w+)'/i);
    if (!triple) return;
    // Path identity comes from the watermark marker, not from ordinal position, so a
    // reordering of the function body does not read as a severity change.
    const isStorm = /STORM SUPPRESSED|storm watermark|watermark_hash/i.test(chunk);
    out.push({ path: isStorm ? 'storm_watermark' : 'normal', type: triple[1].toLowerCase(), status: triple[2].toLowerCase(), severity: triple[3].toLowerCase(), ordinal: n });
  });
  return out;
}

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
  if (!conn) { console.error('UNREADABLE: no SUPABASE_POOLER_URL / SUPABASE_DB_URL.'); process.exit(2); }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let live;
  try {
    const fn = await client.query(
      `select p.prosecdef, r.rolname as owner, r.rolbypassrls, pg_get_functiondef(p.oid) as def
         from pg_proc p
         join pg_roles r on r.oid = p.proowner
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'record_venture_error'`,
    );
    const grants = await client.query(
      `select grantee from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'record_venture_error' and privilege_type = 'EXECUTE'`,
    );
    const row = fn.rows[0];
    live = row
      ? {
        security_definer: row.prosecdef,
        owner: row.owner,
        owner_bypasses_rls: row.rolbypassrls,
        anon_has_execute: grants.rows.some((g) => g.grantee === 'anon'),
        insert_paths: readInsertPaths(row.def),
      }
      : null;
  } finally {
    await client.end();
  }

  const result = evaluateBoundary(live);

  // Scan the prose surfaces for a closure claim the function contradicts.
  const offenders = [];
  for (const f of CLAIM_SURFACES) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { offenders.push({ file: f, issue: 'UNREADABLE (not found)' }); continue; }
    if (assertsUnreachability(text)) offenders.push({ file: f, issue: 'asserts unreachability the function contradicts' });
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ verdict: result.verdict, drift: result.drift, live, offenders }, null, 2));
  } else {
    console.log('=== FR-1 anon -> chairman-queue boundary probe ===');
    console.log(`VERDICT: ${result.verdict}`);
    console.log(`  SECURITY DEFINER : ${live?.security_definer}`);
    console.log(`  owner            : ${live?.owner} (bypassrls=${live?.owner_bypasses_rls})`);
    console.log(`  anon EXECUTE     : ${live?.anon_has_execute}`);
    for (const p of live?.insert_paths ?? []) console.log(`  insert path      : ${p.path} -> ${p.type}/${p.status}/${p.severity}`);
    console.log(`  queue arms on    : [${DECLARED_BOUNDARY.queue_arm_severities.join(', ')}]`);
    if (result.drift.length) result.drift.forEach((d) => console.log(`  DRIFT: ${d}`));
    console.log(`  ${result.detail}`);
    console.log('\nTHE HONEST BOUNDARY (state this; do not state unreachability):');
    console.log(`  ${HONEST_BOUNDARY_STATEMENT}`);
    console.log(offenders.length ? '\nCLAIM SURFACES WITH PROBLEMS:' : '\nCLAIM SURFACES: none assert unreachability.');
    offenders.forEach((o) => console.log(`  ${o.file}: ${o.issue}`));
  }

  if (result.verdict === 'UNREADABLE') process.exit(2);
  process.exit(result.verdict === 'MATCHES' && offenders.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`UNREADABLE: ${e.message}`); process.exit(2); });
