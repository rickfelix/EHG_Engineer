/**
 * QF-20260523-253: source-of-truth hardening for build-into Plan Mode prompts
 * (follow-on to SD-LEO-FEAT-STAGE-REPLIT-PROMPTS-001).
 *
 * Replit's review of the first build-into venture flagged that the prompt asserted
 * a *guessed* framework and treated planning-era docs as authoritative, so a stale
 * docs/architecture.md (Vercel + Supabase) could drag the build off the actual app.
 * These assertions lock in: build-into makes the EXISTING APP authoritative; create-new
 * is byte-identical to before (no regression on the scaffold path).
 */
import { describe, it, expect } from 'vitest';
import { formatPlanModePrompt } from '../../../lib/eva/bridge/replit-format-strategies.js';

// Minimal groups: no how_to_build_it group => detectStack defaults framework to 'Vite' (web).
const groups = [
  {
    group_key: 'sprint_plan',
    group_name: 'Sprint Plan',
    artifacts: [{ content: JSON.stringify({ items: [{ name: 'Login', story_points: 1, priority: 'high' }] }) }],
  },
];
const venture = { name: 'TestVenture', description: 'A test venture app', targetPlatform: 'web' };
const summary = {};

const buildInto = formatPlanModePrompt(groups, venture, summary, { mode: 'build-into' });
const createNew = formatPlanModePrompt(groups, venture, summary, { mode: 'create-new' });

describe('formatPlanModePrompt — build-into source-of-truth hardening', () => {
  it('does NOT assert a guessed framework in the build-into opening (P2)', () => {
    expect(buildInto).not.toContain('existing Vite app');
    expect(buildInto).toContain('do NOT assume a framework');
    expect(buildInto).toContain('package.json');
  });

  it('states an explicit source-of-truth precedence with the app authoritative (P1)', () => {
    expect(buildInto).toContain('Source of truth');
    expect(buildInto).toContain('FOLLOW THE APP');
    expect(buildInto.toLowerCase()).toContain('switch the database/auth provider');
  });

  it('reframes the planning description as intent, not the build target (P2)', () => {
    expect(buildInto).toContain('Intended purpose');
  });

  it('makes the architecture doc defensive — domain not re-platform (P3)', () => {
    expect(buildInto.toLowerCase()).toContain('not to re-platform');
    expect(buildInto).toContain('follow the repo');
  });

  it('tells Replit older design mockups are superseded by the app (P4)', () => {
    expect(buildInto).toContain('treat them as superseded');
    expect(buildInto).not.toContain('docs/designs/'); // build-into never points at docs/designs/ (shared invariant)
  });
});

describe('formatPlanModePrompt — create-new path is unchanged (regression guard)', () => {
  it('still opens with the framework-asserted scaffold line', () => {
    expect(createNew).toContain('Build a Vite application: A test venture app');
  });

  it('keeps the original architecture + designs doc-list lines', () => {
    expect(createNew).toContain('- docs/architecture.md — tech stack, data model, API surface, schema. Use these decisions; do not re-derive.');
    expect(createNew).toContain('Match the layout and the majority navigation pattern.');
  });

  it('does NOT leak any build-into-only source-of-truth language', () => {
    expect(createNew).not.toContain('Source of truth');
    expect(createNew).not.toContain('FOLLOW THE APP');
    expect(createNew).not.toContain('Intended purpose');
    expect(createNew).not.toContain('treat them as superseded');
  });
});
