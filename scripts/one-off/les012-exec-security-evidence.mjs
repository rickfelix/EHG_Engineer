#!/usr/bin/env node
/**
 * SECURITY sub-agent evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-012, EXEC-TO-PLAN.
 *
 * READ PROVENANCE: all file reads from the SD worktree
 * C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-012.
 * All DB facts measured live via the exec_sql RPC (SELECT-only) and supabase-js reads
 * against product_requirements_v2 and governance_audit_log at review time.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';

const findings = [
  {
    id: 'backfill-blind-replaced-metadata-7743-keys-destroyed-on-1382-rows',
    severity: 'CRITICAL',
    summary:
      "REVIEW ITEM 3 -- CONFIRMED PRODUCTION DATA DESTRUCTION, MEASURED NOT INFERRED. The task framing states the backfill writes metadata = metadata || {integration_backfill: {...}}. IT DOES NOT. scripts/one-off/backfill-integration-operationalization-v2.mjs:93-110 issues supabase .update({ integration_operationalization: placeholder, metadata: { integration_backfill: {...} } }). PostgREST PATCH assigns the column VALUE; supabase-js cannot express a jsonb double-pipe merge (stated verbatim in lib/coordinator/safe-metadata-merge.mjs:18-19). There is no spread of the prior value and no merging trigger -- I enumerated all 7 non-internal triggers on product_requirements_v2 via pg_trigger/pg_get_triggerdef: audit_product_requirements, planning_section_auto_update_trigger, trg_doctrine_constraint_prd, trg_prd_creation_source_advisory, trg_validate_integration_section_keys, trigger_sync_prd_sd_linking, update_prd_timestamp. I read the source of the only two that could plausibly touch metadata (governance_audit_trigger, sync_prd_sd_linking via pg_proc.prosrc) -- neither writes metadata. So metadata was REPLACED WHOLESALE on every row written. MEASURED BLAST RADIUS from governance_audit_log (AFTER UPDATE trigger storing row_to_json(OLD)), window changed_at in [2026-09-14 02:46:00, 2026-09-14 02:49:00] AND new_values->metadata contains integration_backfill: 1,570 audited rows; old metadata was NULL on 0; was an empty object on 188; HAD KEYS on 1,382; total keys destroyed = 7,743. Corroborated independently against current live state: all 4,839 PRD rows read, 1,570 carry metadata.integration_backfill, and ALL 1,570 have EXACTLY ONE metadata key (zero carry any other key), while 3,201 of the 3,269 untouched rows (97.9%) carry at least one key with a distribution peaking at 11-15 keys. The 'those rows were already empty' hypothesis is refuted by the audit log's own old_values.",
  },
  {
    id: 'destroyed-keys-include-phase-handoff-and-sub-agent-provenance',
    severity: 'CRITICAL',
    summary:
      "WHAT WAS DESTROYED, by key, counted from governance_audit_log old_values over the same window: plan_handoff 1,293 rows; database_analysis 312; design_analysis 284; risk_analysis 228; created_via 224; stories_analysis 202; generation_pattern 199; grounding_validation 195; validated_at 195; content_quality 195; sd_key 154; vision_key 69; estimated_loc 52; integration_contract 48; arch_key 39; generated_by 36; parent_orchestrator 32; plan_verify_sub_agents 27; user_stories 27; exploration_summary 26; parent_sd 26; integration_operationalization 25. This is not incidental bookkeeping: plan_handoff, plan_verify_sub_agents, grounding_validation and the *_analysis keys are PLAN-phase handoff and sub-agent provenance. Under the gate-evidence-provenance rule in CLAUDE.md Session Prologue item 2 ('evidence without provenance is absent, not weak'), 1,293 PRDs just lost their recorded handoff provenance and 32 lost their parent_orchestrator linkage. parent_sd / parent_orchestrator loss is additionally a lineage-integrity issue for orchestrator SDs.",
  },
  {
    id: 'fully-recoverable-from-governance-audit-log-no-post-backfill-writes',
    severity: 'INFO',
    summary:
      "RECOVERY IS AVAILABLE AND CURRENTLY UNCONTAMINATED -- measured, and this is the mitigating fact that keeps this from being permanent. governance_audit_trigger (AFTER INSERT OR DELETE OR UPDATE, FOR EACH ROW) writes old_values = row_to_json(OLD) for every UPDATE, so the complete pre-backfill metadata of every affected row is retained. Coverage check: current rows carrying the marker = 1,570; distinct record_ids in the audit window = 1,570; rows present in the live table but absent from the audit set = 0. Contamination check: distinct record_ids among the 1,570 that received ANY further UPDATE after changed_at 2026-09-14 02:49:00 = 0, so restoring old_values->metadata merged under the marker cannot clobber newer writes AS OF THIS REVIEW. That window closes the moment any of those PRDs is written again, which makes this time-sensitive rather than optional. Recommended remediation (do NOT re-run the backfill to fix it): for each of the 1,570 record_ids, UPDATE product_requirements_v2 SET metadata = (audit.old_values->'metadata') || jsonb_build_object('integration_backfill', metadata->'integration_backfill') -- restoring the original keys while preserving the provenance marker -- guarded per-row on the row not having been updated since the backfill.",
  },
  {
    id: 'ac4-and-rollback-plan-cannot-detect-the-destruction-they-caused',
    severity: 'HIGH',
    summary:
      "WHY THIS SHIPPED -- a test-design defect, not just a coding slip, recorded because the same shape will recur otherwise. The PRD's FR-5 AC-4 reads 'Every written row carries metadata.integration_backfill'. That assertion is satisfied EXACTLY AS WELL by a destructive blind replace as by a correct merge -- it is a presence check on the key the write adds, with no assertion about the keys the write must PRESERVE. The PRD's own design note (create-prd-les012.mjs:73) reasons only about trigger legality: 'the trigger only fires BEFORE INSERT OR UPDATE OF integration_operationalization and does not inspect metadata, so this is safe and does not trip it'. It asks 'will this write be REJECTED?' and never asks 'what does this write DESTROY?'. Compounding it, the documented rollback (create-prd-les012.mjs:252 and :349) is 're-null the specific rows carrying metadata.integration_backfill' -- executing that rollback as written would restore the integration column and leave the 7,743 destroyed metadata keys permanently gone, because it treats the marker as the only thing the write touched. Remediation must add a preservation assertion (old keys are a subset of new keys) to the test suite, not merely fix the statement.",
  },
  {
    id: 'repo-had-a-named-helper-for-exactly-this-anti-pattern',
    severity: 'HIGH',
    summary:
      "ROOT CAUSE, and the repo already knew. lib/coordinator/safe-metadata-merge.mjs (QF-20260720-597) exists specifically to stop this class: its header states that supabase-js .update() cannot express a JSONB double-pipe merge directly, names the read-spread-write full-blob overwrite as 'unsafe by construction', and routes through a raw pg connection to do a real merge. mergeMetadataKeys() is hard-scoped to strategic_directives_v2 keyed on sd_key, so it was NOT directly reusable for product_requirements_v2 -- which is the actual gap: the documented anti-pattern has a guard for the SD table and NO equivalent for the PRD table, so a PRD-table metadata write has nothing to fall into. Note the backfill's form is strictly worse than the one that helper warns about: it is not even a stale read-spread-write, it is metadata: { onlyTheNewKey } with no read of the prior value at all. Systemic follow-up: generalize the helper to a (table, pk, patch) signature, or add a lint rule refusing a literal metadata: object in a supabase .update() outside an approved merge seam.",
  },
  {
    id: 'same-blind-replace-latent-in-prd-creator-update-existing-branch',
    severity: 'MEDIUM',
    summary:
      "A SECOND, STILL-LIVE INSTANCE of the same pattern in a file this SD touches -- pre-existing, NOT introduced here, and surfaced because this SD's own change sits three lines above it. scripts/prd/prd-creator.js:346 (UPDATE-existing branch of createPRDWithValidatedContent) passes metadata: llmContent.metadata || undefined. The || undefined means the key is dropped from the JSON body when absent, so today it is inert; but whenever a caller DOES supply llmContent.metadata, that update blind-replaces the existing PRD's entire metadata column, exactly as the backfill did. Worth noting this SD's own scripts/one-off/create-prd-les012.mjs routes through this branch -- it is safe only because its llmContent carries no metadata key (verified by grep: all 9 'metadata' hits in that file are inside descriptive prose strings, none is an llmContent.metadata assignment). Recommend converting this call site as part of the remediation rather than leaving an armed second copy in the same file.",
  },
  {
    id: 'credential-handling-clean-service-role-required-no-anon-fallback',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 1 -- CLEAN. Both new one-offs import createSupabaseServiceClient from lib/supabase-client.js, matching the convention of the existing scripts/one-off/*.mjs corpus (1,466 files). Read at source, lib/supabase-client.js:101-124: the factory requires SUPABASE_SERVICE_ROLE_KEY and THROWS if it is absent (:109-111) -- there is NO anon-key fallback, so the under-privileged-silent-no-op failure mode asked about cannot occur; a missing key fails loudly before any query. No key is logged: every console.log in both scripts emits counts, ids, modes and error .message strings only (enumerated all 10 template literals in the backfill; none interpolates an env var or client field). No key is passed as a URL parameter, header value, or payload field by either script.",
  },
  {
    id: 'no-injection-surface-no-raw-sql-no-rpc',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 2 -- CLEAN. Grepped all 5 changed/new files for rpc(, exec_sql, .sql and template-literal interpolation: every hit is a console.log or an Error-message template literal; zero raw SQL, zero RPC calls, zero string-built filters. Every query-builder filter value is either a hardcoded constant (.is('integration_operationalization', null), .order('id'), .limit(BATCH_SIZE=500)) or a UUID that came out of the database on the immediately preceding SELECT (.gt('id', lastId) at :55, .eq('id', id) at :107) -- never user, argv or env input. PostgREST parameterizes these, and no value crosses a string-concatenation boundary. The only argv read is process.argv.includes('--execute') (:34), a boolean membership test that cannot carry a payload. No query-injection exposure introduced anywhere in this change.",
  },
  {
    id: 'provenance-marker-leaks-nothing-but-is-the-only-surviving-provenance',
    severity: 'LOW',
    summary:
      "REVIEW ITEM 4 -- traceable, and clean on the leak axis, with one framing correction. The marker payload is exactly {at, sd, script, reason, shape_version} (read from a live row): an ISO timestamp, the SD key, the script filename, a PAT reference, and a shape string. No session id, no CLAUDE_SESSION_ID, no credential, no token, no file path, no actor identity -- nothing a lower-privilege reader of product_requirements_v2.metadata could not already infer from the SD record. All 1,570 rows carry it, so the WRITE is traceable. The correction: because the write replaced the column, this marker is now the ONLY provenance those rows have -- it did not augment an audit trail, it replaced one. Traceability of this backfill was achieved at the cost of the traceability of everything that preceded it on those rows.",
  },
  {
    id: 'nc-exec-006-clean-both-new-one-offs-main-guarded',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 5 -- CLEAN for this SD's files. Both new one-offs guard their entrypoint with isMainModule(import.meta.url) from lib/utils/is-main-module.js: backfill-integration-operationalization-v2.mjs:139-144 and create-prd-les012.mjs (final block). A future import() of either for inspection therefore cannot re-trigger the live mutation -- the exact NC-EXEC-006 incident class. Verified by the repo's own enforcement rather than by eye: scripts/lint/require-main-guard-in-one-off-lint.mjs scans 1,512 files and reports 2 violations, and NEITHER is from this SD -- both are sibling SD-LEARN-FIX-ADDRESS-PAT-LES-010 artifacts (_explore-write-result-...-lead-to-plan.mjs:96 and _retro-write-result-...-plan-to-lead.mjs:90), reported here only so the pre-existing pair is not mistaken for this SD's output. No non-one-off module bare-imports either new file; the sole importer is tests/unit/backfill-integration-operationalization-v2.test.js, which imports the named export enumerateNullRows and is inert at import thanks to the guard. The backfill's cross-import of scripts/prd/prd-creator.js is side-effect-free at module scope (imports plus function declarations only).",
  },
];

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'FAIL',
    confidence_score: 98,
    findings,
    conditions: [
      'BLOCKER: restore the 7,743 destroyed metadata keys on the 1,382 affected rows from governance_audit_log.old_values before any further write lands on those PRDs (0 contaminating writes as of this review; the safe window is open but closing).',
      'BLOCKER: fix scripts/one-off/backfill-integration-operationalization-v2.mjs to perform a real jsonb merge before it can ever be re-run; as written, a re-run repeats the destruction on any future NULL rows.',
      'BLOCKER: add a preservation assertion (pre-existing metadata keys are a subset of post-write keys) to tests/unit/backfill-integration-operationalization-v2.test.js -- the current AC-4 presence check passes under the destructive implementation.',
      'REQUIRED: correct the PRD rollback plan, which as written restores only the integration column and would make the metadata loss permanent.',
    ],
    justification:
      'FAIL on a measured, already-executed production data-destruction event: the backfill blind-replaced product_requirements_v2.metadata on 1,570 rows, destroying 7,743 keys across 1,382 of them (including plan_handoff on 1,293 rows and sub-agent/handoff provenance), rather than merging as the design intended and the PRD asserts. The code-path changes in the other 4 files are sound and the credential, injection and NC-EXEC-006 axes are clean; the verdict is driven entirely by the data-integrity finding. Recovery is fully available from governance_audit_log with zero contaminating writes at review time, which makes this correctable now and permanent later.',
    metadata: {
      review_items: {
        '1_credential_handling': 'CLEAN',
        '2_injection_dynamic_sql': 'CLEAN',
        '3_metadata_merge_integrity': 'FAIL -- blind replace, 7,743 keys destroyed on 1,382 of 1,570 rows',
        '4_provenance_audit_trail': 'traceable, no sensitive leak; marker is now the only surviving provenance',
        '5_nc_exec_006': 'CLEAN -- both new one-offs main-guarded, verified by repo lint',
      },
      measured: {
        prd_rows_total: 4839,
        rows_carrying_backfill_marker: 1570,
        marked_rows_with_exactly_one_metadata_key: 1570,
        marked_rows_retaining_any_other_key: 0,
        audited_backfill_rows: 1570,
        old_metadata_was_null: 0,
        old_metadata_empty_object: 188,
        old_metadata_had_keys: 1382,
        total_keys_destroyed: 7743,
        audit_recovery_coverage: '1570/1570',
        unrecoverable_rows: 0,
        rows_updated_after_backfill: 0,
        backfill_window_utc: ['2026-09-14T02:46:18.631Z', '2026-09-14T02:47:31.643Z'],
        top_destroyed_keys: {
          plan_handoff: 1293, database_analysis: 312, design_analysis: 284, risk_analysis: 228,
          created_via: 224, stories_analysis: 202, generation_pattern: 199, grounding_validation: 195,
          validated_at: 195, content_quality: 195, sd_key: 154, vision_key: 69, estimated_loc: 52,
          integration_contract: 48, arch_key: 39, generated_by: 36, parent_orchestrator: 32,
          plan_verify_sub_agents: 27, user_stories: 27, exploration_summary: 26, parent_sd: 26,
        },
      },
      checks_run: [
        'full read of all 5 changed/new files plus git diff HEAD for the 3 modified ones',
        'pg_trigger + pg_get_triggerdef census of all non-internal triggers on product_requirements_v2 (7 found)',
        'pg_proc.prosrc read of governance_audit_trigger and sync_prd_sd_linking (metadata-merge hypothesis refuted)',
        'live enumeration of all 4,839 product_requirements_v2 rows with metadata key-count distribution, marked vs unmarked',
        'governance_audit_log blast-radius aggregation over the backfill window (old vs new metadata key counts)',
        'per-key destroyed-key census via jsonb_object_keys lateral join',
        'recovery coverage + post-backfill contamination check (current marked ids vs audit record_ids vs later UPDATEs)',
        'read of lib/supabase-client.js:101-124 (service-role required, no anon fallback)',
        'grep of all 5 files for rpc/exec_sql/raw-SQL/template interpolation (injection surface)',
        'repo sweep for a canonical jsonb metadata-merge helper (found lib/coordinator/safe-metadata-merge.mjs, SD-table-scoped only)',
        'repo-wide sweep for non-one-off importers of scripts/one-off/**',
        'execution of scripts/lint/require-main-guard-in-one-off-lint.mjs (1,512 files, 2 violations, both pre-existing from LES-010)',
        'live read of the LES-012 PRD row and its own integration_operationalization/metadata state',
      ],
      blocking_conditions: [
        'metadata restoration from governance_audit_log for 1,382 rows',
        'backfill script converted to a true jsonb merge before any re-run',
        'preservation assertion added to the backfill test suite',
      ],
      non_blocking_followups: [
        'Generalize lib/coordinator/safe-metadata-merge.mjs beyond strategic_directives_v2, or add a lint rule refusing a literal metadata object inside a supabase .update() outside an approved merge seam',
        'Convert scripts/prd/prd-creator.js:346 (metadata: llmContent.metadata || undefined) -- armed second instance of the same blind-replace pattern',
        'Retrofit main guards on the 2 pre-existing SD-LEARN-FIX-ADDRESS-PAT-LES-010 one-offs flagged by the lint',
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'SECURITY' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? 'EXEC_TO_PLAN');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
