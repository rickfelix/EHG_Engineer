/**
 * Amend PRD-SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 with metadata.scope_amendment
 * documenting the discovery of pre-existing lib/eva/quality-findings/sd-generator.js
 * shipped by SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C.
 *
 * Pattern from feedback_prd_scope_correction_via_amendment.md.
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 (EXEC discovery, pre-implementation).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001';

const amendment = {
  amended_at: new Date().toISOString(),
  amended_by: 'EXEC (Claude session 6834e987-84fe-400e-b2a0-8050494db858)',
  amendment_type: 'pre_existing_artifact_reconciliation',
  rationale: 'Pre-EXEC code-Read discovered lib/eva/quality-findings/sd-generator.js already exists on origin/main (commit 38688d4eb4) shipped by SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C "Per-Finding SD Generator". PRD FR-1 wording "Author lib/eva/quality-findings/sd-generator.js" is incompatible with the present state. Additionally the PRD references three column/value names that do not match the schema shipped by SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-B (the "FR-B equivalent" lineage). This amendment reconciles names + reframes FR-1 as additive extension. No FR semantics change — strategic objectives intact.',
  prior_art: {
    sd_key: 'SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C',
    commit: '38688d4eb4',
    file: 'lib/eva/quality-findings/sd-generator.js',
    exports: ['generateRemediationSD', 'generateBatch', 'findExistingRemediation', 'buildCreateSdArgs', 'resolveTier', 'tierToSdType', 'TIER_MAP'],
    semantics: {
      idempotency: 'metadata.parent_finding_hash (single-key per finding)',
      sd_creation_path: 'spawn scripts/leo-create-sd.js (canonical pipeline with vision/arch checks, gates)',
      generator_tag: "metadata.generator='sd-generator.js' + metadata.parent_orchestrator='SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001'"
    }
  },
  fr_1_reframe: {
    original: 'Author lib/eva/quality-findings/sd-generator.js exposing generateRemediationSdsForVenture / generateRemediationSdsBatch',
    revised: 'EXTEND existing lib/eva/quality-findings/sd-generator.js by adding two new exports — generateRemediationSdsForVenture(ventureId, options) and generateRemediationSdsBatch(options) — alongside the existing generateRemediationSD / generateBatch exports. Both function families coexist with different idempotency models and SD-creation paths. Existing exports remain untouched (zero regression to SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C behavior). New functions use composite-key dedup (FR-3) and direct DRAFT INSERT (vs spawning leo-create-sd.js) for high-volume venture-scoped batching. Disambiguation note added at top of file documenting both call paths.',
    affected_acceptance_criteria: [
      'AC #1 unchanged: both new exports are named ESM exports',
      'AC #2 unchanged: only pending FAIL/WARN-equivalent rows are selected',
      'AC #3 unchanged: every NEW SD row satisfies status=draft + current_phase=LEAD + metadata.generated_by=fr-c-prime-generator',
      'AC #4 amended: existing column `sd_key` (NOT `finding_metadata.filed_sd_id`) is set on the source finding row to point at the inserted SD; sd_filed_at populated per FR-4',
      'AC #5 unchanged: module loads under Node 22 with zero new dependencies'
    ]
  },
  schema_name_mappings: {
    'PRD finding_type': 'existing column finding_category (per migration 20260429_venture_quality_findings.sql)',
    'PRD finding_metadata.filed_sd_id': 'existing column sd_key (TEXT, nullable, originally added for SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-C linkage)',
    'PRD severity IN (FAIL, WARN)': 'mapped to existing severity enum: FAIL ≡ severity IN (critical, high); WARN ≡ severity = medium; low rows are informational and excluded from SD generation per the spirit of FR-1',
    'PRD composite key (venture_id, finding_type, severity)': 'physical key (venture_id, finding_category, severity); same triple, renamed column'
  },
  fr_4_clarification: 'venture_quality_findings ships today with NO `status` column. FR-4 migration ADDS the column (TEXT NOT NULL DEFAULT \'pending\') alongside the CHECK constraint, the three timestamp columns, and the BEFORE UPDATE trigger. Existing rows backfill to status=\'pending\' atomically via column DEFAULT (no UPDATE pass needed). The existing UNIQUE (venture_id, finding_hash) constraint and existing finding_hash dedup are preserved.',
  fr_2_cron_implementation: 'GitHub Actions workflow with cron schedule (matches existing pattern from software-factory-poll.yml + leo-assist-periodic.yml). The node script entrypoint runs once per workflow tick and exits. Default workflow cron expression: hourly (0 * * * *). FR_C_POLL_INTERVAL_SEC env var is read-and-validated at script startup as documentation of the intended poll cadence; in single-shot GHA invocation it is informational. Daemon mode (looping with sleep FR_C_POLL_INTERVAL_SEC) is supported via --daemon flag for future operator-triggered persistent runs but not the canonical invocation path. The pg_advisory_lock on hashtext(\'fr_c_generator\') is the actual concurrency guarantee per FR-2 AC.',
  function_family_coexistence: {
    existing: {
      caller: 'Stage 20 quality loop (per-finding canonical SD creation via spawn)',
      idempotency: 'parent_finding_hash 1:1 dedup',
      use_when: 'Tier-aware single SD per finding with full leo-create-sd.js validation'
    },
    new: {
      caller: 'cron driver batch sweep (high-volume venture-scoped catch-up)',
      idempotency: 'composite (venture_id, finding_category, severity) with append-to-source_finding_ids[]',
      use_when: 'Multiple findings in same triple roll up under one SD; bypass leo-create-sd.js for direct DRAFT insert; rate-limited per-venture per-day'
    }
  },
  no_change_to_strategic_objectives: 'All five SD strategic_objectives intact: close lifecycle-loop, DRAFT-only output, decouple generator failures from analyzer commits, make deduplication observable, bounded output via rate limit. Risk mitigations and acceptance criteria semantics unchanged. PRD-vs-shipped reconciliation only.'
};

(async () => {
  const { data: prd, error: readErr } = await sb
    .from('product_requirements_v2')
    .select('metadata')
    .eq('id', PRD_ID)
    .single();
  if (readErr) { console.error('READ ERROR:', readErr); process.exit(1); }

  const newMetadata = {
    ...(prd.metadata || {}),
    scope_amendment: amendment
  };

  const { error: writeErr } = await sb
    .from('product_requirements_v2')
    .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
    .eq('id', PRD_ID);
  if (writeErr) { console.error('WRITE ERROR:', writeErr); process.exit(1); }

  console.log('PRD amended successfully:', PRD_ID);
  console.log('amendment.amended_at:', amendment.amended_at);
  console.log('amendment.amendment_type:', amendment.amendment_type);
})();
