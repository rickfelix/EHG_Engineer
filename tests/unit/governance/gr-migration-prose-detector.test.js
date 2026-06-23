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
  it('STILL BLOCKS a supabase/ path WHEN it co-occurs with real DDL ("add the column" → hasDDL)', () => {
    // The block survives on the DDL arm, not the (removed) prose-path arm.
    expect(mig({ scope: 'Edit supabase/migrations/20260616_add_x.sql to add the column', metadata: {} })).toBeDefined();
  });
  it('BLOCKS an explicit metadata.requires_migration flag even with pure prose', () => {
    expect(mig({ scope: 'pure prose with no ddl', metadata: { requires_migration: true } })).toBeDefined();
  });
  it('BLOCKS a governed_files[] metadata entry under supabase/ (the STRUCTURED signal)', () => {
    expect(mig({ scope: 'pure prose', metadata: { governed_files: ['supabase/migrations/x.sql'] } })).toBeDefined();
  });
  it('BLOCKS a governed_files[] metadata entry ending in *.sql', () => {
    expect(mig({ scope: 'pure prose', metadata: { governed_files: ['db/changes/add_index.sql'] } })).toBeDefined();
  });
});

// SD-LEO-INFRA-GR-MIGRATION-SQL-PATH-CITATION-FALSE-BLOCK-001: a .sql / supabase/ PATH cited in
// NARRATIVE (not declared in structured metadata, no DDL) is NOT a migration signal — no false block.
describe('GR-MIGRATION-REVIEW — a narrative .sql/supabase/ PATH CITATION no longer false-blocks (FR-1)', () => {
  it('PASSES a bare *.sql file reference cited in prose (no DDL, no metadata)', () => {
    expect(mig({ scope: 'Apply the new schema in db/changes/add_index.sql', metadata: {} })).toBeUndefined();
  });
  it('PASSES a supabase/ path cited as root-cause context (no DDL)', () => {
    expect(mig({ scope: 'Root cause traced to the policy seeded in supabase/migrations/20260613_legal_select.sql; this SD is a pure-JS guardrail fix', metadata: {} })).toBeUndefined();
  });
  it('PASSES an explicit OUT-OF-SCOPE disclaimer citing a .sql path', () => {
    expect(mig({ scope: 'OUT OF SCOPE: the 5 DB-level triggers in supabase/migrations/triggers.sql are NOT changed; this is a JS-only detector narrowing', metadata: {} })).toBeUndefined();
  });
  it('STILL BLOCKS when the cited .sql is declared as a STRUCTURED governed_file (genuine migration)', () => {
    expect(mig({ scope: 'Edit the policy', metadata: { governed_files: ['supabase/migrations/20260613_legal_select.sql'] } })).toBeDefined();
  });
});

describe('GR-MIGRATION-REVIEW — broadened DDL coverage (adversarial-review close-the-holes)', () => {
  it.each([
    ['add a new status column to ventures', 'multi-word column gap'],
    ['drop the email column from users', 'two-word column gap'],
    ['rename table ventures to portfolios', 'rename table (exact SQL form)'],
    ['create trigger audit_ins on ventures', 'create trigger'],
    ['create type mood as enum', 'create type/enum'],
    ['create function compute_health()', 'create function'],
    ['alter sequence venture_seq restart', 'alter sequence'],
    ['add foreign key fk_owner to orders', 'add foreign key'],
    ['add a unique constraint on email', 'add constraint'],
    ['grant select on ventures to anon', 'grant ... on'],
    ['new RLS migration for tenants', 'RLS + migration co-occurrence'],
    ['schema migration adding a foreign key', 'foreign key + migration co-occurrence'],
  ])('BLOCKS genuine schema prose: %s (%s)', (scope) => {
    expect(mig({ scope, metadata: {} })).toBeDefined();
  });
});

describe('GR-MIGRATION-REVIEW — broadening does NOT re-introduce governance false-blocks', () => {
  it.each([
    ['create a trigger for the build pipeline when a release ships', 'CI trigger, not SQL'],
    ['index the search results and add a column chart to the dashboard', 'UI/search prose (no adjacent DDL verb)'],
    ['document the migration review policy and the deploy sequence', 'migration + ambiguous nouns (policy/sequence) only'],
    ['refine the migration keyword filter so a schema change discussion no longer false-blocks', 'pure governance prose'],
    ['grant the user access to the migration dashboard', 'grant access (not grant ... on)'],
  ])('PASSES pure-JS/governance prose: %s (%s)', (scope) => {
    expect(mig({ scope, metadata: {} })).toBeUndefined();
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
