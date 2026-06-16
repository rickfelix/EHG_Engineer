/**
 * SD-LEO-INFRA-GR-MIGRATION-PROSE-FALSE-BLOCK-001 — GR-MIGRATION-REVIEW detector.
 *
 * Proves the BLOCKING guardrail now requires a REAL data-layer signal (real DDL op,
 * governed supabase/ or *.sql file path, or a metadata flag) instead of a bare conceptual
 * prose word — so a pure-JS SD that merely DISCUSSES migrations is no longer false-blocked
 * (feedback 008916c6), while every genuine migration STILL blocks (gate not weakened).
 */
import { describe, it, expect } from 'vitest';
import { check } from '../../../lib/governance/guardrail-registry.js';

const mig = (sdData) => check(sdData).violations.find((v) => v.guardrail === 'GR-MIGRATION-REVIEW');

describe('GR-MIGRATION-REVIEW — bare prose word no longer false-blocks (FR-1)', () => {
  it('PASSES a pure-JS SD that only MENTIONS "migration"/"schema change" in prose', () => {
    // This is the exact false-block class: a governance SD discussing the keyword filter.
    expect(mig({ scope: 'Refine the GR-MIGRATION-REVIEW keyword filter so a bare prose word about migration or a schema change no longer false-blocks pure-JS SDs', metadata: {} })).toBeUndefined();
  });
  it('PASSES prose mentioning "database migration" with no DDL/path/flag', () => {
    expect(mig({ scope: 'Document how the database migration review process works for operators', metadata: {} })).toBeUndefined();
  });
});

describe('GR-MIGRATION-REVIEW — genuine data-layer signals STILL block (FR-1/FR-2, gate not weakened)', () => {
  it('BLOCKS a real DDL token (alter table)', () => {
    expect(mig({ scope: 'ALTER TABLE ventures ADD COLUMN status', metadata: {} })).toBeDefined();
  });
  it('BLOCKS prose-described column DDL with an identifier (VAL-1 regression: "add <id> column")', () => {
    expect(mig({ scope: 'Database migration to add user_preferences column', metadata: {} })).toBeDefined();
  });
  it('BLOCKS a governed supabase/ file path', () => {
    expect(mig({ scope: 'Edit supabase/migrations/20260616_add_x.sql to add the column', metadata: {} })).toBeDefined();
  });
  it('BLOCKS a bare *.sql file reference', () => {
    expect(mig({ scope: 'Apply the new schema in db/changes/add_index.sql', metadata: {} })).toBeDefined();
  });
  it('BLOCKS an explicit metadata.requires_migration flag even with pure prose', () => {
    expect(mig({ scope: 'pure prose with no ddl', metadata: { requires_migration: true } })).toBeDefined();
  });
  it('BLOCKS a governed_files[] metadata entry under supabase/', () => {
    expect(mig({ scope: 'pure prose', metadata: { governed_files: ['supabase/migrations/x.sql'] } })).toBeDefined();
  });
});

describe('GR-MIGRATION-REVIEW — attestation bypass unchanged', () => {
  it('PASSES a real DDL SD when migration_reviewed is attested', () => {
    expect(mig({ scope: 'ALTER TABLE users ADD COLUMN x', metadata: { migration_reviewed: true } })).toBeUndefined();
  });
  it('PASSES a real DDL SD when migration_plan is set', () => {
    expect(mig({ scope: 'ALTER TABLE users ADD COLUMN x', metadata: { migration_plan: true } })).toBeUndefined();
  });
  it('does NOT bypass on a non-true attestation value (must be strict ===true)', () => {
    expect(mig({ scope: 'ALTER TABLE users ADD COLUMN x', metadata: { migration_reviewed: 'true' } })).toBeDefined();
  });
});
