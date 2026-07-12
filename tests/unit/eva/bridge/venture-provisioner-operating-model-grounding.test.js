import { describe, it, expect, vi } from 'vitest';

// SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-I1 (FR-3): the new 'operating_model_grounded'
// DEFAULT_STEPS entry stamps a version+timestamp reference into ventures.metadata. Mock the
// DB client with a mutable in-memory row so check()/execute()/check() can be chained like a
// real idempotent re-run, following the venture-provisioner-scaffold-seeded.test.js pattern.
let ventureRow = { metadata: {} };
let updateShouldFail = false;

vi.mock('../../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: ventureRow, error: null }),
        }),
      }),
      update: (patch) => ({
        eq: async () => {
          if (updateShouldFail) return { error: { message: 'simulated write failure' } };
          ventureRow = { ...ventureRow, ...patch };
          return { error: null };
        },
      }),
    }),
  }),
}));

const { DEFAULT_STEPS } = await import('../../../../lib/eva/bridge/venture-provisioner.js');
const OPERATING_MODEL = (await import('../../../../lib/eva/standards/operating-model.js')).default;

function groundingStep() {
  const step = DEFAULT_STEPS.find((s) => s.name === 'operating_model_grounded');
  if (!step) throw new Error('operating_model_grounded step not found in DEFAULT_STEPS');
  return step;
}

describe('venture-provisioner DEFAULT_STEPS: operating_model_grounded', () => {
  it('check() returns false when no operating_model stamp exists yet', async () => {
    ventureRow = { metadata: {} };
    updateShouldFail = false;
    const ctx = { ventureId: 'v1', venture: { name: 'ApexNiche' }, stepsCompleted: [], log: () => {} };
    expect(await groundingStep().check(ctx)).toBe(false);
  });

  it('execute() stamps metadata.operating_model.version to match OPERATING_MODEL.version', async () => {
    ventureRow = { metadata: {} };
    updateShouldFail = false;
    const ctx = { ventureId: 'v1', venture: { name: 'ApexNiche' }, stepsCompleted: [], log: () => {} };
    await groundingStep().execute(ctx);
    expect(ventureRow.metadata.operating_model.version).toBe(OPERATING_MODEL.version);
    expect(ventureRow.metadata.operating_model.grounded_at).toEqual(expect.any(String));
  });

  it('preserves pre-existing metadata keys (merge, not replace)', async () => {
    ventureRow = { metadata: { sentry: { org: 'ehg-3v' } } };
    updateShouldFail = false;
    const ctx = { ventureId: 'v1', venture: { name: 'ApexNiche' }, stepsCompleted: [], log: () => {} };
    await groundingStep().execute(ctx);
    expect(ventureRow.metadata.sentry).toEqual({ org: 'ehg-3v' });
    expect(ventureRow.metadata.operating_model.version).toBe(OPERATING_MODEL.version);
  });

  it('check() returns true (idempotent no-op) once already stamped with the current version', async () => {
    ventureRow = { metadata: { operating_model: { version: OPERATING_MODEL.version, grounded_at: '2026-01-01T00:00:00.000Z' } } };
    updateShouldFail = false;
    const ctx = { ventureId: 'v1', venture: { name: 'ApexNiche' }, stepsCompleted: [], log: () => {} };
    expect(await groundingStep().check(ctx)).toBe(true);
  });

  it('execute() logs a WARN and does not throw when the Supabase update errors (fail-soft)', async () => {
    ventureRow = { metadata: {} };
    updateShouldFail = true;
    const logs = [];
    const ctx = { ventureId: 'v1', venture: { name: 'ApexNiche' }, stepsCompleted: [], log: (msg) => logs.push(msg) };
    await expect(groundingStep().execute(ctx)).resolves.not.toThrow();
    expect(logs.some((l) => l.includes('WARN'))).toBe(true);
  });

  it('is positioned after registry_updated and before schema_created', () => {
    const names = DEFAULT_STEPS.map((s) => s.name);
    expect(names.indexOf('operating_model_grounded')).toBeGreaterThan(names.indexOf('registry_updated'));
    expect(names.indexOf('operating_model_grounded')).toBeLessThan(names.indexOf('schema_created'));
  });
});
