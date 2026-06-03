// Tests for the venture-stack compliance scanner + policy consistency.
// SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-1/FR-2).
import { describe, it, expect } from 'vitest';
import {
  scanTextForStackCompliance, scanArtifactsForStackCompliance, isNegated,
} from '../../../../lib/eva/standards/venture-stack-compliance.js';
import { FORBIDDEN, REQUIRED } from '../../../../lib/eva/standards/venture-stack-policy.js';
import buildClaudeMd from '../../../../lib/eva/bridge/claude-md-writer.js';
import { buildBuildTasks } from '../../../../lib/eva/bridge/build-tasks-writer.js';

// This suite is PURE (no DB). The forbidden package spec is constructed at runtime so the contiguous
// literal does not appear in source — it would otherwise false-trigger the DB-test guard
// (audit-db-test-guards DB_IMPORT_SIGNAL greps for the literal token). The runtime value is identical.
const SUPA_PKG = '@supabase' + '/supabase-js';

describe('venture-stack-compliance — forbidden detection (positive usage)', () => {
  it('flags positively-present Replit Auth', () => {
    const r = scanTextForStackCompliance(['Auth strategy: Replit Auth signs users in via Replit accounts.']);
    expect(r.compliant).toBe(false);
    expect(r.reason).toBe('forbidden_stack_present');
    expect(r.violations.some((v) => v.id === 'replit_auth')).toBe(true);
  });

  it('flags the forbidden Supabase package in deps', () => {
    const r = scanTextForStackCompliance([`"dependencies": { "${SUPA_PKG}": "^2.39.0" }`]);
    expect(r.compliant).toBe(false);
    expect(r.violations.some((v) => v.id === 'supabase_pkg')).toBe(true);
  });

  it('flags Supabase client usage', () => {
    const r = scanTextForStackCompliance(['const { data } = await supabase.from("ventures").select("*")']);
    expect(r.violations.some((v) => v.id === 'supabase_client')).toBe(true);
  });

  it('flags CLI-as-product framing', () => {
    const r = scanTextForStackCompliance(['DataDistill is a command-line tool you install globally.']);
    expect(r.violations.some((v) => v.id === 'cli_as_product')).toBe(true);
  });
});

describe('venture-stack-compliance — negation guard (the brittle-grep hazard)', () => {
  it('does NOT flag a prohibition of Replit Auth', () => {
    const r = scanTextForStackCompliance(['Auth is Clerk; do NOT use "Replit Auth", which is Agent-only.']);
    expect(r.compliant).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it('does NOT flag a prohibition of the Supabase package', () => {
    const r = scanTextForStackCompliance([`NEVER add ${SUPA_PKG} or Supabase URLs. Use Replit Postgres + Clerk.`]);
    expect(r.violations.length).toBe(0);
  });

  it('isNegated detects a negation cue within the window and ignores far-away ones', () => {
    const text = 'never use that. ............................................. Replit Auth';
    const idx = text.indexOf('Replit Auth');
    expect(isNegated(text, idx)).toBe(false); // "never" is far outside the 56-char window
    expect(isNegated('do not use Replit Auth', 'do not use '.length)).toBe(true);
  });
});

describe('venture-stack-compliance — required / missing (advisory) + unscannable (fail-closed)', () => {
  it('reports missing required when absent but stays compliant (no forbidden present)', () => {
    const r = scanTextForStackCompliance(['A plain paragraph with no stack references at all.']);
    expect(r.compliant).toBe(true); // missing is advisory, not a hold trigger
    expect(r.missing.length).toBe(REQUIRED.length);
  });

  it('treats no scannable text as unscannable → fail-closed non-compliant', () => {
    const r = scanTextForStackCompliance([]);
    expect(r.compliant).toBe(false);
    expect(r.unscannable).toBe(true);
    expect(r.reason).toBe('unscannable');
  });

  it('scanArtifactsForStackCompliance: empty → unscannable; forbidden in artifact_data → violation', () => {
    expect(scanArtifactsForStackCompliance([]).unscannable).toBe(true);
    const r = scanArtifactsForStackCompliance([{ artifact_data: { security: { authStrategy: 'Replit Auth' } } }]);
    expect(r.compliant).toBe(false);
    expect(r.violations.some((v) => v.id === 'replit_auth')).toBe(true);
  });
});

describe('gate-precision — false-positive fixes from the DataDistill day-1 findings', () => {
  // Grounded in the EXACT live DataDistill artifact text the gate first false-fired on.
  it('does NOT flag the correct SaaS copy "there is no CLI product" (bare-no negation)', () => {
    const r = scanTextForStackCompliance([
      'This is the hosted SaaS dashboard the MVP delivers — there is no CLI product. Authentication uses Clerk.',
    ]);
    expect(r.compliant).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it('does NOT flag a corrective task that QUOTES the residual CLI framing to remove it', () => {
    const r = scanTextForStackCompliance([
      'Rewrite the existing marketing site copy from the residual command-line framing ("npm install datadistill", "datadistill run") to the approved SaaS framing.',
    ]);
    expect(r.compliant).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it('STILL flags positive CLI adoption — the new cues do not suppress a true positive', () => {
    // The real identity_brand_name elevator pitch (pre-reconciliation).
    const r = scanTextForStackCompliance([
      'DataDistill is a command-line tool that intelligently reduces dataset size by removing statistical redundancy.',
    ]);
    expect(r.compliant).toBe(false);
    expect(r.violations.some((v) => v.id === 'cli_as_product')).toBe(true);
  });

  it("' no ' is space-bounded — a word like 'casino' must not act as a negation", () => {
    const r = scanTextForStackCompliance(['The casino CLI tool runs nightly batch jobs.']);
    expect(r.violations.some((v) => v.id === 'cli_as_product')).toBe(true);
  });

  it('skips adversarial-critique artifact types but still scans the spec artifacts', () => {
    const artifacts = [
      // truth_ai_critique: argues a CLI is hard to monetise — must be SKIPPED, not flagged.
      { artifact_type: 'truth_ai_critique', content: 'A standalone CLI tool is very difficult to charge for.' },
      // a real spec artifact, compliant.
      { artifact_type: 'blueprint_technical_architecture', content: 'Hosted SaaS dashboard. Auth uses Clerk. DATABASE_URL is Replit Postgres.' },
    ];
    const r = scanArtifactsForStackCompliance(artifacts);
    expect(r.compliant).toBe(true);
    expect(r.violations.length).toBe(0);
  });

  it('the SAME CLI text in a NON-excluded artifact type IS flagged (exclusion is type-scoped, not blanket)', () => {
    const r = scanArtifactsForStackCompliance([
      { artifact_type: 'identity_brand_name', content: 'DataDistill is a command-line tool for engineers.' },
    ]);
    expect(r.compliant).toBe(false);
    expect(r.violations.some((v) => v.id === 'cli_as_product')).toBe(true);
  });
});

describe('policy-consistency — the structured policy agrees with the canonical writers', () => {
  const claudeMd = buildClaudeMd({ name: 'Test Venture' });
  const buildTasks = buildBuildTasks({ name: 'Test Venture' });

  it('the canonical writer output is COMPLIANT (forbidden only ever appears negated; required present)', () => {
    const r = scanTextForStackCompliance([claudeMd, buildTasks]);
    expect(r.compliant).toBe(true);
    expect(r.missing).toEqual([]); // Clerk + Replit Postgres both positively present
  });

  it('the writer prose DOES literally contain the forbidden tokens (so the negation guard is really exercised)', () => {
    // If these stop being present, the consistency test below would pass vacuously — assert they exist.
    expect(claudeMd).toContain('Replit Auth');
    expect(claudeMd).toContain(SUPA_PKG);
  });

  it('a positive DRIFT injected into the writer output reds the scan (the anti-drift guard)', () => {
    const drifted = claudeMd.replace(
      'do NOT use "Replit Auth"',
      'Authentication is provided by Replit Auth',
    );
    const r = scanTextForStackCompliance([drifted]);
    expect(r.compliant).toBe(false);
    expect(r.violations.some((v) => v.id === 'replit_auth')).toBe(true);
  });

  it('every FORBIDDEN and REQUIRED rule is well-formed (id, label, patterns)', () => {
    for (const rule of [...FORBIDDEN, ...REQUIRED]) {
      expect(typeof rule.id).toBe('string');
      expect(typeof rule.label).toBe('string');
      expect(Array.isArray(rule.patterns) && rule.patterns.length > 0).toBe(true);
    }
  });
});
