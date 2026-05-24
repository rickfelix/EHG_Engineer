/**
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A — unit tests for the three
 * Claude-Code-ready repo artifact writers (pure builders, no DB/git/fs).
 */
import { describe, it, expect } from 'vitest';
import { buildClaudeMd } from '../../../lib/eva/bridge/claude-md-writer.js';
import { buildBuildTasks } from '../../../lib/eva/bridge/build-tasks-writer.js';
import { buildReplitConfig } from '../../../lib/eva/bridge/replit-config-writer.js';

describe('buildClaudeMd', () => {
  const md = buildClaudeMd({ name: 'Canvas AI' });

  it('includes the venture name in the title', () => {
    expect(md).toContain('# CLAUDE.md — Canvas AI');
  });

  it('pins every load-bearing backend rule', () => {
    expect(md).toMatch(/never\s+Supabase/i);
    expect(md).toContain('VITE_CLERK_PUBLISHABLE_KEY');
    expect(md).toContain('127.0.0.1:1106'); // sidecar signing endpoint
    expect(md).toMatch(/sidecar/i);
    expect(md).toMatch(/Gemini/);
    expect(md).toMatch(/Replit hosts|Replit-hosts|Replit \*\*hosts\*\*|\*\*Replit hosts\*\*/i);
    expect(md).toMatch(/keep it off|Agent off|do \*\*not\*\* rely on the Replit AI Agent/i);
  });

  it('is deterministic for the same input', () => {
    expect(buildClaudeMd({ name: 'Canvas AI' })).toBe(md);
  });

  it('falls back gracefully with no context', () => {
    const out = buildClaudeMd();
    expect(out).toContain('# CLAUDE.md — this venture');
    expect(out.length).toBeGreaterThan(200);
  });
});

describe('buildBuildTasks', () => {
  it('derives one grandchild per screen when screens are present', () => {
    const md = buildBuildTasks({
      name: 'Canvas AI',
      screens: [{ name: 'Dashboard' }, { name: 'New Project' }, 'Studio'],
    });
    expect(md).toContain('# Build Tasks — Canvas AI');
    expect(md).toContain('2.1 Dashboard');
    expect(md).toContain('2.2 New Project');
    expect(md).toContain('2.3 Studio');
    // lead task is always discover-current-state
    expect(md).toMatch(/discover current state/i);
  });

  it('emits a non-empty minimal skeleton when there are no screens', () => {
    const md = buildBuildTasks({ name: 'EmptyVenture', screens: [] });
    expect(md.trim().length).toBeGreaterThan(100);
    expect(md).toContain('Child 2 — Core features');
    expect(md).toMatch(/discover current state/i);
  });

  it('never emits an empty document even with no context', () => {
    const md = buildBuildTasks();
    expect(md.trim().length).toBeGreaterThan(100);
    expect(md).toContain('# Build Tasks — Venture');
  });

  it('is deterministic for the same input', () => {
    const args = { name: 'Canvas AI', screens: [{ name: 'Dashboard' }] };
    expect(buildBuildTasks(args)).toBe(buildBuildTasks(args));
  });
});

describe('buildReplitConfig', () => {
  it('produces a valid minimal .replit with run command and port', () => {
    const cfg = buildReplitConfig();
    expect(cfg).toContain('run = "bun run dev"');
    expect(cfg).toContain('deploymentTarget = "autoscale"');
    expect(cfg).toContain('localPort = 5000');
    expect(cfg).toContain('[[ports]]');
  });

  it('honors overrides', () => {
    const cfg = buildReplitConfig({ runCommand: 'npm run dev', port: 3000 });
    expect(cfg).toContain('run = "npm run dev"');
    expect(cfg).toContain('localPort = 3000');
  });

  it('is deterministic for the same input', () => {
    expect(buildReplitConfig()).toBe(buildReplitConfig());
  });
});
