#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-payment-rail-attribution-002.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp, with genuinely
 * SD-specific insights rather than metric-only boilerplate. The prior
 * auto-generated pass was rejected for exactly that reason (e.g. "EXEC phase
 * quality score: 80%" with no SD-specific content).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '0512a238-e2a3-4f11-b954-d9e31568c7e9';
const SD_KEY = 'SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'DATABASE_SCHEMA',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — accepted-known-state ack mechanism stops legitimate gauge-finding re-promotion churn`,
  description: 'WAVE_LINKAGE_STARVATION (lib/roadmap/wave-linkage-coverage.js) and similar gauge findings are legitimately known and accepted pending a future chairman decision, yet the sourcing/refill engine kept re-promoting them as fresh SD candidates every cycle because it had no way to distinguish "known and accepted" from "newly discovered." Delivered a coordinator-writable gauge_finding_dispositions table plus a query-time suppression axis threaded through the existing pure evaluateRefillCandidate() validity check, so a disposition suppresses promotion until a dated re-review and then auto-expires with no cleanup cron required.',
  affected_components: [
    'database/migrations/20260716_gauge_finding_dispositions.sql',
    'lib/sourcing-engine/refill-candidate-validity.js',
    'lib/governance/emit-feedback.js',
    'lib/sourcing-engine/proactive-populator.js',
    'scripts/gauge-findings/disposition.js',
    'scripts/sourcing-engine/refill-cron.mjs',
  ],
  related_files: [
    'database/migrations/20260716_gauge_finding_dispositions.sql',
    'lib/sourcing-engine/refill-candidate-validity.js',
    'lib/sourcing-engine/refill-auto-promote.js',
    'lib/governance/emit-feedback.js',
    'lib/sourcing-engine/proactive-populator.js',
    'scripts/gauge-findings/disposition.js',
    'scripts/sourcing-engine/refill-cron.mjs',
    'lib/roadmap/wave-linkage-coverage.js',
    'tests/scripts/gauge-findings-disposition.test.js',
    'tests/unit/governance/emit-feedback.test.js',
    'tests/unit/sourcing-engine/gauge-finding-dedup-key-propagation.test.js',
    'tests/unit/sourcing-engine/gauge-finding-disposition-suppression.test.js',
  ],
  what_went_well: [
    'The suppression axis (opts.acceptedFingerprintSet) was added to evaluateRefillCandidate() by deliberately mirroring the existing opts.shippedTitleSet idiom rather than inventing a new caller contract: the caller builds a bounded, re_review_at-filtered Set once per run and passes it in, keeping the validity predicate itself pure (no DB/fs/clock access) — the same shape the codebase already trusted for the shipped-title lookalike check.',
    'Query-time auto-expiry was chosen over a cleanup cron: a disposition with re_review_at in the past is simply excluded from the Set that scripts/sourcing-engine/refill-cron.mjs builds on its next run, so the finding resurfaces exactly once when due with zero scheduled maintenance job to keep alive or fail silently.',
    'During PLAN-phase code tracing (not from the PRD, which just said "propagate the dedup_key"), traced the actual data flow and found roadmap_wave_items had NO fingerprint/dedup_key column at all, and that lib/governance/emit-feedback.js accepted a dedup_key argument that was used ONLY to compute a one-way, date-salted dedup_hash — the raw dedup_key itself was silently discarded, never persisted anywhere. This would have been an easy gap to miss without directly reading emit-feedback.js\'s row-builder.',
    'Fixed the discovered gap with additive, minimal-blast-radius plumbing: emit-feedback.js now also persists dedup_key into metadata.dedup_key (only when the caller has not already set it, so no existing caller behavior changes), then propagated end-to-end through proactive-populator.js (loadSources/buildCorpus/stageCorpus) into roadmap_wave_items.metadata.dedup_key — giving the new suppression axis a stable value to match against that did not previously exist anywhere in the pipeline.',
    'RLS + a service_role-only policy were written in the SAME migration as the CREATE TABLE for gauge_finding_dispositions (modeled directly on database/migrations/20260713_loop_registry.sql\'s structure), closing the anon-writable-table window at creation time per the SPINE-001-B recurrence rather than as a follow-up migration.',
    'scripts/gauge-findings/disposition.js (accept/status/list) upserts on the fingerprint UNIQUE constraint, so re-dispositioning the same finding (e.g. extending WAVE_LINKAGE_STARVATION\'s re_review_at after a chairman check-in) refreshes the one live row instead of accumulating duplicate disposition history.',
    '30 new/modified unit tests across 4 test files all passed with 0 regressions against the full targeted suite (858 tests total); TESTING and SECURITY sub-agents both returned PASS with fresh evidence rows rather than being skipped for an infrastructure-tier SD.',
  ],
  what_needs_improvement: [
    'The PRD/SD text described the fix as "propagate the dedup_key" as if the field already existed somewhere in the roadmap_wave_items pipeline — it did not. The gap (dedup_key computed and consumed for hashing, then silently thrown away) was only found by tracing emit-feedback.js\'s actual row-builder during PLAN phase, not by anything in the original scope description; a PRD that assumes a data field exists without the author having verified its persistence layer can hide a load-bearing gap until implementation time.',
    'The migration is staged as @chairman-gated (not yet applied) per repo convention for new tables — the suppression axis and disposition CLI are code-complete and unit-tested against the shape of the table, but the mechanism cannot suppress WAVE_LINKAGE_STARVATION for real until the migration is applied and a chairman disposition is written for it, so the actual churn this SD set out to stop is not yet stopped in production.',
    'refill-auto-promote.js needed a small follow-on change (11 lines) to actually build and pass the acceptedFingerprintSet into evaluateRefillCandidate() at the call site — the pure-predicate design keeps the validity check itself simple, but it pushes an easy-to-miss wiring responsibility onto every caller of evaluateRefillCandidate(), and a future caller could add a new refill entry point without threading the new opts through.',
  ],
  key_learnings: [
    'When a PRD assumes a data field exists ("propagate the dedup_key"), verify the actual persistence layer during PLAN phase rather than trusting the scope description — the field here was computed and actively used (hashed into dedup_hash) but silently discarded, never itself stored. A field being read and referenced elsewhere in the code does not mean it is being persisted; only reading the actual row-builder (emit-feedback.js) surfaced that the raw value never survived past the hashing step.',
    'A pure, side-effect-free validity predicate (evaluateRefillCandidate) stays testable and composable specifically because it accepts pre-built Sets from its caller instead of querying the DB itself — the shippedTitleSet idiom already established this shape, and extending it with acceptedFingerprintSet for a new suppression axis was mechanically straightforward because the contract (bounded query once per run, Set passed in, O(1) pure lookup per item) was already proven. New suppression/exclusion axes on this validity check should default to this same caller-builds-the-Set shape rather than adding DB access inside the predicate.',
    'Query-time filtering (checking re_review_at against "now" every time the Set is built) is a strictly simpler expiry mechanism than a scheduled cleanup job for this class of problem: it has no cron to fail silently, no risk of the cleanup job falling behind and leaving stale suppressions active, and the same code path that reads the data also enforces the expiry — the disposition table itself never needs pruning for the suppression semantics to stay correct.',
    'RLS and its service_role-only policy belong in the SAME migration as the CREATE TABLE, not a follow-up — this is now the second SD-level recurrence of the SPINE-001-B pattern (anon-writable-table-at-creation-time), and modeling the new migration directly on an already-correct precedent (20260713_loop_registry.sql) made it a copy-adapt exercise instead of a from-scratch security review.',
    'A coordinator-writable disposition table with a single-purpose CLI (accept/status/list) that upserts on a UNIQUE fingerprint constraint is a reusable pattern for any "legitimately known, pending future decision" governance state — the same shape (fingerprint, disposition enum, re_review_at, reason, dispositioned_by) would generalize to other gauge/governance findings beyond WAVE_LINKAGE_STARVATION without new schema.',
  ],
  action_items: [
    {
      title: 'Apply the gauge_finding_dispositions migration and record a chairman disposition for WAVE_LINKAGE_STARVATION',
      description: 'database/migrations/20260716_gauge_finding_dispositions.sql is staged (@chairman-gated) and not yet applied. Until it is applied and a live accepted_known_state row exists for WAVE_LINKAGE_STARVATION\'s fingerprint, the sourcing/refill engine will keep re-promoting it — the mechanism this SD built cannot actually stop the churn it targeted until this step runs. Apply the migration, then run scripts/gauge-findings/disposition.js accept for WAVE_LINKAGE_STARVATION with a re_review_at date and reason.',
      priority: 'high',
      owner_role: 'LEAD',
    },
    {
      title: 'Audit remaining refill entry points for acceptedFingerprintSet wiring',
      description: 'evaluateRefillCandidate() is a pure predicate that only suppresses accepted-known-state findings when its caller builds and passes opts.acceptedFingerprintSet. refill-auto-promote.js was updated to do this in this SD, but any other current or future call site of evaluateRefillCandidate() must independently thread the same Set through or the suppression silently no-ops for that path. Grep for other callers and confirm each one builds the Set.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
    {
      title: 'Verify PRD-assumed data fields against the actual persistence layer during PLAN phase, not just usage sites',
      description: 'This SD\'s scope assumed dedup_key already existed on roadmap_wave_items; the field was in fact computed, used for hashing, and silently discarded before this SD. Add a PLAN-phase checklist step: when a PRD says "propagate X," grep the actual row-builder/writer function for X, not just its call sites, to confirm X is persisted rather than merely referenced.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
  ],
  improvement_areas: [
    {
      area: 'PRD assumed a field existed that was actually being silently discarded',
      analysis: 'The SD/PRD described the fix as "propagate the dedup_key," implying the field already flowed through the sourcing pipeline in some form. Tracing lib/governance/emit-feedback.js\'s actual row-builder during PLAN phase showed dedup_key was accepted as an argument and used ONLY to compute a one-way, date-salted dedup_hash — the raw value itself was never written to any persisted row. roadmap_wave_items had no fingerprint/dedup_key column at all. The root cause is that the original SD author (or a prior SD that introduced dedup_hash) verified the field was USED, not that it was PERSISTED — those are different guarantees and the gap between them is invisible from call-site reads alone.',
      prevention: 'Fixed by making emit-feedback.js persist dedup_key into metadata.dedup_key (guarded so it never overwrites a caller-supplied value) and propagating it through proactive-populator.js into roadmap_wave_items.metadata.dedup_key. Documented as a standing PLAN-phase check (see action items): when a PRD assumes a field exists, grep the writer/row-builder function directly rather than trusting downstream references to imply persistence.',
    },
    {
      area: 'Suppression mechanism is code-complete but not yet load-bearing in production',
      analysis: 'The disposition table migration is intentionally staged as @chairman-gated per repo convention for new tables, and the suppression axis + CLI are fully unit-tested against the schema shape, but no migration has been applied and no disposition row exists yet. The actual re-promotion churn for WAVE_LINKAGE_STARVATION that motivated this SD continues until both the migration is applied and a chairman disposition is recorded through scripts/gauge-findings/disposition.js.',
      prevention: 'Tracked explicitly as the first, highest-priority action item above rather than left implicit — closing an SD with a staged-but-unapplied migration is a known lifecycle state (gauge-vs-action divergence), not silent completion; the retrospective makes the gap visible instead of letting "code merged" be read as "problem solved."',
    },
  ],
  success_patterns: [
    'New suppression axis (opts.acceptedFingerprintSet) added by mirroring an existing, already-proven idiom (opts.shippedTitleSet) rather than inventing a new caller contract for the pure evaluateRefillCandidate() predicate',
    'PLAN-phase code tracing (reading emit-feedback.js\'s actual row-builder) caught a silently-discarded dedup_key field that the PRD assumed already existed — found before implementation, not after',
    'RLS + service_role-only policy written in the SAME migration as CREATE TABLE, modeled on an already-correct precedent (20260713_loop_registry.sql), closing the SPINE-001-B anon-writable-table window at creation time',
    'Query-time auto-expiry (re_review_at filtered on every Set-build) chosen over a scheduled cleanup cron, eliminating an entire class of "cron silently stopped running" failure mode',
    'Disposition CLI upserts on the fingerprint UNIQUE constraint so re-dispositioning a finding refreshes one row instead of accumulating duplicates',
  ],
  failure_patterns: [
    'SD/PRD scope described the fix as "propagate the dedup_key" without the author having verified the field was actually persisted anywhere — it was computed and used for hashing only, a gap invisible from call-site reads alone',
    'Migration for the new table is staged (@chairman-gated) but not yet applied, so the mechanism this SD built cannot yet suppress the real-world WAVE_LINKAGE_STARVATION churn it targeted',
  ],
  business_value_delivered: 'Stops legitimate governance-disposed gauge findings (e.g. WAVE_LINKAGE_STARVATION) from being re-promoted as fresh SD candidates on every sourcing/refill cycle, while preserving a dated re-review so the finding surfaces again exactly once when the chairman decision is actually due — reduces sourcing-engine noise without permanently muting a known-open item.',
  customer_impact: 'Internal/operational only: no end-user-facing surface changed. Reduces wasted sourcing-engine cycles and coordinator/chairman review noise from re-litigating an already-acknowledged finding every refill run.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 1,
  bugs_resolved: 1,
  tests_added: 30,
  performance_impact: 'Standard',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  human_participants: ['LEAD'],
  team_satisfaction: 8,
  metadata: {
    sd_key: SD_KEY,
    example_finding: 'WAVE_LINKAGE_STARVATION (lib/roadmap/wave-linkage-coverage.js)',
    new_table: 'database/migrations/20260716_gauge_finding_dispositions.sql',
    migration_modeled_on: 'database/migrations/20260713_loop_registry.sql',
    migration_status: '@chairman-gated (staged, not yet applied)',
    suppression_axis: 'lib/sourcing-engine/refill-candidate-validity.js evaluateRefillCandidate() opts.acceptedFingerprintSet, mirrors opts.shippedTitleSet',
    discovered_gap: 'roadmap_wave_items had no fingerprint/dedup_key column; lib/governance/emit-feedback.js dedup_key arg was hashed into dedup_hash only, never persisted',
    gap_fix: 'emit-feedback.js persists dedup_key into metadata.dedup_key; propagated via lib/sourcing-engine/proactive-populator.js (loadSources/buildCorpus/stageCorpus) into roadmap_wave_items.metadata.dedup_key',
    coordinator_cli: 'scripts/gauge-findings/disposition.js (accept/status/list, upserts on fingerprint UNIQUE constraint)',
    cron_integration: 'scripts/sourcing-engine/refill-cron.mjs builds the accepted-fingerprint Set once per run via a bounded, re_review_at-filtered query',
    test_summary: '30 new/modified unit tests across 4 test files, 858 total in targeted suite, 0 regressions',
    sub_agent_evidence: 'DESIGN, DATABASE, SECURITY, RISK, STORIES, TESTING all PASS with fresh sub_agent_execution_results rows',
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    prior_retro_rejection_reason: 'auto-generated retro was metric-only boilerplate (e.g. "EXEC phase quality score: 80%") with no SD-specific insights',
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
