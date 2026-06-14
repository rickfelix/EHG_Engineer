/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-A — replit-config-writer descriptor tests
 *
 * Covers:
 *   - Replit/absent => current .replit autoscale output (backward-compat)
 *   - cloudflare-pages => wrangler.toml config (asserts 'compatibility_date'; no 'autoscale')
 *   - cloudflare-workers => main = field present
 *   - d1 binding stub when db_provider === 'd1'
 *   - r2 binding stub when storage === 'r2'
 */
import { describe, it, expect } from 'vitest';
import { buildReplitConfig } from '../../../../lib/eva/bridge/replit-config-writer.js';

// ── Replit DEFAULT (absent descriptor) ────────────────────────────────────

describe('buildReplitConfig — no descriptor (Replit default)', () => {
  const cfg = buildReplitConfig();

  it('contains deploymentTarget = "autoscale"', () => {
    expect(cfg).toContain('deploymentTarget = "autoscale"');
  });

  it('contains run = "bun run dev"', () => {
    expect(cfg).toContain('run = "bun run dev"');
  });

  it('contains [[ports]] section', () => {
    expect(cfg).toContain('[[ports]]');
  });

  it('defaults to port 5000', () => {
    expect(cfg).toContain('localPort = 5000');
  });

  it('is backward-compatible with existing test expectations', () => {
    // These assertions match the existing s19-claude-code-ready-writers.test.js assertions.
    expect(cfg).toContain('run = "bun run dev"');
    expect(cfg).toContain('deploymentTarget = "autoscale"');
    expect(cfg).toContain('localPort = 5000');
    expect(cfg).toContain('[[ports]]');
  });

  it('honors run command override', () => {
    const cfg2 = buildReplitConfig({ runCommand: 'npm run dev', port: 3000 });
    expect(cfg2).toContain('run = "npm run dev"');
    expect(cfg2).toContain('localPort = 3000');
  });

  it('is deterministic', () => {
    expect(buildReplitConfig()).toBe(cfg);
  });
});

// ── Explicit Replit descriptor => same as no descriptor ───────────────────

describe('buildReplitConfig — explicit replit-autoscale descriptor', () => {
  it('returns the same .replit autoscale output', () => {
    const sd = { db_provider: 'replit-postgres', deployment_target: 'replit-autoscale' };
    const cfg = buildReplitConfig({ stackDescriptor: sd });
    const baseline = buildReplitConfig();
    expect(cfg).toBe(baseline);
  });
});

// ── Cloudflare Pages descriptor ────────────────────────────────────────────

describe('buildReplitConfig — cloudflare-pages descriptor', () => {
  const sd = { db_provider: 'd1', deployment_target: 'cloudflare-pages', storage: 'r2' };
  const cfg = buildReplitConfig({ stackDescriptor: sd });

  it('contains compatibility_date', () => {
    expect(cfg).toContain('compatibility_date');
  });

  it('does NOT contain deploymentTarget = "autoscale"', () => {
    expect(cfg).not.toContain('deploymentTarget = "autoscale"');
  });

  it('contains pages_build_output_dir for pages target', () => {
    expect(cfg).toContain('pages_build_output_dir');
  });

  it('does NOT contain main = for pages target', () => {
    expect(cfg).not.toContain('\nmain =');
  });

  it('contains [[d1_databases]] binding stub (db_provider=d1)', () => {
    expect(cfg).toContain('[[d1_databases]]');
  });

  it('contains [[r2_buckets]] binding stub (storage=r2)', () => {
    expect(cfg).toContain('[[r2_buckets]]');
  });

  it('is deterministic', () => {
    expect(buildReplitConfig({ stackDescriptor: sd })).toBe(cfg);
  });
});

// ── Cloudflare Workers descriptor ─────────────────────────────────────────

describe('buildReplitConfig — cloudflare-workers descriptor', () => {
  const sd = { db_provider: 'neon', deployment_target: 'cloudflare-workers' };
  const cfg = buildReplitConfig({ stackDescriptor: sd });

  it('contains compatibility_date', () => {
    expect(cfg).toContain('compatibility_date');
  });

  it('contains main = field for workers target', () => {
    expect(cfg).toContain('main =');
  });

  it('does NOT contain pages_build_output_dir for workers target', () => {
    expect(cfg).not.toContain('pages_build_output_dir');
  });

  it('does NOT contain [[d1_databases]] when db_provider is not d1', () => {
    expect(cfg).not.toContain('[[d1_databases]]');
  });

  it('does NOT contain [[r2_buckets]] when storage is absent', () => {
    expect(cfg).not.toContain('[[r2_buckets]]');
  });
});

// ── Cloud Run descriptor (F1 — own stub, NOT a wrangler.toml) ──────────────

describe('buildReplitConfig — cloud-run descriptor', () => {
  const sd = { db_provider: 'neon', deployment_target: 'cloud-run', region: 'us-central1' };
  const cfg = buildReplitConfig({ stackDescriptor: sd });

  it('yields a Cloud Run service-config stub', () => {
    expect(cfg).toContain('Cloud Run service config');
    expect(cfg).toContain('service: venture-app');
  });

  it('honors the descriptor region', () => {
    expect(cfg).toContain('region: us-central1');
  });

  it('is NOT a wrangler.toml (no compatibility_date / pages / d1 / r2 stubs)', () => {
    expect(cfg).not.toContain('compatibility_date');
    expect(cfg).not.toContain('pages_build_output_dir');
    expect(cfg).not.toContain('[[d1_databases]]');
    expect(cfg).not.toContain('[[r2_buckets]]');
  });

  it('does NOT contain deploymentTarget = "autoscale"', () => {
    expect(cfg).not.toContain('deploymentTarget = "autoscale"');
  });

  it('notes image/DATABASE_URL are set at deploy time by sibling D', () => {
    expect(cfg).toContain('deploy time');
  });

  it('falls back to a region placeholder when region is absent', () => {
    const cfg2 = buildReplitConfig({ stackDescriptor: { db_provider: 'neon', deployment_target: 'cloud-run' } });
    expect(cfg2).toContain('region: REPLACE_WITH_REGION');
  });
});

// ── Fail-safe: invalid deployment_target => Replit DEFAULT (F5) ────────────

describe('buildReplitConfig — invalid/unknown deployment_target (F5 fail-safe)', () => {
  it('routes an unknown target to the .replit autoscale default', () => {
    const cfg = buildReplitConfig({ stackDescriptor: { db_provider: 'd1', deployment_target: 'heroku' } });
    expect(cfg).toContain('deploymentTarget = "autoscale"');
    expect(cfg).not.toContain('compatibility_date');
    expect(cfg).not.toContain('Cloud Run');
  });
});
