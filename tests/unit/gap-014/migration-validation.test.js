/**
 * Tests for GAP-014 SQL migration content validation
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-014
 *
 * Validates the migration SQL contains the expected changes:
 *   1. blocking column ADD COLUMN IF NOT EXISTS
 *   2. v_chairman_pending_decisions with SLA sort
 *   3. select_schedulable_ventures with computed priority_score
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('database/migrations/20260301_gap014_chairman_routing_polish.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('GAP-014 migration SQL validation', () => {
  // Change 1: blocking column
  it('adds blocking column with DEFAULT false', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS blocking BOOLEAN DEFAULT false/i);
  });

  it('adds COMMENT on blocking column', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN chairman_decisions\.blocking/i);
  });

  it('adds index on blocking column', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS.*idx_chairman_decisions_blocking/i);
  });

  // Change 2: v_chairman_pending_decisions SLA sort
  it('creates view v_chairman_pending_decisions', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW v_chairman_pending_decisions/i);
  });

  it('includes sla_deadline_at column', () => {
    expect(sql).toMatch(/sla_deadline_at/i);
  });

  it('includes sla_remaining_seconds column', () => {
    expect(sql).toMatch(/sla_remaining_seconds/i);
  });

  it('sorts by SLA remaining ascending', () => {
    expect(sql).toMatch(/ASC NULLS LAST/i);
  });

  it('includes SLA config values matching chairman-sla-enforcer.js', () => {
    // gate_decision: 4h, budget_review: 2h, advisory: 24h
    expect(sql).toMatch(/gate_decision.*4/i);
    expect(sql).toMatch(/budget_review.*2/i);
    expect(sql).toMatch(/advisory.*24/i);
  });

  it('includes blocking column in view output', () => {
    expect(sql).toMatch(/cd\.blocking/i);
  });

  // Change 3: select_schedulable_ventures computed priority
  it('creates function select_schedulable_ventures', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION select_schedulable_ventures/i);
  });

  it('does NOT use placeholder 0::NUMERIC', () => {
    // The view should NOT have the old placeholder
    const functionSection = sql.substring(sql.indexOf('CREATE OR REPLACE FUNCTION select_schedulable_ventures'));
    expect(functionSection).not.toMatch(/0::NUMERIC AS priority_score.*placeholder/i);
  });

  it('uses weighted formula for priority_score', () => {
    expect(sql).toMatch(/0\.4\s*\*\s*s\.blocking_age_factor/i);
    expect(sql).toMatch(/0\.3\s*\*\s*s\.health_factor/i);
    expect(sql).toMatch(/0\.3\s*\*\s*s\.fifo_factor/i);
  });

  it('includes health_status in lockable CTE', () => {
    expect(sql).toMatch(/v\.health_status/i);
  });

  it('orders by priority_score descending', () => {
    expect(sql).toMatch(/ORDER BY.*priority_score.*DESC/is);
  });
});
