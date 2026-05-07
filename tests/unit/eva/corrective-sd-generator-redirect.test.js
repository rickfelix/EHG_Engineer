/**
 * SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 — PR5 of 5
 * Contract tests for the redirect refactor:
 *   - corrective-sd-generator imports recorder (not just createSD)
 *   - VISION_EVENTS includes the new event types
 *   - corrective-finding-recorder exports computeDedupHash + recordCorrectiveFinding
 *   - The generator's source code reflects the refactor (no SD INSERT)
 *
 * Behavior-level tests live in:
 *   - corrective-finding-recorder.test.js (recorder unit tests, 14 cases)
 *   - corrective-sd-generator.test.js (filter behavior, options binding)
 *   - corrective-sd-generator-{a05,lifecycle,dedup}.test.js (filter cases)
 *   - corrective-triage.test.js (CLI subcommand cases, 11)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');

describe('redirect contract — recorder module', () => {
  it('exports recordCorrectiveFinding and computeDedupHash', async () => {
    const mod = await import('../../../lib/eva/corrective-finding-recorder.js');
    expect(typeof mod.recordCorrectiveFinding).toBe('function');
    expect(typeof mod.computeDedupHash).toBe('function');
  });

  it('computeDedupHash is deterministic and order-independent', async () => {
    const { computeDedupHash } = await import('../../../lib/eva/corrective-finding-recorder.js');
    const a = computeDedupHash('SD-X', ['V01', 'V02'], 'run');
    const b = computeDedupHash('SD-X', ['V02', 'V01'], 'run');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('redirect contract — VISION_EVENTS', () => {
  it('includes CORRECTIVE_FINDING_RECORDED', async () => {
    const { VISION_EVENTS } = await import('../../../lib/eva/event-bus/vision-events.js');
    expect(VISION_EVENTS.CORRECTIVE_FINDING_RECORDED).toBe('vision.corrective_finding_recorded');
  });

  it('includes CORRECTIVE_PROMOTED_TO_SD', async () => {
    const { VISION_EVENTS } = await import('../../../lib/eva/event-bus/vision-events.js');
    expect(VISION_EVENTS.CORRECTIVE_PROMOTED_TO_SD).toBe('vision.corrective_promoted_to_sd');
  });

  it('preserves CORRECTIVE_SD_CREATED for backward compat', async () => {
    const { VISION_EVENTS } = await import('../../../lib/eva/event-bus/vision-events.js');
    expect(VISION_EVENTS.CORRECTIVE_SD_CREATED).toBe('vision.corrective_sd_created');
  });
});

describe('redirect contract — corrective-sd-generator source', () => {
  const generatorSrc = readFileSync(
    join(repoRoot, 'scripts/eva/corrective-sd-generator.mjs'),
    'utf8'
  );

  it('imports recordCorrectiveFinding from the recorder module', () => {
    expect(generatorSrc).toContain("import { recordCorrectiveFinding } from '../../lib/eva/corrective-finding-recorder.js'");
  });

  it('calls recordCorrectiveFinding inside generateCorrectiveSD', () => {
    expect(generatorSrc).toContain('await recordCorrectiveFinding(supabase, {');
  });

  it('does NOT call createSD inside the per-group loop after the redirect', () => {
    // After the refactor, createSD is still imported (used elsewhere — leo-create-sd
    // helpers) but not invoked in the per-group emit loop. Approximate this by
    // ensuring the OLD `await createSD({` pattern is absent.
    expect(generatorSrc).not.toContain('newSD = await createSD({');
  });

  it('return shim preserves OLD shape with feedbackIds additive', () => {
    expect(generatorSrc).toContain('created: false');
    expect(generatorSrc).toContain('sdKey: null');
    expect(generatorSrc).toContain('sds: []');
    expect(generatorSrc).toContain('feedbackIds:');
    expect(generatorSrc).toContain('findings:');
  });

  it('publishes CORRECTIVE_FINDING_RECORDED event (replaces CORRECTIVE_SD_CREATED in the emit path)', () => {
    expect(generatorSrc).toContain('CORRECTIVE_FINDING_RECORDED');
  });
});

describe('redirect contract — corrective-triage CLI source', () => {
  const triageSrc = readFileSync(
    join(repoRoot, 'scripts/corrective-triage.mjs'),
    'utf8'
  );

  it('exports the four subcommand functions', () => {
    expect(triageSrc).toMatch(/export async function listFindings/);
    expect(triageSrc).toMatch(/export async function promoteFinding/);
    expect(triageSrc).toMatch(/export async function dismissFinding/);
    expect(triageSrc).toMatch(/export async function bulkDismiss/);
  });

  it('promote uses metadata.promote_payload to call createSD', () => {
    expect(triageSrc).toContain('promote_payload');
    expect(triageSrc).toContain('createSD({');
  });

  it('promote sets feedback.promoted_to_sd_id + status=in_progress + promoted_at', () => {
    expect(triageSrc).toContain("status: 'in_progress'");
    expect(triageSrc).toContain('promoted_to_sd_id');
    expect(triageSrc).toContain('promoted_at');
    expect(triageSrc).toContain('promoted_by');
  });

  it('publishes CORRECTIVE_PROMOTED_TO_SD on successful promote', () => {
    expect(triageSrc).toContain('CORRECTIVE_PROMOTED_TO_SD');
  });

  it('dismiss sets resolution_type=wont_fix per feedback table contract', () => {
    expect(triageSrc).toContain("status: 'wont_fix'");
    expect(triageSrc).toContain("resolution_type: 'wont_fix'");
  });
});

describe('redirect contract — schema migration files', () => {
  const migCols = readFileSync(
    join(repoRoot, 'database/migrations/20260504_feedback_corrective_columns.sql'),
    'utf8'
  );
  const migIdx = readFileSync(
    join(repoRoot, 'database/migrations/20260504_feedback_corrective_index.sql'),
    'utf8'
  );

  it('column migration adds all 6 columns with IF NOT EXISTS', () => {
    expect(migCols).toContain('ADD COLUMN IF NOT EXISTS corrective_class');
    expect(migCols).toContain('ADD COLUMN IF NOT EXISTS source_gate');
    expect(migCols).toContain('ADD COLUMN IF NOT EXISTS gate_run_id');
    expect(migCols).toContain('ADD COLUMN IF NOT EXISTS promoted_to_sd_id');
    expect(migCols).toContain('ADD COLUMN IF NOT EXISTS promoted_at');
    expect(migCols).toContain('ADD COLUMN IF NOT EXISTS promoted_by');
  });

  it('promoted_to_sd_id is varchar(50) per database-agent finding (sd_key string, not UUID)', () => {
    expect(migCols).toMatch(/promoted_to_sd_id\s+varchar\(50\)/);
  });

  it('index migration uses CONCURRENTLY and partial filter', () => {
    expect(migIdx).toContain('CREATE INDEX CONCURRENTLY');
    expect(migIdx).toContain('idx_feedback_category_status');
    expect(migIdx).toContain("category IN ('corrective_finding', 'harness_backlog')");
  });
});
