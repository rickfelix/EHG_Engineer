import { describe, it, expect } from 'vitest';
import { buildClaudeMd } from '../../../../lib/eva/bridge/claude-md-writer.js';

// SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001-C (FR-3b): claude-md-writer is now descriptor-aware.
// A cloud-family stack_descriptor emits Cloudflare/Cloud-native backend prose; no descriptor (or an
// explicit Replit opt-in) keeps the byte-identical Replit-native prose for backward-compat.

const CF_DESCRIPTOR = { db_provider: 'd1', deployment_target: 'cloudflare-pages', storage: 'r2' };

describe('buildClaudeMd — descriptor-aware (FR-3b)', () => {
  it('emits Cloudflare-native backend when a cloudflare descriptor is present', () => {
    const out = buildClaudeMd({ name: 'VentureX', stackDescriptor: CF_DESCRIPTOR });
    expect(out).toMatch(/Cloudflare/);
    expect(out).toMatch(/\bD1\b/);
    expect(out).toMatch(/R2/);
    // The Cloudflare backend section must NOT hardcode the Replit-native database / object storage.
    expect(out).not.toMatch(/Replit Postgres/);
    expect(out).not.toMatch(/Replit Object Storage/);
    // Hosting section is Cloudflare, not "Hosting (Replit, no Agent)".
    expect(out).toMatch(/## Hosting \(Cloudflare\)/);
  });

  it('emits the unchanged Replit-native backend when no descriptor (backward-compat)', () => {
    const out = buildClaudeMd({ name: 'VentureX' });
    expect(out).toMatch(/## Backend: Replit-native ONLY/);
    expect(out).toMatch(/Replit Postgres/);
    expect(out).toMatch(/Replit Object Storage/);
    expect(out).toMatch(/## Hosting \(Replit, no Agent\)/);
    // No descriptor must not leak Cloudflare backend prose.
    expect(out).not.toMatch(/Cloudflare \*\*R2\*\*/);
  });

  it('treats an explicit replit-autoscale descriptor as the Replit path (opt-in)', () => {
    const out = buildClaudeMd({ name: 'VentureX', stackDescriptor: { deployment_target: 'replit-autoscale' } });
    expect(out).toMatch(/## Backend: Replit-native ONLY/);
    expect(out).not.toMatch(/## Hosting \(Cloudflare\)/);
  });

  it('keeps the stack-agnostic rules (Clerk, Gemini, Sentry, never Supabase) on both paths', () => {
    for (const sd of [CF_DESCRIPTOR, null]) {
      const out = buildClaudeMd({ name: 'V', stackDescriptor: sd });
      expect(out).toMatch(/Clerk/);
      expect(out).toMatch(/Gemini/);
      expect(out).toMatch(/Sentry/);
      expect(out).toMatch(/NEVER\*\* add `@supabase\/supabase-js`/);
    }
  });
});
