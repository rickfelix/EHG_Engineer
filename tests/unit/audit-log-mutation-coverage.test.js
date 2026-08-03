// SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 — FR-2 and FR-3.
//
// audit_log holds 232,811 rows but old_value — the column that distinguishes a MUTATION record
// from a creation advisory — is populated in 388 of them (0.167%). Of those 388, 172 come from the
// sd_type_change writer and 214 from cancel-sd.js. Both of those writers are defective in ways that
// would quietly reduce that number further, and neither defect had a test:
//
//   FR-2  trg_enforce_sd_type_change_explanation is defined TWICE. The live definition
//         (database/migrations/20260202_...) writes audit_log; the one in database/schema/ does not.
//         Applying the schema copy would CREATE OR REPLACE the live function with a non-auditing
//         one and silently end sd_type auditing.
//   FR-3  cancel-sd.js swallowed a failed audit write with console.warn, so a cancellation whose
//         audit row never landed was indistinguishable from one that was never audited.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuditFailureMarker } from '../../scripts/cancel-sd.js';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCHEMA_COPY = 'database/schema/enforce_sd_type_change_explanation.sql';
const LIVE_MIGRATION = 'database/migrations/20260202_sd_type_change_governance_fixed.sql';
const read = (p) => readFileSync(join(REPO, p), 'utf8');

describe('FR-2: one trigger definition, and it audits', () => {
  // CONTROL FIRST. Both assertions below are about file CONTENT, so a wrong path yields an
  // empty string and every "does not contain" check passes vacuously. Prove the files exist
  // and that the positive case is actually detectable before trusting any negative one.
  it('CONTROL: both files exist and the live migration really does write audit_log', () => {
    expect(existsSync(join(REPO, SCHEMA_COPY)), `${SCHEMA_COPY} missing — the rest of this suite would pass vacuously`).toBe(true);
    expect(existsSync(join(REPO, LIVE_MIGRATION))).toBe(true);
    const live = read(LIVE_MIGRATION);
    expect(live).toMatch(/INSERT INTO audit_log/);
    expect(live).toMatch(/old_value/);
    expect(live).toMatch(/new_value/);
  });

  // THE DECIDING SCENARIO. The schema copy still defines the function (history is preserved), so
  // "it has no definition" is not the property to assert. The property is that it cannot be
  // applied silently: it must abort loudly and name what applying it would destroy.
  it('the superseded copy cannot be applied silently — it aborts and names the live definition', () => {
    const copy = read(SCHEMA_COPY);
    expect(copy).toMatch(/RAISE EXCEPTION/);
    expect(copy).toMatch(/SUPERSEDED/);
    expect(copy).toContain('20260202_sd_type_change_governance_fixed.sql');
  });

  it('the guard precedes the duplicate definition, so it cannot be reached', () => {
    const copy = read(SCHEMA_COPY);
    const guardAt = copy.indexOf('RAISE EXCEPTION');
    const defAt = copy.indexOf('CREATE OR REPLACE FUNCTION enforce_sd_type_change_explanation');
    expect(guardAt).toBeGreaterThan(-1);
    expect(defAt).toBeGreaterThan(-1);
    // A guard placed AFTER the CREATE OR REPLACE would let the damage land before it fired —
    // the function would already be replaced by the time the exception aborted the transaction.
    expect(guardAt).toBeLessThan(defAt);
  });

  it('the superseded copy still does not write audit_log — the reason the guard exists', () => {
    expect(read(SCHEMA_COPY)).not.toMatch(/INSERT INTO audit_log/);
  });
});

describe('FR-1/FR-5: the mutation trigger covers the named transitions and nothing else', () => {
  const MIGRATION = 'database/chairman-gated/20260802_sd_mutation_audit_trigger.sql';

  it('CONTROL: the migration exists outside every auto-applied directory', () => {
    expect(existsSync(join(REPO, MIGRATION)), `${MIGRATION} missing — the assertions below would pass vacuously`).toBe(true);
    // pending-migrations-check.js:778 scans exactly these three, with autoExecute defaulting TRUE.
    // Chairman-gated DDL sitting in any of them would be self-applied, so its ABSENCE from them is
    // part of the deliverable, not an accident of where the file landed.
    for (const scanned of ['database/migrations', 'database/manual-updates', 'supabase/migrations']) {
      expect(existsSync(join(REPO, scanned, '20260802_sd_mutation_audit_trigger.sql'))).toBe(false);
    }
  });

  it('audits exactly the three governed fields, each with old_value and new_value', () => {
    const sql = read(MIGRATION);
    for (const field of ['status', 'current_phase', 'claiming_session_id']) {
      expect(sql).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(sql).toMatch(/INSERT INTO audit_log/);
    expect(sql).toMatch(/old_value/);
    expect(sql).toMatch(/new_value/);
    // Claim release is the direction that matters operationally and is easy to omit.
    expect(sql).toContain('sd_claim_released');
    expect(sql).toContain('sd_claim_acquired');
  });

  // THE GUARD THAT KEEPS THE FIX FROM BECOMING THE NEXT FLOOD. updated_at is touched on every
  // write, so a trigger without a WHEN clause fires on every UPDATE — on a table with NO retention,
  // where every row is permanent, that would out-volume the 214k advisory traffic it must be
  // readable against. The WHEN clause is a second guard independent of the function body.
  it('is field-scoped at the TRIGGER level, not only inside the function', () => {
    const sql = read(MIGRATION);
    const when = sql.slice(sql.indexOf('CREATE TRIGGER trg_sd_mutation_audit'));
    expect(when).toMatch(/WHEN\s*\(/);
    expect(when).toContain('OLD.status IS DISTINCT FROM NEW.status');
    expect(when).toContain('OLD.current_phase IS DISTINCT FROM NEW.current_phase');
    expect(when).toContain('OLD.claiming_session_id IS DISTINCT FROM NEW.claiming_session_id');
  });

  it('ships a rollback, because a trigger applied by hand must be removable by hand', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_sd_mutation_audit');
    expect(sql).toContain('DROP FUNCTION IF EXISTS log_sd_mutation_audit');
  });
});

describe('FR-3: a failed cancellation audit write is recorded, not swallowed', () => {
  const failure = { event_type: 'sd_cancelled', at: '2026-08-02T23:59:00.000Z', error: 'permission denied', source: 'cancel-sd.js' };

  it('records the failure against the entity whose mutation went untraced', () => {
    const m = buildAuditFailureMarker({}, failure);
    expect(m.audit_write_failed).toMatchObject({ event_type: 'sd_cancelled', error: 'permission denied', source: 'cancel-sd.js' });
    expect(m.audit_write_failed.at).toBe('2026-08-02T23:59:00.000Z');
  });

  // THE BUG THIS TEST EXISTS FOR, and it was live in my first implementation. The call site
  // originally merged from `sd.metadata` — but the SD is fetched with an explicit seven-column
  // select that does NOT include metadata, so that value is undefined and the write would have
  // replaced the entire object with just the marker. An observability fix that destroys data is
  // worse than the silence it replaced.
  it('PRESERVES every existing metadata key — the marker extends, never replaces', () => {
    const existing = {
      strand_repair: { by: 'coordinator', at: '2026-08-01T00:00:00Z' },
      requires_human_action: true,
      not_before: '2026-09-01T00:00:00Z',
      nested: { keep: ['a', 'b'] },
    };
    const m = buildAuditFailureMarker(existing, failure);
    expect(m.strand_repair).toEqual(existing.strand_repair);
    expect(m.requires_human_action).toBe(true);
    expect(m.not_before).toBe('2026-09-01T00:00:00Z');
    expect(m.nested).toEqual({ keep: ['a', 'b'] });
    expect(Object.keys(m).sort()).toEqual(['audit_write_failed', 'nested', 'not_before', 'requires_human_action', 'strand_repair']);
  });

  // Absent metadata must not throw and must not fabricate structure — the marker alone is correct
  // when the row genuinely has none.
  it('handles null/undefined/non-object metadata without throwing or inventing keys', () => {
    for (const bad of [null, undefined, 'not-an-object', 42]) {
      const m = buildAuditFailureMarker(bad, failure);
      expect(Object.keys(m)).toEqual(['audit_write_failed']);
    }
  });

  it('does not mutate the object it was given', () => {
    const existing = { keep: 1 };
    buildAuditFailureMarker(existing, failure);
    expect(existing).toEqual({ keep: 1 });
    expect(existing.audit_write_failed).toBeUndefined();
  });
});
