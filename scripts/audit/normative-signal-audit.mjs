/**
 * NORMATIVE-SIGNAL AUDIT — SD-LEO-INFRA-NORMATIVE-SIGNAL-AUDIT-001, FR-3/FR-4/FR-6.
 *
 * Produces the NAMED LIST: one verdict per grading gauge, landed in the database.
 *
 * THE RULE BEING APPLIED: a NORMATIVE signal — anything that grades an agent, feeds a rubric, or
 * auto-escalates — must be ARTIFACT-ANCHORED and OUTCOME-ARMED, or be labelled INFORMATIONAL and
 * barred from grading.
 *
 * WHY GAUGES ARE ENUMERATED BY READER AND NOT BY COLUMN (FR-3): only 5 of the 12 existing stores
 * carry a verdict-shaped column. A column scan is the obvious implementation and it drops seven of
 * twelve — under-counting the very denominator this audit declares as its first deliverable. The
 * readers below were traced by grep and are recorded per gauge, because "who consumes this" is the
 * question that decides NORMATIVE vs INFORMATIONAL, and no column name answers it.
 *
 * WHY NOTHING IS RE-IMPLEMENTED (FR-4): the two admission tests already exist in
 * scripts/adam-coordinator-health.mjs — gitGrepMainForSd (artifact-anchor: a DB-completed SD must
 * leave a trace on origin/main) and computeFailLoudIntegrity (two-sided: self-reported counts
 * against an independent measure). They are imported, not rebuilt.
 *
 * WHERE THE LIST LANDS (FR-6): strategic_directives_v2.metadata.gauge_audit, plus one feedback row
 * per DEFECTIVE gauge so each can source its own follow-up without re-derivation. Deliberately NOT a
 * markdown report, and deliberately no new table — that would be chairman-gated DDL, and the audit
 * is a survey.
 *
 * Read-only over every gauge it judges. Run: node scripts/audit/normative-signal-audit.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { judgeGauge, summarise, VERDICT } from '../../lib/audit/refusal-test.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-NORMATIVE-SIGNAL-AUDIT-001';

/**
 * The counted population. Readers traced by grep over lib/ and scripts/; live_readers EXCLUDES
 * archive/one-time paths, because a store consulted only by archived scripts grades nothing today
 * whatever its row count suggests.
 */
const GAUGES = [
  { gauge: 'sub_agent_execution_results', column: 'verdict', readers: 'handoff gate pipeline (GATE_SUBAGENT_EVIDENCE)', live_readers: true },
  { gauge: 'ai_quality_assessments', column: null, readers: 'v_ai_quality_tuning_recommendations; ai-quality-evaluator scoring.js:88', live_readers: true },
  { gauge: 'validation_audit_log', column: null, readers: 'scripts/gate-health-check.js + 7 others', live_readers: true },
  { gauge: 'eva_vision_scores', column: null, readers: 'lib/eva/chairman-governance-panels.js + 34 others', live_readers: true },
  { gauge: 'eva_stage_gate_results', column: 'passed', readers: 'eva stage gate pipeline', live_readers: true },
  { gauge: 'leo_gate_reviews', column: null, readers: 'ONLY scripts/archive/one-time/* (3 refs)', live_readers: false },
  { gauge: 'ship_review_findings', column: 'verdict', readers: 'ship review flow', live_readers: true },
  { gauge: 'leo_validation_rules', column: null, readers: 'lib/self-audit/routines/orphanRules.js + 9 others', live_readers: true },
  { gauge: 'sd_type_validation_profiles', column: null, readers: 'scripts/modules/handoff/executors/BaseExecutor.js + 18 others', live_readers: true },
  { gauge: 'management_reviews', column: null, readers: 'lib/eva/consultant/action-executor.js + 5 others', live_readers: true },
  { gauge: 'agentic_reviews', column: 'status', readers: 'agentic review flow', live_readers: true },
  { gauge: 'sd_gate_results', column: 'result', readers: 'sd gate flow', live_readers: true },
  { gauge: 'leo_phase_ci_cd_gates', column: 'result', readers: '(none — object absent)', live_readers: false },
];

/**
 * Collect an EXACT tally. Both historical failures of this audit happened in the fetching, so the
 * value domain is read from the database and every value counted exactly; judgeGauge then refuses a
 * verdict if the enumerated sum does not reconcile against the total.
 */
async function tally(gauge, column) {
  const probe = await sb.from(gauge).select('*').limit(1);
  // ABSENT vs EMPTY: a head-count on a missing table returns null with no error. Returning null here
  // (rather than 0) is what lets judgeGauge say ABSENT instead of "never fired".
  if (probe.error) return { total: null, counts: null };

  const { count: total } = await sb.from(gauge).select('*', { count: 'exact', head: true });
  if (!column) return { total: total ?? 0, counts: null };

  // Enumerate the domain by walking the whole column in pages — NOT by reading one capped page.
  const values = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(gauge).select(column).range(from, from + PAGE - 1);
    if (error) break;
    for (const r of data) values.add(String(r[column]));
    if (data.length < PAGE) break;
  }

  const counts = {};
  for (const v of values) {
    const q = v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v;
    const { count } = q === null
      ? await sb.from(gauge).select('*', { count: 'exact', head: true }).is(column, null)
      : await sb.from(gauge).select('*', { count: 'exact', head: true }).eq(column, q);
    counts[v] = count ?? 0;
  }
  return { total: total ?? 0, counts };
}

/**
 * Tag against the ONE RULE. A gauge that grades while being neither artifact-anchored nor
 * outcome-armed is recorded as DEFECTIVE — never quietly relabelled INFORMATIONAL, which would
 * satisfy the rule on paper while changing nothing about what it grades (FR-5).
 */
function tag(g, judged) {
  if (!g.live_readers) {
    return { tag: 'INFORMATIONAL', defect: false, why: 'no live reader — grades nothing today regardless of row count' };
  }
  if (judged.verdict === VERDICT.NEVER_REFUSED) {
    return { tag: 'NORMATIVE', defect: true, why: 'has a live reader and has never refused — it grades, and it cannot fail' };
  }
  if (judged.verdict === VERDICT.UNMEASURABLE || judged.verdict === VERDICT.REFUSED) {
    return { tag: 'UNTAGGED', defect: false, why: 'cannot be tagged until its refusal behaviour is established: ' + judged.reason };
  }
  return { tag: 'NORMATIVE', defect: false, why: 'has a live reader and demonstrably discriminates' };
}

const results = [];
for (const g of GAUGES) {
  const { total, counts } = await tally(g.gauge, g.column);
  const judged = judgeGauge({ gauge: g.gauge, column: g.column, counts, total, reader: g.readers });
  const t = tag(g, judged);
  results.push({ ...judged, ...t, live_readers: g.live_readers });
}

const summary = summarise(results);
console.log('=== NORMATIVE-SIGNAL AUDIT ===');
console.log('population=' + summary.population + '  by_verdict=' + JSON.stringify(summary.by_verdict));
console.log('unspoken (could not judge)=' + summary.unspoken + '  grades_nothing=' + summary.grades_nothing);
console.log('');
for (const r of results) {
  console.log(r.verdict.padEnd(15) + r.tag.padEnd(15) + r.gauge.padEnd(30)
    + (r.total != null ? 'n=' + String(r.total).padEnd(8) : 'n=-'.padEnd(10))
    + (r.defect ? ' [DEFECT]' : ''));
  console.log('   ' + r.reason);
  if (r.counts) console.log('   counts: ' + JSON.stringify(r.counts));
  console.log('   reader: ' + (r.reader || '-'));
}

// FR-6 — land it. SD metadata carries the full list; one feedback row per defect carries enough
// evidence to source a follow-up without re-derivation.
const { data: sd } = await sb.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
const { error: upErr } = await sb.from('strategic_directives_v2')
  .update({ metadata: { ...(sd?.metadata || {}), gauge_audit: { summary, gauges: results } } })
  .eq('sd_key', SD_KEY);
console.log('\nlanded in strategic_directives_v2.metadata.gauge_audit: ' + (upErr ? 'ERR ' + upErr.message : 'OK'));

const defects = results.filter((r) => r.defect);
console.log('DEFECTIVE gauges: ' + defects.length + (defects.length ? ' -> ' + defects.map((d) => d.gauge).join(', ') : ''));

// A survey that judged nothing is a survey that failed. Exit non-zero so a caller cannot read an
// empty run as a clean fleet — the same shape this audit demands of the gauges it judges.
if (summary.population === 0 || summary.unspoken === summary.population) {
  console.error('\nFAIL: the audit spoke to no gauge. An audit that grades nothing is the defect it reports.');
  process.exit(1);
}
