#!/usr/bin/env node
/**
 * Enrich SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001 with the concrete audit findings from
 * QF-20260911-515, so the SD is self-contained for whoever picks it up rather than a bare title.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001';

const LIVE_CALL_SITES = [
  'server/routes/feedback.js',
  'scripts/sd-from-feedback.js',
  'scripts/modules/learning/sd-creation.js',
  'scripts/modules/inbox/assist-runner.js',
  'scripts/modules/inbox/auto-resolve-recovered.js',
  'scripts/modules/inbox/auto-triage.js',
  'scripts/modules/handoff/executors/lead-final-approval/index.js',
  'scripts/feedback-staleness-check.js',
  'scripts/feedback-link-resolution.mjs',
  'scripts/feedback-fingerprint-promoter.mjs',
  'scripts/feedback-age-out.mjs',
  'scripts/create-quick-fix.js',
  'scripts/corrective-triage.mjs',
  'scripts/clockwork/prod-error-sweep-loop.cjs',
  'scripts/clockwork/ci-autotriage-loop.cjs',
  'scripts/clockwork/gh-failure-monitor.cjs',
  'scripts/chairman-decisions.mjs',
  'scripts/adversarial-verification-sweep.mjs',
  'lib/uat/risk-router.js',
  'lib/sub-agents/retro/db-operations.js',
  'lib/sd-creation/source-adapters/feedback.js',
  'lib/quality/triage-engine.js',
  'lib/quality/snooze-manager.js',
  'lib/quality/quarantine-engine.js',
  'lib/quality/ignore-patterns.js',
  'lib/quality/burst-detector.js',
  'lib/quality/assist-engine.js',
  'lib/quality/audit-logger.js',
  'lib/learning/outcome-tracker.js',
  'lib/learning/feedback-clusterer.js',
  'lib/governance/withheld-registry.mjs',
  'lib/governance/resolve-feedback.js',
  'lib/feedback/release-preclaim.js',
  'lib/feedback/preclaim-feedback-rows.js',
  'lib/feedback-capture.js',
  'lib/eva/uat-failure-triage.js',
  'lib/eva/event-bus/handlers/feedback-quality-updated.js',
  'lib/eva/eva-master-scheduler.js',
  'lib/coordinator/pending-question-timer.cjs',
  'lib/chairman/ratification-capture-detector.mjs',
  'lib/chairman/classifier-denial-guard.mjs',
];

const description = `MEASURED (QF-20260911-515, 2026-09-11): database/chairman-gated/20260907_feedback_immutability_trigger.sql (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E FR-3) added a BEFORE UPDATE trigger on public.feedback that unconditionally raises 'feedback is append-only: row <id> cannot be modified after insert'. Confirmed LIVE in the database via a direct probe (insert + update on a throwaway row; the update failed with that exact message), despite the migration file's own header still reading "Chairman verification NOT yet obtained" -- the header is a ceremony marker, not apply-state.

Grepping .from('feedback')\\s*.update( across the repo (excluding tests/, scripts/one-off/, scripts/archive/) found ${LIVE_CALL_SITES.length} LIVE production call sites that this trigger now silently breaks, every time they run. Three spot-checked directly: lib/quality/quarantine-engine.js (status transitions to 'quarantined'), lib/governance/resolve-feedback.js (resolving findings), scripts/feedback-age-out.mjs (archiving informational_note rows) -- all three are core feedback-lifecycle mechanisms, not edge cases.

gauge-runner.mjs's re-emission stamp (one of these ${LIVE_CALL_SITES.length}) was fixed under QF-20260911-515 by switching from an UPDATE to an INSERT of a new row with a metadata.re_emission_of pointer -- the trigger's own prescribed "a correction is a new row" pattern. The other ${LIVE_CALL_SITES.length - 1} call sites below were NOT fixed (out of a single QF's scope) and need the same triage: does an INSERT-based correction fit this call site's semantics, or does it need a different remediation (e.g. a dedicated non-feedback table for post-insert lifecycle state)? Each site should be verified against the LIVE database (not assumed from reading the code) before being called fixed, the same way this SD's own premise was verified.

LIVE CALL SITES (verify each still applies against current main before fixing -- this list is a snapshot from 2026-09-11):
${LIVE_CALL_SITES.map((f) => `- ${f}`).join('\n')}`;

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ description, scope: description })
    .eq('sd_key', SD_KEY)
    .select('id, sd_key');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`no row matched sd_key=${SD_KEY}`);
  console.log(`Enriched ${data[0].sd_key} (${data[0].id}) with ${LIVE_CALL_SITES.length} audit findings.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
