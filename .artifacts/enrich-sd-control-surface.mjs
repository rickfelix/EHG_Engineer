import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run the grant-posture readback: node scripts/session-coordination-grant-posture.mjs (reads information_schema.role_table_grants for public.session_coordination)',
    expected_outcome: 'Prints one line per role. authenticated shows NO TRUNCATE. anon shows only REFERENCES/SELECT/TRIGGER. service_role is reported but explicitly marked OUT OF SCOPE and unchanged. Exits non-zero if any write-class grant reappears for anon or authenticated.',
  },
  {
    step_number: 2,
    instruction: 'Run the two-sided acceptance suite: npx vitest run tests/integration/session-coordination-truncate-posture.db.test.js',
    expected_outcome: 'BOTH halves green in one run: (a) a TRUNCATE attempt as authenticated is REFUSED, and (b) every RLS-permitted path still succeeds — a legitimate signal INSERT via service_role lands and is readable, and the anon SELECT path returns rows. A run where (a) passes but (b) fails is the failure this step exists to catch: a revoke that silences the bus is worse than the exposure.',
  },
  {
    step_number: 3,
    instruction: 'Confirm the staged migration was NOT applied: git status --porcelain database/chairman-gated/ and re-run step 1',
    expected_outcome: 'The staged REVOKE file exists in database/chairman-gated/ and is committed, and step 1 STILL shows authenticated holding TRUNCATE — proving the builder staged rather than applied. The posture only changes after the chairman ceremony.',
  },
];

const strategic_objectives = [
  'Remove the one write-class grant on the fleet coordination bus that RLS cannot gate: authenticated holds TRUNCATE on public.session_coordination, and TRUNCATE is not an RLS-checked operation, so the single PUBLIC SELECT policy cannot stop it.',
  'Prove the revoke does not break the bus. session_coordination carries 5254 rows including fleet-control primitives; acceptance must exercise the legitimate send/read paths, not only the refusal, because a revoke that silences coordination converts a confidentiality exposure into an availability outage.',
  'Record the anon-read posture and the file-vs-live drift against the migration ALREADY staged for them under SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001, rather than authoring a second staged file against the same object.',
];

const key_changes = [
  {
    change: 'FR-1: stage REVOKE TRUNCATE ON public.session_coordination FROM authenticated in database/chairman-gated/, with a _DOWN companion. Never applied by the builder.',
    impact: 'MEASURED: anon holds no TRUNCATE (only REFERENCES/SELECT/TRIGGER), so the SD original FROM anon, authenticated is half a no-op — the exposure is authenticated-only. authenticated INSERT/UPDATE/DELETE are already RLS-denied (no policy covers those commands), leaving TRUNCATE as the sole ungatable write path. Latency risk recorded: adding any INSERT/UPDATE policy for authenticated later makes those dormant grants live in the same instant.',
  },
  {
    change: 'FR-2: two-sided acceptance in ONE suite — TRUNCATE as authenticated REFUSED, and every RLS-permitted operation still succeeding after the revoke.',
    impact: 'The positive half is load-bearing. Proving refusal while never exercising the legitimate paths would ship an availability outage wearing a green test.',
  },
  {
    change: 'FR-3/FR-4: VERIFY and RECORD only — point at database/chairman-gated/20260803_session_coordination_scope_anon_reads.sql rather than authoring a rival migration.',
    impact: 'That file already scopes anon reads (FR-4) and already records the file-vs-live drift as UNRECONCILED, MUST BE SETTLED AT THE PRE-APPLY CAPTURE (FR-3). Two staged migrations against one object merge clean and then mutually revert. Scope narrowing signalled as spec-conflict/high before building, not absorbed silently.',
  },
  {
    change: 'Record the generalising root cause for a separate sweep: a CREATE POLICY with no TO clause defaults to PUBLIC.',
    impact: 'Credit to the staged file header, not this SD. The policy name service_role_full_access states intent accurately; the omitted TO service_role is the defect. Every CREATE POLICY in this repo lacking an explicit TO is silently public — a far larger finding than this table.',
  },
];

const mechanism_verifications = [
  {
    verified_by: 'Bravo (session e3610a71) — read the file directly on origin/main, not via the spine citation',
    verified_at: 'supabase/ehg_engineer/migrations/20260309_session_coordination.sql:67-70 — CREATE POLICY "service_role_full_access" ON session_coordination FOR ALL USING (true) WITH CHECK (true), with NO TO clause',
  },
  {
    verified_by: 'Bravo (session e3610a71) — live catalog read, confirming the drift the spine asserts',
    verified_at: "pg_policy on public.session_coordination: exactly 1 row, polname=service_role_full_access, polcmd='r' (SELECT), polpermissive=true, polroles=PUBLIC, qual=true, polwithcheck=NULL — file says FOR ALL + WITH CHECK, live says SELECT-only + no WITH CHECK",
  },
  {
    verified_by: 'Bravo (session e3610a71) — grant enumeration before any revoke, per FR-1',
    verified_at: 'information_schema.role_table_grants, table_name=session_coordination: anon = REFERENCES,SELECT,TRIGGER (no TRUNCATE); authenticated = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
  },
  {
    verified_by: 'Bravo (session e3610a71) — the SD FR-3 path citation is misfiled, corrected here',
    verified_at: 'database/migrations/20260309_session_coordination.sql does NOT exist in git ls-files; the real path is supabase/ehg_engineer/migrations/20260309_session_coordination.sql',
  },
];

const { data: sd, error: e0 } = await sb.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', KEY).single();
if (e0) { console.log('lookup failed: ' + e0.message); process.exit(1); }

const metadata = { ...(sd.metadata || {}), mechanism_verifications };

const { error } = await sb.from('strategic_directives_v2')
  .update({ smoke_test_steps, strategic_objectives, key_changes, metadata })
  .eq('sd_key', KEY);
console.log(error ? ('ERR: ' + error.message)
  : `UPDATED smoke_test_steps(${smoke_test_steps.length}) objectives(${strategic_objectives.length}) key_changes(${key_changes.length}) mechanism_verifications(${mechanism_verifications.length})`);
