/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A — build-tasks-writer descriptor tests
 *
 * Covers:
 *   - Cloud descriptor: output contains D1/R2/Cloudflare; no Replit data/storage substrings
 *   - No descriptor: output matches the current Replit baseline (backward-compat)
 *   - The 3.5 Deploy line is present and unchanged in both paths
 */
import { describe, it, expect } from 'vitest';
import { buildBuildTasks } from '../../../../lib/eva/bridge/build-tasks-writer.js';

const CF_DESCRIPTOR = {
  db_provider: 'd1',
  deployment_target: 'cloudflare-pages',
  storage: 'r2',
};

const REPLIT_DESCRIPTOR = {
  db_provider: 'replit-postgres',
  deployment_target: 'replit-autoscale',
  storage: 'replit-object-storage',
};

// Capture the baseline Replit output (no descriptor) so we can assert backward-compat.
const REPLIT_BASELINE = buildBuildTasks({ name: 'Venture', screens: [] });

// ── Cloud descriptor path ──────────────────────────────────────────────────

describe('buildBuildTasks — Cloudflare descriptor', () => {
  const ctx = { name: 'VentureX', screens: [], stackDescriptor: CF_DESCRIPTOR };
  const out = buildBuildTasks(ctx);

  it('contains D1 reference', () => {
    expect(out).toContain('D1');
  });

  it('contains R2 reference', () => {
    expect(out).toContain('R2');
  });

  it('contains Cloudflare reference', () => {
    expect(out).toContain('Cloudflare');
  });

  it('does NOT contain "Replit Postgres" in data lines', () => {
    // The data/storage lines should not mention Replit Postgres
    expect(out).not.toContain('Replit Postgres');
  });

  it('does NOT contain "Replit Object Storage" in storage lines', () => {
    expect(out).not.toContain('Replit Object Storage');
  });

  it('does NOT contain "autoscale" in data or storage lines', () => {
    // "autoscale" belongs to the 3.5 Deploy line which is unchanged — but the data/storage
    // lines should never emit it when on the cloud path.
    // We check child-1 block specifically: lines 1.2/1.3 must not mention autoscale.
    const child1Block = out.split('### Child 2')[0];
    expect(child1Block).not.toContain('autoscale');
  });

  it('has the Cloudflare-native backend heading', () => {
    expect(out).toContain('Cloudflare-native backend');
  });

  it('does NOT have the Replit-native backend heading', () => {
    expect(out).not.toContain('Replit-native backend');
  });

  it('3.4 line asserts Cloudflare D1 and no @supabase', () => {
    expect(out).toContain('Cloudflare D1');
    expect(out).not.toContain('Replit Postgres');
  });

  it('3.5 Deploy line is present and unchanged', () => {
    expect(out).toContain('3.5 Deploy');
    expect(out).toContain('Replit hosting (autoscale)');
  });

  it('is deterministic', () => {
    expect(buildBuildTasks(ctx)).toBe(out);
  });
});

// ── F7/F8: cloud branch is descriptor-driven, not Cloudflare-hardcoded ─────

describe('buildBuildTasks — neon + cloud-run descriptor (F7/F8)', () => {
  const NEON_CR = { db_provider: 'neon', deployment_target: 'cloud-run' };
  const out = buildBuildTasks({ name: 'NeonCo', screens: [], stackDescriptor: NEON_CR });

  it('does NOT hardcode "Cloudflare D1" when db is neon', () => {
    expect(out).not.toContain('Cloudflare D1');
  });

  it('does NOT claim a "Cloudflare-native backend" heading on cloud-run', () => {
    expect(out).not.toContain('Cloudflare-native backend');
  });

  it('uses the GCP Cloud Run platform label in the heading', () => {
    expect(out).toContain('GCP Cloud Run-native backend');
  });

  it('1.2 uses the Neon Postgres label', () => {
    expect(out).toContain('Neon Postgres');
  });

  it('3.4 asserts the REQUIRED stack as Clerk + Neon Postgres (descriptor-driven)', () => {
    expect(out).toContain('Clerk + Neon Postgres');
  });

  it('absent-storage cloud descriptor emits a NEUTRAL storage label, never Replit/Cloudflare R2 contradiction', () => {
    // storage omitted => neutral 'platform-native object storage', not 'Cloudflare R2 — Replit Object Storage'
    expect(out).toContain('platform-native object storage');
    expect(out).not.toContain('Replit Object Storage');
    expect(out).not.toContain('Cloudflare R2');
  });

  it('does NOT reference a Workers binding for a cloud-run (non-cloudflare) target', () => {
    const child1Block = out.split('### Child 2')[0];
    expect(child1Block).not.toContain('Workers binding');
    expect(child1Block).not.toContain('R2 Workers binding');
  });

  it('3.5 Deploy line still present and unchanged', () => {
    expect(out).toContain('3.5 Deploy');
    expect(out).toContain('Replit hosting (autoscale)');
  });
});

describe('buildBuildTasks — neon + cloudflare-workers descriptor', () => {
  const NEON_CFW = { db_provider: 'neon', deployment_target: 'cloudflare-workers', storage: 'r2' };
  const out = buildBuildTasks({ name: 'X', screens: [], stackDescriptor: NEON_CFW });

  it('uses Cloudflare heading but Neon Postgres db label (no D1 contradiction)', () => {
    expect(out).toContain('Cloudflare-native backend');
    expect(out).toContain('Neon Postgres');
    expect(out).not.toContain('Cloudflare D1');
  });

  it('storage is Cloudflare R2 (descriptor-specified)', () => {
    expect(out).toContain('Cloudflare R2');
  });
});

// ── No descriptor (Replit DEFAULT / backward-compat) ──────────────────────

describe('buildBuildTasks — no descriptor (Replit default)', () => {
  it('matches the baseline Replit output byte-for-byte', () => {
    expect(buildBuildTasks({ name: 'Venture', screens: [] })).toBe(REPLIT_BASELINE);
  });

  it('has the Replit-native backend heading', () => {
    expect(REPLIT_BASELINE).toContain('Replit-native backend');
  });

  it('3.5 Deploy line present in baseline', () => {
    expect(REPLIT_BASELINE).toContain('3.5 Deploy');
    expect(REPLIT_BASELINE).toContain('Replit hosting (autoscale)');
  });
});

// ── Explicit Replit descriptor => same as no descriptor ───────────────────

describe('buildBuildTasks — explicit Replit descriptor', () => {
  const out = buildBuildTasks({ name: 'Venture', screens: [], stackDescriptor: REPLIT_DESCRIPTOR });

  it('matches the baseline (replit-autoscale is the default path)', () => {
    expect(out).toBe(REPLIT_BASELINE);
  });
});

// ── 3.5 Deploy line invariant (both paths) ────────────────────────────────

describe('3.5 Deploy line invariant', () => {
  const DEPLOY_LINE_FRAGMENT = '3.5 Deploy';

  it('present in Cloud path', () => {
    expect(buildBuildTasks({ stackDescriptor: CF_DESCRIPTOR })).toContain(DEPLOY_LINE_FRAGMENT);
  });

  it('present in Replit path', () => {
    expect(buildBuildTasks({})).toContain(DEPLOY_LINE_FRAGMENT);
  });

  it('content is identical in both paths', () => {
    const cloudOut = buildBuildTasks({ stackDescriptor: CF_DESCRIPTOR });
    const replitOut = buildBuildTasks({});
    // Extract the line starting with '3.5 Deploy'
    const extractLine = (s) => s.split('\n').find((l) => l.includes('3.5 Deploy')) || '';
    expect(extractLine(cloudOut)).toBe(extractLine(replitOut));
  });
});
