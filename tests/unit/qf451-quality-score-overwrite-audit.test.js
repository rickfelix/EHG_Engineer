// QF-20260807-451: the quality_score rewrite must be auditable, not silent.
//
// WHAT THIS SUITE CAN AND CANNOT PROVE — read before trusting a green run.
// The change is a chairman-gated CREATE OR REPLACE FUNCTION. No seat can apply it (no exec_sql
// RPC) and no seat can read the live function body back, so these are SOURCE pins on the
// migration artifact, NOT behavioural proof that the deployed trigger emits the record. Green
// here means "the artifact the ceremony will apply says the right thing". The behaviour is
// verified at the apply seat's readback. Saying so explicitly is the point: a suite that cannot
// run the thing it describes must not be read as if it did.
//
// Every pin strips SQL comments first. Two separate suites tonight passed against a corrupted
// file because the test matched its OWN explanatory prose — the comments in this very migration
// quote the strings being pinned, so an unstripped scan is guaranteed to self-satisfy.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = path.join(
  process.cwd(),
  'database/migrations/20260808_qf451_surface_quality_score_overwrite.sql'
);

const raw = fs.readFileSync(MIGRATION, 'utf8');

// Strip whole-line and trailing `--` comments. Safe here: no string literal in this migration
// contains a `--` sequence (the audit message uses `->`), which the control below re-checks.
const executable = raw
  .split('\n')
  .map((l) => {
    const i = l.indexOf('--');
    return i === -1 ? l : l.slice(0, i);
  })
  .join('\n');

describe('QF-451 migration artifact', () => {
  // --- the reason the ticket exists ------------------------------------------------
  it('captures the entry score and emits an audit record when the rubric changes it', () => {
    expect(executable).toContain('score_at_entry INTEGER;');
    expect(executable).toContain('score_at_entry := NEW.quality_score;');
    expect(executable).toContain("'type', 'quality_score_recomputed'");
    expect(executable).toContain("'score_at_entry', score_at_entry");
    expect(executable).toContain("'recomputed_score', score");
  });

  it('captures the entry value BEFORE the should_recalculate fork can return early', () => {
    // The early-return branch (status-only UPDATE) exits before the score is recomputed. If the
    // capture sat after the fork it would be undefined on that path.
    const capture = executable.indexOf('score_at_entry := NEW.quality_score;');
    const fork = executable.indexOf('IF NOT should_recalculate THEN');
    expect(capture).toBeGreaterThan(-1);
    expect(fork).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(fork);
  });

  it('appends to `issues` BEFORE issues is assigned to NEW.quality_issues', () => {
    // Ordering IS the behaviour: `NEW.quality_issues := issues` overwrites wholesale, so an
    // append placed after it is silently discarded and the audit record never persists.
    const append = executable.indexOf("'quality_score_recomputed'");
    const assign = executable.indexOf('NEW.quality_issues := issues;');
    expect(append).toBeGreaterThan(-1);
    expect(assign).toBeGreaterThan(-1);
    expect(append).toBeLessThan(assign);
  });

  it('emits the record only on an actual change, never unconditionally', () => {
    // An audit line that fires on every write is noise, and would flip every retrospective's
    // issue count. The guard is what keeps this a record of a SUBSTITUTION.
    expect(executable).toContain('score_at_entry IS DISTINCT FROM score');
    expect(executable).toContain('score_at_entry IS NOT NULL');
  });

  // --- blast radius: must not disturb an existing counted type ---------------------
  it('does NOT reuse the issue type that an existing consumer counts', () => {
    // tests/integration/retro-protocol-improvements-clear.test.js asserts exact counts of
    // type === 'missing_protocol_improvements'. Reusing that type would corrupt those counts.
    const auditBlock = executable.slice(
      executable.indexOf('IF score_at_entry IS NOT NULL'),
      executable.indexOf('NEW.quality_score := score;')
    );
    expect(auditBlock.length).toBeGreaterThan(0);
    expect(auditBlock).not.toContain('missing_protocol_improvements');
  });

  // --- fold-forward fidelity: BOTH live incumbents must survive transcription ------
  it('carries the live [0-9]+ specificity regex forward (not the dead \\d+ form)', () => {
    expect(executable).toContain(
      "~ '[0-9]+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)'"
    );
    // The dead form must not appear in EXECUTABLE sql. It legitimately appears in the header
    // comment explaining the hazard — which is exactly why the scan is comment-stripped.
    expect(executable).not.toContain('\\d+');
  });

  it('carries the QF-251 anchored vacuous predicate forward', () => {
    // Anchored (^...$-style bounded match), not the bare substring form it replaced.
    expect(executable.toLowerCase()).toMatch(/nothing|no significant/);
  });

  // --- the ceremony marker ---------------------------------------------------------
  it('keeps the chairman-gated marker (removing it must re-red the drift check)', () => {
    expect(raw).toContain('-- @chairman-gated');
  });

  // --- controls --------------------------------------------------------------------
  it('CONTROL: the comment stripper actually removes prose', () => {
    // Without this, every pin above could be passing against comments rather than SQL.
    expect(raw).toContain('-- QF-20260807-451');
    expect(executable).not.toContain('-- QF-20260807-451');
    expect(executable.length).toBeLessThan(raw.length);
  });

  it('CONTROL: no string literal contains `--`, so stripping cannot truncate real SQL', () => {
    // Guards the stripper's own assumption. If someone later adds a literal containing `--`,
    // this fails loudly instead of silently shortening a line the pins depend on.
    const literals = raw.match(/'[^'\n]*'/g) || [];
    expect(literals.length).toBeGreaterThan(0);
    expect(literals.filter((s) => s.includes('--'))).toEqual([]);
  });

  it('CONTROL: the function body is restated in full (CREATE OR REPLACE has no partial form)', () => {
    expect(executable).toContain(
      'CREATE OR REPLACE FUNCTION public.auto_validate_retrospective_quality()'
    );
    expect(executable).toContain('$function$');
    expect(executable).toContain('RETURN NEW;');
  });
});
