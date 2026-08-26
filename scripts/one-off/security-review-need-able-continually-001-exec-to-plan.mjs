#!/usr/bin/env node
/**
 * SECURITY sub-agent evidence writer — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, EXEC-TO-PLAN gate.
 *
 * Independent security review of commit 76636382153 ("feat: add venture CPA gauge") performed by
 * directly reading the committed files (not trusting the commit message or the PRD's own claims):
 *   - lib/telemetry/cpa-gauge.mjs (full file, 62 lines)
 *   - lib/marketing/venture-activation-gate.js (full file, 374 lines; diff via
 *     `git diff HEAD~1 HEAD -- lib/marketing/venture-activation-gate.js`)
 *   - scripts/cpa-gauge-cli.mjs (full file, 69 lines)
 *   - database/migrations/20260214_marketing_engine_foundation.sql (daily_rollups table + RLS
 *     policies, lines 128-160 and 196-270)
 *   - tests/unit/query-cpa-gauge.test.js, tests/unit/marketing/venture-activation-gate.test.js
 *     (diff), tests/unit/telemetry/cpa-gauge.test.js — to confirm the query-builder call shape
 *     the fakes exercise matches the real .select().eq().gte() calls.
 * Independently re-ran the outreach-capability grep against the actual diff rather than trusting
 * the commit message's claim:
 *   `git diff HEAD~1 HEAD -- lib/telemetry/cpa-gauge.mjs lib/marketing/venture-activation-gate.js
 *    scripts/cpa-gauge-cli.mjs | grep -iE "send|contact|webhook|fetch\(|http(s)?://|smtp|twilio|
 *    sendgrid|axios|mailto|child_process|exec\(|eval\("` -> zero matches (exit 1).
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = 'PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const COMMIT_SHA = '766363821538e041e36cc3c29f1be246ac44f897';

const FINDINGS = [
  'PASS — no SQL/query injection risk. All three new/modified query sites use the Supabase-js '
    + 'query builder exclusively — .from(\'daily_rollups\').select(\'spend_cents, conversions\')'
    + '.eq(...).gte(...) — with no raw SQL, no .rpc() call, and no string concatenation or template '
    + 'literal building a query string anywhere in the diff. Confirmed by direct read: '
    + 'lib/marketing/venture-activation-gate.js:205-218 (resolveCpaRung), '
    + 'scripts/cpa-gauge-cli.mjs:33-48 (queryCpaGaugeForChannel). Supabase-js .eq()/.gte() compile '
    + 'to PostgREST filter query parameters (e.g. ?venture_id=eq.<value>), which are transport-layer '
    + 'values matched against typed columns (venture_id UUID, platform TEXT, rollup_date DATE per '
    + 'database/migrations/20260214_marketing_engine_foundation.sql:128-139) — there is no code path '
    + 'in this diff where caller-supplied text is interpolated into a SQL string.',

  'PASS — RLS is not bypassed or weakened, and the new code follows the exact caller-injects-the-'
    + 'client pattern already established by resolvePaidRung (venture-activation-gate.js:158-189, '
    + 'pre-existing) rather than introducing a new trust model. daily_rollups has RLS ENABLEd '
    + '(migration line 196) with two policies: "service_role_all_daily_rollups" USING (true) WITH '
    + 'CHECK (true) FOR service_role (line 218-219), and "venture_read_daily_rollups" FOR SELECT TO '
    + 'authenticated, scoped to `venture_id IN (SELECT id FROM ventures WHERE auth.uid() = '
    + 'created_by)` (lines 266-270). resolveCpaRung()/queryCpaGaugeForChannel() take `supabase` as a '
    + 'required parameter with no default and never construct their own privileged client — the '
    + 'CLI (scripts/cpa-gauge-cli.mjs:57) is the only new code that instantiates a client directly, '
    + 'and it uses SUPABASE_SERVICE_ROLE_KEY (matching the existing venture-telemetry-pull.mjs and '
    + 'sibling CLI convention, not a new privilege). No RLS policy is dropped, altered, or worked '
    + 'around anywhere in this commit (confirmed: no ALTER POLICY / DISABLE ROW LEVEL SECURITY / '
    + 'SECURITY DEFINER statements touch daily_rollups in this diff).',

  'ADVISORY, NOT BLOCKING — cross-venture read scoping is enforced only by the caller-supplied '
    + '`ventureId` string being fed into a single `.eq(\'venture_id\', ventureId)` filter; neither '
    + 'resolveCpaRung nor queryCpaGaugeForChannel performs an independent ownership check that the '
    + 'caller is authorized for that specific venture_id. Today this is safe: (a) the only present '
    + 'callers are unit tests, one-off scripts, and the CLI, all of which are operator-invoked with '
    + 'a service-role client (not attacker-facing, confirmed by grepping for importers of '
    + 'venture-activation-gate.js outside tests/scripts/one-off — none exist yet), and (b) this is '
    + 'the same trust model already shipped for resolvePaidRung/resolveTelemetryRungs, not a new '
    + 'pattern this commit introduces. If a FUTURE change ever exposes computeActivationVerdict/'
    + 'resolveCpaRung through an HTTP endpoint that accepts venture_id from a less-trusted or '
    + 'end-user caller using a service-role (RLS-bypassing) client, that endpoint — not this '
    + 'library code — would need its own authorization check that the caller owns/may see the '
    + 'requested venture_id, since the service_role_all_daily_rollups policy (USING true) grants no '
    + 'venture-scoping of its own once that client is in play. No such endpoint exists in this '
    + 'commit; flagged for the record per the review scope\'s explicit ask about "if this were ever '
    + 'exposed to a less-trusted caller."',

  'PASS — CLI argument handling (scripts/cpa-gauge-cli.mjs:50-56 main()) takes ventureId/platform '
    + 'as raw process.argv values (line 51: `const [ventureId, platform] = argv;`) and passes them '
    + 'unmodified into queryCpaGaugeForChannel -> .eq(\'venture_id\', ventureId).eq(\'platform\', '
    + 'platform) (lines 38-39). This is safe regardless of argv content: Supabase-js .eq() never '
    + 'builds a SQL string from these values, it serializes them as PostgREST filter parameters. A '
    + 'malformed venture_id (non-UUID) or unexpected platform string produces either zero matching '
    + 'rows or a Postgres type-cast error surfaced as `error.message`, which the existing fail-'
    + 'closed path already handles (line 42-44: returns state=no_writer_yet with the error message, '
    + 'never throws, never executes arbitrary SQL). No shell invocation, no eval, no dynamic '
    + 'require/import of caller-controlled paths anywhere in this file — confirmed by full read of '
    + 'all 69 lines.',

  'PASS — no secrets, credentials, or PII are logged or exposed. scripts/cpa-gauge-cli.mjs\'s only '
    + 'output is `console.log(JSON.stringify(result, null, 2))` (line 59), where `result` is built '
    + 'at queryCpaGaugeForChannel\'s return (line 47: `{ venture_id, platform, ...gauge }`) — venture_'
    + 'id/platform are the operator\'s own input echoed back, and `gauge` (from computeCpaGaugeState, '
    + 'cpa-gauge.mjs:31-59) contains only `state`, `value_cents_per_conversion` (an aggregate ratio, '
    + 'not a row), and a `reason` string built from SUM(spend_cents)/SUM(conversions) totals '
    + '(cpa-gauge.mjs:56-57) — no row-level daily_rollups data (content_id, variant_id, per-row '
    + 'timestamps) is ever selected (the .select(\'spend_cents, conversions\') projection at '
    + 'cpa-gauge-cli.mjs:37 and venture-activation-gate.js:209 excludes them) or printed. '
    + 'SUPABASE_SERVICE_ROLE_KEY (cpa-gauge-cli.mjs:57) is read from process.env and passed directly '
    + 'into createClient() — never interpolated into a log line, error message, or the JSON output.',

  'PASS — zero new outreach-capable code, confirmed independently rather than trusting the commit '
    + 'message. Full read of lib/telemetry/cpa-gauge.mjs (62 lines: pure arithmetic over a '
    + 'caller-supplied array, zero imports, zero I/O) and scripts/cpa-gauge-cli.mjs (69 lines: '
    + 'imports are dotenv/config, @supabase/supabase-js, node:url, cpa-gauge.mjs, and '
    + 'venture-activation-gate.js only) shows no fetch/axios/nodemailer/twilio/webhook/SMTP/child_'
    + 'process call anywhere. Independently re-ran the grep rather than trusting the prior '
    + 'TESTING-sub-agent evidence\'s claim of the same result: `git diff HEAD~1 HEAD -- '
    + 'lib/telemetry/cpa-gauge.mjs lib/marketing/venture-activation-gate.js scripts/cpa-gauge-cli.mjs '
    + '| grep -iE "send|contact|webhook|fetch\\(|http(s)?://|smtp|twilio|sendgrid|axios|mailto|'
    + 'child_process|exec\\(|eval\\("` returned zero matches (grep exit code 1). The only outbound '
    + 'call anywhere in the three files is the Supabase client\'s own HTTPS transport to the '
    + 'project\'s own database — not a new outbound capability, and not caller-directed (the '
    + 'Supabase URL comes from NEXT_PUBLIC_SUPABASE_URL, not from any argument this code accepts).',
];

const SUMMARY = 'SECURITY EXEC-TO-PLAN verdict: PASS. Independently reviewed the actual committed '
  + 'diff (not the PRD/commit-message description) for lib/telemetry/cpa-gauge.mjs, '
  + 'lib/marketing/venture-activation-gate.js, and scripts/cpa-gauge-cli.mjs. All daily_rollups '
  + 'queries use the Supabase-js query builder exclusively (.eq()/.gte(), no raw SQL, no string '
  + 'interpolation) — no injection surface. daily_rollups RLS (ENABLEd, service_role bypass policy '
  + 'USING true + an authenticated per-venture SELECT policy) is neither weakened nor bypassed by '
  + 'this diff; the new resolveCpaRung()/queryCpaGaugeForChannel() require the caller to inject a '
  + 'supabase client, exactly matching the pre-existing resolvePaidRung pattern, and only the CLI '
  + 'instantiates one directly (service-role key, matching sibling CLI scripts). CLI argv values '
  + '(ventureId, platform) flow only into parameterized .eq() filters, never into a raw query, so '
  + 'arbitrary argv content cannot produce SQL injection — worst case is zero rows or a typed '
  + 'Postgres cast error, already handled by the fail-closed no_writer_yet path. No secrets, '
  + 'credentials, or row-level PII are logged; the CLI prints only venture_id/platform (echoed '
  + 'input) plus a spend/conversions aggregate ratio. No new outreach-capable code (send/contact/'
  + 'webhook/fetch/SMTP/etc.) exists anywhere in the diff, confirmed by an independent grep against '
  + 'the actual committed files. One ADVISORY (non-blocking) finding recorded: resolveCpaRung/'
  + 'queryCpaGaugeForChannel trust the caller-supplied venture_id with no independent ownership '
  + 'check — safe today because the only callers are operator-invoked tests/scripts/CLI with a '
  + 'service-role client, but any future HTTP-facing exposure of this code to a less-trusted caller '
  + 'would need its own authorization check at that call site, not inside this library.';

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const supabase = await getSupabaseClient();

  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (prdErr) {
    console.error('PRD_READ_FAILED', prdErr.message);
    process.exit(1);
  }

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: [
      'ADVISORY, non-blocking: if a future SD exposes computeActivationVerdict/resolveCpaRung '
        + 'through an HTTP endpoint reachable by a less-trusted caller, add an explicit authorization '
        + 'check there (caller owns/may view venture_id) before calling into this library with a '
        + 'service-role client — the library itself performs no such check, matching resolvePaidRung\'s '
        + 'existing contract.',
    ],
    validation_mode: 'retrospective',
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/security-review-need-able-continually-001-exec-to-plan.mjs',
      assessment_type: 'independent_post_implementation_security_review',
      prd_id: prd?.id ?? PRD_ID,
      commit_verified: COMMIT_SHA,
      files_read: [
        'lib/telemetry/cpa-gauge.mjs',
        'lib/marketing/venture-activation-gate.js',
        'scripts/cpa-gauge-cli.mjs',
        'database/migrations/20260214_marketing_engine_foundation.sql',
        'tests/unit/query-cpa-gauge.test.js',
        'tests/unit/marketing/venture-activation-gate.test.js (diff)',
        'tests/unit/telemetry/cpa-gauge.test.js',
      ],
      checks_performed: {
        sql_injection: 'PASS — Supabase query builder only, no raw SQL / string interpolation',
        rls_bypass_or_weakening: 'PASS — no policy altered/dropped; new code follows the pre-existing caller-injects-client pattern (resolvePaidRung precedent)',
        cli_argument_injection: 'PASS — argv values flow only into parameterized .eq() filters',
        secrets_pii_exposure: 'PASS — only aggregate spend/conversions ratio + echoed input logged',
        outreach_capability: 'PASS — zero send/contact/webhook/fetch/smtp/twilio/axios/mailto matches on independent re-grep',
      },
      advisory_findings: [
        'cross-venture read scoping relies entirely on caller-supplied venture_id with no in-library ownership check — same as pre-existing resolvePaidRung; watch-item for any future HTTP-facing exposure',
      ],
      outreach_grep_result: 'zero matches (exit 1) for send|contact|webhook|fetch\\(|http(s)?://|smtp|twilio|sendgrid|axios|mailto|child_process|exec\\(|eval\\( against the actual committed diff',
    },
  };

  const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, {
    phase: 'EXEC_TO_PLAN',
  });

  // A success return is not persistence — read the row back.
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nSECURITY evidence recorded and read back:');
  console.log(`  id              ${data.id}`);
  console.log(`  code            ${data.sub_agent_code}`);
  console.log(`  phase           ${data.phase}`);
  console.log(`  verdict         ${data.verdict}`);
  console.log(`  confidence      ${data.confidence}`);
  console.log(`  validation_mode ${data.validation_mode}`);
  console.log(`  created_at      ${data.created_at}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
