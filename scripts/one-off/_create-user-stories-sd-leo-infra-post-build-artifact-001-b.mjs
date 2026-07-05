#!/usr/bin/env node
/**
 * Create user stories for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B
 * ("Artifact Walk + Verdict Table Engine", Child B of the post-build-artifact
 * reconciliation-gate orchestrator).
 *
 * One story per FR (FR-1..FR-6), framed from the perspective of the three
 * named downstream consumers of this pure-backend engine:
 *   - the venture-build pipeline operator (FR-1 enumeration correctness,
 *     FR-3 correct-repo evidence resolution) -- trusts the walk points at the
 *     right requirements and the right venture's own code;
 *   - Child C's adherence-rubric scoring + convergence loop
 *     (FR-2 binary completeness precondition, FR-5 5-way disposition with
 *     documented/undocumented deviation split) -- consumes Child B's exact
 *     output signals to decide what and how to score;
 *   - the chairman (FR-4 the "could-not-verify != built" honesty rule this SD
 *     exists to enforce, FR-6 a durable itemized verdict table, never
 *     aggregated or repurposed from an incompatible scoring table).
 *
 * acceptance_criteria objects are grounded in this PRD's own FR
 * acceptance_criteria bullets, cross-referenced against its approved
 * technical_requirements (TR-1..TR-3), test_scenarios (TS-1..TS-6), risk
 * register, and the LEAD-phase RISK/VALIDATION sub-agent findings already on
 * record for this SD (blueprint_quality_assessments rejection, is_current
 * filter direction, readDeviations() exact return shape, MarketLens
 * local_path).
 *
 * Run: node scripts/one-off/_create-user-stories-sd-leo-infra-post-build-artifact-001-b.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const SD_ID = 'a64c62bd-b42d-406d-8688-9fca3ec154ab';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B';
const PRD_ID = 'PRD-SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B';

const stories = [
  {
    n: 1,
    title: 'Enumerate a venture\'s required artifacts from the live SSOT, never the deprecated mirror',
    user_role: 'Venture-build pipeline operator (runs the artifact walk across ventures at each S19->S20 boundary)',
    user_want: "the artifact walk to enumerate a venture's required artifacts by reading venture_stages.required_artifacts directly -- never the deprecated stage_artifact_requirements mirror -- so the list I'm gating against always reflects the live, current requirement set",
    user_benefit: "I never have to wonder whether the walk is checking against a stale, deprecated copy of the requirements; when a stage's required_artifacts changes, my next walk picks it up automatically, and I trust that 100% of what's enumerated shows up in the output verdict set with no silent caps",
    story_points: 2,
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-1-1',
        scenario: 'Enumeration reads the live SSOT, not the deprecated mirror',
        given: 'venture_stages.required_artifacts is populated for all 26 stages, and stage_artifact_requirements exists only as a deprecated mirror per this SD\'s own LEAD-phase research',
        when: 'the artifact enumerator runs for a venture (e.g. MarketLens, id ecbba50e-3c98-4493-9e77-1719cf6b6f00)',
        then: 'it reads venture_stages.required_artifacts exclusively; the enumerated artifact_type list matches the live per-stage required_artifacts arrays verified against the real table, and stage_artifact_requirements is never queried'
      },
      {
        id: 'AC-1-2',
        scenario: 'No silent caps -- every enumerated item reaches the output',
        given: 'a venture with required_artifacts spanning multiple stages (potentially dozens of artifact_type entries in total)',
        when: 'the walk completes and the verdict set is produced',
        then: '100% of the enumerated artifact_type values appear as a row in the output verdict set -- none are silently dropped, truncated, or capped at an arbitrary limit'
      }
    ],
    implementation_context: `## Verification Context (FR-1)

**What to inspect:**
- \`venture_stages.required_artifacts\` -- the live SSOT (confirmed populated for all 26 stages, stage 1 \`truth_idea_brief\` through stage 26 \`growth_playbook\`, per this SD's own LEAD-phase RISK/VALIDATION findings).
- \`venture_stages.stage_artifact_requirements\` -- the DEPRECATED mirror; the enumerator must never read this table.
- Spot-check target: MarketLens (\`ecbba50e-3c98-4493-9e77-1719cf6b6f00\`) -- LEAD-phase validation already confirmed its \`venture_artifacts\` rows line up closely against \`required_artifacts\` per stage (e.g. stage 14 requires 5 \`blueprint_*\` keys and MarketLens carries exactly those 5).

**No-cap requirement:** the enumerator must not \`.limit(...)\` the required-artifacts read or the verdict-set write in a way that truncates output -- every required item for the venture must produce exactly one verdict row (cross-reference FR-5's 100%-coverage-by-count-reconciliation requirement).

**Join key:** \`venture_stages.stage_number\` corresponds to \`venture_artifacts.lifecycle_stage\` -- confirmed correct empirically via the MarketLens spot-check, but treat as a contract to verify programmatically, not assume.`
  },
  {
    n: 2,
    title: "Give Child C a strict binary completeness signal, never a partial score",
    user_role: 'Child C developer (adherence scoring + convergence loop, SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C)',
    user_want: "Child B's completeness check to return a strict binary MISSING/present signal for each required artifact_type -- filtered to venture_artifacts.is_current=true -- and never a partial numeric score, so I get an unambiguous precondition before my own rubric-scoring logic ever runs",
    user_benefit: "I never have to guess whether a completeness value from Child B means 'don't bother scoring this, it doesn't exist' versus 'score it, it's just thin' -- a firm MISSING tells my convergence loop to skip rubric scoring entirely for that item, and a stale non-current row can never masquerade as a present artifact",
    story_points: 2,
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-2-1',
        scenario: 'Zero is_current=true rows dispositions MISSING, not a partial score',
        given: 'a required artifact_type has zero venture_artifacts rows with is_current=true for this venture (whether zero rows exist at all, or only is_current=false rows exist)',
        when: 'the completeness checker evaluates that artifact_type',
        then: "it dispositions MISSING -- never a partial numeric score of any kind -- so Child C's convergence loop knows unambiguously to skip rubric scoring for that item rather than attempting to score a nonexistent artifact"
      },
      {
        id: 'AC-2-2',
        scenario: 'A stale non-current row does not falsely satisfy completeness (TS-6 regression guard)',
        given: 'a venture has a non-current (is_current=false) venture_artifacts row for a required artifact_type, but no is_current=true row -- a live, confirmed-real scenario at some MarketLens stages, not hypothetical',
        when: 'the completeness checker runs',
        then: "it dispositions MISSING, exactly as if zero rows existed at all -- the stale row is never read as satisfying the requirement, which is the OPPOSITE filter convention from Child A's deliberately-unfiltered readDeviations() reads, and must be commented as such in code (TR-3)"
      }
    ],
    implementation_context: `## Verification Context (FR-2)

**What to inspect:**
- Completeness checker's query against \`venture_artifacts\`: MUST filter \`is_current=true\`. Confirmed live and non-hypothetical: MarketLens \`lifecycle_stage=10\`, \`artifact_type=identity_persona_brand\` carries one row \`is_current=true\` and one \`is_current=false\` for the SAME (venture, stage, type) key -- an unfiltered read risks matching the stale row.
- Contrast explicitly with \`lib/eva/deviation-ledger.js\` \`readDeviations()\`, which is DELIBERATELY unfiltered on \`is_current\` (every deviation record is written \`is_current:false\` per Child A's own adversarial-review fix for the \`idx_unique_current_artifact\` collision) -- the two conventions are opposite by design and must both be documented in code comments (TR-3), not just tribal knowledge.
- Output contract for Child C: completeness must be a two-state signal (present / MISSING) feeding the 5-way disposition in FR-5 -- never a numeric partial score at this stage. Reason-quality and adherence-quality scoring are entirely Child C's job (\`SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C\`), downstream of this binary gate.

**Test approach (TS-2, TS-6):** unit/integration tests cover both the zero-rows case and the non-current-row-only case, asserting MISSING in both.`
  },
  {
    n: 3,
    title: "Evidence-link against the TARGET VENTURE's own repo, never EHG_Engineer's",
    user_role: 'Venture-build pipeline operator (runs the artifact walk across ventures)',
    user_want: "evidence-linking to resolve and scan the TARGET VENTURE's own repo (via applications.local_path, DB-first, matching the existing lib/sub-agents/resolve-repo.js precedent) -- never EHG_Engineer's own tree, never a hardcoded path, never a fresh clone",
    user_benefit: "when I run the walk for MarketLens, I can trust it actually inspected MarketLens's code -- not the wrong venture's repo and not the harness's own codebase by mistake -- so a BUILT verdict genuinely reflects that venture's own repository state",
    story_points: 3,
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-3-1',
        scenario: 'Repo path resolves via applications.local_path for the venture being walked',
        given: 'a venture is linked to an application row with a populated local_path (e.g. MarketLens -> applications row with local_path=C:/Users/rickf/Projects/_EHG/marketlens, status=active)',
        when: 'the evidence linker resolves the repo to scan for that venture',
        then: "it resolves via applications.local_path exclusively (DB-first, reusing lib/sub-agents/resolve-repo.js's existing resolution precedent) -- never a hardcoded path literal, and never a fresh git clone"
      },
      {
        id: 'AC-3-2',
        scenario: 'No linked application/local_path fails closed with a clear error, never silently substitutes the wrong repo',
        given: 'a venture has no linked application row, or the linked application has no local_path',
        when: "the evidence linker attempts to resolve that venture's repo",
        then: 'it raises a clear, explicit error identifying the unresolved venture -- it never falls back to scanning EHG_Engineer\'s own tree, cwd, or any other substitute repo, which would silently produce evidence-linking results against the wrong codebase entirely'
      }
    ],
    implementation_context: `## Verification Context (FR-3)

**What to inspect:**
- Repo resolution: reuse \`lib/sub-agents/resolve-repo.js\` (\`resolveSubAgentRepo\` / \`resolveRepoPathDbFirst\` from \`lib/repo-paths.js\`) -- but note the NOVEL call-site shape flagged at LEAD (RISK finding W-4): existing precedent resolves the EXECUTING SD's own \`target_application\` (SD-scoped); this engine must additionally resolve an ARBITRARY VENTURE's repo at RUNTIME (data-scoped, per venture being walked), a new call pattern over the same helper signature.
- Confirmed live: MarketLens is a real \`applications\` row (\`local_path=C:/Users/rickf/Projects/_EHG/marketlens\`, \`status=active\`) -- verified during LEAD risk assessment, not resolved by cloning on demand.
- Fail-closed contract: adopt \`resolveGateRepoContext\`'s documented pattern (per RISK recommendation) -- an unresolvable venture repo must BLOCK/flag that venture's walk, never silently skip it or fall back to scanning the wrong tree (e.g. EHG_Engineer, the engine's own cwd).
- Scan scope: per TR-1 and RISK finding R-2, the scan is read-only and path-bounded -- an explicit directory allowlist (e.g. src/, routes/, components/, schema/migrations, tests/) and denylist (.env*, node_modules, .git, dist, build, .worktrees), storing only path+line evidence references, never raw file content.

**Test approach:** integration test against MarketLens's real local_path (gated behind a describeDb-style availability guard so it skips cleanly in CI where that path doesn't exist -- per RISK W-2), plus a unit test asserting the fail-closed error path when no application/local_path is linked.`
  },
  {
    n: 4,
    title: "Enforce the chairman's honesty rule: could-not-verify != built",
    user_role: "Chairman (ratified the honesty rule this engine exists to enforce)",
    user_want: "any claim the evidence linker cannot confidently link to real evidence in the venture's repo to disposition MISSING or PARTIAL -- never BUILT by default or fallback -- so 'I couldn't verify this' is never silently reinterpreted as 'this was built'",
    user_benefit: "I get a verdict table I can trust at face value: a BUILT disposition always means real, confirmed evidence was found, never a guess dressed up as confidence -- this is the exact failure this SD exists to prevent, after MarketLens UI absence was scored as if built, pre-recovery",
    story_points: 3,
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-4-1',
        scenario: 'Zero matching evidence dispositions MISSING, never BUILT by default/fallback',
        given: 'a claim (e.g. a user story, persona surface, data-model entity, or architecture component named in a present artifact) has zero matching evidence found anywhere in the venture\'s repo',
        when: 'the evidence linker/disposition engine evaluates that claim',
        then: 'it dispositions MISSING -- there is no code path, default value, or fallback branch anywhere in the matcher that resolves an unmatched claim to BUILT'
      },
      {
        id: 'AC-4-2',
        scenario: 'Ambiguous/partial evidence dispositions PARTIAL, not BUILT',
        given: "a claim has some evidence but it's only a loose keyword match, not a confident structural match (e.g. a route file exists but doesn't clearly implement the named user story)",
        when: 'the evidence linker/disposition engine evaluates that claim',
        then: 'it dispositions PARTIAL, never BUILT -- confidence must be earned by a structural/confident match, not assumed from a loose signal, matching the retrodiction calibration test (BUILT only when evidence is genuinely present, verified against both the pre-recovery fixture commit scoring near-zero and current main scoring high with linked evidence)'
      }
    ],
    implementation_context: `## Verification Context (FR-4)

**What to inspect:**
- The disposition engine's decision logic for every claim type (user stories, persona surfaces, data-model entities, architecture components): the ONLY way to reach BUILT is a confident, evidence-backed match. There must be no default-to-BUILT branch, no "assume built unless proven otherwise" logic anywhere.
- This is the exact incident this SD exists to prevent: MarketLens's UI absence was scored as if built, pre-recovery (see this PRD's executive_summary and LEAD RISK finding R-3). The chairman's own rule, verbatim in this PRD: "could-not-verify != built."
- Calibration test (hard acceptance gate, not a smoke test, per LEAD RISK R-3 and this PRD's acceptance_criteria): run the retrodiction test against MarketLens's PRE-RECOVERY commit (must score near-zero -- little to no evidence existed) and against CURRENT MAIN (must score high with linked evidence) -- both against the SAME claim set, to prove the direction of failure is correct.
- Failure-direction bias: a false MISSING (undercounting real work) is an acceptable, safe failure mode; a false BUILT (overcounting) is not -- tune any matching threshold conservatively toward MISSING/PARTIAL per RISK R-3's explicit rollback guidance.

**Test approach (TS-1, TS-3):** TS-1 is the full retrodiction integration test against MarketLens current main; TS-3 is the unit-level ambiguous-evidence-fails-toward-MISSING/PARTIAL test.`
  },
  {
    n: 5,
    title: 'Disposition every item into exactly one of 5 values, deviation-record presence checked (not judged)',
    user_role: 'Child C developer (adherence scoring + convergence loop, SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C)',
    user_want: "every enumerated item to land in exactly one of 5 dispositions -- BUILT / PARTIAL / MISSING / DEVIATED-WITH-DOCUMENTED-REASON / DEVIATED-UNDOCUMENTED -- with DEVIATED-WITH-DOCUMENTED-REASON assigned whenever Child A's readDeviations() returns any real record for that item, so I can tell 'this was an honestly declared deviation' apart from 'this is silently missing' before my own reason-quality judgment ever runs",
    user_benefit: "my convergence loop can treat honestly-declared deviations differently from undocumented gaps without re-deriving that distinction myself -- I only have to judge whether a documented reason is any GOOD, never whether one exists at all -- and a row-count reconciliation lets me verify I received a disposition for every single enumerated item, with zero silent gaps in my own scoring pass",
    story_points: 3,
    priority: 'critical',
    acceptance_criteria: [
      {
        id: 'AC-5-1',
        scenario: 'Any real Child-A deviation record routes to DEVIATED-WITH-DOCUMENTED-REASON, reason-quality judgment deferred to Child C',
        given: 'an item has at least one record returned by lib/eva/deviation-ledger.js readDeviations(ventureId, artifactRef) -- readDeviations() never filters on is_current, per Child A\'s own contract',
        when: 'the disposition engine evaluates that item',
        then: "it dispositions DEVIATED-WITH-DOCUMENTED-REASON -- judging whether the recorded reason is actually sensible or high-quality is explicitly out of scope here and deferred entirely to Child C's later scoring pass; this engine only checks record presence"
      },
      {
        id: 'AC-5-2',
        scenario: '100% coverage verified by count reconciliation -- no silent caps',
        given: "a venture's full enumerated item set (every required artifact x every parsed claim within present artifacts)",
        when: 'the artifact walk completes for that venture',
        then: 'the count of disposition rows written exactly equals the count of enumerated items -- verified by row-count reconciliation against the registry -- and every item has exactly one of the 5 disposition values, never zero and never more than one'
      }
    ],
    implementation_context: `## Verification Context (FR-5)

**What to inspect:**
- \`lib/eva/deviation-ledger.js\` \`readDeviations(supabase, {ventureId, artifactRef})\` -- confirmed exact-match return shape: \`Promise<Array<{id, createdAt, artifact_ref, what, instead, why, decided_by, weight}>>\`, empty array (never null) when nothing exists (per this SD's own LEAD-phase VALIDATION finding). Child B calls this as-is, no adapter needed.
- Disposition mapping: any non-empty \`readDeviations()\` result -> \`DEVIATED-WITH-DOCUMENTED-REASON\`; empty result routes to \`DEVIATED-UNDOCUMENTED\`, \`MISSING\`, or \`BUILT\`/\`PARTIAL\` as appropriate per the completeness (FR-2) and evidence-linking (FR-3/FR-4) results for that item.
- Reason-quality judgment (is the recorded reason actually good, not just present) is explicitly Child C's job (\`SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C\`) -- this engine only checks for record presence, per this SD's own scope boundary.
- 100% coverage requirement: verify via row-count reconciliation -- the number of verdict rows written for a venture's walk must exactly equal the number of enumerated items, with every item assigned exactly one disposition.

**Test approach (TS-4):** integration test with one claim carrying a real Child-A deviation record and another with none, asserting the first dispositions DEVIATED-WITH-DOCUMENTED-REASON and the second dispositions correctly among the remaining values.`
  },
  {
    n: 6,
    title: 'Persist the verdict table as a new, itemized, durable table -- never a reused or aggregated one',
    user_role: 'Chairman (needs a durable, itemized, auditable verdict record)',
    user_want: "the verdict table to be a NEW, purpose-built table with a disposition column CHECK-constrained to exactly the 5 taxonomy values, storing one row per (venture_id, artifact_type, claim_ref) -- never aggregated to one row per venture, and never crammed into blueprint_quality_assessments' incompatible pass/fail/retry scoring shape",
    user_benefit: "I can query a full, itemized history of exactly what was found BUILT, PARTIAL, MISSING, or DEVIATED for any venture at any time, at the granularity of individual claims -- not a single rolled-up score that hides which specific artifacts or claims are the problem, and not a table shared with an unrelated Stage-16 scoring concern that could confuse or corrupt either consumer's data",
    story_points: 2,
    priority: 'high',
    acceptance_criteria: [
      {
        id: 'AC-6-1',
        scenario: "New table's CHECK constraint accepts exactly the 5 taxonomy values, nothing else",
        given: "the new verdict table's disposition column is created with a CHECK constraint",
        when: 'a row is inserted with disposition set to each of BUILT, PARTIAL, MISSING, DEVIATED-WITH-DOCUMENTED-REASON, or DEVIATED-UNDOCUMENTED',
        then: "each of the 5 values is accepted, and any other value (including blueprint_quality_assessments' pass/fail/retry vocabulary) is rejected by the constraint"
      },
      {
        id: 'AC-6-2',
        scenario: 'Grain is one row per enumerated item, never aggregated to one row per venture, and blueprint_quality_assessments is not reused',
        given: 'blueprint_quality_assessments was evaluated at LEAD and rejected -- confirmed via direct trigger/CHECK-constraint inspection to have gate_decision restricted to {pass,fail,retry} and a one-row-per-venture-assessment grain (not one-row-per-item)',
        when: 'the artifact walk writes verdict rows for a venture with multiple required artifacts and multiple claims per artifact',
        then: "a separate row is written per (venture_id, artifact_type, claim_ref) -- never rolled up into a single per-venture summary row -- in the new dedicated table, matching Child A's adherence_rubrics precedent for an additive, purpose-built migration rather than reusing blueprint_quality_assessments"
      }
    ],
    implementation_context: `## Verification Context (FR-6)

**What to inspect:**
- New migration creating a dedicated verdict table (additive, \`CREATE TABLE IF NOT EXISTS\`), mirroring Child A's \`adherence_rubrics\` house style: RLS with service-role-full-access + scoped-authenticated-read, per LEAD RISK recommendation.
- \`disposition\` column CHECK constraint: exactly \`{BUILT, PARTIAL, MISSING, DEVIATED-WITH-DOCUMENTED-REASON, DEVIATED-UNDOCUMENTED}\` -- 5 values, no others.
- Grain: one row per \`(venture_id, artifact_type, claim_ref)\` -- confirmed at LEAD via direct schema inspection that \`blueprint_quality_assessments\` is the WRONG fit: its \`gate_decision\` CHECK is \`{pass,fail,retry}\` (3 values, incompatible) and its grain is one row per \`(venture_id[, template_id])\` assessment (a single \`overall_score\` + one \`assessment_scores\` jsonb blob) -- not shaped for one-row-per-enumerated-item.
- Re-run safety (TR-2/TS-5): whatever grain/key is chosen must be proven via a REAL-DB test that inserts the same key twice (mirroring \`tests/integration/eva/deviation-ledger-realdb.test.js\`) BEFORE EXEC ships the migration -- directly applying Child A's own retrospective lesson (its \`recordDeviation()\` collided with \`idx_unique_current_artifact\` and was only caught by adversarial \`/ship\` review).

**Test approach (TS-5):** integration test running the walk twice against the same venture, asserting no unique-constraint collision and a deterministic, documented outcome (append-only history or upsert-on-rerun, whichever PLAN's migration design chose).`
  }
];

// Pre-flight: confirm no existing stories for this SD
const { data: existing, error: existErr } = await sb
  .from('user_stories')
  .select('story_key')
  .eq('sd_id', SD_ID);
if (existErr) throw new Error(`Pre-flight check failed: ${existErr.message}`);
if (existing && existing.length > 0) {
  console.error(`Stories already exist for ${SD_KEY}: ${existing.map((r) => r.story_key).join(', ')}`);
  process.exit(1);
}

const rows = stories.map((s) => ({
  story_key: `${SD_KEY}:US-${String(s.n).padStart(3, '0')}`,
  prd_id: PRD_ID,
  sd_id: SD_ID,
  title: s.title,
  user_role: s.user_role,
  user_want: s.user_want,
  user_benefit: s.user_benefit,
  story_points: s.story_points,
  priority: s.priority,
  status: 'ready',
  acceptance_criteria: s.acceptance_criteria,
  implementation_context: s.implementation_context,
  technical_notes: JSON.stringify({ generated_by: 'PLAN_MANUAL', source_fr: `FR-${s.n}`, child_sd: SD_KEY }),
  created_by: 'PLAN'
}));

console.log(`Inserting ${rows.length} stories for ${SD_KEY}...`);
const { data: inserted, error: insertErr } = await sb
  .from('user_stories')
  .insert(rows)
  .select('story_key, status, priority');

if (insertErr) {
  console.error('INSERT FAILED:', insertErr);
  process.exit(2);
}
inserted.forEach((s) => console.log(`  OK ${s.story_key} [${s.priority}/${s.status}]`));
const createdKeys = inserted.map((s) => s.story_key);
console.log(`Created ${inserted.length}/${rows.length} stories.`);

// --- Sub-agent evidence (canonical repo-evidence pattern) ---
const { data: sdRow, error: sdErr } = await sb
  .from('strategic_directives_v2')
  .select('target_application')
  .eq('id', SD_ID)
  .maybeSingle();
if (sdErr) throw new Error(`SD lookup failed: ${sdErr.message}`);

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: sdRow?.target_application,
  subAgentCode: 'STORIES',
  supabase: sb
});

let results = {
  verdict: 'PASS',
  confidence: 95,
  critical_issues: [],
  warnings: [],
  recommendations: [
    {
      title: 'Downstream-consumer framing, one story per FR',
      description: "Created 6 user stories (US-001..US-006) for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B, one per PRD functional requirement (FR-1..FR-6). This child SD is pure backend infrastructure (no UI) -- stories are framed from the perspective of this engine's three named downstream consumers: the venture-build pipeline operator who runs the walk and trusts its enumeration/repo-targeting (FR-1, FR-3), Child C's adherence-rubric scoring + convergence loop which consumes the binary completeness signal and 5-way disposition (FR-2, FR-5), and the chairman whose explicit honesty rule (could-not-verify != built) and durability/itemization requirement this engine directly enforces (FR-4, FR-6)."
    },
    {
      title: 'Acceptance criteria grounded in FR text and cross-referenced against PRD technical_requirements, test_scenarios, and LEAD sub-agent findings',
      description: "Each story's 2 acceptance criteria are Given/When/Then objects paraphrased directly from that FR's own acceptance_criteria bullets, cross-checked against this PRD's already-approved technical_requirements (TR-1..TR-3), test_scenarios (TS-1..TS-6), risk register, and this SD's own LEAD-phase RISK/VALIDATION sub-agent findings -- e.g. the confirmed is_current duplicate-row scenario at MarketLens stage 10, the exact readDeviations() return shape, the confirmed applications.local_path row for MarketLens, and the confirmed blueprint_quality_assessments CHECK-constraint/grain incompatibility. No generic boilerplate placeholders."
    },
    {
      title: 'EXEC Phase Guidance',
      description: "Each story's implementation_context documents concrete verification method: which DB tables/columns (venture_stages.required_artifacts, venture_artifacts.is_current, applications.local_path, the new verdict table's disposition CHECK) and files (lib/eva/deviation-ledger.js, lib/sub-agents/resolve-repo.js, lib/repo-paths.js) a reviewer or gate should inspect for that FR, plus which test_scenario (TS-1..TS-6) exercises it."
    }
  ],
  detailed_analysis: "SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B is Child B of the post-build-artifact reconciliation-gate orchestrator, PRD approved with 6 functional_requirements and 0 non_functional_requirements, no UI surface. No user_stories existed prior to this execution. Because all 6 FRs are backend engine deliverables (enumeration, completeness checking, evidence-linking, disposition, and a new verdict table), each story is framed from one of the three named downstream consumers (venture-build pipeline operator, Child C developer, chairman) rather than a generic end-user, per the PLAN-phase instruction to avoid boilerplate framing. Acceptance criteria were built by cross-referencing each FR's own acceptance_criteria bullets against the PRD's technical_requirements (TR-1..TR-3), test_scenarios (TS-1..TS-6), system_architecture, and risk register, plus this SD's own already-recorded LEAD-phase RISK (confidence 85, verdict WARNING) and VALIDATION (confidence 85, verdict PASS) sub-agent findings covering the required_artifacts SSOT, the is_current filter-direction duplicate-row confirmation, the readDeviations() exact contract, the MarketLens applications.local_path row, and the blueprint_quality_assessments rejection rationale.",
  execution_time: 0,
  phase: 'PLAN_PRD',
  source: 'manual',
  validation_mode: 'prospective',
  metadata: {
    phase: 'PLAN_PRD',
    prd_id: PRD_ID,
    sd_key: SD_KEY,
    story_keys: createdKeys,
    fr_coverage: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5', 'FR-6'],
    stories_source: 'functional_requirements (FR-1..FR-6) cross-referenced against technical_requirements TR-1..TR-3 and test_scenarios TS-1..TS-6',
    sd_type: 'child',
    generation_method: 'PLAN_MANUAL',
    downstream_consumer_framing: {
      'venture-build pipeline operator': ['FR-1', 'FR-3'],
      'Child C developer (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C)': ['FR-2', 'FR-5'],
      chairman: ['FR-4', 'FR-6']
    },
    sub_agent_version: '1.0.0'
  }
};

results = applySubAgentRepoVerdict(results, resolution);

const { data: evidenceRow, error: evidenceErr } = await sb
  .from('sub_agent_execution_results')
  .insert({
    sd_id: SD_ID,
    sub_agent_code: 'STORIES',
    sub_agent_name: 'STORIES',
    verdict: results.verdict,
    confidence: results.confidence,
    critical_issues: results.critical_issues,
    warnings: results.warnings,
    recommendations: results.recommendations,
    detailed_analysis: results.detailed_analysis,
    execution_time: results.execution_time,
    phase: results.phase,
    source: results.source,
    validation_mode: results.validation_mode,
    metadata: results.metadata
  })
  .select('id, verdict, metadata')
  .maybeSingle();

if (evidenceErr) {
  console.error('Sub-agent evidence write failed:', evidenceErr);
  process.exit(3);
}
console.log(`Sub-agent evidence row written: ${evidenceRow.id} verdict=${evidenceRow.verdict}`);
console.log('repo_path:', evidenceRow.metadata.repo_path, '| repo_resolved:', evidenceRow.metadata.repo_resolved, '| registry_source:', evidenceRow.metadata.registry_source);
