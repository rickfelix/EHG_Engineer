// SD-LEO-INFRA-DRIVE-SCORE-LEG1-ALOCAL-001 — completes the TESTING evidence row's dropped fields.
// storeSubAgentResults warned it does not persist `issues`, left critical_issues/warnings empty,
// and auto-derived conditions as blocking:false truncated at 300 chars. This fills them in place
// on the row the canonical writer created (id below) — no second row, no hand-rolled path columns.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const ROW_ID = '8606170f-dfd5-42e5-a688-b47dc8e591ef';
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const critical_issues = [
  {
    id: 'POP-MISMATCH',
    severity: 'critical',
    fr: 'FR-2',
    title: 'The ratified 98.3% describes a population disjoint from the one FR-2 wires',
    measured:
      'P1 (120 most-recent completed SDs with completion_date) end-anchored landed = 117/120 (97.5%), naive = 118/120 (98.3%) — ' +
      'the ratified claim REPRODUCES. P2 (computePlanCheckStatus done[]) end-anchored landed = 14/20 (70.0%) at windowHours=720. ' +
      '|P1 intersect P2| = 0 of 20 keys — the two populations are fully disjoint. At the LIVE default 48h window done.length === 0.',
    consequence:
      'The chairman ratified an earnability number that does not describe the leg being shipped. At ship, leg1 is unavailable ' +
      '(empty window) and, once the window fills, scores ~70% not ~98%.',
  },
  {
    id: 'ANCHOR-UNDERSPEC',
    severity: 'high',
    fr: 'FR-1 / TS-3',
    title: 'Anchor acceptance criterion names only the hyphen case; 109 measured collisions use other boundaries',
    measured:
      'Over 5608 unique sd_key values: hyphen-followed 1583 pairs; NO-separator 103 pairs (SD-LEO-INFRA-CONTEXT-AWARE-LLM-001 vs ' +
      '-001A; SD-HARDENING-V2-001 vs -001A); letter-then-digit 244 pairs (-001-A vs -001-A1); dot 6 pairs (SD-UNIFIED-PATH-1.1 vs ' +
      '1.1.1); digit-then-digit 1 pair (stage-arch-remediation-001-p1 vs -p10). Measured charset = [-.0123456789@A-Z_a-z].',
    consequence: 'An anchor rejecting only a following hyphen admits 109 real false-positive pairs.',
    prompt_hypothesis:
      'SD-X-001 vs SD-X-0012 is REFUTED for SD-prefixed keys (0 such pairs) but CONFIRMED in the general key population (1 pair). Guard it anyway — it is free.',
  },
  {
    id: 'TS4-NOT-DURABLE',
    severity: 'high',
    fr: 'FR-3 / TS-4',
    title: 'Population regression guard is an authoring ritual, not an executable CI artifact',
    measured:
      'FR-3 AC-2 requires the guard be "proven RED-then-fixed during authoring". That leaves nothing in CI, so a future revert to ' +
      'open_items_all (the definitionally-not-landed set) ships silently — the exact regression the guard names.',
    consequence: 'The guard proves correlation at authoring time and nothing thereafter.',
  },
  {
    id: 'FIXTURE-FIELD-UNBOUND',
    severity: 'high',
    fr: 'FR-2 / FR-3',
    title: 'No test binds the fixture field name to the real producer — silent measured-false-zero path',
    measured:
      'lib/roadmap/plan-check-status.js:231-237 emits done[] rows as { item_id, title, wave, sd_key, completed_at }; sd_key carries ' +
      "item.promoted_to_sd_key's VALUE. Reading d.promoted_to_sd_key off a done[] row returns undefined. Existing fixtures are " +
      "hand-written (drive-report-sweep.test.js:278 `done: [{ item_id: 'd1' }]` has no key field at all).",
    consequence:
      'A wrong accessor makes every key undefined -> landedCount 0 -> leg1 emits a MEASURED FALSE ZERO. A hand-written fixture ' +
      'agreeing with the mis-coded accessor is two green endpoints that never prove the wire.',
  },
  {
    id: 'FRACTIONAL-RENDER',
    severity: 'high',
    fr: 'FR-2 / TS-5',
    title: 'Fractional points.value reaches the chairman unrounded and cannot be corrected',
    measured:
      'scripts/drive-report-sms.mjs:129 interpolates `Drive ${score}/${possible}`; scripts/hooks/session-role-orient.cjs:151 injects ' +
      'the same string into Adam\'s seat. A 2/3 rate renders "Drive 1.3333333333333333/6" (42 chars, under the 320 cap, no guard ' +
      'trips). database/migrations/20260803_drive_reports.sql:207-209 makes drive_score APPEND-ONLY (UPDATE raises, DELETE guarded). ' +
      'Zero existing tests use a non-integer score. cite() does not constrain value type.',
    consequence: 'A bad first day of fractional output is permanent in the trend and already sent by SMS.',
  },
  {
    id: 'TR3-STALE',
    severity: 'high',
    fr: 'TR-3',
    title: 'The LEG2-001 collision is no longer pre-commit — PR #6953 is open, pushed, and semantically breaking',
    measured:
      'TR-3 says "uncommitted (not yet pushed)". Measured: commit e8274169506 pushed; PR #6953 OPEN against main touching both ' +
      'scripts/cron/drive-report-sweep.mjs and tests/unit/cron/drive-report-sweep.test.js. It adds a mandatory-injection throw to ' +
      'buildGather() requiring readLeg2Cohort (function) + nowMs (finite number), and duplicates the leg-set identity pin in a new ' +
      'describe block that does not exist in the LEG1 tree.',
    consequence:
      'Any LEG1 test written against today\'s 4-arg buildGather THROWS at construction once #6953 lands — a break that survives a ' +
      'clean textual merge and is invisible from the LEG1 worktree today.',
  },
  {
    id: 'TS5-EDGE-CASES',
    severity: 'medium',
    fr: 'TS-5',
    title: 'Proportional formula edge cases unspecified',
    measured:
      'denominator===0 is the LIVE case (done.length===0 at 48h). done[] contains DUPLICATE sd_keys — 21 rows / 20 unique keys at ' +
      '720h (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B appears twice). sd_key is nullable.',
    consequence:
      '0/0 yields NaN; rows-vs-unique mismatch silently distorts the ratio; null keys counted in the denominator silently depress the score.',
  },
  {
    id: 'FR4-TEST-DOCTRINE',
    severity: 'medium',
    fr: 'FR-4',
    title: 'FR-4 amends the module header but leaves the contradicting doctrine in the OLD test file and the persisted predicate',
    measured:
      'tests/unit/drive-loop/score/leg1-landed.test.js:75 asserts with the message "partial landing is not landing — the leg is ' +
      'all-or-nothing", and FR-4 requires that file stay byte-unchanged. aggregate.js:71-75 bakes "at 2 points each" into the ' +
      'PERSISTED predicate string, which stops being true of leg1.',
    consequence: 'Two contradictory doctrines coexist; the sharper stale narration is the one FR-4 does not cover.',
  },
  {
    id: 'C4-REDERIVATION-DORMANT',
    severity: 'low',
    fr: 'FR-2',
    title: 'Dormant c4-rederivation rule structurally forbids a proportional cite carrying row_ids',
    measured:
      'tests/unit/drive-loop/c4-rederivation.test.js:299-309 requires any numeric cited value published with row_ids to equal ' +
      'row_ids.length (1.333 !== 2). Dormant: the walker is section-scoped and never runs over drive_score. leg2-uptake.js:115-126 ' +
      'already sets the same precedent.',
    consequence: 'Latent only — becomes live if anyone extends the walker to the score.',
  },
];

const warnings = critical_issues
  .filter((i) => i.severity === 'high' || i.severity === 'critical')
  .map((i) => ({
    severity: i.severity === 'critical' ? 'CRITICAL' : 'HIGH',
    issue: `[${i.fr}] ${i.title}`,
    recommendation: i.consequence,
  }));

const conditions = [
  { action: 'FR-1: derive the anchor char class from the MEASURED sd_key charset [A-Za-z0-9._@-], require a non-key char or line boundary on BOTH sides, regex-escape the key, and export the pattern builder as a named export pinned double-free the way ancestryArgs() is at leg1-landed.test.js:103-105.', priority: 'critical', blocking: true },
  { action: 'FR-1/TS-3: extend the end-anchor guard to cover all four measured collision shapes — hyphen (-001-B), no-separator (-001A), letter-then-digit (-001-A1), and dot (1.1 vs 1.1.1) — not the hyphen case alone.', priority: 'critical', blocking: true },
  { action: 'FR-2: re-measure the landed rate on the population actually wired (computePlanCheckStatus done[]), correct the PRD executive summary, and surface the 70%-vs-98.3% delta plus the empty 48h live window to the chairman before ship.', priority: 'critical', blocking: true },
  { action: 'FR-3/TS-4: replace the RED-then-fixed authoring ritual with a DISCRIMINATING FIXTURE in which done[] and open_items_all yield different scores, plus a named exported population selector, so the assertion can only pass under the correct population.', priority: 'critical', blocking: true },
  { action: 'FR-2/FR-3: add a CONTRACT test binding the fixture row shape to the real producer (assert Object.keys of a real computePlanCheckStatus done[] row, or import its row builder) so a field rename reds the suite. Pin that leg1 reads sd_key, not promoted_to_sd_key.', priority: 'critical', blocking: true },
  { action: 'FR-2/TS-5: pin the formula explicitly — earned = LEG_POINTS * landedUnique/denominatorUnique over DEDUPED non-null sd_keys; denominator===0 routes to unavailable (never 0/0=NaN); assert landedCount <= denominator.', priority: 'high', blocking: true },
  { action: 'Round or format the score at the render seam (drive-report-sms.mjs formatBody) and add a fractional-score fixture to drive-report-sms.test.js; bump compose-report.js SCHEMA_VERSION since leg1 points semantics change and drive_score is append-only.', priority: 'high', blocking: true },
  { action: 'TR-3: rebase onto origin/main AFTER PR #6953 merges before touching the legs array or the test fixtures; re-verify buildGather()\'s required injections and update BOTH copies of the leg-set identity pin.', priority: 'high', blocking: true },
  { action: 'FR-4: extend the reference-only note to cover the OLD test file\'s "the leg is all-or-nothing" assertion message (leg1-landed.test.js:75) and the aggregate.js predicate string\'s "at 2 points each" claim.', priority: 'medium', blocking: false },
];

const { error } = await s
  .from('sub_agent_execution_results')
  .update({ critical_issues, warnings, conditions })
  .eq('id', ROW_ID);
if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }

const { data } = await s
  .from('sub_agent_execution_results')
  .select('id, verdict, phase, critical_issues, warnings, conditions')
  .eq('id', ROW_ID).single();
console.log('REPAIRED_ROW=', data.id);
console.log('verdict=', data.verdict, ' phase=', data.phase);
console.log('critical_issues=', data.critical_issues.length);
console.log('warnings=', data.warnings.length);
console.log('conditions=', data.conditions.length, ' blocking=', data.conditions.filter((c) => c.blocking).length);
