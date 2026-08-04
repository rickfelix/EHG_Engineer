import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001';

const explore = {
  verdict: 'WARNING', confidence: 91,
  summary:
    'Grants and policies measured live before any build. Four corrections to the SD text, one of '
    + 'them material: FR-3 and FR-4 substantially overlap a migration ALREADY STAGED by another SD. '
    + 'Scope narrowed to FR-1 + FR-2 and signalled rather than quietly absorbed.',
  findings: [
    { id: 'anon-does-not-hold-truncate-the-exposure-is-authenticated-only', severity: 'critical', note: 'MEASURED via information_schema.role_table_grants on public.session_coordination: anon = REFERENCES, SELECT, TRIGGER (no TRUNCATE, no write grants of any kind); authenticated = DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. FR-1 says REVOKE ... FROM anon, authenticated — the anon half is a NO-OP. Harmless to issue, but the SD reads as though anon is an exposure on this table and it is not.' },
    { id: 'truncate-is-the-one-write-op-rls-cannot-gate', severity: 'critical', note: 'THE SHARPENED MECHANISM. RLS is ON (rowsecurity=true, force=false) with exactly ONE policy: service_role_full_access, cmd=SELECT, PERMISSIVE, roles=PUBLIC, USING true. So authenticated INSERT/UPDATE/DELETE are already DENIED by RLS — those grants are latent, not exploitable today. TRUNCATE is the single write-class operation RLS cannot gate, which is exactly why the probe saw it succeed under an RLS-blocking posture. LATENCY RISK: add any INSERT or UPDATE policy for authenticated later and the dormant grants go live in the same instant. Same safety-by-coincidence class as THREE-GAPS-APPLIED-001.' },
    { id: 'fr3-and-fr4-overlap-an-already-staged-migration', severity: 'critical', note: 'THE MATERIAL FINDING. database/chairman-gated/20260803_session_coordination_scope_anon_reads.sql already exists on main, authored under SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-1. It already scopes anon reads off the bus (FR-4 territory) and already records the file-vs-live drift as UNRECONCILED, MUST BE SETTLED AT THE PRE-APPLY CAPTURE (FR-3 territory). Authoring a second staged migration against the same object is the mutually-reverting-DDL trap. Scope narrowed and routed as spec-conflict/high rather than absorbed.' },
    { id: 'fr3-cites-a-path-that-does-not-exist', severity: 'warning', note: 'There is no database/migrations/20260309_session_coordination.sql. The real file is supabase/ehg_engineer/migrations/20260309_session_coordination.sql:67-70. Verified independently: the file ships CREATE POLICY service_role_full_access ... FOR ALL USING(true) WITH CHECK(true); live is SELECT-only with NO WITH CHECK. The DRIFT IS REAL — only the citation is misfiled. A migration file is a lead, never proof of a live object, and here the lead pointed at the wrong shelf.' },
    { id: 'the-real-root-cause-generalises-repo-wide-and-is-not-mine', severity: 'critical', note: 'CREDIT TO THE STAGED FILE HEADER, not to this SD. Its author first blamed a misleading policy NAME and then corrected themselves: the name service_role_full_access states the intent accurately; the defect is the OMITTED TO service_role CLAUSE. A CREATE POLICY with no TO clause defaults to PUBLIC. That means EVERY CREATE POLICY in this repo lacking an explicit TO is silently public — a far better thing to sweep for than a naming convention, and worth its own SD.' },
    { id: 'a-revoke-that-breaks-the-bus-is-worse-than-the-exposure', severity: 'warning', note: 'FR-2 requires both halves in one suite and the second half is the load-bearing one: after the revoke, every RLS-permitted operation for each role must STILL SUCCEED. session_coordination is the live fleet coordination bus carrying 5254 rows including control primitives; a revoke that silences it converts a confidentiality/integrity exposure into an availability outage. Acceptance must exercise the legitimate send/read paths, not only the refusal.' },
    { id: 'fr4-carries-forward-the-coupling-from-the-prior-sd', severity: 'info', note: 'FR-4 explicitly notes that the feedback rate-limit counting subquery runs under the inserting role SELECT RLS, so any SELECT narrowing anywhere must be checked for counting subqueries that would silently change meaning. That is the fails-open class characterised in SD-LEO-INFRA-THREE-GAPS-APPLIED-001 hours earlier, and the anon-reads narrowing IS a SELECT narrowing — so it needs that check before apply. The instrument is already on main: lib/policy/severity-pair-coupling.js + scripts/severity-pair-divergence-fence.mjs.' },
  ],
  metadata: {
    phase_intent: 'LEAD groundwork — measure grants/policies before encoding',
    corrections_to_sd_text: 4, scope_narrowed: true, ddl_applied: 0, reads_only: true,
    mechanism_verifications: [
      { verified_by: 'anon holds no TRUNCATE and no write grants', verified_at: 'information_schema.role_table_grants, table_name=session_coordination: anon = REFERENCES,SELECT,TRIGGER' },
      { verified_by: 'authenticated holds TRUNCATE', verified_at: 'same query: authenticated = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE' },
      { verified_by: 'only one policy exists and it is PUBLIC SELECT, so non-SELECT writes are RLS-denied', verified_at: "pg_policy on public.session_coordination: 1 row, polname=service_role_full_access, polcmd='r', polpermissive=true, polroles=PUBLIC, qual=true" },
      { verified_by: 'the file-vs-live drift is real', verified_at: 'supabase/ehg_engineer/migrations/20260309_session_coordination.sql:67-70 = FOR ALL USING(true) WITH CHECK(true) vs live polcmd=r with null polwithcheck' },
      { verified_by: 'the overlapping migration is already staged on main', verified_at: 'database/chairman-gated/20260803_session_coordination_scope_anon_reads.sql, header cites SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-1' },
    ],
  },
  execution_time_ms: 780000,
};

const validation = {
  verdict: 'CONDITIONAL_PASS', confidence: 89,
  summary:
    'FR-1 and FR-2 are sound and genuinely uncovered. FR-3 and FR-4 duplicate staged work, so the '
    + 'SD proceeds narrowed. Two conditions: do not stage a rival file, and prove the bus survives.',
  findings: [
    { id: 'condition-do-not-author-a-rival-staged-migration', severity: 'critical', note: 'CONDITION 1. Two staged migrations against one object merge clean and then mutually revert — a known trap. FR-3/FR-4 must be satisfied by VERIFYING and RECORDING the existing staged file, not by authoring a second one. If the coordinator reports COORDINATION-BUS-ACCESS-001 stalled and asks this SD to absorb it, that is a scope change to make explicitly, not by default.' },
    { id: 'condition-the-bus-must-be-proven-alive-after-the-revoke', severity: 'critical', note: 'CONDITION 2. The acceptance half that matters is the positive one. Proving TRUNCATE is refused while never exercising the legitimate paths would ship an availability outage wearing a green test. Both halves in ONE suite, as FR-2 requires.' },
    { id: 'chairman-gate-correctly-identified', severity: 'critical', note: 'A REVOKE on a control table is a permission-class change on an applied object. Stage in database/chairman-gated/, never apply — including inside a rolled-back transaction. Read-only validation is the permitted substitute. The SD pre-flagged this at sourcing, which is the right practice.' },
    { id: 'scope-reduction-is-stated-not-absorbed', severity: 'info', note: 'The narrowing to FR-1+FR-2 was signalled as spec-conflict/high with the measurements attached, BEFORE building. A silent narrowing would have looked like under-delivery at LEAD-FINAL; a stated one is a decision the coordinator can reverse cheaply while it is still cheap.' },
  ],
  metadata: { conditions: 2, ddl_applied: 0, frs_in_scope: 2, frs_verify_only: 2 },
  execution_time_ms: 540000,
};

for (const [code, name, payload] of [['Explore', 'Codebase Explorer', explore], ['VALIDATION', 'Principal Systems Analyst', validation]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'LEAD' });
  console.log('STORED ' + code + '/LEAD id=' + (s && s.id));
}
