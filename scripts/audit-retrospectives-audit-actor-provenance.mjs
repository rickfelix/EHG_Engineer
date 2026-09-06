#!/usr/bin/env node
// SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-3(c): counts retrospectives_audit rows whose changed_by
// is either NULL or not a registered canonical writer identity, since a given cutoff timestamp.
//
// NOT changed_by='uncanonical' literally -- that framing (the SD's own original text) was measured
// dead by construction: 1815/1815 rows (30 days) have changed_by IS NULL today, because the
// column's pre-existing DEFAULT (current_setting('request.jwt.claims',true)::json->>'sub') never
// fires on the service-role/pooler write path every real writer uses. A count(changed_by=
// 'uncanonical')=0 assertion would pass vacuously. The COALESCE-to-'uncanonical' fallback only
// starts producing that literal going forward once FR-1's migration is chairman-applied -- until
// then, this check is expected to report a NONZERO count (100% NULL), which is correct and
// informative, not a false alarm.
//
// Usage: node scripts/audit-retrospectives-audit-actor-provenance.mjs [--since <ISO timestamp>]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const CANONICAL_WRITER_IDENTITIES = [
  'retro_sub_agent',
  'handoff_retrospective_enricher',
  'handoff_lead_to_plan_retrospective',
  'handoff_plan_to_exec_retrospective',
  'handoff_exec_to_plan_retrospective',
  'handoff_plan_to_lead_state_transitions',
  'orchestrator_completion_guardian',
  'restore_from_audit',
];

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key);
}

export async function countUncanonicalRetroWrites(supabase, { since } = {}) {
  let query = supabase
    .from('retrospectives_audit')
    .select('id, changed_by, changed_at', { count: 'exact' });
  if (since) query = query.gte('changed_at', since);
  const { data, error, count } = await query;
  if (error) throw new Error(`query failed: ${error.message}`);

  const uncanonical = (data || []).filter(
    (row) => !row.changed_by || !CANONICAL_WRITER_IDENTITIES.includes(row.changed_by)
  );
  return {
    totalRows: count ?? data?.length ?? 0,
    uncanonicalCount: uncanonical.length,
    uncanonicalSample: uncanonical.slice(0, 5).map((r) => ({ id: r.id, changed_by: r.changed_by, changed_at: r.changed_at })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx !== -1 ? args[sinceIdx + 1] : undefined;
  const supabase = buildSupabase();
  const result = await countUncanonicalRetroWrites(supabase, { since });
  console.log(JSON.stringify(result, null, 2));
  if (result.uncanonicalCount > 0) {
    console.log(
      `\n${result.uncanonicalCount} uncanonical/unattributed retrospectives_audit row(s)` +
      (since ? ` since ${since}` : '') +
      '. Expected NONZERO until FR-1 (database/chairman-gated/20260906_retrospectives_published_guard.sql) is chairman-applied.'
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e.message); process.exitCode = 1; });
}
