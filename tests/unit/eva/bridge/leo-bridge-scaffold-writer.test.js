import { describe, it, expect } from 'vitest';
import { buildLeoBridgeClaudeMd, buildLeoBridgeBuildTasks } from '../../../../lib/eva/bridge/leo-bridge-scaffold-writer.js';

// SD-LEO-INFRA-LEO-BRIDGE-MODEL-001 (FR-1): leo_bridge ventures build via LEO Strategic
// Directives, not a per-page Lovable/wireframe decomposition. These writers must never
// reference the Lovable-built-landing-page / docs/design-prompts.md / docs/wireframes.md
// assumptions baked into claude-md-writer.js / build-tasks-writer.js.

const CF_DESCRIPTOR = { db_provider: 'd1', deployment_target: 'cloudflare-pages', storage: 'r2' };

describe('buildLeoBridgeClaudeMd', () => {
  it('describes the leo_bridge SD-driven build model, not a per-page prompt sequence', () => {
    const out = buildLeoBridgeClaudeMd({ name: 'MarketLens' });
    expect(out).toMatch(/LEO Strategic Directives/);
    expect(out).toMatch(/build_model=`leo_bridge`/);
    expect(out).not.toMatch(/design-prompts\.md/);
    expect(out).not.toMatch(/Lovable/);
    expect(out).not.toMatch(/wireframes\.md/);
  });

  it('is descriptor-aware like the shared writers (Cloudflare vs Replit backend)', () => {
    const cf = buildLeoBridgeClaudeMd({ name: 'V', stackDescriptor: CF_DESCRIPTOR });
    expect(cf).toMatch(/Cloudflare/);
    expect(cf).toMatch(/\bD1\b/);

    const replit = buildLeoBridgeClaudeMd({ name: 'V' });
    expect(replit).toMatch(/Replit-native/);
    expect(replit).not.toMatch(/Cloudflare-native/);
  });

  it('never mentions Supabase as an allowed backend', () => {
    const out = buildLeoBridgeClaudeMd({ name: 'V' });
    expect(out).toMatch(/NEVER\*\* add `@supabase\/supabase-js`/);
  });

  it('falls back to a generic name when none is given', () => {
    const out = buildLeoBridgeClaudeMd();
    expect(out).toMatch(/this venture/);
  });
});

describe('buildLeoBridgeBuildTasks', () => {
  it('points to strategic_directives_v2 as the authoritative task source, never empty', () => {
    const out = buildLeoBridgeBuildTasks({ name: 'MarketLens' });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/strategic_directives_v2/);
    expect(out).toMatch(/leo_bridge/);
    expect(out).not.toMatch(/design-prompts\.md/);
    expect(out).not.toMatch(/Lovable/);
  });

  it('falls back to a generic name when none is given', () => {
    const out = buildLeoBridgeBuildTasks();
    expect(out).toMatch(/# Build Tasks — Venture/);
  });
});
