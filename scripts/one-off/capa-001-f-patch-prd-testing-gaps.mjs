import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error } = await s.from('product_requirements_v2')
  .select('functional_requirements,test_scenarios')
  .eq('id', 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F')
  .single();
if (error) throw error;

const frs = prd.functional_requirements;
const byId = Object.fromEntries(frs.map(fr => [fr.id, fr]));

// FR-2: fix grep predicate to require multi-line/whole-file/AST matching
byId['FR-2'].description += " CORRECTION (PLAN-phase TESTING review): the real self-approval call spans three source lines (`.from('chairman_decisions')` / `.update({ status: 'approved'...` on separate lines) — a single-line grep pattern would match nothing and pass forever. The predicate MUST read whole-file text and use a multi-line-spanning match (e.g. a regex with a dotall/[\s\S] flag across the full file body, or an AST-based check), never a per-line grep.";
byId['FR-2'].acceptance_criteria.push("The predicate is implemented as a whole-file (not per-line) text match or AST check, verified against the REAL multi-line call shape in stage-17-blueprint-review.js (not a single-line synthetic simplification).");

// FR-3: real ceremony-valid approver email instead of a bare placeholder
byId['FR-3'].description = byId['FR-3'].description.replace(
  "`-- @approved-by: <email>` placeholder,",
  "`-- @approved-by: <ceremony-valid email matching git config user.email at authoring time, per existing convention>`,"
);
byId['FR-3'].acceptance_criteria.push("The @approved-by header carries a real, ceremony-valid email address (matching the authoring session's git config user.email, per the existing convention in database/chairman-gated/), never a literal '<email>' placeholder that would fail the approver-factor guard.");

// FR-4: load-bearing try/catch + correct file count + explicit non-regression list
byId['FR-4'].description += " CORRECTION (PLAN-phase TESTING review): the three existing stage-23 unit suites' shared buildMockSupabase fixture throws on any unrecognized table name. The moment this FR's code reads venture_deployments, EVERY existing stage-23 suite will throw unless checkVentureUptimeWired defensively handles an unmocked/erroring table read (e.g. try/catch around the venture_deployments query, degrading to the 'no probe data' advisory branch on error) — this defensive handling is REQUIRED for regression safety, not optional. Also, there are actually FOUR unit suites directly or indirectly exercising this module's checklist shape (stage-23-launch-readiness-fr1-4-6.test.js, -fr7-category-coverage.test.js, -telemetry-analytics.test.js, plus tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js which uses a different auto-chainable vi.fn mock shape, not the strict-throw buildMockSupabase), plus 2 integration suites out of unit-tier scope — corrected from the earlier 'three files' count.";
byId['FR-4'].acceptance_criteria[byId['FR-4'].acceptance_criteria.length - 1] = "All FOUR existing stage-23 unit suites' current assertions are unbroken (stage-23-launch-readiness-fr1-4-6.test.js, -fr7-category-coverage.test.js, -telemetry-analytics.test.js, and stage-23-growth-categories.test.js) — confirmed none assert the literal 'chairman attestation suffices' string for analytics/monitoring and none test the default: branch today, and the new venture_deployments read degrades gracefully (no throw) against every one of their mock shapes.";
byId['FR-4'].acceptance_criteria.push("checkVentureUptimeWired defensively handles a missing/erroring venture_deployments read (try/catch, degrade to the honest no-data advisory branch) rather than propagating an exception into the checklist builder.");

// FR-5: correct file count reference
byId['FR-5'].description = byId['FR-5'].description.replace(
  "following the existing buildMockSupabase fixture pattern used by the three sibling stage-23 test files",
  "following the existing buildMockSupabase fixture pattern used by the sibling stage-23 test files (four total unit suites reference this module's checklist shape; new/extended tests must not break the one using the different auto-chainable vi.fn mock shape)"
);

const tss = prd.test_scenarios;
const tsById = Object.fromEntries(tss.map(ts => [ts.id, ts]));
tsById['TS-2'].expected = "A synthetic fixture reproducing the REAL multi-line self-approval call shape (`.from('chairman_decisions')` chained to `.update({ status: 'approved', decision: 'approve', ... })` across separate lines, not a single-line simplification) fails the predicate; stage-22-distribution-setup.js's real SELECT/pending-create calls pass it.";
tsById['TS-3'].expected += " Also covers: metadata.probe absent/null (e.g. a freshly-seeded venture_deployments row with metadata: {}), and a null/malformed last_checked_at value used as the sort key — the aggregation must not throw or silently misorder on either.";

const { error: updErr } = await s.from('product_requirements_v2')
  .update({ functional_requirements: frs, test_scenarios: tss })
  .eq('id', 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F');
if (updErr) throw updErr;
console.log('PRD patched successfully');
