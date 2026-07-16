#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-payment-rail-attribution-002.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp, with genuinely
 * SD-specific insights rather than metric-only boilerplate.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '556b87e9-537c-4d22-b572-06f635029809';
const SD_KEY = 'SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — D5 retention loop's evidence collector, the golden first collector for the loop-governance closure verifier`,
  description: 'The loop-governance closure verifier (lib/loop-governance/verifier.js) was live and cron-wired (scripts/loop-closure-verifier-run.mjs) but was called with an empty evidence collector, so all 33 genesis loops in loop_registry evaluated STARVED forever regardless of any real activity — a fully-wired governance mechanism producing a permanently dishonest baseline. This SD closes that gap for exactly one loop (L30, "Harness retention-reaper (unbounded tables)", the D5 retention loop) by adding a pluggable evidence-collector registry and the first real collector, proving the seam works end to end without attempting to collector-ize all 33 loops in one pass.',
  affected_components: [
    'lib/loop-governance/collectors/index.js',
    'lib/loop-governance/collectors/session-coordination-retention.js',
    'scripts/loop-closure-verifier-run.mjs',
  ],
  related_files: [
    'lib/loop-governance/collectors/index.js',
    'lib/loop-governance/collectors/session-coordination-retention.js',
    'lib/loop-governance/collectors/__tests__/session-coordination-retention.test.js',
    'lib/loop-governance/collectors/__tests__/registry.test.js',
    'scripts/loop-closure-verifier-run.mjs',
    'lib/loop-governance/verifier.js',
    'lib/loop-governance/closure-engine.js',
  ],
  what_went_well: [
    'The fix required zero changes to lib/loop-governance/verifier.js or lib/loop-governance/closure-engine.js — the existing collectEvidence seam was already correctly shaped to accept a real collector; the bug was purely that scripts/loop-closure-verifier-run.mjs was invoking an emptyEvidenceCollector. Recognizing this meant the solution was additive (a new collectors/ module) rather than a risky refactor of the two files that actually decide closure state.',
    'Built lib/loop-governance/collectors/index.js as a COLLECTORS registry keyed by loop_key plus a createCollectEvidence(supabase) factory, so scripts/loop-closure-verifier-run.mjs only needed a one-line swap (emptyEvidenceCollector -> createCollectEvidence(supabase)) plus a corrected header comment — the smallest possible diff to the cron-wired entrypoint that carries production risk.',
    'The first real collector (session-coordination-retention.js, for L30) reads retention_archive for the most recent row where source_table=\'session_coordination\' AND archived_by=\'cleanup_expired_coordination\' — reusing the exact reaper identity fixed by QF-20260713-277 (the bus-reaper RPC) as the evidence source, so the collector is anchored to a mechanism already independently verified to be running, not a new unverified data path.',
    'Deliberately chose to always return edgeAt:null from this collector (see key_learnings for the full reasoning) even though it has a real upstreamFiredAt — this lands on closure-engine.js\'s documented "fired but the edge is absent" path and keeps L30 honestly OPEN rather than letting a narrow one-table collector falsely CLOSE a loop whose display_name (\'Harness retention-reaper (unbounded tables)\', plural) describes a much broader scope than session_coordination alone.',
    'Verified the fix live rather than trusting the test suite alone: ran node scripts/loop-closure-verifier-run.mjs after wiring the collector and confirmed tally={"starved":32,"open":1}, loop_registry row for L30 has status=\'open\' with reason \'fired but closure edge absent\', and the other 32 loops (spot-checked via L4) are untouched at \'starved\' — proving the collector affects exactly the one loop it targets and the injection point does not leak into unrelated loops.',
    'Test coverage mirrors the two things that actually matter for this SD: session-coordination-retention.test.js includes a GT-1 golden regression test parametrized over 0/1/29-day-old evidence (so any future edit that starts supplying a real edgeAt gets caught immediately), and registry.test.js runs a full 33-genesis-loop batch regression so a future collector addition can\'t silently regress an unrelated loop\'s STARVED baseline.',
  ],
  what_needs_improvement: [
    'This SD intentionally leaves 32 of the 33 genesis loops (L1-L29, L31-L33) uncollectored and therefore still permanently STARVED — the golden-first-collector scope was the right call for proving the seam, but the fleet is still one collector away from a governance mechanism that means anything for the loops it doesn\'t yet cover.',
    'The edgeAt:null pattern this collector establishes is the correct default for any loop whose display_name scope exceeds what a single evidence source can observe, but that judgment call (does this loop\'s stated scope exceed this collector\'s evidence?) is currently made by inline code-comment reasoning in session-coordination-retention.js rather than by any structural check — a future collector author could supply a real edgeAt for a similarly under-observed loop without the registry or engine catching the mismatch.',
    'The GT-1 acceptance criterion (D5 must evaluate \'open\', never \'closed\') is validated by a parametrized unit test today; there is no live/scheduled regression check yet that would catch a future collector edit silently starting to return a real edgeAt for L30 in production, only the next time someone runs the test suite.',
  ],
  key_learnings: [
    'A cron-wired verifier that has been "live" for a while can still be producing a completely uninformative signal if its evidence-injection point was left as a stub — loop_registry showed all 33 genesis loops as STARVED not because nothing was happening in the system, but because scripts/loop-closure-verifier-run.mjs was calling emptyEvidenceCollector. "The verifier runs on schedule" and "the verifier tells you anything true" are separate claims, and only the second one required this SD.',
    'The single most important design decision in this SD was choosing what NOT to report: session-coordination-retention.js always returns edgeAt:null, deliberately declining to supply a real closure edge, even though it has a genuine upstreamFiredAt timestamp from retention_archive. The reason is that L30\'s display_name (\'Harness retention-reaper (unbounded tables)\') describes scope across multiple unbounded tables, but this first collector only has evidence for one (session_coordination). Supplying a real edgeAt would let the edge_freshness predicate (30-day window) evaluate CLOSED almost immediately, since the session_coordination reaper fires frequently — producing a false-CLOSE for a loop whose true scope this one collector cannot actually attest to. Returning edgeAt:null while upstreamFiredAt is set instead lands on closure-engine.js\'s documented "OPEN when it fired but the edge is absent" path, satisfying the non-negotiable GT-1 acceptance criterion that D5 must evaluate \'open\', never \'closed\', with this partial evidence.',
    'This pattern (edgeAt:null whenever a collector\'s evidence scope is narrower than the loop\'s stated scope) is the reusable template for every future collector in this family: a collector should only supply a real edgeAt when its evidence source demonstrably covers the FULL scope implied by the loop\'s display_name/definition, not merely SOME activity related to it. Reporting a real edge from partial evidence is a false-CLOSE risk, not a conservative default.',
    'Injecting a real collector through an existing, already-correctly-shaped seam (collectEvidence) is lower-risk than it might look for a governance-critical verifier — because closure-engine.js and verifier.js needed zero changes, the blast radius of this fix is fully contained to the new collectors/ module and a one-line swap in the cron entrypoint, which is exactly why the REGRESSION sub-agent could confirm the other 32 loops were provably unaffected.',
    'Anchoring a new evidence collector to an already-independently-verified mechanism (the bus-reaper RPC fixed by QF-20260713-277) rather than a fresh, unverified data path meant this collector inherited that mechanism\'s correctness instead of needing its own end-to-end verification of "does the reaper actually run" from scratch.',
  ],
  action_items: [
    {
      title: 'Build evidence collectors for the remaining 32 genesis loops (L1-L29, L31-L33)',
      description: 'This SD intentionally scoped to D5/L30 only, as the golden first collector proving the collectEvidence injection seam. The other 32 genesis loops in loop_registry remain STARVED with no real evidence source. Each follow-on collector should be scoped and reviewed individually (one loop at a time, per the "one table at a time" prevention pattern) rather than attempted as a single bulk SD.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Copy the edgeAt-null-when-scope-exceeds-evidence pattern into every future collector',
      description: 'Any new collector for a loop whose display_name/definition describes broader scope than a single available evidence source should follow session-coordination-retention.js\'s precedent: return edgeAt:null (landing on the "fired but edge absent" OPEN path) rather than supplying a real edgeAt derived from partial evidence, which risks a false-CLOSE. Document this explicitly in the collectors/index.js registry comment so it is discoverable without re-deriving the reasoning from session-coordination-retention.js each time.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Add a structural (not just inline-comment) guard against edgeAt/scope mismatch in the registry',
      description: 'Currently the "does this collector\'s evidence scope match the loop\'s stated scope" judgment is enforced only by code-comment discipline in each collector file. Consider a lightweight registry-level check (e.g. a required scope-coverage annotation per collector, validated in registry.test.js) so a future collector author supplying a real edgeAt for an under-observed loop gets caught by the test suite rather than relying on the next reviewer re-reading the reasoning.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
    {
      title: 'Add a live/scheduled regression check for the GT-1 acceptance criterion, not just a unit test',
      description: 'The parametrized unit test (0/1/29-day-old evidence) in session-coordination-retention.test.js validates GT-1 (D5 must evaluate \'open\', never \'closed\') at test-run time. Consider a lightweight scheduled check (e.g. alongside the existing loop-closure-verifier-run.mjs cron) that alerts if L30 ever evaluates \'closed\' in production, so a future collector edit that starts supplying a real edgeAt is caught in the live cadence, not only the next time the test suite runs.',
      priority: 'low',
      owner_role: 'EXEC',
    },
  ],
  improvement_areas: [
    {
      area: '32 of 33 genesis loops remain uncollectored and permanently STARVED',
      analysis: 'This SD deliberately scoped to exactly one loop (L30/D5) to prove the collectEvidence injection seam end to end before attempting the other 32. That was the right sequencing call, but it means loop_registry\'s tally={"starved":32,"open":1} is the honest, expected post-SD state, not a regression — the other 32 loops still tell you nothing true about real activity.',
      prevention: 'Tracked as the first action item above: build the remaining 32 collectors incrementally, one loop at a time, each independently reviewed and verified live the same way L30 was (tally check + spot-checked unaffected loops), rather than as a single large follow-on SD.',
    },
    {
      area: 'edgeAt/scope-mismatch judgment is enforced only by inline code comments today',
      analysis: 'The core safety property of this SD (never let a narrow collector falsely CLOSE a broad-scoped loop) currently lives as reasoning in session-coordination-retention.js\'s comments, not as a structural check the registry or its tests would enforce for a future collector that gets this judgment wrong.',
      prevention: 'Tracked as the third action item above: consider a lightweight scope-coverage annotation validated in registry.test.js so this stops depending on every future collector author re-deriving and correctly applying the reasoning from scratch.',
    },
  ],
  success_patterns: [
    'Diagnosed that the closure verifier\'s dishonest STARVED-forever output was caused by an empty evidence collector at the cron entrypoint, not a defect in the verifier or closure-engine logic itself, so the fix stayed additive (new collectors/ module + one-line swap) with zero changes to the two files that decide closure state',
    'Deliberately returned edgeAt:null from the first real collector despite having a real upstreamFiredAt, to avoid a false-CLOSE on a loop (L30, "unbounded TABLES", plural) whose true scope exceeds what one collector\'s evidence (session_coordination only) can attest to — landing on closure-engine.js\'s documented OPEN-when-edge-absent path instead',
    'Verified the fix live end to end (node scripts/loop-closure-verifier-run.mjs) rather than trusting tests alone, confirming tally={"starved":32,"open":1}, L30 status=\'open\' with reason \'fired but closure edge absent\', and that other loops (e.g. L4) remained untouched at \'starved\'',
    'Anchored the new collector\'s evidence source (retention_archive rows for source_table=\'session_coordination\', archived_by=\'cleanup_expired_coordination\') to the bus-reaper mechanism already independently fixed and verified by QF-20260713-277, rather than a fresh unverified data path',
    'Test suite included both a targeted GT-1 golden regression (0/1/29-day-old evidence parametrization) and a full 33-genesis-loop batch regression, so future edits get caught for both "did L30 stop being honest" and "did adding a new collector regress an unrelated loop"',
  ],
  failure_patterns: [
    'The closure verifier had been live and cron-wired for a period of time while silently reporting a fully uninformative signal (all 33 loops STARVED) because its only evidence collector was an empty stub — a "the mechanism runs on schedule" check alone would not have caught that the mechanism told you nothing true',
    '32 of 33 genesis loops remain without any real evidence collector after this SD, by deliberate scope decision rather than oversight, but still represent an open gap in the fleet-wide governance signal',
  ],
  business_value_delivered: 'Restores real signal to the loop-governance closure verifier for the D5 retention loop (L30) — the first of 33 genesis loops to move off a permanently dishonest STARVED baseline — and proves out the collectEvidence injection seam that every future per-loop collector will reuse.',
  customer_impact: 'Indirect: internal governance/observability mechanism (loop_registry closure state) used to gate op-co GO decisions; no end-user-facing surface changed.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 1,
  bugs_resolved: 1,
  tests_added: 2,
  performance_impact: 'Standard',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  human_participants: ['LEAD'],
  team_satisfaction: 9,
  metadata: {
    sd_key: SD_KEY,
    loop_key: 'L30',
    d_ref: 'D5',
    loop_display_name: 'Harness retention-reaper (unbounded tables)',
    upstream_fix_reused: 'QF-20260713-277 (bus-reaper RPC, session_coordination cleanup_expired_coordination)',
    verifier_run_result: '{"starved":32,"open":1}',
    l30_reason: 'fired but closure edge absent',
    subagent_verdicts: {
      TESTING: '96%',
      VALIDATION: '95% (re-ran verifier live independently)',
      REGRESSION: '96% (confirmed emptyEvidenceCollector had zero external references; GHA cron call unchanged; 32 other loops unaffected)',
    },
    remaining_scope: 'L1-L29, L31-L33 still need their own collectors (32 of 33 genesis loops)',
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Dedup guard: don't create a second SD_COMPLETION row if one already exists.
  const { data: existing } = await s
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`SD_COMPLETION retrospective already exists (id: ${existing[0].id}, created_at: ${existing[0].created_at}) — no new row needed.`);
    return;
  }

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
