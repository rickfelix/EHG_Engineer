/**
 * Unit tests for the op-co-A switch-on fence migration logic.
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-D FR-3.
 */

import { describe, it, expect } from 'vitest';
import { buildMigratedMetadata } from '../../../scripts/one-off/apply-switchon-gate-opco-a.mjs';

// Real op-co-A metadata shape, snapshotted live 2026-07-18 (pre-migration).
const REAL_OPCO_A_METADATA = {
  hold: {
    class: 'MIGRATION_APPLY',
    reason: 'Irreversible EXEC (live venture deploy, payment-account creation, DNS mutation) is chairman-gated per coordinator decision c7f0caab. Reversible LEAD/PLAN may proceed; EXEC HARD-STOPS until explicit chairman go-ahead (pushed to Adam).',
    set_by: 'session 79038f27 (Alpha-5)',
    gated_phase: 'EXEC',
  },
  source: 'leo',
  arch_key: 'ARCH-EHG-L1-001',
  child_role: 'provision-live-surface',
  created_at: '2026-07-13T10:39:00.455Z',
  vision_key: 'VISION-EHG-L1-001',
  child_index: 0,
  created_via: 'leo-create-sd',
  scope_riders: [
    { id: 'G1-analytics-wiring', note: 'x', added: '2026-07-13 chairman fold-in' },
    { id: 'G2-legal-pages-live', note: 'y', added: '2026-07-13 chairman fold-in' },
  ],
  min_tier_rank: 3,
  parent_sd_key: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001',
  needs_enrichment: ['dependencies'],
  contract_governed: true,
  do_not_auto_dispatch: true,
  contract_parent_chain: ['af89063c-f3fa-4a77-8ce3-82fe822b2962'],
  inherited_from_parent: ['category', 'strategic_objectives', 'key_principles'],
  requires_human_action: true,
  validation_conditions: { C1: 'x', C2: 'y', C3: 'z' },
  requires_human_action_at: '2026-07-16T11:17:55.136Z',
  requires_human_action_by: 'session 79038f27 (Alpha-5) (canonical-key copy by coordinator 701d8d73)',
  do_not_auto_dispatch_exec: true,
  do_not_auto_dispatch_reason: 'Chairman-gated: Child-A provisions the live venture surface (irreversible live deploy / payment-account / DNS). Held OUT of dispatch until explicit chairman go-ahead.',
  target_application_explicit: false,
  requires_human_action_reason: 'Irreversible EXEC (live venture deploy, payment-account creation, DNS mutation) is chairman-gated per coordinator decision c7f0caab. Reversible LEAD/PLAN may proceed; EXEC HARD-STOPS until explicit chairman go-ahead (pushed to Adam).',
  irreversible_exec_chairman_gated: true,
};

const LEGACY_KEYS = [
  'requires_human_action', 'requires_human_action_at', 'requires_human_action_by', 'requires_human_action_reason',
  'do_not_auto_dispatch', 'do_not_auto_dispatch_exec', 'do_not_auto_dispatch_reason',
  'irreversible_exec_chairman_gated', 'hold',
];

describe('buildMigratedMetadata (op-co-A fence migration)', () => {
  it('TS-9: post-migration has ZERO live legacy keys and exactly one canonical hold (exec_boundary_hold)', () => {
    const after = buildMigratedMetadata(REAL_OPCO_A_METADATA);
    for (const key of LEGACY_KEYS) {
      expect(after).not.toHaveProperty(key);
    }
    expect(after.exec_boundary_hold).toBe(true);
    expect(typeof after.exec_boundary_hold_reason).toBe('string');
    expect(after.switchon_action).toBe('live-venture-deploy');
  });

  it('archives every legacy key verbatim under switchon_migrated_from_legacy_fence.archived_keys', () => {
    const after = buildMigratedMetadata(REAL_OPCO_A_METADATA);
    const archived = after.switchon_migrated_from_legacy_fence.archived_keys;
    for (const key of LEGACY_KEYS) {
      expect(archived[key]).toEqual(REAL_OPCO_A_METADATA[key]);
    }
  });

  it('captures the COMPLETE pre-migration metadata snapshot (not just the legacy subset)', () => {
    const after = buildMigratedMetadata(REAL_OPCO_A_METADATA);
    expect(after.switchon_migrated_from_legacy_fence.full_pre_migration_metadata_snapshot).toEqual(REAL_OPCO_A_METADATA);
  });

  it('preserves unrelated existing keys (read-modify-write, never a blind overwrite)', () => {
    const after = buildMigratedMetadata(REAL_OPCO_A_METADATA);
    expect(after.scope_riders).toEqual(REAL_OPCO_A_METADATA.scope_riders);
    expect(after.vision_key).toBe('VISION-EHG-L1-001');
    expect(after.arch_key).toBe('ARCH-EHG-L1-001');
    expect(after.validation_conditions).toEqual(REAL_OPCO_A_METADATA.validation_conditions);
  });

  it('notes the other 2 named NEVER-AUTO actions in switchon_context', () => {
    const after = buildMigratedMetadata(REAL_OPCO_A_METADATA);
    expect(after.switchon_context.also_named).toEqual(['live-payment-account-creation', 'dns-mutation']);
  });

  it('handles an empty/absent metadata object without throwing', () => {
    expect(() => buildMigratedMetadata(undefined)).not.toThrow();
    expect(() => buildMigratedMetadata({})).not.toThrow();
    const after = buildMigratedMetadata({});
    expect(after.exec_boundary_hold).toBe(true);
  });
});
