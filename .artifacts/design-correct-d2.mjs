#!/usr/bin/env node
/**
 * SELF-CORRECTION to the DESIGN evidence row for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001.
 *
 * D-2 as originally recorded asserted an auto-apply risk that DOES NOT EXIST. It was derived
 * from database/chairman-gated/README.md, which is stale. Refuted by execution:
 * classifyMigration() returns tier:2 for both a REVOKE and the ALTER DEFAULT PRIVILEGES stmt,
 * and the tier gate is ON (fail-closed). Corrected IN PLACE so there is exactly one door --
 * a correction that lands on one access path while another keeps serving stale is the failure
 * mode this SD is about.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const ROW_ID = '3d601cd4-b546-4b1b-a728-6114d819615b';

const { data: row, error: readErr } = await supabase
  .from('sub_agent_execution_results').select('*').eq('id', ROW_ID).single();
if (readErr) { console.error('read failed', readErr); process.exit(1); }

const findings = [...row.metadata.findings];

// ── D-2: REFUTED and rewritten ───────────────────────────────────────────────
const i2 = findings.findIndex((f) => f.id === 'D-2');
findings[i2] = {
  id: 'D-2',
  severity: 'LOW',
  title: 'CORRECTED (was HIGH, now LOW): the auto-apply risk I asserted DOES NOT EXIST. A REVOKE migration cannot auto-apply. What survives is a positive, non-risk reason to use database/chairman-gated/.',
  detail: "AS ORIGINALLY RECORDED, D-2 claimed that placing this SD's migration in database/migrations/ (following its predecessor 20260728_revoke_public_execute_role_flag_rpcs.sql, commit 13d02e18d81) would let BaseExecutor auto-apply it and silently defeat the CHAIRMAN GATE. THAT CLAIM IS FALSE. I sourced it from database/chairman-gated/README.md, which describes the tier gate as 'computed and logged but changes NOTHING' unless a flag reads the literal 'on'. That README is STALE -- it describes the RETIRED env-var polarity (process.env.LEO_MIGRATION_TIER_GATE, which per the live flag's own gates_what field 'failed OPEN on an absent variable and diverged across worktrees'). REFUTED BY EXECUTION, not by re-reading: (1) scripts/lib/migration-tier-classifier.mjs:44 FORBIDDEN_TOPLEVEL explicitly lists GRANT and REVOKE among 'top-level destructive / permission-altering / non-additive verbs'; (2) running classifyMigration() directly returns {tier:2, reason:'unrecognized_or_unsafe_statement'} for 'REVOKE EXECUTE ON FUNCTION public.fn_x(uuid) FROM PUBLIC, anon, authenticated;' and {tier:2, reason:'multiple_commands_in_statement'} for the ALTER DEFAULT PRIVILEGES statement; (3) tierGateEnabled() returns TRUE (gate ON) -- the flag LEO_MIGRATION_TIER_GATE_BYPASS has is_enabled=false / lifecycle_state=disabled and has INVERTED polarity by design, so enabled=false means NO bypass, and the evaluator fails CLOSED on every indeterminate read (DB unreachable, evaluation_error, flag_not_found, kill_switch_active, lifecycle_draft), with a break-glass env var that can only STRENGTHEN it. TIER-2 therefore defers to the unchanged 3-factor @approved-by chairman gate. The predecessor's placement in database/migrations/ was safe, and so would this SD's be.",
  action: "WHAT SURVIVES, as a positive reason rather than a risk mitigation: still place the migration in database/chairman-gated/, because that is where the co-location conventions this SD needs already live -- the paired _DOWN.sql required by correction C7 (precedents: 20260804_session_coordination_revoke_authenticated_writes_DOWN.sql, 20260804_ai_quality_tuning_symmetric_guards_DOWN.sql, 20260807_belt_capacity_verdicts_DOWN.sql) and the <migration>_acceptance.mjs verification artifact of D-7. Choose it for convention and co-location, NOT because database/migrations/ would auto-apply -- it would not. Downgraded HIGH -> LOW: this is now a placement preference, not a safety defect. NOTE for PLAN: D-3's requirement that the standing check scan database/chairman-gated/ is UNAFFECTED by this correction and still holds -- see D-3 and D-12.",
};

// ── D-12: new finding, the stale README ──────────────────────────────────────
findings.push({
  id: 'D-12',
  severity: 'MEDIUM',
  title: 'database/chairman-gated/README.md describes an ACTIVE, fail-closed security control as inert. Demonstrated load-bearing: it produced a false HIGH finding in this very review.',
  detail: "The README states the TIER-2 default-deny classifier 'is controlled by the LEO_MIGRATION_TIER_GATE_BYPASS flag in leo_feature_flags, and tierGateEnabled() returns true only for the literal string on. With the gate off the classification is computed and logged but, in the code's own words, changes NOTHING.' Every clause of that is now wrong. The live control (scripts/modules/handoff/pre-checks/pending-migrations-check.js:121 tierGateEnabled) has INVERTED polarity: the flag is a BYPASS, is_enabled=false, and false -- including every indeterminate read -- means the gate is ON. It fails closed on an unreadable flag and has a break-glass env var that can only force it ON. So the README tells the reader a working security boundary is inert. This is not a hypothetical documentation nit: it misled THIS DESIGN pass into recording a HIGH-severity finding (original D-2) asserting an auto-apply risk that does not exist, within an hour of reading it. The two failure modes it produces are symmetric and both bad -- a reader either over-engineers around a phantom risk (what I did) or, having been told the control is inert, stops trusting a control that actually works and routes around it.",
  action: "Flag to PLAN as an incidental finding for the durable feedback channel (not scope for this SD): database/chairman-gated/README.md needs its tier-gate paragraph rewritten to the current inverted-polarity, fail-closed behaviour, with the pending-migrations-check.js:778 line reference re-pinned (the scanned-directory list has since moved to lines 800-802 and is duplicated at line 896 -- pin by content, not by line number, per the repo's own source-pin convention). The auto-applied directory set itself is UNCHANGED and was verified live: ['database/migrations','database/manual-updates','supabase/migrations'] at pending-migrations-check.js:800-802, with database/chairman-gated absent from the file entirely -- so the README's core claim (this directory is outside the auto-applied set) still holds; only its account of the tier gate is stale.",
});

// ── derived fields ───────────────────────────────────────────────────────────
const bySev = (s) => findings.filter((f) => f.severity === s);
const criticalIssues = bySev('HIGH').map((f) => `${f.id}: ${f.title}`);

const conditions = [
  "PRD-REQUIRED (D-3): the standing check scans {database/migrations, database/manual-updates, supabase/migrations, database/chairman-gated}. A guard scoped to database/migrations/ alone cannot see database/chairman-gated/, where D-2 still places this SD's own migration. Unaffected by the D-2 severity correction.",
  'PRD-REQUIRED (D-4): the verifier renders decomposed proacl (direct PUBLIC / anon / authenticated) alongside effective has_function_privilege, with the cause annotated inline. Effective-only output cannot prove or disprove C1.',
  'PRD-REQUIRED (D-5): the verifier iterates the live catalog, not the declared bucket list, and emits UNDECLARED and ABSENT verdicts. Declared-list iteration reads green while newly-added functions sit exposed.',
  'PRD-REQUIRED (D-8): REGRESSED (lost authenticated) stays a distinct verdict from EXPOSED (has anon), and input provenance renders adjacent to the verdict, not above it.',
  'PRD-REQUIRED (D-1): record the CORRECTED reason for building no UI (the existing /security surface is demo-grade with no privilege axis and a 404ing endpoint), not LEAD Q7\'s "no data output a user would view".',
  'EXEC-VERIFY (D-6): the --ceremony artifact prints every count with its member list, including the already-closed population by name and the C6 reversal flags, stamped with MEASUREMENT time and a re-verify instruction.',
  'EXEC-VERIFY (D-10): the guard carries the revoke_omits_public class, not only secdef_no_revoke, plus allowlist_entry_missing_reason as a build failure.',
  'PLACEMENT (D-2, corrected): place migration + _DOWN.sql + acceptance script in database/chairman-gated/ for co-location with the _DOWN/_acceptance conventions -- NOT because database/migrations/ would auto-apply. It would not: REVOKE and ALTER DEFAULT PRIVILEGES both classify TIER-2 and the tier gate is ON (fail-closed).',
  'INCIDENTAL, OUT OF SCOPE (D-12): database/chairman-gated/README.md describes the active fail-closed tier gate as inert. Route to the durable feedback channel; it produced a false HIGH finding in this review.',
];

const detailedAnalysis = [
  'PLAN-phase DESIGN review for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001. This is a pure database-security SD with no end-user feature, so the classic DESIGN scope (wireframes, component sizing, WCAG) does not apply. The review was reframed to the three questions actually posed: (1) independently verify the no-UI finding, (2) design the verification tooling\'s reporting format, (3) design the CI standing check\'s failure presentation.',
  '',
  'VERDICT: CONDITIONAL_PASS. The SD\'s no-UI posture is correct and is CONFIRMED (C-1). But LEAD\'s stated REASON for it is factually wrong (D-1), and there are four HIGH-severity design defects in how the deliverables are shaped and scoped -- D-1, D-3, D-4, D-5 -- that would each have shipped an artifact that reads correct and is not.',
  '',
  'THIS ROW HAS BEEN CORRECTED IN PLACE. As first written it carried a FIFTH HIGH finding (D-2) asserting that placing the migration in database/migrations/ would let the handoff pipeline auto-apply it and defeat the chairman gate. That was FALSE and is now recorded as REFUTED at LOW severity, with the refuting measurement attached. I had sourced it from database/chairman-gated/README.md and repeated the README\'s account of the tier gate without executing anything. Running scripts/lib/migration-tier-classifier.mjs directly returns tier:2 for both a REVOKE statement and the ALTER DEFAULT PRIVILEGES statement, and the tier gate is ON with inverted, fail-closed polarity -- so this migration cannot auto-apply from any directory. Corrected in place rather than by appending a second row, so there is exactly one door: a correction that lands on one access path while another keeps serving the stale claim is the failure mode this SD is about. The stale README is now its own finding, D-12.',
  '',
  'THE THROUGH-LINE. The surviving HIGH findings are one failure at different layers: an instrument that cannot observe the thing it certifies.',
  '  - D-4: a report built on has_function_privilege alone cannot distinguish a working REVOKE from the C1 no-op, because that predicate collapses direct grants and PUBLIC inheritance.',
  '  - D-5: a report that walks the declared 42 rather than the live catalog cannot express the UNDECLARED and ABSENT populations, and C5/C9 both establish those are non-empty.',
  '  - D-3: a guard scoped to database/migrations/ cannot see database/chairman-gated/, where this SD\'s own migration belongs -- a blind spot already documented in-repo by an SD that hit it.',
  '  - D-1: the one existing security UI cannot show a privilege fact at all, and its live endpoint 404s, so "surface it there" was never available.',
  'This SD\'s LEAD phase already caught one instance of this class (C3: the designated verifier cannot see the change being made). These are more of it, in the layer PLAN is about to author. My own refuted D-2 is a fifth instance, committed by me: I certified a risk from narration I had not executed.',
  '',
  'ON D-1 AND MY OWN ERROR, recorded rather than laundered. My first pass concluded the ehg /security page was unreachable dead code, on the reasoning that app/*/page.tsx is a Next.js App Router convention and ehg is a Vite app (12 such pages exist, and Vite has no file-based routing from app/). That was wrong: src/routes/featureRoutes.tsx:95 lazy-imports it and line 259 registers it as a protected route. I found this by falsifying my own conclusion rather than by the original sweep -- the same reason LEAD\'s "no UI exists" survived. A bounded grep\'s directory scope is an assumption, and both of us made it. The corrected finding is stronger than either: the surface EXISTS, is reachable, is permission-gated -- and is demo-grade with no privilege axis and a 404ing data endpoint, which is a far better argument for not building on it than its absence would have been.',
  '',
  'ON TASK 2. The single most consequential format decision is D-4: decompose the PUBLIC axis. Everything else is presentation; that one is the difference between a report that can prove the fix and one that will read green either way. D-5 (catalog-driven, two-sided reconciliation) is second: it makes the UNDECLARED and ABSENT populations expressible at all. D-6 (--ceremony mode) makes the SD\'s own stated principle -- authorization against a verified list, not a category -- structural rather than aspirational, by refusing to print any count without its members. D-7 keeps all of it inside an existing house convention (database/chairman-gated/<migration>_acceptance.mjs) instead of inventing a reporter.',
  '',
  'ON TASK 3. The failure-message house style is well-established and consistent across scripts/lint/: file-prefixed, mechanism-stated, prior-real-instance-cited, copy-pasteable Fix: SQL, named escape hatch. The genuinely load-bearing decisions are not the message text but D-3 (scope), D-9 (--diff blocking / --all advisory, or it blocks every PR on a 137-function backlog) and D-10 (carry revoke_omits_public, the class this SD itself committed). A guard with a beautiful message and the wrong directory scope is the green check the ismainmodule workflow header warns about.',
  '',
  'EMPIRICAL BASIS. ehg route registration read directly from src/routes/featureRoutes.tsx; grant-vocabulary absence measured by grep over the four security UI files (0 hits); mock data read at ComprehensiveSecurityDashboard.tsx:71-91; the missing endpoint established by searching all 6466 tracked source files in EHG_Engineer in two chunks (I verified my grep scope existed first -- lib/dashboard/ does not, so a grep over it would have been vacuous); SECURITY DEFINER directory distribution counted over 1878 tracked .sql files; the auto-applied directory set verified in LIVE CODE at pending-migrations-check.js:800-802 (not from the README); autoExecute default confirmed at BaseExecutor.js:1007; tier classification proven by EXECUTING classifyMigration() on both statement shapes; tier gate state read live from leo_feature_flags; the chairman-gated lint blind spot read verbatim from an existing acceptance script that had already hit it; predecessor migration path and _DOWN.sql pairing confirmed via git log --diff-filter=A and git show 13d02e18d81.',
].join('\n');

const metadata = {
  ...row.metadata,
  findings,
  findings_total: findings.length,
  findings_high: bySev('HIGH').length,
  findings_medium: bySev('MEDIUM').length,
  findings_low: bySev('LOW').length,
  findings_info: bySev('INFO').length,
  plan_conditions: conditions,
  self_correction_2: {
    finding: 'D-2',
    as_recorded: 'HIGH -- placing the migration in database/migrations/ would let BaseExecutor auto-apply it, defeating the chairman gate.',
    status: 'REFUTED',
    corrected_to: 'LOW -- a REVOKE/ADP migration cannot auto-apply from any directory; chairman-gated placement is a convention preference, not a safety control.',
    refuted_by: [
      'scripts/lib/migration-tier-classifier.mjs:44 FORBIDDEN_TOPLEVEL includes GRANT and REVOKE',
      "EXECUTED classifyMigration('REVOKE EXECUTE ON FUNCTION public.fn_x(uuid) FROM PUBLIC, anon, authenticated;') -> {tier:2}",
      "EXECUTED classifyMigration('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;') -> {tier:2}",
      'leo_feature_flags.LEO_MIGRATION_TIER_GATE_BYPASS is_enabled=false, lifecycle_state=disabled, INVERTED polarity -> gate ON',
      'pending-migrations-check.js:121 tierGateEnabled() fails CLOSED on every indeterminate read; break-glass env can only force ON',
    ],
    root_cause: 'I repeated database/chairman-gated/README.md\'s account of the tier gate without executing the classifier. The README is stale (it describes the retired env-var polarity that failed OPEN). Recorded as finding D-12.',
    corrected_in_place: 'Same row updated rather than a second row appended, so no access path keeps serving the refuted claim.',
  },
  corrected_at: new Date().toISOString(),
};

const { error: updErr } = await supabase
  .from('sub_agent_execution_results')
  .update({
    critical_issues: criticalIssues,
    recommendations: conditions,
    detailed_analysis: detailedAnalysis,
    metadata,
  })
  .eq('id', ROW_ID);

if (updErr) { console.error('update failed', updErr); process.exit(1); }

console.log('=== CORRECTED ===');
console.log('row:', ROW_ID);
console.log('findings:', findings.length, '| HIGH', bySev('HIGH').length, '| MEDIUM', bySev('MEDIUM').length, '| LOW', bySev('LOW').length, '| INFO', bySev('INFO').length);
console.log('critical_issues now:');
for (const c of criticalIssues) console.log('  -', c.slice(0, 110));
