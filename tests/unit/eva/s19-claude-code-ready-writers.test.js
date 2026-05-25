/**
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A — unit tests for the three
 * Claude-Code-ready repo artifact writers (pure builders, no DB/git/fs).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildClaudeMd } from '../../../lib/eva/bridge/claude-md-writer.js';
import { buildBuildTasks } from '../../../lib/eva/bridge/build-tasks-writer.js';
import { buildReplitConfig } from '../../../lib/eva/bridge/replit-config-writer.js';
import { buildDesignPrompts } from '../../../lib/eva/bridge/design-prompts-writer.js';
import { canonicalChecksum } from '../../../scripts/design-prompts-sync.mjs';

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

  it('references docs/design-prompts.md as the per-page build playbook (FR-4)', () => {
    expect(md).toContain('docs/design-prompts.md');
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
    expect(md).toContain('Child 2 — Additional pages');
    expect(md).toMatch(/discover current state/i);
  });

  it('never emits an empty document even with no context', () => {
    const md = buildBuildTasks();
    expect(md.trim().length).toBeGreaterThan(100);
    expect(md).toContain('# Build Tasks — Venture');
  });

  it('omits the Lovable-built landing screen and references the prompts doc (FR-3)', () => {
    const md = buildBuildTasks({
      name: 'Canvas AI',
      screens: [{ name: 'Landing Page' }, { name: 'Dashboard' }, { name: 'Settings' }],
    });
    expect(md).toContain('docs/design-prompts.md');   // per-page build playbook reference
    expect(md).toMatch(/intentionally omitted/i);      // landing-skip note
    expect(md).toContain('2.1 Dashboard');             // landing skipped → Dashboard is first
    expect(md).toContain('2.2 Settings');
    expect(md).not.toContain('Landing Page**');        // no grandchild build task for the landing
  });

  it('is deterministic for the same input', () => {
    const args = { name: 'Canvas AI', screens: [{ name: 'Dashboard' }] };
    expect(buildBuildTasks(args)).toBe(buildBuildTasks(args));
  });
});

describe('buildDesignPrompts (FR-1)', () => {
  const md = buildDesignPrompts();
  it('emits the New Page creation prompt (S19 builds additional pages, not the landing)', () => {
    expect(md).toMatch(/New page creation|New Page Creation/);
    expect(md).toContain('Text & Typography Audit');
    expect(md).toContain('Layout & Composition Audit');
    expect(md).toContain('Build Quality Audit');
  });
  // Parity with the ehg S17 source (designPrompts.ts): the shared parts — the
  // landing-page focus on every audit, and the required Feedback page — must be present.
  it('each audit leads with a landing-page focus (in sync with S17)', () => {
    expect(md.match(/Landing-page focus/g) || []).toHaveLength(3);
  });
  it('includes the required Feedback page (Prompt 5)', () => {
    expect(md).toContain('Prompt 5');
    expect(md).toMatch(/Feedback [Pp]age/);
    expect(md).toContain('/feedback');
  });
  it('inherits the landing design system and does not rebuild the landing', () => {
    expect(md).toContain('src/routes/index.tsx');
    expect(md).toMatch(/do not rebuild/i);
  });
  it('is deterministic and non-trivial', () => {
    expect(buildDesignPrompts()).toBe(md);
    expect(md.length).toBeGreaterThan(2000);
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

// SD-LEO-INFRA-UNIFY-STAGE-DESIGN-001 (Phase 2): the shared bodies (audits 2-4 +
// Feedback 5) are now sourced from the vendored single source, not hand-mirrored.
// These guard that the writer consumes the JSON, that the committed checksum is
// fresh, and that the stage-specific S19 creation prompt did NOT regress to the
// S17 "Landing Page Creation" wording. The cross-repo S17==S19 equality is enforced
// by the twinned CI checksum gate (so we deliberately do NOT hardcode the checksum
// here — that would reintroduce the dual-maintenance this SD removes).
describe('shared design-prompts parity (SD-LEO-INFRA-UNIFY-STAGE-DESIGN-001)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const SRC = join(here, '../../../lib/eva/bridge/shared-design-prompts.json');
  const SUM = join(here, '../../../lib/eva/bridge/shared-design-prompts.sha256');
  const shared = JSON.parse(readFileSync(SRC, 'utf8'));
  const md = buildDesignPrompts();

  it('vendored shared source holds exactly the shared bodies (audits 2-4 + Feedback 5)', () => {
    expect(shared.map((p) => p.id)).toEqual([2, 3, 4, 5]);
    for (const p of shared) {
      expect(typeof p.summary).toBe('string');
      expect(p.text.length).toBeGreaterThan(50);
    }
  });

  it('docs/design-prompts.md sources every shared body from the JSON verbatim', () => {
    for (const p of shared) {
      expect(md).toContain(p.text);
    }
  });

  it('preserves the S19 creation prompt (New Page Creation), not the S17 Landing one', () => {
    expect(md).toContain('New Page Creation Prompt');
    expect(md).not.toContain('Landing Page Creation');
  });

  it('committed checksum is fresh (edit JSON => npm run design-prompts:sync)', () => {
    const committed = readFileSync(SUM, 'utf8').trim();
    expect(committed).toBe(canonicalChecksum(readFileSync(SRC, 'utf8')));
  });
});
