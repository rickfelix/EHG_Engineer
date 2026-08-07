import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001';

const testing = {
  verdict: 'CONDITIONAL_PASS', confidence: 86,
  summary:
    'Both FR-1 and FR-2 delivered and RUN LIVE pre-ceremony. Zero DDL applied, verified by '
    + 're-reading the posture after validation. ONE ACCEPTANCE HALF IS GENUINELY UNDEMONSTRABLE '
    + 'until the chairman applies, and it is reported as a gap rather than mocked green.',
  findings: [
    { id: 'the-truncate-refused-half-cannot-be-demonstrated-and-was-not-faked', severity: 'critical', note: 'THE HONEST GAP, and the reason this is CONDITIONAL_PASS rather than PASS. Proving TRUNCATE is refused requires either the DDL applied (forbidden — chairman-gated, and that holds even inside a rolled-back transaction) or statement execution AS the authenticated role (no harness exists; the ask is open fleet-wide and now blocks a second SD). A scratch-table mock was available and deliberately NOT built: it would demonstrate that REVOKE works in general, not that THIS revoke closed THIS path, and a green run on that mock would read as acceptance in the audit trail. The gap is post-ceremony work, named in the PRD, the retro and a completion flag.' },
    { id: 'the-positive-half-was-run-live-and-is-a-baseline-not-a-verdict', severity: 'critical', note: 'scripts/session-coordination-bus-liveness.mjs: 5/5 PASS, exit 0 — read path, write PERMITTED (BEGIN/INSERT/ROLLBACK), service_role intact, authenticated retains SELECT, rows 5310 -> 5310 unchanged. That single run proves the bus works TODAY; it does not prove the revoke is safe. What proves safety is the COMPARISON against a post-apply run. Reporting one green run as acceptance would be the same error as reading a passing pre-apply posture as a working migration.' },
    { id: 'pre-apply-is-given-its-own-exit-code-so-it-cannot-read-as-success', severity: 'critical', note: 'session-coordination-grant-posture.mjs returns 10 = STAGED_NOT_APPLIED, deliberately neither 0 nor 1, verified live. At merge time the CORRECT state is that the fix has not taken effect, which inverts the usual reading. Without a distinct code a reviewer skimming for green sees an unchanged posture and concludes either success or breakage, both wrong.' },
    { id: 'neither-deliverable-is-a-db-test-and-that-is-deliberate', severity: 'warning', note: 'The vitest `db` project is DISABLED fleet-wide (no designated non-production target), so a .db.test.js here would SKIP. A skipped test is a check that CANNOT FAIL while occupying the space where coverage should be. Both deliverables are executable scripts with real exit codes, and both were actually run. Filed as a completion flag because this silently affects every DB test in the repo, not just this SD.' },
    { id: 'ddl-validated-without-being-applied', severity: 'warning', note: 'Both staged files were executed inside SET TRANSACTION READ ONLY and both rejected with 25006. That distinguishes parses-and-is-correctly-a-WRITE from a syntax error (42601) — a stronger claim than "I did not run it". The grant posture was then re-read and still showed all seven privileges for authenticated, proving the validation applied nothing.' },
    { id: 'post-conditions-assert-the-positive-inside-the-same-transaction', severity: 'warning', note: 'The forward migration asserts, before COMMIT, that the four grants are gone AND that authenticated retains SELECT AND that service_role retains INSERT. A post-condition checking only the absence would pass happily on a silenced bus. Because they run inside the transaction, a failure rolls back rather than leaving a half-applied grant posture.' },
    { id: 'the-down-is-grant-precise-rather-than-grant-all', severity: 'info', note: 'It restores exactly TRUNCATE/DELETE/INSERT/UPDATE and refuses to re-grant REFERENCES/SELECT/TRIGGER, which the forward file never touched. GRANT ALL would hand authenticated privileges it never held and would mask rather than reverse anything else that changed meanwhile. Its header also states plainly what rolling back re-opens: an ungatable destructive path on a 5000+ row control bus.' },
    { id: 'no-rival-migration-was-authored', severity: 'info', note: 'Exactly one new staged file pair from this SD. The pre-existing 20260803_session_coordination_scope_anon_reads.sql (from the COMPLETED BUS-ACCESS-001) is referenced, not duplicated or superseded — two staged migrations against one object merge clean and then mutually revert, a failure that only appears at apply time.' },
  ],
  metadata: {
    frs_built: 2, frs_verify_only: 2, commits: 3, ddl_applied: 0, migrations_staged: 2,
    live_runs: 3, acceptance_halves_demonstrable_preceremony: 1, acceptance_halves_deferred: 1,
    mechanism_verifications: [
      { verified_by: 'the staged SQL parses and is correctly a WRITE, without being applied', verified_at: 'both files run under SET TRANSACTION READ ONLY -> rejected 25006 (not 42601 syntax)' },
      { verified_by: 'nothing was applied', verified_at: 'post-validation readback: authenticated still = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE (all 7)' },
      { verified_by: 'pre-apply is distinguishable from pass and from failure', verified_at: 'node scripts/session-coordination-grant-posture.mjs -> VERDICT STAGED_NOT_APPLIED, exit 10' },
      { verified_by: 'the bus is alive at baseline and the probe leaves nothing behind', verified_at: 'node scripts/session-coordination-bus-liveness.mjs -> 5/5 PASS exit 0, rows before=5310 after=5310' },
    ],
  },
  execution_time_ms: 1800000,
};

const security = {
  verdict: 'PASS', confidence: 88,
  summary:
    'Closes an ungatable destructive path and a latent one, with zero DDL applied by the builder '
    + 'and service_role untouched. The security-relevant judgement calls are what was NOT done: '
    + 'no over-broad revoke, no rival migration, no mocked proof.',
  findings: [
    { id: 'truncate-is-an-ungatable-destructive-path-and-that-is-the-exposure', severity: 'critical', note: 'MEASURED: authenticated holds TRUNCATE on a 5310-row fleet-control bus. TRUNCATE is not an RLS-checked operation, so the single PUBLIC SELECT policy — or any policy — cannot stop it. This is why the sourcing probe saw TRUNCATE succeed against an otherwise-blocking posture. Revoking it removes a destructive capability that no amount of policy authoring could have contained.' },
    { id: 'the-latent-grants-are-in-scope-because-their-safety-is-undeclared', severity: 'critical', note: 'DELETE/INSERT/UPDATE on authenticated are denied ONLY because no policy covers those commands — denial by absence, not by design. Adding any INSERT or UPDATE policy for authenticated makes all of them live in the same instant, and nothing would notice. I had scoped them out as a follow-on; the coordinator argued they should be in, and the argument won: their safety depends on a policy nobody has been told is load-bearing. That is a security property held up by an accident.' },
    { id: 'an-over-broad-revoke-was-declined-because-it-teaches-a-wrong-threat-model', severity: 'critical', note: 'The SD as sourced said REVOKE ... FROM anon, authenticated. anon holds NO write grants of any kind, so the anon half is a no-op that would have executed harmlessly. It was still declined and corrected in the migration file itself, because a revoke naming a role that never held the privilege teaches every future reader that anon was an exposure here. On a permission-class object the READING is part of the artifact.' },
    { id: 'the-revoke-cannot-silence-the-bus-without-tripping-its-own-post-conditions', severity: 'critical', note: 'AVAILABILITY IS THE REAL RISK OF THIS CHANGE, not confidentiality. In-transaction post-conditions assert authenticated retains SELECT and service_role retains INSERT before COMMIT, so a revoke that took the read path or the fleet write path with it rolls back instead of landing. The liveness probe independently covers the same ground pre and post ceremony.' },
    { id: 'no-ddl-applied-and-service-role-untouched', severity: 'warning', note: 'Zero migrations applied by the builder; validation was read-only and provably so (posture re-read afterwards, unchanged). service_role and postgres grants are out of scope per the Deletion Audit and are reported by the readback specifically so their being untouched is visible rather than assumed.' },
    { id: 'a-mocked-acceptance-was-available-and-refused', severity: 'warning', note: 'The TRUNCATE-refused half could have been shown green against a scratch table mirroring the grant posture. That would prove REVOKE works in general while implying THIS path is closed. On a security control, a proof that does not bind to the actual object is worse than an acknowledged gap, because it converts an open question into a false closure — the same failure class this fleet has been unwinding all session.' },
    { id: 'anon-write-grants-are-ratcheted-not-merely-reported', severity: 'info', note: 'The readback treats any write-class grant appearing for anon as a REGRESSION (exit 1), not a line in a report. anon holds none as of the 2026-08-04 measurement, and that zero is now defended rather than observed.' },
  ],
  metadata: { ddl_applied: 0, migrations_staged: 2, new_env_vars: 0, rls_changes: 0, grants_revoked_when_applied: 4, roles_touched: ['authenticated'], service_role_touched: false },
  execution_time_ms: 900000,
};

for (const [code, name, payload] of [['TESTING', 'QA Engineering Director', testing], ['SECURITY', 'Chief Security Architect', security]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'EXEC' });
  console.log('STORED ' + code + '/EXEC id=' + (s && s.id));
}
