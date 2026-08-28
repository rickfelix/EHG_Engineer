/**
 * SECURITY (Chief Security Architect) EXEC-TO-PLAN review evidence for
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C.
 *
 * Every material claim below was MEASURED against the live ehg database (pg_policies /
 * pg_constraint / information_schema, plus a rollback-wrapped cross-tenant RLS probe), not
 * read off the migration file. Probes retained at .artifacts-sec-probe-cavs{1..7}.mjs.
 */
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Live-verified against the applied schema, not the migration file. The RLS policy cavs_venture_access is correctly '
    + 'scoped ON THE AXIS IT CONSTRAINS (creative_asset_id -> creative_assets.venture_id -> ventures.company_id -> '
    + 'user_company_access.user_id = auth.uid()), anon is fully denied (grants exist per the Supabase schema-wide default but '
    + 'NO policy targets anon or public, so RLS denies all), and the injection surface is ZERO (measured: every hostile '
    + '--venture value is percent-encoded by postgrest-js into a single eq. query param; the filter-smuggling shape '
    + '"abc&creative_assets.venture_id=neq.null" serializes to eq.abc%26...%3Dneq.null, so no second filter can be injected). '
    + 'CONDITIONAL on ONE measured cross-tenant defect (S1): the policy USING clause references creative_asset_id ONLY and '
    + 'never variant_id, and with_check is NULL (so INSERT/UPDATE fall back to that same USING). Proven live in a '
    + 'rollback-wrapped transaction: an authenticated user scoped to company A, who provably CANNOT read company B\'s variant '
    + '(0 rows), nonetheless successfully INSERTed a bridge row (assetA -> variantB) — FK referential-integrity checks run as '
    + 'the table owner and bypass RLS. Because creative_asset_variant_scores_variant_id_fkey is NO ACTION, that planted row '
    + 'then BLOCKED deletion of company B\'s variant with SQLSTATE 23503, and company B could not see the blocking row (0 rows) '
    + 'to remove it. This is a genuine cross-tenant denial-of-deletion / right-to-erasure vector, and it is DISTINCT from the '
    + 'already-documented FR-9 same-tenant cascade gap. It is LATENT today: creative_assets=0, marketing_content_variants=0, '
    + 'daily_rollups=0, creative_asset_variant_scores=0 rows, and a repo-wide grep finds NO INSERT into the table in any '
    + 'product code path — it becomes live the moment the first writer ships. Not a FAIL: nothing is exploitable now, the '
    + 'designed axis is correct, and the service-role CLI is not a confused deputy.',
  findings: [
    'S1 (MEDIUM, cross-tenant, MEASURED, currently latent) — cavs_venture_access leaves variant_id entirely unconstrained. '
    + 'Live pg_policies qual: "creative_asset_id IN (SELECT ca.id FROM creative_assets ca WHERE ca.venture_id IN (...))" — the '
    + 'string variant_id does not appear. with_check is NULL, so PostgreSQL reuses that USING expression as the INSERT/UPDATE '
    + 'check. Measured in a rolled-back transaction (.artifacts-sec-probe-cavs4.mjs): attacker scoped to company A read '
    + 'company B\'s variant => 0 rows (RLS hides it); attacker INSERT (assetA, variantB) => ACCEPTED; a user with no company '
    + 'access querying that row => 0 rows (victim cannot see the blocker); DELETE of variantB => BLOCKED, 23503, '
    + '"violates foreign key constraint creative_asset_variant_scores_variant_id_fkey". Cascade chain measured: ventures '
    + '--CASCADE--> marketing_content --CASCADE--> marketing_content_variants --NO ACTION--> creative_asset_variant_scores, so '
    + 'the block also aborts delete_venture() for the victim venture (delete_venture() contains zero references to '
    + 'creative_asset*, verified via pg_get_functiondef position() = 0, so it cannot self-heal; its EXCEPTION WHEN OTHERS '
    + 'handler converts the 23503 into {success:false} rather than raising). Exploitation requires knowing a target variant '
    + 'UUID (v4, unguessable), which is what holds this at MEDIUM rather than HIGH. Mitigating: the FR-8 retention policy '
    + 'archives+deletes at hotDays=90, bounding the denial window — but 90 days exceeds a 30-day statutory erasure clock. '
    + 'FIX: add a second leg to the policy constraining variant_id to variants reachable from the same venture, e.g. '
    + 'AND variant_id IN (SELECT mcv.id FROM marketing_content_variants mcv JOIN marketing_content mc ON mc.id = mcv.content_id '
    + 'WHERE mc.venture_id IN (SELECT ca.venture_id FROM creative_assets ca WHERE ca.id = creative_asset_id)). Note this must '
    + 'be added WITHOUT an ON DELETE clause to preserve the TIER-1 classification the SD depends on.',

    'S2 (LOW, design/trust-boundary) — cavs_venture_access is FOR ALL (not SELECT), so every authenticated member of a '
    + 'company holds INSERT/UPDATE/DELETE on the substrate that decides which variants reach the chairman taste-gate. The two '
    + 'sibling tables this bridge reads are deliberately narrower: marketing_content_variants and daily_rollups both expose '
    + 'only cmd=SELECT to authenticated (verified live). The table also has NO provenance: metadata jsonb defaults {}, there '
    + 'is no created_by column, and pg_trigger shows zero non-internal triggers, so pool-stuffing would leave no audit trail. '
    + 'This mirrors creative_assets_venture_access (which is also FOR ALL), so it is a consistent choice rather than an '
    + 'oversight — but for a chairman DECISION-SUPPORT surface it deserves an explicit accept-or-narrow, not silent inheritance.',

    'S3 (LOW, state conflation in a security-gated surface) — a malformed --venture is rendered as a taste-gate exclusion. '
    + 'Measured live: `--venture "not-a-uuid\' OR 1=1--"` prints "Excluded from scoring: taste-gate not cleared (reason: '
    + 'product_review_not_approved) [gate_excluded]" plus "-> Chairman action: review/approve at S23", which is BYTE-IDENTICAL '
    + 'to the output for a well-formed but unapproved venture (`--venture 1111...`). Root cause is asset-view-gate.js:84, '
    + '`if (reviewError || !latestReview || latestReview.status !== \'approved\')`, which folds a genuine query error (here a '
    + 'PostgREST 400 invalid-uuid) into the same reason token as "no approval row". That file is explicitly NOT modified by '
    + 'this SD and its fail-closed direction is correct, so the in-scope fix belongs in the CLI: validate the argv value '
    + 'against a UUID regex before calling selectAssetVariant and render a distinct invalid_input state. This matters because '
    + 'state-honesty is this CLI\'s own stated reason to exist (G2/G6: "never collapsing them into a silent empty table") — a '
    + 'typo currently produces actively misleading chairman guidance. Fails closed, so not a vulnerability.',

    'S4 (INFO, reuse hazard, not a defect here) — the query_error path surfaces raw DB error text: '
    + 'variant-scoring-bridge.js:49/68 return `err?.message`, which renderScoringState prints verbatim. In THIS surface that '
    + 'is correct and harmless: the only consumer is a local operator CLI whose invoker already holds SUPABASE_SERVICE_ROLE_KEY '
    + '(i.e. full DB read), and the code deliberately takes .message ONLY — not the higher-leak .details/.hint fields a '
    + 'PostgrestError also carries. The hazard is downstream: selectAssetVariant is a general-purpose library function, and '
    + 'sibling SD -D\'s ehg-app UI is a second, browser-facing consumer. If that error string is ever returned in an HTTP '
    + 'response it leaks schema/relationship internals. Recommend a doc-comment on the query_error contract stating the field '
    + 'is operator-only and must be mapped to a generic message before crossing a request boundary.',

    'CLEAR — Injection / type confusion (focus areas 1 and 2). MEASURED, not assumed: probe #2 built real postgrest-js '
    + 'queries and printed the serialized URLs. Nothing is concatenated into SQL anywhere; the Supabase query builder appends '
    + 'via URLSearchParams, so `\' OR 1=1--` => eq.%27+OR+1%3D1--, `x,venture_id.neq.null` => eq.x%2Cventure_id.neq.null, and '
    + 'critically the filter-smuggling attempt `abc&creative_assets.venture_id=neq.null` => '
    + 'eq.abc%26creative_assets.venture_id%3Dneq.null (& and = both encoded, so no additional filter can be introduced). '
    + '.in() double-quotes each element (in.("a,b","c)")), and its inputs are UUIDs read back from a uuid column anyway. '
    + 'Type confusion is not reachable: process.argv values are always strings in Node, and every non-UUID string dies at the '
    + 'uuid cast. Unbounded input fails closed at the URL layer. `--venture` as the final argv token yields undefined -> the '
    + 'usage message (verified live).',

    'CLEAR — Service-role bypass (focus area 3). Not a confused deputy and no privilege escalation: anyone able to run '
    + 'scripts/eva/variant-scoring-cli.mjs must already possess SUPABASE_SERVICE_ROLE_KEY, which by itself grants full '
    + 'unrestricted read of every table (service_role has rolbypassrls=true, verified live). The caller-supplied --venture '
    + 'therefore confers nothing the invoker does not already have; the real trust boundary is custody of the key, not the '
    + 'argument. Two things make this materially better than the usual service-role CLI: (a) the S23+S24 taste-gate STILL '
    + 'ENFORCES under service_role, because checkAssetViewAuthorized is an application predicate over chairman_decisions and '
    + 'the stage-gate, not an RLS artifact — the bypass removes row filtering but not the gate; (b) the banner at line 81 '
    + 'explicitly states "bypasses RLS; NOT an RLS verification tool", which forecloses the classic "the CLI worked so RLS is '
    + 'fine" fallacy. No additional access-control check is warranted for a local operator CLI.',

    'CLEAR — FR-9 NO ACTION FKs create NO orphan/stale-permission vector (focus area 4). The concern inverts: NO ACTION '
    + 'PREVENTS orphans by construction — the FK is fully enforced, so a creative_asset_variant_scores row can never reference '
    + 'a deleted asset or variant, and there is no window in which a stale row could carry a dangling permission or leak data '
    + 'through a reused UUID. The security consequence of NO ACTION is the opposite failure mode: rows that cannot be deleted '
    + '(see S1). Note this table is the ONLY NO ACTION child of marketing_content_variants — its two siblings, daily_rollups '
    + 'and marketing_attribution, both use ON DELETE SET NULL (verified live).',

    'CLEAR — Secrets and credential handling. Pattern scan over all six changed files (JWT/eyJ, sk-, api_key, password=, '
    + 'postgres:// with inline credentials) returns zero matches. Neither variant-scoring-bridge.js nor '
    + 'variant-outcome-derivation.js nor the CLI reads process.env directly at all — credentials are resolved solely through '
    + 'the lib/supabase-client.js factory, which is the correct pattern. variant-outcome-derivation.js is a genuinely pure '
    + 'function with zero I/O and no injection surface of any kind.',

    'CLEAR — anon is fully denied. anon holds SELECT/INSERT/UPDATE/DELETE grants on this table, which reads alarming but is '
    + 'the Supabase schema-wide ALTER DEFAULT PRIVILEGES baseline — verified identical on creative_assets, daily_rollups and '
    + 'marketing_content_variants. Because RLS is enabled and NO policy targets anon or public (the only two policies target '
    + 'authenticated and service_role), anon reads and writes exactly zero rows. Correctly fail-closed.',

    'CLEAR — the FR-8 retention archive destination is locked down. mode:\'archive\' routes rows through '
    + 'scripts/retention-enforce.js into the shared retention_archive table before deletion. Verified live: retention_archive '
    + 'has RLS enabled, exactly one policy (service_role_all), and ZERO grants to anon or authenticated — so archiving these '
    + 'rows does not widen their exposure. The archived payload is low-sensitivity regardless (two UUIDs, a jsonb, a timestamp; '
    + 'no PII, no asset content).',

    'INFO (pre-existing, DB-wide, NOT this SD) — anon and authenticated hold the TRUNCATE privilege on this table, and RLS '
    + 'does not apply to TRUNCATE. This is the Supabase default-privilege baseline present on every table checked, not '
    + 'something this migration introduced, and it is not reachable through PostgREST (which exposes no TRUNCATE verb). '
    + 'Recording it so it is not mistaken for an SD-introduced gap on a later read; any remediation belongs in a DB-wide '
    + 'grant-hardening SD, not here.',

    'INFO — cavs_service_role is a no-op. service_role has rolbypassrls=true (verified live), so the policy never evaluates. '
    + 'It is harmless and matches the creative_assets_service_role convention, but it provides no protection and should not be '
    + 'cited as though it does.',
  ],
  warnings: [
    { severity: 'MEDIUM', issue: 'S1: cavs_venture_access constrains creative_asset_id only; variant_id is unconstrained and with_check is NULL, permitting a measured cross-tenant INSERT that then blocks the victim tenant\'s variant/venture deletion via a NO ACTION FK the victim cannot see.', recommendation: 'Add a variant_id leg to the policy USING clause (joining marketing_content_variants -> marketing_content -> the same venture as creative_asset_id), with NO ON DELETE clause so the file stays TIER-1. Track as a named follow-up alongside the existing FR-9 flag rather than folding into it — they are distinct defects.' },
    { severity: 'LOW', issue: 'S2: FOR ALL write access to the chairman taste-gate candidate substrate for every company member, with no created_by/provenance column and no audit trigger.', recommendation: 'Explicitly accept (documenting that it mirrors creative_assets_venture_access) or narrow authenticated to SELECT and let the writer run under service_role.' },
    { severity: 'LOW', issue: 'S3: a malformed --venture renders byte-identically to a genuine taste-gate exclusion, emitting misleading "review/approve at S23" chairman guidance for what is really a typo.', recommendation: 'Validate the argv value against a UUID regex in the CLI before calling selectAssetVariant and render a distinct invalid_input state. Do not modify asset-view-gate.js, which is out of scope and correctly fail-closed.' },
    { severity: 'INFO', issue: 'S4: query_error surfaces raw DB error text; safe in this operator CLI, a leak if reused in a request handler by sibling SD -D.', recommendation: 'Document the query_error.error contract as operator-only.' },
  ],
  conditions: [
    { action: 'S1: constrain variant_id in cavs_venture_access (or otherwise prevent cross-tenant bridge rows) before any writer to creative_asset_variant_scores ships. Latent today at 0 rows; becomes live with the first insert.', priority: 'high', blocking: false },
    { action: 'S2: record an explicit accept-or-narrow decision on FOR ALL authenticated write access to the taste-gate candidate pool.', priority: 'low', blocking: false },
    { action: 'S3: add UUID validation of the --venture argv value in the CLI so invalid input is not reported as a taste-gate exclusion.', priority: 'low', blocking: false },
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS because S1 is a measured — not theoretical — cross-tenant defect: a rollback-wrapped '
    + 'live probe showed an authenticated user scoped to company A inserting a bridge row against company B\'s variant and '
    + 'thereby blocking company B from deleting it, with the blocking row invisible to company B. CONDITIONAL_PASS rather than '
    + 'FAIL because it is entirely latent (all four involved tables hold 0 rows and no product code path inserts into this '
    + 'table), the policy is correct on the axis it was designed to constrain, injection surface is provably zero, anon is '
    + 'fully denied, secrets are clean, the archive destination is locked down, and the service-role CLI is not a confused '
    + 'deputy. Nothing here should block the EXEC-TO-PLAN handoff; S1 must not ship undocumented.',
  recommendations: [
    'Fix S1 at the policy, not in application code. A bridge-writer that carefully checks venture ownership does not help: the hole is reachable directly over PostgREST with any authenticated JWT, independent of app code.',
    'File S1 as its own follow-up rather than appending it to the FR-9 flag. FR-9 is a same-tenant operational cascade gap that fails loudly to the operator; S1 is a cross-tenant integrity defect one tenant can inflict on another. Folding them together will lose the second one.',
    'When S1 is fixed, add the regression test the current suite cannot express: an authenticated insert of (own asset, foreign variant) must be REJECTED. Note the existing tests/integration/creative-asset-variant-scores-rls.db.test.js legs A2/A3 remain unrun (TESTING D1, db tier fail-closed), so RLS still has no executed live coverage in CI — S1 was found by direct probing, which is exactly the coverage that file was meant to provide.',
    'Do not cite the CLI as evidence that RLS works — it runs under service_role. The CLI itself says so at line 81; keep that banner.',
    'Treat the anon TRUNCATE grant and the no-op cavs_service_role policy as informational only. Neither is this SD\'s to fix.',
  ],
  metadata: {
    phase_intent: 'EXEC_TO_PLAN retrospective (post-implementation) SECURITY review',
    commit_validated: 'ba7a9f222ce',
    branch: 'feat/SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C',
    database_verified_live: true,
    live_ref: 'ehg (dedlbzhpgkmetvhbkyzq)',
    probes_retained: [
      '.artifacts-sec-probe-cavs.mjs  — pg_policies/pg_constraint/grants/roles census',
      '.artifacts-sec-probe-cavs2.mjs — postgrest-js URL serialization + FK delete rules + row counts',
      '.artifacts-sec-probe-cavs3.mjs — required-column introspection for the fixture',
      '.artifacts-sec-probe-cavs4.mjs — rollback-wrapped cross-tenant RLS probe (the S1 measurement)',
      '.artifacts-sec-probe-cavs6.mjs — venture->variant cascade chain',
      '.artifacts-sec-probe-cavs7.mjs — retention_archive exposure',
    ],
    measured_policy_qual: 'creative_asset_id IN (SELECT ca.id FROM creative_assets ca WHERE ca.venture_id IN (SELECT v.id FROM ventures v WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())))',
    measured_policy_with_check: null,
    measured_policies: { cavs_venture_access: 'PERMISSIVE / {authenticated} / ALL', cavs_service_role: 'PERMISSIVE / {service_role} / ALL / qual=true (no-op, service_role has rolbypassrls)' },
    measured_fks: {
      creative_asset_id: 'REFERENCES creative_assets(id) — NO ACTION (confdeltype=a)',
      variant_id: 'REFERENCES marketing_content_variants(id) — NO ACTION (confdeltype=a)',
      cascade_chain: 'ventures --CASCADE--> creative_assets; ventures --CASCADE--> marketing_content --CASCADE--> marketing_content_variants --NO ACTION--> creative_asset_variant_scores',
      sibling_contrast: 'daily_rollups and marketing_attribution both reference marketing_content_variants ON DELETE SET NULL',
    },
    s1_probe_transcript: {
      'H0 attacker reads variantB': '0 rows (RLS hides it)',
      'H1 cross-tenant INSERT (assetA -> variantB)': 'ACCEPTED',
      'H2 victim sees blocking row': '0 rows (invisible)',
      'H2 victim DELETE variantB': 'BLOCKED 23503 creative_asset_variant_scores_variant_id_fkey',
      post_rollback: 'SECPROBE companies=0, cavs rows=0 — nothing persisted',
      simulation_caveat: 'authenticated context simulated via SET LOCAL ROLE authenticated + request.jwt.claims (auth.uid() confirmed resolving); this is the standard simulation but is NOT the PostgREST wire path',
    },
    not_measured: [
      'The PostgREST HTTP path with a real authenticated JWT (simulated at the SQL layer instead).',
      'delete_venture() end-to-end under the cross-tenant row: the rerun was blocked by the sandbox classifier, so that leg is a corollary of the measured 23503 on the variant delete plus the measured CASCADE chain, not a direct measurement.',
    ],
    exposure_today: { creative_assets: 0, marketing_content_variants: 0, daily_rollups: 0, creative_asset_variant_scores: 0, product_code_writers_to_cavs: 0 },
    injection_surface: 'NONE — measured URL serialization; no string concatenation into SQL in any changed file',
    secrets_scan: 'CLEAN — 0 matches across all 6 changed files; no direct process.env reads in the new lib/CLI code',
    files_reviewed: [
      'database/migrations/20260826_creative_asset_variant_scores.sql (+_DOWN)',
      'lib/creative/variant-scoring-bridge.js',
      'lib/marketing/ai/variant-outcome-derivation.js',
      'scripts/eva/variant-scoring-cli.mjs',
      'lib/retention/policies.js',
      'lib/creative/asset-view-gate.js (read-only, NOT modified by this SD)',
    ],
  },
};

results.detailed_analysis =
  'SECURITY (Chief Security Architect) EXEC-TO-PLAN review for ' + SD_KEY + '. '
  + results.findings.length + ' findings, persisted as text because results.findings is dropped by the storage layer.'
  + String.fromCharCode(10) + String.fromCharCode(10)
  + results.findings.map((f, i) => 'FINDING ' + (i + 1) + '/' + results.findings.length + ': ' + f).join(String.fromCharCode(10) + String.fromCharCode(10));

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, { phase: 'EXEC_TO_PLAN' });
console.log('Stored SECURITY evidence id:', stored.id);
console.log('verdict:', stored.verdict, '| confidence:', stored.confidence);
