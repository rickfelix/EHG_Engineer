// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-8
// CI ordinal check: Child 0 migration ordinal must be < Child A migration ordinal
// (or Child A has no in-flight migrations). Closes parent RISK B-01 priority 16 HIGH.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../database/migrations');

function ordinalFromFilename(fn) {
  const m = fn.match(/^(\d{14})/);
  return m ? parseInt(m[1], 10) : null;
}

describe('migration ordinal check vs Child A', () => {
  const files = readdirSync(MIGRATIONS_DIR);
  const child0Migrations = files.filter((f) => f.includes('lineage_verdict') || f.includes('kill_switch'));

  it('Child 0 has at least one dated migration', () => {
    expect(child0Migrations.length).toBeGreaterThanOrEqual(1);
    for (const f of child0Migrations) {
      expect(ordinalFromFilename(f)).toBeGreaterThan(0);
    }
  });

  it('Child 0 migration ordinals are in 2026 range (sanity)', () => {
    for (const f of child0Migrations) {
      const ord = ordinalFromFilename(f);
      expect(ord).toBeGreaterThan(20260101000000);
      expect(ord).toBeLessThan(20270101000000);
    }
  });

  it('Child A migration files (when present) compared by ordinal', () => {
    const childAMigrations = files.filter((f) => /instrumentation|scope_completion_chain|bypass_ledger/i.test(f));
    if (childAMigrations.length === 0) return; // Child A not yet shipped → no ordering constraint
    const child0Max = Math.max(...child0Migrations.map(ordinalFromFilename).filter(Boolean));
    const childAMax = Math.max(...childAMigrations.map(ordinalFromFilename).filter(Boolean));
    expect(child0Max).toBeLessThan(childAMax);
  });
});
