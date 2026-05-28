// SD-LEO-INFRA-DEFAULT-RETROSPECTIVES-RETROSPECTIVE-001 (CAPA for harness-backlog a558baf6).
//
// The retrospectives.retrospective_type column DEFAULT was 'SD_COMPLETION' (migration 20251210),
// which contradicts the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE: it selects the SD-completion
// retro via retro_type='SD_COMPLETION' AND retrospective_type IS NULL (retro-filters.js
// getFilteredRetrospective). Any writer that OMITTED retrospective_type received the default and
// failed the gate (recurred twice 2026-05-28). The migration realigns the default to NULL; the
// live column_default was verified NULL after applying it.
//
// Static-pattern assertions (same convention as generate-retrospective-filtered-existence.test.js)
// guard against regression of the default and keep the generator's intent documented. Hermetic —
// no DB connection required.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(__dirname, '../../../database/migrations/20260528_retrospective_type_default_null.sql');
const GENERATOR = path.resolve(__dirname, '../../../scripts/generate-retrospective.js');

describe('retrospective_type column default = NULL (CAPA a558baf6)', () => {
  it('the migration sets the retrospective_type column default to NULL', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+retrospectives\s+ALTER\s+COLUMN\s+retrospective_type\s+SET\s+DEFAULT\s+NULL/i,
    );
  });

  it('generate-retrospective.js documents the NULL default and keeps the explicit null', () => {
    const code = fs.readFileSync(GENERATOR, 'utf8');
    // Comment updated to reflect the realigned default (references the SD that realigned it).
    expect(code).toMatch(/SD-LEO-INFRA-DEFAULT-RETROSPECTIVES-RETROSPECTIVE-001/);
    // Completion retros still write retrospective_type: null as defense-in-depth.
    expect(code).toMatch(/retrospective_type:\s*null/);
    // retro_type is still SD_COMPLETION (the gate keys completion retros on this).
    expect(code).toMatch(/retro_type:\s*'SD_COMPLETION'/);
  });
});
