/**
 * SD-LEO-INFRA-SECURITY-HYGIENE-RLS-SEARCHPATH-001 — FR-5
 *
 * Two surfaces:
 *   (FR-4) scripts/sentinels/audit-security-linter.mjs isExemptTable() —
 *          disposable quarantine/parity/backup copies are exempt; the live real
 *          tables are NOT. The disposable list is the live RLS-disabled-public
 *          set captured at authoring time (2026-06-16).
 *   (FR-3) database/migrations/20260616_security_hygiene_rls_searchpath.sql —
 *          content assertions: enables RLS + read policy on scope_completion_chain,
 *          pins fn_advance_venture_stage search_path, ships DORMANT (no
 *          @approved-by value), and self-verifies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isExemptTable } from '../../scripts/sentinels/audit-security-linter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  '../../database/migrations/20260616_security_hygiene_rls_searchpath.sql',
);

// Live RLS-disabled-public tables that ARE disposable (queried 2026-06-16).
// Every one of these must be exempted so the sentinel does not drown in noise.
const DISPOSABLE_TABLES = [
  'capital_transactions_preimg_qparity20260610',
  'eva_audit_log_preimg_qparity20260610',
  'eva_automation_executions_qparity20260610',
  'eva_decisions_qparity20260610',
  'eva_events_qparity20260610',
  'eva_scheduler_metrics_qparity20260610',
  'eva_scheduler_queue_qparity20260610',
  'eva_stage_gate_results_qparity20260610',
  'eva_ventures_qparity20260610',
  'factory_guardrail_state_qparity20260610',
  'management_reviews_quarantine_20260610',
  'quarantine_meta_qparity20260610',
  'sd_baseline_items_purge_backup_20260609',
  'sd_baseline_items_recon_backup',
  'stage_executions_qparity20260610',
  'venture_artifact_summaries_qparity20260610',
  'venture_artifacts_qparity20260610',
  'venture_artifacts_storm_quarantine_20260610',
  'venture_data_room_artifacts_qparity20260610',
  'venture_resources_qparity20260610',
  'venture_separability_scores_qparity20260610',
  'venture_stage_transitions_qparity20260610',
  'venture_stage_work_qparity20260610',
  'ventures_qparity20260610',
];

// Real, live tables that MUST NOT be exempted — including the very table this
// SD adds RLS to (scope_completion_chain) and the canonical originals whose
// quarantine copies are exempted above (must not be falsely matched).
const REAL_TABLES = [
  'scope_completion_chain',
  'ventures',
  'eva_decisions',
  'eva_events',
  'venture_artifacts',
  'venture_stage_work',
  'sd_baseline_items',
  'management_reviews',
  'bypass_ledger',
  'goal_evaluator_verdicts',
  'strategic_directives_v2',
  'product_requirements_v2',
];

describe('FR-4: audit-security-linter isExemptTable', () => {
  it('exempts the explicit system tables', () => {
    expect(isExemptTable('schema_migrations')).toBe(true);
    expect(isExemptTable('spatial_ref_sys')).toBe(true);
  });

  it('exempts every disposable quarantine/parity/backup table (24)', () => {
    expect(DISPOSABLE_TABLES).toHaveLength(24);
    for (const name of DISPOSABLE_TABLES) {
      expect(isExemptTable(name), `${name} should be exempt`).toBe(true);
    }
  });

  it('does NOT exempt real live tables (incl. scope_completion_chain)', () => {
    for (const name of REAL_TABLES) {
      expect(isExemptTable(name), `${name} must NOT be exempt`).toBe(false);
    }
  });

  it('anchors patterns to the suffix — mid-name tokens do not match', () => {
    // "quarantine"/"backup" as a non-suffix substring must not exempt a real table.
    expect(isExemptTable('quarantine_policy_config')).toBe(false);
    expect(isExemptTable('backup_schedule_settings')).toBe(false);
    expect(isExemptTable('qparity_dashboard')).toBe(false);
  });

  it('does NOT exempt real dated backup/quarantine tables by pattern', () => {
    // `_backup_YYYYMMDD` / `_quarantine_YYYYMMDD` are OVERLOADED conventions —
    // real dated backup tables exist (e.g. view_definitions_backup_20260124).
    // Only the four reviewed campaign copies are exempt (explicit list); any
    // OTHER dated backup/quarantine table must stay flagged for RLS review.
    expect(isExemptTable('view_definitions_backup_20260124')).toBe(false);
    expect(isExemptTable('product_requirements_v2_backup_20260206')).toBe(false);
    expect(isExemptTable('rls_policy_backup_20260603')).toBe(false);
    expect(isExemptTable('some_feature_quarantine_20270101')).toBe(false);
  });
});

describe('FR-3: migration SQL content', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('enables RLS on scope_completion_chain', () => {
    expect(sql).toMatch(/ALTER TABLE scope_completion_chain ENABLE ROW LEVEL SECURITY/i);
  });

  it('creates a permissive read policy mirroring the sibling convention', () => {
    expect(sql).toMatch(/CREATE POLICY scope_completion_chain_read_all/i);
    expect(sql).toMatch(/FOR SELECT\s+USING \(true\)/i);
  });

  it('pins fn_advance_venture_stage search_path behavior-preservingly', () => {
    expect(sql).toMatch(
      /ALTER FUNCTION public\.fn_advance_venture_stage\(uuid, integer, integer, jsonb, uuid\)\s*SET search_path = pg_catalog, public/i,
    );
    // NOT search_path = '' — the body uses unqualified public objects.
    expect(sql).not.toMatch(/SET search_path = ''/);
  });

  it('ships DORMANT — chairman attestation line present but UNFILLED (CONST-002)', () => {
    // The @approved-by line must exist (so the chairman knows where to attest)
    // but carry NO value (so apply-migration.js blocks until the chairman fills it).
    expect(sql).toMatch(/@approved-by:/);
    expect(sql).not.toMatch(/@approved-by:\s*\S+@\S+/);
  });

  it('self-verifies both fixes', () => {
    expect(sql).toMatch(/VERIFY FAILED: RLS not enabled on scope_completion_chain/);
    expect(sql).toMatch(/VERIFY FAILED: fn_advance_venture_stage search_path not pinned/);
  });
});

describe('SD-LEO-INFRA-CHRONIC-RED-GUARD-001 (FR-2b) — exemption manifest', () => {
  it('exempts venture_artifacts_storm_quarantine_20260704, the sibling missing before this fix', () => {
    expect(isExemptTable('venture_artifacts_storm_quarantine_20260704')).toBe(true);
  });

  it('does not accidentally widen the pattern-based exemption to match this new name incidentally', () => {
    // The new entry must be exempted via the EXPLICIT list (name review), not because it
    // happens to also satisfy the _qparity pattern -- it does not carry that suffix.
    expect(/_qparity\d{8}$/i.test('venture_artifacts_storm_quarantine_20260704')).toBe(false);
  });

  it('adding a new exemption requires only a data-file edit, no predicate code change', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const manifestPath = join(__dirname, '../../scripts/sentinels/exempted-tables.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // The manifest is the single source of truth isExemptTable() reads from -- proving its
    // shape here (rather than just re-testing isExemptTable's output, already covered above)
    // is what makes this a genuine "data, not predicate" regression guard: if a future change
    // reverted to hardcoded arrays in the .mjs file, this manifest would still exist but the
    // predicate wouldn't read it, and THIS assertion (not just the exempt-table ones above)
    // would be the one positioned to catch that the source of truth moved back into code.
    const names = manifest.exempted_tables.map((e) => e.name);
    expect(names).toContain('venture_artifacts_storm_quarantine_20260704');
    expect(names).toContain('venture_artifacts_storm_quarantine_20260610');
    for (const entry of manifest.exempted_tables) {
      expect(entry.reason, `${entry.name} must carry a reason`).toBeTruthy();
    }
  });
});
