import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001';

const testing = {
  verdict: 'CONDITIONAL_PASS', confidence: 87,
  summary:
    'Seven scenarios across a revoke whose acceptance is genuinely two-sided. The POSITIVE half is '
    + 'load-bearing here in a way it usually is not: this is the live fleet coordination bus, so a '
    + 'revoke that silences it is worse than the exposure it closes. Three conditions into EXEC.',
  findings: [
    { id: 'the-positive-half-is-the-one-that-can-actually-hurt', severity: 'critical', note: 'TS-3 and TS-4 matter more than TS-2. Proving TRUNCATE is refused is easy and reassuring; proving the bus STILL CARRIES TRAFFIC after four grants are revoked is what prevents converting a confidentiality/integrity exposure into a fleet-wide availability outage on a table holding 5254 rows and the enforcement kill-switch sentinel. TS-5 requires both halves in ONE invocation precisely because splitting them across runs is how a green refusal ships next to a dead bus.' },
    { id: 'scope-expanded-to-four-grants-so-coverage-must-expand-with-it', severity: 'critical', note: 'The revoke now covers TRUNCATE + DELETE + INSERT + UPDATE on authenticated (coordinator 323019d9 — an earlier draft unbundled the latter three and that was the weaker call). Wider revoke means wider blast radius for a single chairman apply, so the positive half cannot test only the path TRUNCATE touched. Every RLS-permitted operation for each role must be exercised, and the _DOWN must restore exactly those four grants rather than blanket re-granting.' },
    { id: 'the-live-table-must-never-be-the-test-subject', severity: 'critical', note: 'TR-3. A TRUNCATE acceptance test against a 5254-row live fleet-control bus is not an acceptable blast radius. Transaction-wrapped or against a scratch table mirroring the grant posture, with a row-count assertion before and after. A test that proves the guard works by destroying the thing it guards has not proven anything worth having.' },
    { id: 'staged-not-applied-is-itself-a-testable-assertion', severity: 'warning', note: 'TS-6 asserts the live posture is UNCHANGED at merge time — authenticated still holding all four grants — which is only true if the builder staged rather than applied. That inverts the usual shape: the passing condition is that the fix has NOT taken effect yet. Worth stating loudly, because a reviewer skimming for green may read an unchanged posture as a failed migration.' },
    { id: 'ts7-guards-against-a-rival-migration', severity: 'warning', note: 'Exactly ONE new staged file may come from this SD. database/chairman-gated/20260803_session_coordination_scope_anon_reads.sql (from the COMPLETED BUS-ACCESS-001) must be referenced, not duplicated or superseded. Two staged migrations against one object merge clean and then mutually revert — a failure that only appears at apply time, by which point both authors are gone.' },
    { id: 'the-drift-resolution-is-scoped-out-and-that-is-a-testable-claim-too', severity: 'info', note: 'FR-3 records the file-vs-live drift with four named verifications and explicitly does NOT resolve it. The reason is substantive rather than convenient: the live shape is disputed between two captures (git says FOR ALL + WITH CHECK, the 2026-08-02 capture and my own read say SELECT-only), and reauthoring from the wrong one restores the wrong grant. Settling it belongs with the pre-apply capture the existing staged file already demands. Stated as out-of-scope, not implied by silence.' },
    { id: 'coverage-boundary-no-anon-role-execution-here-either', severity: 'info', note: 'As with the prior SD, acceptance runs as service_role/postgres against grant posture and scratch fixtures. Nothing here executes AS the authenticated or anon role, so the refusal is asserted via grant posture and privilege errors rather than a true role-switched attempt. Named as a boundary rather than papered over; the anon-role harness ask remains open fleet-wide.' },
  ],
  metadata: {
    scenarios: 7, two_sided_pairs: 1, grants_revoked: 4, ddl_applied: 0,
    conditions: 3, live_table_rows_at_risk: 0,
    mechanism_verifications: [
      { verified_by: 'the grant posture that the revoke targets', verified_at: 'information_schema.role_table_grants, session_coordination: authenticated = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE; anon = REFERENCES,SELECT,TRIGGER' },
      { verified_by: 'why RLS cannot cover the gap', verified_at: "pg_policy on public.session_coordination: exactly 1 policy, polcmd='r' (SELECT), polroles=PUBLIC — no policy covers INSERT/UPDATE/DELETE, and TRUNCATE is not RLS-checked at all" },
      { verified_by: 'the object the acceptance must not damage', verified_at: 'select count(*) from public.session_coordination = 5254 rows at LEAD measurement' },
      { verified_by: 'the pre-existing staged file that must not be duplicated', verified_at: 'database/chairman-gated/20260803_session_coordination_scope_anon_reads.sql on origin/main, header cites SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-1 (that SD is COMPLETED, claim-free)' },
    ],
  },
  execution_time_ms: 660000,
};

const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(testing, res);
const s = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, testing, { phase: 'PLAN' });
console.log('STORED TESTING/PLAN id=' + (s && s.id));
